const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const formatMessage = require('format-message');
const Video = require('../../io/video');
const TargetType = require('../../extension-support/target-type');
const {toScratchCoords} = require('./utils');

const HandPoseDetection = require('@tensorflow-models/hand-pose-detection');
const mediapipePackage = require('@mediapipe/hands/package.json');

// eslint-disable-next-line max-len
const menuIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj4gPGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj4gPGcgZmlsbD0iIzRjOTdmZiI+IDxyZWN0IHg9IjEyIiB5PSIyMSIgd2lkdGg9IjIxIiBoZWlnaHQ9IjEzIiByeD0iNSIvPiA8cmVjdCB4PSIxNCIgeT0iNyIgd2lkdGg9IjQiIGhlaWdodD0iMTciIHJ4PSIyIi8+IDxyZWN0IHg9IjE5IiB5PSI0IiB3aWR0aD0iNCIgaGVpZ2h0PSIyMCIgcng9IjIiLz4gPHJlY3QgeD0iMjQiIHk9IjciIHdpZHRoPSI0IiBoZWlnaHQ9IjE3IiByeD0iMiIvPiA8cmVjdCB4PSIyOSIgeT0iMTEiIHdpZHRoPSIzLjUiIGhlaWdodD0iMTMiIHJ4PSIxLjc1Ii8+IDxyZWN0IHg9IjEiIHk9IjIwIiB3aWR0aD0iMTYiIGhlaWdodD0iNSIgcng9IjIuNSIgdHJhbnNmb3JtPSJyb3RhdGUoLTEwNSAxMyAyMykiLz4gPC9nPiA8cGF0aCBmaWxsPSIjNGQ5N2ZmIiBmaWxsLW9wYWNpdHk9Ii41IiBkPSJNMzUgNGExIDEgMCAwIDEgMSAxdjZhMSAxIDAgMCAxLTIgMFY2aC01YTEgMSAwIDAgMSAwLTJ6TTUgMzZhMSAxIDAgMCAxLTEtMXYtNmExIDEgMCAwIDEgMiAwdjVoNWExIDEgMCAwIDEgMCAyeiIvPiA8L2c+PC9zdmc+';

// eslint-disable-next-line max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj4gPGcgZmlsbD0iI2ZmZiI+IDxyZWN0IHg9IjEyIiB5PSIyMSIgd2lkdGg9IjIxIiBoZWlnaHQ9IjEzIiByeD0iNSIvPiA8cmVjdCB4PSIxNCIgeT0iNyIgd2lkdGg9IjQiIGhlaWdodD0iMTciIHJ4PSIyIi8+IDxyZWN0IHg9IjE5IiB5PSI0IiB3aWR0aD0iNCIgaGVpZ2h0PSIyMCIgcng9IjIiLz4gPHJlY3QgeD0iMjQiIHk9IjciIHdpZHRoPSI0IiBoZWlnaHQ9IjE3IiByeD0iMiIvPiA8cmVjdCB4PSIyOSIgeT0iMTEiIHdpZHRoPSIzLjUiIGhlaWdodD0iMTMiIHJ4PSIxLjc1Ii8+IDxyZWN0IHg9IjEiIHk9IjIwIiB3aWR0aD0iMTYiIGhlaWdodD0iNSIgcng9IjIuNSIgdHJhbnNmb3JtPSJyb3RhdGUoLTEwNSAxMyAyMykiLz4gPC9nPjwvc3ZnPg==';

/**
 * Hand keypoint names from the hand-pose-detection model.
 * @readonly
 * @enum {string}
 */
const PARTS = {
    WRIST: 'wrist',
    THUMB_TIP: 'thumb_tip',
    INDEX_FINGER_TIP: 'index_finger_tip',
    MIDDLE_FINGER_TIP: 'middle_finger_tip',
    RING_FINGER_TIP: 'ring_finger_tip',
    PINKY_FINGER_TIP: 'pinky_finger_tip',
    PALM_CENTER: 'palm_center'
};

/**
 * Hand selection options.
 * @readonly
 * @enum {string}
 */
const HAND_CHOICE = {
    LEFT: 'left',
    RIGHT: 'right',
    EITHER: 'either'
};

/**
 * Gesture types.
 * @readonly
 * @enum {string}
 */
const GESTURES = {
    OPEN: 'open',
    CLOSED: 'closed',
    PINCH: 'pinch'
};

/**
 * On/off options for the pinch-drag mode.
 * @readonly
 * @enum {string}
 */
const DRAG_STATE = {
    ON: 'on',
    OFF: 'off'
};

/**
 * Keypoint indices for finger-up detection.
 * For each finger: [tip index, pip/comparison joint index]
 * Thumb uses MCP (index 2) for comparison instead of PIP.
 * @readonly
 */
const FINGER_TIP_PIP = {
    THUMB: [4, 2],
    INDEX: [8, 6],
    MIDDLE: [12, 10],
    RING: [16, 14],
    PINKY: [20, 18]
};

/**
 * Finger choice options for finger angle reporter.
 * @readonly
 * @enum {string}
 */
const FINGER_CHOICE = {
    THUMB: 'thumb',
    INDEX: 'index',
    MIDDLE: 'middle',
    RING: 'ring',
    PINKY: 'pinky'
};

/**
 * Keypoint indices for each finger's [near-tip joint, tip] used to compute
 * finger angle. The near-tip joint is the DIP for fingers and the IP for the thumb.
 * @readonly
 */
const FINGER_NEAR_TIP = {
    [FINGER_CHOICE.THUMB]: [3, 4],
    [FINGER_CHOICE.INDEX]: [7, 8],
    [FINGER_CHOICE.MIDDLE]: [11, 12],
    [FINGER_CHOICE.RING]: [15, 16],
    [FINGER_CHOICE.PINKY]: [19, 20]
};

/**
 * MCP joint indices used to compute palm center.
 */
const PALM_INDICES = [0, 5, 9, 13, 17];

/**
 * Pixel distance between thumb tip and index tip at or below which a pinch is
 * considered active ("on"). Used both to start a pinch and to keep a dragged
 * sprite following the pinch point. Kept tight so the sprite stops following
 * as soon as the fingers begin to open.
 * @type {number}
 */
const PINCH_ON_DISTANCE = 40;

/**
 * Pixel distance above which an active pinch is considered fully released
 * ("off"). Larger than PINCH_ON_DISTANCE to form a hysteresis band: between the
 * two distances an in-progress pinch is held but the sprite stops following, so
 * brief detection glitches don't drop the grab yet the sprite doesn't drift as
 * the fingers spread on release.
 * @type {number}
 */
const PINCH_OFF_DISTANCE = 60;

/**
 * Number of consecutive non-pinch frames required to end a pinch. The pinch
 * state turns on immediately when a pinch is detected, but only turns off after
 * this many frames in a row report no pinch. This hysteresis prevents brief
 * detection glitches (false negatives) from interrupting an ongoing pinch.
 * @type {number}
 */
const PINCH_RELEASE_FRAMES = 3;

/**
 * Class for the Hand Sensing blocks in Scratch 3.0
 * @param {Runtime} runtime - the runtime instantiating this block package.
 * @class
 */
class Scratch3HandSensingBlocks {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;

        /**
         * Cached value for fingers up count
         * @type {number}
         */
        this._cachedFingersUp = 0;

        /**
         * Cached value for pinch distance
         * @type {number}
         */
        this._cachedPinchDistance = 0;

        /**
         * Smoothed value for whether or not a hand was detected
         * @type {boolean}
         */
        this._smoothedIsDetected = false;

        /**
         * History of recent hand-detection results
         * @type {Array.<boolean>}
         */
        this._isDetectedArray = Array.from(
            {length: Scratch3HandSensingBlocks.IS_DETECTED_ARRAY_LENGTH},
            () => false
        );

        /**
         * All detected hands from the latest frame.
         * @type {Array.<object>}
         */
        this._allHands = [];

        /**
         * The currently selected hand (resolved from _allHands based on HAND_CHOICE).
         * @type {object|null}
         */
        this._currentHand = null;

        /**
         * Smoothed (hysteresis-filtered) pinch state per hand, keyed by
         * handedness label ('Left'/'Right').
         * @type {object}
         */
        this._pinchState = {};

        /**
         * Recent raw pinch detection history per hand, keyed by handedness label.
         * Used to apply the release hysteresis.
         * @type {object}
         */
        this._pinchHistory = {};

        /**
         * Active pinch drags, keyed by hand handedness label ('Left'/'Right').
         * Each entry holds the dragged target's id and the offset between the
         * sprite position and the pinch point at the moment it was grabbed.
         * @type {object}
         */
        this._pinchDrags = {};

        /**
         * Whether an estimateHands() call is still in flight. Used to drop frames
         * instead of stacking overlapping inferences on slow devices.
         * @type {boolean}
         */
        this._inferenceInFlight = false;

        this.runtime.emit('EXTENSION_DATA_LOADING', true);

        const model = HandPoseDetection.SupportedModels.MediaPipeHands;
        // Use the 'lite' landmark model (vs. the library default 'full'): roughly
        // 2x faster inference for a small drop in landmark precision that doesn't
        // affect pinch/gesture/finger detection. Important for low-end Chromebooks.
        const detectorConfig = {
            runtime: 'mediapipe',
            solutionPath: '/chunks/mediapipe/hands',
            modelType: 'lite',
            maxHands: 2
        };

        HandPoseDetection.createDetector(model, detectorConfig)
            .catch(() => {
                const fallbackConfig = {
                    runtime: 'mediapipe',
                    solutionPath: `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${mediapipePackage.version}`,
                    modelType: 'lite',
                    maxHands: 2
                };

                return HandPoseDetection.createDetector(model, fallbackConfig);
            })
            .then(detector => {
                this._handDetector = detector;
                if (this.runtime.ioDevices) {
                    this._loop();
                }
            });
    }

    /**
     * After analyzing a frame the amount of milliseconds until another frame
     * is analyzed.
     * @type {number}
     */
    static get INTERVAL () {
        return 1000 / 15;
    }

    /**
     * Dimensions the video stream is analyzed at after it's rendered to the
     * sample canvas.
     * @type {Array.<number>}
     */
    static get DIMENSIONS () {
        return [480, 360];
    }

    /**
     * Maximum length of hand detection history
     * @type {number}
     */
    static get IS_DETECTED_ARRAY_LENGTH () {
        return 5;
    }

    /**
     * Default hand part position when no keypoints are detected.
     * @type {{x: number, y: number}}
     */
    static get DEFAULT_PART_POSITION () {
        return {x: 0, y: 0};
    }

    /**
     * An array of info about the hand part menu choices.
     * @type {object[]}
     */
    get PART_INFO () {
        return [{
            text: formatMessage({
                id: 'handSensing.wrist',
                default: 'wrist',
                description: 'Option for the "go to [PART]" block'
            }),
            value: PARTS.WRIST
        }, {
            text: formatMessage({
                id: 'handSensing.thumbTip',
                default: 'thumb',
                description: 'Option for the "go to [PART]" block'
            }),
            value: PARTS.THUMB_TIP
        }, {
            text: formatMessage({
                id: 'handSensing.indexFingerTip',
                default: 'index finger',
                description: 'Option for the "go to [PART]" block'
            }),
            value: PARTS.INDEX_FINGER_TIP
        }, {
            text: formatMessage({
                id: 'handSensing.middleFingerTip',
                default: 'middle finger',
                description: 'Option for the "go to [PART]" block'
            }),
            value: PARTS.MIDDLE_FINGER_TIP
        }, {
            text: formatMessage({
                id: 'handSensing.ringFingerTip',
                default: 'ring finger',
                description: 'Option for the "go to [PART]" block'
            }),
            value: PARTS.RING_FINGER_TIP
        }, {
            text: formatMessage({
                id: 'handSensing.pinkyFingerTip',
                default: 'pinky finger',
                description: 'Option for the "go to [PART]" block'
            }),
            value: PARTS.PINKY_FINGER_TIP
        }, {
            text: formatMessage({
                id: 'handSensing.palmCenter',
                default: 'palm',
                description: 'Option for the "go to [PART]" block'
            }),
            value: PARTS.PALM_CENTER
        }];
    }

    /**
     * An array of info about the hand choice menu.
     * @type {object[]}
     */
    get HAND_INFO () {
        return [{
            text: formatMessage({
                id: 'handSensing.either',
                default: 'either',
                description: 'Option to detect either hand'
            }),
            value: HAND_CHOICE.EITHER
        }, {
            text: formatMessage({
                id: 'handSensing.left',
                default: 'left',
                description: 'Option to detect the left hand'
            }),
            value: HAND_CHOICE.LEFT
        }, {
            text: formatMessage({
                id: 'handSensing.right',
                default: 'right',
                description: 'Option to detect the right hand'
            }),
            value: HAND_CHOICE.RIGHT
        }];
    }

    /**
     * Hand choice menu without the "either" option (for fingersUp and pinchDistance).
     * @type {object[]}
     */
    get HAND_LR_INFO () {
        return [{
            text: formatMessage({
                id: 'handSensing.left',
                default: 'left',
                description: 'Option to detect the left hand'
            }),
            value: HAND_CHOICE.LEFT
        }, {
            text: formatMessage({
                id: 'handSensing.right',
                default: 'right',
                description: 'Option to detect the right hand'
            }),
            value: HAND_CHOICE.RIGHT
        }];
    }

    /**
     * An array of info about the finger menu choices.
     * @type {object[]}
     */
    get FINGER_INFO () {
        return [{
            text: formatMessage({
                id: 'handSensing.thumb',
                default: 'thumb',
                description: 'Option for the thumb in finger angle reporter'
            }),
            value: FINGER_CHOICE.THUMB
        }, {
            text: formatMessage({
                id: 'handSensing.index',
                default: 'index finger',
                description: 'Option for the index finger in finger angle reporter'
            }),
            value: FINGER_CHOICE.INDEX
        }, {
            text: formatMessage({
                id: 'handSensing.middle',
                default: 'middle finger',
                description: 'Option for the middle finger in finger angle reporter'
            }),
            value: FINGER_CHOICE.MIDDLE
        }, {
            text: formatMessage({
                id: 'handSensing.ring',
                default: 'ring finger',
                description: 'Option for the ring finger in finger angle reporter'
            }),
            value: FINGER_CHOICE.RING
        }, {
            text: formatMessage({
                id: 'handSensing.pinky',
                default: 'pinky finger',
                description: 'Option for the pinky finger in finger angle reporter'
            }),
            value: FINGER_CHOICE.PINKY
        }];
    }

    /**
     * An array of info about the gesture menu.
     * @type {object[]}
     */
    /**
     * Gesture menu for hat blocks (verb forms: opens, closes, pinches).
     * @type {object[]}
     */
    get GESTURE_HAT_INFO () {
        return [{
            text: formatMessage({
                id: 'handSensing.gestureOpens',
                default: 'opens',
                description: 'Option for hand opening gesture (hat block)'
            }),
            value: GESTURES.OPEN
        }, {
            text: formatMessage({
                id: 'handSensing.gestureCloses',
                default: 'closes',
                description: 'Option for hand closing gesture (hat block)'
            }),
            value: GESTURES.CLOSED
        }, {
            text: formatMessage({
                id: 'handSensing.gesturePinches',
                default: 'pinches',
                description: 'Option for pinch gesture (hat block)'
            }),
            value: GESTURES.PINCH
        }];
    }

    /**
     * Gesture menu for boolean blocks (state forms: open, closed, pinching).
     * @type {object[]}
     */
    get GESTURE_STATE_INFO () {
        return [{
            text: formatMessage({
                id: 'handSensing.gestureOpen',
                default: 'open',
                description: 'Option for hand open state (boolean block)'
            }),
            value: GESTURES.OPEN
        }, {
            text: formatMessage({
                id: 'handSensing.gestureClosed',
                default: 'closed',
                description: 'Option for hand closed state (boolean block)'
            }),
            value: GESTURES.CLOSED
        }, {
            text: formatMessage({
                id: 'handSensing.gesturePinching',
                default: 'pinching',
                description: 'Option for pinching state (boolean block)'
            }),
            value: GESTURES.PINCH
        }];
    }

    /**
     * On/off menu for the pinch-drag command.
     * @type {object[]}
     */
    get DRAG_INFO () {
        return [{
            text: formatMessage({
                id: 'handSensing.on',
                default: 'on',
                description: 'Option to turn pinch dragging on'
            }),
            value: DRAG_STATE.ON
        }, {
            text: formatMessage({
                id: 'handSensing.off',
                default: 'off',
                description: 'Option to turn pinch dragging off'
            }),
            value: DRAG_STATE.OFF
        }];
    }

    /**
     * Select a hand from _allHands based on the given hand choice.
     * @param {string} handChoice - one of HAND_CHOICE values
     * @returns {object|null} the matching hand, or null
     * @private
     */
    _selectHand (handChoice) {
        if (this._allHands.length === 0) return null;

        if (handChoice === HAND_CHOICE.EITHER) {
            return this._allHands[0];
        }

        // MediaPipe labels are from the camera's perspective (mirrored).
        // A "Right" label from MediaPipe corresponds to the user's right hand
        // when the video is mirrored (which Scratch does by default).
        const targetLabel = handChoice === HAND_CHOICE.RIGHT ? 'Right' : 'Left';
        return this._allHands.find(h => h.handedness === targetLabel) || null;
    }

    /**
     * Occasionally step a loop to sample the video, stamp it to the preview
     * skin, and add a TypedArray copy of the canvas's pixel data.
     * @private
     */
    _loop () {
        setTimeout(this._loop.bind(this), Math.max(this.runtime.currentStepTime, Scratch3HandSensingBlocks.INTERVAL));

        if (!this._firstTime && this._videoLoadingCompleted) {
            this.runtime.emit('EXTENSION_DATA_LOADING', false);
            this._firstTime = true;
        }

        // Skip inference while the page is hidden (e.g. a backgrounded tab) so we
        // don't burn CPU/GPU/battery on a camera the user can't see. The loop keeps
        // rescheduling and resumes automatically once the page is visible again.
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            return;
        }

        // Skip if a previous inference is still running. On slow devices estimateHands
        // can take longer than INTERVAL; without this guard calls would stack into a
        // growing backlog. Dropping frames instead lets the loop self-adapt to
        // whatever framerate the hardware can sustain.
        if (this._inferenceInFlight) {
            return;
        }

        const frame = this.runtime.ioDevices.video.getFrame({
            format: Video.FORMAT_IMAGE_DATA,
            dimensions: Scratch3HandSensingBlocks.DIMENSIONS,
            cacheTimeout: this.runtime.currentStepTime
        });
        if (frame) {
            this._inferenceInFlight = true;
            this._handDetector.estimateHands(frame)
                .then(hands => {
                    if (hands && hands.length > 0) {
                        if (!this._firstTime) {
                            this._firstTime = true;
                            this.runtime.emit('EXTENSION_DATA_LOADING', false);
                        }
                        this._allHands = hands;
                        this._currentHand = hands[0];
                    } else {
                        this._allHands = [];
                        this._currentHand = null;
                    }
                    this._updateIsDetected();
                    this._updatePinchStates();
                    this._updatePinchDrags();
                })
                .finally(() => {
                    this._inferenceInFlight = false;
                });
        }
    }

    /**
     * Update the smoothed hand-detection state based on the most recent result.
     * @private
     */
    _updateIsDetected () {
        this._isDetectedArray.push(!!this._currentHand);

        if (this._isDetectedArray.length > Scratch3HandSensingBlocks.IS_DETECTED_ARRAY_LENGTH) {
            this._isDetectedArray.shift();
        }

        if (this._isDetectedArray.every(item => item === false)) {
            this._smoothedIsDetected = false;
        }

        if (this._isDetectedArray.every(item => item === true)) {
            this._smoothedIsDetected = true;
        }
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        // Enable the video layer
        this.runtime.ioDevices.video.enableVideo()
            .finally(() => {
                this._videoLoadingCompleted = true;
            });

        return {
            id: 'handSensing',
            name: formatMessage({
                id: 'handSensing.categoryName',
                default: 'Hand Sensing',
                description: 'Name of hand sensing extension'
            }),
            blockIconURI: blockIconURI,
            menuIconURI: menuIconURI,
            blocks: [
                {
                    opcode: 'goToPart',
                    text: formatMessage({
                        id: 'handSensing.goToPart',
                        default: 'go to [PART] of [HAND] hand',
                        description: 'Command that moves target to [PART] of [HAND] hand'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        PART: {
                            type: ArgumentType.STRING,
                            menu: 'PART',
                            defaultValue: PARTS.INDEX_FINGER_TIP
                        },
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'HAND',
                            defaultValue: HAND_CHOICE.LEFT
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'pointInDirectionOfFinger',
                    text: formatMessage({
                        id: 'handSensing.pointInDirectionOfFinger',
                        default: 'point in direction of [HAND] [FINGER]',
                        description: 'Command that points the sprite the way a finger is pointing'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'HAND_LR',
                            defaultValue: HAND_CHOICE.LEFT
                        },
                        FINGER: {
                            type: ArgumentType.STRING,
                            menu: 'FINGER',
                            defaultValue: FINGER_CHOICE.INDEX
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                '---',
                {
                    opcode: 'setPinchDrag',
                    text: formatMessage({
                        id: 'handSensing.setPinchDrag',
                        default: 'set pinch dragging [STATE]',
                        description: 'Command that turns pinch-to-drag mode on or off'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        STATE: {
                            type: ArgumentType.STRING,
                            menu: 'DRAG_STATE',
                            defaultValue: DRAG_STATE.ON
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                '---',
                {
                    opcode: 'whenGesture',
                    text: formatMessage({
                        id: 'handSensing.whenGesture',
                        default: 'when [HAND] hand [GESTURE]',
                        description: 'Event that triggers when a hand gesture is detected'
                    }),
                    blockType: BlockType.HAT,
                    arguments: {
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'HAND',
                            defaultValue: HAND_CHOICE.EITHER
                        },
                        GESTURE: {
                            type: ArgumentType.STRING,
                            menu: 'GESTURE_HAT',
                            defaultValue: GESTURES.OPEN
                        }
                    }
                },
                {
                    opcode: 'whenSpriteTouchesPart',
                    text: formatMessage({
                        id: 'handSensing.whenSpriteTouchesPart',
                        default: 'when this sprite touches [HAND] [PART]',
                        description: 'Event that triggers when sprite touches a [PART] on [HAND] hand'
                    }),
                    arguments: {
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'HAND',
                            defaultValue: HAND_CHOICE.EITHER
                        },
                        PART: {
                            type: ArgumentType.STRING,
                            menu: 'PART',
                            defaultValue: PARTS.INDEX_FINGER_TIP
                        }
                    },
                    blockType: BlockType.HAT,
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'whenHandDetected',
                    text: formatMessage({
                        id: 'handSensing.whenHandDetected',
                        default: 'when [HAND] hand detected',
                        description: 'Event that triggers when a hand is detected'
                    }),
                    blockType: BlockType.HAT,
                    arguments: {
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'HAND',
                            defaultValue: HAND_CHOICE.EITHER
                        }
                    }
                },
                '---',
                {
                    opcode: 'fingersUp',
                    text: formatMessage({
                        id: 'handSensing.fingersUp',
                        default: '# of fingers up on [HAND] hand',
                        description: 'Reporter that returns the number of fingers up'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'HAND_LR',
                            defaultValue: HAND_CHOICE.LEFT
                        }
                    }
                },
                {
                    opcode: 'pinchDistance',
                    text: formatMessage({
                        id: 'handSensing.pinchDistance',
                        default: 'pinch distance of [HAND] hand',
                        description: 'Reporter that returns the distance between thumb and index finger'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'HAND_LR',
                            defaultValue: HAND_CHOICE.LEFT
                        }
                    }
                },
                {
                    opcode: 'handIsDetected',
                    text: formatMessage({
                        id: 'handSensing.handDetected',
                        default: '[HAND] hand detected?',
                        description: 'Reporter that returns whether a hand is detected'
                    }),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'HAND',
                            defaultValue: HAND_CHOICE.LEFT
                        }
                    }
                },
                {
                    opcode: 'gestureDetected',
                    text: formatMessage({
                        id: 'handSensing.gestureDetected',
                        default: '[HAND] hand [GESTURE]?',
                        description: 'Boolean that returns whether a gesture is detected'
                    }),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'HAND',
                            defaultValue: HAND_CHOICE.LEFT
                        },
                        GESTURE: {
                            type: ArgumentType.STRING,
                            menu: 'GESTURE_STATE',
                            defaultValue: GESTURES.OPEN
                        }
                    }
                },
                {
                    opcode: 'handAngle',
                    text: formatMessage({
                        id: 'handSensing.handAngle',
                        default: 'angle of [HAND] hand',
                        description: 'Reporter that returns the angle of the hand'
                    }),
                    blockType: BlockType.REPORTER,
                    // Hidden from the palette but still registered so existing
                    // projects that use this block continue to load and run.
                    hideFromPalette: true,
                    arguments: {
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'HAND_LR',
                            defaultValue: HAND_CHOICE.LEFT
                        }
                    }
                },
                {
                    opcode: 'fingerAngle',
                    text: formatMessage({
                        id: 'handSensing.fingerAngle',
                        default: 'angle of [HAND] [FINGER]',
                        description: 'Reporter that returns the angle of a finger'
                    }),
                    blockType: BlockType.REPORTER,
                    // Hidden from the palette but still registered so existing
                    // projects that use this block continue to load and run.
                    hideFromPalette: true,
                    arguments: {
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'HAND_LR',
                            defaultValue: HAND_CHOICE.LEFT
                        },
                        FINGER: {
                            type: ArgumentType.STRING,
                            menu: 'FINGER',
                            defaultValue: FINGER_CHOICE.INDEX
                        }
                    }
                }
            ],
            menus: {
                PART: this.PART_INFO,
                HAND: this.HAND_INFO,
                HAND_LR: this.HAND_LR_INFO,
                FINGER: this.FINGER_INFO,
                GESTURE_HAT: this.GESTURE_HAT_INFO,
                GESTURE_STATE: this.GESTURE_STATE_INFO,
                DRAG_STATE: this.DRAG_INFO
            }
        };
    }

    /**
     * Compute the palm center as the centroid of the wrist and MCP joints.
     * @param {object} hand - the hand object to use
     * @returns {{x: number, y: number}} Coordinates of the palm center.
     * @private
     */
    _getPalmCenterPosition (hand) {
        if (!hand || !hand.keypoints) {
            return Scratch3HandSensingBlocks.DEFAULT_PART_POSITION;
        }

        let sumX = 0;
        let sumY = 0;
        let count = 0;
        for (const idx of PALM_INDICES) {
            const kp = hand.keypoints[idx];
            if (kp) {
                sumX += kp.x;
                sumY += kp.y;
                count++;
            }
        }
        if (count === 0) return Scratch3HandSensingBlocks.DEFAULT_PART_POSITION;

        return toScratchCoords({x: sumX / count, y: sumY / count});
    }

    /**
     * Get the position of a given hand keypoint.
     * @param {string} part - Part of the hand to be detected
     * @param {object} hand - the hand object to use (defaults to _currentHand)
     * @returns {{x: number, y: number}} Coordinates of the detected keypoint.
     * @private
     */
    _getPartPosition (part, hand) {
        const h = hand || this._currentHand;
        const defaultPos = Scratch3HandSensingBlocks.DEFAULT_PART_POSITION;

        if (!h) return defaultPos;
        if (!h.keypoints) return defaultPos;

        if (part === PARTS.PALM_CENTER) {
            return this._getPalmCenterPosition(h);
        }

        const result = h.keypoints.find(kp => kp.name === part);
        if (result) {
            return toScratchCoords(result);
        }
        return defaultPos;
    }

    /**
     * Count the number of extended fingers on a given hand.
     * @param {object} hand - the hand object to analyze
     * @returns {number} Number of fingers up (0-5).
     * @private
     */
    _countFingersUpForHand (hand) {
        if (!hand || !hand.keypoints) return 0;

        const kps = hand.keypoints;
        let count = 0;

        // Thumb: compare tip x vs ip x based on handedness
        const thumbTip = kps[FINGER_TIP_PIP.THUMB[0]];
        const thumbIp = kps[FINGER_TIP_PIP.THUMB[1]];
        if (thumbTip && thumbIp) {
            const handedness = hand.handedness;
            if (handedness === 'Right') {
                if (thumbTip.x < thumbIp.x) count++;
            } else {
                if (thumbTip.x > thumbIp.x) count++;
            }
        }

        // Other fingers: tip y < pip y means finger is up (in image coords, lower y = higher)
        const fingers = [FINGER_TIP_PIP.INDEX, FINGER_TIP_PIP.MIDDLE, FINGER_TIP_PIP.RING, FINGER_TIP_PIP.PINKY];
        for (const [tipIdx, pipIdx] of fingers) {
            const tip = kps[tipIdx];
            const pip = kps[pipIdx];
            if (tip && pip && tip.y < pip.y) {
                count++;
            }
        }

        return count;
    }

    /**
     * Check if a finger is extended (up) on a given hand.
     * @param {object} hand - the hand object
     * @param {Array.<number>} fingerPair - [tipIdx, pipIdx]
     * @returns {boolean} true if the finger is up
     * @private
     */
    _isFingerUp (hand, fingerPair) {
        if (!hand || !hand.keypoints) return false;
        const tip = hand.keypoints[fingerPair[0]];
        const pip = hand.keypoints[fingerPair[1]];
        return tip && pip && tip.y < pip.y;
    }

    /**
     * Check if the thumb is extended on a given hand.
     * @param {object} hand - the hand object
     * @returns {boolean} true if thumb is up
     * @private
     */
    _isThumbUp (hand) {
        if (!hand || !hand.keypoints) return false;
        const thumbTip = hand.keypoints[FINGER_TIP_PIP.THUMB[0]];
        const thumbIp = hand.keypoints[FINGER_TIP_PIP.THUMB[1]];
        if (!thumbTip || !thumbIp) return false;
        if (hand.handedness === 'Right') {
            return thumbTip.x < thumbIp.x;
        }
        return thumbTip.x > thumbIp.x;
    }

    /**
     * Check if a finger is curled (down) on a given hand.
     * @param {object} hand - the hand object
     * @param {Array.<number>} fingerPair - [tipIdx, pipIdx]
     * @returns {boolean} true if the finger is curled
     * @private
     */
    _isFingerDown (hand, fingerPair) {
        if (!hand || !hand.keypoints) return false;
        const tip = hand.keypoints[fingerPair[0]];
        const pip = hand.keypoints[fingerPair[1]];
        return tip && pip && tip.y >= pip.y;
    }

    /**
     * Get the raw pixel distance between thumb tip and index finger tip.
     * @param {object} hand - the hand object
     * @returns {number} distance in pixels, or -1 if unavailable
     * @private
     */
    _getThumbIndexDistance (hand) {
        if (!hand || !hand.keypoints) return -1;
        const thumbTip = hand.keypoints[4]; // thumb_tip
        const indexTip = hand.keypoints[8]; // index_finger_tip
        if (!thumbTip || !indexTip) return -1;
        const dx = thumbTip.x - indexTip.x;
        const dy = thumbTip.y - indexTip.y;
        return Math.sqrt((dx * dx) + (dy * dy));
    }

    /**
     * Update the hysteresis-filtered pinch state for each detected hand. Called
     * once per detection frame.
     *
     * Two levels of hysteresis are applied:
     *  - Distance (Schmitt trigger): a pinch starts when the fingers close to
     *    within PINCH_ON_DISTANCE and is only let go once they open past the
     *    larger PINCH_OFF_DISTANCE.
     *  - Time: the "off" transition additionally requires PINCH_RELEASE_FRAMES
     *    consecutive non-pinch frames, so a brief detection glitch does not drop
     *    an ongoing pinch.
     * @private
     */
    _updatePinchStates () {
        const seen = new Set();
        for (const hand of this._allHands) {
            const label = hand.handedness;
            if (!label) continue;
            seen.add(label);

            const dist = this._getThumbIndexDistance(hand);
            // Asymmetric distance threshold: harder to keep a pinch alive than
            // to start one would cause drift on release, so instead we require a
            // tight pinch to start (PINCH_ON_DISTANCE) and only fully release
            // once clearly open (PINCH_OFF_DISTANCE).
            const wasPinching = this._pinchState[label] === true;
            const threshold = wasPinching ? PINCH_OFF_DISTANCE : PINCH_ON_DISTANCE;
            const rawPinch = dist >= 0 && dist < threshold;

            const history = this._pinchHistory[label] || [];
            history.push(rawPinch);
            if (history.length > PINCH_RELEASE_FRAMES) {
                history.shift();
            }
            this._pinchHistory[label] = history;

            if (rawPinch) {
                // Turn on immediately.
                this._pinchState[label] = true;
            } else if (history.length >= PINCH_RELEASE_FRAMES && history.every(p => !p)) {
                // Turn off only after a sustained release.
                this._pinchState[label] = false;
            }
            // Otherwise hold the previous state (hysteresis window).
        }

        // Clear state for any hand no longer detected this frame.
        for (const label of Object.keys(this._pinchState)) {
            if (!seen.has(label)) {
                this._pinchState[label] = false;
                this._pinchHistory[label] = [];
            }
        }
    }

    /**
     * Whether a hand is tightly pinching right now (fingers within
     * PINCH_ON_DISTANCE), ignoring the hysteresis hold. A dragged sprite only
     * follows the pinch point while this is true, so it stops moving as soon as
     * the fingers begin to open rather than drifting until the full release.
     * @param {object} hand - the hand object
     * @returns {boolean} true if the fingers are tightly pinched
     * @private
     */
    _isHandTightlyPinching (hand) {
        const dist = this._getThumbIndexDistance(hand);
        return dist >= 0 && dist < PINCH_ON_DISTANCE;
    }

    /**
     * Whether a hand is pinching, using the hysteresis-filtered state.
     * Falls back to a raw distance check for hands with no handedness label.
     * @param {object} hand - the hand object
     * @returns {boolean} true if the hand is considered to be pinching
     * @private
     */
    _isHandPinching (hand) {
        if (!hand) return false;
        const label = hand.handedness;
        if (label && Object.prototype.hasOwnProperty.call(this._pinchState, label)) {
            return this._pinchState[label];
        }
        const dist = this._getThumbIndexDistance(hand);
        return dist >= 0 && dist < PINCH_ON_DISTANCE;
    }


    /**
     * Detect whether a specific gesture is occurring on the selected hand(s).
     * @param {string} gesture - the gesture to detect
     * @param {string} handChoice - one of HAND_CHOICE values
     * @returns {boolean} true if the gesture is detected
     * @private
     */
    _detectGesture (gesture, handChoice) {
        if (handChoice === HAND_CHOICE.EITHER) {
            for (const hand of this._allHands) {
                if (this._detectGestureOnHand(gesture, hand)) return true;
            }
            return false;
        }
        const hand = this._selectHand(handChoice);
        return this._detectGestureOnHand(gesture, hand);
    }

    /**
     * Detect whether a specific gesture is occurring on a given hand.
     * @param {string} gesture - the gesture to detect
     * @param {object} hand - the hand object
     * @returns {boolean} true if the gesture is detected
     * @private
     */
    _detectGestureOnHand (gesture, hand) {
        if (!hand || !hand.keypoints) return false;

        switch (gesture) {
        case GESTURES.OPEN: {
            // All 5 fingers extended
            return this._isThumbUp(hand) &&
                this._isFingerUp(hand, FINGER_TIP_PIP.INDEX) &&
                this._isFingerUp(hand, FINGER_TIP_PIP.MIDDLE) &&
                this._isFingerUp(hand, FINGER_TIP_PIP.RING) &&
                this._isFingerUp(hand, FINGER_TIP_PIP.PINKY);
        }
        case GESTURES.CLOSED: {
            // All fingers curled (fist)
            return !this._isThumbUp(hand) &&
                this._isFingerDown(hand, FINGER_TIP_PIP.INDEX) &&
                this._isFingerDown(hand, FINGER_TIP_PIP.MIDDLE) &&
                this._isFingerDown(hand, FINGER_TIP_PIP.RING) &&
                this._isFingerDown(hand, FINGER_TIP_PIP.PINKY);
        }
        case GESTURES.PINCH: {
            return this._isHandPinching(hand);
        }
        default:
            return false;
        }
    }

    /**
     * A scratch command block handle that moves a target to a given hand keypoint
     * @param {object} args - the block arguments
     * @param {BlockUtility} util - the block utility
     */
    goToPart (args, util) {
        const hand = this._selectHand(args.HAND);
        if (!hand) return;

        const pos = this._getPartPosition(args.PART, hand);
        util.target.setXY(pos.x, pos.y);
    }

    /**
     * A scratch hat block that triggers when a gesture is detected.
     * @param {object} args - the block arguments
     * @returns {boolean} true if the gesture is detected
     */
    whenGesture (args) {
        return this._detectGesture(args.GESTURE, args.HAND);
    }

    /**
     * A scratch boolean block that reports whether a gesture is detected on a hand.
     * @param {object} args - the block arguments
     * @returns {boolean} true if the gesture is detected
     */
    gestureDetected (args) {
        return this._detectGesture(args.GESTURE, args.HAND);
    }

    /**
     * A scratch hat block handle that reports whether
     * a target sprite is touching a given hand keypoint
     * @param {object} args - the block arguments
     * @param {BlockUtility} util - the block utility
     * @returns {boolean} - true if the sprite is touching the given point
     */
    whenSpriteTouchesPart (args, util) {
        const hand = this._selectHand(args.HAND);
        if (!hand) return false;
        if (!hand.keypoints) return false;

        const pos = this._getPartPosition(args.PART, hand);
        return util.target.isTouchingScratchPoint(pos.x, pos.y);
    }

    /**
     * A scratch hat block handle that reports whether
     * a hand is detected
     * @param {object} args - the block arguments
     * @returns {boolean} - true a hand was detected
     */
    whenHandDetected (args) {
        const hand = this._selectHand(args.HAND);
        return !!hand;
    }

    /**
     * A scratch boolean block handle that reports whether
     * a hand is detected
     * @param {object} args - the block arguments
     * @returns {boolean} - true a hand was detected
     */
    handIsDetected (args) {
        const hand = this._selectHand(args.HAND);
        return !!hand;
    }

    /**
     * A scratch reporter block handle that returns the number of fingers up.
     * @param {object} args - the block arguments
     * @returns {number} the number of fingers up (0-5)
     */
    fingersUp (args) {
        const hand = this._selectHand(args.HAND);
        if (!hand) return this._cachedFingersUp;
        const count = this._countFingersUpForHand(hand);
        this._cachedFingersUp = count;
        return count;
    }

    /**
     * A scratch reporter that returns the distance between thumb tip and index finger tip.
     * @param {object} args - the block arguments
     * @returns {number} distance in pixels
     */
    pinchDistance (args) {
        const hand = this._selectHand(args.HAND);
        if (!hand) return this._cachedPinchDistance;
        const dist = this._getThumbIndexDistance(hand);
        if (dist < 0) return this._cachedPinchDistance;
        this._cachedPinchDistance = Math.round(dist);
        return this._cachedPinchDistance;
    }

    /**
     * Compute the angle of a vector from point A to point B. Up is 90°, and
     * rotation is clockwise-positive (matching Scratch's `point in direction`
     * sense), so up→right→down→left → 90°→180°→-90°→0°. Both points are in
     * raw (image) coordinates; conversion to Scratch coords happens here.
     * @param {{x: number, y: number}} a - the starting point in image coords
     * @param {{x: number, y: number}} b - the ending point in image coords
     * @returns {number} angle in degrees, normalized to (-180, 180]
     * @private
     */
    _angleBetween (a, b) {
        const sa = toScratchCoords(a);
        const sb = toScratchCoords(b);
        const dx = sb.x - sa.x;
        const dy = sb.y - sa.y;
        let deg = (Math.atan2(dx, dy) * 180 / Math.PI) + 90;
        if (deg > 180) deg -= 360;
        return Math.round(deg);
    }

    /**
     * A scratch command block that turns pinch-to-drag mode on or off for the
     * calling sprite. While on, pinching the thumb and index finger together
     * over this sprite's pixels grabs it and makes it follow the pinch until the
     * pinch is released. The setting is isolated per sprite (and per clone).
     * @param {object} args - the block arguments
     * @param {BlockUtility} util - the block utility
     */
    setPinchDrag (args, util) {
        const enabled = args.STATE === DRAG_STATE.ON;
        util.target.pinchDragEnabled = enabled;
        if (!enabled) {
            // Immediately release any active drag of this sprite.
            for (const label of Object.keys(this._pinchDrags)) {
                if (this._pinchDrags[label].targetId === util.target.id) {
                    this._releaseDrag(label);
                }
            }
        }
    }

    /**
     * Get the pinch point (midpoint of thumb tip and index tip) for a hand,
     * in Scratch coordinates.
     * @param {object} hand - the hand object
     * @returns {?{x: number, y: number}} the pinch point, or null if unavailable
     * @private
     */
    _getPinchPoint (hand) {
        if (!hand || !hand.keypoints) return null;
        const thumbTip = hand.keypoints[4];
        const indexTip = hand.keypoints[8];
        if (!thumbTip || !indexTip) return null;
        return toScratchCoords({
            x: (thumbTip.x + indexTip.x) / 2,
            y: (thumbTip.y + indexTip.y) / 2
        });
    }

    /**
     * Find the topmost pinch-draggable sprite whose pixels are touched by the
     * given point.
     * @param {number} x - Scratch x coordinate
     * @param {number} y - Scratch y coordinate
     * @param {Set.<string>} excludeIds - target ids to ignore (already being dragged)
     * @returns {?RenderedTarget} the topmost touched sprite, or null
     * @private
     */
    _pickTopSpriteAt (x, y, excludeIds) {
        const candidates = this.runtime.targets.filter(t =>
            !t.isStage &&
            t.pinchDragEnabled &&
            t.visible &&
            !excludeIds.has(t.id) &&
            t.isTouchingScratchPoint(x, y)
        );
        if (candidates.length === 0) return null;

        // Pick the frontmost candidate using the renderer's draw order
        // (drawables later in the list are drawn on top).
        const drawList = this.runtime.renderer && this.runtime.renderer._drawList;
        if (!drawList) return candidates[candidates.length - 1];

        let top = candidates[0];
        let topOrder = drawList.indexOf(top.drawableID);
        for (const t of candidates) {
            const order = drawList.indexOf(t.drawableID);
            if (order > topOrder) {
                topOrder = order;
                top = t;
            }
        }
        return top;
    }

    /**
     * Release a single active pinch drag and take its sprite out of the drag state.
     * @param {string} label - the handedness label keying the drag
     * @private
     */
    _releaseDrag (label) {
        const drag = this._pinchDrags[label];
        if (!drag) return;
        const target = this.runtime.getTargetById(drag.targetId);
        if (target) target.stopDrag();
        delete this._pinchDrags[label];
    }

    /**
     * Update pinch drags for the latest frame: release drags whose hand stopped
     * pinching, start new drags for pinching hands over a sprite, and move
     * already-grabbed sprites to follow their pinch point.
     * @private
     */
    _updatePinchDrags () {
        // Map each currently pinching hand by its handedness label, using the
        // hysteresis-filtered pinch state so glitches don't interrupt a drag.
        const pinchingByLabel = {};
        for (const hand of this._allHands) {
            if (hand.handedness && this._isHandPinching(hand)) {
                pinchingByLabel[hand.handedness] = hand;
            }
        }

        // Release drags whose hand stopped pinching, or whose sprite is gone or
        // is no longer pinch-draggable.
        for (const label of Object.keys(this._pinchDrags)) {
            const target = this.runtime.getTargetById(this._pinchDrags[label].targetId);
            if (!pinchingByLabel[label] || !target || !target.pinchDragEnabled) {
                this._releaseDrag(label);
            }
        }

        // Sprites already grabbed by another hand should not be grabbed again.
        const grabbedIds = new Set(
            Object.values(this._pinchDrags).map(drag => drag.targetId)
        );

        for (const label of Object.keys(pinchingByLabel)) {
            const hand = pinchingByLabel[label];
            const pinchPoint = this._getPinchPoint(hand);
            if (!pinchPoint) continue;

            const existing = this._pinchDrags[label];
            if (existing) {
                const target = this.runtime.getTargetById(existing.targetId);
                if (!target) {
                    delete this._pinchDrags[label];
                    continue;
                }
                if (this._isHandTightlyPinching(hand)) {
                    // Follow the pinch, even if it has moved off the sprite.
                    target.setXY(
                        pinchPoint.x + existing.offsetX,
                        pinchPoint.y + existing.offsetY,
                        true
                    );
                } else {
                    // Fingers have started to open: keep the grab (in case this
                    // is a glitch or the fingers re-close) but freeze the sprite
                    // so it doesn't drift. Re-anchor the offset to the current
                    // position so re-tightening resumes seamlessly.
                    existing.offsetX = target.x - pinchPoint.x;
                    existing.offsetY = target.y - pinchPoint.y;
                }
            } else {
                // Try to grab a sprite under the pinch point.
                const target = this._pickTopSpriteAt(pinchPoint.x, pinchPoint.y, grabbedIds);
                if (!target) continue;
                target.goToFront();
                target.startDrag();
                this._pinchDrags[label] = {
                    targetId: target.id,
                    offsetX: target.x - pinchPoint.x,
                    offsetY: target.y - pinchPoint.y
                };
                grabbedIds.add(target.id);
            }
        }
    }

    /**
     * A scratch reporter that returns the angle of the hand,
     * measured from the wrist toward the middle finger MCP joint.
     * @param {object} args - the block arguments
     * @returns {number} angle in degrees (Scratch convention)
     */
    handAngle (args) {
        const hand = this._selectHand(args.HAND);
        if (!hand || !hand.keypoints) return 0;
        const wrist = hand.keypoints[0];
        const middleMcp = hand.keypoints[9];
        if (!wrist || !middleMcp) return 0;
        return this._angleBetween(wrist, middleMcp);
    }

    /**
     * A scratch reporter that returns the angle of a finger,
     * measured from the joint nearest the tip (DIP, or IP for the thumb) toward the tip.
     * @param {object} args - the block arguments
     * @returns {number} angle in degrees (Scratch convention)
     */
    fingerAngle (args) {
        const hand = this._selectHand(args.HAND);
        if (!hand || !hand.keypoints) return 0;
        const indices = FINGER_NEAR_TIP[args.FINGER];
        if (!indices) return 0;
        const nearTip = hand.keypoints[indices[0]];
        const tip = hand.keypoints[indices[1]];
        if (!nearTip || !tip) return 0;
        return this._angleBetween(nearTip, tip);
    }

    /**
     * A scratch command that points the sprite the way a finger is pointing,
     * measured from the joint nearest the tip (DIP, or IP for the thumb) toward the tip.
     * @param {object} args - the block arguments
     * @param {BlockUtility} util - the block utility
     */
    pointInDirectionOfFinger (args, util) {
        const hand = this._selectHand(args.HAND);
        if (!hand || !hand.keypoints) return;
        const indices = FINGER_NEAR_TIP[args.FINGER];
        if (!indices) return;
        const nearTip = hand.keypoints[indices[0]];
        const tip = hand.keypoints[indices[1]];
        if (!nearTip || !tip) return;
        util.target.setDirection(this._angleBetween(nearTip, tip));
    }

}

module.exports = Scratch3HandSensingBlocks;
