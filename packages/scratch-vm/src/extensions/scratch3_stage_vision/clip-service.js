/**
 * Local CLIP-based zero-shot image classification for the Stage Vision extension.
 *
 * Model: Xenova/clip-vit-base-patch32 (ONNX, q8, WASM). Loaded at runtime from
 * cdn.jsdelivr.net/npm/@huggingface/transformers@3.
 *
 * Uses the manual two-encoder path (CLIPTextModelWithProjection +
 * CLIPVisionModelWithProjection) instead of the high-level
 * `zero-shot-image-classification` pipeline. This lets us cache normalized
 * embeddings across calls:
 *   - text embeddings, keyed by the exact labels array — the curated label sets
 *     have 60–110 entries and re-encoding them every call dominates the cost.
 *   - the image embedding, keyed by the snapshot dataURL — running the vision
 *     encoder is the single most expensive step, so classifying the same frame
 *     against several labels (e.g. repeated `looksLike` checks) reuses it.
 * With both caches, repeat calls on a static stage become "dot product" only.
 *
 * Architecture:
 *   Main thread             ↔  Worker (module worker via Blob URL)
 *   warmUp()                →  {type:'warmup'}  → loads encoders
 *   classify(url, labels)   →  {type:'classify', id, imageDataURL, labels}
 *                           ←  {type:'result', id, results}  (or 'error')
 *   progress                ←  {type:'progress', progress}
 *   models ready            ←  {type:'ready'}
 *
 * Inference (text encode, vision encode, dot-product + softmax) runs entirely
 * inside the worker, so the main thread — VM, renderer, UI — is never blocked.
 * The worker keeps its own serial queue so concurrent block calls don't trample
 * the ONNX session. If Worker creation fails (old browser, strict CSP) the
 * service falls back to running the encoders on the main thread.
 *
 * UI status is communicated via window custom events:
 *   stagevision:progress  {file, loaded, total, percent}
 *   stagevision:ready
 *   stagevision:working
 *   stagevision:idle
 */

/* eslint-disable no-console */

const CDN_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';
const MODEL_ID = 'Xenova/clip-vit-base-patch32';
const LOG_PREFIX = '[StageVision/CLIP]';
// Standard CLIP softmax temperature. The model's learned logit_scale ≈ 100;
// hardcoding matches what the `zero-shot-image-classification` pipeline does
// internally and yields nicely peaked confidence scores.
const LOGIT_SCALE = 100;
// Cap on cached image embeddings (keyed by snapshot dataURL). A handful covers
// the "classify the same frame several ways" case without unbounded growth.
const IMAGE_CACHE_MAX = 8;

// ---------------------------------------------------------------------------
// Worker source (ES module — runs natively in the browser, not through Babel)
// ---------------------------------------------------------------------------

const WORKER_CODE = `
import {
    AutoTokenizer, AutoProcessor,
    CLIPTextModelWithProjection, CLIPVisionModelWithProjection,
    RawImage, env
} from '${CDN_URL}';

const MODEL_ID = '${MODEL_ID}';
const LOGIT_SCALE = ${LOGIT_SCALE};
const IMAGE_CACHE_MAX = ${IMAGE_CACHE_MAX};
env.allowRemoteModels = true;

let _modelsPromise = null;
// Normalized text embeddings keyed by JSON.stringify(labels).
const _labelCache = new Map();
// Normalized image embeddings keyed by snapshot dataURL.
const _imageCache = new Map();
// Serial queue — the ONNX session is not reentrant.
let _queue = Promise.resolve();

function loadModels (device, dtype) {
    const opts = {
        device, dtype,
        progress_callback (p) { self.postMessage({type: 'progress', progress: p}); }
    };
    return Promise.all([
        AutoTokenizer.from_pretrained(MODEL_ID),
        AutoProcessor.from_pretrained(MODEL_ID),
        CLIPTextModelWithProjection.from_pretrained(MODEL_ID, opts),
        CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, opts)
    ]).then(([tokenizer, processor, textModel, visionModel]) =>
        ({tokenizer, processor, textModel, visionModel}));
}

// Prefer WebGPU (fp16) when the adapter is present; fall back to WASM (q8) if
// the backend is unavailable or the model has no matching weights. The fp16
// weights are larger to download but the vision encoder runs far faster on GPU.
function modelCandidates () {
    const list = [];
    if (typeof navigator !== 'undefined' && navigator.gpu) {
        list.push({device: 'webgpu', dtype: 'fp16'});
    }
    list.push({device: 'wasm', dtype: 'q8'});
    return list;
}

function getModels () {
    if (_modelsPromise) return _modelsPromise;
    _modelsPromise = (async () => {
        const candidates = modelCandidates();
        let lastErr;
        for (let i = 0; i < candidates.length; i++) {
            const {device, dtype} = candidates[i];
            try {
                const models = await loadModels(device, dtype);
                self.postMessage({type: 'ready', device});
                return models;
            } catch (err) {
                lastErr = err;
                self.postMessage({type: 'loadFallback', device, message: String(err)});
            }
        }
        self.postMessage({type: 'pipelineError', message: String(lastErr)});
        _modelsPromise = null;
        throw lastErr;
    })();
    return _modelsPromise;
}

// L2-normalize rows of a Float32Array of shape [n, dim] in place.
function normalizeRows (arr, n, dim) {
    for (let i = 0; i < n; i++) {
        const base = i * dim;
        let s = 0;
        for (let j = 0; j < dim; j++) { const v = arr[base + j]; s += v * v; }
        if (s === 0) continue;
        const inv = 1 / Math.sqrt(s);
        for (let j = 0; j < dim; j++) arr[base + j] *= inv;
    }
}

function softmax (logits) {
    let max = -Infinity;
    for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
    const out = new Array(logits.length);
    let sum = 0;
    for (let i = 0; i < logits.length; i++) { const e = Math.exp(logits[i] - max); out[i] = e; sum += e; }
    for (let i = 0; i < logits.length; i++) out[i] /= sum;
    return out;
}

async function encodeLabels (labels) {
    const key = JSON.stringify(labels);
    const hit = _labelCache.get(key);
    if (hit) return hit;
    const {tokenizer, textModel} = await getModels();
    const inputs = tokenizer(labels, {padding: true, truncation: true});
    const out = await textModel(inputs);
    const dim = out.text_embeds.dims[1];
    const data = new Float32Array(out.text_embeds.data);
    normalizeRows(data, labels.length, dim);
    const entry = {data, dim, n: labels.length};
    _labelCache.set(key, entry);
    return entry;
}

async function encodeImage (dataURL) {
    const hit = _imageCache.get(dataURL);
    if (hit) return hit;
    const {processor, visionModel} = await getModels();
    const image = await RawImage.read(dataURL);
    const inputs = await processor(image);
    const out = await visionModel(inputs);
    const dim = out.image_embeds.dims[1];
    const data = new Float32Array(out.image_embeds.data);
    normalizeRows(data, 1, dim);
    const entry = {data, dim};
    _imageCache.set(dataURL, entry);
    if (_imageCache.size > IMAGE_CACHE_MAX) {
        _imageCache.delete(_imageCache.keys().next().value);
    }
    return entry;
}

function rank (labels, labelEntry, imageEntry) {
    const {data: lvec, dim, n} = labelEntry;
    const ivec = imageEntry.data;
    const logits = new Array(n);
    for (let i = 0; i < n; i++) {
        const base = i * dim;
        let s = 0;
        for (let j = 0; j < dim; j++) s += lvec[base + j] * ivec[j];
        logits[i] = s * LOGIT_SCALE;
    }
    const probs = softmax(logits);
    const results = labels.map((label, i) => ({label, score: probs[i]}));
    results.sort((a, b) => b.score - a.score);
    return results;
}

self.onmessage = function (e) {
    const {type, id, labels, imageDataURL} = e.data;
    if (type === 'warmup') { getModels(); return; }
    if (type !== 'classify') return;
    _queue = _queue.then(() =>
        Promise.all([encodeLabels(labels), encodeImage(imageDataURL)])
            .then(([labelEntry, imageEntry]) => {
                self.postMessage({type: 'result', id, results: rank(labels, labelEntry, imageEntry)});
            })
            .catch(err => self.postMessage({type: 'error', id, message: String(err)}))
    );
};
`;

// ---------------------------------------------------------------------------
// Window event helpers
// ---------------------------------------------------------------------------

const _dispatch = (name, detail) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(name, {detail: detail || null}));
};

const _forwardProgress = p => {
    if (p && p.status === 'downloading') {
        const pct = p.total ? Math.round((100 * p.loaded) / p.total) : null;
        _dispatch('stagevision:progress', {
            file: p.file, loaded: p.loaded, total: p.total, percent: pct
        });
        console.log(LOG_PREFIX, 'Download:', p.file || '', pct === null ? '' : `${pct}%`);
    }
};

// ---------------------------------------------------------------------------
// Worker management
// ---------------------------------------------------------------------------

let _worker = null;
let _workerFailed = false;
const _pending = {}; // requestId → {resolve, reject}
let _nextId = 0;

const _handleWorkerMessage = e => {
    const data = e.data;
    if (data.type === 'progress') {
        _forwardProgress(data.progress);

    } else if (data.type === 'ready') {
        console.log(LOG_PREFIX, 'Worker models ready on', data.device || 'wasm');
        _dispatch('stagevision:ready');

    } else if (data.type === 'loadFallback') {
        console.warn(LOG_PREFIX, `Model load on ${data.device} failed, trying next backend:`, data.message);

    } else if (data.type === 'pipelineError') {
        console.error(LOG_PREFIX, 'Worker model load error:', data.message);

    } else if (data.type === 'result') {
        const entry = _pending[data.id];
        if (entry) {
            delete _pending[data.id];
            entry.resolve(data.results);
        }

    } else if (data.type === 'error') {
        const errEntry = _pending[data.id];
        if (errEntry) {
            delete _pending[data.id];
            errEntry.reject(new Error(data.message));
        }
    }
};

const _getWorker = () => {
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
        _worker.onerror = ev => {
            console.error(LOG_PREFIX, 'Worker error:', ev.message);
            _workerFailed = true;
            Object.keys(_pending).forEach(id => {
                _pending[id].reject(new Error(`Worker failed: ${ev.message}`));
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
};

// ---------------------------------------------------------------------------
// Main-thread fallback (used when a Worker can't be created)
// ---------------------------------------------------------------------------

// Prevents webpack from statically analyzing this import() call.
const _cdnImport = new Function('url', 'return import(url)');

let _fbModulePromise = null;
let _fbModelsPromise = null;
const _fbLabelCache = new Map();
const _fbImageCache = new Map();
let _fbQueue = Promise.resolve();

const _normalizeRows = (arr, n, dim) => {
    for (let i = 0; i < n; i++) {
        const base = i * dim;
        let s = 0;
        for (let j = 0; j < dim; j++) {
            const v = arr[base + j];
            s += v * v;
        }
        if (s === 0) continue;
        const inv = 1 / Math.sqrt(s);
        for (let j = 0; j < dim; j++) arr[base + j] *= inv;
    }
};

const _softmax = logits => {
    let max = -Infinity;
    for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
    const out = new Array(logits.length);
    let sum = 0;
    for (let i = 0; i < logits.length; i++) {
        const e = Math.exp(logits[i] - max);
        out[i] = e;
        sum += e;
    }
    for (let i = 0; i < logits.length; i++) out[i] /= sum;
    return out;
};

// Mirror the worker's WebGPU-then-WASM cascade on the main thread.
const _fbCandidates = () => {
    const list = [];
    if (typeof navigator !== 'undefined' && navigator.gpu) {
        list.push({device: 'webgpu', dtype: 'fp16'});
    }
    list.push({device: 'wasm', dtype: 'q8'});
    return list;
};

const _fbLoadModels = (mod, device, dtype) => {
    const opts = {device, dtype, progress_callback: _forwardProgress};
    return Promise.all([
        mod.AutoTokenizer.from_pretrained(MODEL_ID),
        mod.AutoProcessor.from_pretrained(MODEL_ID),
        mod.CLIPTextModelWithProjection.from_pretrained(MODEL_ID, opts),
        mod.CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, opts)
    ]).then(([tokenizer, processor, textModel, visionModel]) => ({
        mod, tokenizer, processor, textModel, visionModel
    }));
};

const _fbGetModels = () => {
    if (_fbModelsPromise) return _fbModelsPromise;
    const t0 = Date.now();
    if (!_fbModulePromise) {
        _fbModulePromise = _cdnImport(CDN_URL).then(mod => {
            mod.env.allowRemoteModels = true;
            return mod;
        });
    }
    _fbModelsPromise = _fbModulePromise
        .then(async mod => {
            const candidates = _fbCandidates();
            let lastErr;
            for (let i = 0; i < candidates.length; i++) {
                const {device, dtype} = candidates[i];
                try {
                    const bundle = await _fbLoadModels(mod, device, dtype);
                    console.log(LOG_PREFIX, `Fallback models ready on ${device} in ${Date.now() - t0}ms`);
                    _dispatch('stagevision:ready');
                    return bundle;
                } catch (err) {
                    lastErr = err;
                    console.warn(LOG_PREFIX, `Fallback load on ${device} failed, trying next backend:`, err);
                }
            }
            throw lastErr;
        })
        .catch(err => {
            _fbModelsPromise = null;
            throw err;
        });
    return _fbModelsPromise;
};

const _fbEncodeLabels = async labels => {
    const key = JSON.stringify(labels);
    const hit = _fbLabelCache.get(key);
    if (hit) return hit;
    const {tokenizer, textModel} = await _fbGetModels();
    const inputs = tokenizer(labels, {padding: true, truncation: true});
    const out = await textModel(inputs);
    const dim = out.text_embeds.dims[1];
    const data = new Float32Array(out.text_embeds.data);
    _normalizeRows(data, labels.length, dim);
    const entry = {data, dim, n: labels.length};
    _fbLabelCache.set(key, entry);
    return entry;
};

const _fbEncodeImage = async dataURL => {
    const hit = _fbImageCache.get(dataURL);
    if (hit) return hit;
    const {mod, processor, visionModel} = await _fbGetModels();
    const image = await mod.RawImage.read(dataURL);
    const inputs = await processor(image);
    const out = await visionModel(inputs);
    const dim = out.image_embeds.dims[1];
    const data = new Float32Array(out.image_embeds.data);
    _normalizeRows(data, 1, dim);
    const entry = {data, dim};
    _fbImageCache.set(dataURL, entry);
    if (_fbImageCache.size > IMAGE_CACHE_MAX) {
        _fbImageCache.delete(_fbImageCache.keys().next().value);
    }
    return entry;
};

const _classifyMainThread = (imageDataURL, labels) => {
    _fbQueue = _fbQueue.then(async () => {
        const [labelEntry, imageEntry] = await Promise.all([
            _fbEncodeLabels(labels),
            _fbEncodeImage(imageDataURL)
        ]);
        const {data: lvec, dim, n} = labelEntry;
        const ivec = imageEntry.data;
        const logits = new Array(n);
        for (let i = 0; i < n; i++) {
            const base = i * dim;
            let s = 0;
            for (let j = 0; j < dim; j++) s += lvec[base + j] * ivec[j];
            logits[i] = s * LOGIT_SCALE;
        }
        const probs = _softmax(logits);
        const results = labels.map((label, i) => ({label, score: probs[i]}));
        results.sort((a, b) => b.score - a.score);
        return results;
    });
    return _fbQueue;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const _toResult = (out, labels, t0) => {
    console.log(LOG_PREFIX, `classify(${labels.length} labels) in ${Date.now() - t0}ms ->`,
        out.slice(0, 3).map(r => `"${r.label}" ${r.score.toFixed(3)}`)
            .join(', '));
    _dispatch('stagevision:idle');
    return {label: out[0].label, score: out[0].score, all: out};
};

const classify = (imageDataURL, labels) => {
    if (!labels || labels.length === 0) {
        return Promise.resolve({label: '', score: 0, all: []});
    }
    _dispatch('stagevision:working');
    const t0 = Date.now();

    const worker = _getWorker();
    const compute = worker ?
        new Promise((resolve, reject) => {
            const id = _nextId++;
            _pending[id] = {resolve, reject};
            worker.postMessage({type: 'classify', id, imageDataURL, labels});
        }) :
        _classifyMainThread(imageDataURL, labels);

    return compute
        .then(out => _toResult(out, labels, t0))
        .catch(err => {
            _dispatch('stagevision:idle');
            throw err;
        });
};

const warmUp = () => {
    console.log(LOG_PREFIX, 'warmUp() called');
    const worker = _getWorker();
    if (worker) {
        worker.postMessage({type: 'warmup'});
    } else {
        _fbGetModels().catch(err => console.error(LOG_PREFIX, 'Warm-up failed:', err));
    }
};

module.exports = {classify, warmUp};
