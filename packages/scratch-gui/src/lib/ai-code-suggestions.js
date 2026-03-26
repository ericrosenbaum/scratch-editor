import {isLoaded, getLlmInference, generate, showLoadModal} from './ai-model-manager';
import {setGenerating, setResult, setError} from '../reducers/ai-code-suggestions';

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

OUTPUT FORMAT: A JSON array of block objects. Output ONLY valid JSON, no other text.

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

Common opcodes: event_whenflagclicked, event_whenkeypressed, control_forever, control_repeat, control_if, control_if_else, control_wait, motion_movesteps, motion_turnright, motion_turnleft, motion_gotoxy, motion_glidesecstoxy, motion_pointindirection, motion_changexby, motion_changeyby, motion_setx, motion_sety, motion_ifonedgebounce, looks_say, looks_sayforsecs, looks_think, looks_switchcostumeto, looks_nextcostume, looks_changesizeby, looks_setsizeto, looks_show, looks_hide, looks_changeeffectby, sound_play, sound_playuntildone, sensing_touchingobject, sensing_keypressed, sensing_mousedown, sensing_askandwait, operator_add, operator_subtract, operator_multiply, operator_random, operator_gt, operator_lt, operator_equals, operator_and, operator_or, operator_not, data_setvariableto, data_changevariableby, math_number, text

CURRENT CODE FOR ${entity}:
${blocksText}

USER REQUEST: ${userPrompt}`;
};

/**
 * Parse the model's JSON output into an array of block objects.
 * Attempts to extract JSON from the response even if there's surrounding text.
 */
const parseGeneratedBlocks = modelOutput => {
    // Try to find a JSON array in the output
    let jsonStr = modelOutput.trim();

    // If the output contains markdown code fences, extract the content
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
        jsonStr = fenceMatch[1].trim();
    }

    // Try to find array brackets
    const startIdx = jsonStr.indexOf('[');
    const endIdx = jsonStr.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        jsonStr = jsonStr.substring(startIdx, endIdx + 1);
    }

    const blocks = JSON.parse(jsonStr);

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

    return blocks;
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
        const prompt = buildPrompt(userPrompt, blocksText, targetName, isStage);

        // eslint-disable-next-line no-console
        console.log('[ai-code-suggestions] prompt:\n', prompt);

        const modelOutput = await generateFn(prompt);

        // eslint-disable-next-line no-console
        console.log('[ai-code-suggestions] raw output:\n', modelOutput);

        const blocks = parseGeneratedBlocks(modelOutput);
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

export {
    generateCodeSuggestion,
    addBlocksToWorkspace,
    blocksToPreviewText,
    parseGeneratedBlocks
};
