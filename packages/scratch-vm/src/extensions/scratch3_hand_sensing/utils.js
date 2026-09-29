/**
 * Measurements of a hand detected by the hand landmarker. All are pure
 * functions of the hand's 21 landmarks, which the detector reports in image
 * coordinates: 480x360 with y growing downward, already mirrored so the user's
 * right hand appears on the right. Positions are returned in Scratch
 * coordinates; lengths and ratios are unitless or in image pixels.
 *
 * A measurement that cannot be taken, because a landmark it needs is missing,
 * reports -1 (for a number) or null (for a point), so callers can treat a hand
 * they cannot measure like a hand that is not there.
 */

const MathUtil = require('../../util/math-util');

/**
 * Landmark indices of the thumb tip and index fingertip. The gap between them
 * is the pinch.
 * @type {number}
 */
const THUMB_TIP = 4;
const INDEX_FINGER_TIP = 8;

/**
 * Landmark indices of the wrist and the four finger MCP joints. Their centroid
 * is the palm center.
 * @type {Array.<number>}
 */
const PALM_INDICES = [0, 5, 9, 13, 17];

/**
 * Landmark pairs spanning the two axes of the palm: wrist to middle-finger MCP
 * (its length) and index MCP to pinky MCP (its width). The palm is rigid, so
 * both hold steady while the fingers move.
 * @type {Array.<Array.<number>>}
 */
const PALM_AXES = [[0, 9], [5, 17]];

/**
 * Landmark index pairs [tip, PIP] for the index, middle, ring and pinky
 * fingers, used to measure how far each is extended.
 * @type {Array.<Array.<number>>}
 */
const FINGER_TIP_PIP = [[8, 6], [12, 10], [16, 14], [20, 18]];

/**
 * How far a fingertip reaches beyond its PIP joint, measured from the wrist as
 * a fraction of hand size, at which a finger counts as fully curled in the
 * openness measure. Folded into a fist, a tip falls about 0.3 short of its PIP.
 * @type {number}
 */
const FINGER_CURLED_REACH = -0.25;

/**
 * The reach (see FINGER_CURLED_REACH) at which a finger counts as fully
 * straight. A straight finger's tip sits about 0.3 to 0.45 hand sizes past its
 * PIP. Both anchors sit inside the real extremes so that they saturate and the
 * measure only varies through the bend in between.
 * @type {number}
 */
const FINGER_STRAIGHT_REACH = 0.25;

/**
 * Fraction of each inference's duration that detection rests before the next
 * frame is captured. Inference on a low-end Chromebook shares its two CPU
 * cores and integrated GPU with the stage renderer, so back-to-back frames
 * would starve the stage; resting half as long as the inference took caps
 * detection at about two thirds of the time. A shorter rest speeds up
 * detection at the stage's expense; a longer one does the reverse.
 * @type {number}
 */
const INFERENCE_REST_RATIO = 0.5;

/**
 * The distance between two landmarks, in image pixels.
 * @param {{x: number, y: number}} a - one landmark
 * @param {{x: number, y: number}} b - the other
 * @returns {number} the distance
 */
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Convert a point to Scratch coordinates.
 * @param {{x: number, y: number}} position - Original coordinates of the point.
 * @returns {{x: number, y: number}} Converted point in Scratch coordinates.
 */
const toScratchCoords = position => ({
    x: position.x - 240,
    y: 180 - position.y
});

/**
 * The palm center: the centroid of the wrist and the four finger MCP joints,
 * in Scratch coordinates.
 * @param {object} hand - the hand
 * @returns {?{x: number, y: number}} the palm center, or null if unavailable
 */
const getPalmCenter = hand => {
    let sumX = 0;
    let sumY = 0;
    for (const index of PALM_INDICES) {
        const keypoint = hand.keypoints[index];
        if (!keypoint) return null;
        sumX += keypoint.x;
        sumY += keypoint.y;
    }
    return toScratchCoords({x: sumX / PALM_INDICES.length, y: sumY / PALM_INDICES.length});
};

/**
 * Measure how big the hand is on screen: the longer of the palm's two axes,
 * in pixels.
 *
 * Taking the longer axis rather than combining the two keeps the
 * measurement steady while the hand turns. Turning the hand out of the
 * camera plane foreshortens one palm axis while leaving the other close to
 * its true length, so whichever is longer tracks the hand's real size far
 * better than either axis on its own. Both axes are measured between
 * landmarks, so turning the hand within the camera plane costs nothing.
 * @param {?object} hand - the hand, or null if none is in view
 * @returns {number} the palm size in pixels, or -1 if unavailable
 */
const getPalmScale = hand => {
    if (!hand || !hand.keypoints) return -1;
    let scale = 0;
    for (const [fromIndex, toIndex] of PALM_AXES) {
        const from = hand.keypoints[fromIndex];
        const to = hand.keypoints[toIndex];
        if (!from || !to) return -1;
        scale = Math.max(scale, distance(from, to));
    }
    // A hand measuring nothing at all is unusable, not infinitely small.
    return scale > 0 ? scale : -1;
};

/**
 * The thumb-to-index distance as a fraction of the hand's own size.
 *
 * Measuring the pinch against the hand making it, rather than in raw
 * pixels, makes the same gesture read the same way whoever performs it: a
 * child's small hand and an adult's large one pinch at the same ratio, as
 * does a hand held out at arm's length and one right up against the camera.
 * @param {?object} hand - the hand, or null if none is in view
 * @returns {number} the pinch ratio, or -1 if unavailable
 */
const getPinchRatio = hand => {
    const scale = getPalmScale(hand);
    if (scale < 0) return -1;
    const thumbTip = hand.keypoints[THUMB_TIP];
    const indexTip = hand.keypoints[INDEX_FINGER_TIP];
    if (!thumbTip || !indexTip) return -1;
    return distance(thumbTip, indexTip) / scale;
};

/**
 * The pinch point: the midpoint of the thumb tip and index fingertip, in
 * Scratch coordinates.
 * @param {object} hand - the hand
 * @returns {?{x: number, y: number}} the pinch point, or null if unavailable
 */
const getPinchPoint = hand => {
    const thumbTip = hand.keypoints[THUMB_TIP];
    const indexTip = hand.keypoints[INDEX_FINGER_TIP];
    if (!thumbTip || !indexTip) return null;
    return toScratchCoords({
        x: (thumbTip.x + indexTip.x) / 2,
        y: (thumbTip.y + indexTip.y) / 2
    });
};

/**
 * Measure how open a hand is: the mean extension of its four fingers, from
 * 0 (all curled into a fist) to 1 (all straight).
 *
 * A finger's extension is how far its tip reaches beyond its PIP joint,
 * both measured from the wrist and taken as a fraction of hand size, so a
 * straight finger scores 1 and one folded into a fist scores 0. Distances
 * from the wrist do not depend on which way the hand is turned, whether
 * its palm or its back faces the camera, or which hand the detector says it
 * is, so a pose reads the same in every orientation the fingers can be
 * seen in. The thumb is left out: it folds sideways rather than toward the
 * wrist and is the least reliably placed digit, so it would add ways to
 * misread a hand without adding meaning to "open" or "closed".
 * @param {object} hand - the hand
 * @returns {number} openness from 0 to 1, or -1 if unavailable
 */
const getHandOpenness = hand => {
    const scale = getPalmScale(hand);
    if (scale < 0) return -1;
    const wrist = hand.keypoints[0];
    let total = 0;
    for (const [tipIndex, pipIndex] of FINGER_TIP_PIP) {
        const tip = hand.keypoints[tipIndex];
        const pip = hand.keypoints[pipIndex];
        if (!tip || !pip) return -1;
        const reach = (distance(tip, wrist) - distance(pip, wrist)) / scale;
        total += MathUtil.clamp(
            MathUtil.scale(reach, FINGER_CURLED_REACH, FINGER_STRAIGHT_REACH, 0, 1), 0, 1);
    }
    return total / FINGER_TIP_PIP.length;
};

/**
 * Compute the direction of the vector from point A to point B as a sprite
 * direction. Straight up reads as 90°, the default direction every new
 * sprite starts at (the cat faces right there). Play testing settled that:
 * a sprite attached to a finger as a puppet then keeps its default facing
 * with a plain stack of blocks and turns as the finger bends, while clones
 * "shot" out of a fingertip need a turn block to fly the right way, and
 * puppets were chosen over projectiles:
 * https://medium.com/scratchteam-blog/inside-scratch-lab-hand-sensing-b9ce085a62ea
 * It also means a finger's direction sits a quarter turn from the compass
 * reading of Scratch's own direction dial, where up is 0°. Rotation is
 * clockwise-positive like `point in direction`, so up→right→down→left →
 * 90°→180°→-90°→0°. Both points are in raw (image) coordinates; conversion
 * to Scratch coords happens here.
 * @param {{x: number, y: number}} a - the starting point in image coords
 * @param {{x: number, y: number}} b - the ending point in image coords
 * @returns {number} angle in degrees, normalized to (-180, 180]
 */
const angleBetween = (a, b) => {
    const sa = toScratchCoords(a);
    const sb = toScratchCoords(b);
    const dx = sb.x - sa.x;
    const dy = sb.y - sa.y;
    let deg = (Math.atan2(dx, dy) * 180 / Math.PI) + 90;
    if (deg > 180) deg -= 360;
    return Math.round(deg);
};

/**
 * How long to wait before capturing the next frame for inference. The period
 * between captures is the requested interval, stretched to leave a rest after
 * inference that has been taking longer than the interval allows for, so a
 * slow device settles at the fastest rate it can sustain rather than the
 * fastest rate asked of it. Without a measurement yet, the interval stands.
 * @param {object} timing - the timing of the frame just finished
 * @param {number} timing.intervalMs - the shortest period wanted between captures
 * @param {number} timing.inferenceMs - how long inference has been taking, or
 *     NaN before the first measurement
 * @param {number} timing.elapsedMs - how long ago the last frame was captured
 * @param {number} [timing.restRatio] - rest per unit of inference time,
 *     INFERENCE_REST_RATIO by default
 * @returns {number} milliseconds to wait, never negative
 */
const nextCaptureDelay = ({intervalMs, inferenceMs, elapsedMs, restRatio = INFERENCE_REST_RATIO}) => {
    const measured = Number.isFinite(inferenceMs) && inferenceMs > 0;
    const period = measured ? Math.max(intervalMs, inferenceMs * (1 + restRatio)) : intervalMs;
    return Math.max(0, period - elapsedMs);
};

/**
 * Fold one inference time into a running estimate, as an exponential moving
 * average. Individual frames swing widely: the palm detector runs on every
 * frame that lacks a hand to track but only occasionally otherwise, and
 * garbage collection lands on some frames and not others. Smoothing them keeps
 * the capture rate from lurching with each frame.
 * @param {number} prevMs - the estimate so far, or NaN before the first sample
 * @param {number} sampleMs - the latest inference time
 * @param {number} [alpha] - weight of the new sample, 0.2 by default
 * @returns {number} the updated estimate
 */
const smoothInferenceMs = (prevMs, sampleMs, alpha = 0.2) => (
    Number.isFinite(prevMs) ? prevMs + (alpha * (sampleMs - prevMs)) : sampleMs
);

module.exports = {
    INFERENCE_REST_RATIO,
    nextCaptureDelay,
    smoothInferenceMs,
    toScratchCoords,
    getPalmCenter,
    getPalmScale,
    getPinchRatio,
    getPinchPoint,
    getHandOpenness,
    angleBetween
};
