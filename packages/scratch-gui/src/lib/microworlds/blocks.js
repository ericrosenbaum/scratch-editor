/**
 * @file Helpers for building the preloaded Blockly blocks used by the
 * Microworlds wizard. Blocks use fixed IDs (prefixed `mw_`) so the wizard can
 * deterministically create, connect, update, and remove them across steps.
 *
 * Block objects follow the VM's serialized block shape consumed by
 * `target.blocks.createBlock(block)`:
 *   {id, opcode, inputs, fields, next, parent, topLevel, shadow, x, y}
 */

// Fixed IDs for wizard-managed blocks on the main sprite.
const HAT_ID = 'mw_hat';
const SAY_ID = 'mw_say';
const SAY_MSG_ID = 'mw_say_msg';
const SAY_SECS_ID = 'mw_say_secs';

/**
 * Build a `say ... for ... seconds` block plus its two shadow inputs.
 * @param {object} opts options
 * @param {string} opts.id id for the say block
 * @param {string} opts.msgId id for the message text shadow
 * @param {string} opts.secsId id for the seconds number shadow
 * @param {string} opts.message the spoken message
 * @param {number} opts.secs number of seconds
 * @param {?string} opts.parent id of the parent block (null if top level)
 * @param {boolean} opts.topLevel whether the block sits at the top of a stack
 * @param {number} opts.x workspace x (only used when top level)
 * @param {number} opts.y workspace y (only used when top level)
 * @returns {Array<object>} the say block followed by its shadow blocks
 */
const buildSayForSecs = ({id, msgId, secsId, message, secs, parent, topLevel, x, y}) => ([
    {
        id,
        opcode: 'looks_sayforsecs',
        inputs: {
            MESSAGE: {name: 'MESSAGE', block: msgId, shadow: msgId},
            SECS: {name: 'SECS', block: secsId, shadow: secsId}
        },
        fields: {},
        next: null,
        parent: parent || null,
        topLevel: Boolean(topLevel),
        shadow: false,
        x: topLevel ? x : 0,
        y: topLevel ? y : 0
    },
    {
        id: msgId,
        opcode: 'text',
        inputs: {},
        fields: {TEXT: {name: 'TEXT', value: message}},
        next: null,
        parent: id,
        topLevel: false,
        shadow: true
    },
    {
        id: secsId,
        opcode: 'math_number',
        inputs: {},
        fields: {NUM: {name: 'NUM', value: `${secs}`}},
        next: null,
        parent: id,
        topLevel: false,
        shadow: true
    }
]);

/**
 * Build the wizard's preloaded stack for a given step.
 * @param {object} opts options
 * @param {boolean} opts.withHat whether to include a `when green flag clicked` hat
 * @param {string} opts.message the message the sprite says
 * @param {number} opts.secs seconds to say it for
 * @returns {Array<object>} array of block objects ready for createBlock()
 */
const buildSayStack = ({withHat, message, secs = 2}) => {
    if (withHat) {
        const say = buildSayForSecs({
            id: SAY_ID,
            msgId: SAY_MSG_ID,
            secsId: SAY_SECS_ID,
            message,
            secs,
            parent: HAT_ID,
            topLevel: false
        });
        const hat = {
            id: HAT_ID,
            opcode: 'event_whenflagclicked',
            inputs: {},
            fields: {},
            next: SAY_ID,
            parent: null,
            topLevel: true,
            shadow: false,
            x: 40,
            y: 40
        };
        return [hat, ...say];
    }
    return buildSayForSecs({
        id: SAY_ID,
        msgId: SAY_MSG_ID,
        secsId: SAY_SECS_ID,
        message,
        secs,
        parent: null,
        topLevel: true,
        x: 40,
        y: 60
    });
};

export {
    buildSayStack,
    HAT_ID,
    SAY_ID,
    SAY_MSG_ID,
    SAY_SECS_ID
};
