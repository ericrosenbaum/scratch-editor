import {isLoaded, getLlmInference, generate, showLoadModal} from './ai-model-manager';
import {setGenerating, setResult, setError} from '../reducers/ai-code-suggestions';

// eslint-disable-next-line no-undef
const {buildPrompt: buildPromptTemplate} = require('./ai-prompt-template');

// Cloud AI endpoint (Vercel proxy for Claude API)
const CLOUD_ENDPOINT = 'https://scratch-ai-proxy.vercel.app/api/generate';

const cloudGenerate = async prompt => {
    const res = await fetch(CLOUD_ENDPOINT, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({prompt})
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Cloud AI error (${res.status})`);
    }
    const data = await res.json();
    return data.text;
};

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
 * Main entry point: generate a code suggestion.
 */
const generateCodeSuggestion = async (vm, userPrompt, dispatch, mode = 'device') => {
    const target = vm.editingTarget;
    if (!target) {
        dispatch(setError('No sprite or stage selected'));
        return;
    }

    const targetName = target.getName();
    const isStage = target.isStage;

    let generateFn;
    if (mode === 'cloud') {
        generateFn = cloudGenerate;
    } else {
        generateFn = await resolveGenerateFn(vm);
        if (!generateFn) return; // user cancelled model load
    }

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

        if (parsed.text.trim().length === 0) {
            dispatch(setError('The AI returned an empty response. Please try rephrasing your request.'));
            return;
        }

        const blocks = scratchblocksToVMBlocks(parsed.text);

        if (blocks.filter(b => !b.shadow).length === 0) {
            dispatch(setError(
                'Could not convert the AI output into blocks. ' +
                (parsed.validation.warnings.length > 0
                    ? `Unrecognized: ${parsed.validation.warnings[0]}`
                    : 'Please try rephrasing your request.')
            ));
            return;
        }

        dispatch(setResult(blocks, parsed.text));
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
// Scratchblocks prompt, parsing, and conversion
// ==========================================

/**
 * Build a compact prompt asking the model to generate scratchblocks text.
 * ~400-500 tokens vs ~2600 for the old JSON prompt.
 */
const buildScratchblocksPrompt = (userPrompt, blocksText, targetName, isStage) => {
    const entity = isStage ? 'the Stage' : `sprite "${targetName}"`;
    return buildPromptTemplate(userPrompt, blocksText, entity);
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
    /^change size by \(.+\) ?%?$/, /^set size to \(.+\) ?%?$/,
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

        // 3. Normalize model hallucinations / common mistakes
        // "change angle by (15) degrees" → "turn right (15) degrees"
        line = line.replace(/^(\s*)change angle by (\(.+?\)) degrees$/, '$1turn right $2 degrees');
        // "broadcast go" → "broadcast (go v)" (missing parens)
        line = line.replace(/^(\s*)broadcast (?!\()(\S+)$/, '$1broadcast ($2 v)');
        // "broadcast go and wait" → "broadcast (go v) and wait"
        line = line.replace(/^(\s*)broadcast (?!\()(\S+) and wait$/, '$1broadcast ($2 v) and wait');
        // "when I receive go" → "when I receive [go v]" (missing brackets)
        line = line.replace(/^(\s*)when I receive (?!\[)(\S+)$/, '$1when I receive [$2 v]');
        // "when space key pressed" → "when [space v] key pressed" (missing brackets)
        line = line.replace(/^(\s*)when (?!\[)(\S+) key pressed$/, '$1when [$2 v] key pressed');
        // "play sound (pop v)" → "start sound (pop v)" (missing "until done" or "start")
        line = line.replace(/^(\s*)play sound (\(.+? v?\))$/,
            '$1start sound $2');

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

    // Strip echoed prompt fragments (model sometimes echoes "code" or "scratchblocks")
    text = text.replace(/^(?:code|scratchblocks)\s*\n/, '');

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
// Scratchblocks → VM Blocks converter
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
    buildScratchblocksPrompt,
    validateScratchblocks,
    parseScratchblocksOutput,
    scratchblocksToVMBlocks
};
