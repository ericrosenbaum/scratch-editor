#!/usr/bin/env node
/**
 * Build-time script to pre-compute tip embeddings using @huggingface/transformers.
 *
 * Writes a JSON cache file that is checked into the repo.  The cache includes
 * a content hash (of the model name + combined tip texts) so the
 * runtime can detect when it needs to be regenerated, and the build script
 * itself skips work when the hash already matches.
 *
 * Usage:
 *   node scripts/generate-tip-embeddings.mjs          # skip if cache is fresh
 *   node scripts/generate-tip-embeddings.mjs --force   # always regenerate
 */

import {readFileSync, writeFileSync, existsSync} from 'fs';
import {fileURLToPath} from 'url';
import {dirname, resolve} from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MODEL_NAME = 'onnx-community/embeddinggemma-300m-ONNX';
const MODEL_DTYPE = 'q8';
const CACHE_PATH = resolve(__dirname, '../src/lib/libraries/tips/embeddings-cache.json');

// Matryoshka truncation dimension. EmbeddingGemma is trained to support 768/512/256/128.
// 256 keeps strong quality while cutting the shipped cache by 3x. Must match the runtime
// worker's TARGET_DIM in src/lib/unstuck/embedding-worker.js.
const TARGET_DIM = 256;

/**
 *
 * @param vec
 * @param dim
 */
function truncateAndRenormalize (vec, dim) {
    const out = new Array(dim);
    let norm = 0;
    for (let i = 0; i < dim; i++) {
        out[i] = vec[i];
        norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
        for (let i = 0; i < dim; i++) {
            out[i] /= norm;
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// 1. Load tips (ESM) and build per-tip embedding documents
// ---------------------------------------------------------------------------

// Load tips.json directly rather than through ../src/lib/libraries/tips/index.js,
// since that file uses bare JSON imports that webpack handles but raw Node ESM does not.
const tipsJsonPath = resolve(__dirname, '../src/lib/libraries/tips/tips.json');
const tips = JSON.parse(readFileSync(tipsJsonPath, 'utf-8')).tips;

import {buildTipDocument} from '../src/lib/unstuck/tip-document.js';

// One document per tip. The runtime uses the same buildTipDocument helper.
// `id` mirrors `tipId` so the shared hash helper in embedding-hash.js (which
// keys on `id`) gets a stable identifier.
const tipDocs = [];
for (const tipId of Object.keys(tips)) {
    tipDocs.push({
        id: tipId,
        tipId,
        text: buildTipDocument(tips[tipId])
    });
}

// ---------------------------------------------------------------------------
// 2. Compute content hash — uses the same algorithm as the runtime
// ---------------------------------------------------------------------------

import {createHash as createContentHash} from '../src/lib/unstuck/embedding-hash.js';

const contentHash = createContentHash(MODEL_NAME, MODEL_DTYPE, tipDocs);

// ---------------------------------------------------------------------------
// 3. Check existing cache — skip if hash matches (unless --force)
// ---------------------------------------------------------------------------

const force = process.argv.includes('--force');

if (!force && existsSync(CACHE_PATH)) {
    try {
        const existing = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
        if (existing.contentHash === contentHash) {
            console.log('[generate-tip-embeddings] Cache is up-to-date, skipping.');
            process.exit(0);
        }
        console.log('[generate-tip-embeddings] Cache is stale, regenerating...');
    } catch {
        console.log('[generate-tip-embeddings] Cache unreadable, regenerating...');
    }
} else if (force) {
    console.log('[generate-tip-embeddings] --force flag set, regenerating...');
} else {
    console.log('[generate-tip-embeddings] No cache found, generating...');
}

// ---------------------------------------------------------------------------
// 4. Load model and embed all tips
// ---------------------------------------------------------------------------

console.log(`[generate-tip-embeddings] Loading model ${MODEL_NAME} (${MODEL_DTYPE})...`);

const {pipeline} = await import('@huggingface/transformers');

const embedder = await pipeline('feature-extraction', MODEL_NAME, {
    dtype: MODEL_DTYPE,
    device: 'cpu'
});

console.log(`[generate-tip-embeddings] Embedding ${tipDocs.length} tip documents...`);

const docs = [];
const embeddings = [];
for (let i = 0; i < tipDocs.length; i++) {
    const output = await embedder(tipDocs[i].text, {pooling: 'mean', normalize: true});
    docs.push({tipId: tipDocs[i].tipId, text: tipDocs[i].text});
    embeddings.push(truncateAndRenormalize(output.data, TARGET_DIM));
    if ((i + 1) % 10 === 0 || i === tipDocs.length - 1) {
        console.log(`[generate-tip-embeddings] ${i + 1}/${tipDocs.length}`);
    }
}

// ---------------------------------------------------------------------------
// 5. Write cache file
// ---------------------------------------------------------------------------

const cache = {
    _comment: 'Auto-generated by scripts/generate-tip-embeddings.mjs — do not edit by hand',
    modelName: MODEL_NAME,
    modelDtype: MODEL_DTYPE,
    contentHash,
    docs,
    embeddings
};

writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');
console.log(`[generate-tip-embeddings] Wrote ${CACHE_PATH}`);
