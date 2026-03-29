const {defineConfig} = require('@playwright/test');

module.exports = defineConfig({
    testDir: './test/playwright',
    timeout: 60000,
    expect: {
        timeout: 10000
    },
    use: {
        baseURL: 'http://localhost:8601',
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
        url: 'http://localhost:8601',
        reuseExistingServer: true,
        timeout: 120000
    }
});
