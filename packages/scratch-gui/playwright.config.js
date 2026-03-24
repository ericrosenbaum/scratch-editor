const {defineConfig} = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
    testDir: path.resolve(__dirname, 'test/playwright'),
    timeout: 120000,
    expect: {
        timeout: 15000
    },
    fullyParallel: false,
    retries: 0,
    workers: 1,
    reporter: 'list',
    use: {
        headless: true,
        viewport: {width: 1280, height: 800},
        actionTimeout: 15000,
        baseURL: `file://${path.resolve(__dirname, 'build')}`
    },
    projects: [
        {
            name: 'chromium',
            use: {
                browserName: 'chromium',
                launchOptions: {
                    executablePath: '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
                    args: [
                        '--disable-gpu',
                        '--no-sandbox',
                        '--disable-web-security'
                    ]
                }
            }
        }
    ]
});
