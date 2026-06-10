// Produce golden reference outputs by running each case through the REAL
// pipeline with providerId='anthropic-opus'. Idempotent: a golden is skipped
// when it exists and its fingerprint (prompt+op+seed) is unchanged.
import {GOLDEN_PROVIDER_ID} from '../config.mjs';
import {
    loadSettings, loadCases, loadSeed, writeJson, readJsonIfExists,
    goldenPath, goldenMetaPath, caseFingerprint, nowIso
} from '../lib/io.mjs';
import {runOperation} from '../lib/orchestrate.mjs';
import {prepareSeed} from '../lib/seed-prep.mjs';
import {contextFor} from '../lib/scoring-view.mjs';
import {toWire} from '../lib/to-wire.mjs';

export const generateGoldens = async flags => {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is required to generate goldens.');
    }
    const {byId: settingsById} = loadSettings();
    const cases = loadCases().filter(c => (flags.only ? c.id === flags.only : true));

    let made = 0;
    let skipped = 0;
    let failed = 0;
    for (const c of cases) {
        const setting = settingsById.get(c.settingId);
        const baseSeed = loadSeed(c.seedRef);
        const seed = prepareSeed(c, baseSeed);
        const fingerprint = caseFingerprint(c, seed);

        const existingMeta = readJsonIfExists(goldenMetaPath(c.id));
        if (existingMeta && existingMeta.promptSha256 === fingerprint && !flags.force) {
            skipped++;
            continue;
        }

        process.stdout.write(`[goldens] ${c.id} (${c.operation}) ...\n`);
        try {
            const {unit, result} = await runOperation({
                testCase: c, seed, providerId: GOLDEN_PROVIDER_ID
            });
            const ctx = contextFor(seed, setting);
            const wire = toWire(unit, result, ctx);
            writeJson(goldenPath(c.id), wire);
            writeJson(goldenMetaPath(c.id), {
                model: GOLDEN_PROVIDER_ID,
                generatedAt: nowIso(),
                promptSha256: fingerprint,
                unit
            });
            made++;
        } catch (err) {
            failed++;
            process.stderr.write(`[goldens] FAILED ${c.id}: ${err.message}\n`);
        }
    }
    process.stdout.write(`[goldens] done. ${made} generated, ${skipped} skipped, ${failed} failed.\n`);
};
