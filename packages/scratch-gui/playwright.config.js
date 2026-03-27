// @ts-check
const {defineConfig} = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
    testDir: './test/playwright',
    timeout: 60000,
    expect: {
        timeout: 10000
    },
    fullyParallel: false,
    retries: 0,
    reporter: 'list',
    use: {
        baseURL: `file://${path.resolve(__dirname, 'build', 'index.html')}`,
        headless: true,
        screenshot: 'only-on-failure',
        trace: 'on-first-retry'
    },
    projects: [
        {
            name: 'chromium',
            use: {
                browserName: 'chromium'
            }
        }
    ]
});
