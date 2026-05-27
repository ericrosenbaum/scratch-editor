/**
 * Local CLIP-based zero-shot image classification for the Stage Vision extension.
 *
 * Model: Xenova/clip-vit-base-patch32 (ONNX, q8, WASM). Loaded at runtime from
 * cdn.jsdelivr.net/npm/@huggingface/transformers@3. The `zero-shot-image-classification`
 * pipeline encodes the image and the candidate label strings, computes cosine
 * similarities, and returns sorted {label, score} entries (scores softmaxed and
 * summing to 1 across the candidates).
 *
 * Runs on the main thread. The Q&A extension's worker pattern is not used here
 * because CLIP image preprocessing wants a canvas/ImageBitmap, which can't be
 * cleanly transferred to a Blob-URL module worker. Inference is serialized via
 * a queue so concurrent block calls don't trample the ONNX session.
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

// Prevents webpack from statically analyzing this import() call.
const _cdnImport = new Function('url', 'return import(url)');

let _pipelinePromise = null;
let _queue = Promise.resolve();

const _dispatch = (name, detail) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(name, {detail: detail || null}));
};

const getPipeline = () => {
    if (_pipelinePromise) return _pipelinePromise;
    const t0 = Date.now();
    _pipelinePromise = _cdnImport(CDN_URL)
        .then(mod => {
            mod.env.allowRemoteModels = true;
            return mod.pipeline('zero-shot-image-classification', MODEL_ID, {
                dtype: 'q8',
                device: 'wasm',
                progress_callback: p => {
                    if (p && p.status === 'downloading') {
                        const pct = p.total ? Math.round((100 * p.loaded) / p.total) : null;
                        _dispatch('stagevision:progress', {
                            file: p.file, loaded: p.loaded, total: p.total, percent: pct
                        });
                        console.log(LOG_PREFIX, 'Download:', p.file || '', pct === null ? '' : `${pct}%`);
                    }
                }
            });
        })
        .then(pipe => {
            console.log(LOG_PREFIX, 'Pipeline ready in', Date.now() - t0, 'ms');
            _dispatch('stagevision:ready');
            return pipe;
        })
        .catch(err => {
            _pipelinePromise = null;
            throw err;
        });
    return _pipelinePromise;
};

const classify = (imageInput, labels) => {
    if (!labels || labels.length === 0) {
        return Promise.resolve({label: '', score: 0, all: []});
    }
    _dispatch('stagevision:working');
    const t0 = Date.now();
    _queue = _queue.then(() =>
        getPipeline().then(pipe => pipe(imageInput, labels))
    );
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
    getPipeline().catch(err => console.error(LOG_PREFIX, 'Warm-up failed:', err));
};

module.exports = {classify, warmUp};
