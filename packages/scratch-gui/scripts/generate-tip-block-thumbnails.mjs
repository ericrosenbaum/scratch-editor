#!/usr/bin/env node
/**
 * Build-time script to pre-render JPEG thumbnails of every tip's
 * `_capturedBlocks` and cache them in a JSON file checked into the repo.
 *
 * Computes a content hash (renderer version + tip block contents) and
 * skips work when the existing cache matches. When stale, delegates to a
 * Playwright spec that drives the dev-only block-thumbnail-harness page.
 *
 * Usage:
 *   node scripts/generate-tip-block-thumbnails.mjs          # skip if fresh
 *   node scripts/generate-tip-block-thumbnails.mjs --force  # always run
 */

import {readFileSync, existsSync} from 'fs';
import {fileURLToPath} from 'url';
import {dirname, resolve} from 'path';
import {execFileSync} from 'child_process';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RENDERER_VERSION = 'v1-96px-q92';
const TIPS_JSON_PATH = resolve(__dirname, '../src/lib/libraries/tips/tips.json');
const CACHE_PATH = resolve(__dirname, '../src/lib/libraries/tips/block-thumbnails-cache.json');
const SPEC_PATH = 'test/playwright/generate-block-thumbnails.spec.js';

const tips = JSON.parse(readFileSync(TIPS_JSON_PATH, 'utf-8')).tips;

// Same djb2 algorithm as src/lib/unstuck/embedding-hash.js. Inlined here
// because that module is ESM and this script needs to share the algorithm
// with the Playwright spec without crossing module systems.
const simpleHash = str => {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16);
};

const buildContentHash = () => {
    const docs = [];
    for (const tipId of Object.keys(tips)) {
        const blocks = tips[tipId]._capturedBlocks;
        if (!blocks || blocks.length === 0) continue;
        docs.push({id: tipId, text: JSON.stringify(blocks)});
    }
    docs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    let combined = `${RENDERER_VERSION}\0`;
    for (const d of docs) {
        combined += `\0${d.id}\0${d.text}`;
    }
    return simpleHash(combined);
};

const contentHash = buildContentHash();

const force = process.argv.includes('--force');

if (!force && existsSync(CACHE_PATH)) {
    try {
        const existing = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
        if (existing.contentHash === contentHash && existing.rendererVersion === RENDERER_VERSION) {
            console.log('[generate-tip-block-thumbnails] Cache is up-to-date, skipping.');
            process.exit(0);
        }
        console.log('[generate-tip-block-thumbnails] Cache is stale, regenerating...');
    } catch {
        console.log('[generate-tip-block-thumbnails] Cache unreadable, regenerating...');
    }
} else if (force) {
    console.log('[generate-tip-block-thumbnails] --force flag set, regenerating...');
} else {
    console.log('[generate-tip-block-thumbnails] No cache found, generating...');
}

// Find a running dev server that actually serves the harness page. The
// Playwright config defaults to localhost:8601 with reuseExistingServer,
// but the user may have another checkout occupying 8601 — in that case
// 8602 (or another port) hosts this checkout's webpack-dev-server.
const probePort = port => new Promise(resolveProbe => {
    const req = http.get({hostname: 'localhost', port, path: '/block-thumbnail-harness.html', timeout: 1000}, res => {
        res.resume();
        resolveProbe(res.statusCode === 200);
    });
    req.on('error', () => resolveProbe(false));
    req.on('timeout', () => {
        req.destroy();
        resolveProbe(false);
    });
});

let baseURL = null;
for (const port of [8601, 8602, 8603]) {
    // eslint-disable-next-line no-await-in-loop
    if (await probePort(port)) {
        baseURL = `http://localhost:${port}`;
        console.log(`[generate-tip-block-thumbnails] Found harness at ${baseURL}`);
        break;
    }
}
if (!baseURL) {
    console.error('[generate-tip-block-thumbnails] No dev server is serving /block-thumbnail-harness.html on 8601-8603.');
    console.error('[generate-tip-block-thumbnails] Run `npm start` in this checkout first.');
    process.exit(1);
}

console.log('[generate-tip-block-thumbnails] Launching Playwright spec to render thumbnails...');

try {
    execFileSync(
        'npx',
        ['playwright', 'test', SPEC_PATH, '--project=chromium', '--reporter=list'],
        {
            cwd: resolve(__dirname, '..'),
            stdio: 'inherit',
            env: {
                ...process.env,
                BLOCK_THUMBNAIL_CONTENT_HASH: contentHash,
                BLOCK_THUMBNAIL_BASE_URL: baseURL
            }
        }
    );
} catch (err) {
    console.error('[generate-tip-block-thumbnails] Playwright spec failed.');
    process.exit(err.status || 1);
}

console.log('[generate-tip-block-thumbnails] Done.');
