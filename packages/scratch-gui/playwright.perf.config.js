// @ts-check
const {defineConfig, devices} = require('@playwright/test');

/**
 * Performance harness config for the paint editor's background-removal feature.
 *
 * Isolated from the unit-style playwright.config.js because:
 *   - Runs against the live webpack-dev-server (http://) so COOP/COEP headers
 *     apply, enabling crossOriginIsolated. The default config uses file://,
 *     which can't set HTTP headers and so blocks SharedArrayBuffer and the
 *     WebGPU backend in ONNX Runtime.
 *   - Adds Chromium flags to enable the WebGPU backend.
 *   - Disables parallelism so successive runs don't fight over the GPU/cache.
 */
module.exports = defineConfig({
    testDir: './test/playwright-perf',

    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 5 * 60 * 1000,

    outputDir: 'test-results/playwright-perf-artifacts',
    reporter: [
        ['list'],
        ['html', {outputFolder: 'test-results/playwright-perf-html', open: 'never'}]
    ],

    use: {
        baseURL: 'http://localhost:8601/',
        trace: 'retain-on-failure'
    },

    webServer: {
        command: 'npm start',
        url: 'http://localhost:8601/',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe'
    },

    projects: [
        {
            name: 'chromium-perf',
            use: {
                ...devices['Desktop Chrome'],
                launchOptions: {
                    args: [
                        '--enable-unsafe-webgpu',
                        '--enable-features=Vulkan,UseSkiaRenderer',
                        '--use-angle=metal',
                        '--disable-dawn-features=disallow_unsafe_apis'
                    ]
                }
            }
        }
    ]
});
