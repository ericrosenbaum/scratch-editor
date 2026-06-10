// Run the Magenta provider over every case N times, score each sample against
// the committed golden, aggregate, and report (with deltas vs the baseline).
import path from 'path';
import * as tf from '@tensorflow/tfjs';

import {
    CATEGORIES, DEFAULT_SAMPLES, SUT_PROVIDER_ID, PATHS
} from '../config.mjs';
import {
    loadSettings, loadCases, loadSeed, loadGolden, readJson, readJsonIfExists,
    writeJson, writeText, sha256
} from '../lib/io.mjs';
import {runOperation} from '../lib/orchestrate.mjs';
import {prepareSeed} from '../lib/seed-prep.mjs';
import {
    internalSongToView, wireSongToView, trackToView, contextFor
} from '../lib/scoring-view.mjs';
import {scoreSample, aggregateSamples} from '../scoring/score.mjs';
import {judgeSample} from '../scoring/llm-judge.mjs';
import {formatReport} from '../lib/report.mjs';

const unitFor = c => (c.operation === 'generateSong' ? 'song' : 'track');
const catMeta = id => CATEGORIES.find(c => c.id === id) || {label: id, knownGap: false};

const runId = () => new Date().toISOString().replace(/[:.]/g, '-');

export const runEval = async flags => {
    await tf.setBackend('cpu');
    await tf.ready();

    const samples = Math.max(1, parseInt(flags.samples, 10) || DEFAULT_SAMPLES);
    const weights = readJson(PATHS.weights);
    const {byId: settingsById} = loadSettings();
    let cases = loadCases();
    if (flags.only) cases = cases.filter(c => c.id === flags.only);
    if (flags.category) cases = cases.filter(c => c.category === flags.category);

    const id = runId();
    process.stdout.write(`[run] ${id}  ${cases.length} cases × ${samples} samples (provider=${SUT_PROVIDER_ID})\n`);

    const caseResults = [];
    for (const c of cases) {
        const setting = settingsById.get(c.settingId);
        const baseSeed = loadSeed(c.seedRef);
        const seed = prepareSeed(c, baseSeed);
        const golden = loadGolden(c.id);
        const unit = unitFor(c);
        const ctx = {unit, case: c, setting};
        const opCtx = contextFor(seed, setting);

        if (!golden) {
            process.stdout.write(`[run] ${c.id}: no golden — skipped\n`);
            caseResults.push({id: c.id, category: c.category, error: 'no golden'});
            continue;
        }
        const goldenView = unit === 'song' ? wireSongToView(golden) : trackToView(golden, opCtx);

        const sampleScores = [];
        let lastView = null;
        let err = null;
        for (let i = 0; i < samples; i++) {
            try {
                const {result} = await runOperation({testCase: c, seed, providerId: SUT_PROVIDER_ID});
                const outView = unit === 'song' ? internalSongToView(result) : trackToView(result, opCtx);
                lastView = outView;
                sampleScores.push(scoreSample(outView, goldenView, ctx, weights));
            } catch (e) {
                err = e.message;
            }
        }

        if (sampleScores.length === 0) {
            caseResults.push({id: c.id, category: c.category, error: err || 'all samples failed'});
            process.stdout.write(`[run] ${c.id}: FAILED (${err})\n`);
            continue;
        }

        const roll = aggregateSamples(sampleScores);
        let judge = null;
        if (flags.judge && process.env.ANTHROPIC_API_KEY && lastView) {
            judge = await judgeSample({testCase: c, candidateView: lastView, goldenView});
        }
        caseResults.push({
            id: c.id, category: c.category, knownGap: catMeta(c.category).knownGap,
            mean: roll.mean, best: roll.best, std: roll.std, n: roll.n,
            perMetricMean: roll.perMetricMean, weakest: roll.weakest, judge
        });
        process.stdout.write(`[run] ${c.id}: mean=${roll.mean.toFixed(3)} (best ${roll.best.toFixed(2)}, ±${roll.std.toFixed(2)})\n`);
    }

    // Category rollup = mean of case means (scored cases only).
    const categories = CATEGORIES.map(cat => {
        const scored = caseResults.filter(c => c.category === cat.id && typeof c.mean === 'number');
        const mean = scored.length ?
            scored.reduce((s, c) => s + c.mean, 0) / scored.length : null;
        return {id: cat.id, label: cat.label, knownGap: cat.knownGap, mean, nCases: scored.length};
    });

    const results = {
        runId: id, samples, judge: !!flags.judge,
        weightsHash: sha256(weights),
        cases: caseResults, categories
    };

    // Persist run output (gitignored).
    const outDir = path.join(PATHS.results, id);
    writeJson(path.join(outDir, 'results.json'), results);

    const baseline = flags.baseline ? null : readJsonIfExists(PATHS.baselineFile);
    const report = formatReport(results, baseline);
    writeText(path.join(outDir, 'report.txt'), report);
    process.stdout.write(`\n${report}\n`);

    if (flags.baseline) {
        writeJson(PATHS.baselineFile, results);
        process.stdout.write(`[run] baseline written to ${path.relative(PATHS.root, PATHS.baselineFile)}\n`);
    }
    process.stdout.write(`[run] results: ${path.relative(PATHS.root, outDir)}\n`);
};
