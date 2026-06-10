// Run the on-device Gemma 4 provider over the eval cases by driving a REAL local
// Chrome (it needs hardware WebGPU; Node can't run MediaPipe LlmInference). Node
// owns scoring/reporting via the shared core in lib/score-run.mjs; the browser
// owns only inference, reached through the song-eval page's window.__songEval.
//
// Prereqs (one-time):
//   1) Quit Chrome, then relaunch the profile that holds the cached model:
//        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222
//   2) Start the dev server (serves song-eval.html):
//        cd packages/scratch-gui && npm start
//
// Usage:
//   run-browser --smoke                 warm up + print one raw generated song
//   run-browser --only <id> [--samples 1]
//   run-browser [--baseline] [--judge] [--samples N] [--category <id>] [--resume <runId>]
//   run-browser [--cdp http://localhost:9222] [--page http://localhost:8601/song-eval.html] [--verbose]
import {GEMMA4_PROVIDER_ID, PATHS} from '../config.mjs';
import {loadCases, loadSeed} from '../lib/io.mjs';
import {prepareSeed} from '../lib/seed-prep.mjs';
import {runScoredEval} from '../lib/score-run.mjs';
import {
    connectBrowserPage, ensureGemmaAvailable, warmupGemma, makeBrowserRunOp,
    DEFAULT_CDP_URL, DEFAULT_PAGE_URL
} from '../lib/browser-driver.mjs';

const log = msg => process.stdout.write(`${msg}\n`);

const firstSelectableCase = flags => {
    let cases = loadCases();
    if (flags.only) cases = cases.filter(c => c.id === flags.only);
    if (flags.category) cases = cases.filter(c => c.category === flags.category);
    return cases[0] || null;
};

// MediaPipe generation may or may not be deterministic (createFromOptions sets
// no temperature/seed). Probe once: identical output twice ⇒ samples=1 (extra
// samples would be wasted); otherwise aggregate a few.
const probeDeterminism = async (runOp, flags) => {
    const c = firstSelectableCase(flags);
    if (!c) return 1;
    const seed = prepareSeed(c, loadSeed(c.seedRef));
    log(`[run-browser] determinism probe on ${c.id} …`);
    let a;
    let b;
    try {
        a = await runOp(c, seed);
        b = await runOp(c, seed);
    } catch (e) {
        log(`[run-browser] probe inconclusive (${e.message}); defaulting samples=3`);
        return 3;
    }
    const identical = JSON.stringify(a) === JSON.stringify(b);
    log(`[run-browser] generation is ${identical ? 'deterministic → samples=1' : 'stochastic → samples=3'}`);
    return identical ? 1 : 3;
};

export const runBrowserEval = async flags => {
    const cdpUrl = typeof flags.cdp === 'string' ? flags.cdp : DEFAULT_CDP_URL;
    const pageUrl = typeof flags.page === 'string' ? flags.page : DEFAULT_PAGE_URL;

    const {page, close} = await connectBrowserPage({cdpUrl, pageUrl, verbose: !!flags.verbose});
    try {
        const g = await ensureGemmaAvailable(page);
        log(`[run-browser] ${g.label} available — loading model (uses OPFS cache if present)…`);
        const smoke = await warmupGemma(page, {log});

        if (flags.smoke) {
            log('\n[run-browser] SMOKE — raw generated song:');
            log(JSON.stringify(smoke, null, 2));
            return;
        }

        const runOp = makeBrowserRunOp(page);

        let samples = parseInt(flags.samples, 10);
        if (!Number.isFinite(samples) || samples < 1) {
            samples = await probeDeterminism(runOp, flags);
        }

        await runScoredEval({
            flags,
            runOp,
            providerId: GEMMA4_PROVIDER_ID,
            baselineFile: PATHS.gemma4BaselineFile,
            samples,
            resumeRunId: typeof flags.resume === 'string' ? flags.resume : undefined
        });
    } finally {
        await close();
    }
};
