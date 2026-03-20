const {defineConfig} = require('@playwright/test');

module.exports = defineConfig({
    testDir: './test/e2e',
    testMatch: '**/*.spec.js',
    timeout: 60000,
    retries: 0,
    use: {
        baseURL: 'http://localhost:8601',
        headless: true,
        screenshot: 'only-on-failure'
    },
    projects: [
        {
            name: 'chromium',
            use: {
                browserName: 'chromium',
                permissions: ['microphone'],
                launchOptions: {
                    args: [
                        '--use-fake-device-for-media-stream',
                        '--use-fake-ui-for-media-stream',
                        '--use-gl=angle',
                        '--use-angle=swiftshader'
                    ]
                }
            }
        }
    ],
    webServer: {
        command: 'npm run start',
        url: 'http://localhost:8601',
        reuseExistingServer: true,
        timeout: 120000
    }
});
