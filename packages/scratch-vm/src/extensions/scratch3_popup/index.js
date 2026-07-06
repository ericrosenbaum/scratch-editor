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
 * Wide enough to build worlds much larger than the stage, while staying inside
 * the 3D camera's far plane so distant objects remain drawable.
 * @type {{min: number, max: number}}
 */
const DEPTH_RANGE = {min: -4800, max: 4800};

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

        // A 3D world extends beyond the stage edges, so sprite fencing defaults to
        // off while this extension is loaded (the `set fencing` block re-enables it).
        this.runtime.setFencing(false);

        // While the 3D view is active, speech bubbles should hang over the sprite's
        // projected 3D position rather than its (hidden) 2D one. The scene returns
        // null when 3D is inactive, restoring the normal 2D behaviour.
        this.runtime.setBubblePositionProvider(target => this._scene.bubbleBounds(target));

        this._reset = this._reset.bind(this);
        this._dispose = this._dispose.bind(this);
        this._onTargetCreated = this._onTargetCreated.bind(this);

        // Handle the stop button: return to the flat view and reset state.
        runtime.on('PROJECT_STOP_ALL', this._reset);
        runtime.on('RUNTIME_DISPOSED', this._dispose);
        // Clones must inherit their parent's 3D properties (thickness, depth, tilt, spin).
        runtime.on('targetWasCreated', this._onTargetCreated);
    }

    /**
     * When a target is cloned, copy its Pop-Up 3D state onto the new clone so the clone
     * inherits all 3D properties (thickness, depth, tilt, spin), mirroring how core
     * properties like size and direction are inherited. New top-level sprites (no source)
     * keep the defaults.
     * @param {Target} newTarget - the newly created target.
     * @param {Target} [sourceTarget] - the target cloned from, if any.
     * @listens Runtime#event:targetWasCreated
     * @private
     */
    _onTargetCreated (newTarget, sourceTarget) {
        if (!sourceTarget) return;
        const state = sourceTarget.getCustomState(STATE_KEY);
        if (state) {
            newTarget.setCustomState(STATE_KEY, Clone.simple(state));
        }
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
                    opcode: 'followCamera',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'popup.followCamera',
                        default: 'set camera to follow [SPRITE]',
                        description: 'Make the 3D camera track and stay centered on a chosen sprite'
                    }),
                    arguments: {
                        SPRITE: {
                            type: ArgumentType.STRING,
                            menu: 'spriteMenu'
                        }
                    }
                },
                {
                    opcode: 'shoulderCamera',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'popup.shoulderCamera',
                        default: 'set camera behind [SPRITE]',
                        description: 'Over-the-shoulder camera: stay behind a sprite, looking the way it faces'
                    }),
                    arguments: {
                        SPRITE: {
                            type: ArgumentType.STRING,
                            menu: 'spriteMenu'
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
                {
                    opcode: 'setBackdrop',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'popup.setBackdrop',
                        default: 'set backdrop wall to [VISIBLE]',
                        description: 'Show or hide the backdrop as a wall behind the 3D scene'
                    }),
                    arguments: {
                        VISIBLE: {
                            type: ArgumentType.STRING,
                            menu: 'backdropVisibility',
                            defaultValue: 'hidden'
                        }
                    }
                },
                {
                    opcode: 'setFencing',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'popup.setFencing',
                        default: 'set fencing [FENCING]',
                        description: 'Turn sprite fencing (clamping positions to the stage edges) on or off'
                    }),
                    arguments: {
                        FENCING: {
                            type: ArgumentType.STRING,
                            menu: 'fencing',
                            defaultValue: 'off'
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
                    opcode: 'setTilt',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'popup.setTilt',
                        default: 'tilt to [ANGLE]',
                        description: 'Set this sprite\'s rotation about the X axis (tip forward/back)'
                    }),
                    arguments: {
                        ANGLE: {
                            type: ArgumentType.ANGLE,
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: 'changeTilt',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'popup.changeTilt',
                        default: 'tilt by [ANGLE]',
                        description: 'Change this sprite\'s rotation about the X axis'
                    }),
                    arguments: {
                        ANGLE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 15
                        }
                    }
                },
                {
                    opcode: 'setSpin',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'popup.setSpin',
                        default: 'spin to [ANGLE]',
                        description: 'Set this sprite\'s rotation about the Y axis (turn left/right)'
                    }),
                    arguments: {
                        ANGLE: {
                            type: ArgumentType.ANGLE,
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: 'changeSpin',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'popup.changeSpin',
                        default: 'spin by [ANGLE]',
                        description: 'Change this sprite\'s rotation about the Y axis'
                    }),
                    arguments: {
                        ANGLE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 15
                        }
                    }
                },
                {
                    opcode: 'getTilt',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'popup.tilt',
                        default: 'tilt',
                        description: 'Reporter: this sprite\'s tilt (rotation about X)'
                    })
                },
                {
                    opcode: 'getSpin',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'popup.spin',
                        default: 'spin',
                        description: 'Reporter: this sprite\'s spin (rotation about Y)'
                    })
                },
                {
                    opcode: 'move3D',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'popup.move3D',
                        default: 'move [STEPS] steps in 3D',
                        description: 'Move this sprite the way it faces (toward the camera at rest; spin/tilt steer)'
                    }),
                    arguments: {
                        STEPS: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 10
                        }
                    }
                },
                {
                    opcode: 'setMoveAxis',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'popup.setMoveAxis',
                        default: 'set 3D move axis to [AXIS]',
                        description: 'Choose which of the sprite\'s own axes "move in 3D" travels along'
                    }),
                    arguments: {
                        AXIS: {
                            type: ArgumentType.STRING,
                            menu: 'moveAxis',
                            defaultValue: 'z'
                        }
                    }
                },
                {
                    opcode: 'orbit',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'popup.orbit',
                        default: 'orbit [DEGREES] degrees around center',
                        description: 'Revolve this sprite around the centre of the stage in the ground plane'
                    }),
                    arguments: {
                        DEGREES: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 15
                        }
                    }
                },
                '---',
                {
                    opcode: 'touchingSprite',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'popup.touchingSprite',
                        default: 'touching [SPRITE] in 3D?',
                        description: 'Whether this sprite overlaps another sprite in 3D'
                    }),
                    arguments: {
                        SPRITE: {
                            type: ArgumentType.STRING,
                            menu: 'spriteMenu'
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
                },
                backdropVisibility: {
                    acceptReporters: false,
                    items: [
                        {
                            text: formatMessage({
                                id: 'popup.backdrop.hidden',
                                default: 'hidden',
                                description: 'Hide the backdrop wall (show the sky behind the scene)'
                            }),
                            value: 'hidden'
                        },
                        {
                            text: formatMessage({
                                id: 'popup.backdrop.shown',
                                default: 'shown',
                                description: 'Show the backdrop as a wall behind the scene'
                            }),
                            value: 'shown'
                        }
                    ]
                },
                fencing: {
                    acceptReporters: false,
                    items: [
                        {
                            text: formatMessage({
                                id: 'popup.fencing.off',
                                default: 'off',
                                description: 'Sprites may move beyond the stage edges (the default in 3D)'
                            }),
                            value: 'off'
                        },
                        {
                            text: formatMessage({
                                id: 'popup.fencing.on',
                                default: 'on',
                                description: 'Sprites are kept within the stage edges'
                            }),
                            value: 'on'
                        }
                    ]
                },
                moveAxis: {
                    acceptReporters: true,
                    items: [
                        {
                            text: formatMessage({
                                id: 'popup.moveAxis.z',
                                default: 'z (the way it faces)',
                                description: 'Move along the sprite\'s facing (front-face normal); the default'
                            }),
                            value: 'z'
                        },
                        {
                            text: formatMessage({
                                id: 'popup.moveAxis.x',
                                default: 'x (its right)',
                                description: 'Move along the sprite\'s own right, so direction steers it like 2D move'
                            }),
                            value: 'x'
                        },
                        {
                            text: formatMessage({
                                id: 'popup.moveAxis.y',
                                default: 'y (its top)',
                                description: 'Move along the sprite\'s own up'
                            }),
                            value: 'y'
                        }
                    ]
                },
                spriteMenu: {
                    acceptReporters: true,
                    items: '_spriteMenu'
                }
            }
        };
    }

    /**
     * Dynamic menu of the current sprite names (one per sprite, excluding the stage
     * and clones). Called by the editor each time the menu opens.
     * @returns {Array<object>} menu items.
     * @private
     */
    _spriteMenu () {
        const names = [];
        for (const target of this.runtime.targets) {
            if (target.isStage || !target.isOriginal || !target.sprite) continue;
            names.push({text: target.sprite.name, value: target.sprite.name});
        }
        return names.length ? names : [{text: '', value: '_none_'}];
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
        // Backfill keys added after a project may have been saved with older state.
        if (!Number.isFinite(state.tilt)) state.tilt = 0;
        if (!Number.isFinite(state.spin)) state.spin = 0;
        if (state.moveAxis !== 'x' && state.moveAxis !== 'y') state.moveAxis = 'z';
        return state;
    }

    /**
     * Return to the flat view (used by the stop button). Also restores the backdrop
     * wall to its default (shown), so a project that hid it doesn't leave the wall
     * hidden for the next project run, and fencing to its extension default (off),
     * so a project that fenced itself in doesn't constrain the next run. Runs on
     * every green flag (via PROJECT_STOP_ALL).
     * @private
     */
    _reset () {
        this._scene.setMode('front');
        this._scene.setWallVisible(true);
        this.runtime.setFencing(false);
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
     * `set camera to follow [SPRITE]` - track and stay centred on the chosen sprite,
     * orbiting around it (drag empty space to spin) as it moves through the scene.
     * @param {object} args - the block arguments.
     */
    followCamera (args) {
        this._scene.followSprite(Cast.toString(args.SPRITE));
        this._visualChange();
    }

    /**
     * `set camera behind [SPRITE]` - over-the-shoulder camera: stay behind the chosen
     * sprite and look the way it faces (its spin heading), so turning the sprite turns
     * the view to look along the axis it is about to move on.
     * @param {object} args - the block arguments.
     */
    shoulderCamera (args) {
        this._scene.shoulderSprite(Cast.toString(args.SPRITE));
        this._visualChange();
    }

    /**
     * `set fencing [on | off]` - re-enable (or disable again) clamping of sprite
     * positions to the stage edges. Fencing defaults to off while this extension is
     * loaded, making room for worlds larger than the stage.
     * @param {object} args - the block arguments.
     */
    setFencing (args) {
        this.runtime.setFencing(Cast.toString(args.FENCING) === 'on');
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
     * `set backdrop wall to [shown | hidden]`. Hiding the wall lets the sky show through
     * behind the sprites instead of the stage backdrop.
     * @param {object} args - the block arguments.
     */
    setBackdrop (args) {
        this._scene.setWallVisible(Cast.toString(args.VISIBLE) !== 'hidden');
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
     * `tilt to [ANGLE]` - set rotation about the X axis.
     * @param {object} args - the block arguments.
     * @param {object} util - block utility (provides the current target).
     */
    setTilt (args, util) {
        this._getState(util.target).tilt = MathUtil.wrapClamp(Cast.toNumber(args.ANGLE), -180, 180);
        this._visualChange();
    }

    /**
     * `tilt by [ANGLE]` - change rotation about the X axis.
     * @param {object} args - the block arguments.
     * @param {object} util - block utility (provides the current target).
     */
    changeTilt (args, util) {
        const state = this._getState(util.target);
        state.tilt = MathUtil.wrapClamp(state.tilt + Cast.toNumber(args.ANGLE), -180, 180);
        this._visualChange();
    }

    /**
     * `tilt` reporter.
     * @param {object} args - the block arguments (unused).
     * @param {object} util - block utility (provides the current target).
     * @returns {number} the target's tilt.
     */
    getTilt (args, util) {
        return this._getState(util.target).tilt;
    }

    /**
     * `spin to [ANGLE]` - set rotation about the Y axis.
     * @param {object} args - the block arguments.
     * @param {object} util - block utility (provides the current target).
     */
    setSpin (args, util) {
        this._getState(util.target).spin = MathUtil.wrapClamp(Cast.toNumber(args.ANGLE), -180, 180);
        this._visualChange();
    }

    /**
     * `spin by [ANGLE]` - change rotation about the Y axis.
     * @param {object} args - the block arguments.
     * @param {object} util - block utility (provides the current target).
     */
    changeSpin (args, util) {
        const state = this._getState(util.target);
        state.spin = MathUtil.wrapClamp(state.spin + Cast.toNumber(args.ANGLE), -180, 180);
        this._visualChange();
    }

    /**
     * `spin` reporter.
     * @param {object} args - the block arguments (unused).
     * @param {object} util - block utility (provides the current target).
     * @returns {number} the target's spin.
     */
    getSpin (args, util) {
        return this._getState(util.target).spin;
    }

    /**
     * `move [STEPS] steps in 3D` - move along the sprite's 3D move axis (see
     * setMoveAxis; default its front-face normal). At rest (no spin/tilt) that is out
     * of the page: toward the camera and away from the backdrop, so depth decreases.
     * Spin (yaw) steers the heading left/right, tilt pitches it up/down, and a
     * left-right flip turns it around. Sharing the scene's orientation maths
     * guarantees movement matches what's rendered.
     * @param {object} args - the block arguments.
     * @param {object} util - block utility (provides the current target).
     */
    move3D (args, util) {
        const target = util.target;
        const state = this._getState(target);
        const steps = Cast.toNumber(args.STEPS);
        const f = this._scene.forwardVector(target);
        target.setXY(target.x + (steps * f.x), target.y + (steps * f.y));
        // World +z (toward the camera) means a smaller depth, since the group's z is
        // set to -(depth) in the scene.
        state.depth = MathUtil.clamp(state.depth - (steps * f.z), DEPTH_RANGE.min, DEPTH_RANGE.max);
        this._visualChange();
    }

    /**
     * `set 3D move axis to [x | y | z]` - choose which of the sprite's own (local) axes
     * `move ... steps in 3D` travels along. The default, z, is the front-face normal
     * (out of the page at rest), so spin/tilt steer the sprite the way its card faces.
     * 'x' is the card's own right — `direction` then steers movement in the wall plane
     * like the 2D `move` block — and 'y' its own top. The `set camera behind` camera
     * looks along the same axis, so it stays behind the sprite's travel either way.
     * @param {object} args - the block arguments.
     * @param {object} util - block utility (provides the current target).
     */
    setMoveAxis (args, util) {
        const axis = Cast.toString(args.AXIS).toLowerCase();
        if (axis !== 'x' && axis !== 'y' && axis !== 'z') return;
        this._getState(util.target).moveAxis = axis;
    }

    /**
     * `orbit [DEGREES] degrees around center` - revolve the sprite around the centre of
     * the stage in the ground (x / depth) plane, the same plane the camera circles. The
     * sprite keeps its height and its facing, so a flat drawing (e.g. a planet) stays
     * face-on to the camera instead of turning edge-on as it would if you steered it
     * with `spin` + `move in 3D`. This makes solar systems, carousels and the like simple.
     * @param {object} args - the block arguments.
     * @param {object} util - block utility (provides the current target).
     */
    orbit (args, util) {
        const target = util.target;
        const state = this._getState(target);
        const a = Cast.toNumber(args.DEGREES) * (Math.PI / 180);
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const x = target.x || 0;
        const z = state.depth || 0;
        // Rotate (x, depth) about the origin in the ground plane; height (y) is untouched.
        target.setXY((x * cos) - (z * sin), target.y);
        state.depth = MathUtil.clamp((x * sin) + (z * cos), DEPTH_RANGE.min, DEPTH_RANGE.max);
        this._visualChange();
    }

    /**
     * `touching [SPRITE] in 3D?` - true if this sprite overlaps the named sprite in 3D.
     * While the 3D view is active this tests real 3D overlap; in the flat view it falls
     * back to the normal 2D touching test so the block still works.
     * @param {object} args - the block arguments.
     * @param {object} util - block utility (provides the current target).
     * @returns {boolean} whether the sprites overlap.
     */
    touchingSprite (args, util) {
        const name = Cast.toString(args.SPRITE);
        if (this._scene.active) {
            return this._scene.isTouching3D(util.target, name);
        }
        return util.target.isTouchingObject(name);
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
