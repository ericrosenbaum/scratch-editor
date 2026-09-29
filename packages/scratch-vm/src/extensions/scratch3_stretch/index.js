const formatMessage = require('format-message');
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const TargetType = require('../../extension-support/target-type');
const Cast = require('../../util/cast');

// eslint-disable-next-line @stylistic/max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cmVjdCB4PSIxNCIgeT0iMTQuNSIgd2lkdGg9IjEyIiBoZWlnaHQ9IjExIiByeD0iMi41IiBmaWxsPSIjRkZGIi8+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRkZGIiBzdHJva2Utd2lkdGg9IjIuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTEgMjBINS41TTggMTdsLTMgMyAzIDMiLz48cGF0aCBkPSJNMjkgMjBoNS41TTMyIDE3bDMgMy0zIDMiLz48L2c+PC9zdmc+';

// eslint-disable-next-line @stylistic/max-len
const menuIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxOSIgZmlsbD0iIzBGQkQ4QyIgc3Ryb2tlPSIjMEI4RTY5IiBzdHJva2Utd2lkdGg9IjIiLz48cmVjdCB4PSIxNCIgeT0iMTQuNSIgd2lkdGg9IjEyIiBoZWlnaHQ9IjExIiByeD0iMi41IiBmaWxsPSIjRkZGIi8+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRkZGIiBzdHJva2Utd2lkdGg9IjIuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTEgMjBINS41TTggMTdsLTMgMyAzIDMiLz48cGF0aCBkPSJNMjkgMjBoNS41TTMyIDE3bDMgMy0zIDMiLz48L2c+PC9zdmc+';

/**
 * Axis menu values.
 * @readonly
 * @enum {string}
 */
const AXIS = {
    WIDTH: 'width',
    HEIGHT: 'height'
};

/**
 * Host for the Stretch extension: blocks that scale a sprite's width and
 * height independently of each other.
 */
class Scratch3StretchBlocks {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;
    }

    getInfo () {
        return {
            id: 'stretch',
            name: formatMessage({
                id: 'stretch.categoryName',
                default: 'Stretch',
                description: 'Label for the stretch extension category'
            }),
            blockIconURI: blockIconURI,
            menuIconURI: menuIconURI,
            blocks: [
                {
                    opcode: 'stretch',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'stretch.stretch',
                        default: 'stretch [AXIS] by [AMOUNT]',
                        description: 'increase the width or height of a sprite by a percentage'
                    }),
                    arguments: {
                        AXIS: {
                            type: ArgumentType.STRING,
                            menu: 'AXIS',
                            defaultValue: AXIS.WIDTH
                        },
                        AMOUNT: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 50
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'squish',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'stretch.squish',
                        default: 'squish [AXIS] by [AMOUNT]',
                        description: 'decrease the width or height of a sprite by a percentage'
                    }),
                    arguments: {
                        AXIS: {
                            type: ArgumentType.STRING,
                            menu: 'AXIS',
                            defaultValue: AXIS.WIDTH
                        },
                        AMOUNT: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 50
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'setStretch',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'stretch.setStretch',
                        default: 'set [AXIS] to [PERCENT] %',
                        description: 'set the width or height of a sprite to a percentage'
                    }),
                    arguments: {
                        AXIS: {
                            type: ArgumentType.STRING,
                            menu: 'AXIS',
                            defaultValue: AXIS.WIDTH
                        },
                        PERCENT: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 100
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'resetStretch',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'stretch.resetStretch',
                        default: 'reset width and height',
                        description: 'undo any stretching or squishing of a sprite'
                    }),
                    filter: [TargetType.SPRITE]
                }
            ],
            menus: {
                AXIS: {
                    acceptReporters: true,
                    items: [
                        {
                            text: formatMessage({
                                id: 'stretch.axisMenu.width',
                                default: 'width',
                                description: 'label for the width of a sprite in the stretch axis menu'
                            }),
                            value: AXIS.WIDTH
                        },
                        {
                            text: formatMessage({
                                id: 'stretch.axisMenu.height',
                                default: 'height',
                                description: 'label for the height of a sprite in the stretch axis menu'
                            }),
                            value: AXIS.HEIGHT
                        }
                    ]
                }
            }
        };
    }

    /**
     * Set one axis of a target's stretch, leaving the other unchanged.
     * @param {RenderedTarget} target - the target to stretch.
     * @param {*} axis - which axis to set, from the AXIS menu.
     * @param {number} percent - the new stretch for that axis, as a percent.
     * @private
     */
    _setAxis (target, axis, percent) {
        const [width, height] = target.stretch;
        if (Cast.toString(axis) === AXIS.HEIGHT) {
            target.setStretch(width, percent);
        } else {
            target.setStretch(percent, height);
        }
    }

    /**
     * @param {RenderedTarget} target - the target to read.
     * @param {*} axis - which axis to read, from the AXIS menu.
     * @returns {number} the target's current stretch on that axis.
     * @private
     */
    _getAxis (target, axis) {
        return target.stretch[Cast.toString(axis) === AXIS.HEIGHT ? 1 : 0];
    }

    stretch (args, util) {
        const current = this._getAxis(util.target, args.AXIS);
        this._setAxis(util.target, args.AXIS, current + Cast.toNumber(args.AMOUNT));
    }

    squish (args, util) {
        const current = this._getAxis(util.target, args.AXIS);
        this._setAxis(util.target, args.AXIS, current - Cast.toNumber(args.AMOUNT));
    }

    setStretch (args, util) {
        this._setAxis(util.target, args.AXIS, Cast.toNumber(args.PERCENT));
    }

    resetStretch (args, util) {
        util.target.setStretch(100, 100);
    }
}

module.exports = Scratch3StretchBlocks;
