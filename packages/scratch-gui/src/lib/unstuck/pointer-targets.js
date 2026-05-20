/**
 * Registry of known pointer targets for the tip editor.
 * Organized into UI elements and block opcodes by category.
 */

const uiTargets = [
    {label: 'Green Flag button', selector: 'button[class*="green-flag"]', side: 'bottom'},
    {label: 'Stop button', selector: 'button[class*="stop-all"]', side: 'bottom'},
    {
        label: 'Extension button',
        selector: 'button[class*="extension-button"]',
        preAction: 'switchToCodeTab',
        side: 'top'
    },
    {label: 'Sprite list', selector: '[class*="sprite-selector_sprite-selector"]', side: 'left'},
    {
        label: 'Add Sprite button',
        selector: '[class*="sprite-selector_sprite-selector"] [class*="add-button"]',
        side: 'top'
    },
    {label: 'Add Backdrop button', selector: '[class*="stage-selector"] [class*="add-button"]', side: 'top'},
    {label: 'Sprite info panel', selector: '[class*="sprite-info_sprite-info"]', side: 'left'},
    {
        label: 'Rotation style buttons',
        selector: '[class*="direction-picker_button-row"]',
        preAction: 'openDirectionPicker',
        side: 'left'
    },
    {label: 'Costumes tab', selector: '[class*="tab-list"] [class*="tab"]:nth-child(2)', side: 'bottom'},
    {label: 'Sounds tab', selector: '[class*="tab-list"] [class*="tab"]:nth-child(3)', side: 'bottom'},
    {
        label: 'Choose a Sound button',
        selector: '[class*="new-buttons"]:not(#__sound) [class*="main-button"]',
        preAction: 'switchToSoundsTab',
        side: 'right'
    },
    {
        label: 'Choose a Costume button',
        selector: '[class*="new-buttons"]:not(#__costume) [class*="main-button"]',
        preAction: 'switchToCostumesTab',
        side: 'right'
    },
    {
        label: 'Choose a Backdrop button',
        selector: '[class*="new-buttons"]:not(#__backdrop) [class*="main-button"]',
        side: 'right'
    },
    {
        label: 'Motion toolbox category',
        selector: '.blocklyToolboxCategory#motion',
        preAction: 'switchToCodeTab',
        side: 'right'
    },
    {
        label: 'Looks toolbox category',
        selector: '.blocklyToolboxCategory#looks',
        preAction: 'switchToCodeTab',
        side: 'right'
    },
    {
        label: 'Sound toolbox category',
        selector: '.blocklyToolboxCategory#sound',
        preAction: 'switchToCodeTab',
        side: 'right'
    },
    {
        label: 'Events toolbox category',
        selector: '.blocklyToolboxCategory#events',
        preAction: 'switchToCodeTab',
        side: 'right'
    },
    {
        label: 'Control toolbox category',
        selector: '.blocklyToolboxCategory#control',
        preAction: 'switchToCodeTab',
        side: 'right'
    },
    {
        label: 'Sensing toolbox category',
        selector: '.blocklyToolboxCategory#sensing',
        preAction: 'switchToCodeTab',
        side: 'right'
    },
    {
        label: 'Operators toolbox category',
        selector: '.blocklyToolboxCategory#operators',
        preAction: 'switchToCodeTab',
        side: 'right'
    },
    {
        label: 'Variables toolbox category',
        selector: '.blocklyToolboxCategory#variables',
        preAction: 'switchToCodeTab',
        side: 'right'
    },
    {
        label: 'My Blocks toolbox category',
        selector: '.blocklyToolboxCategory#myBlocks',
        preAction: 'switchToCodeTab',
        side: 'right'
    }
];

const getPreActionForTarget = selector => {
    const entry = uiTargets.find(t => t.selector === selector);
    return entry && entry.preAction ? entry.preAction : null;
};

const getSideForTarget = selector => {
    const entry = uiTargets.find(t => t.selector === selector);
    return entry && entry.side ? entry.side : 'bottom';
};

const blockOpcodesByCategory = {
    events: [
        {opcode: 'event_whenflagclicked', label: 'when green flag clicked'},
        {opcode: 'event_whenkeypressed', label: 'when key pressed'},
        {opcode: 'event_whenthisspriteclicked', label: 'when this sprite clicked'},
        {opcode: 'event_whenbackdropswitchesto', label: 'when backdrop switches to'},
        {opcode: 'event_broadcast', label: 'broadcast'},
        {opcode: 'event_broadcastandwait', label: 'broadcast and wait'},
        {opcode: 'event_whenbroadcastreceived', label: 'when I receive'}
    ],
    motion: [
        {opcode: 'motion_movesteps', label: 'move steps'},
        {opcode: 'motion_turnright', label: 'turn right'},
        {opcode: 'motion_turnleft', label: 'turn left'},
        {opcode: 'motion_pointindirection', label: 'point in direction'},
        {opcode: 'motion_pointtowards', label: 'point towards'},
        {opcode: 'motion_goto', label: 'go to'},
        {opcode: 'motion_gotoxy', label: 'go to x y'},
        {opcode: 'motion_glidesecstoxy', label: 'glide to x y'},
        {opcode: 'motion_glideto', label: 'glide to'},
        {opcode: 'motion_changexby', label: 'change x by'},
        {opcode: 'motion_setx', label: 'set x to'},
        {opcode: 'motion_changeyby', label: 'change y by'},
        {opcode: 'motion_sety', label: 'set y to'},
        {opcode: 'motion_ifonedgebounce', label: 'if on edge bounce'},
        {opcode: 'motion_setrotationstyle', label: 'set rotation style'},
        {opcode: 'motion_xposition', label: 'x position'},
        {opcode: 'motion_yposition', label: 'y position'},
        {opcode: 'motion_direction', label: 'direction'}
    ],
    looks: [
        {opcode: 'looks_sayforsecs', label: 'say for secs'},
        {opcode: 'looks_say', label: 'say'},
        {opcode: 'looks_thinkforsecs', label: 'think for secs'},
        {opcode: 'looks_think', label: 'think'},
        {opcode: 'looks_switchcostumeto', label: 'switch costume to'},
        {opcode: 'looks_nextcostume', label: 'next costume'},
        {opcode: 'looks_switchbackdropto', label: 'switch backdrop to'},
        {opcode: 'looks_nextbackdrop', label: 'next backdrop'},
        {opcode: 'looks_changesizeby', label: 'change size by'},
        {opcode: 'looks_setsizeto', label: 'set size to'},
        {opcode: 'looks_changeeffectby', label: 'change effect by'},
        {opcode: 'looks_seteffectto', label: 'set effect to'},
        {opcode: 'looks_cleargraphiceffects', label: 'clear graphic effects'},
        {opcode: 'looks_show', label: 'show'},
        {opcode: 'looks_hide', label: 'hide'},
        {opcode: 'looks_gotofrontback', label: 'go to front/back'},
        {opcode: 'looks_goforwardbackwardlayers', label: 'go forward/backward layers'},
        {opcode: 'looks_costumenumbername', label: 'costume number/name'},
        {opcode: 'looks_backdropnumbername', label: 'backdrop number/name'},
        {opcode: 'looks_size', label: 'size'}
    ],
    sound: [
        {opcode: 'sound_play', label: 'start sound'},
        {opcode: 'sound_playuntildone', label: 'play sound until done'},
        {opcode: 'sound_stopallsounds', label: 'stop all sounds'},
        {opcode: 'sound_changeeffectby', label: 'change sound effect by'},
        {opcode: 'sound_seteffectto', label: 'set sound effect to'},
        {opcode: 'sound_cleareffects', label: 'clear sound effects'},
        {opcode: 'sound_changevolumeby', label: 'change volume by'},
        {opcode: 'sound_setvolumeto', label: 'set volume to'},
        {opcode: 'sound_volume', label: 'volume'}
    ],
    control: [
        {opcode: 'control_wait', label: 'wait'},
        {opcode: 'control_repeat', label: 'repeat'},
        {opcode: 'control_forever', label: 'forever'},
        {opcode: 'control_if', label: 'if'},
        {opcode: 'control_if_else', label: 'if else'},
        {opcode: 'control_wait_until', label: 'wait until'},
        {opcode: 'control_repeat_until', label: 'repeat until'},
        {opcode: 'control_stop', label: 'stop'},
        {opcode: 'control_start_as_clone', label: 'when I start as a clone'},
        {opcode: 'control_create_clone_of', label: 'create clone of'},
        {opcode: 'control_delete_this_clone', label: 'delete this clone'}
    ],
    sensing: [
        {opcode: 'sensing_touchingobject', label: 'touching?'},
        {opcode: 'sensing_touchingcolor', label: 'touching color?'},
        {opcode: 'sensing_coloristouchingcolor', label: 'color is touching color?'},
        {opcode: 'sensing_distanceto', label: 'distance to'},
        {opcode: 'sensing_askandwait', label: 'ask and wait'},
        {opcode: 'sensing_answer', label: 'answer'},
        {opcode: 'sensing_keypressed', label: 'key pressed?'},
        {opcode: 'sensing_mousedown', label: 'mouse down?'},
        {opcode: 'sensing_mousex', label: 'mouse x'},
        {opcode: 'sensing_mousey', label: 'mouse y'},
        {opcode: 'sensing_loudness', label: 'loudness'},
        {opcode: 'sensing_timer', label: 'timer'},
        {opcode: 'sensing_resettimer', label: 'reset timer'},
        {opcode: 'sensing_of', label: 'of'},
        {opcode: 'sensing_current', label: 'current'},
        {opcode: 'sensing_dayssince2000', label: 'days since 2000'},
        {opcode: 'sensing_username', label: 'username'}
    ],
    operators: [
        {opcode: 'operator_add', label: '+'},
        {opcode: 'operator_subtract', label: '-'},
        {opcode: 'operator_multiply', label: '*'},
        {opcode: 'operator_divide', label: '/'},
        {opcode: 'operator_random', label: 'pick random'},
        {opcode: 'operator_lt', label: '<'},
        {opcode: 'operator_equals', label: '='},
        {opcode: 'operator_gt', label: '>'},
        {opcode: 'operator_and', label: 'and'},
        {opcode: 'operator_or', label: 'or'},
        {opcode: 'operator_not', label: 'not'},
        {opcode: 'operator_join', label: 'join'},
        {opcode: 'operator_letter_of', label: 'letter of'},
        {opcode: 'operator_length', label: 'length of'},
        {opcode: 'operator_contains', label: 'contains?'},
        {opcode: 'operator_mod', label: 'mod'},
        {opcode: 'operator_round', label: 'round'},
        {opcode: 'operator_mathop', label: 'math op'}
    ],
    variables: [
        {opcode: 'data_setvariableto', label: 'set variable to'},
        {opcode: 'data_changevariableby', label: 'change variable by'},
        {opcode: 'data_showvariable', label: 'show variable'},
        {opcode: 'data_hidevariable', label: 'hide variable'}
    ],
    lists: [
        {opcode: 'data_addtolist', label: 'add to list'},
        {opcode: 'data_deleteoflist', label: 'delete of list'},
        {opcode: 'data_deletealloflist', label: 'delete all of list'},
        {opcode: 'data_insertatlist', label: 'insert at list'},
        {opcode: 'data_replaceitemoflist', label: 'replace item of list'},
        {opcode: 'data_itemoflist', label: 'item of list'},
        {opcode: 'data_itemnumoflist', label: 'item # of list'},
        {opcode: 'data_lengthoflist', label: 'length of list'},
        {opcode: 'data_listcontainsitem', label: 'list contains item?'},
        {opcode: 'data_showlist', label: 'show list'},
        {opcode: 'data_hidelist', label: 'hide list'}
    ]
};

const categoryNames = {
    events: 'Events',
    motion: 'Motion',
    looks: 'Looks',
    sound: 'Sound',
    control: 'Control',
    sensing: 'Sensing',
    operators: 'Operators',
    variables: 'Variables',
    lists: 'Lists'
};

export {
    uiTargets,
    blockOpcodesByCategory,
    getPreActionForTarget,
    getSideForTarget,
    categoryNames
};
