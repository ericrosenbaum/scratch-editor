// Measure the integrated loudness (LUFS) + sample peak of every Song Maker
// instrument / synth / drum preset, by driving the /song-loudness.html page in a
// real Chrome over CDP (OfflineAudioContext is browser-only). Derives the dB
// trim each target needs to hit a common loudness target and prints a paste-ready
// table for instrument-gain.js.
//
// Prereqs (one-time):
//   1) Launch Chrome with the debug port:
//        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222
//   2) Start the dev server (serves song-loudness.html):
//        cd packages/scratch-gui && npm start
//
// Usage:
//   measure-loudness [--target -16] [--only <substr>] [--family instrument|drum|synth|synthDrum]
//                    [--baseline] [--cdp <url>] [--page <url>] [--verbose] [--selftest]
//
// On the FIRST run (no trims committed yet) the "trimDb" column is the real trim
// to paste. On a VERIFY run (after trims are committed and the dev server has
// rebuilt) the page renders the trimmed scheduler, so "lufs" is already the
// post-trim loudness and "trimDb" (additional) should be ≈ 0 — that's the pass
// signal, together with |lufs - target| ≤ 1 LU and peak ≤ -1 dBFS.

import path from 'path';

import {PATHS} from '../config.mjs';
import {writeJson, writeText, nowIso} from '../lib/io.mjs';
import {runSelfTest} from '../lib/lufs.mjs';
import {
    connectLoudnessPage, waitForSamples, listTargets, measureOne, DEFAULT_LOUDNESS_PAGE_URL
} from '../lib/loudness-driver.mjs';
import {DEFAULT_CDP_URL} from '../lib/browser-driver.mjs';

const log = msg => process.stdout.write(`${msg}\n`);

const FAMILY_ORDER = ['instrument', 'drum', 'synth', 'synthDrum'];
const FAMILY_LABEL = {
    instrument: 'Sample instruments', drum: 'Sampled drums',
    synth: 'Synth presets', synthDrum: 'Synth-drum presets'
};
// Default loudness target. Not the quietest measured (that wastes ~20 dB of
// headroom when one sample is an outlier, e.g. Electric Guitar at -39 LUFS) — a
// representative level most instruments can reach, boosting the quiet ones up
// to where their peak headroom allows.
const DEFAULT_TARGET_LUFS = -20;
const MAX_BOOST_DB = 18; // don't over-amplify a quiet sample (noise floor)
const MAX_CUT_DB = -24;
const TOLERANCE_LU = 1.0;
const PEAK_CEILING_DB = -1.0; // post-trim sample peak must stay below this
// Measurements use velocity 100, but notes can reach 127. Under the square
// velocity curve that is 40·log10(127/100) ≈ 4.2 dB louder, so reserve that much
// extra peak headroom in the trim clamp — otherwise a peak-limited instrument
// would hit ~+3 dBFS at full velocity and slam the master limiter on its own.
const VELOCITY_HEADROOM_DB = 4.2;

const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '  -inf');

const runLocalSelfTest = () => {
    const r = runSelfTest();
    for (const c of r.checks) log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}  [${c.detail}]`);
    log(r.ok ? '\nlufs.mjs self-test PASS' : '\nlufs.mjs self-test FAIL');
    if (!r.ok) process.exit(1);
};

export const measureLoudnessCmd = async flags => {
    if (flags.selftest) {
        runLocalSelfTest();
        if (!flags.page && !flags.cdp) return; // selftest-only
    }

    const cdpUrl = typeof flags.cdp === 'string' ? flags.cdp : DEFAULT_CDP_URL;
    const pageUrl = typeof flags.page === 'string' ? flags.page : DEFAULT_LOUDNESS_PAGE_URL;

    const {page, close} = await connectLoudnessPage({cdpUrl, pageUrl, verbose: !!flags.verbose});
    let measured = [];
    try {
        log('[measure-loudness] waiting for sample decode…');
        const r = await waitForSamples(page);
        log(`[measure-loudness] samples ready (decoded @ ${r.sampleRate} Hz, rendering @ 48 kHz)`);

        const targets = listTargetsFlat(await listTargets(page), flags);
        log(`[measure-loudness] measuring ${targets.length} targets…`);
        for (const t of targets) {
            // eslint-disable-next-line no-await-in-loop
            const m = await measureOne(page, t.family, t.index);
            measured.push(m);
            if (flags.verbose) log(`  ${m.family}/${m.name}: ${fmt(m.lufs)} LUFS, peak ${fmt(m.samplePeakDb)} dBFS`);
        }
    } finally {
        await close();
    }

    // Target LUFS: explicit --target, else a representative default.
    const explicit = parseFloat(flags.target);
    const target = Number.isFinite(explicit) ? explicit : DEFAULT_TARGET_LUFS;

    for (const m of measured) {
        if (!Number.isFinite(m.lufs)) {
            m.trimDb = 0;
            m.distanceLu = null;
            m.pass = false;
            continue;
        }
        // Trim toward target, but never boost past the peak ceiling (post-trim
        // peak at full velocity ≤ ceiling) and never beyond the boost/cut caps.
        const peakHeadroom = (PEAK_CEILING_DB - VELOCITY_HEADROOM_DB) - m.samplePeakDb;
        const want = Math.round((target - m.lufs) * 10) / 10;
        m.trimDb = Math.max(MAX_CUT_DB, Math.min(want, MAX_BOOST_DB, peakHeadroom));
        m.trimDb = Math.round(m.trimDb * 10) / 10;
        // |lufs - target| measured directly is meaningful on a VERIFY run (lufs
        // already includes committed trims); on the derive run it's the raw gap.
        m.distanceLu = m.lufs - target;
        // A sound pinned at the full-velocity peak ceiling can't get louder
        // without clipping — being below target is then expected, not a failure
        // (transients like claps/woodblocks have high crest factor). Pass if it's
        // either at target or maxed out on peak and not over the ceiling.
        m.peakLimited = m.samplePeakDb >= (PEAK_CEILING_DB - VELOCITY_HEADROOM_DB - 0.3);
        m.pass = m.samplePeakDb <= PEAK_CEILING_DB &&
            (Math.abs(m.lufs - target) <= TOLERANCE_LU || (m.peakLimited && m.lufs <= target));
    }

    const report = formatReport(measured, target);
    log(`\n${report}`);

    const runId = nowIso().replace(/[:.]/g, '-');
    const outDir = path.join(PATHS.results, `loudness-${runId}`);
    const payload = {runId, generatedAt: nowIso(), target, results: measured};
    writeJson(path.join(outDir, 'loudness.json'), payload);
    writeText(path.join(outDir, 'report.txt'), report);
    log(`[measure-loudness] results: ${path.relative(PATHS.root, outDir)}`);

    if (flags.baseline) {
        writeJson(PATHS.loudnessBaselineFile, payload);
        log(`[measure-loudness] baseline written: ${path.relative(PATHS.root, PATHS.loudnessBaselineFile)}`);
    }

    log(`\n${formatTrimTable(measured)}`);
};

const listTargetsFlat = (catalog, flags) => {
    const out = [];
    for (const family of FAMILY_ORDER) {
        if (flags.family && flags.family !== family) continue;
        const key = family === 'synthDrum' ? 'synthDrums' : `${family}s`;
        for (const t of (catalog[key] || [])) {
            if (flags.only && typeof flags.only === 'string' &&
                !t.name.toLowerCase().includes(flags.only.toLowerCase())) continue;
            out.push({family, index: t.index, name: t.name});
        }
    }
    return out;
};

const formatReport = (measured, target) => {
    const lines = [];
    lines.push(`Loudness report — target ${fmt(target)} LUFS  (±${TOLERANCE_LU} LU, peak ≤ ${PEAK_CEILING_DB} dBFS)`);
    lines.push('');
    let nPass = 0;
    let nTotal = 0;
    for (const family of FAMILY_ORDER) {
        const rows = measured.filter(m => m.family === family);
        if (!rows.length) continue;
        lines.push(`  ${FAMILY_LABEL[family]}`);
        lines.push(`    ${'name'.padEnd(20)} ${'LUFS'.padStart(8)} ${'peakdB'.padStart(8)} ${'Δtarget'.padStart(8)} ${'trimDb'.padStart(8)}   `);
        for (const m of rows) {
            nTotal++;
            if (m.pass) nPass++;
            const tag = !Number.isFinite(m.lufs) ? 'SILENT' :
                (m.pass ? (m.peakLimited && Math.abs(m.distanceLu) > TOLERANCE_LU ? 'ok(pk-lim)' : 'ok') : 'FAIL');
            lines.push(
                `    ${String(m.name).padEnd(20)} ${fmt(m.lufs).padStart(8)} ${fmt(m.samplePeakDb).padStart(8)} ` +
                `${fmt(m.distanceLu).padStart(8)} ${fmt(m.trimDb).padStart(8)}  ${tag}`
            );
        }
        lines.push('');
    }
    lines.push(`  PASS ${nPass}/${nTotal} within ±${TOLERANCE_LU} LU of target and peak ≤ ${PEAK_CEILING_DB} dBFS`);
    return lines.join('\n');
};

// Paste-ready snippets for instrument-gain.js.
const formatTrimTable = measured => {
    const lines = ['// ---- paste into instrument-gain.js (dB trims) ----'];
    const byIndex = family => measured.filter(m => m.family === family)
        .sort((a, b) => a.index - b.index).map(m => fmt(m.trimDb)).join(', ');
    const byName = family => measured.filter(m => m.family === family)
        .map(m => `    ${JSON.stringify(m.name)}: ${fmt(m.trimDb)}`).join(',\n');
    lines.push(`SAMPLE_INSTRUMENT_TRIM_DB = [${byIndex('instrument')}];`);
    lines.push(`SAMPLED_DRUM_TRIM_DB = [${byIndex('drum')}];`);
    lines.push(`SYNTH_PRESET_TRIM_DB = {\n${byName('synth')}\n};`);
    lines.push(`SYNTH_DRUM_PRESET_TRIM_DB = {\n${byName('synthDrum')}\n};`);
    return lines.join('\n');
};
