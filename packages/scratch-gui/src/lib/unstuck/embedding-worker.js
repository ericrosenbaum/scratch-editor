/**
 * ES Module Web Worker for sentence embedding inference.
 * This file is copied to build output via CopyWebpackPlugin (not bundled by webpack).
 * Loads @huggingface/transformers from CDN via dynamic import().
 *
 * Must be loaded as a module worker: new Worker(url, {type: 'module'})
 */

let embedder = null;
// Each entry: {embedding: Float32Array, tipId: string}
const tipEmbeddings = [];

const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';

// EmbeddingGemma requires task-specific query prefix at search time.
// Document prefixing happens at build time in tip-document.js, so the
// cached vectors are already in the correct prompt format.
// See https://huggingface.co/google/embeddinggemma-300m
const QUERY_PREFIX = 'task: search result | query: ';

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
        // Load pre-computed tip embeddings from the build-time cache
        try {
            const cachedDocs = event.data.docs;
            const cachedEmbeddings = event.data.embeddings;
            if (cachedEmbeddings.length > 0 && cachedEmbeddings[0].length !== TARGET_DIM) {
                throw new Error(
                    'Cached embedding dim ' + cachedEmbeddings[0].length +
                    ' does not match worker TARGET_DIM ' + TARGET_DIM +
                    ' — regenerate cache with `npm run generate-embeddings`'
                );
            }
            console.log('[Embedding Worker] Loading ' + cachedDocs.length + ' cached tip embeddings...');

            tipEmbeddings.length = 0;
            for (let i = 0; i < cachedDocs.length; i++) {
                tipEmbeddings.push({
                    embedding: new Float32Array(cachedEmbeddings[i]),
                    tipId: cachedDocs[i].tipId
                });
            }

            console.log('[Embedding Worker] All ' + cachedDocs.length + ' cached tip embeddings loaded');
            self.postMessage({type: 'tips-ready'});
        } catch (error) {
            console.error('[Embedding Worker] Loading cached embeddings failed: ' + error.message);
            self.postMessage({
                type: 'error',
                message: 'Loading cached embeddings failed: ' + error.message
            });
        }
    } else if (type === 'embed-tips') {
        // Fallback: compute tip embeddings at runtime if no cache is available.
        // Doc strings arrive pre-formatted (title: ... | text: ...) from the provider.
        if (!embedder) {
            self.postMessage({type: 'error', message: 'Model not loaded yet'});
            return;
        }

        try {
            const docs = event.data.docs; // array of {tipId, text}
            console.log('[Embedding Worker] Embedding ' + docs.length + ' tip documents (no cache)...');

            tipEmbeddings.length = 0;
            for (let i = 0; i < docs.length; i++) {
                const output = await embedder(docs[i].text, {pooling: 'mean', normalize: true});
                tipEmbeddings.push({
                    embedding: truncateAndRenormalize(output.data, TARGET_DIM),
                    tipId: docs[i].tipId
                });
            }

            console.log('[Embedding Worker] All ' + docs.length + ' tip documents embedded');
            self.postMessage({type: 'tips-ready'});
        } catch (error) {
            console.error('[Embedding Worker] Tip embedding failed: ' + error.message);
            self.postMessage({
                type: 'error',
                message: 'Tip embedding failed: ' + error.message
            });
        }
    } else if (type === 'embed-query') {
        if (!embedder) {
            self.postMessage({type: 'error', message: 'Model not loaded yet'});
            return;
        }

        try {
            const query = event.data.query;
            const queryId = event.data.queryId;

            const prefixed = QUERY_PREFIX + query;
            const output = await embedder(prefixed, {pooling: 'mean', normalize: true});
            const queryEmbedding = truncateAndRenormalize(output.data, TARGET_DIM);

            // One embedding per tip → direct cosine similarity, no aggregation needed.
            const results = [];
            for (let i = 0; i < tipEmbeddings.length; i++) {
                const entry = tipEmbeddings[i];
                results.push({
                    tipId: entry.tipId,
                    score: cosineSimilarity(queryEmbedding, entry.embedding)
                });
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
