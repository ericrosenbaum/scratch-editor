const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const TargetType = require('../../extension-support/target-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');

/**
 * Icon shown on each block in this extension category.
 * @type {string}
 */
// eslint-disable-next-line @stylistic/max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik04IDEzaDR2LTJoMTZ2MmgxLjVMMzAgMTNoMmEzIDMgMCAwIDEgMyAzdjEzYTMgMyAwIDAgMS0zIDNIOGEzIDMgMCAwIDEtMy0zVjE2YTMgMyAwIDAgMSAzLTN6IiBmaWxsPSIjRkZGIiBzdHJva2U9IiM1NzVFNzUiIHN0cm9rZS13aWR0aD0iMS41Ii8+PGNpcmNsZSBzdHJva2U9IiM1NzVFNzUiIHN0cm9rZS13aWR0aD0iMS41IiBmaWxsPSIjNEM5N0ZGIiBjeD0iMjAiIGN5PSIyMyIgcj0iNiIvPjxjaXJjbGUgZmlsbD0iI0ZGRiIgY3g9IjIwIiBjeT0iMjMiIHI9IjIuNSIvPjxjaXJjbGUgZmlsbD0iIzU3NUU3NSIgY3g9IjMwIiBjeT0iMTciIHI9IjEiLz48L2c+PC9zdmc+';

const STATE_KEY = 'Scratch.camera';

class Scratch3CameraBlocks {
    constructor (runtime) {
        this.runtime = runtime;

        // Loading this extension implies a world-space project: sprites may
        // leave the stage. The flag is checked in RenderedTarget.setXY.
        this.runtime.disableFencing = true;

        // Reset camera to identity so the initial view matches a fresh stage.
        this._applyCamera(0, 0, 1);

        this._onTargetCreated = this._onTargetCreated.bind(this);
        this._onRuntimeDisposed = this._onRuntimeDisposed.bind(this);
        this.runtime.on('targetWasCreated', this._onTargetCreated);
        this.runtime.on('RUNTIME_DISPOSED', this._onRuntimeDisposed);
    }

    /**
     * When the runtime is disposed (e.g. a new project is loaded), snap the
     * camera back to the identity view so no camera state leaks across
     * projects. Fencing remains disabled while this extension is loaded.
     * @private
     */
    _onRuntimeDisposed () {
        this._applyCamera(0, 0, 1);
    }

    /**
     * When a target is created (e.g. a clone), copy the HUD flag and push it
     * to the renderer's matching Drawable.
     * @param {Target} newTarget - the newly created target.
     * @param {Target} [sourceTarget] - the target used as a source for the new clone, if any.
     * @private
     */
    _onTargetCreated (newTarget, sourceTarget) {
        if (!sourceTarget) return;
        const state = sourceTarget.getCustomState(STATE_KEY);
        if (state && state.ignoreCamera) {
            newTarget.setCustomState(STATE_KEY, {ignoreCamera: true});
            if (this.runtime.renderer && newTarget.drawableID >= 0) {
                this.runtime.renderer.setDrawableIgnoreCamera(newTarget.drawableID, true);
            }
        }
    }

    _getState (target) {
        let state = target.getCustomState(STATE_KEY);
        if (!state) {
            state = {ignoreCamera: false};
            target.setCustomState(STATE_KEY, state);
        }
        return state;
    }

    _applyCamera (x, y, zoom) {
        if (this.runtime.renderer && this.runtime.renderer.setCamera) {
            this.runtime.renderer.setCamera({x, y, zoom});
            this.runtime.requestRedraw();
        }
    }

    _readCamera () {
        if (this.runtime.renderer && this.runtime.renderer.getCamera) {
            return this.runtime.renderer.getCamera();
        }
        return {x: 0, y: 0, zoom: 1};
    }

    getInfo () {
        return {
            id: 'camera',
            name: formatMessage({
                id: 'camera.categoryName',
                default: 'Camera',
                description: 'Label for the Camera extension category'
            }),
            blockIconURI: blockIconURI,
            blocks: [
                {
                    opcode: 'setCameraPosition',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'camera.setPosition',
                        default: 'point camera at x: [X] y: [Y]',
                        description: 'set the world point the camera is centered on'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }
                },
                {
                    opcode: 'changeCameraX',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'camera.changeX',
                        default: 'change camera x by [N]',
                        description: 'shift the camera horizontally'
                    }),
                    arguments: {
                        N: {type: ArgumentType.NUMBER, defaultValue: 10}
                    }
                },
                {
                    opcode: 'changeCameraY',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'camera.changeY',
                        default: 'change camera y by [N]',
                        description: 'shift the camera vertically'
                    }),
                    arguments: {
                        N: {type: ArgumentType.NUMBER, defaultValue: 10}
                    }
                },
                '---',
                {
                    opcode: 'setCameraZoom',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'camera.setZoom',
                        default: 'set camera zoom to [Z] %',
                        description: 'set the camera zoom percentage (100 = identity)'
                    }),
                    arguments: {
                        Z: {type: ArgumentType.NUMBER, defaultValue: 100}
                    }
                },
                {
                    opcode: 'changeCameraZoom',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'camera.changeZoom',
                        default: 'change camera zoom by [N] %',
                        description: 'change the camera zoom by some percentage'
                    }),
                    arguments: {
                        N: {type: ArgumentType.NUMBER, defaultValue: 10}
                    }
                },
                {
                    opcode: 'resetCamera',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'camera.reset',
                        default: 'reset camera',
                        description: 'snap the camera back to the origin at 100% zoom'
                    })
                },
                '---',
                {
                    opcode: 'cameraX',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'camera.x',
                        default: 'camera x',
                        description: 'reporter for the camera x position'
                    })
                },
                {
                    opcode: 'cameraY',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'camera.y',
                        default: 'camera y',
                        description: 'reporter for the camera y position'
                    })
                },
                {
                    opcode: 'cameraZoom',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'camera.zoom',
                        default: 'camera zoom',
                        description: 'reporter for the camera zoom percent'
                    })
                },
                '---',
                {
                    opcode: 'makeHud',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'camera.makeHud',
                        default: 'pin this sprite to the screen',
                        description: 'mark this sprite as a HUD that ignores the camera'
                    }),
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'makeWorld',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'camera.makeWorld',
                        default: 'put this sprite in the world',
                        description: 'mark this sprite as world-space (affected by the camera)'
                    }),
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'isHud',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'camera.isHud',
                        default: 'pinned to screen?',
                        description: 'boolean reporting whether this sprite is a HUD'
                    }),
                    filter: [TargetType.SPRITE]
                }
            ]
        };
    }

    setCameraPosition (args) {
        const x = Cast.toNumber(args.X);
        const y = Cast.toNumber(args.Y);
        const current = this._readCamera();
        this._applyCamera(x, y, current.zoom);
    }

    changeCameraX (args) {
        const current = this._readCamera();
        this._applyCamera(current.x + Cast.toNumber(args.N), current.y, current.zoom);
    }

    changeCameraY (args) {
        const current = this._readCamera();
        this._applyCamera(current.x, current.y + Cast.toNumber(args.N), current.zoom);
    }

    setCameraZoom (args) {
        const percent = Cast.toNumber(args.Z);
        const zoom = Math.max(1, percent) / 100;
        const current = this._readCamera();
        this._applyCamera(current.x, current.y, zoom);
    }

    changeCameraZoom (args) {
        const current = this._readCamera();
        const percent = (current.zoom * 100) + Cast.toNumber(args.N);
        const zoom = Math.max(1, percent) / 100;
        this._applyCamera(current.x, current.y, zoom);
    }

    resetCamera () {
        this._applyCamera(0, 0, 1);
    }

    cameraX () {
        return this._readCamera().x;
    }

    cameraY () {
        return this._readCamera().y;
    }

    cameraZoom () {
        return this._readCamera().zoom * 100;
    }

    makeHud (args, util) {
        const target = util.target;
        if (!target || target.isStage) return;
        const state = this._getState(target);
        state.ignoreCamera = true;
        if (this.runtime.renderer && target.drawableID >= 0) {
            this.runtime.renderer.setDrawableIgnoreCamera(target.drawableID, true);
            this.runtime.requestRedraw();
        }
    }

    makeWorld (args, util) {
        const target = util.target;
        if (!target || target.isStage) return;
        const state = this._getState(target);
        state.ignoreCamera = false;
        if (this.runtime.renderer && target.drawableID >= 0) {
            this.runtime.renderer.setDrawableIgnoreCamera(target.drawableID, false);
            this.runtime.requestRedraw();
        }
    }

    isHud (args, util) {
        const target = util.target;
        if (!target || target.isStage) return false;
        const state = target.getCustomState(STATE_KEY);
        return Boolean(state && state.ignoreCamera);
    }
}

module.exports = Scratch3CameraBlocks;
