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
// "glide () secs to (random position)" — the second block in the stack.
const GLIDE_ID = 'mw_glide';
const GLIDE_SECS_ID = 'mw_glide_secs';
const GLIDE_MENU_ID = 'mw_glide_menu';

/**
 * Build a `say ... for ... seconds` block plus its two shadow inputs.
 * @param {object} opts options
 * @param {string} opts.id id for the say block
 * @param {string} opts.msgId id for the message text shadow
 * @param {string} opts.secsId id for the seconds number shadow
 * @param {string} opts.message the spoken message
 * @param {number} opts.secs number of seconds
 * @param {?string} opts.parent id of the parent block (null if top level)
 * @param {?string} opts.next id of the block connected below this one (null if none)
 * @param {boolean} opts.topLevel whether the block sits at the top of a stack
 * @param {number} opts.x workspace x (only used when top level)
 * @param {number} opts.y workspace y (only used when top level)
 * @returns {Array<object>} the say block followed by its shadow blocks
 */
const buildSayForSecs = ({id, msgId, secsId, message, secs, parent, next, topLevel, x, y}) => ([
    {
        id,
        opcode: 'looks_sayforsecs',
        inputs: {
            MESSAGE: {name: 'MESSAGE', block: msgId, shadow: msgId},
            SECS: {name: 'SECS', block: secsId, shadow: secsId}
        },
        fields: {},
        next: next || null,
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
        x: 28,
        y: 40
    });
};

/**
 * Build a `when green flag clicked` hat block.
 * @param {object} opts options
 * @param {?string} opts.next id of the block connected below the hat
 * @param {number} opts.x workspace x
 * @param {number} opts.y workspace y
 * @returns {object} the hat block
 */
const buildHat = ({next, x, y}) => ({
    id: HAT_ID,
    opcode: 'event_whenflagclicked',
    inputs: {},
    fields: {},
    next: next || null,
    parent: null,
    topLevel: true,
    shadow: false,
    x,
    y
});

// The first say block (canonical SAY_ID), with its own fixed shadow ids.
const buildSayA = opts => buildSayForSecs({
    id: SAY_ID, msgId: SAY_MSG_ID, secsId: SAY_SECS_ID, secs: 2, ...opts
});

/**
 * Build a `glide () secs to (random position)` block plus its shadow inputs.
 * This is the second block in the intro stack.
 * @param {object} [opts] options
 * @param {number} [opts.secs] seconds to glide
 * @param {?string} [opts.parent] id of the parent block (null if top level)
 * @param {?string} [opts.next] id of the block connected below this one
 * @param {boolean} [opts.topLevel] whether the block sits at the top of a stack
 * @param {number} [opts.x] workspace x (only used when top level)
 * @param {number} [opts.y] workspace y (only used when top level)
 * @returns {Array<object>} the glide block followed by its shadow blocks
 */
const buildGlideTo = ({secs = 1, parent, next, topLevel, x, y} = {}) => ([
    {
        id: GLIDE_ID,
        opcode: 'motion_glideto',
        inputs: {
            SECS: {name: 'SECS', block: GLIDE_SECS_ID, shadow: GLIDE_SECS_ID},
            TO: {name: 'TO', block: GLIDE_MENU_ID, shadow: GLIDE_MENU_ID}
        },
        fields: {},
        next: next || null,
        parent: parent || null,
        topLevel: Boolean(topLevel),
        shadow: false,
        x: topLevel ? x : 0,
        y: topLevel ? y : 0
    },
    {
        id: GLIDE_SECS_ID,
        opcode: 'math_number',
        inputs: {},
        fields: {NUM: {name: 'NUM', value: `${secs}`}},
        next: null,
        parent: GLIDE_ID,
        topLevel: false,
        shadow: true
    },
    {
        id: GLIDE_MENU_ID,
        opcode: 'motion_glideto_menu',
        inputs: {},
        fields: {TO: {name: 'TO', value: '_random_'}},
        next: null,
        parent: GLIDE_ID,
        topLevel: false,
        shadow: true
    }
]);

/**
 * A `say` block and a detached `glide` block (the drag-to-stack step): the say
 * at the top, the glide a couple of block-heights below, unconnected.
 * @param {object} opts options
 * @param {string} opts.message what the say block says
 * @param {number} [opts.secs] say seconds
 * @returns {Array<object>} block objects ready for createBlock()
 */
const buildLooseStack = ({message, secs = 2}) => ([
    ...buildSayA({message, secs, topLevel: true, x: 28, y: 24}),
    ...buildGlideTo({topLevel: true, x: 44, y: 116})
]);

/**
 * A connected `say -> glide` stack.
 * @param {object} opts options
 * @param {string} opts.message what the say block says
 * @param {number} [opts.secs] say seconds
 * @returns {Array<object>} block objects ready for createBlock()
 */
const buildConnectedStack = ({message, secs = 2}) => ([
    ...buildSayA({message, secs, topLevel: true, next: GLIDE_ID, x: 28, y: 40}),
    ...buildGlideTo({parent: SAY_ID})
]);

/**
 * A detached green-flag hat above a connected `say -> glide` stack.
 * @param {object} opts options
 * @param {string} opts.message what the say block says
 * @param {number} [opts.secs] say seconds
 * @returns {Array<object>} block objects ready for createBlock()
 */
const buildHatPlusStack = ({message, secs = 2}) => ([
    buildHat({x: 28, y: 20}),
    ...buildSayA({message, secs, topLevel: true, next: GLIDE_ID, x: 28, y: 112}),
    ...buildGlideTo({parent: SAY_ID})
]);

/**
 * The full `hat -> say -> glide` stack.
 * @param {object} opts options
 * @param {string} opts.message what the say block says
 * @param {number} [opts.secs] say seconds
 * @returns {Array<object>} block objects ready for createBlock()
 */
const buildFullStack = ({message, secs = 2}) => ([
    buildHat({next: SAY_ID, x: 28, y: 28}),
    ...buildSayA({message, secs, parent: HAT_ID, next: GLIDE_ID, topLevel: false}),
    ...buildGlideTo({parent: SAY_ID})
]);

export {
    buildSayStack,
    buildLooseStack,
    buildConnectedStack,
    buildHatPlusStack,
    buildFullStack,
    HAT_ID,
    SAY_ID,
    SAY_MSG_ID,
    SAY_SECS_ID,
    GLIDE_ID,
    GLIDE_SECS_ID,
    GLIDE_MENU_ID
};
