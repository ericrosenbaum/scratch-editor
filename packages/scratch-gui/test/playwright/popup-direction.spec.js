// @ts-check
const {test, expect} = require('@playwright/test');
const path = require('path');
const {dismissExamplesModal, clickBlock} = require('./popup-helpers');

const SHOTS = path.resolve(__dirname, '../../test-results/popup-shots');
const FIXTURE = path.resolve(__dirname, '../fixtures/popup-direction.sb3');

// 3D rendering needs WebGL, which Firefox headless lacks. Chromium only.
test.skip(({browserName}) => browserName !== 'chromium', 'WebGL/3D requires Chromium');

test('3D Pop-Up: the extruded sprite follows the sprite direction', async ({page}) => {
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.stack || err.message || String(err)));
    page.on('dialog', d => d.accept());

    await page.goto('index.html');
    await expect(page.getByText('Backpack', {exact: true})).toBeVisible();
    // The 3D Pop-Up welcome modal opens on load; close it to use the editor.
    await dismissExamplesModal(page);

    // The fixture has one right-pointing arrow set to direction 0 (i.e. pointing up).
    await page.getByText('File', {exact: true}).click();
    const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByText('Load from your computer', {exact: false}).click()
    ]);
    await chooser.setFiles(FIXTURE);
    await expect(page.getByText('Arrow', {exact: true})).toBeVisible({timeout: 15000});
    await page.waitForTimeout(800);
    const stage = page.locator('canvas').first();
    await stage.screenshot({path: path.join(SHOTS, 'direction-2d.png')});

    // Go 3D. The arrow should still point up (direction is honoured), not right.
    await page.getByRole('button', {name: 'Add Extension'}).click();
    await page.getByRole('button', {name: /^3D Pop-Up /}).click();
    await clickBlock(page, 'set sky to');
    await clickBlock(page, 'set camera to');
    await page.waitForTimeout(1200);
    await stage.screenshot({path: path.join(SHOTS, 'direction-3d.png')});

    expect(pageErrors, 'uncaught exceptions during direction run').toEqual([]);
});
