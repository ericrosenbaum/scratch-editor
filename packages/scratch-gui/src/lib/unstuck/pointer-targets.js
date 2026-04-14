/**
 * Registry of known pointer targets for the tip editor.
 * Organized into UI elements and block opcodes by category.
 */

const uiTargets = [
    {label: 'Green Flag button', selector: 'button[class*="green-flag"]'},
    {label: 'Stop button', selector: 'button[class*="stop-all"]'},
    {label: 'Extension button', selector: 'button[class*="extension-button"]'},
    {label: 'Sprite list', selector: '[class*="sprite-selector_sprite-selector"]'},
    {label: 'Add Sprite button', selector: '[class*="sprite-selector_sprite-selector"] [class*="add-button"]'},
    {label: 'Add Backdrop button', selector: '[class*="stage-selector"] [class*="add-button"]'},
    {label: 'Sprite info panel', selector: '[class*="sprite-info"]'},
    {label: 'Costumes tab', selector: '[class*="tab-list"] [class*="tab"]:nth-child(2)'},
    {label: 'Sounds tab', selector: '[class*="tab-list"] [class*="tab"]:nth-child(3)'},
    {label: 'Choose a Sound button', selector: '[class*="new-buttons"] [class*="main-button"]'},
    {label: 'Choose a Costume button', selector: '[class*="new-buttons"] [class*="main-button"]'},
    {label: 'Choose a Backdrop button', selector: '[class*="new-buttons"] [class*="main-button"]'},
    {label: 'Motion toolbox category', selector: '.blocklyToolboxCategory#motion'},
    {label: 'Looks toolbox category', selector: '.blocklyToolboxCategory#looks'},
    {label: 'Sound toolbox category', selector: '.blocklyToolboxCategory#sound'},
    {label: 'Events toolbox category', selector: '.blocklyToolboxCategory#events'},
    {label: 'Control toolbox category', selector: '.blocklyToolboxCategory#control'},
    {label: 'Sensing toolbox category', selector: '.blocklyToolboxCategory#sensing'},
    {label: 'Operators toolbox category', selector: '.blocklyToolboxCategory#operators'},
    {label: 'Variables toolbox category', selector: '.blocklyToolboxCategory#variables'},
    {label: 'My Blocks toolbox category', selector: '.blocklyToolboxCategory#myBlocks'}
];

const blockOpcodesByCategory = {
    events: [
        {opcode: 'event_whenflagclicked', label: 'when green flag clicked'},
        {opcode: 'event_whenkeypressed', label: 'when key pressed'},
        {opcode: 'event_whenthisspriteclicked', label: 'when this sprite clicked'},
        {opcode: 'event_whenbackdropswitchesto', label: 'when backdrop switches to'},
        {opcode: 'event_broadcast', label: 'broadcast'}
    ],
    motion: [
        {opcode: 'motion_movesteps', label: 'move steps'},
        {opcode: 'motion_changexby', label: 'change x by'},
        {opcode: 'motion_changeyby', label: 'change y by'},
        {opcode: 'motion_gotoxy', label: 'go to x y'},
        {opcode: 'motion_glidesecstoxy', label: 'glide to x y'},
        {opcode: 'motion_turnright', label: 'turn right'},
        {opcode: 'motion_pointindirection', label: 'point in direction'},
        {opcode: 'motion_goto', label: 'go to'},
        {opcode: 'motion_ifonedgebounce', label: 'if on edge bounce'},
        {opcode: 'motion_xposition', label: 'x position'}
    ],
    looks: [
        {opcode: 'looks_sayforsecs', label: 'say for secs'},
        {opcode: 'looks_say', label: 'say'},
        {opcode: 'looks_nextcostume', label: 'next costume'},
        {opcode: 'looks_seteffectto', label: 'set effect to'},
        {opcode: 'looks_setsizeto', label: 'set size to'},
        {opcode: 'looks_changeeffectby', label: 'change effect by'},
        {opcode: 'looks_changesizeby', label: 'change size by'}
    ],
    sound: [
        {opcode: 'sound_playuntildone', label: 'play sound until done'}
    ],
    control: [
        {opcode: 'control_forever', label: 'forever'},
        {opcode: 'control_repeat', label: 'repeat'},
        {opcode: 'control_repeat_until', label: 'repeat until'},
        {opcode: 'control_wait', label: 'wait'},
        {opcode: 'control_if', label: 'if'},
        {opcode: 'control_stop', label: 'stop'},
        {opcode: 'control_create_clone_of', label: 'create clone of'},
        {opcode: 'control_start_as_clone', label: 'when I start as a clone'},
        {opcode: 'control_delete_this_clone', label: 'delete this clone'}
    ],
    sensing: [
        {opcode: 'sensing_touchingobject', label: 'touching?'},
        {opcode: 'sensing_touchingcolor', label: 'touching color?'},
        {opcode: 'sensing_keypressed', label: 'key pressed?'},
        {opcode: 'sensing_askandwait', label: 'ask and wait'},
        {opcode: 'sensing_timer', label: 'timer'}
    ],
    operators: [
        {opcode: 'operator_random', label: 'pick random'}
    ]
};

const preActions = [
    {value: 'switchToCodeTab', label: 'Switch to Code tab'},
    {value: 'switchToCostumesTab', label: 'Switch to Costumes tab'},
    {value: 'switchToSoundsTab', label: 'Switch to Sounds tab'}
];

const sideOptions = ['top', 'bottom', 'left', 'right'];

const categoryNames = {
    events: 'Events',
    motion: 'Motion',
    looks: 'Looks',
    sound: 'Sound',
    control: 'Control',
    sensing: 'Sensing',
    operators: 'Operators'
};

export {
    uiTargets,
    blockOpcodesByCategory,
    preActions,
    sideOptions,
    categoryNames
};
