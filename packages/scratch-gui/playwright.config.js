const {defineConfig} = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
    testDir: './test/playwright',
    timeout: 60000,
    retries: 1,
    use: {
        headless: true,
        screenshot: 'only-on-failure'
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
