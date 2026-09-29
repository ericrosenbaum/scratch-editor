/**
 * The MediaPipe hand landmarker behind the hand sensing extension: creating
 * it from a set of assets, and turning what it reports into the hand objects
 * the blocks read.
 */

const {FilesetResolver, HandLandmarker} = require('@mediapipe/tasks-vision');

/**
 * Dimensions the video stream is analyzed at after it's rendered to the
 * sample canvas. The same as the stage, so keypoints map onto it directly.
 * @type {Array.<number>}
 */
const DIMENSIONS = [480, 360];

/**
 * Names of the 21 hand landmarks, in the order the model reports them.
 * @readonly
 * @type {Array.<string>}
 */
const KEYPOINT_NAMES = [
    'wrist',
    'thumb_cmc',
    'thumb_mcp',
    'thumb_ip',
    'thumb_tip',
    'index_finger_mcp',
    'index_finger_pip',
    'index_finger_dip',
    'index_finger_tip',
    'middle_finger_mcp',
    'middle_finger_pip',
    'middle_finger_dip',
    'middle_finger_tip',
    'ring_finger_mcp',
    'ring_finger_pip',
    'ring_finger_dip',
    'ring_finger_tip',
    'pinky_finger_mcp',
    'pinky_finger_pip',
    'pinky_finger_dip',
    'pinky_finger_tip'
];

/**
 * @typedef {object} AssetSet - where to load the landmarker from
 * @property {string} wasmRoot - directory holding the tasks-vision WASM runtime
 * @property {string} modelPath - URL of the hand landmarker model bundle
 */

/**
 * Create the hand landmarker, trying each set of assets in turn until one
 * loads. Within a set the GPU delegate is tried first and the CPU delegate
 * second, since on most devices the GPU is faster; a caller that knows better
 * (a software-emulated GPU, say) can ask for the reverse. Rejects with the
 * last failure if nothing works.
 * @param {Array.<AssetSet>} assetSets - asset locations, most preferred first
 * @param {object} [options] - creation options
 * @param {boolean} [options.preferCpu] - try the CPU delegate before the GPU one
 * @returns {Promise.<{landmarker: HandLandmarker, delegate: string, wasmRoot: string}>}
 *     the created landmarker, the delegate it runs on, and the assets it loaded from
 */
const createHandLandmarker = (assetSets, {preferCpu = false} = {}) => {
    const delegates = preferCpu ? ['CPU', 'GPU'] : ['GPU', 'CPU'];

    const createWith = ({wasmRoot, modelPath}) => FilesetResolver.forVisionTasks(wasmRoot)
        .then(fileset => {
            const createFor = index => HandLandmarker.createFromOptions(fileset, {
                baseOptions: {modelAssetPath: modelPath, delegate: delegates[index]},
                runningMode: 'VIDEO',
                numHands: 2
            })
                .then(landmarker => ({landmarker, delegate: delegates[index], wasmRoot}))
                .catch(error => (
                    index + 1 < delegates.length ? createFor(index + 1) : Promise.reject(error)
                ));
            return createFor(0);
        });

    return assetSets.reduce(
        (attempt, assetSet) => attempt.catch(() => createWith(assetSet)),
        Promise.reject(new Error('no hand landmarker assets to load'))
    );
};

/**
 * Renderer strings of GPUs emulated in software. Shader emulation is never
 * faster than the CPU delegate on the same processor, so on these the CPU
 * delegate is the right choice rather than a fallback. Headless Chromium
 * reports SwiftShader.
 * @type {RegExp}
 */
const SOFTWARE_RENDERER = /SwiftShader|llvmpipe|softpipe|Software|Microsoft Basic Render/i;

/**
 * Whether a renderer string (see describeRenderer) names a software GPU.
 * @param {?string} renderer - the renderer string
 * @returns {boolean} true for a software renderer
 */
const isSoftwareRenderer = renderer => SOFTWARE_RENDERER.test(renderer || '');

/**
 * Describe the GPU a WebGL context draws with, for diagnostics.
 * @param {?WebGLRenderingContext} gl - the context, or null if none could be made
 * @returns {string} the renderer string, or 'unavailable'
 */
const describeRenderer = gl => {
    if (!gl) return 'unavailable';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = (debugInfo && gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) ||
        gl.getParameter(gl.RENDERER);
    return renderer ? String(renderer) : 'unavailable';
};

/**
 * The user's own hand for each handedness label the model reports. The
 * landmarker labels a hand by its shape in the image it is given, and the
 * frames the extension analyzes are mirrored (selfie view), which gives the
 * user's right hand the shape of a left one. Swapping the labels back names
 * the hand the user knows they are holding up.
 * @readonly
 */
const USER_HANDEDNESS = {
    Left: 'Right',
    Right: 'Left'
};

/**
 * Convert a HandLandmarker result into the hand objects the blocks read:
 * keypoints in sample-canvas pixels, named by landmark, plus the user's own
 * handedness, which the left/right blocks route on.
 * @param {object} result - the landmarks and handedness of one inference
 * @returns {Array.<object>} the detected hands
 */
const translateResult = result => {
    const [width, height] = DIMENSIONS;
    return result.landmarks.map((landmarks, handIndex) => ({
        keypoints: landmarks.map((landmark, keypointIndex) => ({
            x: landmark.x * width,
            y: landmark.y * height,
            name: KEYPOINT_NAMES[keypointIndex]
        })),
        handedness: USER_HANDEDNESS[result.handedness[handIndex][0].categoryName]
    }));
};

module.exports = {
    DIMENSIONS,
    KEYPOINT_NAMES,
    createHandLandmarker,
    describeRenderer,
    isSoftwareRenderer,
    translateResult
};
