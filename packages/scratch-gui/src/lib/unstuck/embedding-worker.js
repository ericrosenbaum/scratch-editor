/**
 * ES Module Web Worker for sentence embedding inference.
 * This file is copied to build output via CopyWebpackPlugin (not bundled by webpack).
 * Loads @huggingface/transformers from CDN via dynamic import().
 *
 * Must be loaded as a module worker: new Worker(url, {type: 'module'})
 */

let embedder = null;
// Each entry: {embedding: Float32Array, tipId: string}
const queryEmbeddings = [];

const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';

// EmbeddingGemma requires task-specific prefixes at both index time and query time.
// See https://huggingface.co/google/embeddinggemma-300m
const QUERY_PREFIX = 'task: search result | query: ';
const DOCUMENT_PREFIX = 'title: none | text: ';

// Matryoshka truncation dimension. Must match TARGET_DIM in
// scripts/generate-tip-embeddings.mjs — query vectors and cached document
// vectors have to live in the same subspace for cosine similarity to mean anything.
const TARGET_DIM = 256;

function truncateAndRenormalize (vec, dim) {
    const out = new Float32Array(dim);
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

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity (a, b) {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

self.onmessage = async function (event) {
    const {type} = event.data;

    if (type === 'init') {
        try {
            console.log('[Embedding Worker] Loading transformers.js from CDN...');
            const {pipeline, env} = await import(
                /* webpackIgnore: true */
                TRANSFORMERS_CDN + '/dist/transformers.min.js'
            );

            env.allowLocalModels = false;

            console.log('[Embedding Worker] Creating feature-extraction pipeline...');
            embedder = await pipeline(
                'feature-extraction',
                'onnx-community/embeddinggemma-300m-ONNX',
                {
                    dtype: 'q8',
                    device: 'wasm',
                    progress_callback: function (progressInfo) {
                        if (progressInfo.status === 'progress') {
                            console.log(
                                '[Embedding Worker] Download: ' + progressInfo.file +
                                ' ' + Math.round(progressInfo.progress) + '%'
                            );
                            self.postMessage({
                                type: 'progress',
                                progress: progressInfo.progress,
                                file: progressInfo.file
                            });
                        }
                    }
                }
            );

            console.log('[Embedding Worker] Model ready');
            self.postMessage({type: 'ready'});
        } catch (error) {
            console.error('[Embedding Worker] Init failed: ' + error.message);
            self.postMessage({
                type: 'error',
                message: 'Failed to load embedding model: ' + error.message
            });
        }
    } else if (type === 'load-cached-embeddings') {
        // Load pre-computed query embeddings from the build-time cache
        try {
            const cachedQueries = event.data.queries;
            const cachedEmbeddings = event.data.embeddings;
            if (cachedEmbeddings.length > 0 && cachedEmbeddings[0].length !== TARGET_DIM) {
                throw new Error(
                    'Cached embedding dim ' + cachedEmbeddings[0].length +
                    ' does not match worker TARGET_DIM ' + TARGET_DIM +
                    ' — regenerate cache with `npm run generate-embeddings`'
                );
            }
            console.log('[Embedding Worker] Loading ' + cachedQueries.length + ' cached query embeddings...');

            queryEmbeddings.length = 0;
            for (let i = 0; i < cachedQueries.length; i++) {
                queryEmbeddings.push({
                    embedding: new Float32Array(cachedEmbeddings[i]),
                    tipId: cachedQueries[i].tipId
                });
            }

            console.log('[Embedding Worker] All ' + cachedQueries.length + ' cached query embeddings loaded');
            self.postMessage({type: 'tips-ready'});
        } catch (error) {
            console.error('[Embedding Worker] Loading cached embeddings failed: ' + error.message);
            self.postMessage({
                type: 'error',
                message: 'Loading cached embeddings failed: ' + error.message
            });
        }
    } else if (type === 'embed-tips') {
        // Fallback: compute query embeddings at runtime if no cache is available
        if (!embedder) {
            self.postMessage({type: 'error', message: 'Model not loaded yet'});
            return;
        }

        try {
            const queries = event.data.tips; // array of {id, text, tipId}
            console.log('[Embedding Worker] Embedding ' + queries.length + ' queries (no cache)...');

            queryEmbeddings.length = 0;
            for (let i = 0; i < queries.length; i++) {
                const prefixed = DOCUMENT_PREFIX + queries[i].text;
                const output = await embedder(prefixed, {pooling: 'mean', normalize: true});
                queryEmbeddings.push({
                    embedding: truncateAndRenormalize(output.data, TARGET_DIM),
                    tipId: queries[i].tipId
                });
            }

            console.log('[Embedding Worker] All ' + queries.length + ' queries embedded');
            self.postMessage({type: 'tips-ready'});
        } catch (error) {
            console.error('[Embedding Worker] Query embedding failed: ' + error.message);
            self.postMessage({
                type: 'error',
                message: 'Query embedding failed: ' + error.message
            });
        }
    } else if (type === 'embed-query') {
        if (!embedder) {
            self.postMessage({type: 'error', message: 'Model not loaded yet'});
            return;
        }

        try {
            const query = event.data.query;
            const contextScores = event.data.contextScores;
            const queryId = event.data.queryId;

            const prefixed = QUERY_PREFIX + query;
            const output = await embedder(prefixed, {pooling: 'mean', normalize: true});
            const queryEmbedding = truncateAndRenormalize(output.data, TARGET_DIM);

            // Find best-matching query per tip (max similarity, not average)
            const bestScores = {};
            for (let i = 0; i < queryEmbeddings.length; i++) {
                const entry = queryEmbeddings[i];
                const similarity = cosineSimilarity(queryEmbedding, entry.embedding);
                if (!(entry.tipId in bestScores) || similarity > bestScores[entry.tipId]) {
                    bestScores[entry.tipId] = similarity;
                }
            }

            const results = [];
            var tipIds = Object.keys(bestScores);
            for (var j = 0; j < tipIds.length; j++) {
                var tid = tipIds[j];
                var embeddingScore = bestScores[tid] * 10;
                var ctxScore = contextScores[tid] || 0;
                results.push({tipId: tid, score: embeddingScore + ctxScore});
            }

            results.sort(function (a, b) { return b.score - a.score; });
            self.postMessage({
                type: 'results',
                results: results.slice(0, 10),
                queryId: queryId
            });
        } catch (error) {
            console.error('[Embedding Worker] Query embedding failed: ' + error.message);
            self.postMessage({
                type: 'error',
                message: 'Query embedding failed: ' + error.message
            });
        }
    }
};
