/**
 * AI Model Loading Integration Test
 *
 * Verifies that the Gemma 4 model loads on GUI startup and responds
 * to a verification prompt. Requires WebGPU (real GPU) and network
 * access for first model download.
 *
 * Run with: npm run test:ai
 * (sets WEBGPU_TEST=1 for proper Chrome flags)
 *
 * NOT included in the default test suite — excluded via testPathIgnorePatterns.
 */

import path from 'path';
import webdriver from 'selenium-webdriver';

import SeleniumHelper from '../helpers/selenium-helper';

const {until} = webdriver;

// 5-minute timeout: model download (~2 GB) + load + inference
jest.setTimeout(300000);

const {getDriver, loadUri} = new SeleniumHelper();

const uri = `file://${path.resolve(__dirname, '../../build/index.html')}`;

let driver;

describe('AI Model Loading', () => {
    beforeAll(() => {
        driver = getDriver();
    });

    afterAll(async () => {
        if (driver) await driver.quit();
    });

    test('loads model on startup and logs self-identification', async () => {
        await loadUri(uri);

        // Check WebGPU availability
        const hasWebGPU = await driver.executeScript(
            'return !!navigator.gpu'
        );
        if (!hasWebGPU) {
            // eslint-disable-next-line no-console
            console.warn('Skipping AI model test: no WebGPU support');
            return;
        }

        // Check for SwiftShader (software GPU — too slow for LLM)
        const isSwiftShader = await driver.executeAsyncScript(`
            const callback = arguments[arguments.length - 1];
            try {
                const adapter = await navigator.gpu.requestAdapter();
                if (!adapter) { callback(true); return; }
                const info = adapter.requestAdapterInfo ?
                    adapter.requestAdapterInfo() : adapter.info;
                callback(info?.description?.includes('SwiftShader') ?? false);
            } catch (e) {
                callback(true);
            }
        `);
        if (isSwiftShader) {
            // eslint-disable-next-line no-console
            console.warn('Skipping AI model test: SwiftShader detected');
            return;
        }

        // Wait for model to load (poll window.__aiModelLoaded)
        await driver.wait(
            async () => driver.executeScript('return window.__aiModelLoaded === true'),
            280000,
            'AI model did not load within timeout'
        );

        // Verify generate function is available
        const canGenerate = await driver.executeScript(
            'return typeof window.__aiGenerate === "function"'
        );
        expect(canGenerate).toBe(true);

        // Wait a bit for the verification chat to complete (it's async after model load)
        await driver.wait(
            async () => {
                const logs = await driver.manage().logs().get('browser');
                return logs.some(entry =>
                    entry.message.includes('[ai-model-service] Model self-identification:')
                );
            },
            60000,
            'Model self-identification log not found'
        );
    });
});
