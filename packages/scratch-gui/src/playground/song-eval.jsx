// Headless eval surface for the song-ai harness. Served by the dev server at
// /song-eval.html (same origin as the Song Maker UI, so it reuses the ~2 GB
// Gemma 4 model already cached in OPFS). The Node eval driver attaches to a real
// Chrome over CDP and calls window.__songEval — see
// eval/song-ai/lib/browser-driver.mjs. No UI: this page only installs the hook.
//
// runOperation is imported from the *same* orchestrate module the Node path uses
// (eval/song-ai/lib/orchestrate.mjs), so Gemma 4 travels the identical
// sanitize + scale-snap pipeline as Magenta — zero logic drift.
import {runOperation} from '../../eval/song-ai/lib/orchestrate.mjs';
import {
    generateSongFromPrompt,
    listAvailableProviders,
    getGemma4LoadStatus,
    subscribeGemma4LoadStatus
} from '../lib/song-ai/index.js';

const PROVIDER_ID = 'gemma4';

window.__songEval = {
    // Run one eval case in the browser. Returns plain JSON the Node side scores:
    // {unit, result} on success, {error} on failure (so page.evaluate never has
    // to surface a thrown stack across the bridge).
    runOperation: async ({testCase, seed}) => {
        try {
            const {unit, result} = await runOperation({testCase, seed, providerId: PROVIDER_ID});
            return {unit, result};
        } catch (e) {
            return {error: (e && e.message) || String(e)};
        }
    },

    // Warmup / smoke: a real generation that forces the model to load. The driver
    // polls getGemma4LoadStatus() while this runs to show download/load progress.
    generate: ({prompt}) => generateSongFromPrompt({prompt, providerId: PROVIDER_ID}),

    listAvailableProviders,
    getGemma4LoadStatus,
    subscribeGemma4LoadStatus
};

// eslint-disable-next-line no-console
console.log('[song-eval] window.__songEval ready');
