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
 * Template: when flag → forever { if (touching edge?) → say "Touching!" }
 * Demonstrates wrapping "if" inside "forever" for continuous checking.
 */
const foreverIfCheck = [
    {
        id: 'unstuck_ifchk_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_ifchk_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_ifchk_2',
        opcode: 'control_forever',
        next: null,
        parent: 'unstuck_ifchk_1',
        inputs: {
            SUBSTACK: {
                name: 'SUBSTACK',
                block: 'unstuck_ifchk_3',
                shadow: null
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_ifchk_3',
        opcode: 'control_if',
        next: null,
        parent: 'unstuck_ifchk_2',
        inputs: {
            CONDITION: {
                name: 'CONDITION',
                block: 'unstuck_ifchk_4',
                shadow: null
            },
            SUBSTACK: {
                name: 'SUBSTACK',
                block: 'unstuck_ifchk_5',
                shadow: null
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_ifchk_4',
        opcode: 'sensing_touchingobject',
        next: null,
        parent: 'unstuck_ifchk_3',
        inputs: {
            TOUCHINGOBJECTMENU: {
                name: 'TOUCHINGOBJECTMENU',
                block: 'unstuck_ifchk_4_menu',
                shadow: 'unstuck_ifchk_4_menu'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_ifchk_4_menu',
        opcode: 'sensing_touchingobjectmenu',
        next: null,
        parent: 'unstuck_ifchk_4',
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
        id: 'unstuck_ifchk_5',
        opcode: 'looks_say',
        next: null,
        parent: 'unstuck_ifchk_3',
        inputs: {
            MESSAGE: {
                name: 'MESSAGE',
                block: 'unstuck_ifchk_5_msg',
                shadow: 'unstuck_ifchk_5_msg'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_ifchk_5_msg',
        opcode: 'text',
        next: null,
        parent: 'unstuck_ifchk_5',
        inputs: {},
        fields: {
            TEXT: {
                name: 'TEXT',
                value: 'Touching!'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag → go to x:0 y:0 → set size to 100
 * Demonstrates resetting sprite position and size at start.
 */
const whenFlagGoToReset = [
    {
        id: 'unstuck_reset_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_reset_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_reset_2',
        opcode: 'motion_gotoxy',
        next: 'unstuck_reset_3',
        parent: 'unstuck_reset_1',
        inputs: {
            X: {
                name: 'X',
                block: 'unstuck_reset_2_x',
                shadow: 'unstuck_reset_2_x'
            },
            Y: {
                name: 'Y',
                block: 'unstuck_reset_2_y',
                shadow: 'unstuck_reset_2_y'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_reset_2_x',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_reset_2',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '0'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_reset_2_y',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_reset_2',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '0'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_reset_3',
        opcode: 'looks_setsizeto',
        next: null,
        parent: 'unstuck_reset_2',
        inputs: {
            SIZE: {
                name: 'SIZE',
                block: 'unstuck_reset_3_size',
                shadow: 'unstuck_reset_3_size'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_reset_3_size',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_reset_3',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '100'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag → forever { change color effect by 25 }
 * Demonstrates rainbow color cycling.
 */
const foreverColorChange = [
    {
        id: 'unstuck_color_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_color_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_color_2',
        opcode: 'control_forever',
        next: null,
        parent: 'unstuck_color_1',
        inputs: {
            SUBSTACK: {
                name: 'SUBSTACK',
                block: 'unstuck_color_3',
                shadow: null
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_color_3',
        opcode: 'looks_changeeffectby',
        next: null,
        parent: 'unstuck_color_2',
        inputs: {
            CHANGE: {
                name: 'CHANGE',
                block: 'unstuck_color_3_val',
                shadow: 'unstuck_color_3_val'
            }
        },
        fields: {
            EFFECT: {
                name: 'EFFECT',
                value: 'COLOR'
            }
        },
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_color_3_val',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_color_3',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '25'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag → forever { turn 15 degrees }
 * Demonstrates spinning.
 */
const foreverSpin = [
    {
        id: 'unstuck_spin_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_spin_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_spin_2',
        opcode: 'control_forever',
        next: null,
        parent: 'unstuck_spin_1',
        inputs: {
            SUBSTACK: {
                name: 'SUBSTACK',
                block: 'unstuck_spin_3',
                shadow: null
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_spin_3',
        opcode: 'motion_turnright',
        next: null,
        parent: 'unstuck_spin_2',
        inputs: {
            DEGREES: {
                name: 'DEGREES',
                block: 'unstuck_spin_3_deg',
                shadow: 'unstuck_spin_3_deg'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_spin_3_deg',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_spin_3',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '15'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag → forever { move 10 steps, if on edge bounce }
 * Demonstrates bouncing screensaver pattern.
 */
const foreverBounce = [
    {
        id: 'unstuck_bounce_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_bounce_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_bounce_2',
        opcode: 'control_forever',
        next: null,
        parent: 'unstuck_bounce_1',
        inputs: {
            SUBSTACK: {
                name: 'SUBSTACK',
                block: 'unstuck_bounce_3',
                shadow: null
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_bounce_3',
        opcode: 'motion_movesteps',
        next: 'unstuck_bounce_4',
        parent: 'unstuck_bounce_2',
        inputs: {
            STEPS: {
                name: 'STEPS',
                block: 'unstuck_bounce_3_steps',
                shadow: 'unstuck_bounce_3_steps'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_bounce_3_steps',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_bounce_3',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '10'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_bounce_4',
        opcode: 'motion_ifonedgebounce',
        next: null,
        parent: 'unstuck_bounce_3',
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: false
    }
];

/**
 * Template: when this sprite clicked → change [score] by 1
 * Demonstrates clicker game pattern.
 */
const whenClickedChangeScore = [
    {
        id: 'unstuck_click_1',
        opcode: 'event_whenthisspriteclicked',
        next: 'unstuck_click_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_click_2',
        opcode: 'data_changevariableby',
        next: null,
        parent: 'unstuck_click_1',
        inputs: {
            VALUE: {
                name: 'VALUE',
                block: 'unstuck_click_2_val',
                shadow: 'unstuck_click_2_val'
            }
        },
        fields: {
            VARIABLE: {
                name: 'VARIABLE',
                value: 'score',
                id: 'unstuck_click_score_var'
            }
        },
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_click_2_val',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_click_2',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '1'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag → forever { move 10 steps }
 */
const foreverMove = [
    {
        id: 'unstuck_fmove_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_fmove_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_fmove_2',
        opcode: 'control_forever',
        next: null,
        parent: 'unstuck_fmove_1',
        inputs: {
            SUBSTACK: {
                name: 'SUBSTACK',
                block: 'unstuck_fmove_3',
                shadow: null
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_fmove_3',
        opcode: 'motion_movesteps',
        next: null,
        parent: 'unstuck_fmove_2',
        inputs: {
            STEPS: {
                name: 'STEPS',
                block: 'unstuck_fmove_3_steps',
                shadow: 'unstuck_fmove_3_steps'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_fmove_3_steps',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_fmove_3',
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
 * Template: when flag → repeat 10 { move 10 steps, turn 36 degrees }
 * Draws a simple shape.
 */
const repeatTurn = [
    {
        id: 'unstuck_rpt_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_rpt_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_rpt_2',
        opcode: 'control_repeat',
        next: null,
        parent: 'unstuck_rpt_1',
        inputs: {
            TIMES: {
                name: 'TIMES',
                block: 'unstuck_rpt_2_times',
                shadow: 'unstuck_rpt_2_times'
            },
            SUBSTACK: {
                name: 'SUBSTACK',
                block: 'unstuck_rpt_3',
                shadow: null
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_rpt_2_times',
        opcode: 'math_whole_number',
        next: null,
        parent: 'unstuck_rpt_2',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '10'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_rpt_3',
        opcode: 'motion_movesteps',
        next: 'unstuck_rpt_4',
        parent: 'unstuck_rpt_2',
        inputs: {
            STEPS: {
                name: 'STEPS',
                block: 'unstuck_rpt_3_steps',
                shadow: 'unstuck_rpt_3_steps'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_rpt_3_steps',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_rpt_3',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '10'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_rpt_4',
        opcode: 'motion_turnright',
        next: null,
        parent: 'unstuck_rpt_3',
        inputs: {
            DEGREES: {
                name: 'DEGREES',
                block: 'unstuck_rpt_4_deg',
                shadow: 'unstuck_rpt_4_deg'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_rpt_4_deg',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_rpt_4',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '36'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag → glide 1 secs to x: 100 y: 100
 */
const glideTo = [
    {
        id: 'unstuck_glide_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_glide_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_glide_2',
        opcode: 'motion_glidesecstoxy',
        next: null,
        parent: 'unstuck_glide_1',
        inputs: {
            SECS: {
                name: 'SECS',
                block: 'unstuck_glide_2_secs',
                shadow: 'unstuck_glide_2_secs'
            },
            X: {
                name: 'X',
                block: 'unstuck_glide_2_x',
                shadow: 'unstuck_glide_2_x'
            },
            Y: {
                name: 'Y',
                block: 'unstuck_glide_2_y',
                shadow: 'unstuck_glide_2_y'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_glide_2_secs',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_glide_2',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '1'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_glide_2_x',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_glide_2',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '100'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_glide_2_y',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_glide_2',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '100'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag → forever { go to (mouse-pointer) }
 */
const followMouse = [
    {
        id: 'unstuck_mouse_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_mouse_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_mouse_2',
        opcode: 'control_forever',
        next: null,
        parent: 'unstuck_mouse_1',
        inputs: {
            SUBSTACK: {
                name: 'SUBSTACK',
                block: 'unstuck_mouse_3',
                shadow: null
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_mouse_3',
        opcode: 'motion_goto',
        next: null,
        parent: 'unstuck_mouse_2',
        inputs: {
            TO: {
                name: 'TO',
                block: 'unstuck_mouse_3_menu',
                shadow: 'unstuck_mouse_3_menu'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_mouse_3_menu',
        opcode: 'motion_goto_menu',
        next: null,
        parent: 'unstuck_mouse_3',
        inputs: {},
        fields: {
            TO: {
                name: 'TO',
                value: '_mouse_'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag → ask "What's your name?" and wait → say (answer)
 */
const askAndSay = [
    {
        id: 'unstuck_ask_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_ask_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_ask_2',
        opcode: 'sensing_askandwait',
        next: 'unstuck_ask_3',
        parent: 'unstuck_ask_1',
        inputs: {
            QUESTION: {
                name: 'QUESTION',
                block: 'unstuck_ask_2_q',
                shadow: 'unstuck_ask_2_q'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_ask_2_q',
        opcode: 'text',
        next: null,
        parent: 'unstuck_ask_2',
        inputs: {},
        fields: {
            TEXT: {
                name: 'TEXT',
                value: "What's your name?"
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_ask_3',
        opcode: 'looks_say',
        next: null,
        parent: 'unstuck_ask_2',
        inputs: {
            MESSAGE: {
                name: 'MESSAGE',
                block: 'unstuck_ask_3_answer',
                shadow: 'unstuck_ask_3_msg'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_ask_3_answer',
        opcode: 'sensing_answer',
        next: null,
        parent: 'unstuck_ask_3',
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_ask_3_msg',
        opcode: 'text',
        next: null,
        parent: 'unstuck_ask_3',
        inputs: {},
        fields: {
            TEXT: {
                name: 'TEXT',
                value: ''
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag → repeat until (touching edge?) { move 10 steps }
 */
const repeatUntilEdge = [
    {
        id: 'unstuck_ru_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_ru_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_ru_2',
        opcode: 'control_repeat_until',
        next: null,
        parent: 'unstuck_ru_1',
        inputs: {
            CONDITION: {
                name: 'CONDITION',
                block: 'unstuck_ru_3',
                shadow: null
            },
            SUBSTACK: {
                name: 'SUBSTACK',
                block: 'unstuck_ru_4',
                shadow: null
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_ru_3',
        opcode: 'sensing_touchingobject',
        next: null,
        parent: 'unstuck_ru_2',
        inputs: {
            TOUCHINGOBJECTMENU: {
                name: 'TOUCHINGOBJECTMENU',
                block: 'unstuck_ru_3_menu',
                shadow: 'unstuck_ru_3_menu'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_ru_3_menu',
        opcode: 'sensing_touchingobjectmenu',
        next: null,
        parent: 'unstuck_ru_3',
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
        id: 'unstuck_ru_4',
        opcode: 'motion_movesteps',
        next: null,
        parent: 'unstuck_ru_2',
        inputs: {
            STEPS: {
                name: 'STEPS',
                block: 'unstuck_ru_4_steps',
                shadow: 'unstuck_ru_4_steps'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_ru_4_steps',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_ru_4',
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
 * Template: when flag → forever { change y by -2 }
 * Simulates gravity for a platformer.
 */
const gravityFall = [
    {
        id: 'unstuck_grav_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_grav_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_grav_2',
        opcode: 'control_forever',
        next: null,
        parent: 'unstuck_grav_1',
        inputs: {
            SUBSTACK: {
                name: 'SUBSTACK',
                block: 'unstuck_grav_3',
                shadow: null
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_grav_3',
        opcode: 'motion_changeyby',
        next: null,
        parent: 'unstuck_grav_2',
        inputs: {
            DY: {
                name: 'DY',
                block: 'unstuck_grav_3_dy',
                shadow: 'unstuck_grav_3_dy'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_grav_3_dy',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_grav_3',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '-2'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag → broadcast "go!"
 */
const broadcastGo = [
    {
        id: 'unstuck_bc_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_bc_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_bc_2',
        opcode: 'event_broadcast',
        next: null,
        parent: 'unstuck_bc_1',
        inputs: {
            BROADCAST_INPUT: {
                name: 'BROADCAST_INPUT',
                block: 'unstuck_bc_2_menu',
                shadow: 'unstuck_bc_2_menu'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_bc_2_menu',
        opcode: 'event_broadcast_menu',
        next: null,
        parent: 'unstuck_bc_2',
        inputs: {},
        fields: {
            BROADCAST_OPTION: {
                name: 'BROADCAST_OPTION',
                value: 'go!'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag → forever { create clone of myself, wait 1 }
 */
const cloneForever = [
    {
        id: 'unstuck_clonef_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_clonef_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_clonef_2',
        opcode: 'control_forever',
        next: null,
        parent: 'unstuck_clonef_1',
        inputs: {
            SUBSTACK: {
                name: 'SUBSTACK',
                block: 'unstuck_clonef_3',
                shadow: null
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_clonef_3',
        opcode: 'control_create_clone_of',
        next: 'unstuck_clonef_4',
        parent: 'unstuck_clonef_2',
        inputs: {
            CLONE_OPTION: {
                name: 'CLONE_OPTION',
                block: 'unstuck_clonef_3_menu',
                shadow: 'unstuck_clonef_3_menu'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_clonef_3_menu',
        opcode: 'control_create_clone_of_menu',
        next: null,
        parent: 'unstuck_clonef_3',
        inputs: {},
        fields: {
            CLONE_OPTION: {
                name: 'CLONE_OPTION',
                value: '_myself_'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_clonef_4',
        opcode: 'control_wait',
        next: null,
        parent: 'unstuck_clonef_3',
        inputs: {
            DURATION: {
                name: 'DURATION',
                block: 'unstuck_clonef_4_dur',
                shadow: 'unstuck_clonef_4_dur'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_clonef_4_dur',
        opcode: 'math_positive_number',
        next: null,
        parent: 'unstuck_clonef_4',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '1'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag → go to x: 0 y: 0
 */
const goToCenter = [
    {
        id: 'unstuck_gotoc_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_gotoc_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_gotoc_2',
        opcode: 'motion_gotoxy',
        next: null,
        parent: 'unstuck_gotoc_1',
        inputs: {
            X: {
                name: 'X',
                block: 'unstuck_gotoc_2_x',
                shadow: 'unstuck_gotoc_2_x'
            },
            Y: {
                name: 'Y',
                block: 'unstuck_gotoc_2_y',
                shadow: 'unstuck_gotoc_2_y'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_gotoc_2_x',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_gotoc_2',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '0'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_gotoc_2_y',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_gotoc_2',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '0'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag → move (pick random 1 to 10) steps
 * Demonstrates inserting a reporter into an input.
 */
const moveRandomSteps = [
    {
        id: 'unstuck_mrand_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_mrand_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_mrand_2',
        opcode: 'motion_movesteps',
        next: null,
        parent: 'unstuck_mrand_1',
        inputs: {
            STEPS: {
                name: 'STEPS',
                block: 'unstuck_mrand_3',
                shadow: 'unstuck_mrand_2_steps'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_mrand_3',
        opcode: 'operator_random',
        next: null,
        parent: 'unstuck_mrand_2',
        inputs: {
            FROM: {
                name: 'FROM',
                block: 'unstuck_mrand_3_from',
                shadow: 'unstuck_mrand_3_from'
            },
            TO: {
                name: 'TO',
                block: 'unstuck_mrand_3_to',
                shadow: 'unstuck_mrand_3_to'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_mrand_2_steps',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_mrand_2',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '10'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_mrand_3_from',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_mrand_3',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '1'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_mrand_3_to',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_mrand_3',
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
 * Template: when flag clicked → change size by 10
 */
const changeSizeBy = [
    {
        id: 'unstuck_csb_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_csb_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_csb_2',
        opcode: 'looks_changesizeby',
        next: null,
        parent: 'unstuck_csb_1',
        inputs: {
            CHANGE: {
                name: 'CHANGE',
                block: 'unstuck_csb_2_val',
                shadow: 'unstuck_csb_2_val'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_csb_2_val',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_csb_2',
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
 * Template: when flag clicked → set ghost effect to 0
 */
const setGhostZero = [
    {
        id: 'unstuck_sge_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_sge_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_sge_2',
        opcode: 'looks_seteffectto',
        next: null,
        parent: 'unstuck_sge_1',
        inputs: {
            VALUE: {
                name: 'VALUE',
                block: 'unstuck_sge_2_val',
                shadow: 'unstuck_sge_2_val'
            }
        },
        fields: {
            EFFECT: {
                name: 'EFFECT',
                value: 'GHOST'
            }
        },
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_sge_2_val',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_sge_2',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '0'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag clicked → set size to 100%
 */
const setSizeTo100 = [
    {
        id: 'unstuck_ss_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_ss_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_ss_2',
        opcode: 'looks_setsizeto',
        next: null,
        parent: 'unstuck_ss_1',
        inputs: {
            SIZE: {
                name: 'SIZE',
                block: 'unstuck_ss_2_val',
                shadow: 'unstuck_ss_2_val'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_ss_2_val',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_ss_2',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '100'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag clicked → forever { change size by 5, wait, change size by -5, wait }
 */
const foreverChangeSizePulse = [
    {
        id: 'unstuck_pulse_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_pulse_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_pulse_2',
        opcode: 'control_forever',
        next: null,
        parent: 'unstuck_pulse_1',
        inputs: {
            SUBSTACK: {
                name: 'SUBSTACK',
                block: 'unstuck_pulse_3',
                shadow: null
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_pulse_3',
        opcode: 'looks_changesizeby',
        next: 'unstuck_pulse_4',
        parent: 'unstuck_pulse_2',
        inputs: {
            CHANGE: {
                name: 'CHANGE',
                block: 'unstuck_pulse_3_val',
                shadow: 'unstuck_pulse_3_val'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_pulse_3_val',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_pulse_3',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '5'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_pulse_4',
        opcode: 'control_wait',
        next: 'unstuck_pulse_5',
        parent: 'unstuck_pulse_3',
        inputs: {
            DURATION: {
                name: 'DURATION',
                block: 'unstuck_pulse_4_dur',
                shadow: 'unstuck_pulse_4_dur'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_pulse_4_dur',
        opcode: 'math_positive_number',
        next: null,
        parent: 'unstuck_pulse_4',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '0.5'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_pulse_5',
        opcode: 'looks_changesizeby',
        next: 'unstuck_pulse_6',
        parent: 'unstuck_pulse_4',
        inputs: {
            CHANGE: {
                name: 'CHANGE',
                block: 'unstuck_pulse_5_val',
                shadow: 'unstuck_pulse_5_val'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_pulse_5_val',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_pulse_5',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '-5'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_pulse_6',
        opcode: 'control_wait',
        next: null,
        parent: 'unstuck_pulse_5',
        inputs: {
            DURATION: {
                name: 'DURATION',
                block: 'unstuck_pulse_6_dur',
                shadow: 'unstuck_pulse_6_dur'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_pulse_6_dur',
        opcode: 'math_positive_number',
        next: null,
        parent: 'unstuck_pulse_6',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '0.5'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when flag clicked → set color effect to 50
 */
const setColorEffect = [
    {
        id: 'unstuck_sce_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_sce_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_sce_2',
        opcode: 'looks_seteffectto',
        next: null,
        parent: 'unstuck_sce_1',
        inputs: {
            VALUE: {
                name: 'VALUE',
                block: 'unstuck_sce_2_val',
                shadow: 'unstuck_sce_2_val'
            }
        },
        fields: {
            EFFECT: {
                name: 'EFFECT',
                value: 'COLOR'
            }
        },
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_sce_2_val',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_sce_2',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '50'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when I start as a clone → move 50 steps
 */
const whenCloneStart = [
    {
        id: 'unstuck_wcs_1',
        opcode: 'control_start_as_clone',
        next: 'unstuck_wcs_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_wcs_2',
        opcode: 'motion_movesteps',
        next: null,
        parent: 'unstuck_wcs_1',
        inputs: {
            STEPS: {
                name: 'STEPS',
                block: 'unstuck_wcs_2_val',
                shadow: 'unstuck_wcs_2_val'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_wcs_2_val',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_wcs_2',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '50'
            }
        },
        shadow: true,
        topLevel: false
    }
];

/**
 * Template: when I start as a clone → move 50 steps → delete this clone
 */
const deleteClone = [
    {
        id: 'unstuck_dc_1',
        opcode: 'control_start_as_clone',
        next: 'unstuck_dc_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_dc_2',
        opcode: 'motion_movesteps',
        next: 'unstuck_dc_3',
        parent: 'unstuck_dc_1',
        inputs: {
            STEPS: {
                name: 'STEPS',
                block: 'unstuck_dc_2_val',
                shadow: 'unstuck_dc_2_val'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_dc_2_val',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_dc_2',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '50'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_dc_3',
        opcode: 'control_delete_this_clone',
        next: null,
        parent: 'unstuck_dc_2',
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: false
    }
];

/**
 * Template: when flag clicked → say "Hello!" for 2 secs → wait 1 → say "Goodbye!" for 2 secs
 */
const waitBlock = [
    {
        id: 'unstuck_wb_1',
        opcode: 'event_whenflagclicked',
        next: 'unstuck_wb_2',
        parent: null,
        inputs: {},
        fields: {},
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    },
    {
        id: 'unstuck_wb_2',
        opcode: 'looks_sayforsecs',
        next: 'unstuck_wb_3',
        parent: 'unstuck_wb_1',
        inputs: {
            MESSAGE: {
                name: 'MESSAGE',
                block: 'unstuck_wb_2_msg',
                shadow: 'unstuck_wb_2_msg'
            },
            SECS: {
                name: 'SECS',
                block: 'unstuck_wb_2_secs',
                shadow: 'unstuck_wb_2_secs'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_wb_2_msg',
        opcode: 'text',
        next: null,
        parent: 'unstuck_wb_2',
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
        id: 'unstuck_wb_2_secs',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_wb_2',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '2'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_wb_3',
        opcode: 'control_wait',
        next: 'unstuck_wb_4',
        parent: 'unstuck_wb_2',
        inputs: {
            DURATION: {
                name: 'DURATION',
                block: 'unstuck_wb_3_dur',
                shadow: 'unstuck_wb_3_dur'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_wb_3_dur',
        opcode: 'math_positive_number',
        next: null,
        parent: 'unstuck_wb_3',
        inputs: {},
        fields: {
            NUM: {
                name: 'NUM',
                value: '1'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_wb_4',
        opcode: 'looks_sayforsecs',
        next: null,
        parent: 'unstuck_wb_3',
        inputs: {
            MESSAGE: {
                name: 'MESSAGE',
                block: 'unstuck_wb_4_msg',
                shadow: 'unstuck_wb_4_msg'
            },
            SECS: {
                name: 'SECS',
                block: 'unstuck_wb_4_secs',
                shadow: 'unstuck_wb_4_secs'
            }
        },
        fields: {},
        shadow: false,
        topLevel: false
    },
    {
        id: 'unstuck_wb_4_msg',
        opcode: 'text',
        next: null,
        parent: 'unstuck_wb_4',
        inputs: {},
        fields: {
            TEXT: {
                name: 'TEXT',
                value: 'Goodbye!'
            }
        },
        shadow: true,
        topLevel: false
    },
    {
        id: 'unstuck_wb_4_secs',
        opcode: 'math_number',
        next: null,
        parent: 'unstuck_wb_4',
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
 * Map of template names to block arrays.
 */
const blockTemplates = {
    whenFlagMove,
    whenKeyMoveRight,
    foreverNextCostume,
    saySomething,
    playSound,
    foreverIfTouching,
    foreverIfCheck,
    whenFlagGoToReset,
    foreverColorChange,
    foreverSpin,
    foreverBounce,
    whenClickedChangeScore,
    foreverMove,
    repeatTurn,
    glideTo,
    followMouse,
    askAndSay,
    repeatUntilEdge,
    gravityFall,
    broadcastGo,
    cloneForever,
    goToCenter,
    moveRandomSteps,
    changeSizeBy,
    setGhostZero,
    setSizeTo100,
    foreverChangeSizePulse,
    setColorEffect,
    whenCloneStart,
    deleteClone,
    waitBlock
};

export {blockTemplates as default};
