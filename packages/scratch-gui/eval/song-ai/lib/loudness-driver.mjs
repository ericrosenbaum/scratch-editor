// Bridge for the loudness-measurement harness. Attaches over CDP to a real
// local Chrome and drives the /song-loudness.html page's window.__songLoudness
// hook (which renders each instrument/preset through the real scheduler into an
// OfflineAudioContext and measures LUFS). Reuses connectBrowserPage from
// browser-driver.mjs with a loudness-specific readiness check.

import {connectBrowserPage, DEFAULT_CDP_URL} from './browser-driver.mjs';

export const DEFAULT_LOUDNESS_PAGE_URL = 'http://localhost:8601/song-loudness.html';

export const connectLoudnessPage = async ({
    cdpUrl = DEFAULT_CDP_URL, pageUrl = DEFAULT_LOUDNESS_PAGE_URL, verbose = false
} = {}) =>
    connectBrowserPage({
        cdpUrl,
        pageUrl,
        verbose,
        readyExpr: 'window.__songLoudness && typeof window.__songLoudness.measureOne === "function"',
        readyName: 'window.__songLoudness'
    });

// Block until the page reports the sample MP3s have decoded.
export const waitForSamples = async page => {
    const res = await page.evaluate(() => window.__songLoudness.ready());
    if (!res.ok) throw new Error(`samples not ready: ${res.reason}`);
    return res;
};

export const listTargets = page =>
    page.evaluate(() => window.__songLoudness.listTargets());

export const measureOne = (page, family, index) =>
    page.evaluate(args => window.__songLoudness.measureOne(args), {family, index});
