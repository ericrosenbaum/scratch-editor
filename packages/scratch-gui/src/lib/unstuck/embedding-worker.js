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

// Pin the exact transformers.js version (keep in sync with @huggingface/transformers
// in package.json devDependencies). A floating `@3` major range means a momentarily
// broken new 3.x release on the CDN can break tips-search setup.
const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

// Resilience tuning for the one-time model setup. Loading transformers.js and the
// model weights are network calls that can fail or stall intermittently; we retry
// transient failures instead of immediately dropping the user to keyword-only search.
const LIB_LOAD_ATTEMPTS = 3;
const LIB_LOAD_TIMEOUT_MS = 15000; // per-attempt cap for the transformers.js import
const LIB_RETRY_BACKOFF_MS = [500, 1500]; // backoff before retry 2 and 3
const MODEL_LOAD_ATTEMPTS = 2;
const MODEL_STALL_TIMEOUT_MS = 30000; // reject only if the download makes no progress for this long
const MODEL_RETRY_BACKOFF_MS = [2000]; // backoff before retry 2

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

function delay (ms) {
    return new Promise(function (resolve) {
        setTimeout(resolve, ms);
    });
}

/**
 * Reject if `promise` does not settle within `ms`. The timeout only stops us
 * waiting — it cannot abort the underlying fetch — so callers retry on timeout.
 */
async function withTimeout (promise, ms, label) {
    let timer;
    const timeout = new Promise(function (resolve, reject) {
        timer = setTimeout(function () {
            reject(new Error(label + ' timed out after ' + ms + 'ms'));
        }, ms);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Import transformers.js from the CDN, retrying transient failures. A blocked or
 * offline request rejects immediately, so this still fails fast when the CDN is
 * unreachable; the per-attempt timeout only matters when a connection hangs.
 */
async function loadTransformers () {
    let lastError;
    for (let attempt = 1; attempt <= LIB_LOAD_ATTEMPTS; attempt++) {
        try {
            // A failed dynamic import() of a specifier can be cached as a rejected
            // module record, so vary the URL on retries to force a real re-fetch.
            // jsdelivr ignores unknown query params and serves the same file.
            const url = TRANSFORMERS_CDN + '/dist/transformers.min.js' +
                (attempt > 1 ? '?retry=' + attempt : '');
            console.log('[Embedding Worker] Loading transformers.js from CDN (attempt ' + attempt + ')...');
            return await withTimeout(
                import(/* webpackIgnore: true */ url),
                LIB_LOAD_TIMEOUT_MS,
                'transformers.js load'
            );
        } catch (error) {
            lastError = error;
            console.warn(
                '[Embedding Worker] transformers.js load attempt ' + attempt + ' failed: ' + error.message
            );
            if (attempt < LIB_LOAD_ATTEMPTS) {
                await delay(LIB_RETRY_BACKOFF_MS[attempt - 1] || 1500);
            }
        }
    }
    throw lastError;
}

/**
 * Build the feature-extraction pipeline once, guarded by a stall watchdog: it
 * rejects only if the download makes NO progress for MODEL_STALL_TIMEOUT_MS, so a
 * healthy-but-slow download is never killed. Progress events are forwarded to the
 * main thread unchanged.
 */
function createEmbedderOnce (pipeline) {
    return new Promise(function (resolve, reject) {
        let stallTimer;
        let settled = false;
        const arm = function () {
            clearTimeout(stallTimer);
            stallTimer = setTimeout(function () {
                if (settled) return;
                settled = true;
                reject(new Error(
                    'model download stalled (no progress for ' + MODEL_STALL_TIMEOUT_MS + 'ms)'
                ));
            }, MODEL_STALL_TIMEOUT_MS);
        };
        arm();
        pipeline(
            'feature-extraction',
            'onnx-community/embeddinggemma-300m-ONNX',
            {
                dtype: 'q8',
                device: 'wasm',
                progress_callback: function (progressInfo) {
                    // Any callback activity counts as liveness — reset the stall timer.
                    arm();
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
        ).then(
            function (embedderInstance) {
                if (settled) return;
                settled = true;
                clearTimeout(stallTimer);
                resolve(embedderInstance);
            },
            function (error) {
                if (settled) return;
                settled = true;
                clearTimeout(stallTimer);
                reject(error);
            }
        );
    });
}

/**
 * Create the embedder, retrying on stall/failure. transformers.js caches completed
 * files in the browser Cache API, so a retry re-fetches only the unfinished file.
 */
async function createEmbedder (pipeline) {
    let lastError;
    for (let attempt = 1; attempt <= MODEL_LOAD_ATTEMPTS; attempt++) {
        try {
            if (attempt > 1) {
                console.log('[Embedding Worker] Retrying model load (attempt ' + attempt + ')...');
            }
            return await createEmbedderOnce(pipeline);
        } catch (error) {
            lastError = error;
            console.warn('[Embedding Worker] Model load attempt ' + attempt + ' failed: ' + error.message);
            if (attempt < MODEL_LOAD_ATTEMPTS) {
                await delay(MODEL_RETRY_BACKOFF_MS[attempt - 1] || 2000);
            }
        }
    }
    throw lastError;
}

self.onmessage = async function (event) {
    const {type} = event.data;

    if (type === 'init') {
        try {
            const {pipeline, env} = await loadTransformers();

            env.allowLocalModels = false;

            console.log('[Embedding Worker] Creating feature-extraction pipeline...');
            embedder = await createEmbedder(pipeline);

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
