/**
 * Local embedding-based similarity service for the Q&A extension.
 *
 * Model: onnx-community/embeddinggemma-300m-ONNX (300M params, q8, wasm).
 * Loaded at runtime from cdn.jsdelivr.net/npm/@huggingface/transformers@3.
 * Cosine similarity is computed between an EmbeddingGemma query embedding
 * (prefixed per Gemma's training convention) and unprefixed candidate
 * embeddings.
 *
 * Architecture:
 *   Main thread          ↔  Worker (module worker via Blob URL)
 *   warmUp()             →  {type:'warmup'}  → loads pipeline
 *   getEmbedding(text)   →  {type:'embed', id, text}
 *                        ←  {type:'result', id, vec}  (or 'error')
 *   progress             ←  {type:'progress', progress}
 *   model ready          ←  {type:'ready'}
 *
 * The worker maintains its own serial queue so concurrent embed requests
 * from the main thread are processed one at a time (ONNX session is not
 * reentrant). From the main thread's view all requests are non-blocking.
 *
 * If Worker creation fails (old browser, strict CSP) the service falls back
 * to running the pipeline on the main thread.
 *
 * UI status is communicated via window custom events:
 *   embeddingservice:progress  {file, loaded, total, percent}
 *   embeddingservice:ready
 *   embeddingservice:working
 *   embeddingservice:idle
 */

/* eslint-disable no-console, func-style, jsdoc/require-returns, jsdoc/require-param-description, jsdoc/require-param-type, jsdoc/require-returns-description, @stylistic/max-len, no-use-before-define */

const CDN_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';
const MODEL_ID = 'onnx-community/embeddinggemma-300m-ONNX';
// EmbeddingGemma is trained for asymmetric retrieval: prefix the query, not the docs.
const QUERY_PREFIX = 'task: search result | query: ';
const LOG_PREFIX = '[QnA/Embed]';

// ---------------------------------------------------------------------------
// Worker source (ES module — runs natively in browser, not through Babel)
// ---------------------------------------------------------------------------

const WORKER_CODE =
    `import { pipeline, env } from '${CDN_URL}';\n` +
    `const MODEL_ID = '${MODEL_ID}';\n` +
    `env.allowRemoteModels = true;\n` +
    `\n` +
    `let _pipelinePromise = null;\n` +
    `const _cache = {};\n` +
    `// Serial queue — ONNX session is not reentrant\n` +
    `let _queue = Promise.resolve();\n` +
    `\n` +
    `function getPipeline() {\n` +
    `    if (_pipelinePromise) return _pipelinePromise;\n` +
    `    _pipelinePromise = pipeline('feature-extraction', MODEL_ID, {\n` +
    `        dtype: 'q8',\n` +
    `        device: 'wasm',\n` +
    `        progress_callback(p) { self.postMessage({type: 'progress', progress: p}); }\n` +
    `    }).then(pipe => {\n` +
    `        self.postMessage({type: 'ready'});\n` +
    `        return pipe;\n` +
    `    }).catch(err => {\n` +
    `        self.postMessage({type: 'pipelineError', message: String(err)});\n` +
    `        _pipelinePromise = null;\n` +
    `        throw err;\n` +
    `    });\n` +
    `    return _pipelinePromise;\n` +
    `}\n` +
    `\n` +
    `self.onmessage = function(e) {\n` +
    `    const {type, id, text} = e.data;\n` +
    `    if (type === 'warmup') { getPipeline(); return; }\n` +
    `    if (type !== 'embed') return;\n` +
    `    if (_cache[text]) {\n` +
    `        self.postMessage({type: 'result', id, vec: _cache[text]});\n` +
    `        return;\n` +
    `    }\n` +
    `    _queue = _queue.then(() =>\n` +
    `        getPipeline()\n` +
    `            .then(pipe => pipe(text, {pooling: 'mean', normalize: true}))\n` +
    `            .then(output => {\n` +
    `                const vec = Array.from(output.data);\n` +
    `                _cache[text] = vec;\n` +
    `                self.postMessage({type: 'result', id, vec});\n` +
    `            })\n` +
    `            .catch(err => self.postMessage({type: 'error', id, message: String(err)}))\n` +
    `    );\n` +
    `};\n`;

// ---------------------------------------------------------------------------
// Window event helpers
// ---------------------------------------------------------------------------

/**
 *
 * @param name
 * @param detail
 */
function _dispatch (name, detail) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(name, {detail: detail || null}));
}

// ---------------------------------------------------------------------------
// Worker management
// ---------------------------------------------------------------------------

let _worker = null;
let _workerFailed = false;
const _pending = {}; // requestId → {resolve, reject}
let _nextId = 0;

/**
 *
 * @param e
 */
function _handleWorkerMessage (e) {
    const data = e.data;
    const p = data.progress;

    if (data.type === 'progress' && p) {
        if (p.status === 'downloading') {
            const pct = p.total ? Math.round(100 * p.loaded / p.total) : null;
            _dispatch('embeddingservice:progress', {
                file: p.file, loaded: p.loaded, total: p.total, percent: pct
            });
            console.log(LOG_PREFIX, 'Download:', p.file || '', pct === null ? '' : `${pct}%`);
        } else {
            console.log(LOG_PREFIX, 'Pipeline status:', p.status, p.file || '');
        }

    } else if (data.type === 'ready') {
        console.log(LOG_PREFIX, 'Worker pipeline ready');
        _dispatch('embeddingservice:ready');

    } else if (data.type === 'pipelineError') {
        console.error(LOG_PREFIX, 'Worker pipeline error:', data.message);

    } else if (data.type === 'result') {
        const entry = _pending[data.id];
        if (entry) {
            delete _pending[data.id];
            entry.resolve(data.vec);
        }

    } else if (data.type === 'error') {
        const errEntry = _pending[data.id];
        if (errEntry) {
            delete _pending[data.id];
            errEntry.reject(new Error(data.message));
        }
    }
}

/**
 *
 */
function _getWorker () {
    if (_worker) return _worker;
    if (_workerFailed) return null;
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
        _workerFailed = true;
        return null;
    }
    try {
        const blob = new Blob([WORKER_CODE], {type: 'text/javascript'});
        const url = URL.createObjectURL(blob);
        _worker = new Worker(url, {type: 'module'});
        _worker.onmessage = _handleWorkerMessage;
        _worker.onerror = function (e) {
            console.error(LOG_PREFIX, 'Worker error:', e.message);
            _workerFailed = true;
            // Reject any pending requests
            Object.keys(_pending).forEach(id => {
                _pending[id].reject(new Error(`Worker failed: ${e.message}`));
                delete _pending[id];
            });
        };
        console.log(LOG_PREFIX, 'Worker created');
        return _worker;
    } catch (e) {
        console.warn(LOG_PREFIX, 'Worker creation failed, falling back to main thread:', e);
        _workerFailed = true;
        return null;
    }
}

// ---------------------------------------------------------------------------
// Main-thread fallback pipeline (used when worker is unavailable)
// ---------------------------------------------------------------------------

// Prevents webpack from statically analyzing this import() call
const _cdnImport = new Function('url', 'return import(url)');
let _fallbackPipelinePromise = null;
let _fallbackQueue = Promise.resolve();

/**
 *
 */
function _getFallbackPipeline () {
    if (_fallbackPipelinePromise) return _fallbackPipelinePromise;
    const t0 = Date.now();
    _fallbackPipelinePromise = _cdnImport(CDN_URL)
        .then(mod => {
            mod.env.allowRemoteModels = true;
            return mod.pipeline('feature-extraction', MODEL_ID, {
                dtype: 'q8',
                device: 'wasm',
                progress_callback: function (p) {
                    if (p.status === 'downloading') {
                        const pct = p.total ? Math.round(100 * p.loaded / p.total) : null;
                        _dispatch('embeddingservice:progress', {file: p.file, loaded: p.loaded, total: p.total, percent: pct});
                    }
                }
            });
        })
        .then(pipe => {
            console.log(LOG_PREFIX, 'Fallback pipeline ready in', Date.now() - t0, 'ms');
            _dispatch('embeddingservice:ready');
            return pipe;
        })
        .catch(err => {
            _fallbackPipelinePromise = null;
            throw err;
        });
    return _fallbackPipelinePromise;
}

/**
 *
 * @param text
 */
function _getEmbeddingMainThread (text) {
    _fallbackQueue = _fallbackQueue.then(() => _getFallbackPipeline()
        .then(pipe => pipe(text, {pooling: 'mean', normalize: true}))
        .then(output => {
            const vec = Array.from(output.data);
            _embeddingCache[text] = vec;
            return vec;
        }));
    const step = _fallbackQueue;
    return step.then(() => _embeddingCache[text]);
}

// ---------------------------------------------------------------------------
// Embedding + cache
// ---------------------------------------------------------------------------

const _embeddingCache = {};

/**
 *
 * @param text
 */
function getEmbedding (text) {
    if (_embeddingCache[text]) {
        return Promise.resolve(_embeddingCache[text]);
    }
    const worker = _getWorker();
    if (!worker) {
        return _getEmbeddingMainThread(text);
    }
    const id = _nextId++;
    return new Promise((resolve, reject) => {
        _pending[id] = {resolve: resolve, reject: reject};
        worker.postMessage({type: 'embed', id: id, text: text});
    }).then(vec => {
        _embeddingCache[text] = vec;
        return vec;
    });
}

// Normalized vectors: cosine similarity = dot product
/**
 *
 * @param a
 * @param b
 */
function cosineSimilarity (a, b) {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the element of `candidates` most semantically similar to `input`.
 * The query is prefixed per EmbeddingGemma's training convention; candidates
 * are embedded unprefixed.
 * @param {string} input
 * @param {string[]} candidates - non-empty
 * @returns {Promise<string>}
 */
function findMostSimilar (input, candidates) {
    console.log(LOG_PREFIX, `findMostSimilar("${input}", [${candidates.length} items])`);
    _dispatch('embeddingservice:working');
    const t0 = Date.now();

    return getEmbedding(QUERY_PREFIX + input).then(inputVec => Promise.all(candidates.map(c => getEmbedding(c).then(vec => ({candidate: c, score: cosineSimilarity(inputVec, vec)})))))
        .then(scored => {
            scored.sort((a, b) => b.score - a.score);
            const top3 = scored.slice(0, 3).map(s => `"${s.candidate}" (${s.score.toFixed(3)})`);
            console.log(LOG_PREFIX, 'Result in', Date.now() - t0, 'ms. Top matches:', top3.join(', '));
            _dispatch('embeddingservice:idle');
            return scored[0].candidate;
        })
        .catch(err => {
            _dispatch('embeddingservice:idle');
            throw err;
        });
}

/**
 * Begin downloading/warming the model so the first block run is faster.
 */
function warmUp () {
    console.log(LOG_PREFIX, 'warmUp() called');
    const worker = _getWorker();
    if (worker) {
        worker.postMessage({type: 'warmup'});
    } else {
        _getFallbackPipeline().catch(err => {
            console.error(LOG_PREFIX, 'Fallback warm-up failed:', err);
        });
    }
}

module.exports = {findMostSimilar: findMostSimilar, warmUp: warmUp};
