// Bridge to run the browser-only Gemma 4 provider for the eval.
//
// MediaPipe LlmInference needs real hardware WebGPU, so Node can't run it. We
// attach (over the Chrome DevTools Protocol) to a real local Chrome the user
// started with --remote-debugging-port, open the dev server's song-eval page
// (same origin as the Song Maker UI, so the ~2 GB model already cached in OPFS is
// reused — no re-download), and call the `window.__songEval` hook that page
// installs. Node owns scoring/reporting; the browser owns only inference.
//
// playwright-core is hoisted at the repo root and marked external in launch.cjs,
// so it is required lazily here (only the run-browser command pulls it in).

export const DEFAULT_CDP_URL = 'http://localhost:9222';
export const DEFAULT_PAGE_URL = 'http://localhost:8601/song-eval.html';
const DEFAULT_CALL_TIMEOUT_MS = 180000; // on-device generation is slow

const launchHint =
    'Launch Chrome with the debug port (quit Chrome first so it reuses your ' +
    'profile + cached model):\n' +
    '  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ' +
    '--remote-debugging-port=9222';

const loadChromium = async () => {
    const mod = await import('playwright-core');
    return mod.chromium || (mod.default && mod.default.chromium);
};

const withTimeout = (promise, ms, label) => {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// Attach to Chrome and open a hook page. Returns {browser, page, close}.
// `readyExpr` is the boolean expression page.waitForFunction polls until the
// page's window hook is installed; `readyName` names it in the error message.
// Defaults target the Gemma 4 eval (__songEval); the loudness harness passes
// its own (__songLoudness).
export const connectBrowserPage = async ({
    cdpUrl = DEFAULT_CDP_URL, pageUrl = DEFAULT_PAGE_URL, verbose = false,
    readyExpr = 'window.__songEval && typeof window.__songEval.runOperation === "function"',
    readyName = 'window.__songEval'
} = {}) => {
    const chromium = await loadChromium();

    let browser;
    try {
        browser = await chromium.connectOverCDP(cdpUrl);
    } catch (e) {
        throw new Error(`Could not attach to Chrome at ${cdpUrl} (${e.message}).\n${launchHint}`);
    }

    const context = browser.contexts()[0] || (await browser.newContext());
    const page = await context.newPage();
    if (verbose) {
        page.on('console', msg => process.stdout.write(`[page:${msg.type()}] ${msg.text()}\n`));
        page.on('pageerror', err => process.stdout.write(`[page:error] ${err.message}\n`));
    }

    try {
        await page.goto(pageUrl, {waitUntil: 'domcontentloaded', timeout: 30000});
    } catch (e) {
        await browser.close();
        throw new Error(
            `Could not load ${pageUrl} (${e.message}).\n` +
            'Is the dev server running?  cd packages/scratch-gui && npm start'
        );
    }

    try {
        await page.waitForFunction(readyExpr, null, {timeout: 30000});
    } catch (e) {
        await browser.close();
        throw new Error(
            `Page loaded but ${readyName} never appeared (${e.message}).\n` +
            'Rebuild the dev server so the page entry is served.'
        );
    }

    const close = async () => {
        try {
            await page.close();
        } catch (e) { /* ignore */ }
        // Detach without killing the user's Chrome.
        try {
            await browser.close();
        } catch (e) { /* ignore */ }
    };

    return {browser, page, close};
};

// {id, label, available, reason?} for the gemma4 provider, per the page's
// WebGPU check. Throws a clear message if it's unavailable.
export const ensureGemmaAvailable = async page => {
    const providers = await page.evaluate(() => window.__songEval.listAvailableProviders());
    const g = providers.find(p => p.id === 'gemma4');
    if (!g || !g.available) {
        throw new Error(
            'Gemma 4 is not available in this Chrome. Needs hardware WebGPU ' +
            '(SwiftShader/software GPU is rejected). Use a headed, GPU-backed Chrome.'
        );
    }
    return g;
};

// Load the model (from OPFS cache if present) and report progress. `generate`
// does a real generation, so this doubles as an end-to-end smoke. Returns the
// generated song (smoke output) or null.
export const warmupGemma = async (page, {log = () => {}, smokePrompt} = {}) => {
    const prompt = smokePrompt || 'a short upbeat chiptune melody with light drums';
    const done = page.evaluate(
        p => window.__songEval.generate({prompt: p})
            .then(song => ({song}))
            .catch(e => ({error: e && e.message ? e.message : String(e)})),
        prompt
    );

    let last = '';
    // Poll the module-scope load status while the generation promise is in flight.
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const settled = await Promise.race([done.then(() => true), page.waitForTimeout(1000).then(() => false)]);
        const status = await page.evaluate(() => window.__songEval.getGemma4LoadStatus());
        const line = status.phase === 'downloading' ?
            `downloading ${(status.received / 1e6).toFixed(0)}/${(status.total / 1e6).toFixed(0)} MB` :
            status.phase + (status.error ? `: ${status.error}` : '');
        if (line !== last) {
            log(`[gemma] ${line}`);
            last = line;
        }
        if (settled || status.phase === 'error') break;
    }

    const res = await done;
    if (res.error) throw new Error(`Gemma warmup/generate failed: ${res.error}`);
    return res.song || null;
};

// runOp for the shared scoring core: run one operation in the browser and return
// the sanitized internal song/track (or throw with the page-side message).
export const makeBrowserRunOp = (page, {callTimeoutMs = DEFAULT_CALL_TIMEOUT_MS} = {}) =>
    async (testCase, seed) => {
        const out = await withTimeout(
            page.evaluate(args => window.__songEval.runOperation(args), {testCase, seed}),
            callTimeoutMs,
            `runOperation(${testCase.id})`
        );
        if (out && out.error) throw new Error(out.error);
        return out.result;
    };
