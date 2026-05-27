/**
 * Local CLIP-based zero-shot image classification for the Stage Vision extension.
 *
 * Model: Xenova/clip-vit-base-patch32 (ONNX, q8, WASM). Loaded at runtime from
 * cdn.jsdelivr.net/npm/@huggingface/transformers@3.
 *
 * Uses the manual two-encoder path (CLIPTextModelWithProjection +
 * CLIPVisionModelWithProjection) instead of the high-level
 * `zero-shot-image-classification` pipeline. This lets us cache normalized text
 * embeddings per label-set across calls — the curated label sets have 60–110
 * entries, and re-encoding them on every block call dominates the cost.
 * With caching, repeat calls become "encode 1 image + dot product" only.
 *
 * Runs on the main thread. Inference is serialized via a queue so concurrent
 * block calls don't trample the ONNX session.
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

// Prevents webpack from statically analyzing this import() call.
const _cdnImport = new Function('url', 'return import(url)');

let _modulePromise = null;
let _modelsPromise = null;
// Cache normalized text embeddings keyed by the exact labels array.
// value: {data: Float32Array (n*dim), dim: number, n: number}
const _labelCache = new Map();
let _queue = Promise.resolve();

const _dispatch = (name, detail) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(name, {detail: detail || null}));
};

const _progressCallback = p => {
    if (p && p.status === 'downloading') {
        const pct = p.total ? Math.round((100 * p.loaded) / p.total) : null;
        _dispatch('stagevision:progress', {
            file: p.file, loaded: p.loaded, total: p.total, percent: pct
        });
        console.log(LOG_PREFIX, 'Download:', p.file || '', pct === null ? '' : `${pct}%`);
    }
};

const getModule = () => {
    if (_modulePromise) return _modulePromise;
    _modulePromise = _cdnImport(CDN_URL).then(mod => {
        mod.env.allowRemoteModels = true;
        return mod;
    });
    return _modulePromise;
};

const getModels = () => {
    if (_modelsPromise) return _modelsPromise;
    const t0 = Date.now();
    _modelsPromise = getModule()
        .then(mod => {
            const opts = {dtype: 'q8', device: 'wasm', progress_callback: _progressCallback};
            return Promise.all([
                mod.AutoTokenizer.from_pretrained(MODEL_ID),
                mod.AutoProcessor.from_pretrained(MODEL_ID),
                mod.CLIPTextModelWithProjection.from_pretrained(MODEL_ID, opts),
                mod.CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, opts)
            ]).then(([tokenizer, processor, textModel, visionModel]) => ({
                mod, tokenizer, processor, textModel, visionModel
            }));
        })
        .then(bundle => {
            console.log(LOG_PREFIX, 'Models ready in', Date.now() - t0, 'ms');
            _dispatch('stagevision:ready');
            return bundle;
        })
        .catch(err => {
            _modelsPromise = null;
            throw err;
        });
    return _modelsPromise;
};

// L2-normalize rows of a Float32Array of shape [n, dim] in place.
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

const _encodeLabels = async labels => {
    const key = labels.join('\x1f');
    const hit = _labelCache.get(key);
    if (hit) return hit;
    const {tokenizer, textModel} = await getModels();
    const t0 = Date.now();
    const inputs = tokenizer(labels, {padding: true, truncation: true});
    const out = await textModel(inputs);
    const dim = out.text_embeds.dims[1];
    // Copy out of the model's output buffer so we own the memory.
    const data = new Float32Array(out.text_embeds.data);
    _normalizeRows(data, labels.length, dim);
    const entry = {data, dim, n: labels.length};
    _labelCache.set(key, entry);
    console.log(LOG_PREFIX, `encoded ${labels.length} labels in ${Date.now() - t0}ms (cached as new entry)`);
    return entry;
};

const _encodeImage = async dataURL => {
    const {mod, processor, visionModel} = await getModels();
    const image = await mod.RawImage.read(dataURL);
    const inputs = await processor(image);
    const out = await visionModel(inputs);
    const dim = out.image_embeds.dims[1];
    const data = new Float32Array(out.image_embeds.data);
    _normalizeRows(data, 1, dim);
    return {data, dim};
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

const classify = (imageDataURL, labels) => {
    if (!labels || labels.length === 0) {
        return Promise.resolve({label: '', score: 0, all: []});
    }
    _dispatch('stagevision:working');
    const t0 = Date.now();
    _queue = _queue.then(async () => {
        const [labelEntry, imageEntry] = await Promise.all([
            _encodeLabels(labels),
            _encodeImage(imageDataURL)
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
    const step = _queue;
    return step
        .then(out => {
            console.log(LOG_PREFIX, `classify(${labels.length} labels) in ${Date.now() - t0}ms ->`,
                out.slice(0, 3).map(r => `"${r.label}" ${r.score.toFixed(3)}`)
                    .join(', '));
            _dispatch('stagevision:idle');
            return {label: out[0].label, score: out[0].score, all: out};
        })
        .catch(err => {
            _dispatch('stagevision:idle');
            throw err;
        });
};

const warmUp = () => {
    console.log(LOG_PREFIX, 'warmUp() called');
    getModels().catch(err => console.error(LOG_PREFIX, 'Warm-up failed:', err));
};

module.exports = {classify, warmUp};
