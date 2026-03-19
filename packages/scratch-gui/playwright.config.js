const {defineConfig, devices} = require('@playwright/test');

module.exports = defineConfig({
    testDir: './test/playwright',
    timeout: 60000,
    expect: {timeout: 10000},
    use: {
        baseURL: 'http://localhost:8601',
        headless: true,
        permissions: ['camera'],
        launchOptions: {
            args: [
                '--use-fake-device-for-media-stream',
                '--use-fake-ui-for-media-stream'
            ]
        }
    },
    webServer: {
        command: 'npm start',
        port: 8601,
        reuseExistingServer: !process.env.CI,
        timeout: 120000
    },
    projects: [
        {
            name: 'chromium',
            use: {...devices['Desktop Chrome']}
        }
    ]
});
