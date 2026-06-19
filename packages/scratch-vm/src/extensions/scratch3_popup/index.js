const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const Clone = require('../../util/clone');
const MathUtil = require('../../util/math-util');
const formatMessage = require('format-message');

const {PopupScene, STATE_KEY, DEFAULT_STATE, SKY} = require('./scene');

/**
 * Icon shown at the left edge of each Pop-Up block, encoded as a data URI.
 * @type {string}
 */
// eslint-disable-next-line @stylistic/max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cG9seWdvbiBwb2ludHM9IjIwLDUgMzEsMTEgMzEsMjkgMjAsMjMiIGZpbGw9IiNmZmZmZmYiIG9wYWNpdHk9IjAuNTUiLz48cG9seWdvbiBwb2ludHM9IjksMTEgMjAsNSAzMSwxMSAyMCwxNyIgZmlsbD0iI2ZmZmZmZiIgb3BhY2l0eT0iMC44NSIvPjxwb2x5Z29uIHBvaW50cz0iOSwxMSAyMCwxNyAyMCwzNSA5LDI5IiBmaWxsPSIjZmZmZmZmIi8+PGNpcmNsZSBjeD0iMTQuNSIgY3k9IjIzIiByPSIyIiBmaWxsPSIjOTk2NmNjIi8+PC9zdmc+Cg==';

/**
 * Limits for the extrusion thickness, in stage units. Clamped so any input works.
 * @type {{min: number, max: number}}
 */
const THICKNESS_RANGE = {min: 0, max: 200};

/**
 * Limits for the depth (in/out) axis, in stage units. Clamped so any input works.
 * @type {{min: number, max: number}}
 */
const DEPTH_RANGE = {min: -480, max: 480};

/**
 * Camera view menu values. These strings are part of the saved project format, so
 * they must never change once shipped (only add new ones).
 * @enum {string}
 */
const CameraView = {
    FRONT: 'front',
    ORBIT: 'orbit',
    DRAG: 'drag'
};

/**
 * Host for the "3D Pop-Up" blocks. This is a vertical-slice of the larger Pop-Up
 * extension design: it adds `set camera to [front|orbit]` and a `thickness`
 * set/change pair. Choosing "orbit" lifts the flat project into a slowly revolving
 * 3D pop-up by extruding each sprite's costume; "front" returns to the normal 2D view.
 * @param {Runtime} runtime - the runtime instantiating this block package.
 * @class
 */
class Scratch3PopupBlocks {
    constructor (runtime) {
        this.runtime = runtime;

        /**
         * The three.js scene manager. All rendering lives here; it no-ops in a
         * headless VM (no renderer / no DOM).
         * @type {PopupScene}
         */
        this._scene = new PopupScene(runtime);

        this._reset = this._reset.bind(this);
        this._dispose = this._dispose.bind(this);

        // Handle the stop button: return to the flat view and reset state.
        runtime.on('PROJECT_STOP_ALL', this._reset);
        runtime.on('RUNTIME_DISPOSED', this._dispose);
    }

    /**
     * @returns {string} the key used to store a target's Pop-Up state.
     */
    static get STATE_KEY () {
        return STATE_KEY;
    }

    /**
     * @returns {object} extension metadata for the editor.
     */
    getInfo () {
        return {
            id: 'popup',
            name: formatMessage({
                id: 'popup.categoryName',
                default: '3D Pop-Up',
                description: 'Name of the 3D Pop-Up extension'
            }),
            color1: '#9966CC',
            color2: '#774EA3',
            color3: '#5E3D82',
            blockIconURI,
            blocks: [
                {
                    opcode: 'setCamera',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'popup.setCamera',
                        default: 'set camera to [VIEW]',
                        description: 'Choose how the world is viewed (flat or revolving 3D)'
                    }),
                    arguments: {
                        VIEW: {
                            type: ArgumentType.STRING,
                            menu: 'cameraView',
                            defaultValue: CameraView.DRAG
                        }
                    }
                },
                {
                    opcode: 'setSky',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'popup.setSky',
                        default: 'set sky to [SKY]',
                        description: 'Choose the sky/mood behind the 3D world'
                    }),
                    arguments: {
                        SKY: {
                            type: ArgumentType.STRING,
                            menu: 'sky',
                            defaultValue: 'sunset'
                        }
                    }
                },
                '---',
                {
                    opcode: 'changeDepth',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'popup.changeDepth',
                        default: 'change depth by [AMOUNT]',
                        description: 'Move this sprite along the in/out axis'
                    }),
                    arguments: {
                        AMOUNT: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 50
                        }
                    }
                },
                {
                    opcode: 'setDepth',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'popup.setDepth',
                        default: 'set depth to [AMOUNT]',
                        description: 'Set how far in/out this sprite sits (+ = into the page)'
                    }),
                    arguments: {
                        AMOUNT: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: 'getDepth',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'popup.depth',
                        default: 'depth',
                        description: 'Reporter: this sprite\'s depth (in/out position)'
                    })
                },
                '---',
                {
                    opcode: 'changeThickness',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'popup.changeThickness',
                        default: 'change thickness by [AMOUNT]',
                        description: 'Change how thick (extruded) this sprite is'
                    }),
                    arguments: {
                        AMOUNT: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 10
                        }
                    }
                },
                {
                    opcode: 'setThickness',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'popup.setThickness',
                        default: 'set thickness to [AMOUNT]',
                        description: 'Set how thick (extruded) this sprite is'
                    }),
                    arguments: {
                        AMOUNT: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 25
                        }
                    }
                },
                '---',
                {
                    opcode: 'stampInThreeD',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'popup.stamp',
                        default: 'stamp in 3D',
                        description: 'Drop a permanent 3D copy of this sprite into the world'
                    })
                },
                {
                    opcode: 'clearStamps',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'popup.clearStamps',
                        default: 'clear 3D stamps',
                        description: 'Remove all 3D stamps'
                    })
                }
            ],
            menus: {
                cameraView: {
                    acceptReporters: false,
                    items: [
                        {
                            text: formatMessage({
                                id: 'popup.cameraView.drag',
                                default: 'drag to spin',
                                description: 'Drag the stage to orbit the 3D camera'
                            }),
                            value: CameraView.DRAG
                        },
                        {
                            text: formatMessage({
                                id: 'popup.cameraView.orbit',
                                default: 'auto-spin',
                                description: 'Slowly auto-revolving 3D view'
                            }),
                            value: CameraView.ORBIT
                        },
                        {
                            text: formatMessage({
                                id: 'popup.cameraView.front',
                                default: 'front',
                                description: 'Flat, head-on view (same as the normal 2D stage)'
                            }),
                            value: CameraView.FRONT
                        }
                    ]
                },
                sky: {
                    acceptReporters: false,
                    items: this._skyMenu()
                }
            }
        };
    }

    /**
     * Build the sky menu from the available presets.
     * @returns {Array<object>} menu items.
     * @private
     */
    _skyMenu () {
        const labels = {
            day: 'day',
            sunset: 'sunset',
            night: 'night',
            space: 'space',
            underwater: 'underwater',
            cave: 'cave',
            dream: 'dream',
            storybook: 'storybook'
        };
        return Object.keys(SKY).map(value => ({
            text: formatMessage({
                id: `popup.sky.${value}`,
                default: labels[value] || value,
                description: `Sky preset: ${value}`
            }),
            value
        }));
    }

    /**
     * Get (creating if needed) the Pop-Up state for a target.
     * @param {Target} target - the target to read state from.
     * @returns {object} the mutable Pop-Up state.
     * @private
     */
    _getState (target) {
        let state = target.getCustomState(STATE_KEY);
        if (!state) {
            state = Clone.simple(DEFAULT_STATE);
            target.setCustomState(STATE_KEY, state);
        }
        return state;
    }

    /**
     * Return to the flat view (used by the stop button).
     * @private
     */
    _reset () {
        this._scene.setMode('front');
    }

    /**
     * Tear down the scene (used when the runtime is disposed).
     * @private
     */
    _dispose () {
        this._scene.dispose();
    }

    /**
     * Request a re-render after a visual change. Like core motion/looks blocks, this
     * makes non-warp loops (e.g. `forever`) yield for a frame, so an animated loop
     * advances one step per frame instead of running to completion in a single tick.
     * @private
     */
    _visualChange () {
        this.runtime.requestRedraw();
    }

    /**
     * `set camera to [drag to spin | auto-spin | front]`.
     * @param {object} args - the block arguments.
     */
    setCamera (args) {
        this._scene.setMode(Cast.toString(args.VIEW));
        this._visualChange();
    }

    /**
     * `set sky to [SKY]`.
     * @param {object} args - the block arguments.
     */
    setSky (args) {
        this._scene.setSky(Cast.toString(args.SKY));
        this._visualChange();
    }

    /**
     * `set depth to [AMOUNT]`.
     * @param {object} args - the block arguments.
     * @param {object} util - block utility (provides the current target).
     */
    setDepth (args, util) {
        const state = this._getState(util.target);
        state.depth = MathUtil.clamp(Cast.toNumber(args.AMOUNT), DEPTH_RANGE.min, DEPTH_RANGE.max);
        this._visualChange();
    }

    /**
     * `change depth by [AMOUNT]`.
     * @param {object} args - the block arguments.
     * @param {object} util - block utility (provides the current target).
     */
    changeDepth (args, util) {
        const state = this._getState(util.target);
        state.depth = MathUtil.clamp(
            state.depth + Cast.toNumber(args.AMOUNT),
            DEPTH_RANGE.min,
            DEPTH_RANGE.max
        );
        this._visualChange();
    }

    /**
     * `depth` reporter.
     * @param {object} args - the block arguments (unused).
     * @param {object} util - block utility (provides the current target).
     * @returns {number} the target's depth.
     */
    getDepth (args, util) {
        return this._getState(util.target).depth;
    }

    /**
     * `set thickness to [AMOUNT]`.
     * @param {object} args - the block arguments.
     * @param {object} util - block utility (provides the current target).
     */
    setThickness (args, util) {
        const state = this._getState(util.target);
        state.thickness = MathUtil.clamp(Cast.toNumber(args.AMOUNT), THICKNESS_RANGE.min, THICKNESS_RANGE.max);
        this._visualChange();
    }

    /**
     * `change thickness by [AMOUNT]`.
     * @param {object} args - the block arguments.
     * @param {object} util - block utility (provides the current target).
     */
    changeThickness (args, util) {
        const state = this._getState(util.target);
        state.thickness = MathUtil.clamp(
            state.thickness + Cast.toNumber(args.AMOUNT),
            THICKNESS_RANGE.min,
            THICKNESS_RANGE.max
        );
        this._visualChange();
    }

    /**
     * `stamp in 3D`.
     * @param {object} args - the block arguments (unused).
     * @param {object} util - block utility (provides the current target).
     */
    stampInThreeD (args, util) {
        this._scene.stampThreeD(util.target);
        this._visualChange();
    }

    /**
     * `clear 3D stamps`.
     */
    clearStamps () {
        this._scene.clearStamps();
        this._visualChange();
    }
}

module.exports = Scratch3PopupBlocks;
