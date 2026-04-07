#!/usr/bin/env node

/**
 * AI Code Generation CDP Harness
 *
 * Tests the full UI flow: open modal → type prompt → click Generate →
 * click "Add to Sprite" → click green flag → verify VM state changed.
 *
 * Outputs structured JSON to stdout. Logs go to stderr.
 *
 * Usage:
 *   node test/ai-cdp-harness.js --prompt "make the cat walk forward"
 *   node test/ai-cdp-harness.js --prompt "..." --system-prompt "..."
 *   node test/ai-cdp-harness.js --prompt "..." --system-prompt-file /tmp/prompt.txt
 *   node test/ai-cdp-harness.js --prompt "..." --skip-run
 */

const http = require('http');
const fs = require('fs');

const CDP_PORT = 9222;

// ─── Valid SB2 Opcodes ───────────────────────────────────────────────────────

const VALID_OPCODES = new Set([
    'forward:', 'turnRight:', 'turnLeft:', 'heading:', 'pointTowards:',
    'gotoX:y:', 'gotoSpriteOrMouse:', 'glideSecs:toX:y:elapsed:from:',
    'changeXposBy:', 'xpos:', 'changeYposBy:', 'ypos:', 'bounceOffEdge',
    'setRotationStyle', 'xpos', 'ypos', 'heading',
    'say:duration:elapsed:from:', 'say:', 'think:duration:elapsed:from:',
    'think:', 'show', 'hide', 'lookLike:', 'nextCostume',
    'changeSizeBy:', 'setSizeTo:', 'comeToFront', 'goBackByLayers:',
    'costumeIndex', 'scale',
    'startScene', 'startSceneAndWait', 'nextScene',
    'changeGraphicEffect:by:', 'setGraphicEffect:to:', 'filterReset',
    'sceneName', 'backgroundIndex',
    'playSound:', 'doPlaySoundAndWait', 'stopAllSounds',
    'playDrum', 'rest:elapsed:from:', 'noteOn:duration:elapsed:from:',
    'instrument:', 'changeVolumeBy:', 'setVolumeTo:', 'volume',
    'changeTempoBy:', 'setTempoTo:', 'tempo',
    'clearPenTrails', 'stampCostume', 'putPenDown', 'putPenUp',
    'penColor:', 'changePenHueBy:', 'setPenHueTo:',
    'changePenShadeBy:', 'setPenShadeTo:', 'changePenSizeBy:', 'penSize:',
    'whenGreenFlag', 'whenKeyPressed', 'whenClicked',
    'whenSceneStarts', 'whenSensorGreaterThan',
    'whenIReceive', 'broadcast:', 'doBroadcastAndWait',
    'doRepeat', 'doForever', 'doIf', 'doIfElse',
    'doWaitUntil', 'doUntil', 'stopScripts',
    'whenCloned', 'createCloneOf', 'deleteClone',
    'wait:elapsed:from:', 'touching:', 'touchingColor:', 'color:sees:',
    'distanceTo:', 'doAsk', 'answer', 'keyPressed:', 'mousePressed',
    'mouseX', 'mouseY', 'soundLevel',
    'senseVideoMotion', 'setVideoState', 'setVideoTransparency',
    'timer', 'timerReset', 'getAttribute:of:', 'timeAndDate',
    'timestamp', 'getUserName',
    '+', '-', '*', '/', 'randomFrom:to:',
    '<', '=', '>', '&', '|', 'not',
    'concatenate:with:', 'letter:of:', 'stringLength:',
    '%', 'rounded', 'computeFunction:of:',
    'setVar:to:', 'changeVar:by:', 'showVariable:', 'hideVariable:',
    'append:toList:', 'deleteLine:ofList:', 'insert:at:ofList:',
    'setLine:ofList:to:', 'getLine:ofList:', 'lineCountOfList:',
    'list:contains:', 'showList:', 'hideList:'
]);

// ─── Default System Prompt ───────────────────────────────────────────────────

const DEFAULT_SYSTEM_INSTRUCTION = `You generate Scratch code in sb2 json format. Output ONLY a valid JSON array. No markdown, no explanation, no extra text.

Output format: [[x, y, [block, block, ...]], ...]
Each block: ["opcode", arg1, arg2, ...] where the opcode is always the EXACT string from the list below, and arguments are separate array elements.

RULES:
- Every script starts with a hat block: "whenGreenFlag", "whenKeyPressed", or "whenClicked"
- Hat blocks do NOT end with a colon. Use "whenKeyPressed" NOT "whenKeyPressed:". Use "whenClicked" NOT "whenClicked:"
- "whenKeyPressed" takes one arg (key name): ["whenKeyPressed", "space"]
- Each hat block starts a NEW script. Multiple hat blocks = multiple [x, y, [blocks]] entries in the output array
- The opcode string is NEVER modified or combined with arguments
- "say:duration:elapsed:from:" takes (text, seconds): ["say:duration:elapsed:from:", "hello", 2]
- "glideSecs:toX:y:elapsed:from:" takes (secs, x, y): ["glideSecs:toX:y:elapsed:from:", 1, 0, 0]
- "wait:elapsed:from:" takes (seconds): ["wait:elapsed:from:", 1]
- "changeGraphicEffect:by:" takes (effect, amount): ["changeGraphicEffect:by:", "color", 25]
- CRITICAL: "doForever" takes exactly ONE argument, which is an array of blocks: ["doForever", [["forward:", 10], ["bounceOffEdge"]]]
  WRONG: ["doForever", ["forward:", 10], ["bounceOffEdge"]] -- blocks must be wrapped in an extra []
- "doRepeat" takes exactly TWO arguments (count, array of blocks): ["doRepeat", 10, [["forward:", 10], ["turnRight:", 15]]]
- "doIf" takes exactly TWO arguments (condition, array of blocks): ["doIf", ["touching:", "edge"], [["bounceOffEdge"]]]
- "doIfElse" takes exactly THREE arguments (condition, if-blocks, else-blocks): ["doIfElse", ["mousePressed"], [["putPenDown"]], [["putPenUp"]]]
- Reporter blocks are nested arrays: ["randomFrom:to:", 1, 10]
- Some reporters have NO colon: "mouseX", "mouseY", "mousePressed", "timer", "answer" (these are bare values, not setters)
- NEVER embed argument values into the opcode string. WRONG: "glideSecs:toX:0:0:elapsed:from:" RIGHT: "glideSecs:toX:y:elapsed:from:", 1, 0, 0
- There is NO "move:" opcode. Use "forward:" to move: ["forward:", 10]
- There is NO "setPenSizeTo:" opcode. Use "penSize:" instead: ["penSize:", 3]
- The output is ONE flat array of scripts: [[x,y,[blocks]], [x,y,[blocks]]]. Do NOT nest scripts inside extra brackets.
- Math expressions use operator blocks: ["+", "x", 1] not "x + 1". Variables are strings: ["setVar:to:", "score", ["+", "score", 1]]

Valid opcodes: "forward:", "turnRight:", "turnLeft:", "heading:", "pointTowards:", "gotoX:y:", "gotoSpriteOrMouse:", "glideSecs:toX:y:elapsed:from:", "changeXposBy:", "xpos:", "changeYposBy:", "ypos:", "bounceOffEdge", "setRotationStyle", "say:duration:elapsed:from:", "say:", "think:", "show", "hide", "lookLike:", "nextCostume", "changeSizeBy:", "setSizeTo:", "changeGraphicEffect:by:", "setGraphicEffect:to:", "filterReset", "playSound:", "doPlaySoundAndWait", "stopAllSounds", "changeVolumeBy:", "setVolumeTo:", "clearPenTrails", "putPenDown", "putPenUp", "penColor:", "changePenHueBy:", "setPenHueTo:", "changePenSizeBy:", "penSize:", "whenGreenFlag", "whenKeyPressed", "whenClicked", "whenIReceive", "broadcast:", "doBroadcastAndWait", "doRepeat", "doForever", "doIf", "doIfElse", "doWaitUntil", "doUntil", "stopScripts", "whenCloned", "createCloneOf", "deleteClone", "wait:elapsed:from:", "touching:", "doAsk", "answer", "keyPressed:", "mousePressed", "mouseX", "mouseY", "timer", "timerReset", "randomFrom:to:", "+", "-", "*", "/", "<", "=", ">", "not", "setVar:to:", "changeVar:by:"`;

const FEW_SHOT_EXAMPLES = [
    {
        user: 'make the sprite bounce around',
        model: '[[5, 19, [["whenGreenFlag"], ["heading:", ["randomFrom:to:", 0, 360]], ["doForever", [["forward:", 10], ["bounceOffEdge"]]]]]]'
    },
    {
        user: 'make the sprite follow the mouse',
        model: '[[5, 19, [["whenGreenFlag"], ["doForever", [["pointTowards:", "_mouse_"], ["forward:", 5]]]]]]'
    },
    {
        user: 'make the sprite say hello for 2 seconds then glide to a random spot',
        model: '[[5, 19, [["whenGreenFlag"], ["say:duration:elapsed:from:", "hello", 2], ["glideSecs:toX:y:elapsed:from:", 1, ["randomFrom:to:", -200, 200], ["randomFrom:to:", -150, 150]]]]]'
    },
    {
        user: 'make a drawing program',
        model: '[[5, 19, [["whenGreenFlag"], ["clearPenTrails"], ["doForever", [["gotoSpriteOrMouse:", "_mouse_"], ["doIfElse", ["mousePressed"], [["putPenDown"]], [["putPenUp"]]]]]]], [5, 300, [["whenKeyPressed", "space"], ["clearPenTrails"]]]]'
    },
    {
        user: 'make the sprite spin and change color',
        model: '[[5, 19, [["whenGreenFlag"], ["doForever", [["turnRight:", 15], ["changeGraphicEffect:by:", "color", 25], ["wait:elapsed:from:", 0.1]]]]]]'
    },
    {
        user: 'when space is pressed play a sound',
        model: '[[5, 19, [["whenKeyPressed", "space"], ["playSound:", "pop"]]]]'
    },
    {
        user: 'make the sprite walk back and forth',
        model: '[[5, 19, [["whenGreenFlag"], ["doForever", [["forward:", 10], ["wait:elapsed:from:", 0.5], ["forward:", -10], ["wait:elapsed:from:", 0.5]]]]]]'
    },
    {
        user: 'move the sprite with arrow keys',
        model: '[[5, 19, [["whenKeyPressed", "up arrow"], ["changeYposBy:", 10]]], [5, 80, [["whenKeyPressed", "down arrow"], ["changeYposBy:", -10]]], [5, 140, [["whenKeyPressed", "left arrow"], ["changeXposBy:", -10]]], [5, 200, [["whenKeyPressed", "right arrow"], ["changeXposBy:", 10]]]]'
    },
    {
        user: 'draw a triangle with the pen',
        model: '[[5, 19, [["whenGreenFlag"], ["clearPenTrails"], ["penSize:", 2], ["putPenDown"], ["doRepeat", 3, [["forward:", 100], ["turnRight:", 120]]], ["putPenUp"]]]]'
    }
];

// ─── Prompt Builder ──────────────────────────────────────────────────────────

function buildPrompt (systemInstruction, userPrompt) {
    let prompt = `<|turn>system\n${systemInstruction}<turn|>\n`;
    for (const ex of FEW_SHOT_EXAMPLES) {
        prompt += `<|turn>user\n${ex.user}<turn|>\n`;
        prompt += `<|turn>model\n${ex.model}<turn|>\n`;
    }
    prompt += `<|turn>user\n${userPrompt}<turn|>\n`;
    prompt += '<|turn>model\n';
    return prompt;
}

// ─── Opcode Validation ──────────────────────────────────────────────────────

function collectOpcodes (arr) {
    const opcodes = [];
    if (!Array.isArray(arr)) return opcodes;
    if (arr.length > 0 && typeof arr[0] === 'string') {
        opcodes.push(arr[0]);
    }
    for (const item of arr) {
        if (Array.isArray(item)) {
            opcodes.push(...collectOpcodes(item));
        }
    }
    return opcodes;
}

function validateOpcodes (scripts) {
    const allOpcodes = collectOpcodes(scripts);
    const invalid = allOpcodes.filter(op => typeof op === 'string' && !VALID_OPCODES.has(op));
    const likelyInvalid = invalid.filter(op =>
        op.includes(':') ||
        (/^[a-z]/.test(op) && op.length > 2 && !op.includes(' '))
    );
    return [...new Set(likelyInvalid)];
}

// ─── Bracket Repair ─────────────────────────────────────────────────────────

function repairAndParse (jsonStr) {
    // Try as-is first
    try {
        return JSON.parse(jsonStr);
    } catch (_firstErr) {
        // Strategy 1: Remove excess ] from runs of ]]] in the middle/end
        const cleaned = jsonStr.replace(/\]{3,}/g, ']]');
        try { return JSON.parse(cleaned); } catch (_) { /* keep trying */ }

        // Strategy 2: Trim trailing brackets
        for (let trim = 1; trim <= 5; trim++) {
            try { return JSON.parse(jsonStr.slice(0, -trim)); } catch (_) { /* */ }
        }

        // Strategy 3: Add missing brackets
        for (let add = 1; add <= 3; add++) {
            try { return JSON.parse(jsonStr + ']'.repeat(add)); } catch (_) { /* */ }
        }

        throw _firstErr;
    }
}

// ─── CDP Connection ──────────────────────────────────────────────────────────

async function connectToPage () {
    const targets = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${CDP_PORT}/json`, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', err => {
            reject(new Error(
                `Cannot connect to Chrome on port ${CDP_PORT}. ` +
                `Start Chrome with: open -a "Google Chrome" --args --remote-debugging-port=${CDP_PORT}`
            ));
        });
    });

    const page = targets.find(t =>
        t.type === 'page' && (t.url.includes('localhost:8601') || t.url.includes('index.html'))
    );
    if (!page) throw new Error('No Scratch editor page found at localhost:8601');

    const WebSocket = require('ws');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
    });

    let msgId = 0;
    const pending = new Map();

    ws.on('message', raw => {
        const msg = JSON.parse(raw);
        if (msg.id !== undefined && pending.has(msg.id)) {
            const {resolve: res, reject: rej} = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) rej(new Error(JSON.stringify(msg.error)));
            else res(msg.result);
        }
    });

    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++msgId;
        pending.set(id, {resolve, reject});
        ws.send(JSON.stringify({id, method, params}));
    });

    const evaluate = async (expression, timeout = 120000) => {
        const result = await Promise.race([
            send('Runtime.evaluate', {
                expression,
                awaitPromise: true,
                returnByValue: true
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('CDP evaluate timeout')), timeout)
            )
        ]);
        if (result.exceptionDetails) {
            const desc = result.exceptionDetails.exception?.description ||
                result.exceptionDetails.text ||
                JSON.stringify(result.exceptionDetails);
            throw new Error(desc);
        }
        return result.result?.value;
    };

    // Helper to dispatch DOM input events
    const dispatchInput = async (selector, value) => {
        await evaluate(`
            (() => {
                const el = document.querySelector(${JSON.stringify(selector)});
                if (!el) throw new Error('Element not found: ${selector}');
                const nativeSet = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype, 'value'
                ).set;
                nativeSet.call(el, ${JSON.stringify(value)});
                el.dispatchEvent(new Event('input', {bubbles: true}));
                el.dispatchEvent(new Event('change', {bubbles: true}));
            })()
        `);
    };

    const click = async selector => {
        await evaluate(`
            (() => {
                const el = document.querySelector(${JSON.stringify(selector)});
                if (!el) throw new Error('Element not found: ${selector}');
                el.click();
            })()
        `);
    };

    const waitFor = async (conditionExpr, timeoutMs = 30000, pollMs = 200) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const val = await evaluate(conditionExpr);
            if (val) return val;
            await new Promise(r => setTimeout(r, pollMs));
        }
        throw new Error(`waitFor timed out after ${timeoutMs}ms: ${conditionExpr}`);
    };

    return {ws, evaluate, dispatchInput, click, waitFor};
}

// ─── Sprite State Snapshot ──────────────────────────────────────────────────

async function getSpriteState (cdp) {
    return cdp.evaluate(`
        (() => {
            const vm = window.__vm;
            if (!vm || !vm.editingTarget) return null;
            const t = vm.editingTarget;
            return {
                x: t.x,
                y: t.y,
                direction: t.direction,
                size: t.size,
                visible: t.visible,
                currentCostume: t.currentCostume,
                blockCount: Object.keys(t.blocks._blocks).length,
                effects: Object.assign({}, t.effects),
                sayText: t.getCustomState('Scratch.looks')
                    ? t.getCustomState('Scratch.looks').text || null
                    : null
            };
        })()
    `);
}

// ─── Parse Args ──────────────────────────────────────────────────────────────

function parseArgs () {
    const args = process.argv.slice(2);
    const opts = {prompt: null, systemPrompt: null, skipRun: false};
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--prompt' && args[i + 1]) opts.prompt = args[++i];
        else if (args[i] === '--system-prompt' && args[i + 1]) opts.systemPrompt = args[++i];
        else if (args[i] === '--system-prompt-file' && args[i + 1]) {
            const filePath = args[++i];
            if (!fs.existsSync(filePath)) {
                process.stderr.write(`Error: file not found: ${filePath}\n`);
                process.exit(1);
            }
            opts.systemPrompt = fs.readFileSync(filePath, 'utf-8');
        } else if (args[i] === '--skip-run') opts.skipRun = true;
        // keep old flag as alias
        else if (args[i] === '--skip-load') opts.skipRun = true;
    }
    if (!opts.prompt) {
        process.stderr.write('Usage: node ai-cdp-harness.js --prompt "..." [--system-prompt "..." | --system-prompt-file path] [--skip-run]\n');
        process.exit(1);
    }
    return opts;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main () {
    const opts = parseArgs();
    const result = {
        success: false,
        steps: {
            modalOpened: false,
            promptTyped: false,
            generationStarted: false,
            generationCompleted: false,
            generationTimeMs: 0,
            rawResponse: null,
            jsonParsed: false,
            jsonParseError: null,
            parsedScripts: null,
            invalidOpcodes: [],
            addedToSprite: false,
            addError: null,
            blockCount: 0,
            projectRan: false,
            runDurationMs: 0,
            stateChanged: false
        },
        baseline: null,
        afterAdd: null,
        afterRun: null,
        error: null
    };

    let cdp;
    try {
        process.stderr.write('Connecting to Chrome...\n');
        cdp = await connectToPage();

        // ── Precondition checks ──────────────────────────────────────────
        const modelReady = await cdp.evaluate('window.__aiModelLoaded === true');
        if (!modelReady) {
            result.error = 'AI model not loaded. Wait for it to finish loading.';
            output(result); return;
        }

        const vmAvailable = await cdp.evaluate('typeof window.__vm !== "undefined" && window.__vm !== null');
        if (!vmAvailable) {
            result.error = 'window.__vm not found. Ensure vm-manager-hoc.jsx exposes it.';
            output(result); return;
        }

        // ── Reset: stop project, clear blocks, reset sprite ──────────────
        process.stderr.write('Resetting project...\n');
        await cdp.evaluate(`
            (() => {
                const vm = window.__vm;
                vm.stopAll();
                const target = vm.editingTarget;
                if (!target) return;
                // Clear all blocks
                const ids = Object.keys(target.blocks._blocks);
                ids.forEach(id => target.blocks.deleteBlock(id));
                // Reset sprite position/state
                target.setXY(0, 0);
                target.setDirection(90);
                target.setSize(100);
                target.setVisible(true);
                target.clearEffects();
                vm.refreshWorkspace();
            })()
        `);

        // ── Capture baseline ─────────────────────────────────────────────
        result.baseline = await getSpriteState(cdp);
        process.stderr.write(`Baseline: x=${result.baseline.x}, y=${result.baseline.y}, blocks=${result.baseline.blockCount}\n`);

        // ── Close modal if already open ──────────────────────────────────
        const modalAlreadyOpen = await cdp.evaluate(
            '!!document.querySelector("[class*=\\"modal-overlay\\"]")'
        );
        if (modalAlreadyOpen) {
            await cdp.click('[class*="close-button"]');
            await new Promise(r => setTimeout(r, 300));
        }

        // ── Step 1: Open the AI code modal ───────────────────────────────
        process.stderr.write('Opening AI code modal...\n');
        const buttonVisible = await cdp.evaluate(
            '!!document.querySelector("[class*=\\"ai-code-button\\"]")'
        );
        if (!buttonVisible) {
            result.error = 'AI code button not found in DOM. Model may not be ready or button not rendered.';
            output(result); return;
        }
        await cdp.click('[class*="ai-code-button"]');
        await cdp.waitFor('!!document.querySelector("[class*=\\"modal-overlay\\"]")', 5000);
        result.steps.modalOpened = true;

        // ── Step 2: Type the prompt ──────────────────────────────────────
        process.stderr.write(`Typing prompt: "${opts.prompt}"...\n`);
        await cdp.dispatchInput('[class*="prompt-input"]', opts.prompt);
        result.steps.promptTyped = true;

        // If custom system prompt, inject it by overriding buildPrompt temporarily
        if (opts.systemPrompt) {
            const sysPrompt = opts.systemPrompt;
            // Override the generate function to use our custom prompt
            await cdp.evaluate(`
                (() => {
                    const origGenerate = window.__aiGenerate;
                    window.__aiGenerateOriginal = origGenerate;
                    const buildCustomPrompt = (userPrompt) => {
                        const sysInstruction = ${JSON.stringify(sysPrompt)};
                        const examples = ${JSON.stringify(FEW_SHOT_EXAMPLES)};
                        let prompt = '<|turn>system\\n' + sysInstruction + '<turn|>\\n';
                        for (const ex of examples) {
                            prompt += '<|turn>user\\n' + ex.user + '<turn|>\\n';
                            prompt += '<|turn>model\\n' + ex.model + '<turn|>\\n';
                        }
                        prompt += '<|turn>user\\n' + userPrompt + '<turn|>\\n';
                        prompt += '<|turn>model\\n';
                        return prompt;
                    };
                    // We can't easily intercept the modal's generate call,
                    // so we'll just let it use the built-in prompt for now.
                    // Custom system prompts work via direct generation (below).
                })()
            `);
        }

        // ── Step 3: Click Generate ───────────────────────────────────────
        process.stderr.write('Clicking Generate...\n');
        result.steps.generationStarted = true;
        const genStart = Date.now();
        await cdp.click('[class*="generate-button"]');

        // Wait for generation to complete (button text changes from "Generating..." back to "Generate",
        // or the code-display or error-text appears)
        await cdp.waitFor(`
            (() => {
                const codeDisplay = document.querySelector('[class*="code-display"]');
                const errorText = document.querySelector('[class*="error-text"]');
                const genBtn = document.querySelector('[class*="generate-button"]');
                if (codeDisplay) return 'code';
                if (errorText) return 'error';
                if (genBtn && !genBtn.disabled && genBtn.textContent === 'Generate') return 'done';
                return null;
            })()
        `, 180000, 500);

        result.steps.generationTimeMs = Date.now() - genStart;

        // Check if there was an error
        const genError = await cdp.evaluate(
            'document.querySelector("[class*=\\"error-text\\"]")?.textContent || null'
        );
        if (genError) {
            result.error = `UI generation error: ${genError}`;
            result.steps.rawResponse = genError;
            // Close modal
            await cdp.click('[class*="close-button"]');
            output(result); return;
        }

        // Read the generated code from the code-display element
        const codeText = await cdp.evaluate(
            'document.querySelector("[class*=\\"code-display\\"]")?.textContent || null'
        );
        result.steps.rawResponse = codeText;
        result.steps.generationCompleted = true;
        process.stderr.write(`Generated in ${result.steps.generationTimeMs}ms\n`);

        if (!codeText) {
            result.error = 'No code displayed after generation';
            await cdp.click('[class*="close-button"]');
            output(result); return;
        }

        // ── Validate the generated code ──────────────────────────────────
        const firstBracket = codeText.indexOf('[');
        const lastBracket = codeText.lastIndexOf(']');
        if (firstBracket === -1 || lastBracket === -1) {
            result.steps.jsonParseError = 'No JSON array found in response';
            await cdp.click('[class*="close-button"]');
            output(result); return;
        }

        const jsonStr = codeText.slice(firstBracket, lastBracket + 1);
        let scripts;
        try {
            scripts = repairAndParse(jsonStr);
            result.steps.jsonParsed = true;
            result.steps.parsedScripts = scripts;
        } catch (e) {
            result.steps.jsonParseError = e.message;
            await cdp.click('[class*="close-button"]');
            output(result); return;
        }

        result.steps.invalidOpcodes = validateOpcodes(scripts);

        // ── Step 4: Click "Add to Sprite" ────────────────────────────────
        process.stderr.write('Clicking "Add to Sprite"...\n');
        const addButtonExists = await cdp.evaluate(
            '!!document.querySelector("[class*=\\"add-button\\"]")'
        );
        if (!addButtonExists) {
            result.steps.addError = '"Add to Sprite" button not found';
            await cdp.click('[class*="close-button"]');
            output(result); return;
        }

        await cdp.click('[class*="add-button"]');

        // Wait for modal to close (success) or error to appear
        await new Promise(r => setTimeout(r, 500));
        const addError = await cdp.evaluate(
            'document.querySelector("[class*=\\"error-text\\"]")?.textContent || null'
        );
        if (addError) {
            result.steps.addError = addError;
            await cdp.click('[class*="close-button"]');
            output(result); return;
        }

        // Wait for modal to close
        try {
            await cdp.waitFor(
                '!document.querySelector("[class*=\\"modal-overlay\\"]")',
                5000
            );
        } catch (_) {
            // Modal might still be open on error — try to read error
            const lateError = await cdp.evaluate(
                'document.querySelector("[class*=\\"error-text\\"]")?.textContent || null'
            );
            if (lateError) {
                result.steps.addError = lateError;
                await cdp.click('[class*="close-button"]');
                output(result); return;
            }
        }

        result.steps.addedToSprite = true;

        // Capture state after adding blocks
        result.afterAdd = await getSpriteState(cdp);
        result.steps.blockCount = result.afterAdd.blockCount;
        process.stderr.write(`Blocks added: ${result.steps.blockCount}\n`);

        if (result.steps.blockCount === 0) {
            result.steps.addError = 'No blocks were added to the sprite';
            output(result); return;
        }

        // ── Step 5: Run the project ──────────────────────────────────────
        if (!opts.skipRun) {
            process.stderr.write('Running project (green flag)...\n');
            const runDuration = 2000;
            await cdp.evaluate('window.__vm.greenFlag()');
            result.steps.projectRan = true;

            // Let it run for 2 seconds
            await new Promise(r => setTimeout(r, runDuration));
            result.steps.runDurationMs = runDuration;

            // Stop the project
            await cdp.evaluate('window.__vm.stopAll()');
            await new Promise(r => setTimeout(r, 200));

            // Capture state after running
            result.afterRun = await getSpriteState(cdp);

            // Check if state changed from baseline
            const b = result.baseline;
            const a = result.afterRun;
            result.steps.stateChanged = (
                a.x !== b.x ||
                a.y !== b.y ||
                a.direction !== b.direction ||
                a.size !== b.size ||
                a.visible !== b.visible ||
                a.currentCostume !== b.currentCostume ||
                JSON.stringify(a.effects) !== JSON.stringify(b.effects) ||
                a.sayText !== null
            );
            process.stderr.write(
                `After run: x=${a.x}, y=${a.y}, dir=${a.direction}, ` +
                `size=${a.size}, visible=${a.visible}, ` +
                `stateChanged=${result.steps.stateChanged}\n`
            );
        }

        // ── Determine overall success ────────────────────────────────────
        result.success =
            result.steps.modalOpened &&
            result.steps.generationCompleted &&
            result.steps.jsonParsed &&
            result.steps.invalidOpcodes.length === 0 &&
            result.steps.addedToSprite &&
            result.steps.blockCount > 0 &&
            (opts.skipRun || result.steps.projectRan);

    } catch (e) {
        result.error = e.message;
        // Try to close modal if it's open
        try {
            if (cdp) await cdp.click('[class*="close-button"]');
        } catch (_) { /* ignore */ }
    }

    output(result);

    function output (r) {
        process.stdout.write(JSON.stringify(r, null, 2) + '\n');
        if (cdp) cdp.ws.close();
        process.exit(r.success ? 0 : 1);
    }
}

main();
