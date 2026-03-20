/**
 * Block templates for the "Get Unstuck" feature.
 *
 * Each template is an array of block objects in scratch-vm's internal format,
 * suitable for passing to vm.shareBlocksToTarget(). Block IDs use placeholder
 * prefixes that get replaced with unique IDs by the VM's newBlockIds().
 *
 * Format per block:
 *   id, opcode, next, parent, inputs, fields, topLevel, shadow, x, y
 */

/**
 * Template: when green flag clicked → move 10 steps
 */
const whenFlagMove = [
    {
        id: 'unstuck_flag_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_flag_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_flag_2',
        opcode: 'motion_movesteps',
        next: null,
        parent: 'unstuck_flag_1',
        inputs: {
            STEPS: {
                name: 'STEPS',
                block: 'unstuck_flag_2_steps',
                shadow: 'unstuck_flag_2_steps'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_flag_2_steps',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_flag_2',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '10'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when key pressed → change x by 10
 */
const whenKeyMoveRight = [
    {
        id: 'unstuck_key_1',
        opcode: 'event_whenkeypressed',
        next: 'unstuck_key_2',
        parent: null,
        inputs: {},
        fields: {
            KEY_OPTION: {
                name: 'KEY_OPTION',
                value: 'right arrow'
            }
        },
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_key_2',
        opcode: 'motion_changexby',
        next: null,
        parent: 'unstuck_key_1',
        inputs: {
            DX: {
                name: 'DX',
                block: 'unstuck_key_2_dx',
                shadow: 'unstuck_key_2_dx'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_key_2_dx',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_key_2',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '10'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag clicked → forever → next costume + wait
 */
const foreverNextCostume = [
    {
        id: 'unstuck_anim_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_anim_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_anim_2',
        opcode: 'control_forever',
        next: null,
        parent: 'unstuck_anim_1',
        inputs: {
            SUBSTACK: {
                name: 'SUBSTACK',
                block: 'unstuck_anim_3',
                shadow: null
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_anim_3',
        opcode: 'looks_nextcostume',
        next: 'unstuck_anim_4',
        parent: 'unstuck_anim_2',
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_anim_4',
        opcode: 'control_wait',
        next: null,
        parent: 'unstuck_anim_3',
        inputs: {
            DURATION: {
                name: 'DURATION',
                block: 'unstuck_anim_4_dur',
                shadow: 'unstuck_anim_4_dur'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_anim_4_dur',
        opcode: 'math_positive_number',
        next: null,
        parent: 'unstuck_anim_4',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '0.25'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag clicked → say "Hello!" for 2 seconds
 */
const saySomething = [
    {
        id: 'unstuck_say_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_say_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_say_2',
        opcode: 'looks_sayforsecs',
        next: null,
        parent: 'unstuck_say_1',
        inputs: {
            MESSAGE: {
                name: 'MESSAGE',
                block: 'unstuck_say_2_msg',
                shadow: 'unstuck_say_2_msg'
            },
            SECS: {
                name: 'SECS',
                block: 'unstuck_say_2_secs',
                shadow: 'unstuck_say_2_secs'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_say_2_msg',
        opcode: 'text',
        next: null,
        parent: 'unstuck_say_2',
        inputs: {},
        fields: {
            TEXT: {
                name: 'TEXT',
                value: 'Hello!'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_say_2_secs',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_say_2',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '2'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag clicked → play sound until done
 */
const playSound = [
    {
        id: 'unstuck_snd_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_snd_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_snd_2',
        opcode: 'sound_playuntildone',
        next: null,
        parent: 'unstuck_snd_1',
        inputs: {
            SOUND_MENU: {
                name: 'SOUND_MENU',
                block: 'unstuck_snd_2_menu',
                shadow: 'unstuck_snd_2_menu'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_snd_2_menu',
        opcode: 'sound_sounds_menu',
        next: null,
        parent: 'unstuck_snd_2',
        inputs: {},
        fields: {
            SOUND_MENU: {
                name: 'SOUND_MENU',
                value: 'Meow'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag clicked → forever → if touching → change score
 * (simplified collision detection pattern)
 */
const foreverIfTouching = [
    {
        id: 'unstuck_coll_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_coll_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_coll_2',
        opcode: 'control_forever',
        next: null,
        parent: 'unstuck_coll_1',
        inputs: {
            SUBSTACK: {
                name: 'SUBSTACK',
                block: 'unstuck_coll_3',
                shadow: null
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_coll_3',
        opcode: 'control_if',
        next: null,
        parent: 'unstuck_coll_2',
        inputs: {
            CONDITION: {
                name: 'CONDITION',
                block: 'unstuck_coll_4',
                shadow: null
            },
            SUBSTACK: {
                name: 'SUBSTACK',
                block: 'unstuck_coll_5',
                shadow: null
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_coll_4',
        opcode: 'sensing_touchingobject',
        next: null,
        parent: 'unstuck_coll_3',
        inputs: {
            TOUCHINGOBJECTMENU: {
                name: 'TOUCHINGOBJECTMENU',
                block: 'unstuck_coll_4_menu',
                shadow: 'unstuck_coll_4_menu'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_coll_4_menu',
        opcode: 'sensing_touchingobjectmenu',
        next: null,
        parent: 'unstuck_coll_4',
        inputs: {},
        fields: {
            TOUCHINGOBJECTMENU: {
                name: 'TOUCHINGOBJECTMENU',
                value: '_edge_'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_coll_5',
        opcode: 'looks_say',
        next: null,
        parent: 'unstuck_coll_3',
        inputs: {
            MESSAGE: {
                name: 'MESSAGE',
                block: 'unstuck_coll_5_msg',
                shadow: 'unstuck_coll_5_msg'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_coll_5_msg',
        opcode: 'text',
        next: null,
        parent: 'unstuck_coll_5',
        inputs: {},
        fields: {
            TEXT: {
                name: 'TEXT',
                value: 'Ouch!'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Map of template names to block arrays.
 */
const blockTemplates = {
    whenFlagMove,
    whenKeyMoveRight,
    foreverNextCostume,
    saySomething,
    playSound,
    foreverIfTouching
};

export {blockTemplates as default};
