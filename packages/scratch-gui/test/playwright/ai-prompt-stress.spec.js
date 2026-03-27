// @ts-check
/**
 * Iterative stress test for AI code suggestions.
 *
 * For each prompt in a curated set, this test:
 *   1. Generates blocks via the real Gemma 3n model
 *   2. Validates the parsed block structure (no console errors)
 *   3. Adds blocks to the project
 *   4. Presses the green flag
 *   5. Checks that the VM state changed in a way consistent with working code
 *
 * Results are collected into a summary table printed at the end.
 *
 * PREREQUISITES: same as ai-gemma-e2e.spec.js
 *   1. Model at /tmp/gemma-model.bin
 *   2. npm install @mediapipe/tasks-genai@0.10.26
 *   3. npx webpack build
 *   4. Real GPU (not SwiftShader)
 *
 * Run:
 *   npx playwright test ai-prompt-stress.spec.js
 */
const {test, expect} = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Paths & config
// ---------------------------------------------------------------------------
const BUILD_DIR = path.resolve(__dirname, '../../build');
const MODEL_PATH = '/tmp/gemma-model.bin';
let serverPort = 0;

const WASM_DIR = (() => {
    const local = path.resolve(__dirname, '../../node_modules/@mediapipe/tasks-genai/wasm');
    if (fs.existsSync(local)) return local;
    const root = path.resolve(__dirname, '../../../../node_modules/@mediapipe/tasks-genai/wasm');
    if (fs.existsSync(root)) return root;
    return local;
})();

const modelExists = fs.existsSync(MODEL_PATH);
const wasmExists = fs.existsSync(path.join(WASM_DIR, 'genai_wasm_internal.js'));

const MODEL_LOAD_TIMEOUT = 5 * 60 * 1000;
const GENERATION_TIMEOUT = 10 * 60 * 1000;

const ORIGINAL_MODEL_URL = 'https://storage.googleapis.com/gemma-3n/gemma-3n-E2B-it-int4-Web.litertlm';
const ORIGINAL_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.26/wasm';


// ---------------------------------------------------------------------------
// Prompt test cases
// ---------------------------------------------------------------------------
/**
 * Each prompt defines:
 * - prompt: the natural-language request
 * - verify: a function (page) => {pass, reason} that checks VM state after
 *   the green flag runs for a short time.
 * - requiredOpcodes (optional): opcodes that should be present in generated blocks
 */
const PROMPTS = [
    {
        name: 'move 10 steps',
        prompt: 'when green flag clicked, move 10 steps',
        requiredOpcodes: ['event_whenflagclicked', 'motion_movesteps'],
        verify: async (page, helpers) => {
            const x = await helpers.getSpriteX(page);
            if (x !== 0 && x !== null) return {pass: true};
            return {pass: false, reason: `sprite did not move (x=${x})`};
        }
    },
    {
        name: 'move and turn',
        prompt: 'when green flag clicked, move 10 steps then turn right 90 degrees',
        requiredOpcodes: ['motion_movesteps', 'motion_turnright'],
        verify: async (page, helpers) => {
            const x = await helpers.getSpriteX(page);
            const dir = await helpers.getSpriteDirection(page);
            if (x !== 0 || dir !== 90) return {pass: true};
            return {pass: false, reason: `no movement or rotation (x=${x}, dir=${dir})`};
        }
    },
    {
        name: 'say hello',
        prompt: 'when green flag clicked, say hello',
        requiredOpcodes: ['looks_say'],
        verify: async (page, helpers) => {
            const bubbleText = await helpers.getBubbleText(page);
            if (bubbleText && bubbleText.length > 0) return {pass: true};
            return {pass: false, reason: `no speech bubble (got: ${bubbleText})`};
        }
    },
    {
        name: 'say hello for 2 seconds',
        prompt: 'when green flag clicked, say hello for 2 seconds',
        requiredOpcodes: ['looks_sayforsecs'],
        verify: async (page, helpers) => {
            const bubbleText = await helpers.getBubbleText(page);
            if (bubbleText && bubbleText.length > 0) return {pass: true};
            return {pass: false, reason: `no speech bubble (got: ${bubbleText})`};
        }
    },
    {
        name: 'go to center',
        prompt: 'when green flag clicked, go to x 0 y 0',
        requiredOpcodes: ['motion_gotoxy'],
        verify: async (page, helpers) => {
            const pos = await helpers.getSpritePos(page);
            // Should be at or near 0,0 (it may already be there, but blocks should exist)
            const blocks = await helpers.getBlockCount(page);
            if (blocks > 0) return {pass: true};
            return {pass: false, reason: `no blocks added`};
        }
    },
    {
        name: 'change x by 50',
        prompt: 'when green flag clicked, change x by 50',
        requiredOpcodes: ['motion_changexby'],
        verify: async (page, helpers) => {
            const x = await helpers.getSpriteX(page);
            if (x !== 0 && x !== null) return {pass: true};
            return {pass: false, reason: `sprite did not move (x=${x})`};
        }
    },
    {
        name: 'set size',
        prompt: 'when green flag clicked, set size to 200 percent',
        requiredOpcodes: ['looks_setsizeto'],
        verify: async (page, helpers) => {
            const size = await helpers.getSpriteSize(page);
            if (size !== 100 && size !== null) return {pass: true};
            return {pass: false, reason: `size did not change (size=${size})`};
        }
    },
    {
        name: 'hide sprite',
        prompt: 'when green flag clicked, hide',
        requiredOpcodes: ['looks_hide'],
        verify: async (page, helpers) => {
            const visible = await helpers.getSpriteVisible(page);
            if (visible === false) return {pass: true};
            return {pass: false, reason: `sprite still visible (visible=${visible})`};
        }
    },
    {
        name: 'forever move',
        prompt: 'when green flag clicked, forever move 5 steps',
        requiredOpcodes: ['control_forever', 'motion_movesteps'],
        verify: async (page, helpers) => {
            const x = await helpers.getSpriteX(page);
            if (x !== 0 && x !== null) return {pass: true};
            return {pass: false, reason: `sprite did not move (x=${x})`};
        }
    },
    {
        name: 'forever move and bounce',
        prompt: 'when green flag clicked, forever move 10 steps and if on edge bounce',
        requiredOpcodes: ['control_forever', 'motion_movesteps', 'motion_ifonedgebounce'],
        verify: async (page, helpers) => {
            const x = await helpers.getSpriteX(page);
            if (x !== 0 && x !== null) return {pass: true};
            return {pass: false, reason: `sprite did not move (x=${x})`};
        }
    },
    {
        name: 'repeat 10 times move',
        prompt: 'when green flag clicked, repeat 10 times: move 10 steps',
        requiredOpcodes: ['control_repeat', 'motion_movesteps'],
        verify: async (page, helpers) => {
            const x = await helpers.getSpriteX(page);
            if (x !== 0 && x !== null) return {pass: true};
            return {pass: false, reason: `sprite did not move (x=${x})`};
        }
    },
    {
        name: 'point and move',
        prompt: 'when green flag clicked, point in direction 45 then move 50 steps',
        requiredOpcodes: ['motion_pointindirection', 'motion_movesteps'],
        verify: async (page, helpers) => {
            const pos = await helpers.getSpritePos(page);
            if (pos.x !== 0 || pos.y !== 0) return {pass: true};
            return {pass: false, reason: `sprite did not move (x=${pos.x}, y=${pos.y})`};
        }
    },
    {
        name: 'glide to position',
        prompt: 'when green flag clicked, glide 1 second to x 100 y 100',
        requiredOpcodes: ['motion_glidesecstoxy'],
        verify: async (page, helpers) => {
            const pos = await helpers.getSpritePos(page);
            if (pos.x !== 0 || pos.y !== 0) return {pass: true};
            return {pass: false, reason: `sprite did not move (x=${pos.x}, y=${pos.y})`};
        }
    },
    {
        name: 'change size in loop',
        prompt: 'when green flag clicked, repeat 5 times: change size by 10',
        requiredOpcodes: ['control_repeat', 'looks_changesizeby'],
        verify: async (page, helpers) => {
            const size = await helpers.getSpriteSize(page);
            if (size !== 100 && size !== null) return {pass: true};
            return {pass: false, reason: `size did not change (size=${size})`};
        }
    },
    {
        name: 'switch costume',
        prompt: 'when green flag clicked, next costume',
        requiredOpcodes: ['looks_nextcostume'],
        verify: async (page, helpers) => {
            // Just verify blocks exist and no errors
            const blocks = await helpers.getBlockCount(page);
            if (blocks > 0) return {pass: true};
            return {pass: false, reason: 'no blocks added'};
        }
    },
    {
        name: 'set x and y',
        prompt: 'when green flag clicked, set x to 100 and set y to 50',
        requiredOpcodes: ['motion_setx'],
        verify: async (page, helpers) => {
            const pos = await helpers.getSpritePos(page);
            if (pos.x !== 0 || pos.y !== 0) return {pass: true};
            return {pass: false, reason: `sprite did not move (x=${pos.x}, y=${pos.y})`};
        }
    },
    {
        name: 'turn left',
        prompt: 'when green flag clicked, turn left 45 degrees',
        requiredOpcodes: ['motion_turnleft'],
        verify: async (page, helpers) => {
            const dir = await helpers.getSpriteDirection(page);
            if (dir !== 90) return {pass: true};
            return {pass: false, reason: `direction did not change (dir=${dir})`};
        }
    },
    {
        name: 'clear graphic effects',
        prompt: 'when green flag clicked, clear graphic effects',
        requiredOpcodes: ['looks_cleargraphiceffects'],
        verify: async (page, helpers) => {
            const blocks = await helpers.getBlockCount(page);
            if (blocks > 0) return {pass: true};
            return {pass: false, reason: 'no blocks added'};
        }
    },
    {
        name: 'change color effect',
        prompt: 'when green flag clicked, change color effect by 25',
        requiredOpcodes: ['looks_changeeffectby'],
        verify: async (page, helpers) => {
            const effects = await helpers.getSpriteEffects(page);
            if (effects && effects.color !== 0) return {pass: true};
            return {pass: false, reason: `color effect did not change (effects=${JSON.stringify(effects)})`};
        }
    },
    {
        name: 'wait then move',
        prompt: 'when green flag clicked, wait 0.1 seconds then move 30 steps',
        requiredOpcodes: ['control_wait', 'motion_movesteps'],
        verify: async (page, helpers) => {
            const x = await helpers.getSpriteX(page);
            if (x !== 0 && x !== null) return {pass: true};
            return {pass: false, reason: `sprite did not move (x=${x})`};
        }
    }
];

// ---------------------------------------------------------------------------
// HTTP server (same as ai-gemma-e2e.spec.js)
// ---------------------------------------------------------------------------
const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.map': 'application/json',
    '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.cur': 'image/x-icon',
    '.bin': 'application/octet-stream'
};

let server;
let baseURL;

const startServer = () => new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        let filePath = path.join(BUILD_DIR, decodeURIComponent(url.pathname));
        if (filePath.endsWith('/')) filePath = path.join(filePath, 'index.html');

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        const ext = path.extname(filePath);
        const mime = MIME[ext] || 'application/octet-stream';
        const stat = fs.statSync(filePath);

        res.setHeader('Access-Control-Allow-Origin', '*');

        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
            res.writeHead(206, {
                'Content-Type': mime,
                'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                'Content-Length': end - start + 1
            });
            fs.createReadStream(filePath, {start, end}).pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Type': mime,
                'Content-Length': stat.size
            });
            fs.createReadStream(filePath).pipe(res);
        }
    });

    server.listen(0, '127.0.0.1', () => {
        serverPort = server.address().port;
        baseURL = `http://127.0.0.1:${serverPort}`;
        resolve(baseURL);
    });
    server.on('error', reject);
});

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------
const waitForEditor = async page => {
    await page.waitForSelector('[class*="green-flag"]', {timeout: 30000});
};

const getStoreHelper = `
    (() => {
        const guiEl = document.querySelector('[class*="gui"]');
        if (!guiEl) return null;
        const fiberKey = Object.keys(guiEl).find(k => k.startsWith('__reactFiber$'));
        if (!fiberKey) return null;
        let fiber = guiEl[fiberKey];
        while (fiber) {
            if (fiber.memoizedProps?.store) return fiber.memoizedProps.store;
            fiber = fiber.return;
        }
        return null;
    })()
`;

const helpers = {
    getSpriteX: page => page.evaluate(`
        (() => {
            const store = ${getStoreHelper};
            if (!store) return null;
            const vm = store.getState().scratchGui.vm;
            return vm?.editingTarget?.x ?? null;
        })()
    `),

    getSpritePos: page => page.evaluate(`
        (() => {
            const store = ${getStoreHelper};
            if (!store) return {x: null, y: null};
            const vm = store.getState().scratchGui.vm;
            const t = vm?.editingTarget;
            return t ? {x: t.x, y: t.y} : {x: null, y: null};
        })()
    `),

    getSpriteDirection: page => page.evaluate(`
        (() => {
            const store = ${getStoreHelper};
            if (!store) return null;
            const vm = store.getState().scratchGui.vm;
            return vm?.editingTarget?.direction ?? null;
        })()
    `),

    getSpriteSize: page => page.evaluate(`
        (() => {
            const store = ${getStoreHelper};
            if (!store) return null;
            const vm = store.getState().scratchGui.vm;
            return vm?.editingTarget?.size ?? null;
        })()
    `),

    getSpriteVisible: page => page.evaluate(`
        (() => {
            const store = ${getStoreHelper};
            if (!store) return null;
            const vm = store.getState().scratchGui.vm;
            return vm?.editingTarget?.visible ?? null;
        })()
    `),

    getSpriteEffects: page => page.evaluate(`
        (() => {
            const store = ${getStoreHelper};
            if (!store) return null;
            const vm = store.getState().scratchGui.vm;
            const t = vm?.editingTarget;
            return t?.effects ?? null;
        })()
    `),

    getBubbleText: page => page.evaluate(`
        (() => {
            const store = ${getStoreHelper};
            if (!store) return null;
            const vm = store.getState().scratchGui.vm;
            const target = vm?.editingTarget;
            if (!target) return null;
            // Bubble text is stored on the drawable or the runtime's _editingTarget
            // Check the runtime targets for bubble state
            const runtimeTarget = vm?.runtime?.targets?.find(t => t.id === target.id);
            if (runtimeTarget) {
                // The say/think text may be in a bubble property or the _bubbleState
                // Check common locations
                if (runtimeTarget.getCustomState) {
                    const bubbleState = runtimeTarget.getCustomState('Scratch.looks');
                    if (bubbleState) return bubbleState.text || null;
                }
            }
            return null;
        })()
    `),

    getBlockCount: page => page.evaluate(`
        (() => {
            const store = ${getStoreHelper};
            if (!store) return null;
            const vm = store.getState().scratchGui.vm;
            return vm?.editingTarget
                ? Object.keys(vm.editingTarget.blocks._blocks).length
                : null;
        })()
    `),

    getBlockOpcodes: page => page.evaluate(`
        (() => {
            const store = ${getStoreHelper};
            if (!store) return null;
            const vm = store.getState().scratchGui.vm;
            if (!vm?.editingTarget) return null;
            return Object.values(vm.editingTarget.blocks._blocks).map(b => b.opcode);
        })()
    `),

    getGeneratedOpcodes: page => page.evaluate(`
        (() => {
            const store = ${getStoreHelper};
            if (!store) return null;
            const state = store.getState().scratchGui.aiCodeSuggestions;
            return state?.generatedBlocks?.map(b => b.opcode) ?? null;
        })()
    `)
};

/**
 * Open the AI modal, enter a prompt, click Generate, and wait for results.
 * Returns {previewText, error, consoleErrors}.
 */
const generateFromPrompt = async (page, prompt) => {
    const consoleErrors = [];

    const errorHandler = msg => {
        const text = msg.text();
        if (msg.type() === 'error' && text.includes('ai-code-suggestions')) {
            consoleErrors.push(text.substring(0, 500));
        }
    };
    page.on('console', errorHandler);

    try {
        await page.click('button[title="AI Code Suggestions"]');
        await expect(page.locator('text=AI Code Suggestions')).toBeVisible();

        const input = page.locator('input[placeholder*="walk back and forth"]');
        await input.fill(prompt);
        await page.locator('button:has-text("Generate")').click();

        // Wait for model download/load modal
        const downloadModal = page.locator('#llm-load-modal');
        const modalAppeared = await downloadModal.isVisible({timeout: 10000}).catch(() => false);
        if (modalAppeared) {
            await expect(downloadModal).not.toBeVisible({timeout: MODEL_LOAD_TIMEOUT});
        }

        // Wait for generation to complete (success or error)
        const success = page.locator('text=Suggested code:');
        const error = page.locator('[class*="error"]');

        await Promise.race([
            success.waitFor({timeout: GENERATION_TIMEOUT}),
            error.waitFor({timeout: GENERATION_TIMEOUT}).catch(() => null)
        ]);

        // Check if we got an error
        const hasError = await page.locator('[class*="error"]').isVisible().catch(() => false);
        if (hasError) {
            const errorText = await page.locator('[class*="error"]').textContent().catch(() => 'unknown error');
            return {previewText: null, error: errorText, consoleErrors};
        }

        const previewText = await page.locator('[class*="preview-code"]').textContent();
        return {previewText, error: null, consoleErrors};
    } finally {
        page.off('console', errorHandler);
    }
};

/**
 * Reset the sprite to default state before each prompt test.
 */
const resetSprite = page => page.evaluate(`
    (() => {
        const store = ${getStoreHelper};
        if (!store) return;
        const vm = store.getState().scratchGui.vm;
        if (!vm?.editingTarget) return;
        const target = vm.editingTarget;
        // Reset position, direction, size, visibility, effects
        target.setXY(0, 0);
        target.setDirection(90);
        target.setSize(100);
        target.setVisible(true);
        target.clearEffects();
        // Clear all blocks from the editing target
        const blockIds = Object.keys(target.blocks._blocks);
        for (const id of blockIds) {
            target.blocks.deleteBlock(id);
        }
    })()
`);

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
test.describe('AI Code Suggestions - Prompt Stress Test', () => {
    const results = [];

    let originalGuiJs = null;
    const guiJsPath = path.join(BUILD_DIR, 'gui.js');

    test.beforeAll(async () => {
        if (!modelExists || !wasmExists) return;

        originalGuiJs = fs.readFileSync(guiJsPath, 'utf-8');

        // Symlink model into build dir
        const buildModelPath = path.join(BUILD_DIR, 'gemma-model.bin');
        if (!fs.existsSync(buildModelPath)) {
            fs.symlinkSync(MODEL_PATH, buildModelPath);
        }

        // Copy WASM files to build dir
        const buildWasmDir = path.join(BUILD_DIR, 'mediapipe-wasm');
        if (!fs.existsSync(buildWasmDir)) {
            fs.mkdirSync(buildWasmDir, {recursive: true});
        }
        for (const file of fs.readdirSync(WASM_DIR)) {
            const dest = path.join(buildWasmDir, file);
            if (!fs.existsSync(dest)) {
                fs.copyFileSync(path.join(WASM_DIR, file), dest);
            }
        }

        await startServer();

        // Patch URLs in gui.js to use local server
        const localModelUrl = `http://127.0.0.1:${serverPort}/gemma-model.bin`;
        const localWasmUrl = `http://127.0.0.1:${serverPort}/mediapipe-wasm`;
        let patched = originalGuiJs;
        patched = patched.replace(ORIGINAL_MODEL_URL, localModelUrl);
        patched = patched.replace(ORIGINAL_WASM_URL, localWasmUrl);
        fs.writeFileSync(guiJsPath, patched);

        // eslint-disable-next-line no-console
        console.log(`Stress test server: ${baseURL}`);
    });

    test.afterAll(async () => {
        if (server) server.close();
        if (originalGuiJs) {
            fs.writeFileSync(guiJsPath, originalGuiJs);
        }
        const buildModelPath = path.join(BUILD_DIR, 'gemma-model.bin');
        try { fs.unlinkSync(buildModelPath); } catch { /* ignore */ }

        // Print summary table
        // eslint-disable-next-line no-console
        console.log('\n' + '='.repeat(80));
        // eslint-disable-next-line no-console
        console.log('AI PROMPT STRESS TEST RESULTS');
        // eslint-disable-next-line no-console
        console.log('='.repeat(80));

        const passed = results.filter(r => r.status === 'PASS');
        const failed = results.filter(r => r.status === 'FAIL');
        const errored = results.filter(r => r.status === 'ERROR');

        for (const r of results) {
            const icon = r.status === 'PASS' ? 'OK' : r.status === 'FAIL' ? 'FAIL' : 'ERR';
            const detail = r.reason ? ` -- ${r.reason}` : '';
            // eslint-disable-next-line no-console
            console.log(`  [${icon}] ${r.name}${detail}`);
        }

        // eslint-disable-next-line no-console
        console.log('-'.repeat(80));
        // eslint-disable-next-line no-console
        console.log(
            `  Total: ${results.length}  |  ` +
            `Passed: ${passed.length}  |  ` +
            `Failed: ${failed.length}  |  ` +
            `Errors: ${errored.length}`
        );
        // eslint-disable-next-line no-console
        console.log('='.repeat(80) + '\n');

        // Write results to JSON for further analysis
        const resultsPath = path.join(__dirname, 'stress-test-results.json');
        fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
        // eslint-disable-next-line no-console
        console.log(`Results written to: ${resultsPath}`);
    });

    for (const promptCase of PROMPTS) {
        test(`prompt: "${promptCase.name}"`, async ({page}) => {
            test.skip(!modelExists, `Model not found at ${MODEL_PATH}`);
            test.skip(!wasmExists, 'MediaPipe WASM not found');
            test.setTimeout(MODEL_LOAD_TIMEOUT + GENERATION_TIMEOUT + 120000);

            const result = {
                name: promptCase.name,
                prompt: promptCase.prompt,
                status: 'ERROR',
                reason: null,
                previewText: null,
                opcodes: null,
                consoleErrors: [],
                blockCount: 0
            };

            // Capture all console errors for this prompt
            const allConsoleErrors = [];
            page.on('console', msg => {
                const text = msg.text();
                if (msg.type() === 'error') {
                    allConsoleErrors.push(text.substring(0, 300));
                }
                // Log AI-related messages
                if (text.includes('ai-') || text.includes('model') ||
                    text.includes('WebGPU') || text.includes('Gemma')) {
                    // eslint-disable-next-line no-console
                    console.log(`  [${msg.type()}] ${text.substring(0, 200)}`);
                }
            });

            try {
                await page.goto(baseURL);
                await waitForEditor(page);

                // Check GPU on first test only
                const gpu = await page.evaluate(async () => {
                    if (!navigator.gpu) return {available: false};
                    try {
                        const adapter = await navigator.gpu.requestAdapter();
                        if (!adapter) return {available: false};
                        let description = 'unknown';
                        try {
                            if (typeof adapter.requestAdapterInfo === 'function') {
                                const info = await adapter.requestAdapterInfo();
                                description = info.description || 'unknown';
                            } else if (adapter.info) {
                                description = adapter.info.description || 'unknown';
                            }
                        } catch { /* ok */ }
                        const isSW = description.toLowerCase().includes('swiftshader');
                        return {available: !isSW, description, isSwiftShader: isSW};
                    } catch {
                        return {available: false};
                    }
                });
                test.skip(!gpu.available, 'Real GPU required');

                // Reset sprite state
                await resetSprite(page);
                await page.waitForTimeout(200);

                // ---- Step 1: Generate blocks ----
                // eslint-disable-next-line no-console
                console.log(`\n  Generating: "${promptCase.prompt}"`);
                const gen = await generateFromPrompt(page, promptCase.prompt);
                result.consoleErrors = [...gen.consoleErrors, ...allConsoleErrors.filter(e => e.includes('ai-code'))];

                if (gen.error) {
                    result.status = 'ERROR';
                    result.reason = `generation failed: ${gen.error}`;
                    results.push(result);
                    return;
                }

                result.previewText = gen.previewText;
                // eslint-disable-next-line no-console
                console.log(`  Preview: ${gen.previewText}`);

                // ---- Step 2: Check generated opcodes ----
                const opcodes = await helpers.getGeneratedOpcodes(page);
                result.opcodes = opcodes;

                if (promptCase.requiredOpcodes) {
                    const missing = promptCase.requiredOpcodes.filter(
                        op => !opcodes || !opcodes.some(o => o.includes(op))
                    );
                    if (missing.length > 0) {
                        // eslint-disable-next-line no-console
                        console.log(`  Warning: missing expected opcodes: ${missing.join(', ')}`);
                        // Don't fail yet — the model may have used alternatives
                    }
                }

                // ---- Step 3: Check for parse/structural errors in console ----
                const structuralErrors = result.consoleErrors.filter(
                    e => e.includes('incompatible') || e.includes('SyntaxError') ||
                         e.includes('missing opcode') || e.includes('not valid JSON')
                );
                if (structuralErrors.length > 0) {
                    result.status = 'ERROR';
                    result.reason = `structural errors: ${structuralErrors[0]}`;
                    results.push(result);
                    // Don't return — still try to add and run
                }

                // ---- Step 4: Add blocks to project ----
                const addButton = page.locator('button:has-text("Add to Project")');
                const addVisible = await addButton.isVisible().catch(() => false);
                if (!addVisible) {
                    result.status = 'ERROR';
                    result.reason = 'Add to Project button not visible';
                    results.push(result);
                    return;
                }

                await addButton.click();
                await page.waitForTimeout(1000);

                // Check for errors after adding blocks
                const postAddErrors = allConsoleErrors.filter(
                    e => e.includes('incompatible') || e.includes('Error')
                );
                if (postAddErrors.length > 0) {
                    // eslint-disable-next-line no-console
                    console.log(`  Post-add errors: ${postAddErrors.join('; ')}`);
                }

                const blockCount = await helpers.getBlockCount(page);
                result.blockCount = blockCount;
                // eslint-disable-next-line no-console
                console.log(`  Blocks added: ${blockCount}`);

                if (!blockCount || blockCount === 0) {
                    result.status = 'FAIL';
                    result.reason = 'no blocks were added to workspace';
                    results.push(result);
                    return;
                }

                // ---- Step 5: Run the project ----
                // Reset sprite position just before running
                await page.evaluate(`
                    (() => {
                        const store = ${getStoreHelper};
                        if (!store) return;
                        const vm = store.getState().scratchGui.vm;
                        if (vm?.editingTarget) {
                            vm.editingTarget.setXY(0, 0);
                            vm.editingTarget.setDirection(90);
                            vm.editingTarget.setSize(100);
                            vm.editingTarget.setVisible(true);
                            vm.editingTarget.clearEffects();
                        }
                    })()
                `);

                await page.click('[class*="green-flag"]');
                await page.waitForTimeout(2000);

                // ---- Step 6: Verify VM state ----
                const verification = await promptCase.verify(page, helpers);

                await page.click('[class*="stop-all"]');
                await page.waitForTimeout(300);

                if (verification.pass) {
                    if (result.status !== 'ERROR') {
                        result.status = 'PASS';
                    }
                } else {
                    if (result.status !== 'ERROR') {
                        result.status = 'FAIL';
                    }
                    result.reason = result.reason
                        ? `${result.reason}; verify: ${verification.reason}`
                        : verification.reason;
                }

                // eslint-disable-next-line no-console
                console.log(`  Result: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);

            } catch (err) {
                result.status = 'ERROR';
                result.reason = err.message.substring(0, 200);
                // eslint-disable-next-line no-console
                console.log(`  EXCEPTION: ${err.message.substring(0, 200)}`);
            }

            results.push(result);
        });
    }
});
