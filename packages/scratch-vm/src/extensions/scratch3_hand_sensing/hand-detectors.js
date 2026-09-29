/**
 * Two ways of running the hand landmarker behind one interface: in a web
 * worker, where inference stays off the main thread, or on the main thread
 * itself where no worker can run.
 * @typedef {object} HandDetector
 * @property {string} thread - 'worker' or 'main'
 * @property {string} delegate - 'GPU' or 'CPU'
 * @property {string} wasmRoot - directory the WASM runtime was loaded from
 * @property {string} renderer - the WebGL renderer inference draws with, or 'unavailable'
 * @property {function(HTMLCanvasElement, number): Promise.<{hands: Array.<object>, inferenceMs: number}>} detect -
 *     find the hands in a frame, stamped with a strictly increasing timestamp
 * @property {function(): void} terminate - release the landmarker and anything running it
 */

const {createHandLandmarker, describeRenderer, translateResult} = require('./hand-landmarker');

/**
 * How long a frame may go unanswered before the worker is presumed dead. A
 * worker that has lost its GL context or crashed never answers, and a
 * promise that never settles would stall detection for good.
 * @type {number}
 */
const DETECT_TIMEOUT_MS = 5000;

/**
 * How long the worker may take to become ready. First use downloads about
 * 20 MB of WASM runtime and model and compiles shaders, which on a low-end
 * Chromebook over a school network takes tens of seconds.
 * @type {number}
 */
const INIT_TIMEOUT_MS = 60000;

/**
 * An error the detector cannot recover from, as opposed to one bad frame.
 * @param {string} message - what went wrong
 * @returns {Error} the error, flagged fatal
 */
const fatalError = message => {
    const error = new Error(message);
    error.fatal = true;
    return error;
};

/**
 * Run the landmarker in a web worker. The worker is handed in already
 * constructed so callers decide how to load it (and tests can pass a fake).
 * @param {Worker} worker - a worker running hand-sensing-worker.js
 * @param {Array.<AssetSet>} assetSets - where the worker should load the landmarker from
 * @param {object} [options] - timing options
 * @param {number} [options.detectTimeoutMs] - watchdog for each frame, DETECT_TIMEOUT_MS by default
 * @param {number} [options.initTimeoutMs] - watchdog for startup, INIT_TIMEOUT_MS by default
 * @returns {Promise.<HandDetector>} the detector, once the worker is ready; rejects with a
 *     fatal error if the worker dies or never becomes ready, and a plain one if it reports
 *     that it cannot run inference
 */
const createWorkerDetector = (worker, assetSets, {
    detectTimeoutMs = DETECT_TIMEOUT_MS,
    initTimeoutMs = INIT_TIMEOUT_MS
} = {}) => new Promise((resolveReady, rejectReady) => {
    let ready = false;
    let pending = null;
    let initTimer = null;

    const failPending = error => {
        if (!pending) return;
        const {reject, timer} = pending;
        pending = null;
        clearTimeout(timer);
        reject(error);
    };

    const failStartup = error => {
        clearTimeout(initTimer);
        worker.terminate();
        rejectReady(error);
    };

    initTimer = setTimeout(
        () => failStartup(fatalError(`hand sensing worker was not ready after ${initTimeoutMs} ms`)),
        initTimeoutMs
    );

    const detector = {
        thread: 'worker',
        delegate: null,
        wasmRoot: null,
        renderer: null,
        detect: (canvas, timestamp) => {
            if (pending) {
                return Promise.reject(new Error('hand sensing worker: a frame is already in flight'));
            }
            return createImageBitmap(canvas).then(bitmap => new Promise((resolve, reject) => {
                const timer = setTimeout(
                    () => failPending(fatalError(`hand sensing worker did not answer within ${detectTimeoutMs} ms`)),
                    detectTimeoutMs
                );
                pending = {timestamp, resolve, reject, timer};
                worker.postMessage({type: 'detect', bitmap, timestamp}, [bitmap]);
            }));
        },
        terminate: () => {
            clearTimeout(initTimer);
            failPending(fatalError('hand sensing worker was terminated'));
            worker.terminate();
        }
    };

    worker.onmessage = ({data}) => {
        switch (data.type) {
        case 'ready':
            ready = true;
            clearTimeout(initTimer);
            detector.delegate = data.delegate;
            detector.wasmRoot = data.wasmRoot;
            detector.renderer = data.renderer;
            resolveReady(detector);
            break;
        case 'init-error':
            failStartup(new Error(`hand sensing worker cannot run inference: ${data.message}`));
            break;
        case 'result': {
            if (!pending || data.timestamp !== pending.timestamp) return;
            const {resolve, timer} = pending;
            pending = null;
            clearTimeout(timer);
            resolve({hands: data.hands, inferenceMs: data.inferenceMs});
            break;
        }
        case 'detect-error':
            failPending(new Error(data.message));
            break;
        default:
            break;
        }
    };

    worker.onerror = event => {
        const message = (event && event.message) || 'unknown error';
        const error = fatalError(`hand sensing worker failed: ${message}`);
        if (ready) {
            failPending(error);
        } else {
            failStartup(error);
        }
    };

    worker.postMessage({type: 'init', assetSets});
});

/**
 * Run the landmarker on the main thread. Each frame's inference blocks the
 * thread for as long as it takes.
 * @param {Array.<AssetSet>} assetSets - where to load the landmarker from
 * @returns {Promise.<HandDetector>} the detector, once the landmarker is ready
 */
const createMainThreadDetector = assetSets => createHandLandmarker(assetSets)
    .then(({landmarker, delegate, wasmRoot}) => ({
        thread: 'main',
        delegate,
        wasmRoot,
        renderer: describeRenderer(
            typeof document === 'undefined' ? null : document.createElement('canvas').getContext('webgl2')
        ),
        detect: (canvas, timestamp) => new Promise(resolve => {
            const start = performance.now();
            const result = landmarker.detectForVideo(canvas, timestamp);
            resolve({hands: translateResult(result), inferenceMs: performance.now() - start});
        }),
        terminate: () => landmarker.close()
    }));

module.exports = {
    DETECT_TIMEOUT_MS,
    INIT_TIMEOUT_MS,
    createMainThreadDetector,
    createWorkerDetector
};
