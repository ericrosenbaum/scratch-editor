const formatMessage = require('format-message');
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const TargetType = require('../../extension-support/target-type');
const Cast = require('../../util/cast');
const Clone = require('../../util/clone');
const MathUtil = require('../../util/math-util');
const StageLayering = require('../../engine/stage-layering');
const {layoutText, headingVectors, LINE_LEADING} = require('./text-writer');

// eslint-disable-next-line @stylistic/max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48ZyBmaWxsPSJub25lIiBzdHJva2U9IiNGRkYiIHN0cm9rZS13aWR0aD0iMi42IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwb2x5bGluZSBwb2ludHM9IjEzLDI4IDIwLDExIDI3LDI4Ii8+PGxpbmUgeDE9IjE1LjgiIHkxPSIyMiIgeDI9IjI0LjIiIHkyPSIyMiIvPjwvZz48L3N2Zz4=';

// eslint-disable-next-line @stylistic/max-len
const menuIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxOSIgZmlsbD0iIzBGQkQ4QyIgc3Ryb2tlPSIjMEI4RTY5IiBzdHJva2Utd2lkdGg9IjIiLz48ZyBmaWxsPSJub25lIiBzdHJva2U9IiNGRkYiIHN0cm9rZS13aWR0aD0iMi42IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwb2x5bGluZSBwb2ludHM9IjEzLDI4IDIwLDExIDI3LDI4Ii8+PGxpbmUgeDE9IjE1LjgiIHkxPSIyMiIgeDI9IjI0LjIiIHkyPSIyMiIvPjwvZz48L3N2Zz4=';

/**
 * Host for the Pen Text extension: blocks that write text on the stage by
 * drawing single-stroke vector glyphs into a dedicated pen layer.
 */
class Scratch3PenTextBlocks {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;

        /**
         * The ID of the renderer Drawable corresponding to the writing layer.
         * @type {int}
         * @private
         */
        this._penDrawableId = -1;

        /**
         * The ID of the renderer Skin corresponding to the writing layer.
         * @type {int}
         * @private
         */
        this._penSkinId = -1;

        this._onTargetCreated = this._onTargetCreated.bind(this);
        runtime.on('targetWasCreated', this._onTargetCreated);
        runtime.on('RUNTIME_DISPOSED', this.clear.bind(this));
    }

    /**
     * The default text state, to be used when a target has no existing state.
     * `lineStartX`/`lineStartY` remember where the current line began (in stage
     * units) so "start new line" can return to the left margin and drop down;
     * they are null until the target's first write establishes a line.
     * @type {PenTextState} {size: text size in stage units, color4f: RGBA 0..1,
     *   lineStartX: number|null, lineStartY: number|null}
     */
    static get DEFAULT_TEXT_STATE () {
        return {
            size: 24,
            color4f: [0, 0, 1, 1],
            lineStartX: null,
            lineStartY: null
        };
    }

    /**
     * The minimum and maximum allowed text size (capital letter height in
     * stage units). The maximum matches the stage height.
     * @type {{min: number, max: number}}
     */
    static get SIZE_RANGE () {
        return {min: 4, max: 360};
    }

    /**
     * The key to load or store a target's text state on the target.
     * @type {string}
     */
    static get STATE_KEY () {
        return 'Scratch.penText';
    }

    /**
     * Retrieve the ID of the renderer "Skin" corresponding to the writing
     * layer. If the skin doesn't yet exist, create it. This layer is separate
     * from the pen extension's layer so that erasing writing leaves pen
     * artwork intact, and vice versa.
     * @returns {int} the Skin ID of the writing layer, or -1 on failure.
     * @private
     */
    _getPenLayerID () {
        if (this._penSkinId < 0 && this.runtime.renderer) {
            this._penSkinId = this.runtime.renderer.createPenSkin();
            this._penDrawableId = this.runtime.renderer.createDrawable(StageLayering.PEN_LAYER);
            this.runtime.renderer.updateDrawableSkinId(this._penDrawableId, this._penSkinId);
        }
        return this._penSkinId;
    }

    /**
     * @param {Target} target - collect text state for this target.
     * @returns {PenTextState} the mutable text state associated with that
     *   target. This will be created if necessary.
     * @private
     */
    _getTextState (target) {
        let textState = target.getCustomState(Scratch3PenTextBlocks.STATE_KEY);
        if (!textState) {
            textState = Clone.simple(Scratch3PenTextBlocks.DEFAULT_TEXT_STATE);
            target.setCustomState(Scratch3PenTextBlocks.STATE_KEY, textState);
        }
        return textState;
    }

    /**
     * When a Target is cloned, clone the text state.
     * @param {Target} newTarget - the newly created target.
     * @param {Target} [sourceTarget] - the target used as a source for the
     *   new clone, if any.
     * @listens Runtime#event:targetWasCreated
     * @private
     */
    _onTargetCreated (newTarget, sourceTarget) {
        if (sourceTarget) {
            const textState = sourceTarget.getCustomState(Scratch3PenTextBlocks.STATE_KEY);
            if (textState) {
                newTarget.setCustomState(Scratch3PenTextBlocks.STATE_KEY, Clone.simple(textState));
            }
        }
    }

    /**
     * The heading, in Scratch degrees, to lay text out along for a target.
     * Sprites write along their own direction so text follows where they
     * point; the stage has no heading, so its text is always upright.
     * @param {Target} target - the target being written for.
     * @returns {number} the layout heading in degrees (90 = upright, rightward).
     * @private
     */
    _headingOf (target) {
        return (!target.isStage && typeof target.direction === 'number') ?
            target.direction : 90;
    }

    /**
     * Write text into the writing layer, anchored at the baseline of the
     * first glyph's left edge and laid out along the target's heading. Records
     * the anchor as the start of the current line so a later "start new line"
     * can return to this left margin.
     * @param {string} text - the text to write.
     * @param {number} x - x coordinate of the anchor in stage units.
     * @param {number} y - y coordinate of the anchor in stage units.
     * @param {Target} target - the target whose text state to use.
     * @returns {{endX: number, endY: number}} the pen position after the last
     *   glyph, where the next write would continue.
     * @private
     */
    _write (text, x, y, target) {
        const textState = this._getTextState(target);
        textState.lineStartX = x;
        textState.lineStartY = y;
        const penSkinId = this._getPenLayerID();
        if (penSkinId < 0) return {endX: x, endY: y};
        const penAttributes = {
            color4f: textState.color4f,
            // Stroke thickness scales with text size so letterforms keep
            // their weight; size 24 draws with a 2-unit stroke.
            diameter: Math.max(1, textState.size / 12)
        };
        const {segments, endX, endY} = layoutText(text, x, y, textState.size, this._headingOf(target));
        for (const [x0, y0, x1, y1] of segments) {
            this.runtime.renderer.penLine(penSkinId, penAttributes, x0, y0, x1, y1);
        }
        // No redraw request: the renderer draws every frame, and a request would
        // end the frame's thread stepping, so a script could only write once per
        // frame instead of, say, erasing and rewriting several labels at once.
        return {endX, endY};
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'penText',
            name: formatMessage({
                id: 'penText.categoryName',
                default: 'Pen Text',
                description: 'Label for the Pen Text extension category'
            }),
            blockIconURI: blockIconURI,
            menuIconURI: menuIconURI,
            blocks: [
                {
                    opcode: 'write',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'penText.write',
                        default: 'write [TEXT]',
                        description: 'write text on the stage at the sprite position'
                    }),
                    arguments: {
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: formatMessage({
                                id: 'penText.defaultTextToWrite',
                                default: 'Hello!',
                                description: 'default text to write on the stage'
                            })
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'newLine',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'penText.newLine',
                        default: 'start new line',
                        description: 'move the sprite to the start of the next line of text'
                    }),
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'setSize',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'penText.setSize',
                        default: 'set text size to [SIZE]',
                        description: 'set the height of written text'
                    }),
                    arguments: {
                        SIZE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 24
                        }
                    }
                },
                {
                    opcode: 'setColor',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'penText.setColor',
                        default: 'set text color to [COLOR]',
                        description: 'set the color of written text'
                    }),
                    arguments: {
                        COLOR: {
                            type: ArgumentType.COLOR
                        }
                    }
                },
                {
                    opcode: 'clear',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'penText.clear',
                        default: 'erase all writing',
                        description: 'erase all text written on the stage'
                    })
                }
            ]
        };
    }

    /**
     * The penText "write text" block: writes at the sprite's position and
     * moves the sprite to the end of the text so a later write continues after
     * it.
     * @param {object} args - the block arguments.
     *   @property {string} TEXT - the text to write.
     * @param {object} util - utility object provided by the runtime.
     */
    write (args, util) {
        const {endX, endY} = this._write(Cast.toString(args.TEXT), util.target.x, util.target.y, util.target);
        util.target.setXY(endX, endY);
    }

    /**
     * The penText "start new line" block: moves the sprite back to the left
     * margin of the current line (where the last write began) and down one
     * line, both measured along the sprite's heading, so the next write starts
     * a fresh line.
     * @param {object} args - the block arguments (none).
     * @param {object} util - utility object provided by the runtime.
     */
    newLine (args, util) {
        const textState = this._getTextState(util.target);
        const startX = textState.lineStartX === null ? util.target.x : textState.lineStartX;
        const startY = textState.lineStartY === null ? util.target.y : textState.lineStartY;
        const {ux, uy} = headingVectors(this._headingOf(util.target));
        const nextX = startX - (ux * LINE_LEADING * textState.size);
        const nextY = startY - (uy * LINE_LEADING * textState.size);
        textState.lineStartX = nextX;
        textState.lineStartY = nextY;
        util.target.setXY(nextX, nextY);
    }

    /**
     * The penText "set text size to" block.
     * @param {object} args - the block arguments.
     *   @property {number} SIZE - the new text size in stage units.
     * @param {object} util - utility object provided by the runtime.
     */
    setSize (args, util) {
        const {min, max} = Scratch3PenTextBlocks.SIZE_RANGE;
        const textState = this._getTextState(util.target);
        textState.size = MathUtil.clamp(Cast.toNumber(args.SIZE), min, max);
    }

    /**
     * The penText "set text color to" block.
     * @param {object} args - the block arguments.
     *   @property {int|string} COLOR - the new color, as read by
     *     Cast.toRgbColorObject.
     * @param {object} util - utility object provided by the runtime.
     */
    setColor (args, util) {
        const rgb = Cast.toRgbColorObject(args.COLOR);
        const textState = this._getTextState(util.target);
        textState.color4f = [
            rgb.r / 255,
            rgb.g / 255,
            rgb.b / 255,
            typeof rgb.a === 'number' ? rgb.a / 255 : 1
        ];
    }

    /**
     * The penText "erase all writing" block: clears the writing layer.
     */
    clear () {
        const penSkinId = this._getPenLayerID();
        if (penSkinId >= 0) {
            this.runtime.renderer.penClear(penSkinId);
        }
    }
}

module.exports = Scratch3PenTextBlocks;
