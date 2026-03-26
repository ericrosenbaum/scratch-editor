/**
 * block-summary.js — Maps Scratch block opcodes to human-readable names
 * and generates summaries of block editing activity.
 */

/**
 * Map of opcode → short readable name.
 * Covers core Scratch block categories.
 */
const OPCODE_NAMES = {
    // Motion
    motion_movesteps: 'move steps',
    motion_turnright: 'turn right',
    motion_turnleft: 'turn left',
    motion_goto: 'go to',
    motion_gotoxy: 'go to x y',
    motion_glideto: 'glide to',
    motion_glidesecstoxy: 'glide to x y',
    motion_pointindirection: 'point in direction',
    motion_pointtowards: 'point towards',
    motion_changexby: 'change x',
    motion_setx: 'set x',
    motion_changeyby: 'change y',
    motion_sety: 'set y',
    motion_ifonedgebounce: 'if on edge bounce',
    motion_setrotationstyle: 'set rotation style',
    motion_xposition: 'x position',
    motion_yposition: 'y position',
    motion_direction: 'direction',

    // Looks
    looks_sayforsecs: 'say for secs',
    looks_say: 'say',
    looks_thinkforsecs: 'think for secs',
    looks_think: 'think',
    looks_switchcostumeto: 'switch costume',
    looks_nextcostume: 'next costume',
    looks_switchbackdropto: 'switch backdrop',
    looks_nextbackdrop: 'next backdrop',
    looks_changesizeby: 'change size',
    looks_setsizeto: 'set size',
    looks_changeeffectby: 'change effect',
    looks_seteffectto: 'set effect',
    looks_cleargraphiceffects: 'clear effects',
    looks_show: 'show',
    looks_hide: 'hide',
    looks_gotofrontback: 'go to layer',
    looks_goforwardbackwardlayers: 'go forward layers',
    looks_costumenumbername: 'costume #',
    looks_backdropnumbername: 'backdrop #',
    looks_size: 'size',

    // Sound
    sound_playuntildone: 'play sound until done',
    sound_play: 'start sound',
    sound_stopallsounds: 'stop all sounds',
    sound_changeeffectby: 'change sound effect',
    sound_seteffectto: 'set sound effect',
    sound_cleareffects: 'clear sound effects',
    sound_changevolumeby: 'change volume',
    sound_setvolumeto: 'set volume',
    sound_volume: 'volume',

    // Events
    event_whenflagclicked: 'when flag clicked',
    event_whenkeypressed: 'when key pressed',
    event_whenthisspriteclicked: 'when sprite clicked',
    event_whenbackdropswitchesto: 'when backdrop switches',
    event_whengreaterthan: 'when greater than',
    event_whenbroadcastreceived: 'when I receive',
    event_broadcast: 'broadcast',
    event_broadcastandwait: 'broadcast and wait',

    // Control
    control_wait: 'wait',
    control_repeat: 'repeat',
    control_forever: 'forever',
    control_if: 'if then',
    control_if_else: 'if else',
    control_wait_until: 'wait until',
    control_repeat_until: 'repeat until',
    control_stop: 'stop',
    control_start_as_clone: 'when I start as clone',
    control_create_clone_of: 'create clone',
    control_delete_this_clone: 'delete this clone',

    // Sensing
    sensing_touchingobject: 'touching?',
    sensing_touchingcolor: 'touching color?',
    sensing_coloristouchingcolor: 'color touching?',
    sensing_distanceto: 'distance to',
    sensing_askandwait: 'ask and wait',
    sensing_answer: 'answer',
    sensing_keypressed: 'key pressed?',
    sensing_mousedown: 'mouse down?',
    sensing_mousex: 'mouse x',
    sensing_mousey: 'mouse y',
    sensing_setdragmode: 'set drag mode',
    sensing_loudness: 'loudness',
    sensing_timer: 'timer',
    sensing_resettimer: 'reset timer',
    sensing_of: 'of',
    sensing_current: 'current',
    sensing_dayssince2000: 'days since 2000',
    sensing_username: 'username',

    // Operators
    operator_add: '+',
    operator_subtract: '-',
    operator_multiply: '*',
    operator_divide: '/',
    operator_random: 'pick random',
    operator_gt: '>',
    operator_lt: '<',
    operator_equals: '=',
    operator_and: 'and',
    operator_or: 'or',
    operator_not: 'not',
    operator_join: 'join',
    operator_letter_of: 'letter of',
    operator_length: 'length of',
    operator_contains: 'contains?',
    operator_mod: 'mod',
    operator_round: 'round',
    operator_mathop: 'math op',

    // Variables
    data_setvariableto: 'set variable',
    data_changevariableby: 'change variable',
    data_showvariable: 'show variable',
    data_hidevariable: 'hide variable',
    data_addtolist: 'add to list',
    data_deleteoflist: 'delete from list',
    data_deletealloflist: 'delete all of list',
    data_insertatlist: 'insert in list',
    data_replaceitemoflist: 'replace in list',
    data_itemoflist: 'item of list',
    data_itemnumoflist: 'item # of list',
    data_lengthoflist: 'length of list',
    data_listcontainsitem: 'list contains?',
    data_showlist: 'show list',
    data_hidelist: 'hide list',

    // My Blocks
    procedures_definition: 'define block',
    procedures_call: 'my block',
    procedures_prototype: 'block prototype',
    argument_reporter_string_number: 'parameter',
    argument_reporter_boolean: 'boolean parameter'
};

/**
 * Get a readable name for an opcode.
 * @param {string} opcode - block opcode
 * @returns {string} readable name
 */
const getBlockName = opcode => {
    if (OPCODE_NAMES[opcode]) return OPCODE_NAMES[opcode];

    // Try to derive a readable name from the opcode
    const parts = opcode.split('_');
    if (parts.length >= 2) {
        return parts.slice(1).join(' ');
    }
    return opcode;
};

/**
 * Get the category for an opcode.
 * @param {string} opcode - block opcode
 * @returns {string} category name
 */
const getBlockCategory = opcode => {
    const prefix = opcode.split('_')[0];
    const categories = {
        motion: 'Motion',
        looks: 'Looks',
        sound: 'Sound',
        event: 'Events',
        control: 'Control',
        sensing: 'Sensing',
        operator: 'Operators',
        data: 'Variables',
        procedures: 'My Blocks',
        argument: 'My Blocks'
    };
    return categories[prefix] || prefix;
};

/**
 * Generate a human-readable summary from accumulated block changes.
 * @param {object} changes - structured block change data
 * @param {Array} changes.created - array of {opcode} for created blocks
 * @param {Array} changes.deleted - array of {opcode} for deleted blocks
 * @param {Array} changes.changed - array of {field, newValue} for changed blocks
 * @param {Array} changes.moved - array of {connected} for moved blocks
 * @returns {string} summary text
 */
const generateBlockSummary = changes => {
    const parts = [];

    if (changes.created.length > 0) {
        const names = changes.created
            .map(c => getBlockName(c.opcode))
            .filter((v, i, a) => a.indexOf(v) === i); // unique
        if (names.length <= 3) {
            parts.push(`Added "${names.join('", "')}"`);
        } else {
            parts.push(`Added ${changes.created.length} blocks`);
        }
    }

    if (changes.deleted.length > 0) {
        const names = changes.deleted
            .map(c => getBlockName(c.opcode))
            .filter((v, i, a) => a.indexOf(v) === i);
        if (names.length <= 2) {
            parts.push(`removed "${names.join('", "')}"`);
        } else {
            parts.push(`removed ${changes.deleted.length} blocks`);
        }
    }

    if (changes.changed.length > 0 && parts.length === 0) {
        parts.push(`Edited ${changes.changed.length} value${
            changes.changed.length !== 1 ? 's' : ''
        }`);
    }

    if (changes.moved.length > 0 && parts.length === 0) {
        const connected = changes.moved.filter(m => m.connected).length;
        if (connected > 0) {
            parts.push(`Connected ${connected} block${
                connected !== 1 ? 's' : ''
            }`);
        } else {
            parts.push(`Rearranged blocks`);
        }
    }

    if (parts.length === 0) {
        return 'Modified blocks';
    }

    // Capitalize first part, join with ", "
    parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    return parts.join(', ');
};

export {
    OPCODE_NAMES,
    getBlockName,
    getBlockCategory,
    generateBlockSummary
};
