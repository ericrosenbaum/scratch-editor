// @ts-check
const {test, expect} = require('@playwright/test');
const path = require('path');
const {dragStage, dismissExamplesModal} = require('./popup-helpers');

const SHOTS = path.resolve(__dirname, '../../test-results/popup-shots');
const STARTERS = path.resolve(__dirname, '../../src/components/popup-examples-modal/starters');

// 3D rendering needs WebGL, which Firefox headless lacks. Chromium only.
test.skip(({browserName}) => browserName !== 'chromium', 'WebGL/3D requires Chromium');

const examples = [
    {file: 'popup-example-1.sb3', shot: 'example-card.png', drag: true},
    {file: 'popup-example-2.sb3', shot: 'example-fish.png', drag: false},
    {file: 'popup-example-3.sb3', shot: 'example-forest.png', drag: true},
    // Keyboard-interactive examples: drive the arrow keys / space, then capture.
    {file: 'popup-example-4.sb3',
        shot: 'example-space.png',
        drag: true,
        keys: ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowRight', 'ArrowRight']},
    {file: 'popup-example-5.sb3',
        shot: 'example-jump.png',
        drag: true,
        keys: ['ArrowRight', 'ArrowRight', 'Space']},
    {file: 'popup-example-6.sb3',
        shot: 'example-garden.png',
        drag: true,
        keys: ['Space', 'ArrowRight', 'ArrowRight', 'Space', 'ArrowUp', 'ArrowUp', 'Space',
            'ArrowRight', 'ArrowRight', 'Space']}
];

for (const ex of examples) {
    test(`3D Pop-Up example loads and runs: ${ex.file}`, async ({page}) => {
        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.stack || err.message || String(err)));
        page.on('dialog', d => d.accept());

        await page.goto('index.html');
        await expect(page.getByText('Backpack', {exact: true})).toBeVisible();
        // The 3D Pop-Up welcome modal opens on load; close it first.
        await dismissExamplesModal(page);

        // Load the example via File > Load from your computer.
        await page.getByText('File', {exact: true}).click();
        const [chooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            page.getByText('Load from your computer', {exact: false}).click()
        ]);
        await chooser.setFiles(path.join(STARTERS, ex.file));
        await page.waitForTimeout(1500);

        // Press the green flag; the scripts set the sky + camera and pop into 3D.
        await page.getByRole('button', {name: 'Start project'}).click();
        await page.waitForTimeout(1500);

        // Drive keyboard-interactive examples. The VM only accepts keys whose event
        // target is the document/body/SVG (not a focused button), so blur first.
        if (ex.keys) {
            await page.evaluate(() => document.activeElement && document.activeElement.blur());
            for (const key of ex.keys) {
                await page.keyboard.press(key);
                await page.waitForTimeout(150);
            }
            await page.waitForTimeout(400);
        }

        const stage = page.locator('canvas').first();
        if (ex.drag) await dragStage(page, stage, 0.68, 0.32);
        await page.waitForTimeout(300);
        await stage.screenshot({path: path.join(SHOTS, ex.shot)});

        expect(pageErrors, `uncaught exceptions running ${ex.file}`).toEqual([]);
    });
}
