// @ts-check
/**
 * End-to-end tests that use the real Gemma 3n model (~3 GB) to generate
 * Scratch blocks from natural-language prompts, add them to the project,
 * run the project, and verify VM state.
 *
 * HARDWARE REQUIREMENTS:
 *   - GPU with WebGPU support (real GPU, not SwiftShader).
 *     The model is too large for CPU-emulated WebGPU (SwiftShader times out).
 *   - ~6 GB RAM free (3 GB for model + overhead)
 *   - ~4 GB disk (model file)
 *
 * PREREQUISITES:
 *   1. Download the model:
 *      curl -L "https://storage.googleapis.com/gemma-3n/gemma-3n-E2B-it-int4-Web.litertlm" \
 *           -o /tmp/gemma-model.bin
 *   2. Install MediaPipe:
 *      npm install @mediapipe/tasks-genai@0.10.26
 *   3. Build scratch-gui with the full ai-model-manager (not stub):
 *      npx webpack build
 *
 * Run:
 *   npx playwright test ai-gemma-e2e.spec.js
 *
 * If no GPU is available, tests will be skipped with a clear message.
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
let serverPort = 0; // Will be assigned dynamically

// Resolve WASM dir — package may be in root node_modules (hoisted) or local
const WASM_DIR = (() => {
    const local = path.resolve(__dirname, '../../node_modules/@mediapipe/tasks-genai/wasm');
    if (fs.existsSync(local)) return local;
    const root = path.resolve(__dirname, '../../../../node_modules/@mediapipe/tasks-genai/wasm');
    if (fs.existsSync(root)) return root;
    return local;
})();

// Check prerequisites
const modelExists = fs.existsSync(MODEL_PATH);
const wasmExists = fs.existsSync(path.join(WASM_DIR, 'genai_wasm_internal.js'));

// Timeouts
const MODEL_LOAD_TIMEOUT = 5 * 60 * 1000; // 5 min
const GENERATION_TIMEOUT = 10 * 60 * 1000; // 10 min for LLM inference

// URLs to patch in the build
const ORIGINAL_MODEL_URL = 'https://storage.googleapis.com/gemma-3n/gemma-3n-E2B-it-int4-Web.litertlm';
const ORIGINAL_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.26/wasm';

// ---------------------------------------------------------------------------
// Local HTTP server
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

        // Support range requests for large files (model)
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
// Helpers
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

/**
 * Check if WebGPU is available (real GPU, not just SwiftShader).
 */
const checkWebGPU = async page => {
    const result = await page.evaluate(async () => {
        if (!navigator.gpu) return {available: false, reason: 'navigator.gpu not found'};
        try {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) return {available: false, reason: 'No GPU adapter'};

            // Try to get adapter info — API varies by Chrome version
            let description = 'unknown';
            let vendor = 'unknown';
            try {
                if (typeof adapter.requestAdapterInfo === 'function') {
                    const info = await adapter.requestAdapterInfo();
                    description = info.description || 'unknown';
                    vendor = info.vendor || 'unknown';
                } else if (adapter.info) {
                    description = adapter.info.description || 'unknown';
                    vendor = adapter.info.vendor || 'unknown';
                }
            } catch { /* older API */ }

            const isSwiftShader = description.toLowerCase().includes('swiftshader') ||
                                  vendor.toLowerCase().includes('google');

            // Also check by trying a minimal compute — SwiftShader is too slow for LLMs
            // Just checking the adapter name is usually sufficient
            return {
                available: !isSwiftShader,
                description,
                vendor,
                isSwiftShader
            };
        } catch (e) {
            return {available: false, reason: e.message};
        }
    });
    return result;
};

const getSpriteX = page => page.evaluate(`
    (() => {
        const store = ${getStoreHelper};
        if (!store) return null;
        const vm = store.getState().scratchGui.vm;
        return vm?.editingTarget?.x ?? null;
    })()
`);

const getBlockCount = page => page.evaluate(`
    (() => {
        const store = ${getStoreHelper};
        if (!store) return null;
        const vm = store.getState().scratchGui.vm;
        return vm?.editingTarget ? Object.keys(vm.editingTarget.blocks._blocks).length : null;
    })()
`);

const getBlockOpcodes = page => page.evaluate(`
    (() => {
        const store = ${getStoreHelper};
        if (!store) return null;
        const state = store.getState().scratchGui.aiCodeSuggestions;
        return state?.generatedBlocks?.map(b => b.opcode) ?? null;
    })()
`);

/**
 * Open the AI modal, enter a prompt, click Generate, wait for the model
 * to load and generate. Returns the preview text.
 */
const generateFromPrompt = async (page, prompt) => {
    await page.click('button[title="AI Code Suggestions"]');
    await expect(page.locator('text=AI Code Suggestions')).toBeVisible();

    const input = page.locator('input[placeholder*="walk back and forth"]');
    await input.fill(prompt);
    await page.locator('button:has-text("Generate")').click();

    // Wait for model download/load modal
    const downloadModal = page.locator('#llm-load-modal');
    const modalAppeared = await downloadModal.isVisible({timeout: 10000}).catch(() => false);

    if (modalAppeared) {
        // eslint-disable-next-line no-console
        console.log('  Model loading modal appeared, waiting...');
        await expect(downloadModal).not.toBeVisible({timeout: MODEL_LOAD_TIMEOUT});
        // eslint-disable-next-line no-console
        console.log('  Model loaded.');
    }

    // Wait for generation to complete
    await expect(page.locator('text=Suggested code:')).toBeVisible({timeout: GENERATION_TIMEOUT});

    const previewText = await page.locator('[class*="preview-code"]').textContent();
    return previewText;
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('AI Code Suggestions with Real Gemma 3n Model', () => {
    let originalGuiJs = null;
    const guiJsPath = path.join(BUILD_DIR, 'gui.js');

    test.beforeAll(async () => {
        if (!modelExists || !wasmExists) return;

        // Save original gui.js content
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
        console.log(`Test server: ${baseURL}`);
    });

    test.afterAll(async () => {
        if (server) server.close();

        // Restore original gui.js
        if (originalGuiJs) {
            fs.writeFileSync(guiJsPath, originalGuiJs);
        }

        // Clean up symlink
        const buildModelPath = path.join(BUILD_DIR, 'gemma-model.bin');
        try { fs.unlinkSync(buildModelPath); } catch { /* ignore */ }
    });

    test('generate "move 10 steps" blocks, add to project, run, and verify sprite moved', async ({page}) => {
        test.skip(!modelExists, `Model not found at ${MODEL_PATH}. Download it first.`);
        test.skip(!wasmExists, 'MediaPipe WASM not found. Run: npm install @mediapipe/tasks-genai@0.10.26');
        test.setTimeout(MODEL_LOAD_TIMEOUT + GENERATION_TIMEOUT + 60000);

        // Log relevant console messages
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('ai-') || text.includes('model') || text.includes('WebGPU') ||
                text.includes('Download') || text.includes('OPFS') || text.includes('Gemma') ||
                text.includes('mediapipe') || text.includes('gpu_model') || text.includes('llm_')) {
                // eslint-disable-next-line no-console
                console.log(`  [${msg.type()}] ${text.substring(0, 300)}`);
            }
        });

        await page.goto(baseURL);
        await waitForEditor(page);

        // Check for real GPU — skip if only SwiftShader available
        const gpu = await checkWebGPU(page);
        // eslint-disable-next-line no-console
        console.log(`GPU: ${gpu.description || gpu.reason} (SwiftShader: ${gpu.isSwiftShader})`);
        test.skip(!gpu.available,
            `Real GPU required. Found: ${gpu.description || gpu.reason}. ` +
            'Gemma 3n is too large for CPU-emulated WebGPU (SwiftShader).');

        const initialX = await getSpriteX(page);
        const initialBlockCount = await getBlockCount(page);

        // eslint-disable-next-line no-console
        console.log('Generating blocks for: "when green flag clicked, move 10 steps"');
        const previewText = await generateFromPrompt(page, 'when green flag clicked, move 10 steps');
        // eslint-disable-next-line no-console
        console.log('Preview:', previewText);
        expect(previewText.length).toBeGreaterThan(0);

        // Add blocks to project
        await page.click('button:has-text("Add to Project")');
        await page.waitForTimeout(1000);
        await expect(page.locator('text=AI Code Suggestions')).not.toBeVisible({timeout: 5000});

        // Verify blocks were added
        const newBlockCount = await getBlockCount(page);
        expect(newBlockCount).toBeGreaterThan(initialBlockCount);
        // eslint-disable-next-line no-console
        console.log(`Blocks: ${initialBlockCount} → ${newBlockCount}`);

        // Run the project
        await page.click('[class*="green-flag"]');
        await page.waitForTimeout(2000);

        // Verify sprite moved
        const finalX = await getSpriteX(page);
        expect(finalX).not.toBe(0);
        // eslint-disable-next-line no-console
        console.log(`Sprite: x=${initialX} → x=${finalX}`);

        await page.click('[class*="stop-all"]');
    });

    test('generate "say hello" blocks and verify looks opcode present', async ({page}) => {
        test.skip(!modelExists, 'Model not found');
        test.skip(!wasmExists, 'MediaPipe WASM not found');
        test.setTimeout(MODEL_LOAD_TIMEOUT + GENERATION_TIMEOUT + 60000);

        await page.goto(baseURL);
        await waitForEditor(page);

        const gpu = await checkWebGPU(page);
        test.skip(!gpu.available, `Real GPU required. Found: ${gpu.description || gpu.reason}`);

        // eslint-disable-next-line no-console
        console.log('Generating blocks for: "say hello for 2 seconds"');
        const previewText = await generateFromPrompt(page, 'say hello for 2 seconds when green flag clicked');
        // eslint-disable-next-line no-console
        console.log('Preview:', previewText);
        expect(previewText.toLowerCase()).toContain('say');

        const opcodes = await getBlockOpcodes(page);
        expect(opcodes).toBeTruthy();
        // eslint-disable-next-line no-console
        console.log('Opcodes:', opcodes);

        const hasSayBlock = opcodes.some(op => op.includes('looks_say') || op.includes('looks_think'));
        expect(hasSayBlock).toBe(true);

        await page.click('button:has-text("Add to Project")');
        await page.waitForTimeout(500);
        expect(await getBlockCount(page)).toBeGreaterThan(0);
    });

    test('regenerate produces output for same prompt', async ({page}) => {
        test.skip(!modelExists, 'Model not found');
        test.skip(!wasmExists, 'MediaPipe WASM not found');
        test.setTimeout(MODEL_LOAD_TIMEOUT + GENERATION_TIMEOUT * 2 + 60000);

        await page.goto(baseURL);
        await waitForEditor(page);

        const gpu = await checkWebGPU(page);
        test.skip(!gpu.available, `Real GPU required. Found: ${gpu.description || gpu.reason}`);

        // eslint-disable-next-line no-console
        console.log('Generating blocks for: "spin in a circle"');

        const firstPreview = await generateFromPrompt(page, 'make the sprite spin in a circle');
        // eslint-disable-next-line no-console
        console.log('First generation:', firstPreview);
        expect(firstPreview.length).toBeGreaterThan(0);

        // Regenerate
        await page.locator('button:has-text("Regenerate")').click();
        await expect(page.locator('text=Suggested code:')).toBeVisible({timeout: GENERATION_TIMEOUT});
        const secondPreview = await page.locator('[class*="preview-code"]').textContent();
        // eslint-disable-next-line no-console
        console.log('Second generation:', secondPreview);
        expect(secondPreview.length).toBeGreaterThan(0);
    });

    test('generate "forever move and bounce", run, verify sprite moves', async ({page}) => {
        test.skip(!modelExists, 'Model not found');
        test.skip(!wasmExists, 'MediaPipe WASM not found');
        test.setTimeout(MODEL_LOAD_TIMEOUT + GENERATION_TIMEOUT + 60000);

        await page.goto(baseURL);
        await waitForEditor(page);

        const gpu = await checkWebGPU(page);
        test.skip(!gpu.available, `Real GPU required. Found: ${gpu.description || gpu.reason}`);

        const initialX = await getSpriteX(page);

        // eslint-disable-next-line no-console
        console.log('Generating blocks for: "forever move and if on edge bounce"');
        const previewText = await generateFromPrompt(
            page, 'when flag clicked, forever move 10 steps and if on edge bounce'
        );
        // eslint-disable-next-line no-console
        console.log('Preview:', previewText);

        await page.click('button:has-text("Add to Project")');
        await page.waitForTimeout(500);

        // Run for 3 seconds
        await page.click('[class*="green-flag"]');
        await page.waitForTimeout(3000);

        const movedX = await getSpriteX(page);
        expect(movedX).not.toBe(initialX);
        // eslint-disable-next-line no-console
        console.log(`Sprite: x=${initialX} → x=${movedX}`);

        await page.click('[class*="stop-all"]');
    });
});
