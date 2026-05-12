// @ts-check
const fs = require('fs');
const path = require('path');
const {test, expect} = require('@playwright/test');

const RUNS_PER_SCENARIO = 5;
const FIXTURE_SIZE = {width: 480, height: 360};
const RESULTS_PATH = path.resolve(__dirname, '../../test-results/bg-removal-perf.json');

const SCENARIOS = [
    {id: 'S0', label: 'baseline (defaults)', config: {}},
    {id: 'S1', label: 'raw RGBA output', config: {output: {format: 'image/x-rgba8'}}},
    {id: 'S2', label: 'quantized isnet_quint8 (CPU)', config: {model: 'isnet_quint8', output: {format: 'image/x-rgba8'}}},
    {id: 'S3', label: 'WebGPU + isnet + worker', config: {device: 'gpu', proxyToWorker: true, output: {format: 'image/x-rgba8'}}},
    {id: 'S4', label: 'WebGPU + isnet_fp16 + worker', config: {device: 'gpu', model: 'isnet_fp16', proxyToWorker: true, output: {format: 'image/x-rgba8'}}},
    {id: 'S5', label: 'WebGPU + fp16 + preloaded', config: {device: 'gpu', model: 'isnet_fp16', proxyToWorker: true, output: {format: 'image/x-rgba8'}}, preload: true},
    {id: 'S6', label: 'WebGPU + fp16 + maxEdge 1024 (large input)', config: {device: 'gpu', model: 'isnet_fp16', proxyToWorker: true, output: {format: 'image/x-rgba8'}, maxEdge: 1024}, fixtureSize: {width: 2048, height: 1536}}
];

const PHASES = ['total', 'toBlob', 'model-fetch', 'model-init', 'inference', 'decode'];

function median (xs) {
    if (!xs.length) return null;
    const sorted = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function p90 (xs) {
    if (!xs.length) return null;
    const sorted = [...xs].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(0.9 * sorted.length) - 1)];
}

/**
 * Build a deterministic in-browser test image as a data URL. ISNet inference
 * time depends on input dimensions, not content semantics, so a synthetic
 * image with a clear foreground subject is sufficient and avoids checking in
 * a binary fixture.
 */
async function buildFixtureDataUrl (page, size) {
    return page.evaluate(({width, height}) => {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        const ctx = c.getContext('2d');
        const bg = ctx.createLinearGradient(0, 0, width, height);
        bg.addColorStop(0, '#2b6cb0');
        bg.addColorStop(1, '#9f7aea');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#f6ad55';
        ctx.beginPath();
        ctx.ellipse(width / 2, height * 0.55, width * 0.22, height * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fbd38d';
        ctx.beginPath();
        ctx.ellipse(width / 2, height * 0.32, width * 0.13, height * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
        return c.toDataURL('image/png');
    }, size);
}

async function ensurePaintEditorReady (page) {
    // Clicking the Costumes tab mounts the paint editor; that pulls in
    // scratch-paint's bitmap.js which installs window.__bgRemovalTestHooks.
    const costumesTab = page.getByText('Costumes', {exact: true}).first();
    await costumesTab.waitFor({state: 'visible', timeout: 30_000});
    await costumesTab.click();
    await page.waitForFunction(
        () => typeof window.__bgRemovalTestHooks?.runFromDataUrl === 'function',
        null,
        {timeout: 30_000}
    );
}

async function runOnce (page, dataUrl, config) {
    return page.evaluate(async ({dataUrl, config}) => {
        window.__bgRemovalConfig = config;
        performance.clearMeasures();
        performance.clearMarks();
        const t0 = performance.now();
        await window.__bgRemovalTestHooks.runFromDataUrl(dataUrl);
        const wallMs = performance.now() - t0;
        const measures = performance.getEntriesByType('measure')
            .filter(m => m.name.startsWith('bgRemoval:'))
            .map(m => ({name: m.name.replace(/^bgRemoval:/, ''), duration: m.duration}));
        return {
            wallMs,
            measures,
            effectiveConfig: window.__bgRemovalLastConfig,
            crossOriginIsolated: window.crossOriginIsolated,
            hasWebGPU: 'gpu' in navigator
        };
    }, {dataUrl, config});
}

function summarizeRuns (runs) {
    const out = {};
    for (const phase of PHASES) {
        const cold = runs[0]?.measures.find(m => m.name === phase)?.duration ?? null;
        const warm = runs.slice(1).map(r => r.measures.find(m => m.name === phase)?.duration).filter(d => d != null);
        out[phase] = {
            cold: cold == null ? null : Math.round(cold),
            warm_median: warm.length ? Math.round(median(warm)) : null,
            warm_p90: warm.length ? Math.round(p90(warm)) : null
        };
    }
    const wallWarm = runs.slice(1).map(r => r.wallMs);
    out.wall = {
        cold: Math.round(runs[0]?.wallMs ?? 0),
        warm_median: wallWarm.length ? Math.round(median(wallWarm)) : null,
        warm_p90: wallWarm.length ? Math.round(p90(wallWarm)) : null
    };
    return out;
}

function printTable (scenarioId, label, summary) {
    /* eslint-disable no-console */
    console.log(`\n=== ${scenarioId}: ${label} ===`);
    const rows = PHASES.concat(['wall']).map(phase => ({
        phase,
        cold_ms: summary[phase].cold,
        warm_median_ms: summary[phase].warm_median,
        warm_p90_ms: summary[phase].warm_p90
    }));
    console.table(rows);
}

test.describe.serial('background-removal perf', () => {
    const allResults = {};

    test.beforeEach(async ({page}) => {
        await page.addInitScript(() => {
            window.__bgRemovalEnableTestHooks = true;
        });
    });

    for (const scenario of SCENARIOS) {
        test(`${scenario.id}: ${scenario.label}`, async ({page}) => {
            test.setTimeout(5 * 60 * 1000);

            await page.goto('index.html');
            await ensurePaintEditorReady(page);

            const fixtureSize = scenario.fixtureSize || FIXTURE_SIZE;
            const dataUrl = await buildFixtureDataUrl(page, fixtureSize);

            // Sanity check: tell the user what environment we're actually in.
            const env = await page.evaluate(() => ({
                crossOriginIsolated: window.crossOriginIsolated,
                hasWebGPU: 'gpu' in navigator
            }));
            console.log(`  env: crossOriginIsolated=${env.crossOriginIsolated}, hasWebGPU=${env.hasWebGPU}`);

            // GPU scenarios should not silently fall back to CPU.
            if (scenario.config.device === 'gpu') {
                expect(env.hasWebGPU, 'navigator.gpu must be present for GPU scenarios').toBe(true);
                expect(env.crossOriginIsolated, 'crossOriginIsolated must be true for GPU/worker scenarios').toBe(true);
            }

            if (scenario.preload) {
                await page.evaluate(async config => {
                    await window.__bgRemovalTestHooks.preload(config);
                }, scenario.config);
            }

            const runs = [];
            for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
                runs.push(await runOnce(page, dataUrl, scenario.config));
            }

            // Effective config attribution: catches silent fallthroughs.
            const eff = runs[runs.length - 1].effectiveConfig || {};
            for (const key of Object.keys(scenario.config)) {
                expect(eff[key], `effective ${key} must match scenario`).toEqual(scenario.config[key]);
            }

            const summary = summarizeRuns(runs);
            printTable(scenario.id, scenario.label, summary);

            allResults[scenario.id] = {
                label: scenario.label,
                config: scenario.config,
                fixtureSize,
                env,
                summary,
                runs: runs.map(r => ({wallMs: r.wallMs, measures: r.measures}))
            };
            fs.mkdirSync(path.dirname(RESULTS_PATH), {recursive: true});
            fs.writeFileSync(RESULTS_PATH, JSON.stringify(allResults, null, 2));
        });
    }
});
