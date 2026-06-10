// Provider-agnostic scoring core shared by the Node `run` (Magenta) and the
// browser-driven `run-browser` (Gemma 4) commands. The ONLY thing that differs
// between providers is how a single operation is executed — captured by the
// injected `runOp(testCase, seed) => Promise<internal song|track>`. Everything
// else (seed prep, view conversion, scoring, aggregation, report, baseline diff)
// is identical, which is the whole point: both providers travel the same path.
import path from 'path';

import {CATEGORIES, PATHS} from '../config.mjs';
import {
    loadSettings, loadCases, loadSeed, loadGolden, readJson, readJsonIfExists,
    writeJson, writeText, sha256
} from './io.mjs';
import {prepareSeed} from './seed-prep.mjs';
import {
    internalSongToView, wireSongToView, trackToView, contextFor
} from './scoring-view.mjs';
import {scoreSample, aggregateSamples} from '../scoring/score.mjs';
import {judgeSample} from '../scoring/llm-judge.mjs';
import {formatReport} from './report.mjs';

const unitFor = c => (c.operation === 'generateSong' ? 'song' : 'track');
const catMeta = id => CATEGORIES.find(c => c.id === id) || {label: id, knownGap: false};
const newRunId = () => new Date().toISOString().replace(/[:.]/g, '-');

// Score the SUT over every selected case N times, aggregate, report, and (with
// --baseline) write the baseline. Returns {results, outDir}.
//
//   runOp        (testCase, seed) => Promise<internal song|track>
//   providerId   label stamped into results.provider + the report header
//   baselineFile where --baseline writes / what we diff against
//   samples      runs per case (caller resolves the effective count)
//   resumeRunId  reuse this run dir + skip cases already in its partial.json
export const runScoredEval = async ({
    flags, runOp, providerId, baselineFile, samples, resumeRunId
}) => {
    const weights = readJson(PATHS.weights);
    const {byId: settingsById} = loadSettings();
    let cases = loadCases();
    if (flags.only) cases = cases.filter(c => c.id === flags.only);
    if (flags.category) cases = cases.filter(c => c.category === flags.category);

    const id = resumeRunId || newRunId();
    const outDir = path.join(PATHS.results, id);
    const partialFile = path.join(outDir, 'partial.json');

    // Resume: pull already-scored cases from a prior partial.json so a long run
    // that crashed (or a flaky generation) doesn't redo finished work.
    const prior = resumeRunId ? (readJsonIfExists(partialFile) || {cases: []}) : {cases: []};
    const doneById = new Map((prior.cases || []).map(c => [c.id, c]));

    process.stdout.write(
        `[run] ${id}  ${cases.length} cases × ${samples} samples (provider=${providerId})` +
        (doneById.size ? `  [resuming, ${doneById.size} done]` : '') + '\n'
    );

    const caseResults = [];
    const persistPartial = () => writeJson(partialFile, {runId: id, provider: providerId, cases: caseResults});

    for (const c of cases) {
        if (doneById.has(c.id)) {
            caseResults.push(doneById.get(c.id));
            continue;
        }

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
            persistPartial();
            continue;
        }
        const goldenView = unit === 'song' ? wireSongToView(golden) : trackToView(golden, opCtx);

        const sampleScores = [];
        let lastView = null;
        let err = null;
        for (let i = 0; i < samples; i++) {
            try {
                const result = await runOp(c, seed);
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
            persistPartial();
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
        process.stdout.write(
            `[run] ${c.id}: mean=${roll.mean.toFixed(3)} (best ${roll.best.toFixed(2)}, ±${roll.std.toFixed(2)}` +
            `${sampleScores.length < samples ? `, ${samples - sampleScores.length} failed` : ''})\n`
        );
        persistPartial();
    }

    // Category rollup = mean of case means (scored cases only).
    const categories = CATEGORIES.map(cat => {
        const scored = caseResults.filter(c => c.category === cat.id && typeof c.mean === 'number');
        const mean = scored.length ?
            scored.reduce((s, c) => s + c.mean, 0) / scored.length : null;
        return {id: cat.id, label: cat.label, knownGap: cat.knownGap, mean, nCases: scored.length};
    });

    const results = {
        runId: id, provider: providerId, samples, judge: !!flags.judge,
        weightsHash: sha256(weights),
        cases: caseResults, categories
    };

    // Persist run output (gitignored).
    writeJson(path.join(outDir, 'results.json'), results);

    const baseline = flags.baseline ? null : readJsonIfExists(baselineFile);
    const report = formatReport(results, baseline);
    writeText(path.join(outDir, 'report.txt'), report);
    process.stdout.write(`\n${report}\n`);

    if (flags.baseline) {
        writeJson(baselineFile, results);
        process.stdout.write(`[run] baseline written to ${path.relative(PATHS.root, baselineFile)}\n`);
    }
    process.stdout.write(`[run] results: ${path.relative(PATHS.root, outDir)}\n`);
    return {results, outDir};
};
