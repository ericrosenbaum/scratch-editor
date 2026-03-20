const {defineConfig} = require('@playwright/test');

module.exports = defineConfig({
    testDir: './test/playwright',
    timeout: 60000,
    expect: {
        timeout: 10000
    },
    use: {
        baseURL: 'http://localhost:8601',
        trace: 'on-first-retry'
    },
    webServer: {
        command: 'npm start',
        url: 'http://localhost:8601',
        reuseExistingServer: true,
        timeout: 120000
    },
    projects: [
        {
            name: 'chromium',
            use: {
                browserName: 'chromium',
                launchOptions: {
                    args: [
                        '--use-fake-device-for-media-stream',
                        '--use-fake-ui-for-media-stream',
                        '--use-gl=swiftshader'
                    ]
                }
            }
        }
    ]
});
