#!/usr/bin/env node

/**
 * AI Code Suggestions CDP Test Harness
 *
 * Tests the SB2-based AI code generation pipeline end-to-end using
 * Chrome DevTools Protocol (CDP). Connects to a running Chrome instance
 * with remote debugging enabled.
 *
 * Prerequisites:
 *   1. Start Chrome with remote debugging:
 *      open -a "Google Chrome" --args --remote-debugging-port=9222
 *   2. Start the dev server:
 *      npm start   (in packages/scratch-gui, serves on http://localhost:8601)
 *   3. Navigate to http://localhost:8601 in the debugging Chrome
 *   4. Wait for the AI model to load (sparkle button appears)
 *
 * Usage:
 *   node test/playwright/ai-cdp-test.js "make the cat walk around"
 *   node test/playwright/ai-cdp-test.js --all
 *   node test/playwright/ai-cdp-test.js --interactive
 */

const http = require('http');
const readline = require('readline');

const CDP_PORT = 9222;
const EDITOR_URL = 'http://localhost:8601';

// ─── CDP Connection ──────────────────────────────────────────────────────────

async function getDebugTargets () {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${CDP_PORT}/json`, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse CDP targets: ${e.message}`));
                }
            });
        }).on('error', err => {
            reject(new Error(
                `Cannot connect to Chrome on port ${CDP_PORT}. ` +
                `Start Chrome with: open -a "Google Chrome" --args --remote-debugging-port=${CDP_PORT}\n` +
                `Error: ${err.message}`
            ));
        });
    });
}

async function connectToPage () {
    const targets = await getDebugTargets();
    const page = targets.find(t =>
        t.type === 'page' && (t.url.includes('localhost:8601') || t.url.includes('index.html'))
    );
    if (!page) {
        throw new Error(
            `No Scratch editor page found. Open ${EDITOR_URL} in the debugging Chrome instance.`
        );
    }

    const ws = new (require('ws'))(page.webSocketDebuggerUrl);
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
            if (msg.error) {
                rej(new Error(`CDP error: ${JSON.stringify(msg.error)}`));
            } else {
                res(msg.result);
            }
        }
    });

    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++msgId;
        pending.set(id, {resolve, reject});
        ws.send(JSON.stringify({id, method, params}));
    });

    const evaluate = async (expression) => {
        const result = await send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true
        });
        if (result.exceptionDetails) {
            throw new Error(
                `JS error: ${result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails)}`
            );
        }
        return result.result?.value;
    };

    return {ws, send, evaluate};
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function checkModelReady (cdp) {
    const status = await cdp.evaluate('window.__aiModelStatus');
    if (status !== 'ready') {
        throw new Error(`AI model not ready (status: ${status}). Wait for it to load.`);
    }
    return true;
}

async function getSpriteState (cdp) {
    return cdp.evaluate(`
        (() => {
            const vm = document.querySelector('[class*="stage"]')?.__vue__?.$root?.$children?.[0]?.vm
                || window.vm
                || (window.__vm);
            if (!vm) {
                // Try to get VM from Redux store
                const store = document.querySelector('[class*="gui"]')?.__reactFiber$;
                return {error: 'Could not find VM instance'};
            }
            const target = vm.editingTarget;
            if (!target) return {error: 'No editing target'};
            return {
                name: target.sprite.name,
                x: target.x,
                y: target.y,
                direction: target.direction,
                size: target.size,
                visible: target.visible,
                currentCostume: target.currentCostume,
                blockCount: Object.keys(target.blocks._blocks).length
            };
        })()
    `);
}

async function getVmState (cdp) {
    return cdp.evaluate(`
        (() => {
            const vm = window.vm || window.__vm;
            if (!vm) return {error: 'VM not found on window'};
            const target = vm.editingTarget;
            return {
                targetId: target?.id,
                targetName: target?.sprite?.name,
                blockCount: target ? Object.keys(target.blocks._blocks).length : 0,
                spriteCount: vm.runtime.targets.filter(t => !t.isStage).length,
                modelLoaded: window.__aiModelLoaded === true,
                modelStatus: window.__aiModelStatus
            };
        })()
    `);
}

async function generateCode (cdp, userPrompt) {
    console.log(`\n  Generating code for: "${userPrompt}"`);
    const startTime = Date.now();

    const fullPrompt = buildTestPrompt(userPrompt);
    const response = await cdp.evaluate(`
        (async () => {
            const generate = window.__aiGenerate;
            if (!generate) throw new Error('Model not loaded — __aiGenerate is null');
            return await generate(${JSON.stringify(fullPrompt)});
        })()
    `);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  Generated in ${elapsed}s`);
    console.log(`  Raw response:\n    ${response.replace(/\n/g, '\n    ')}`);
    return response;
}

async function addCodeToSprite (cdp, response) {
    // Extract scripts from the response
    const result = await cdp.evaluate(`
        (async () => {
            const vm = window.vm || window.__vm;
            if (!vm) throw new Error('VM not found');

            const text = ${JSON.stringify(response)};

            // Extract from <code> tags if present
            const codeMatch = text.match(/<code>([\\s\\S]*?)<\\/code>/);
            const codeText = codeMatch ? codeMatch[1].trim() : text.trim();

            // Find the outermost JSON array
            const firstBracket = codeText.indexOf('[');
            const lastBracket = codeText.lastIndexOf(']');
            if (firstBracket === -1 || lastBracket === -1) {
                throw new Error('No valid block data found in response');
            }
            const jsonStr = codeText.slice(firstBracket, lastBracket + 1);
            const scripts = JSON.parse(jsonStr);

            const targetId = vm.editingTarget.id;
            await vm.shareSB2BlocksToTarget(scripts, targetId);
            vm.refreshWorkspace();

            return {
                success: true,
                blockCount: Object.keys(vm.editingTarget.blocks._blocks).length
            };
        })()
    `);

    return result;
}

async function clearBlocks (cdp) {
    return cdp.evaluate(`
        (() => {
            const vm = window.vm || window.__vm;
            if (!vm) return;
            const target = vm.editingTarget;
            if (!target) return;
            const blockIds = Object.keys(target.blocks._blocks);
            blockIds.forEach(id => target.blocks.deleteBlock(id));
            vm.refreshWorkspace();
            return blockIds.length;
        })()
    `);
}

function buildTestPrompt (userPrompt) {
    const sysInstruction = `You generate Scratch code in sb2 json format. Output ONLY a valid JSON array. No markdown, no explanation, no extra text.

Output format: [[x, y, [block, block, ...]], ...]
Each block: ["opcode", arg1, arg2, ...]

Valid opcodes: "forward:", "turnRight:", "turnLeft:", "heading:", "pointTowards:", "gotoX:y:", "gotoSpriteOrMouse:", "glideSecs:toX:y:elapsed:from:", "changeXposBy:", "xpos:", "changeYposBy:", "ypos:", "bounceOffEdge", "say:duration:elapsed:from:", "say:", "show", "hide", "nextCostume", "changeSizeBy:", "setSizeTo:", "changeGraphicEffect:by:", "setGraphicEffect:to:", "filterReset", "playSound:", "doPlaySoundAndWait", "clearPenTrails", "putPenDown", "putPenUp", "penSize:", "whenGreenFlag", "whenKeyPressed", "whenClicked", "whenIReceive", "broadcast:", "doRepeat", "doForever", "doIf", "doIfElse", "stopScripts", "wait:elapsed:from:", "touching:", "mousePressed", "mouseX", "mouseY", "randomFrom:to:", "+", "-", "*", "/", "<", "=", ">", "not", "setVar:to:", "changeVar:by:"`;

    const examples = [
        {user: 'make the sprite bounce around', model: '[[5, 19, [["whenGreenFlag"], ["heading:", ["randomFrom:to:", 0, 360]], ["doForever", [["forward:", 10], ["bounceOffEdge"]]]]]]'},
        {user: 'make the sprite follow the mouse', model: '[[5, 19, [["whenGreenFlag"], ["doForever", [["pointTowards:", "_mouse_"], ["forward:", 5]]]]]]'}
    ];

    let prompt = `<|turn>system\n${sysInstruction}<turn|>\n`;
    for (const ex of examples) {
        prompt += `<|turn>user\n${ex.user}<turn|>\n`;
        prompt += `<|turn>model\n${ex.model}<turn|>\n`;
    }
    prompt += `<|turn>user\n${userPrompt}<turn|>\n`;
    prompt += '<|turn>model\n';
    return prompt;
}

// ─── Test Cases ──────────────────────────────────────────────────────────────

const TEST_CASES = [
    {
        name: 'move forward',
        prompt: 'make the sprite move 100 steps forward when green flag clicked',
        verify: result => result.blockCount > 0
    },
    {
        name: 'bounce around',
        prompt: 'make the sprite bounce around the screen forever',
        verify: result => result.blockCount > 0
    },
    {
        name: 'follow mouse',
        prompt: 'make the sprite follow the mouse pointer',
        verify: result => result.blockCount > 0
    },
    {
        name: 'say hello',
        prompt: 'make the sprite say hello for 2 seconds when clicked',
        verify: result => result.blockCount > 0
    },
    {
        name: 'color effect',
        prompt: 'make the sprite change color effect forever',
        verify: result => result.blockCount > 0
    }
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function runSingleTest (cdp, testCase) {
    const label = testCase.name || testCase.prompt;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST: ${label}`);
    console.log('='.repeat(60));

    // Clear existing blocks
    const cleared = await clearBlocks(cdp);
    console.log(`  Cleared ${cleared} existing blocks`);

    // Generate code
    let response;
    try {
        response = await generateCode(cdp, testCase.prompt);
    } catch (err) {
        console.log(`  FAIL (generation): ${err.message}`);
        return {name: label, status: 'FAIL', error: `Generation: ${err.message}`};
    }

    // Add to sprite
    let result;
    try {
        result = await addCodeToSprite(cdp, response);
        console.log(`  Added blocks: ${result.blockCount} total`);
    } catch (err) {
        console.log(`  FAIL (add to sprite): ${err.message}`);
        return {name: label, status: 'FAIL', error: `Add blocks: ${err.message}`};
    }

    // Verify
    if (testCase.verify) {
        const passed = testCase.verify(result);
        console.log(`  ${passed ? 'PASS' : 'FAIL'}`);
        return {name: label, status: passed ? 'PASS' : 'FAIL'};
    }

    console.log('  PASS (blocks added)');
    return {name: label, status: 'PASS'};
}

async function runAll (cdp) {
    const results = [];
    for (const tc of TEST_CASES) {
        const result = await runSingleTest(cdp, tc);
        results.push(result);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('SUMMARY');
    console.log('='.repeat(60));
    for (const r of results) {
        console.log(`  ${r.status === 'PASS' ? '\u2713' : '\u2717'} ${r.name}${r.error ? ` — ${r.error}` : ''}`);
    }
    const passed = results.filter(r => r.status === 'PASS').length;
    console.log(`\n  ${passed}/${results.length} passed`);
}

async function runInteractive (cdp) {
    const rl = readline.createInterface({input: process.stdin, output: process.stdout});
    const ask = q => new Promise(resolve => rl.question(q, resolve));

    console.log('\nInteractive AI Code Test Mode');
    console.log('Type a prompt, or:');
    console.log('  .state   — show current sprite state');
    console.log('  .vm      — show VM info');
    console.log('  .clear   — clear all blocks');
    console.log('  .quit    — exit\n');

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const input = await ask('prompt> ');
        const trimmed = input.trim();
        if (!trimmed) continue;
        if (trimmed === '.quit' || trimmed === '.exit') break;
        if (trimmed === '.state') {
            console.log(JSON.stringify(await getSpriteState(cdp), null, 2));
            continue;
        }
        if (trimmed === '.vm') {
            console.log(JSON.stringify(await getVmState(cdp), null, 2));
            continue;
        }
        if (trimmed === '.clear') {
            const n = await clearBlocks(cdp);
            console.log(`Cleared ${n} blocks`);
            continue;
        }

        try {
            const response = await generateCode(cdp, trimmed);
            const result = await addCodeToSprite(cdp, response);
            console.log(`  Added to sprite. Block count: ${result.blockCount}`);
        } catch (err) {
            console.log(`  Error: ${err.message}`);
        }
    }

    rl.close();
}

async function main () {
    const args = process.argv.slice(2);

    console.log('Connecting to Chrome via CDP...');
    let cdp;
    try {
        cdp = await connectToPage();
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
    console.log('Connected.');

    try {
        // Check model is ready
        await checkModelReady(cdp);
        console.log('AI model is ready.');

        // Show current state
        const state = await getVmState(cdp);
        console.log(`Target: ${state.targetName}, Blocks: ${state.blockCount}`);

        if (args.includes('--all')) {
            await runAll(cdp);
        } else if (args.includes('--interactive')) {
            await runInteractive(cdp);
        } else if (args.length > 0) {
            const prompt = args.join(' ');
            await runSingleTest(cdp, {prompt, verify: r => r.blockCount > 0});
        } else {
            console.log('\nUsage:');
            console.log('  node ai-cdp-test.js "your prompt here"');
            console.log('  node ai-cdp-test.js --all');
            console.log('  node ai-cdp-test.js --interactive');
        }
    } finally {
        cdp.ws.close();
    }
}

main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
