const {defineConfig} = require('@playwright/test');

const port = process.env.PORT || 8601;

module.exports = defineConfig({
    testDir: './test/playwright',
    timeout: 60000,
    expect: {
        timeout: 10000
    },
    use: {
        baseURL: `http://localhost:${port}`,
        launchOptions: {
            args: [
                '--use-fake-device-for-media-stream',
                '--use-fake-ui-for-media-stream',
                '--enable-unsafe-webgpu',
                '--enable-features=Vulkan',
                '--use-vulkan=swiftshader',
                '--enable-gpu-rasterization',
                '--disable-gpu-sandbox'
            ]
        }
    },
    workers: 1,
    webServer: {
        command: 'npm start',
        url: `http://localhost:${port}`,
        reuseExistingServer: true,
        timeout: 120000
    }
});
