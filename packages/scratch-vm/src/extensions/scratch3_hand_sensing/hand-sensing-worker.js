/**
 * Web worker that runs hand landmark inference off the main thread. Built as
 * its own scratch-vm bundle and loaded by the hand sensing extension through
 * hand-detectors.js, which defines the messages exchanged here:
 *
 * - in:  {type: 'init', assetSets}            create the landmarker
 *   out: {type: 'ready', delegate, wasmRoot, renderer}
 *        {type: 'init-error', message, webgl2, offscreenCanvas, renderer}
 * - in:  {type: 'detect', bitmap, timestamp}  find the hands in one frame
 *   out: {type: 'result', timestamp, hands, inferenceMs}
 *        {type: 'detect-error', timestamp, message}
 */

const {createHandLandmarker, describeRenderer, isSoftwareRenderer, translateResult} = require('./hand-landmarker');

/**
 * The landmarker, once 'init' has created it.
 * @type {?HandLandmarker}
 */
let landmarker = null;

/**
 * @param {Error|string} error - whatever was thrown
 * @returns {string} its message
 */
const messageOf = error => (error && error.message) || String(error);

/**
 * Check that MediaPipe can draw here. It uploads every frame as a WebGL
 * texture, with either delegate, on a canvas it creates itself, which in a
 * worker has to be an OffscreenCanvas with a WebGL2 context.
 * @returns {{webgl2: boolean, offscreenCanvas: boolean, renderer: string}} what is available
 */
const probeGraphics = () => {
    if (typeof OffscreenCanvas === 'undefined') {
        return {webgl2: false, offscreenCanvas: false, renderer: 'unavailable'};
    }
    const gl = new OffscreenCanvas(1, 1).getContext('webgl2');
    const renderer = describeRenderer(gl);
    if (gl) {
        const loseContext = gl.getExtension('WEBGL_lose_context');
        if (loseContext) loseContext.loseContext();
    }
    return {webgl2: Boolean(gl), offscreenCanvas: true, renderer};
};

/**
 * @param {Array.<AssetSet>} assetSets - where to load the landmarker from
 */
const init = assetSets => {
    const graphics = probeGraphics();
    if (!graphics.webgl2) {
        self.postMessage(Object.assign({
            type: 'init-error',
            message: `WebGL2 is unavailable in the worker (OffscreenCanvas: ${graphics.offscreenCanvas})`
        }, graphics));
        return;
    }
    createHandLandmarker(assetSets, {preferCpu: isSoftwareRenderer(graphics.renderer)})
        .then(created => {
            landmarker = created.landmarker;
            self.postMessage({
                type: 'ready',
                delegate: created.delegate,
                wasmRoot: created.wasmRoot,
                renderer: graphics.renderer
            });
        })
        .catch(error => {
            self.postMessage(Object.assign({type: 'init-error', message: messageOf(error)}, graphics));
        });
};

/**
 * @param {ImageBitmap} bitmap - the frame, which is released afterwards
 * @param {number} timestamp - the frame's timestamp, strictly increasing
 */
const detect = (bitmap, timestamp) => {
    try {
        const start = performance.now();
        const result = landmarker.detectForVideo(bitmap, timestamp);
        const inferenceMs = performance.now() - start;
        self.postMessage({type: 'result', timestamp, hands: translateResult(result), inferenceMs});
    } catch (error) {
        self.postMessage({type: 'detect-error', timestamp, message: messageOf(error)});
    } finally {
        bitmap.close();
    }
};

self.onmessage = ({data}) => {
    if (data.type === 'init') {
        init(data.assetSets);
    } else if (data.type === 'detect') {
        detect(data.bitmap, data.timestamp);
    }
};
