const {test} = require('tap');

const HandSensing = require('../../src/extensions/scratch3_hand_sensing/index.js');
const {
    toScratchCoords,
    getPalmScale,
    getPinchRatio,
    getPinchPoint,
    angleBetween,
    nextCaptureDelay,
    smoothInferenceMs
} = require('../../src/extensions/scratch3_hand_sensing/utils.js');
const {
    isSoftwareRenderer,
    translateResult
} = require('../../src/extensions/scratch3_hand_sensing/hand-landmarker.js');
const {createWorkerDetector} = require('../../src/extensions/scratch3_hand_sensing/hand-detectors.js');
const Runtime = require('../../src/engine/runtime');
const Sprite = require('../../src/sprites/sprite');

/**
 * Build a hand sensing extension attached to a runtime, bypassing the
 * constructor. The constructor starts MediaPipe hand detection, which only
 * loads on a web page or in a web worker, so it cannot run under node.
 * @param {Runtime} runtime - the runtime to attach the extension to
 * @returns {object} the extension instance
 */
const makeExtension = runtime => {
    const extension = Object.create(HandSensing.prototype);
    extension.runtime = runtime;
    extension._pinchDrags = {};
    extension._pinchState = {};
    extension._pinchHistory = {};
    extension._openState = {};
    extension._gestureMissingFrames = {};
    extension._allHands = [];
    extension._lastFrameTimestamp = 0;
    extension._consecutiveErrors = 0;
    extension._createdAt = Date.now();
    extension._fpsWindowStart = 0;
    extension._fpsWindowResults = 0;
    extension.stats = HandSensing.initialStats();
    extension._onTargetCreated = extension._onTargetCreated.bind(extension);
    runtime.on('targetWasCreated', extension._onTargetCreated);
    extension._onProjectStopAll = extension._onProjectStopAll.bind(extension);
    runtime.on('PROJECT_STOP_ALL', extension._onProjectStopAll);
    return extension;
};

/**
 * Build a sprite that pinching can grab: visible, and touching every point.
 * @param {Runtime} runtime - the runtime to add the sprite to
 * @returns {RenderedTarget} the sprite
 */
const makeGrabbableSprite = runtime => {
    const target = new Sprite(null, runtime).createClone();
    target.visible = true;
    target.isTouchingScratchPoint = () => true;
    runtime.targets = [target];
    return target;
};

/**
 * Read the pinch dragging flag out of a target's hand sensing state.
 * @param {RenderedTarget} target - the target to inspect
 * @returns {boolean|undefined} the flag, or undefined if the target has no state
 */
const pinchDragEnabled = target => {
    const state = target.getCustomState(HandSensing.STATE_KEY);
    return state && state.pinchDragEnabled;
};

/**
 * The clockwise turn, in degrees from 0 to 359, from one direction to another.
 * @param {number} from - the starting direction in degrees
 * @param {number} to - the ending direction in degrees
 * @returns {number} the turn
 */
const turn = (from, to) => (((to - from) % 360) + 360) % 360;

test('a clone inherits pinch dragging from its sprite', t => {
    const runtime = new Runtime();
    const extension = makeExtension(runtime);
    const original = new Sprite(null, runtime).createClone();

    extension.setPinchDrag({STATE: 'on'}, {target: original});
    const clone = original.makeClone();

    t.equal(pinchDragEnabled(clone), true);
    t.end();
});

test('a clone does not inherit pinch dragging that was turned off', t => {
    const runtime = new Runtime();
    const extension = makeExtension(runtime);
    const original = new Sprite(null, runtime).createClone();

    extension.setPinchDrag({STATE: 'on'}, {target: original});
    extension.setPinchDrag({STATE: 'off'}, {target: original});
    const clone = original.makeClone();

    t.notOk(pinchDragEnabled(clone));
    t.end();
});

test('a clone does not share pinch dragging state with its sprite', t => {
    const runtime = new Runtime();
    const extension = makeExtension(runtime);
    const original = new Sprite(null, runtime).createClone();

    extension.setPinchDrag({STATE: 'on'}, {target: original});
    const clone = original.makeClone();
    extension.setPinchDrag({STATE: 'off'}, {target: clone});

    t.equal(pinchDragEnabled(original), true);
    t.notOk(pinchDragEnabled(clone));
    t.end();
});

test('pinch drag picking reads the per-target state', t => {
    const runtime = new Runtime();
    const extension = makeExtension(runtime);
    const target = makeGrabbableSprite(runtime);

    t.equal(extension._pickTopSpriteAt(0, 0, new Set()), null);

    extension.setPinchDrag({STATE: 'on'}, {target: target});
    t.equal(extension._pickTopSpriteAt(0, 0, new Set()), target);
    t.end();
});

/**
 * Canonical open-hand landmarks in "palm units", where the palm is 1.0 long
 * (wrist to middle-finger MCP) and 0.82 wide (index MCP to pinky MCP) —
 * roughly the proportions of a real hand, at any size. Image space, so y
 * grows downward and the fingers point up the negative y axis. A right hand
 * with its palm to the camera in the mirrored selfie view, thumb to the left.
 * @type {object}
 */
const CANONICAL_HAND = {
    0: {x: 0, y: 0}, // wrist
    1: {x: -0.3, y: -0.25}, // thumb CMC
    2: {x: -0.55, y: -0.5}, // thumb MCP
    3: {x: -0.75, y: -0.7}, // thumb IP
    4: {x: -0.9, y: -0.85}, // thumb tip
    5: {x: -0.41, y: -0.9}, // index MCP
    6: {x: -0.45, y: -1.25}, // index PIP
    7: {x: -0.47, y: -1.45}, // index DIP
    8: {x: -0.41, y: -1.6}, // index tip
    9: {x: 0, y: -1}, // middle MCP
    10: {x: 0, y: -1.4}, // middle PIP
    11: {x: 0, y: -1.62}, // middle DIP
    12: {x: 0, y: -1.8}, // middle tip
    13: {x: 0.2, y: -0.95}, // ring MCP
    14: {x: 0.22, y: -1.32}, // ring PIP
    15: {x: 0.24, y: -1.52}, // ring DIP
    16: {x: 0.25, y: -1.68}, // ring tip
    17: {x: 0.41, y: -0.88}, // pinky MCP
    18: {x: 0.46, y: -1.15}, // pinky PIP
    19: {x: 0.5, y: -1.32}, // pinky DIP
    20: {x: 0.52, y: -1.45} // pinky tip
};

/**
 * The hand landmarker keypoint names, by landmark index.
 * @type {Array.<string>}
 */
const KEYPOINT_NAMES = [
    'wrist',
    'thumb_cmc', 'thumb_mcp', 'thumb_ip', 'thumb_tip',
    'index_finger_mcp', 'index_finger_pip', 'index_finger_dip', 'index_finger_tip',
    'middle_finger_mcp', 'middle_finger_pip', 'middle_finger_dip', 'middle_finger_tip',
    'ring_finger_mcp', 'ring_finger_pip', 'ring_finger_dip', 'ring_finger_tip',
    'pinky_finger_mcp', 'pinky_finger_pip', 'pinky_finger_dip', 'pinky_finger_tip'
];

/**
 * Landmark indices of each finger's [MCP, PIP, DIP, tip].
 * @type {object}
 */
const FINGERS = {
    index: [5, 6, 7, 8],
    middle: [9, 10, 11, 12],
    ring: [13, 14, 15, 16],
    pinky: [17, 18, 19, 20]
};

/**
 * Fold one finger of a canonical hand into a fist: the PIP knuckle stays out
 * a little way from the MCP while the DIP and tip fold back to it.
 * @param {object} points - canonical landmarks, modified in place
 * @param {string} finger - a key of FINGERS
 */
const curlFinger = (points, finger) => {
    const [mcpIndex, pipIndex, dipIndex, tipIndex] = FINGERS[finger];
    const mcp = points[mcpIndex];
    const tip = points[tipIndex];
    const length = Math.hypot(tip.x - mcp.x, tip.y - mcp.y);
    const dir = {x: (tip.x - mcp.x) / length, y: (tip.y - mcp.y) / length};
    const along = fraction => ({x: mcp.x + (dir.x * fraction), y: mcp.y + (dir.y * fraction)});
    points[pipIndex] = along(0.25);
    points[dipIndex] = along(0.1);
    points[tipIndex] = along(-0.05);
};

/**
 * Build a synthetic hand. The thumb tip is placed `gap` palm-units to the side
 * of the index tip, so the expected pinch ratio is exactly `gap` regardless of
 * how the hand is scaled, moved, or turned in the image plane. Fingers named in
 * `curled` are folded into a fist; the rest are straight.
 * @param {object} [options] - hand options
 * @param {number} [options.gap] - thumb-to-index distance, in palm units
 * @param {Array.<string>} [options.curled] - fingers to curl, keys of FINGERS
 * @param {number} [options.scale] - palm length in pixels
 * @param {number} [options.x] - wrist x position in pixels
 * @param {number} [options.y] - wrist y position in pixels
 * @param {number} [options.rotation] - in-plane rotation in radians
 * @param {boolean} [options.backOfHand] - mirror the hand so its back faces the camera
 * @param {string} [options.handedness] - the handedness label
 * @returns {object} a hand object shaped like a detector result
 */
const makeHand = ({
    gap = 0.25, curled = [], scale = 120, x = 240, y = 180, rotation = 0, backOfHand = false, handedness = 'Right'
} = {}) => {
    const points = Object.assign({}, CANONICAL_HAND);
    for (const finger of curled) curlFinger(points, finger);
    points[4] = {x: CANONICAL_HAND[8].x + gap, y: CANONICAL_HAND[8].y}; // thumb tip
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const flip = backOfHand ? -1 : 1;
    const keypoints = [];
    for (let i = 0; i < 21; i++) {
        const point = points[i];
        const px = point.x * flip;
        keypoints.push({
            x: (scale * ((px * cos) - (point.y * sin))) + x,
            y: (scale * ((px * sin) + (point.y * cos))) + y,
            name: KEYPOINT_NAMES[i]
        });
    }
    return {keypoints, handedness};
};

const ALL_FINGERS = Object.keys(FINGERS);

/**
 * Run a sequence of hands through the gesture state machine, one per frame.
 * @param {object} extension - the extension instance
 * @param {Array.<object>} frames - one hand (or null for "no hand") per frame
 */
const runGestureFrames = (extension, frames) => {
    for (const hand of frames) {
        extension._allHands = hand ? [hand] : [];
        extension._updateGestureStates();
    }
};

/**
 * Read both gesture booleans for one hand choice.
 * @param {object} extension - the extension instance
 * @param {string} [choice] - the HAND menu choice
 * @returns {{open: boolean, closed: boolean}} the two reporter values
 */
const readGesture = (extension, choice = 'right') => ({
    open: extension.gestureDetected({GESTURE: 'open', HAND: choice}),
    closed: extension.gestureDetected({GESTURE: 'closed', HAND: choice})
});

/**
 * Run a sequence of hands through the pinch state machine, one per frame.
 * @param {object} extension - the extension instance
 * @param {Array.<object>} frames - one hand (or null for "no hand") per frame
 * @returns {boolean} the pinch state after the last frame
 */
const runFrames = (extension, frames) => {
    for (const hand of frames) {
        extension._allHands = hand ? [hand] : [];
        extension._updatePinchStates();
    }
    return extension._pinchState.Right === true;
};

/**
 * Run a sequence of hands through the pinch state machine and the drag loop
 * together, in the order the detection loop runs them.
 * @param {object} extension - the extension instance
 * @param {Array.<object>} frames - one hand (or null for "no hand") per frame
 */
const runDragFrames = (extension, frames) => {
    for (const hand of frames) {
        extension._allHands = hand ? [hand] : [];
        extension._updatePinchStates();
        extension._updatePinchDrags();
    }
};

test('pinch detection does not depend on how big the hand is', t => {
    const extension = makeExtension(new Runtime());

    // A small hand (a child's, or an adult's far from the camera) held open.
    // The raw pixel gap here is 33px, under the old 40px threshold.
    t.notOk(extension._isHandTightlyPinching(makeHand({scale: 60, gap: 0.55})),
        'an open small hand is not pinching');

    // A large hand (an adult's, close to the camera) with the fingers nearly
    // touching. The raw pixel gap here is 50px, over the old 40px threshold.
    t.ok(extension._isHandTightlyPinching(makeHand({scale: 200, gap: 0.25})),
        'a closed large hand is pinching');

    t.end();
});

test('pinch detection does not depend on where the hand is, or how it is turned', t => {
    const extension = makeExtension(new Runtime());
    const closed = {gap: 0.25};
    const open = {gap: 0.55};

    for (const rotation of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
        for (const position of [{x: 60, y: 60}, {x: 240, y: 180}, {x: 420, y: 300}]) {
            const where = `at (${position.x}, ${position.y}) turned ${rotation.toFixed(2)}rad`;
            t.ok(extension._isHandTightlyPinching(makeHand(Object.assign({rotation}, position, closed))),
                `a closed hand is pinching ${where}`);
            t.notOk(extension._isHandTightlyPinching(makeHand(Object.assign({rotation}, position, open))),
                `an open hand is not pinching ${where}`);
        }
    }

    t.end();
});

test('palm scale follows the longer palm axis, whatever the hand size', t => {
    // The palm is longer (1.0) than it is wide (0.82), so the scale is the
    // palm length — which is exactly the pixel scale the hand was built at.
    t.equal(Math.round(getPalmScale(makeHand({scale: 120}))), 120);
    t.equal(Math.round(getPalmScale(makeHand({scale: 60}))), 60);
    t.equal(Math.round(getPalmScale(makeHand({scale: 120, rotation: Math.PI / 4}))), 120,
        'turning the hand in the image plane does not change its measured size');

    t.end();
});

test('a pinch holds through the hysteresis band and releases after three open frames', t => {
    const extension = makeExtension(new Runtime());
    const closed = makeHand({gap: 0.25});
    const band = makeHand({gap: 0.4});
    const open = makeHand({gap: 0.55});

    t.ok(runFrames(extension, [closed]), 'a tight pinch starts immediately');
    t.ok(runFrames(extension, [band, band, band]), 'a pinch holds while the fingers are part-way open');
    t.ok(runFrames(extension, [open]), 'one open frame does not release the pinch');
    t.ok(runFrames(extension, [open]), 'two open frames do not release the pinch');
    t.notOk(runFrames(extension, [open]), 'three open frames release the pinch');

    t.end();
});

test('a hand that goes missing releases on the same delay as one that opens', t => {
    const extension = makeExtension(new Runtime());

    // Hands drop out of detection for a frame or two when they move quickly,
    // which should cost a pinch no more than opening the fingers does.
    t.ok(runFrames(extension, [makeHand({gap: 0.25})]), 'the hand is pinching');
    t.ok(runFrames(extension, [null]), 'one missing frame does not release the pinch');
    t.ok(runFrames(extension, [null]), 'two missing frames do not release the pinch');
    t.notOk(runFrames(extension, [null]), 'three missing frames release the pinch');

    t.end();
});

test('missing and open frames count towards the same release', t => {
    const extension = makeExtension(new Runtime());
    const open = makeHand({gap: 0.55});

    t.ok(runFrames(extension, [makeHand({gap: 0.25})]), 'the hand is pinching');
    t.ok(runFrames(extension, [null, open]), 'a missing frame then an open one hold the pinch');
    t.notOk(runFrames(extension, [null]), 'a third non-pinch frame of either kind releases it');

    t.end();
});

test('a dragged sprite keeps the same grip however the fingers waver', t => {
    const runtime = new Runtime();
    const extension = makeExtension(runtime);
    const target = makeGrabbableSprite(runtime);
    extension.setPinchDrag({STATE: 'on'}, {target: target});

    const grab = makeHand({gap: 0.25, x: 200, y: 300});
    runDragFrames(extension, [grab]);
    const grabPoint = getPinchPoint(grab);
    const offsetX = target.x - grabPoint.x;
    const offsetY = target.y - grabPoint.y;

    // The fingers hover part-way open while the hand travels across the frame,
    // then close again. The sprite should end up gripped exactly where it was
    // picked up, not left trailing behind by the distance the hand covered.
    runDragFrames(extension, [
        makeHand({gap: 0.4, x: 260, y: 300}),
        makeHand({gap: 0.4, x: 320, y: 300}),
        makeHand({gap: 0.4, x: 380, y: 300})
    ]);
    const end = makeHand({gap: 0.25, x: 380, y: 300});
    runDragFrames(extension, [end]);

    const endPoint = getPinchPoint(end);
    t.equal(target.x, endPoint.x + offsetX, 'the sprite is held where it was grabbed');
    t.equal(target.y, endPoint.y + offsetY, 'and has not slipped back toward the palm');

    t.end();
});

test('a dragged sprite keeps its grip as the hand nears or leaves the camera', t => {
    const runtime = new Runtime();
    const extension = makeExtension(runtime);
    const target = makeGrabbableSprite(runtime);
    extension.setPinchDrag({STATE: 'on'}, {target: target});

    // Grab with the hand close to the camera, where it fills much of the frame.
    const near = makeHand({gap: 0.25, scale: 180, x: 240, y: 300});
    runDragFrames(extension, [near]);
    const nearPoint = getPinchPoint(near);
    const nearScale = getPalmScale(near);
    const gripX = (target.x - nearPoint.x) / nearScale;
    const gripY = (target.y - nearPoint.y) / nearScale;

    // Hold the pinch and draw the hand back, shrinking it. The sprite should sit
    // in the same place relative to the hand rather than hanging off it at the
    // pixel distance it happened to be grabbed at.
    const far = makeHand({gap: 0.25, scale: 70, x: 240, y: 300});
    runDragFrames(extension, [far]);
    const farPoint = getPinchPoint(far);
    const farScale = getPalmScale(far);

    t.equal(target.x, farPoint.x + (gripX * farScale), 'the grip closes up as the hand shrinks');
    t.equal(target.y, farPoint.y + (gripY * farScale), 'in both directions');

    t.end();
});

test('a drag holds on to its sprite while the hand is briefly missing', t => {
    const runtime = new Runtime();
    const extension = makeExtension(runtime);
    const target = makeGrabbableSprite(runtime);
    extension.setPinchDrag({STATE: 'on'}, {target: target});

    runDragFrames(extension, [makeHand({gap: 0.25})]);
    t.equal(extension._pinchDrags.Right.targetId, target.id, 'pinching over the sprite grabs it');

    runDragFrames(extension, [null, null]);
    t.ok(extension._pinchDrags.Right, 'the sprite is still held after two missing frames');

    runDragFrames(extension, [null]);
    t.notOk(extension._pinchDrags.Right, 'and is let go on the third');

    t.end();
});

test('the stop button turns pinch dragging off', t => {
    const runtime = new Runtime();
    const extension = makeExtension(runtime);
    const target = makeGrabbableSprite(runtime);
    extension.setPinchDrag({STATE: 'on'}, {target: target});

    runtime.stopAll();

    t.notOk(pinchDragEnabled(target), 'the sprite can no longer be grabbed');
    t.end();
});

test('the green flag turns pinch dragging off', t => {
    const runtime = new Runtime();
    const extension = makeExtension(runtime);
    const target = makeGrabbableSprite(runtime);
    extension.setPinchDrag({STATE: 'on'}, {target: target});

    runtime.greenFlag();

    t.notOk(pinchDragEnabled(target), 'the sprite can no longer be grabbed');
    t.end();
});

test('stopping lets go of a sprite that is being dragged', t => {
    const runtime = new Runtime();
    const extension = makeExtension(runtime);
    const target = makeGrabbableSprite(runtime);
    extension.setPinchDrag({STATE: 'on'}, {target: target});

    runDragFrames(extension, [makeHand({gap: 0.25})]);
    t.equal(extension._pinchDrags.Right.targetId, target.id, 'pinching over the sprite grabs it');

    runtime.stopAll();

    t.notOk(extension._pinchDrags.Right, 'the drag is dropped');
    t.notOk(target.dragging, 'and the sprite is no longer being dragged');
    t.end();
});

test('a hand with unusable landmarks is not pinching', t => {
    const extension = makeExtension(new Runtime());

    t.equal(getPinchRatio(null), -1, 'no hand has no ratio');
    t.equal(getPinchRatio({}), -1, 'a hand with no keypoints has no ratio');

    const noThumb = makeHand();
    noThumb.keypoints[4] = null;
    t.equal(getPinchRatio(noThumb), -1, 'a hand with no thumb tip has no ratio');
    t.notOk(extension._isHandTightlyPinching(noThumb), 'and is not pinching');

    const flat = makeHand({scale: 0});
    t.equal(getPinchRatio(flat), -1, 'a hand with no measurable palm has no ratio');
    t.notOk(extension._isHandTightlyPinching(flat), 'and is not pinching');

    t.end();
});

test('an open hand reads open and a fist reads closed, whichever way the hand is turned', t => {
    const extension = makeExtension(new Runtime());

    for (const backOfHand of [false, true]) {
        for (const rotation of [0, Math.PI / 6, Math.PI / 3, Math.PI / 2, Math.PI]) {
            const pose = `turned ${rotation.toFixed(2)}rad${backOfHand ? ', back of hand to the camera' : ''}`;

            runGestureFrames(extension, [makeHand({rotation, backOfHand})]);
            t.same(readGesture(extension), {open: true, closed: false}, `an open hand ${pose}`);

            runGestureFrames(extension, [makeHand({curled: ALL_FINGERS, rotation, backOfHand})]);
            t.same(readGesture(extension), {open: false, closed: true}, `a fist ${pose}`);
        }
    }

    t.end();
});

test('the gesture does not depend on how big the hand is or where the thumb rests', t => {
    const extension = makeExtension(new Runtime());

    for (const scale of [60, 120, 200]) {
        for (const gap of [0.1, 0.25, 0.6]) {
            runGestureFrames(extension, [makeHand({scale, gap})]);
            t.same(readGesture(extension), {open: true, closed: false},
                `an open hand ${scale}px across with the thumb ${gap} palms from the index tip`);

            runGestureFrames(extension, [makeHand({curled: ALL_FINGERS, scale, gap})]);
            t.same(readGesture(extension), {open: false, closed: true},
                `a fist ${scale}px across with the thumb ${gap} palms from the index tip`);
        }
    }

    t.end();
});

test('open and closed are complements while a hand is in view', t => {
    const extension = makeExtension(new Runtime());

    const poses = {
        'an open hand': [],
        'a pointing hand': ['middle', 'ring', 'pinky'],
        'a peace sign': ['ring', 'pinky'],
        'three fingers up': ['pinky'],
        'a fist': ALL_FINGERS
    };
    for (const [name, curled] of Object.entries(poses)) {
        runGestureFrames(extension, [makeHand({curled})]);
        const {open, closed} = readGesture(extension);
        t.equal(closed, !open, `${name} is exactly one of open or closed`);
    }

    runGestureFrames(extension, [null, null, null]);
    t.same(readGesture(extension), {open: false, closed: false}, 'with no hand in view it is neither');

    t.end();
});

test('the gesture holds through in-between poses and flips only past the far threshold', t => {
    const extension = makeExtension(new Runtime());
    const open = makeHand();
    const fist = makeHand({curled: ALL_FINGERS});
    const peace = makeHand({curled: ['ring', 'pinky']});
    const pointing = makeHand({curled: ['middle', 'ring', 'pinky']});

    runGestureFrames(extension, [open, peace]);
    t.same(readGesture(extension), {open: true, closed: false}, 'an open hand stays open through a peace sign');

    runGestureFrames(extension, [pointing]);
    t.same(readGesture(extension), {open: false, closed: true}, 'and closes once only one finger is left up');

    runGestureFrames(extension, [peace]);
    t.same(readGesture(extension), {open: false, closed: true}, 'a closed hand stays closed through a peace sign');

    runGestureFrames(extension, [open]);
    t.same(readGesture(extension), {open: true, closed: false}, 'and opens once the fingers are straight');

    runGestureFrames(extension, [fist]);
    t.same(readGesture(extension), {open: false, closed: true}, 'a fist closes it again');

    t.end();
});

test('a hand that goes missing for a frame or two keeps its gesture', t => {
    const extension = makeExtension(new Runtime());
    const open = makeHand();

    runGestureFrames(extension, [open, null, null]);
    t.same(readGesture(extension), {open: true, closed: false}, 'two missing frames do not drop the gesture');

    runGestureFrames(extension, [open, null, null, null]);
    t.same(readGesture(extension), {open: false, closed: false}, 'three in a row forget it');

    runGestureFrames(extension, [makeHand({curled: ALL_FINGERS})]);
    t.same(readGesture(extension), {open: false, closed: true}, 'and the hand is classified afresh when it returns');

    t.end();
});

test('the gesture hat stays true through a flicker, so it fires once per transition', t => {
    const extension = makeExtension(new Runtime());
    const open = makeHand();
    const peace = makeHand({curled: ['ring', 'pinky']});
    const seen = [];

    for (const frame of [open, null, open, peace, open, null, peace]) {
        runGestureFrames(extension, [frame]);
        seen.push(extension.whenGesture({GESTURE: 'open', HAND: 'right'}));
    }
    t.same(seen, [true, true, true, true, true, true, true]);

    t.end();
});

test('gestures are tracked per hand', t => {
    const extension = makeExtension(new Runtime());

    extension._allHands = [makeHand({handedness: 'Left'}), makeHand({curled: ALL_FINGERS, handedness: 'Right'})];
    extension._updateGestureStates();
    t.same(readGesture(extension, 'left'), {open: true, closed: false});
    t.same(readGesture(extension, 'right'), {open: false, closed: true});

    t.end();
});

test('a hand with unusable landmarks has no gesture', t => {
    const extension = makeExtension(new Runtime());

    const noTip = makeHand();
    noTip.keypoints[8] = null;
    runGestureFrames(extension, [noTip]);
    t.same(readGesture(extension), {open: false, closed: false});

    runGestureFrames(extension, [makeHand({scale: 0})]);
    t.same(readGesture(extension), {open: false, closed: false}, 'nor does one with no measurable palm');

    t.end();
});

/**
 * Read the pinch distance reporter with a single hand in view.
 * @param {object} extension - the extension instance
 * @param {object} hand - the detected hand
 * @param {string} [choice] - the HAND menu choice to ask for
 * @returns {number} the reported pinch distance
 */
const readPinch = (extension, hand, choice = 'right') => {
    extension._allHands = [hand];
    return extension.pinchDistance({HAND: choice});
};

// The reporter maps the pinch ratio (the gap, in palm units) linearly onto
// 0-100: a gap of 0.15 reads 0 and a gap of 1.15 reads 100, clamped beyond
// either end. Expected readings below follow from those two anchors.
test('pinch distance runs from 0 with the fingertips together to 100 spread wide', t => {
    const extension = makeExtension(new Runtime());

    t.equal(readPinch(extension, makeHand({gap: 0.15})), 0, 'fingertips together');
    t.equal(readPinch(extension, makeHand({gap: 1.15})), 100, 'spread wide');
    t.equal(readPinch(extension, makeHand({gap: 0.65})), 50, 'halfway between');

    const between = readPinch(extension, makeHand({gap: 0.372}));
    t.equal(between, 22, 'gaps between the anchors round');
    t.ok(Number.isInteger(between), 'to a whole number');

    t.equal(readPinch(extension, makeHand({gap: 0})), 0, 'overlapping tips clamp to 0');
    t.equal(readPinch(extension, makeHand({gap: 0.05})), 0, 'tips pressed tighter than usual clamp to 0');
    t.equal(readPinch(extension, makeHand({gap: 1.5})), 100, 'straining past a comfortable spread clamps to 100');

    t.end();
});

test('pinch distance does not depend on how big the hand is', t => {
    const extension = makeExtension(new Runtime());

    // A child's hand far from the camera and an adult's up close read alike.
    for (const scale of [60, 120, 200]) {
        t.equal(readPinch(extension, makeHand({gap: 0.65, scale})), 50,
            `a half-open hand ${scale}px across reads 50`);
        t.equal(readPinch(extension, makeHand({gap: 0.3, scale})), 15,
            `a closing hand ${scale}px across reads 15`);
    }

    t.end();
});

test('pinch distance does not depend on where the hand is, or how it is turned', t => {
    const extension = makeExtension(new Runtime());

    for (const rotation of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
        for (const position of [{x: 60, y: 60}, {x: 240, y: 180}, {x: 420, y: 300}]) {
            const hand = makeHand(Object.assign({gap: 0.65, rotation}, position));
            t.equal(readPinch(extension, hand), 50,
                `a half-open hand reads 50 at (${position.x}, ${position.y}) turned ${rotation.toFixed(2)}rad`);
        }
    }

    t.end();
});

test('pinch distance follows the hand that was asked for', t => {
    const extension = makeExtension(new Runtime());
    const left = makeHand({gap: 0.65, handedness: 'Left'});

    t.equal(readPinch(extension, left, 'left'), 50);
    t.equal(readPinch(extension, left, 'right'), 0, 'the other hand does not stand in');

    t.end();
});

test('a hand the pinch detector calls pinched reads low on the pinch distance', t => {
    const extension = makeExtension(new Runtime());

    t.equal(readPinch(extension, makeHand({gap: 0.3})), 15, 'the pinch-on ratio reads 15');
    t.equal(readPinch(extension, makeHand({gap: 0.45})), 30, 'the pinch-off ratio reads 30');

    const pinched = makeHand({gap: 0.29});
    t.ok(extension._isHandTightlyPinching(pinched), 'a hand just inside the pinch-on ratio is pinching');
    t.equal(readPinch(extension, pinched), 14, 'and reads under 15');

    const loosening = makeHand({gap: 0.4});
    t.notOk(extension._isHandTightlyPinching(loosening), 'a hand in the release band is not tightly pinching');
    t.equal(readPinch(extension, loosening), 25, 'and reads between 15 and 30');

    t.end();
});

test('pinch distance is zero when the hand is not detected', t => {
    const extension = makeExtension(new Runtime());

    extension._allHands = [];
    t.equal(extension.pinchDistance({HAND: 'left'}), 0, 'no hands at all');

    extension._allHands = [makeHand({handedness: 'Right'})];
    t.equal(extension.pinchDistance({HAND: 'left'}), 0, 'the other hand does not stand in');

    const noThumb = makeHand();
    noThumb.keypoints[4] = null;
    extension._allHands = [noThumb];
    t.equal(extension.pinchDistance({HAND: 'right'}), 0, 'unusable landmarks report zero');

    extension._allHands = [makeHand({scale: 0})];
    t.equal(extension.pinchDistance({HAND: 'right'}), 0, 'a hand with no measurable palm reports zero');

    t.end();
});

test('hand detected? reports each hand on its own', t => {
    const extension = makeExtension(new Runtime());

    extension._allHands = [];
    t.notOk(extension.handIsDetected({HAND: 'left'}), 'no hands at all');
    t.notOk(extension.handIsDetected({HAND: 'right'}));

    extension._allHands = [makeHand({handedness: 'Left'})];
    t.ok(extension.handIsDetected({HAND: 'left'}), 'the left hand is in view');
    t.notOk(extension.handIsDetected({HAND: 'right'}), 'the other hand does not stand in');

    extension._allHands = [makeHand({handedness: 'Left'}), makeHand({handedness: 'Right'})];
    t.ok(extension.handIsDetected({HAND: 'left'}), 'both hands are in view');
    t.ok(extension.handIsDetected({HAND: 'right'}));

    t.end();
});

test('go to part moves the sprite to the part of the hand asked for', t => {
    const runtime = new Runtime();
    const extension = makeExtension(runtime);
    const target = new Sprite(null, runtime).createClone();
    const hand = makeHand({handedness: 'Right', y: 300});
    extension._allHands = [hand];

    extension.goToPart({HAND: 'right', PART: 'index_finger_tip'}, {target});
    const indexTip = toScratchCoords(hand.keypoints[8]);
    t.same({x: target.x, y: target.y}, indexTip, 'the sprite lands on the index fingertip');

    extension.goToPart({HAND: 'right', PART: 'wrist'}, {target});
    t.same({x: target.x, y: target.y}, toScratchCoords(hand.keypoints[0]), 'and on the wrist');

    extension.goToPart({HAND: 'right', PART: 'palm_center'}, {target});
    t.ok(target.y > toScratchCoords(hand.keypoints[0]).y && target.y < indexTip.y,
        'the palm center lies between the wrist and the fingertips');

    const before = {x: target.x, y: target.y};
    extension.goToPart({HAND: 'left', PART: 'index_finger_tip'}, {target});
    t.same({x: target.x, y: target.y}, before, 'a hand that is not in view moves nothing');

    t.end();
});

test('when this sprite touches part asks the sprite about the part position', t => {
    const runtime = new Runtime();
    const extension = makeExtension(runtime);
    const target = new Sprite(null, runtime).createClone();
    const hand = makeHand({handedness: 'Left', y: 300});
    extension._allHands = [hand];
    const asked = [];
    target.isTouchingScratchPoint = (x, y) => {
        asked.push({x, y});
        return true;
    };

    t.ok(extension.whenSpriteTouchesPart({HAND: 'left', PART: 'thumb_tip'}, {target}));
    t.same(asked, [toScratchCoords(hand.keypoints[4])], 'the sprite is asked about the thumb tip');

    t.notOk(extension.whenSpriteTouchesPart({HAND: 'right', PART: 'thumb_tip'}, {target}),
        'a hand that is not in view touches nothing');
    t.equal(asked.length, 1, 'and the sprite is not asked');

    t.end();
});

test('point in direction of finger turns the sprite with the finger', t => {
    const runtime = new Runtime();
    const extension = makeExtension(runtime);
    const target = new Sprite(null, runtime).createClone();
    const directionAt = (rotation, finger) => {
        extension._allHands = [makeHand({rotation})];
        extension.pointInDirectionOfFinger({HAND: 'right', FINGER: finger}, {target});
        return target.direction;
    };

    // The canonical hand's middle finger points straight up, and a finger
    // pointing straight up reads as 90°: the default direction every sprite
    // starts at, so a sprite carried on a fingertip as a puppet keeps its
    // usual facing and turns with the finger (see angleBetween in utils.js).
    t.equal(directionAt(0, 'middle_finger_tip'), 90, 'a finger pointing straight up points the sprite at 90°');
    t.equal(directionAt(Math.PI / 2, 'middle_finger_tip'), 180,
        'a quarter turn clockwise on screen turns it to 180°');
    t.equal(directionAt(Math.PI, 'middle_finger_tip'), -90, 'a half turn turns it to -90°');
    t.equal(directionAt(-Math.PI / 4, 'middle_finger_tip'), 45, 'an eighth turn anticlockwise turns it to 45°');

    // The index finger leans a little; it turns by the same amounts.
    const upright = directionAt(0, 'index_finger_tip');
    t.equal(turn(upright, directionAt(Math.PI / 2, 'index_finger_tip')), 90,
        'a quarter turn turns the index finger 90°');
    t.equal(turn(upright, directionAt(Math.PI, 'index_finger_tip')), 180, 'a half turn turns it 180°');

    extension._allHands = [];
    target.setDirection(upright);
    extension.pointInDirectionOfFinger({HAND: 'right', FINGER: 'index_finger_tip'}, {target});
    t.equal(target.direction, upright, 'a hand that is not in view turns nothing');

    t.end();
});

test('angles between landmarks put up at 90° and grow clockwise on screen', t => {
    const origin = {x: 100, y: 100};
    const up = angleBetween(origin, {x: 100, y: 0});
    const right = angleBetween(origin, {x: 200, y: 100});
    const down = angleBetween(origin, {x: 100, y: 200});
    const left = angleBetween(origin, {x: 0, y: 100});

    t.equal(up, 90, 'up is 90°, the default sprite direction');
    t.equal(right, 180);
    t.equal(down, -90);
    t.equal(left, 0);
    t.equal(turn(up, right), 90);
    t.equal(turn(right, down), 90);
    t.equal(turn(down, left), 90);
    t.equal(turn(left, up), 90);
    t.equal(angleBetween(origin, {x: 130, y: 130}), angleBetween(origin, {x: 200, y: 200}),
        'the angle does not depend on how far apart the landmarks are');

    t.end();
});

/**
 * Build a HandLandmarker result for a set of hands.
 * @param {Array.<object>} hands - one entry per hand
 * @param {Array.<{x: number, y: number}>} hands[].landmarks - normalized landmarks
 * @param {string} hands[].categoryName - the handedness label
 * @returns {object} a result shaped like HandLandmarker.detectForVideo returns
 */
const makeLandmarkerResult = hands => ({
    landmarks: hands.map(hand => hand.landmarks),
    worldLandmarks: hands.map(hand => hand.landmarks),
    handedness: hands.map(hand => [{categoryName: hand.categoryName, score: 0.99, index: 0}])
});

/**
 * Build 21 normalized landmarks, all at the same point.
 * @param {number} x - normalized x, 0 to 1
 * @param {number} y - normalized y, 0 to 1
 * @returns {Array.<object>} the landmarks
 */
const flatLandmarks = (x, y) => new Array(21).fill(null)
    .map(() => ({x, y, z: 0}));

test('landmarker results become keypoints in sample-canvas pixels', t => {
    const landmarks = flatLandmarks(0.25, 0.5);
    landmarks[8] = {x: 1, y: 1, z: 0};

    const [hand] = translateResult(makeLandmarkerResult([
        {landmarks, categoryName: 'Right'}
    ]));

    t.equal(hand.keypoints.length, 21, 'every landmark is carried over');
    t.same({x: hand.keypoints[0].x, y: hand.keypoints[0].y}, {x: 120, y: 180},
        'normalized coordinates are scaled to the 480x360 sample canvas');
    t.same({x: hand.keypoints[8].x, y: hand.keypoints[8].y}, {x: 480, y: 360},
        'the far corner lands on the far corner');
    t.equal(hand.keypoints[0].name, 'wrist', 'landmark 0 is the wrist');
    t.equal(hand.keypoints[8].name, 'index_finger_tip', 'landmark 8 is the index finger tip');
    t.equal(hand.handedness, 'Left', 'the handedness label is the block-facing one');
    t.end();
});

test('handedness names the user\'s own hand, undoing the mirrored frame', t => {
    // The frames the landmarker sees are mirrored, so the user's right hand
    // has the shape of a left hand and the model calls it "Left".
    const [fromLeft, fromRight] = translateResult(makeLandmarkerResult([
        {landmarks: flatLandmarks(0.75, 0.5), categoryName: 'Left'},
        {landmarks: flatLandmarks(0.25, 0.5), categoryName: 'Right'}
    ]));
    t.equal(fromLeft.handedness, 'Right', 'what the model calls Left is the user\'s right hand');
    t.equal(fromRight.handedness, 'Left', 'and its Right is the user\'s left hand');
    t.end();
});

test('landmarker results keep each hand with its own handedness', t => {
    const hands = translateResult(makeLandmarkerResult([
        {landmarks: flatLandmarks(0.25, 0.25), categoryName: 'Left'},
        {landmarks: flatLandmarks(0.75, 0.75), categoryName: 'Right'}
    ]));

    t.same(hands.map(hand => hand.handedness), ['Right', 'Left']);
    t.equal(hands[0].keypoints[0].x, 120, 'the first hand keeps its own landmarks');
    t.equal(hands[1].keypoints[0].x, 360, 'and the second keeps its own');
    t.end();
});

test('a frame with no hands in it reports no hands', t => {
    t.same(translateResult(makeLandmarkerResult([])), []);
    t.end();
});

test('software GPUs are told apart from real ones by their renderer string', t => {
    t.ok(isSoftwareRenderer('Google SwiftShader'), 'headless Chromium');
    t.ok(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)'), 'Linux without a GPU driver');
    t.notOk(isSoftwareRenderer('ANGLE (ARM, Mali-G72, OpenGL ES 3.2)'));
    t.notOk(isSoftwareRenderer('Intel(R) UHD Graphics 600'));
    t.notOk(isSoftwareRenderer('unavailable'));
    t.notOk(isSoftwareRenderer(null));
    t.end();
});

const INTERVAL = 1000 / 15;

test('quick inference leaves the capture rate at the interval', t => {
    t.ok(Math.abs(nextCaptureDelay({intervalMs: INTERVAL, inferenceMs: 12, elapsedMs: 20}) - (INTERVAL - 20)) < 1e-9,
        'the wait is whatever is left of the interval');
    t.equal(nextCaptureDelay({intervalMs: INTERVAL, inferenceMs: 40, elapsedMs: 0}), INTERVAL,
        'a rest that fits inside the interval changes nothing');
    t.end();
});

test('slow inference stretches the period so the detector rests between frames', t => {
    t.equal(nextCaptureDelay({intervalMs: INTERVAL, inferenceMs: 60, elapsedMs: 65}), 25);
    t.equal(nextCaptureDelay({intervalMs: INTERVAL, inferenceMs: 100, elapsedMs: 110}), 40);
    t.same(
        [12, 40, 60, 80, 100].map(inferenceMs => nextCaptureDelay({intervalMs: INTERVAL, inferenceMs, elapsedMs: 0})),
        [INTERVAL, INTERVAL, 90, 120, 150],
        'the period grows with inference once inference passes two thirds of the interval'
    );
    t.equal(nextCaptureDelay({intervalMs: INTERVAL, inferenceMs: 100, elapsedMs: 100, restRatio: 0}), 0,
        'with no rest the period is the inference time itself');
    t.end();
});

test('the next capture is never scheduled in the past', t => {
    t.equal(nextCaptureDelay({intervalMs: INTERVAL, inferenceMs: 60, elapsedMs: 200}), 0);
    t.equal(nextCaptureDelay({intervalMs: INTERVAL, inferenceMs: 12, elapsedMs: INTERVAL + 1}), 0);
    t.end();
});

test('without an inference measurement the interval alone paces capture', t => {
    for (const inferenceMs of [NaN, 0, -5]) {
        t.equal(nextCaptureDelay({intervalMs: INTERVAL, inferenceMs, elapsedMs: 10}), INTERVAL - 10);
    }
    t.end();
});

test('inference time is smoothed so the rate does not lurch frame to frame', t => {
    t.equal(smoothInferenceMs(NaN, 40), 40, 'the first sample is taken as it is');
    t.equal(smoothInferenceMs(40, 100), 52, 'later samples move the estimate a fifth of the way');
    t.end();
});

/**
 * A stand-in for a Worker running hand-sensing-worker.js: records what is
 * posted to it and lets a test answer as the worker would.
 * @returns {object} the fake worker
 */
const makeFakeWorker = () => {
    const worker = {posted: [], terminated: false, onmessage: null, onerror: null};
    worker.postMessage = (message, transfer) => worker.posted.push({message, transfer});
    worker.terminate = () => {
        worker.terminated = true;
    };
    worker.receive = data => worker.onmessage({data});
    return worker;
};

const ASSET_SETS = [{wasmRoot: 'local/wasm', modelPath: 'local/hand_landmarker.task'}];

/**
 * Start a worker detector on a fake worker.
 * @param {object} [options] - timing options for createWorkerDetector
 * @returns {{worker: object, ready: Promise}} the fake worker and the detector promise
 */
const startWorkerDetector = options => {
    const worker = makeFakeWorker();
    const ready = createWorkerDetector(worker, ASSET_SETS, options);
    return {worker, ready};
};

/**
 * Let pending promise callbacks and I/O run.
 * @returns {Promise} resolves on the next turn of the event loop
 */
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

/**
 * Stand in for the browser's createImageBitmap for the rest of a test.
 * @param {object} t - the test
 * @param {object} bitmap - what every call resolves with
 */
const stubCreateImageBitmap = (t, bitmap) => {
    global.createImageBitmap = () => Promise.resolve(bitmap);
    t.teardown(() => {
        delete global.createImageBitmap;
    });
};

test('the worker detector starts the worker and reports how it came up', t => {
    const {worker, ready} = startWorkerDetector();
    t.same(worker.posted[0].message, {type: 'init', assetSets: ASSET_SETS}, 'the worker is told where to load from');

    worker.receive({type: 'ready', delegate: 'GPU', wasmRoot: 'local/wasm', renderer: 'Mali-G72'});
    return ready.then(detector => {
        t.equal(detector.thread, 'worker');
        t.equal(detector.delegate, 'GPU');
        t.equal(detector.wasmRoot, 'local/wasm');
        t.equal(detector.renderer, 'Mali-G72');
        t.notOk(worker.terminated);
    });
});

test('a worker that cannot run inference is shut down and says why', t => {
    const {worker, ready} = startWorkerDetector();
    worker.receive({type: 'init-error', message: 'WebGL2 is unavailable in the worker (OffscreenCanvas: true)'});
    return ready.then(() => t.fail('the detector should not become ready'), error => {
        t.match(error.message, /WebGL2 is unavailable in the worker/);
        t.notOk(error.fatal, 'the main thread can still try');
        t.ok(worker.terminated);
    });
});

test('a worker that never becomes ready is shut down', t => {
    const {worker, ready} = startWorkerDetector({initTimeoutMs: 10});
    return ready.then(() => t.fail('the detector should not become ready'), error => {
        t.ok(error.fatal);
        t.match(error.message, /not ready after 10 ms/);
        t.ok(worker.terminated);
    });
});

test('the worker detector hands each frame over as a transferred bitmap', t => {
    const canvas = {kind: 'canvas'};
    const bitmap = {kind: 'bitmap'};
    stubCreateImageBitmap(t, bitmap);
    const {worker, ready} = startWorkerDetector();
    worker.receive({type: 'ready', delegate: 'GPU', wasmRoot: 'local/wasm', renderer: 'x'});
    let result;
    return ready
        .then(detector => {
            result = detector.detect(canvas, 1234);
            return nextTurn();
        })
        .then(() => {
            const {message, transfer} = worker.posted[1];
            t.same(message, {type: 'detect', bitmap, timestamp: 1234});
            t.same(transfer, [bitmap], 'the bitmap moves to the worker rather than being copied');
            worker.receive({
                type: 'result', timestamp: 1234, hands: [{handedness: 'Right', keypoints: []}], inferenceMs: 17
            });
            return result;
        })
        .then(({hands, inferenceMs}) => {
            t.equal(hands.length, 1);
            t.equal(hands[0].handedness, 'Right');
            t.equal(inferenceMs, 17);
        });
});

test('a frame the worker chokes on fails on its own, without ending detection', t => {
    stubCreateImageBitmap(t, {});
    const {worker, ready} = startWorkerDetector();
    worker.receive({type: 'ready', delegate: 'GPU', wasmRoot: 'local/wasm', renderer: 'x'});
    return ready
        .then(detector => {
            const result = detector.detect({}, 5);
            return nextTurn().then(() => {
                worker.receive({type: 'detect-error', timestamp: 5, message: 'bad frame'});
                return result;
            });
        })
        .then(() => t.fail('the frame should fail'), error => {
            t.equal(error.message, 'bad frame');
            t.notOk(error.fatal);
            t.notOk(worker.terminated);
        });
});

test('a crashed worker fails the frame in flight for good', t => {
    stubCreateImageBitmap(t, {});
    const {worker, ready} = startWorkerDetector();
    worker.receive({type: 'ready', delegate: 'GPU', wasmRoot: 'local/wasm', renderer: 'x'});
    return ready
        .then(detector => {
            const result = detector.detect({}, 5);
            return nextTurn().then(() => {
                worker.onerror({message: 'Script error'});
                return result;
            });
        })
        .then(() => t.fail('the frame should fail'), error => {
            t.ok(error.fatal);
            t.match(error.message, /Script error/);
        });
});

test('a worker that stops answering is presumed dead', t => {
    stubCreateImageBitmap(t, {});
    const {worker, ready} = startWorkerDetector({detectTimeoutMs: 10});
    worker.receive({type: 'ready', delegate: 'GPU', wasmRoot: 'local/wasm', renderer: 'x'});
    return ready
        .then(detector => detector.detect({}, 5))
        .then(() => t.fail('the frame should fail'), error => {
            t.ok(error.fatal);
            t.match(error.message, /did not answer within 10 ms/);
        });
});

/**
 * Build a detector that answers every frame with the same hands, recording
 * what it was asked.
 * @param {object} [options] - what the detector reports
 * @param {Array.<object>} [options.hands] - the hands in every frame
 * @param {number} [options.inferenceMs] - how long every frame takes
 * @param {string} [options.thread] - 'worker' or 'main'
 * @returns {object} the detector
 */
const makeStubDetector = ({hands = [], inferenceMs = 20, thread = 'worker'} = {}) => {
    const detector = {thread, delegate: 'GPU', wasmRoot: 'local/wasm', renderer: 'x', calls: [], terminated: false};
    detector.detect = (frame, timestamp) => {
        detector.calls.push({frame, timestamp});
        return Promise.resolve({hands, inferenceMs});
    };
    detector.terminate = () => {
        detector.terminated = true;
    };
    return detector;
};

test('each frame goes through the detector into the hand, pinch and gesture state', t => {
    const runtime = new Runtime();
    const extension = makeExtension(runtime);
    const canvas = {kind: 'canvas'};
    runtime.ioDevices.video.getFrame = () => canvas;
    const hand = makeHand({gap: 0.1});
    const detector = makeStubDetector({hands: [hand], inferenceMs: 20});
    extension._detector = detector;

    return extension._detectFrame().then(() => {
        t.equal(detector.calls.length, 1);
        t.equal(detector.calls[0].frame, canvas, 'the sample canvas itself is handed over');
        t.equal(extension._allHands[0], hand);
        t.ok(extension.handIsDetected({HAND: 'right'}));
        t.ok(extension._pinchState.Right, 'the pinch state machine ran');
        t.ok(extension.gestureDetected({GESTURE: 'open', HAND: 'right'}), 'the gesture state machine ran');
        t.equal(extension.stats.framesSent, 1);
        t.equal(extension.stats.resultsReceived, 1);
        t.equal(extension.stats.inferenceMs, 20);
        t.ok(extension.stats.initMs >= 0, 'time to first result is recorded');
    });
});

test('frames get strictly increasing timestamps even within one millisecond', t => {
    const runtime = new Runtime();
    const extension = makeExtension(runtime);
    runtime.ioDevices.video.getFrame = () => ({});
    const detector = makeStubDetector();
    extension._detector = detector;
    const realNow = Date.now;
    Date.now = () => 1000;
    t.teardown(() => {
        Date.now = realNow;
    });

    return extension._detectFrame()
        .then(() => extension._detectFrame())
        .then(() => {
            t.same(detector.calls.map(call => call.timestamp), [1000, 1001]);
        });
});

test('with no frame to look at the detector is left alone', t => {
    const runtime = new Runtime();
    const extension = makeExtension(runtime);
    runtime.ioDevices.video.getFrame = () => null;
    const detector = makeStubDetector();
    extension._detector = detector;

    return extension._detectFrame().then(() => {
        t.equal(detector.calls.length, 0);
        t.equal(extension.stats.framesSkipped, 1);
        t.equal(extension.stats.framesSent, 0);
    });
});

test('one bad frame is counted and detection carries on', t => {
    const extension = makeExtension(new Runtime());
    const detector = makeStubDetector();
    extension._detector = detector;
    extension._createDetector = () => t.fail('no replacement should be made');

    t.notOk(extension._handleDetectError(new Error('bad frame')));
    t.equal(extension.stats.errors, 1);
    t.equal(extension.stats.lastError, 'bad frame');
    t.equal(extension._detector, detector);
    t.notOk(detector.terminated);
    t.end();
});

test('a dead worker is replaced by inference on the main thread', t => {
    const extension = makeExtension(new Runtime());
    const worker = makeStubDetector({thread: 'worker'});
    extension._detector = worker;
    const replacement = makeStubDetector({thread: 'main'});
    const requested = [];
    extension._createDetector = useWorker => {
        requested.push(useWorker);
        return Promise.resolve(replacement);
    };
    const error = new Error('worker gone');
    error.fatal = true;

    return extension._handleDetectError(error).then(() => {
        t.ok(worker.terminated);
        t.same(requested, [false], 'the replacement is asked to stay on the main thread');
        t.equal(extension._detector, replacement);
        t.equal(extension.stats.errors, 1);
    });
});

test('a run of bad frames counts as a dead worker', t => {
    const extension = makeExtension(new Runtime());
    const worker = makeStubDetector({thread: 'worker'});
    extension._detector = worker;
    const replacement = makeStubDetector({thread: 'main'});
    const requested = [];
    extension._createDetector = useWorker => {
        requested.push(useWorker);
        return Promise.resolve(replacement);
    };

    for (let frame = 0; frame < 9; frame++) {
        t.notOk(extension._handleDetectError(new Error('bad frame')));
    }
    t.same(requested, [], 'nine in a row are still just bad frames');
    t.notOk(worker.terminated);

    return extension._handleDetectError(new Error('bad frame')).then(() => {
        t.ok(worker.terminated, 'the tenth gives up on the worker');
        t.same(requested, [false]);
        t.equal(extension._detector, replacement);
        t.equal(extension.stats.errors, 10);
    });
});

test('a good frame ends a run of bad ones', t => {
    const runtime = new Runtime();
    const extension = makeExtension(runtime);
    runtime.ioDevices.video.getFrame = () => ({});
    const detector = makeStubDetector();
    extension._detector = detector;
    extension._createDetector = () => t.fail('no replacement should be made');

    for (let frame = 0; frame < 9; frame++) {
        extension._handleDetectError(new Error('bad frame'));
    }
    return extension._detectFrame().then(() => {
        for (let frame = 0; frame < 9; frame++) {
            t.notOk(extension._handleDetectError(new Error('bad frame')));
        }
        t.equal(extension._detector, detector);
    });
});

test('a run of bad frames on the main thread stops detection', t => {
    const extension = makeExtension(new Runtime());
    extension._detector = makeStubDetector({thread: 'main'});
    extension._createDetector = () => t.fail('there is nowhere left to go');

    for (let frame = 0; frame < 9; frame++) {
        extension._handleDetectError(new Error('bad frame'));
    }
    t.throws(() => extension._handleDetectError(new Error('bad frame')), {message: 'bad frame'});
    t.equal(extension._detector, null);
    t.end();
});

test('when nothing can run inference the loading alert clears and the blocks report no hands', t => {
    const runtime = new Runtime();
    const extension = makeExtension(runtime);
    const loadingEvents = [];
    runtime.on('EXTENSION_DATA_LOADING', loading => loadingEvents.push(loading));
    const detector = makeStubDetector();
    extension._detector = detector;
    extension._allHands = [makeHand()];

    extension._stopDetection(new Error('no assets could be loaded'));

    t.ok(detector.terminated);
    t.equal(extension._detector, null);
    t.same(extension._allHands, []);
    t.notOk(extension.handIsDetected({HAND: 'right'}));
    t.same(loadingEvents, [false], 'the "loading extension data" alert is cleared');
    t.equal(extension.stats.lastError, 'no assets could be loaded');
    t.end();
});
