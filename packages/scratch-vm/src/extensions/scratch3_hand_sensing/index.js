const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const formatMessage = require('format-message');
const Video = require('../../io/video');
const TargetType = require('../../extension-support/target-type');
const {distance, toScratchCoords} = require('./utils');

const HandPoseDetection = require('@tensorflow-models/hand-pose-detection');
const mediapipePackage = require('@mediapipe/hands/package.json');

// eslint-disable-next-line max-len
const menuIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBmaWxsPSIjNGM5N2ZmIiBkPSJNMjAgNkMxMy40IDYgOCAxMS40IDggMThzNS40IDEyIDEyIDEyIDEyLTUuNCAxMi0xMlMyNi42IDYgMjAgNm0wIDJhMTAgMTAgMCAxIDEgMCAyMCAxMCAxMCAwIDAgMSAwLTIwIi8+PHBhdGggZmlsbD0iIzRjOTdmZiIgZD0iTTIwIDI4Yy0uNiAwLTEtLjQtMS0xdi00YzAtLjYuNC0xIDEtMXMxIC40IDEgMXY0YzAgLjYtLjQgMS0xIDFNMTYgMjZjLS42IDAtMS0uNC0xLTF2LTVjMC0uNi40LTEgMS0xczEgLjQgMSAxdjVjMCAuNi0uNCAxLTEgMU0yNCAyNmMtLjYgMC0xLS40LTEtMXYtNWMwLS42LjQtMSAxLTFzMSAuNCAxIDF2NWMwIC42LS40IDEtMSAxTTEzIDIzYy0uNiAwLTEtLjQtMS0xdi0zYzAtLjYuNC0xIDEtMXMxIC40IDEgMXYzYzAgLjYtLjQgMS0xIDFNMjcgMjNjLS42IDAtMS0uNC0xLTF2LTNjMC0uNi40LTEgMS0xczEgLjQgMSAxdjNjMCAuNi0uNCAxLTEgMSIvPjxwYXRoIGZpbGw9IiM0ZDk3ZmYiIGZpbGwtb3BhY2l0eT0iLjUiIGQ9Ik0zNSA0YTEgMSAwIDAgMSAxIDF2NmExIDEgMCAwIDEtMiAwVjZoLTVhMSAxIDAgMCAxIDAtMnpNNSAzNmExIDEgMCAwIDEtMS0xdi02YTEgMSAwIDAgMSAyIDB2NWg1YTEgMSAwIDAgMSAwIDJ6Ii8+PC9nPjwvc3ZnPg==';

// eslint-disable-next-line max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48ZyBmaWxsPSJub25lIj48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMjAgNkMxMy40IDYgOCAxMS40IDggMThzNS40IDEyIDEyIDEyIDEyLTUuNCAxMi0xMlMyNi42IDYgMjAgNm0wIDJhMTAgMTAgMCAxIDEgMCAyMCAxMCAxMCAwIDAgMSAwLTIwIi8+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTIwIDI4Yy0uNiAwLTEtLjQtMS0xdi00YzAtLjYuNC0xIDEtMXMxIC40IDEgMXY0YzAgLjYtLjQgMS0xIDFNMTYgMjZjLS42IDAtMS0uNC0xLTF2LTVjMC0uNi40LTEgMS0xczEgLjQgMSAxdjVjMCAuNi0uNCAxLTEgMU0yNCAyNmMtLjYgMC0xLS40LTEtMXYtNWMwLS42LjQtMSAxLTFzMSAuNCAxIDF2NWMwIC42LS40IDEtMSAxTTEzIDIzYy0uNiAwLTEtLjQtMS0xdi0zYzAtLjYuNC0xIDEtMXMxIC40IDEgMXYzYzAgLjYtLjQgMS0xIDFNMjcgMjNjLS42IDAtMS0uNC0xLTF2LTNjMC0uNi40LTEgMS0xczEgLjQgMSAxdjNjMCAuNi0uNCAxLTEgMSIvPjwvZz48L3N2Zz4=';

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
 * MCP joint indices used to compute palm center.
 * Indices: wrist(0), thumb_mcp(2 - actually using index 1 thumb_cmc),
 * index_finger_mcp(5), middle_finger_mcp(9), ring_finger_mcp(13), pinky_finger_mcp(17)
 */
const PALM_INDICES = [0, 5, 9, 13, 17];

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
         * Cached value for detected hand size
         * @type {number}
         */
        this._cachedSize = 100;

        /**
         * Cached value for fingers up count
         * @type {number}
         */
        this._cachedFingersUp = 0;

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

        this.runtime.emit('EXTENSION_DATA_LOADING', true);

        const model = HandPoseDetection.SupportedModels.MediaPipeHands;
        const detectorConfig = {
            runtime: 'mediapipe',
            solutionPath: '/chunks/mediapipe/hands',
            maxHands: 1
        };

        HandPoseDetection.createDetector(model, detectorConfig)
            .catch(() => {
                const fallbackConfig = {
                    runtime: 'mediapipe',
                    solutionPath: `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${mediapipePackage.version}`,
                    maxHands: 1
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

        const frame = this.runtime.ioDevices.video.getFrame({
            format: Video.FORMAT_IMAGE_DATA,
            dimensions: Scratch3HandSensingBlocks.DIMENSIONS,
            cacheTimeout: this.runtime.currentStepTime
        });
        if (frame) {
            this._handDetector.estimateHands(frame).then(hands => {
                if (hands && hands.length > 0) {
                    if (!this._firstTime) {
                        this._firstTime = true;
                        this.runtime.emit('EXTENSION_DATA_LOADING', false);
                    }
                    this._currentHand = hands[0];
                } else {
                    this._currentHand = null;
                }
                this._updateIsDetected();
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
                        default: 'go to [PART]',
                        description: 'Command that moves target to [PART]'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        PART: {
                            type: ArgumentType.STRING,
                            menu: 'PART',
                            defaultValue: PARTS.INDEX_FINGER_TIP
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'setSizeToHandSize',
                    text: formatMessage({
                        id: 'handSensing.setSizeToHandSize',
                        default: 'set size to hand size',
                        description: 'Command that sets the size of the target to the hand size'
                    }),
                    blockType: BlockType.COMMAND,
                    filter: [TargetType.SPRITE]
                },
                '---',
                {
                    opcode: 'whenSpriteTouchesPart',
                    text: formatMessage({
                        id: 'handSensing.whenSpriteTouchesPart',
                        default: 'when this sprite touches [PART]',
                        description: 'Event that triggers when sprite touches a [PART]'
                    }),
                    arguments: {
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
                        default: 'when a hand is detected',
                        description: 'Event that triggers when a hand is detected'
                    }),
                    blockType: BlockType.HAT
                },
                '---',
                {
                    opcode: 'handIsDetected',
                    text: formatMessage({
                        id: 'handSensing.handDetected',
                        default: 'a hand is detected?',
                        description: 'Reporter that returns whether a hand is detected'
                    }),
                    blockType: BlockType.BOOLEAN
                },
                {
                    opcode: 'fingersUp',
                    text: formatMessage({
                        id: 'handSensing.fingersUp',
                        default: 'fingers up',
                        description: 'Reporter that returns the number of fingers up'
                    }),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'handSize',
                    text: formatMessage({
                        id: 'handSensing.handSize',
                        default: 'hand size',
                        description: 'Reporter that returns the hand size'
                    }),
                    blockType: BlockType.REPORTER
                }
            ],
            menus: {
                PART: this.PART_INFO
            }
        };
    }

    /**
     * Compute the palm center as the centroid of the wrist and MCP joints.
     * @returns {{x: number, y: number}} Coordinates of the palm center.
     * @private
     */
    _getPalmCenterPosition () {
        if (!this._currentHand || !this._currentHand.keypoints) {
            return Scratch3HandSensingBlocks.DEFAULT_PART_POSITION;
        }

        let sumX = 0;
        let sumY = 0;
        let count = 0;
        for (const idx of PALM_INDICES) {
            const kp = this._currentHand.keypoints[idx];
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
     * @returns {{x: number, y: number}} Coordinates of the detected keypoint.
     * @private
     */
    _getPartPosition (part) {
        const defaultPos = Scratch3HandSensingBlocks.DEFAULT_PART_POSITION;

        if (!this._currentHand) return defaultPos;
        if (!this._currentHand.keypoints) return defaultPos;

        if (part === PARTS.PALM_CENTER) {
            return this._getPalmCenterPosition();
        }

        const result = this._currentHand.keypoints.find(kp => kp.name === part);
        if (result) {
            return toScratchCoords(result);
        }
        return defaultPos;
    }

    /**
     * Count the number of extended fingers.
     * @returns {number} Number of fingers up (0-5).
     * @private
     */
    _countFingersUp () {
        if (!this._currentHand || !this._currentHand.keypoints) return this._cachedFingersUp;

        const kps = this._currentHand.keypoints;
        let count = 0;

        // Thumb: compare tip x vs ip x based on handedness
        const thumbTip = kps[FINGER_TIP_PIP.THUMB[0]];
        const thumbIp = kps[FINGER_TIP_PIP.THUMB[1]];
        if (thumbTip && thumbIp) {
            const handedness = this._currentHand.handedness;
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

        this._cachedFingersUp = count;
        return count;
    }

    /**
     * A scratch command block handle that moves a target to a given hand keypoint
     * @param {object} args - the block arguments
     * @param {BlockUtility} util - the block utility
     */
    goToPart (args, util) {
        if (!this._currentHand) return;

        const pos = this._getPartPosition(args.PART);
        util.target.setXY(pos.x, pos.y);
    }

    /**
     * A scratch command block handle that sets the size of a target to the current hand size
     * @param {object} args - the block arguments
     * @param {BlockUtility} util - the block utility
     */
    setSizeToHandSize (args, util) {
        if (!this._currentHand) return;

        util.target.setSize(this.handSize());
    }

    /**
     * A scratch hat block handle that reports whether
     * a target sprite is touching a given hand keypoint
     * @param {object} args - the block arguments
     * @param {BlockUtility} util - the block utility
     * @returns {boolean} - true if the sprite is touching the given point
     */
    whenSpriteTouchesPart (args, util) {
        if (!this._currentHand) return false;
        if (!this._currentHand.keypoints) return false;

        const pos = this._getPartPosition(args.PART);
        return util.target.isTouchingScratchPoint(pos.x, pos.y);
    }

    /**
     * A scratch hat block handle that reports whether
     * a hand is detected
     * @returns {boolean} - true a hand was detected
     */
    whenHandDetected () {
        return this._smoothedIsDetected;
    }

    /**
     * A scratch boolean block handle that reports whether
     * a hand is detected
     * @returns {boolean} - true a hand was detected
     */
    handIsDetected () {
        return this._smoothedIsDetected;
    }

    /**
     * A scratch reporter block handle that returns the number of fingers up.
     * @returns {number} the number of fingers up (0-5)
     */
    fingersUp () {
        return this._countFingersUp();
    }

    /**
     * A scratch reporter block handle that calculates the hand size and caches it.
     * Hand size is measured as the distance from wrist to middle finger tip.
     * @returns {number} the hand size
     */
    handSize () {
        if (!this._currentHand) return this._cachedSize;

        const wristPos = this._getPartPosition(PARTS.WRIST);
        const middlePos = this._getPartPosition(PARTS.MIDDLE_FINGER_TIP);
        const size = Math.round(distance(wristPos, middlePos));
        this._cachedSize = size;
        return size;
    }
}

module.exports = Scratch3HandSensingBlocks;
