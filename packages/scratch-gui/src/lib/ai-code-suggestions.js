import {isLoaded, getLlmInference, generate, showLoadModal} from './ai-model-manager';
import {setGenerating, setResult, setError} from '../reducers/ai-code-suggestions';

// Blocks that are reporters or booleans — they produce values and cannot have "next".
const REPORTER_OPCODES = new Set([
    'math_number', 'text', 'colour_picker', 'math_angle', 'math_integer', 'math_whole_number',
    'math_positive_number', 'note',
    'operator_add', 'operator_subtract', 'operator_multiply', 'operator_divide',
    'operator_random', 'operator_mod', 'operator_round', 'operator_mathop',
    'operator_join', 'operator_letter_of', 'operator_length', 'operator_contains',
    'operator_gt', 'operator_lt', 'operator_equals',
    'operator_and', 'operator_or', 'operator_not',
    'sensing_touchingobject', 'sensing_touchingcolor', 'sensing_coloristouchingcolor',
    'sensing_distanceto', 'sensing_keypressed', 'sensing_mousedown',
    'sensing_mousex', 'sensing_mousey', 'sensing_loudness', 'sensing_timer',
    'sensing_of', 'sensing_current', 'sensing_dayssince2000', 'sensing_username',
    'sensing_answer',
    'data_variable', 'data_listcontents',
    'data_itemoflist', 'data_itemnumoflist', 'data_lengthoflist', 'data_listcontainsitem',
    'looks_costumenumbername', 'looks_backdropnumbername', 'looks_size',
    'sound_volume',
    'motion_xposition', 'motion_yposition', 'motion_direction'
]);

// Menu shadow blocks — also reporters, cannot have "next".
const MENU_OPCODE_RE = /menu$/i;

// "Cap" blocks that end a script — cannot have "next".
const CAP_OPCODES = new Set([
    'control_forever', 'control_delete_this_clone', 'control_stop'
]);

/**
 * Resolve which generate function to use, loading the model if needed.
 * Reuses pattern from explain-code.js.
 */
const resolveGenerateFn = async vm => {
    const aiExt = vm.runtime._AIBlocksExtension;

    if (aiExt && aiExt.modelLoaded) {
        return prompt => aiExt.generateWithSpinner(prompt);
    }
    if (isLoaded()) {
        return prompt => generate(prompt);
    }
    try {
        await showLoadModal();
    } catch (e) {
        return null; // user cancelled
    }
    if (aiExt && !aiExt.modelLoaded) {
        aiExt.llmInference = getLlmInference();
        aiExt.modelLoaded = true;
        aiExt.isLoading = false;
    }
    return prompt => generate(prompt);
};

/**
 * Get the current sprite/stage code as scratchblocks text via sb-edit.
 */
const getProjectCode = (vm, targetName) => {
    try {
        const json = JSON.parse(vm.toJSON());
        const {Project} = require('sb-edit');
        const p = Project.fromSb3JSON(json, {getAsset: () => null});
        return p.then(project => {
            const allBlocks = project.toScratchblocks();
            return allBlocks[targetName] || '(no scripts)';
        });
    } catch (err) {
        return Promise.resolve('(could not read project code)');
    }
};

/**
 * Simple unique ID generator for blocks.
 */
let _idCounter = 0;
const uid = () => `ai_${Date.now().toString(36)}_${(++_idCounter).toString(36)}`;

/**
 * Build the LLM prompt with few-shot examples.
 */
const buildPrompt = (userPrompt, blocksText, targetName, isStage) => {
    const entity = isStage ? 'the Stage' : `sprite "${targetName}"`;

    return `You are a Scratch coding assistant. Generate Scratch blocks as a JSON array.

IMPORTANT RULES:
1. Keep scripts SHORT and simple (under 15 blocks). Use the SIMPLEST approach possible.
2. Do EXACTLY what is requested — nothing more, nothing less.
3. Your response must start with \`\`\`json and contain ONLY the JSON array. No explanations.

Each block object has these fields:
- "id": unique string
- "opcode": the Scratch block opcode (e.g. "event_whenflagclicked", "motion_movesteps")
- "next": id of next block or null
- "parent": id of parent block or null
- "inputs": object of inputs, each input is {"name": "NAME", "block": blockId, "shadow": blockId}
- "fields": object of fields, each field is {"name": "NAME", "value": "value"}
- "topLevel": true for the first block in a stack, false otherwise
- "shadow": true for shadow/value blocks, false for regular blocks
- "x": 0, "y": 0

EXAMPLE 1 - "move forward when green flag clicked":
[
  {"id":"a1","opcode":"event_whenflagclicked","next":"a2","parent":null,"inputs":{},"fields":{},"topLevel":true,"shadow":false,"x":0,"y":0},
  {"id":"a2","opcode":"motion_movesteps","next":null,"parent":"a1","inputs":{"STEPS":{"name":"STEPS","block":"a3","shadow":"a3"}},"fields":{},"topLevel":false,"shadow":false},
  {"id":"a3","opcode":"math_number","next":null,"parent":"a2","inputs":{},"fields":{"NUM":{"name":"NUM","value":"10"}},"topLevel":false,"shadow":true}
]

EXAMPLE 2 - "forever move and bounce":
[
  {"id":"b1","opcode":"event_whenflagclicked","next":"b2","parent":null,"inputs":{},"fields":{},"topLevel":true,"shadow":false,"x":0,"y":0},
  {"id":"b2","opcode":"control_forever","next":null,"parent":"b1","inputs":{"SUBSTACK":{"name":"SUBSTACK","block":"b3","shadow":null}},"fields":{},"topLevel":false,"shadow":false},
  {"id":"b3","opcode":"motion_movesteps","next":"b4","parent":"b2","inputs":{"STEPS":{"name":"STEPS","block":"b5","shadow":"b5"}},"fields":{},"topLevel":false,"shadow":false},
  {"id":"b5","opcode":"math_number","next":null,"parent":"b3","inputs":{},"fields":{"NUM":{"name":"NUM","value":"10"}},"topLevel":false,"shadow":true},
  {"id":"b4","opcode":"motion_ifonedgebounce","next":null,"parent":"b3","inputs":{},"fields":{},"topLevel":false,"shadow":false}
]

EXAMPLE 3 - "say hello for 2 seconds":
[
  {"id":"c1","opcode":"event_whenflagclicked","next":"c2","parent":null,"inputs":{},"fields":{},"topLevel":true,"shadow":false,"x":0,"y":0},
  {"id":"c2","opcode":"looks_sayforsecs","next":null,"parent":"c1","inputs":{"MESSAGE":{"name":"MESSAGE","block":"c3","shadow":"c3"},"SECS":{"name":"SECS","block":"c4","shadow":"c4"}},"fields":{},"topLevel":false,"shadow":false},
  {"id":"c3","opcode":"text","next":null,"parent":"c2","inputs":{},"fields":{"TEXT":{"name":"TEXT","value":"Hello!"}},"topLevel":false,"shadow":true},
  {"id":"c4","opcode":"math_number","next":null,"parent":"c2","inputs":{},"fields":{"NUM":{"name":"NUM","value":"2"}},"topLevel":false,"shadow":true}
]

EXAMPLE 4 - "if touching edge, play sound":
[
  {"id":"d1","opcode":"event_whenflagclicked","next":"d2","parent":null,"inputs":{},"fields":{},"topLevel":true,"shadow":false,"x":0,"y":0},
  {"id":"d2","opcode":"control_forever","next":null,"parent":"d1","inputs":{"SUBSTACK":{"name":"SUBSTACK","block":"d3","shadow":null}},"fields":{},"topLevel":false,"shadow":false},
  {"id":"d3","opcode":"control_if","next":null,"parent":"d2","inputs":{"CONDITION":{"name":"CONDITION","block":"d4","shadow":null},"SUBSTACK":{"name":"SUBSTACK","block":"d5","shadow":null}},"fields":{},"topLevel":false,"shadow":false},
  {"id":"d4","opcode":"sensing_touchingobject","next":null,"parent":"d3","inputs":{"TOUCHINGOBJECTMENU":{"name":"TOUCHINGOBJECTMENU","block":"d6","shadow":"d6"}},"fields":{},"topLevel":false,"shadow":false},
  {"id":"d6","opcode":"sensing_touchingobjectmenu","next":null,"parent":"d4","inputs":{},"fields":{"TOUCHINGOBJECTMENU":{"name":"TOUCHINGOBJECTMENU","value":"_edge_"}},"topLevel":false,"shadow":true},
  {"id":"d5","opcode":"sound_play","next":null,"parent":"d3","inputs":{"SOUND_MENU":{"name":"SOUND_MENU","block":"d7","shadow":"d7"}},"fields":{},"topLevel":false,"shadow":false},
  {"id":"d7","opcode":"sound_sounds_menu","next":null,"parent":"d5","inputs":{},"fields":{"SOUND_MENU":{"name":"SOUND_MENU","value":"pop"}},"topLevel":false,"shadow":true}
]

BLOCK TYPES:
Stack blocks (can have "next"): event_whenflagclicked, event_whenkeypressed, control_repeat, control_if, control_if_else, control_wait, motion_movesteps, motion_turnright, motion_turnleft, motion_gotoxy, motion_glidesecstoxy, motion_pointindirection, motion_changexby, motion_changeyby, motion_setx, motion_sety, motion_ifonedgebounce, looks_say, looks_sayforsecs, looks_think, looks_switchcostumeto, looks_nextcostume, looks_changesizeby, looks_setsizeto, looks_show, looks_hide, looks_changeeffectby, sound_play, sound_playuntildone, sensing_askandwait, data_setvariableto, data_changevariableby
Cap blocks (CANNOT have "next"): control_forever, control_delete_this_clone, control_stop
Reporter blocks (values only, CANNOT have "next", used inside inputs): math_number, text, operator_add, operator_subtract, operator_multiply, operator_random, sensing_distanceto, sensing_mousex, sensing_mousey, sensing_answer, sensing_timer, looks_size, data_variable, motion_xposition, motion_yposition
Boolean blocks (true/false only, CANNOT have "next", used inside inputs): sensing_touchingobject, sensing_keypressed, sensing_mousedown, operator_gt, operator_lt, operator_equals, operator_and, operator_or, operator_not

CURRENT CODE FOR ${entity}:
${blocksText}

USER REQUEST: ${userPrompt}

\`\`\`json`;
};

/**
 * Parse the model's JSON output into an array of block objects.
 * Attempts to extract JSON from the response even if there's surrounding text.
 */
const parseGeneratedBlocks = modelOutput => {
    // Try to find a JSON array in the output
    let jsonStr = modelOutput.trim();

    // Strip markdown code fences from the output.
    // The model may output fences in various configurations:
    //   - Full fences: ```json ... ```
    //   - Opening fence only (truncated output): ```json ...
    //   - Closing fence only (when prompt ends with ```json): ... ```
    //   - No fences at all

    // First, strip any trailing closing fence
    jsonStr = jsonStr.replace(/```\s*$/, '').trim();

    // Then handle opening fences
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
        jsonStr = fenceMatch[1].trim();
    } else {
        const openFence = jsonStr.match(/```(?:json)?\s*([\s\S]*)/);
        if (openFence) {
            jsonStr = openFence[1].trim();
        }
    }

    // Try to find array brackets
    const startIdx = jsonStr.indexOf('[');
    const endIdx = jsonStr.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        jsonStr = jsonStr.substring(startIdx, endIdx + 1);
    }

    let blocks;
    try {
        blocks = JSON.parse(jsonStr);
    } catch (e) {
        // If JSON is truncated, salvage complete top-level objects from the array.
        // We track brace depth to find the end of each complete object.
        if (startIdx === -1) throw e;

        const arrayContent = jsonStr.substring(startIdx);
        let depth = 0;
        let inString = false;
        let escape = false;
        let lastCompleteObjectEnd = -1;

        for (let i = 0; i < arrayContent.length; i++) {
            const ch = arrayContent[i];
            if (escape) {
                escape = false;
                continue;
            }
            if (ch === '\\' && inString) {
                escape = true;
                continue;
            }
            if (ch === '"') {
                inString = !inString;
                continue;
            }
            if (inString) continue;

            if (ch === '[' || ch === '{') depth++;
            else if (ch === ']' || ch === '}') {
                depth--;
                // depth 1 means we just closed a top-level object in the array
                if (depth === 1 && ch === '}') {
                    lastCompleteObjectEnd = i;
                }
            }
        }

        if (lastCompleteObjectEnd > 0) {
            // First try: use only the fully complete objects
            let salvaged = arrayContent.substring(0, lastCompleteObjectEnd + 1) + ']';

            // Second try: also attempt to complete the next truncated object
            // by closing any open braces/brackets
            const remainder = arrayContent.substring(lastCompleteObjectEnd + 1).trim();
            if (remainder.startsWith(',')) {
                const partial = remainder.substring(1).trim();
                if (partial.startsWith('{')) {
                    // Count unclosed braces in the partial object
                    let partialDepth = 0;
                    let partialInString = false;
                    let partialEscape = false;
                    for (let j = 0; j < partial.length; j++) {
                        const ch2 = partial[j];
                        if (partialEscape) { partialEscape = false; continue; }
                        if (ch2 === '\\' && partialInString) { partialEscape = true; continue; }
                        if (ch2 === '"') { partialInString = !partialInString; continue; }
                        if (partialInString) continue;
                        if (ch2 === '{') partialDepth++;
                        else if (ch2 === '}') partialDepth--;
                    }
                    // Close unclosed braces and try to parse with the partial object
                    if (partialDepth > 0) {
                        const closed = partial + '}'.repeat(partialDepth);
                        const withPartial = arrayContent.substring(0, lastCompleteObjectEnd + 1) +
                            ',' + closed + ']';
                        try {
                            blocks = JSON.parse(withPartial);
                            // eslint-disable-next-line no-console
                            console.log('[ai-code-suggestions] salvaged truncated JSON including partial last object');
                        } catch {
                            // Fall back to only complete objects
                        }
                    }
                }
            }

            if (!blocks) {
                // eslint-disable-next-line no-console
                console.log('[ai-code-suggestions] salvaging truncated JSON, keeping', lastCompleteObjectEnd, 'chars');
                blocks = JSON.parse(salvaged);
            }
        } else {
            throw e;
        }
    }

    if (!Array.isArray(blocks)) {
        throw new Error('Expected a JSON array of blocks');
    }

    // Assign fresh unique IDs and fix up references
    const idMap = {};
    for (const block of blocks) {
        const newId = uid();
        idMap[block.id] = newId;
        block.id = newId;
    }

    // Remap all id references
    for (const block of blocks) {
        if (block.next && idMap[block.next]) block.next = idMap[block.next];
        else if (block.next && !blocks.find(b => b.id === block.next)) block.next = null;

        if (block.parent && idMap[block.parent]) block.parent = idMap[block.parent];
        else if (block.parent && !blocks.find(b => b.id === block.parent)) block.parent = null;

        if (block.inputs) {
            for (const key of Object.keys(block.inputs)) {
                const inp = block.inputs[key];
                if (inp.block && idMap[inp.block]) inp.block = idMap[inp.block];
                if (inp.shadow && idMap[inp.shadow]) inp.shadow = idMap[inp.shadow];
            }
        }
    }

    // Validate required fields
    for (const block of blocks) {
        if (!block.opcode) throw new Error(`Block ${block.id} missing opcode`);
        if (typeof block.inputs !== 'object') block.inputs = {};
        if (typeof block.fields !== 'object') block.fields = {};
        if (typeof block.shadow !== 'boolean') block.shadow = false;
        if (typeof block.topLevel !== 'boolean') block.topLevel = false;
        if (block.next === undefined) block.next = null;
        if (block.parent === undefined) block.parent = null;
    }

    // Fix misplaced fields: the model sometimes puts field values in "inputs" instead of "fields".
    // Known cases: math_number.NUM, text.TEXT, and menu blocks with their menu field.
    const FIELD_NAMES_BY_OPCODE = {
        math_number: 'NUM', math_angle: 'NUM', math_integer: 'NUM',
        math_whole_number: 'NUM', math_positive_number: 'NUM',
        text: 'TEXT', colour_picker: 'COLOUR', note: 'NOTE'
    };
    for (const block of blocks) {
        const expectedField = FIELD_NAMES_BY_OPCODE[block.opcode];
        if (expectedField && block.inputs[expectedField] && !block.fields[expectedField]) {
            // Move from inputs to fields
            const misplaced = block.inputs[expectedField];
            block.fields[expectedField] = {
                name: expectedField,
                value: misplaced.value || misplaced.block || '0'
            };
            delete block.inputs[expectedField];
        }
        // Also handle menu blocks: move value-only entries from inputs to fields
        if (MENU_OPCODE_RE.test(block.opcode)) {
            for (const [key, val] of Object.entries(block.inputs)) {
                if (val && val.value !== undefined && !block.fields[key]) {
                    block.fields[key] = {name: key, value: val.value};
                    delete block.inputs[key];
                }
            }
        }
    }

    // Fix incorrect input names that the model sometimes generates.
    const INPUT_NAME_FIXES = {
        looks_changeeffectby: {EFFECTCHANGE: 'CHANGE'},
        looks_seteffectto: {EFFECTVALUE: 'VALUE'},
        motion_pointindirection: {DIRECTIONMENU: 'DIRECTION'},
        looks_setsizeto: {PERCENT: 'SIZE'}
    };
    for (const block of blocks) {
        const fixes = INPUT_NAME_FIXES[block.opcode];
        if (fixes) {
            for (const [wrong, right] of Object.entries(fixes)) {
                if (block.inputs[wrong] && !block.inputs[right]) {
                    block.inputs[right] = block.inputs[wrong];
                    block.inputs[right].name = right;
                    delete block.inputs[wrong];
                }
            }
        }
    }

    // Add default fields for blocks that require them but the model didn't provide.
    const DEFAULT_FIELDS = {
        looks_changeeffectby: {EFFECT: {name: 'EFFECT', value: 'COLOR'}},
        looks_seteffectto: {EFFECT: {name: 'EFFECT', value: 'COLOR'}},
        control_stop: {STOP_OPTION: {name: 'STOP_OPTION', value: 'all'}},
        event_whenkeypressed: {KEY_OPTION: {name: 'KEY_OPTION', value: 'space'}},
        sensing_keypressed: {KEY_OPTION: {name: 'KEY_OPTION', value: 'space'}},
        motion_setrotationstyle: {STYLE: {name: 'STYLE', value: 'left-right'}},
        looks_setsizeto: {SIZE: undefined} // SIZE is an input, not a field — handled elsewhere
    };
    for (const block of blocks) {
        const defaults = DEFAULT_FIELDS[block.opcode];
        if (defaults) {
            for (const [key, val] of Object.entries(defaults)) {
                if (val && (!block.fields[key] || !block.fields[key].value)) {
                    block.fields[key] = val;
                }
            }
        }
    }

    // Create default shadow blocks for inputs that reference missing blocks.
    // This handles cases where the model output was truncated and shadow blocks were lost.
    const DEFAULT_SHADOW = {
        STEPS: {opcode: 'math_number', field: 'NUM', value: '10'},
        DEGREES: {opcode: 'math_number', field: 'NUM', value: '15'},
        SECS: {opcode: 'math_number', field: 'NUM', value: '1'},
        DURATION: {opcode: 'math_number', field: 'NUM', value: '0.25'},
        DX: {opcode: 'math_number', field: 'NUM', value: '10'},
        DY: {opcode: 'math_number', field: 'NUM', value: '10'},
        X: {opcode: 'math_number', field: 'NUM', value: '0'},
        Y: {opcode: 'math_number', field: 'NUM', value: '0'},
        SIZE: {opcode: 'math_number', field: 'NUM', value: '10'},
        CHANGE: {opcode: 'math_number', field: 'NUM', value: '25'},
        VALUE: {opcode: 'math_number', field: 'NUM', value: '0'},
        TIMES: {opcode: 'math_number', field: 'NUM', value: '10'},
        DIRECTION: {opcode: 'math_number', field: 'NUM', value: '90'},
        MESSAGE: {opcode: 'text', field: 'TEXT', value: 'hello'},
        NUM1: {opcode: 'math_number', field: 'NUM', value: '0'},
        NUM2: {opcode: 'math_number', field: 'NUM', value: '0'},
        OPERAND: {opcode: 'math_number', field: 'NUM', value: '50'},
        OPERAND1: {opcode: 'math_number', field: 'NUM', value: '0'},
        OPERAND2: {opcode: 'math_number', field: 'NUM', value: '50'},
        VOLUME: {opcode: 'math_number', field: 'NUM', value: '100'},
        QUESTION: {opcode: 'text', field: 'TEXT', value: "What's your name?"}
    };

    const existingIds = new Set(blocks.map(b => b.id));
    for (const block of blocks) {
        if (!block.inputs) continue;
        for (const key of Object.keys(block.inputs)) {
            const inp = block.inputs[key];
            const refId = inp.block || inp.shadow;
            if (refId && !existingIds.has(refId)) {
                // Referenced block is missing — create a default shadow
                const defaults = DEFAULT_SHADOW[key] || {opcode: 'math_number', field: 'NUM', value: '0'};
                const shadowId = uid();
                const shadowBlock = {
                    id: shadowId,
                    opcode: defaults.opcode,
                    next: null,
                    parent: block.id,
                    inputs: {},
                    fields: {[defaults.field]: {name: defaults.field, value: defaults.value}},
                    topLevel: false,
                    shadow: true
                };
                blocks.push(shadowBlock);
                existingIds.add(shadowId);
                inp.block = shadowId;
                inp.shadow = shadowId;
                // eslint-disable-next-line no-console
                console.log(`[ai-code-suggestions] created default shadow for missing input ${key} (${defaults.value})`);
            }
        }
    }

    // Fix structural issues: reporters, booleans, shadows, menus, and caps cannot have "next".
    const byId = {};
    for (const b of blocks) byId[b.id] = b;

    for (const block of blocks) {
        const isReporter = REPORTER_OPCODES.has(block.opcode) || MENU_OPCODE_RE.test(block.opcode);
        const isCap = CAP_OPCODES.has(block.opcode);

        if ((block.shadow || isReporter || isCap) && block.next) {
            // The dangling "next" block should no longer claim this block as parent
            const orphan = byId[block.next];
            if (orphan) orphan.parent = null;
            block.next = null;
        }

        // Also fix: if a stack block's "next" points to a shadow/reporter,
        // that block should be an input, not a next. Clear the bad pointer.
        if (block.next) {
            const nextBlock = byId[block.next];
            if (nextBlock) {
                const nextIsReporter = REPORTER_OPCODES.has(nextBlock.opcode) ||
                    MENU_OPCODE_RE.test(nextBlock.opcode) || nextBlock.shadow;
                if (nextIsReporter) {
                    block.next = null;
                }
            }
        }
    }

    // Drop orphaned blocks (no parent and not topLevel) that resulted from fixups
    const reachable = new Set();
    const markReachable = id => {
        if (!id || reachable.has(id)) return;
        reachable.add(id);
        const b = byId[id];
        if (!b) return;
        if (b.next) markReachable(b.next);
        for (const inp of Object.values(b.inputs)) {
            if (inp.block) markReachable(inp.block);
            if (inp.shadow && inp.shadow !== inp.block) markReachable(inp.shadow);
        }
    };
    for (const b of blocks) {
        if (b.topLevel) markReachable(b.id);
    }

    return blocks.filter(b => reachable.has(b.id));
};

/**
 * Convert block array to a human-readable preview string.
 */
const blocksToPreviewText = blocks => {
    const lines = [];
    const indent = depth => '  '.repeat(depth);

    // Build a lookup by id
    const byId = {};
    for (const b of blocks) byId[b.id] = b;

    // Simple opcode-to-text mapping for common blocks
    const opcodeText = block => {
        const op = block.opcode;
        const fieldVal = (name) => {
            const f = block.fields[name];
            return f ? f.value : '';
        };

        // Map common opcodes to readable text
        const map = {
            event_whenflagclicked: 'when green flag clicked',
            event_whenkeypressed: `when [${fieldVal('KEY_OPTION')}] key pressed`,
            event_whenthisspriteclicked: 'when this sprite clicked',
            control_forever: 'forever',
            control_repeat: 'repeat',
            control_if: 'if <...> then',
            control_if_else: 'if <...> then ... else',
            control_wait: 'wait ... seconds',
            control_repeat_until: 'repeat until <...>',
            control_stop: `stop [${fieldVal('STOP_OPTION')}]`,
            control_start_as_clone: 'when I start as a clone',
            control_create_clone_of: 'create clone of ...',
            control_delete_this_clone: 'delete this clone',
            motion_movesteps: 'move ... steps',
            motion_turnright: 'turn right ... degrees',
            motion_turnleft: 'turn left ... degrees',
            motion_gotoxy: 'go to x: ... y: ...',
            motion_goto: 'go to ...',
            motion_glidesecstoxy: 'glide ... secs to x: ... y: ...',
            motion_pointindirection: 'point in direction ...',
            motion_changexby: 'change x by ...',
            motion_changeyby: 'change y by ...',
            motion_setx: 'set x to ...',
            motion_sety: 'set y to ...',
            motion_ifonedgebounce: 'if on edge, bounce',
            motion_setrotationstyle: `set rotation style [${fieldVal('STYLE')}]`,
            looks_sayforsecs: 'say ... for ... seconds',
            looks_say: 'say ...',
            looks_thinkforsecs: 'think ... for ... seconds',
            looks_think: 'think ...',
            looks_switchcostumeto: 'switch costume to ...',
            looks_nextcostume: 'next costume',
            looks_changesizeby: 'change size by ...',
            looks_setsizeto: 'set size to ...%',
            looks_show: 'show',
            looks_hide: 'hide',
            looks_changeeffectby: 'change ... effect by ...',
            looks_seteffectto: 'set ... effect to ...',
            looks_cleargraphiceffects: 'clear graphic effects',
            sound_play: 'start sound ...',
            sound_playuntildone: 'play sound ... until done',
            sound_stopallsounds: 'stop all sounds',
            sound_changevolumeby: 'change volume by ...',
            sound_setvolumeto: 'set volume to ...%',
            sensing_touchingobject: 'touching ...?',
            sensing_askandwait: 'ask ... and wait',
            sensing_keypressed: 'key ... pressed?',
            sensing_mousedown: 'mouse down?',
            sensing_resettimer: 'reset timer',
            operator_add: '... + ...',
            operator_subtract: '... - ...',
            operator_multiply: '... * ...',
            operator_divide: '... / ...',
            operator_random: 'pick random ... to ...',
            data_setvariableto: 'set ... to ...',
            data_changevariableby: 'change ... by ...',
            data_addtolist: 'add ... to ...',
            data_deleteoflist: 'delete ... of ...'
        };

        return map[op] || op.replace(/_/g, ' ');
    };

    // Walk the block chain starting from top-level blocks
    const walkChain = (blockId, depth) => {
        let current = blockId;
        while (current) {
            const block = byId[current];
            if (!block || block.shadow) {
                current = null;
                continue;
            }
            const text = opcodeText(block);
            lines.push(`${indent(depth)}${text}`);

            // Handle substacks (forever, repeat, if, etc.)
            if (block.inputs.SUBSTACK && block.inputs.SUBSTACK.block) {
                walkChain(block.inputs.SUBSTACK.block, depth + 1);
            }
            if (block.inputs.SUBSTACK2 && block.inputs.SUBSTACK2.block) {
                lines.push(`${indent(depth)}else`);
                walkChain(block.inputs.SUBSTACK2.block, depth + 1);
            }
            if (block.inputs.SUBSTACK || block.inputs.SUBSTACK2) {
                lines.push(`${indent(depth)}end`);
            }

            current = block.next;
        }
    };

    for (const block of blocks) {
        if (block.topLevel && !block.shadow) {
            walkChain(block.id, 0);
            lines.push(''); // blank line between scripts
        }
    }

    return lines.join('\n').trim() || '(no blocks generated)';
};

/**
 * Main entry point: generate a code suggestion.
 */
const generateCodeSuggestion = async (vm, userPrompt, dispatch) => {
    const target = vm.editingTarget;
    if (!target) {
        dispatch(setError('No sprite or stage selected'));
        return;
    }

    const targetName = target.getName();
    const isStage = target.isStage;

    const generateFn = await resolveGenerateFn(vm);
    if (!generateFn) return; // user cancelled model load

    dispatch(setGenerating());

    try {
        const blocksText = await getProjectCode(vm, targetName);
        const prompt = buildScratchblocksPrompt(userPrompt, blocksText, targetName, isStage);

        // eslint-disable-next-line no-console
        console.log('[ai-code-suggestions] scratchblocks prompt:\n', prompt);

        const modelOutput = await generateFn(prompt);

        // eslint-disable-next-line no-console
        console.log('[ai-code-suggestions] raw output:\n', modelOutput);

        const parsed = parseScratchblocksOutput(modelOutput);

        if (!parsed.validation.valid) {
            // eslint-disable-next-line no-console
            console.warn('[ai-code-suggestions] validation errors:', parsed.validation.errors);
        }
        if (parsed.validation.warnings.length > 0) {
            // eslint-disable-next-line no-console
            console.warn('[ai-code-suggestions] warnings:', parsed.validation.warnings);
        }

        const blocks = scratchblocksToVMBlocks(parsed.text);
        const previewText = blocksToPreviewText(blocks);

        dispatch(setResult(blocks, previewText));
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ai-code-suggestions] error:', err);
        dispatch(setError(err.message || 'Failed to generate code'));
    }
};

/**
 * Insert generated blocks into the current editing target's workspace.
 */
const addBlocksToWorkspace = (vm, blocks) => {
    if (!vm.editingTarget || !blocks || blocks.length === 0) {
        return Promise.resolve();
    }
    return vm.shareBlocksToTarget(blocks, vm.editingTarget.id)
        .then(() => {
            vm.refreshWorkspace();
        });
};

// ==========================================
// Scratchblocks text format (Phase 1 experiment)
// ==========================================

/**
 * Build a compact prompt asking the model to generate scratchblocks text.
 * ~400-500 tokens vs ~2600 for the JSON prompt.
 */
const buildScratchblocksPrompt = (userPrompt, blocksText, targetName, isStage) => {
    const entity = isStage ? 'the Stage' : `sprite "${targetName}"`;

    return `You are a Scratch coding assistant. Generate Scratch code in scratchblocks text format.

RULES:
1. Keep scripts SHORT (under 15 blocks). Use the SIMPLEST approach.
2. Do EXACTLY what is requested — nothing more. Do NOT add extra blocks or explanations.
3. Use ONLY blocks from the COMMON BLOCKS list below. Do NOT invent or modify block names.
4. Your response must start with \`\`\`scratchblocks and contain ONLY code. No explanations.

SYNTAX:
- Numbers: (10), (0.5)
- Strings: [Hello!], [What's your name?]
- Dropdowns: (mouse-pointer v), [color v]
- Booleans: <touching (mouse-pointer v) ?>
- Nesting: indent with tab, close with "end"
- ONLY use "end" to close forever, repeat, if...then, or repeat until. Never use "end" alone.

EXAMPLE 1 - "move forward":
when green flag clicked
move (10) steps

EXAMPLE 2 - "forever move and bounce":
when green flag clicked
forever
\tmove (10) steps
\tif on edge, bounce
end

EXAMPLE 3 - "say hello for 2 seconds":
when green flag clicked
say [Hello!] for (2) seconds

EXAMPLE 4 - "if touching edge, play sound":
when green flag clicked
forever
\tif <touching (edge v) ?> then
\t\tstart sound (pop v)
\tend
end

EXAMPLE 5 - "hide":
when green flag clicked
hide

COMMON BLOCKS:
move (10) steps | turn right (15) degrees | turn left (15) degrees
go to x: (0) y: (0) | glide (1) secs to x: (0) y: (0)
point in direction (90) | if on edge, bounce
change x by (10) | set x to (0) | change y by (10) | set y to (0)
say [Hello!] for (2) seconds | say [Hello!] | think [Hmm...] for (2) seconds
switch costume to (costume1 v) | next costume | switch backdrop to (backdrop1 v)
change size by (10) | set size to (100) %
change [color v] effect by (25) | set [color v] effect to (0) | clear graphic effects
show | hide
play sound (pop v) until done | start sound (pop v) | stop all sounds
change volume by (-10) | set volume to (100) %
when green flag clicked | when [space v] key pressed | when this sprite clicked
when I receive [message1 v] | broadcast (message1 v) | broadcast (message1 v) and wait
wait (1) seconds | repeat (10) ... end | forever ... end
if <> then ... end | if <> then ... else ... end
wait until <> | repeat until <> ... end
stop [all v]
create clone of (myself v) | when I start as a clone | delete this clone
ask [What's your name?] and wait | (answer)
<touching (mouse-pointer v) ?> | <touching color [#ff0000] ?> | <key (space v) pressed?>
(distance to (mouse-pointer v)) | (mouse x) | (mouse y) | <mouse down?>
(timer) | reset timer
set [my variable v] to (0) | change [my variable v] by (1) | (my variable)
add [thing] to [my list v] | delete (1) of [my list v] | insert [thing] at (1) of [my list v]
(item (1) of [my list v]) | (length of [my list v])
erase all | stamp | pen down | pen up | set pen color to [#0000ff]
set pen size to (1) | change pen size by (1)

CURRENT CODE FOR ${entity}:
${blocksText}

REQUEST: ${userPrompt}

\`\`\`scratchblocks`;
};

/**
 * Known hat block patterns (first line of a script).
 */
const HAT_PATTERNS = [
    /^when green flag clicked$/,
    /^when \[.+\] key pressed$/,
    /^when this sprite clicked$/,
    /^when stage clicked$/,
    /^when backdrop switches to \[.+\]$/,
    /^when \[.+ v\] > \(.+\)$/,
    /^when I receive \[.+ v?\]$/,
    /^when I start as a clone$/,
    /^when \[.+\] > \(.+\)$/
];

/**
 * Known block line patterns. Each regex matches one scratchblocks line.
 * We don't need to match every possible block — just enough to validate
 * that the model output looks like real scratchblocks.
 */
const BLOCK_PATTERNS = [
    // Motion
    /^move \(.+\) steps$/, /^turn right \(.+\) degrees$/, /^turn left \(.+\) degrees$/,
    /^go to x: ?\(.+\) y: ?\(.+\)$/, /^go to \(.+ v\)$/,
    /^glide \(.+\) secs to x: ?\(.+\) y: ?\(.+\)$/, /^glide \(.+\) secs to \(.+ v\)$/,
    /^point in direction \(.+\)$/, /^point towards \(.+ v\)$/,
    /^change x by \(.+\)$/, /^set x to \(.+\)$/,
    /^change y by \(.+\)$/, /^set y to \(.+\)$/,
    /^if on edge, bounce$/, /^set rotation style \[.+\]$/,
    // Looks
    /^say \[.*\] for \(.+\) seconds$/, /^say \[.*\]$/,
    /^think \[.*\] for \(.+\) seconds$/, /^think \[.*\]$/,
    /^switch costume to \(.+ v?\)$/, /^next costume$/,
    /^switch backdrop to \(.+ v?\)$/, /^next backdrop$/,
    /^change size by \(.+\)$/, /^set size to \(.+\) ?%?$/,
    /^change \[.+ v?\] effect by \(.+\)$/, /^set \[.+ v?\] effect to \(.+\)$/,
    /^clear graphic effects$/, /^show$/, /^hide$/,
    /^go to \[.+\] layer$/, /^go \[.+\] \(.+\) layers?$/,
    // Sound
    /^play sound \(.+ v?\) until done$/, /^start sound \(.+ v?\)$/,
    /^stop all sounds$/,
    /^change \[.+\] effect by \(.+\)$/, /^set \[.+\] effect to \(.+\)$/,
    /^clear sound effects$/,
    /^change volume by \(.+\)$/, /^set volume to \(.+\) ?%?$/,
    // Events
    /^broadcast \(.+ v?\)$/, /^broadcast \(.+ v?\) and wait$/,
    // Control
    /^wait \(.+\) seconds$/, /^repeat \(.+\)$/, /^forever$/,
    /^if <.*> then$/, /^else$/, /^end$/,
    /^wait until <.*>$/, /^repeat until <.*>$/,
    /^stop \[.+ v?\]$/,
    /^create clone of \(.+ v?\)$/, /^delete this clone$/,
    // Sensing
    /^ask \[.*\] and wait$/, /^reset timer$/,
    /^set drag mode \[.+\]$/,
    // Data
    /^set \[.+ v?\] to \(.+\)$/, /^change \[.+ v?\] by \(.+\)$/,
    /^show variable \[.+\]$/, /^hide variable \[.+\]$/,
    /^add \[.*\] to \[.+ v?\]$/, /^delete \(.+\) of \[.+ v?\]$/,
    /^delete all of \[.+ v?\]$/,
    /^insert \[.*\] at \(.+\) of \[.+ v?\]$/,
    /^replace item \(.+\) of \[.+ v?\] with \[.*\]$/,
    /^show list \[.+\]$/, /^hide list \[.+\]$/,
    // Pen
    /^erase all$/, /^stamp$/,
    /^pen down$/, /^pen up$/,
    /^set pen color to \[.+\]$/, /^change pen \(.+\) by \(.+\)$/,
    /^set pen \(.+\) to \(.+\)$/, /^change pen size by \(.+\)$/,
    /^set pen size to \(.+\)$/,
    // Music
    /^play drum \(.+\) for \(.+\) beats$/,
    /^rest for \(.+\) beats$/,
    /^play note \(.+\) for \(.+\) beats$/,
    /^set instrument to \(.+\)$/,
    /^set tempo to \(.+\)$/, /^change tempo by \(.+\)$/,
    // My Blocks
    /^define /, // custom block definitions
];

/**
 * Validate scratchblocks text for structural correctness.
 * Returns {valid, lines, errors, warnings, stats}.
 */
const validateScratchblocks = text => {
    const errors = [];
    const warnings = [];
    const lines = text.split('\n')
        .map(l => l.replace(/\t/g, '    ').trimEnd())
        .filter(l => l.trim().length > 0);

    if (lines.length === 0) {
        return {valid: false, lines: [], errors: ['Empty output'], warnings: [], stats: {blocks: 0, depth: 0}};
    }

    // Check first line is a hat block
    const firstLine = lines[0].trim();
    const isHat = HAT_PATTERNS.some(p => p.test(firstLine));
    if (!isHat) {
        errors.push(`First line is not a hat block: "${firstLine}"`);
    }

    // Check for JSON artifacts
    const jsonArtifacts = lines.some(l => /[{}\[\]]/.test(l.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '')));
    if (jsonArtifacts) {
        errors.push('Output contains JSON-like artifacts (braces/brackets outside of inputs)');
    }

    // Check nesting balance
    let depth = 0;
    let maxDepth = 0;
    let recognized = 0;
    let unrecognized = 0;
    const nestOpeners = /^(forever|repeat \(.+\)|if <.*> then|repeat until <.*>|else)$/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line === 'end') {
            depth--;
            if (depth < 0) {
                errors.push(`Unexpected "end" at line ${i + 1} (no matching opener)`);
                depth = 0;
            }
            recognized++;
            continue;
        }

        if (line === 'else') {
            // else doesn't change depth, it's at the same level as the matching if
            recognized++;
            continue;
        }

        // Check if line matches a known pattern
        const isKnownHat = HAT_PATTERNS.some(p => p.test(line));
        const isKnownBlock = BLOCK_PATTERNS.some(p => p.test(line));
        if (isKnownHat || isKnownBlock) {
            recognized++;
        } else {
            unrecognized++;
            warnings.push(`Unrecognized block at line ${i + 1}: "${line}"`);
        }

        // Track nesting
        if (nestOpeners.test(line)) {
            depth++;
            if (depth > maxDepth) maxDepth = depth;
        }
    }

    if (depth > 0) {
        errors.push(`Unclosed nesting: ${depth} missing "end" statement(s)`);
    }

    const stats = {
        blocks: lines.length,
        maxDepth,
        recognized,
        unrecognized
    };

    return {
        valid: errors.length === 0,
        lines,
        errors,
        warnings,
        stats
    };
};

/**
 * Lightweight normalization of common model output quirks.
 * Intentionally minimal — just the 3-4 most common issues.
 */
const normalizeScratchblocks = text => {
    const lines = text.split('\n');
    const normalized = [];
    const nestOpeners = /^(forever|repeat \(.+\)|if <.*> then|if <.*> then|repeat until <.*>)$/;

    // Track nesting depth to detect orphan "end" lines
    let depth = 0;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const trimmed = line.trim();

        // Skip empty lines
        if (!trimmed) {
            normalized.push(line);
            continue;
        }

        // 1. Normalize known abbreviations
        if (trimmed === 'bounce') {
            // Preserve indentation
            line = line.replace('bounce', 'if on edge, bounce');
        }

        // 2. Strip embellishments from known block patterns
        // e.g. "move (10) steps to the right" → "move (10) steps"
        line = line.replace(/^(\s*move \(\d+\) steps)(\s+.*)$/, '$1');
        // e.g. "turn right (15) degrees clockwise" → "turn right (15) degrees"
        line = line.replace(/^(\s*turn (?:right|left) \(\d+\) degrees)(\s+.*)$/, '$1');

        const retrimmed = line.trim();

        // 3. Handle orphan "end" — only push if we have a matching opener
        if (retrimmed === 'end') {
            if (depth > 0) {
                depth--;
                normalized.push(line);
            }
            // else: skip orphan end
            continue;
        }

        // Track nesting for orphan-end detection
        if (nestOpeners.test(retrimmed)) {
            depth++;
        }

        normalized.push(line);
    }

    return normalized.join('\n');
};

/**
 * Parse raw model output to extract and validate scratchblocks text.
 * Strips markdown fences and whitespace.
 * Returns {text, lines, validation}.
 */
const parseScratchblocksOutput = modelOutput => {
    let text = modelOutput.trim();

    // Strip trailing closing fence
    text = text.replace(/```\s*$/, '').trim();

    // Strip opening fence (```scratchblocks, ```scratch, ```scratchblocks code, or plain ```)
    const fenceMatch = text.match(/```(?:scratchblocks|scratch)?(?:[ \t]+\w+)?[ \t]*\n?([\s\S]*?)```/);
    if (fenceMatch) {
        text = fenceMatch[1].trim();
    } else {
        const openFence = text.match(/```(?:scratchblocks|scratch)?(?:[ \t]+\w+)?[ \t]*\n?([\s\S]*)/);
        if (openFence) {
            text = openFence[1].trim();
        }
    }

    // Strip any leading/trailing blank lines
    text = text.replace(/^\n+|\n+$/g, '');

    // Lightweight normalization of common model quirks
    text = normalizeScratchblocks(text);

    const validation = validateScratchblocks(text);

    return {
        text,
        lines: validation.lines,
        validation
    };
};

// ==========================================
// Scratchblocks → VM Blocks converter (Phase 2)
// ==========================================

/**
 * Block definition table: maps scratchblocks text patterns to opcodes + input/field specs.
 * Each entry: {pattern, opcode, inputs, fields, cShape?, cap?}
 *
 * Input types: 'number', 'string', 'color', 'menu', 'boolean'
 * Menu inputs need: menuOpcode, menuField
 * Fields are placed directly on the block (no shadow).
 */
const BLOCK_DEFS = [
    // --- Hat blocks ---
    {pattern: /^when green flag clicked$/, opcode: 'event_whenflagclicked', inputs: [], fields: []},
    {pattern: /^when \[(.+?) v\] key pressed$/, opcode: 'event_whenkeypressed', inputs: [], fields: [{name: 'KEY_OPTION', group: 1}]},
    {pattern: /^when this sprite clicked$/, opcode: 'event_whenthisspriteclicked', inputs: [], fields: []},
    {pattern: /^when stage clicked$/, opcode: 'event_whenstageclicked', inputs: [], fields: []},
    {pattern: /^when backdrop switches to \[(.+?) v?\]$/, opcode: 'event_whenbackdropswitchesto', inputs: [], fields: [{name: 'BACKDROP', group: 1}]},
    {pattern: /^when I receive \[(.+?) v?\]$/, opcode: 'event_whenbroadcastreceived', inputs: [], fields: [{name: 'BROADCAST_OPTION', group: 1}]},
    {pattern: /^when I start as a clone$/, opcode: 'control_start_as_clone', inputs: [], fields: []},

    // --- Motion ---
    {pattern: /^move \((.+?)\) steps$/, opcode: 'motion_movesteps', inputs: [{name: 'STEPS', type: 'number', group: 1}], fields: []},
    {pattern: /^turn right \((.+?)\) degrees$/, opcode: 'motion_turnright', inputs: [{name: 'DEGREES', type: 'number', group: 1}], fields: []},
    {pattern: /^turn left \((.+?)\) degrees$/, opcode: 'motion_turnleft', inputs: [{name: 'DEGREES', type: 'number', group: 1}], fields: []},
    {pattern: /^go to x: ?\((.+?)\) y: ?\((.+?)\)$/, opcode: 'motion_gotoxy', inputs: [{name: 'X', type: 'number', group: 1}, {name: 'Y', type: 'number', group: 2}], fields: []},
    {pattern: /^go to \((.+?) v\)$/, opcode: 'motion_goto', inputs: [{name: 'TO', type: 'menu', menuOpcode: 'motion_goto_menu', menuField: 'TO', group: 1}], fields: []},
    {pattern: /^glide \((.+?)\) secs to x: ?\((.+?)\) y: ?\((.+?)\)$/, opcode: 'motion_glidesecstoxy', inputs: [{name: 'SECS', type: 'number', group: 1}, {name: 'X', type: 'number', group: 2}, {name: 'Y', type: 'number', group: 3}], fields: []},
    {pattern: /^glide \((.+?)\) secs to \((.+?) v\)$/, opcode: 'motion_glideto', inputs: [{name: 'SECS', type: 'number', group: 1}, {name: 'TO', type: 'menu', menuOpcode: 'motion_glideto_menu', menuField: 'TO', group: 2}], fields: []},
    {pattern: /^point in direction \((.+?)\)$/, opcode: 'motion_pointindirection', inputs: [{name: 'DIRECTION', type: 'number', group: 1}], fields: []},
    {pattern: /^point towards \((.+?) v\)$/, opcode: 'motion_pointtowards', inputs: [{name: 'TOWARDS', type: 'menu', menuOpcode: 'motion_pointtowards_menu', menuField: 'TOWARDS', group: 1}], fields: []},
    {pattern: /^change x by \((.+?)\)$/, opcode: 'motion_changexby', inputs: [{name: 'DX', type: 'number', group: 1}], fields: []},
    {pattern: /^set x to \((.+?)\)$/, opcode: 'motion_setx', inputs: [{name: 'X', type: 'number', group: 1}], fields: []},
    {pattern: /^change y by \((.+?)\)$/, opcode: 'motion_changeyby', inputs: [{name: 'DY', type: 'number', group: 1}], fields: []},
    {pattern: /^set y to \((.+?)\)$/, opcode: 'motion_sety', inputs: [{name: 'Y', type: 'number', group: 1}], fields: []},
    {pattern: /^if on edge, bounce$/, opcode: 'motion_ifonedgebounce', inputs: [], fields: []},
    {pattern: /^set rotation style \[(.+?)\]$/, opcode: 'motion_setrotationstyle', inputs: [], fields: [{name: 'STYLE', group: 1}]},

    // --- Looks ---
    {pattern: /^say \[(.*?)\] for \((.+?)\) seconds$/, opcode: 'looks_sayforsecs', inputs: [{name: 'MESSAGE', type: 'string', group: 1}, {name: 'SECS', type: 'number', group: 2}], fields: []},
    {pattern: /^say \[(.*?)\]$/, opcode: 'looks_say', inputs: [{name: 'MESSAGE', type: 'string', group: 1}], fields: []},
    {pattern: /^think \[(.*?)\] for \((.+?)\) seconds$/, opcode: 'looks_thinkforsecs', inputs: [{name: 'MESSAGE', type: 'string', group: 1}, {name: 'SECS', type: 'number', group: 2}], fields: []},
    {pattern: /^think \[(.*?)\]$/, opcode: 'looks_think', inputs: [{name: 'MESSAGE', type: 'string', group: 1}], fields: []},
    {pattern: /^switch costume to \((.+?) v?\)$/, opcode: 'looks_switchcostumeto', inputs: [{name: 'COSTUME', type: 'menu', menuOpcode: 'looks_costume', menuField: 'COSTUME', group: 1}], fields: []},
    {pattern: /^next costume$/, opcode: 'looks_nextcostume', inputs: [], fields: []},
    {pattern: /^switch backdrop to \((.+?) v?\)$/, opcode: 'looks_switchbackdropto', inputs: [{name: 'BACKDROP', type: 'menu', menuOpcode: 'looks_backdrops', menuField: 'BACKDROP', group: 1}], fields: []},
    {pattern: /^next backdrop$/, opcode: 'looks_nextbackdrop', inputs: [], fields: []},
    {pattern: /^change size by \((.+?)\) ?%?$/, opcode: 'looks_changesizeby', inputs: [{name: 'CHANGE', type: 'number', group: 1}], fields: []},
    {pattern: /^set size to \((.+?)\) ?%?$/, opcode: 'looks_setsizeto', inputs: [{name: 'SIZE', type: 'number', group: 1}], fields: []},
    {pattern: /^change \[(.+?) v?\] effect by \((.+?)\)$/, opcode: 'looks_changeeffectby', inputs: [{name: 'CHANGE', type: 'number', group: 2}], fields: [{name: 'EFFECT', group: 1, transform: 'upper'}]},
    {pattern: /^set \[(.+?) v?\] effect to \((.+?)\)$/, opcode: 'looks_seteffectto', inputs: [{name: 'VALUE', type: 'number', group: 2}], fields: [{name: 'EFFECT', group: 1, transform: 'upper'}]},
    {pattern: /^clear graphic effects$/, opcode: 'looks_cleargraphiceffects', inputs: [], fields: []},
    {pattern: /^show$/, opcode: 'looks_show', inputs: [], fields: []},
    {pattern: /^hide$/, opcode: 'looks_hide', inputs: [], fields: []},
    {pattern: /^go to \[(.+?)\] layer$/, opcode: 'looks_gotofrontback', inputs: [], fields: [{name: 'FRONT_BACK', group: 1}]},
    {pattern: /^go \[(.+?)\] \((.+?)\) layers?$/, opcode: 'looks_goforwardbackwardlayers', inputs: [{name: 'NUM', type: 'number', group: 2}], fields: [{name: 'FORWARD_BACKWARD', group: 1}]},

    // --- Sound ---
    {pattern: /^play sound \((.+?) v?\) until done$/, opcode: 'sound_playuntildone', inputs: [{name: 'SOUND_MENU', type: 'menu', menuOpcode: 'sound_sounds_menu', menuField: 'SOUND_MENU', group: 1}], fields: []},
    {pattern: /^start sound \((.+?) v?\)$/, opcode: 'sound_play', inputs: [{name: 'SOUND_MENU', type: 'menu', menuOpcode: 'sound_sounds_menu', menuField: 'SOUND_MENU', group: 1}], fields: []},
    // Handle model mashup: "start sound (X v) until done" → treat as play until done
    {pattern: /^start sound \((.+?) v?\) until done$/, opcode: 'sound_playuntildone', inputs: [{name: 'SOUND_MENU', type: 'menu', menuOpcode: 'sound_sounds_menu', menuField: 'SOUND_MENU', group: 1}], fields: []},
    {pattern: /^stop all sounds$/, opcode: 'sound_stopallsounds', inputs: [], fields: []},
    {pattern: /^change volume by \((.+?)\)$/, opcode: 'sound_changevolumeby', inputs: [{name: 'VOLUME', type: 'number', group: 1}], fields: []},
    {pattern: /^set volume to \((.+?)\) ?%?$/, opcode: 'sound_setvolumeto', inputs: [{name: 'VOLUME', type: 'number', group: 1}], fields: []},
    {pattern: /^clear sound effects$/, opcode: 'sound_cleareffects', inputs: [], fields: []},

    // --- Events ---
    {pattern: /^broadcast \((.+?) v?\)$/, opcode: 'event_broadcast', inputs: [{name: 'BROADCAST_INPUT', type: 'menu', menuOpcode: 'event_broadcast_menu', menuField: 'BROADCAST_OPTION', group: 1}], fields: []},
    {pattern: /^broadcast \((.+?) v?\) and wait$/, opcode: 'event_broadcastandwait', inputs: [{name: 'BROADCAST_INPUT', type: 'menu', menuOpcode: 'event_broadcast_menu', menuField: 'BROADCAST_OPTION', group: 1}], fields: []},

    // --- Control ---
    {pattern: /^wait \((.+?)\) seconds$/, opcode: 'control_wait', inputs: [{name: 'DURATION', type: 'number', group: 1}], fields: []},
    {pattern: /^repeat \((.+?)\)$/, opcode: 'control_repeat', inputs: [{name: 'TIMES', type: 'number', group: 1}], fields: [], cShape: true},
    {pattern: /^forever$/, opcode: 'control_forever', inputs: [], fields: [], cShape: true, cap: true},
    {pattern: /^if <(.*)> then$/, opcode: 'control_if', inputs: [{name: 'CONDITION', type: 'boolean', group: 1}], fields: [], cShape: true},
    {pattern: /^wait until <(.*)>$/, opcode: 'control_wait_until', inputs: [{name: 'CONDITION', type: 'boolean', group: 1}], fields: []},
    {pattern: /^repeat until <(.*)>$/, opcode: 'control_repeat_until', inputs: [{name: 'CONDITION', type: 'boolean', group: 1}], fields: [], cShape: true},
    {pattern: /^stop \[(.+?) v?\]$/, opcode: 'control_stop', inputs: [], fields: [{name: 'STOP_OPTION', group: 1}], cap: true},
    {pattern: /^create clone of \((.+?) v?\)$/, opcode: 'control_create_clone_of', inputs: [{name: 'CLONE_OPTION', type: 'menu', menuOpcode: 'control_create_clone_of_menu', menuField: 'CLONE_OPTION', group: 1}], fields: []},
    {pattern: /^delete this clone$/, opcode: 'control_delete_this_clone', inputs: [], fields: [], cap: true},

    // --- Sensing ---
    {pattern: /^ask \[(.*?)\] and wait$/, opcode: 'sensing_askandwait', inputs: [{name: 'QUESTION', type: 'string', group: 1}], fields: []},
    {pattern: /^reset timer$/, opcode: 'sensing_resettimer', inputs: [], fields: []},
    {pattern: /^set drag mode \[(.+?)\]$/, opcode: 'sensing_setdragmode', inputs: [], fields: [{name: 'DRAG_MODE', group: 1}]},

    // --- Data ---
    {pattern: /^set \[(.+?) v?\] to \((.+?)\)$/, opcode: 'data_setvariableto', inputs: [{name: 'VALUE', type: 'number', group: 2}], fields: [{name: 'VARIABLE', group: 1}]},
    {pattern: /^change \[(.+?) v?\] by \((.+?)\)$/, opcode: 'data_changevariableby', inputs: [{name: 'VALUE', type: 'number', group: 2}], fields: [{name: 'VARIABLE', group: 1}]},
    {pattern: /^show variable \[(.+?)\]$/, opcode: 'data_showvariable', inputs: [], fields: [{name: 'VARIABLE', group: 1}]},
    {pattern: /^hide variable \[(.+?)\]$/, opcode: 'data_hidevariable', inputs: [], fields: [{name: 'VARIABLE', group: 1}]},
    {pattern: /^add \[(.*?)\] to \[(.+?) v?\]$/, opcode: 'data_addtolist', inputs: [{name: 'ITEM', type: 'string', group: 1}], fields: [{name: 'LIST', group: 2}]},
    {pattern: /^delete \((.+?)\) of \[(.+?) v?\]$/, opcode: 'data_deleteoflist', inputs: [{name: 'INDEX', type: 'number', group: 1}], fields: [{name: 'LIST', group: 2}]},
    {pattern: /^delete all of \[(.+?) v?\]$/, opcode: 'data_deletealloflist', inputs: [], fields: [{name: 'LIST', group: 1}]},
    {pattern: /^insert \[(.*?)\] at \((.+?)\) of \[(.+?) v?\]$/, opcode: 'data_insertatlist', inputs: [{name: 'ITEM', type: 'string', group: 1}, {name: 'INDEX', type: 'number', group: 2}], fields: [{name: 'LIST', group: 3}]},
    {pattern: /^replace item \((.+?)\) of \[(.+?) v?\] with \[(.*?)\]$/, opcode: 'data_replaceitemoflist', inputs: [{name: 'INDEX', type: 'number', group: 1}, {name: 'ITEM', type: 'string', group: 3}], fields: [{name: 'LIST', group: 2}]},

    // --- Pen ---
    {pattern: /^erase all$/, opcode: 'pen_clear', inputs: [], fields: []},
    {pattern: /^stamp$/, opcode: 'pen_stamp', inputs: [], fields: []},
    {pattern: /^pen down$/, opcode: 'pen_penDown', inputs: [], fields: []},
    {pattern: /^pen up$/, opcode: 'pen_penUp', inputs: [], fields: []},
    {pattern: /^set pen color to \[(.+?)\]$/, opcode: 'pen_setPenColorToColor', inputs: [{name: 'COLOR', type: 'color', group: 1}], fields: []},
    {pattern: /^change pen size by \((.+?)\)$/, opcode: 'pen_changePenSizeBy', inputs: [{name: 'SIZE', type: 'number', group: 1}], fields: []},
    {pattern: /^set pen size to \((.+?)\)$/, opcode: 'pen_setPenSizeTo', inputs: [{name: 'SIZE', type: 'number', group: 1}], fields: []},

    // --- Music ---
    {pattern: /^play drum \((.+?)\) for \((.+?)\) beats$/, opcode: 'music_playDrumForBeats', inputs: [{name: 'DRUM', type: 'number', group: 1}, {name: 'BEATS', type: 'number', group: 2}], fields: []},
    {pattern: /^rest for \((.+?)\) beats$/, opcode: 'music_restForBeats', inputs: [{name: 'BEATS', type: 'number', group: 1}], fields: []},
    {pattern: /^play note \((.+?)\) for \((.+?)\) beats$/, opcode: 'music_playNoteForBeats', inputs: [{name: 'NOTE', type: 'number', group: 1}, {name: 'BEATS', type: 'number', group: 2}], fields: []},
    {pattern: /^set instrument to \((.+?)\)$/, opcode: 'music_setInstrument', inputs: [{name: 'INSTRUMENT', type: 'number', group: 1}], fields: []},
    {pattern: /^set tempo to \((.+?)\)$/, opcode: 'music_setTempo', inputs: [{name: 'TEMPO', type: 'number', group: 1}], fields: []},
    {pattern: /^change tempo by \((.+?)\)$/, opcode: 'music_changeTempo', inputs: [{name: 'TEMPO', type: 'number', group: 1}], fields: []},
];

/**
 * Boolean expression patterns (content inside <...>).
 */
const BOOLEAN_DEFS = [
    {pattern: /^touching \((.+?) v\) \?$/, opcode: 'sensing_touchingobject', inputs: [{name: 'TOUCHINGOBJECTMENU', type: 'menu', menuOpcode: 'sensing_touchingobjectmenu', menuField: 'TOUCHINGOBJECTMENU', group: 1}]},
    {pattern: /^touching color \[(.+?)\] \?$/, opcode: 'sensing_touchingcolor', inputs: [{name: 'COLOR', type: 'color', group: 1}]},
    {pattern: /^key \((.+?) v\) pressed\??$/, opcode: 'sensing_keypressed', inputs: [{name: 'KEY_OPTION', type: 'menu', menuOpcode: 'sensing_keyoptions', menuField: 'KEY_OPTION', group: 1}]},
    {pattern: /^mouse down\??$/, opcode: 'sensing_mousedown', inputs: []},
];

/**
 * Menu value mappings: display text → internal value.
 */
const MENU_VALUE_MAP = {
    'edge': '_edge_',
    'mouse-pointer': '_mouse_',
    'myself': '_myself_',
    'random position': '_random_'
};

/**
 * Match a scratchblocks line against the BLOCK_DEFS table.
 * Returns {def, match} or null.
 */
const matchBlockDef = line => {
    for (const def of BLOCK_DEFS) {
        const m = line.match(def.pattern);
        if (m) return {def, match: m};
    }
    return null;
};

/**
 * Match a boolean expression (content of <...>) against BOOLEAN_DEFS.
 */
const matchBooleanDef = expr => {
    for (const def of BOOLEAN_DEFS) {
        const m = expr.match(def.pattern);
        if (m) return {def, match: m};
    }
    return null;
};

/**
 * Create a shadow block (math_number, text, or colour_picker).
 */
const createShadow = (type, value, parentId) => {
    const id = uid();
    const block = {
        id, next: null, parent: parentId,
        inputs: {}, fields: {},
        topLevel: false, shadow: true, x: 0, y: 0
    };
    if (type === 'number') {
        block.opcode = 'math_number';
        block.fields.NUM = {name: 'NUM', value: String(value)};
    } else if (type === 'string') {
        block.opcode = 'text';
        block.fields.TEXT = {name: 'TEXT', value: String(value)};
    } else if (type === 'color') {
        block.opcode = 'colour_picker';
        block.fields.COLOUR = {name: 'COLOUR', value: String(value)};
    }
    return block;
};

/**
 * Create a menu shadow block.
 */
const createMenuShadow = (menuOpcode, menuField, value, parentId) => {
    const id = uid();
    const mappedValue = MENU_VALUE_MAP[value] || value;
    return {
        id, opcode: menuOpcode, next: null, parent: parentId,
        inputs: {},
        fields: {[menuField]: {name: menuField, value: mappedValue}},
        topLevel: false, shadow: true, x: 0, y: 0
    };
};

/**
 * Convert scratchblocks text into a flat array of VM block objects.
 * @param {string} text - Cleaned scratchblocks text.
 * @returns {Array<object>} VM block objects for shareBlocksToTarget.
 */
const scratchblocksToVMBlocks = text => {
    const allBlocks = [];

    // Parse lines with indentation
    const rawLines = text.split('\n').filter(l => l.trim().length > 0);
    const lines = rawLines.map(l => ({
        indent: l.match(/^(\t*)/)[1].length || Math.floor(l.match(/^( *)/)[1].length / 4),
        text: l.trim()
    }));

    // Build block chain using a nesting stack
    // Stack entries: {blockId, substackKey, chain}
    // chain is the array we're appending siblings to
    const nestStack = [];
    let chain = []; // current sibling chain (array of block IDs)

    for (let i = 0; i < lines.length; i++) {
        const {text: lineText} = lines[i];

        // Handle 'end' — close current nesting level
        if (lineText === 'end') {
            if (nestStack.length > 0) {
                const ctx = nestStack.pop();
                // Wire the substack: first block in chain → parent's SUBSTACK input
                if (chain.length > 0) {
                    const parentBlock = allBlocks.find(b => b.id === ctx.blockId);
                    if (parentBlock) {
                        parentBlock.inputs[ctx.substackKey] = {
                            name: ctx.substackKey,
                            block: chain[0],
                            shadow: null
                        };
                    }
                }
                chain = ctx.chain;
            }
            continue;
        }

        // Handle 'else' — switch from SUBSTACK to SUBSTACK2
        if (lineText === 'else') {
            if (nestStack.length > 0) {
                const ctx = nestStack[nestStack.length - 1];
                // Wire SUBSTACK
                const parentBlock = allBlocks.find(b => b.id === ctx.blockId);
                if (parentBlock && chain.length > 0) {
                    parentBlock.inputs[ctx.substackKey] = {
                        name: ctx.substackKey,
                        block: chain[0],
                        shadow: null
                    };
                }
                // Change opcode to if_else if it was if
                if (parentBlock && parentBlock.opcode === 'control_if') {
                    parentBlock.opcode = 'control_if_else';
                }
                // Switch to SUBSTACK2
                ctx.substackKey = 'SUBSTACK2';
                chain = [];
            }
            continue;
        }

        // Match the line against block definitions
        const matched = matchBlockDef(lineText);
        if (!matched) {
            // eslint-disable-next-line no-console
            console.warn(`[scratchblocksToVMBlocks] unrecognized line: "${lineText}"`);
            continue;
        }

        const {def, match} = matched;
        const blockId = uid();
        const block = {
            id: blockId,
            opcode: def.opcode,
            next: null,
            parent: null,
            inputs: {},
            fields: {},
            topLevel: false,
            shadow: false,
            x: 0, y: 0
        };

        // Process inputs
        for (const inputDef of def.inputs) {
            const rawValue = match[inputDef.group];

            if (inputDef.type === 'number') {
                const shadow = createShadow('number', rawValue, blockId);
                allBlocks.push(shadow);
                block.inputs[inputDef.name] = {name: inputDef.name, block: shadow.id, shadow: shadow.id};
            } else if (inputDef.type === 'string') {
                const shadow = createShadow('string', rawValue, blockId);
                allBlocks.push(shadow);
                block.inputs[inputDef.name] = {name: inputDef.name, block: shadow.id, shadow: shadow.id};
            } else if (inputDef.type === 'color') {
                const shadow = createShadow('color', rawValue, blockId);
                allBlocks.push(shadow);
                block.inputs[inputDef.name] = {name: inputDef.name, block: shadow.id, shadow: shadow.id};
            } else if (inputDef.type === 'menu') {
                const menuShadow = createMenuShadow(inputDef.menuOpcode, inputDef.menuField, rawValue, blockId);
                allBlocks.push(menuShadow);
                block.inputs[inputDef.name] = {name: inputDef.name, block: menuShadow.id, shadow: menuShadow.id};
            } else if (inputDef.type === 'boolean') {
                // Parse boolean expression
                const boolResult = matchBooleanDef(rawValue);
                if (boolResult) {
                    const boolId = uid();
                    const boolBlock = {
                        id: boolId,
                        opcode: boolResult.def.opcode,
                        next: null, parent: blockId,
                        inputs: {}, fields: {},
                        topLevel: false, shadow: false, x: 0, y: 0
                    };
                    // Process boolean's own inputs
                    for (const boolInput of (boolResult.def.inputs || [])) {
                        const bVal = boolResult.match[boolInput.group];
                        if (boolInput.type === 'menu') {
                            const ms = createMenuShadow(boolInput.menuOpcode, boolInput.menuField, bVal, boolId);
                            allBlocks.push(ms);
                            boolBlock.inputs[boolInput.name] = {name: boolInput.name, block: ms.id, shadow: ms.id};
                        } else if (boolInput.type === 'color') {
                            const cs = createShadow('color', bVal, boolId);
                            allBlocks.push(cs);
                            boolBlock.inputs[boolInput.name] = {name: boolInput.name, block: cs.id, shadow: cs.id};
                        }
                    }
                    allBlocks.push(boolBlock);
                    block.inputs[inputDef.name] = {name: inputDef.name, block: boolId, shadow: null};
                } else {
                    // Unrecognized boolean — leave empty
                    block.inputs[inputDef.name] = {name: inputDef.name, block: null, shadow: null};
                }
            }
        }

        // Process fields
        for (const fieldDef of def.fields) {
            let value = match[fieldDef.group];
            if (fieldDef.transform === 'upper') {
                value = value.toUpperCase();
            }
            block.fields[fieldDef.name] = {name: fieldDef.name, value};
        }

        // Wire into the chain
        if (chain.length > 0) {
            const prevId = chain[chain.length - 1];
            const prevBlock = allBlocks.find(b => b.id === prevId);
            if (prevBlock) {
                prevBlock.next = blockId;
                block.parent = prevId;
            }
        } else if (nestStack.length > 0) {
            // First block in a substack — parent is the C-block
            block.parent = nestStack[nestStack.length - 1].blockId;
        } else {
            // First block in script — topLevel
            block.topLevel = true;
            block.x = 0;
            block.y = 0;
        }

        allBlocks.push(block);
        chain.push(blockId);

        // If this is a C-shaped block, push onto nesting stack
        if (def.cShape) {
            nestStack.push({blockId, substackKey: 'SUBSTACK', chain});
            chain = [];
        }
    }

    // Close any unclosed nesting (shouldn't happen with validated input, but be safe)
    while (nestStack.length > 0) {
        const ctx = nestStack.pop();
        if (chain.length > 0) {
            const parentBlock = allBlocks.find(b => b.id === ctx.blockId);
            if (parentBlock) {
                parentBlock.inputs[ctx.substackKey] = {
                    name: ctx.substackKey,
                    block: chain[0],
                    shadow: null
                };
            }
        }
        chain = ctx.chain;
    }

    return allBlocks;
};

// Expose for testing (CDP test harness)
if (typeof window !== 'undefined') {
    window.__scratchblocksToVMBlocks = scratchblocksToVMBlocks;
}

export {
    generateCodeSuggestion,
    addBlocksToWorkspace,
    blocksToPreviewText,
    parseGeneratedBlocks,
    buildScratchblocksPrompt,
    validateScratchblocks,
    parseScratchblocksOutput,
    scratchblocksToVMBlocks
};
