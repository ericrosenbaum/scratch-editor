// @ts-check
const {test, expect} = require('@playwright/test');
const path = require('path');
const {dragStage, dismissExamplesModal, clickBlock} = require('./popup-helpers');

const SHOTS = path.resolve(__dirname, '../../test-results/popup-shots');

// The 3D Pop-Up extension renders with WebGL (three.js), which Firefox's headless
// mode doesn't support. Run this verification in Chromium only.
test.skip(({browserName}) => browserName !== 'chromium', 'WebGL/3D requires Chromium');

test('3D Pop-Up: add extension, set camera, drag the stage to spin into 3D', async ({page}) => {
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.stack || err.message || String(err)));

    await page.goto('index.html');
    await expect(page.getByText('Backpack', {exact: true})).toBeVisible();
    // The 3D Pop-Up welcome modal opens on load; close it to use the editor.
    await dismissExamplesModal(page);

    // Baseline: the flat 2D stage with the default cat.
    await page.waitForTimeout(1500);
    const stage = page.locator('canvas').first();
    await stage.screenshot({path: path.join(SHOTS, '1-flat-2d.png')});

    // Open the extension library and add "3D Pop-Up".
    await page.getByRole('button', {name: 'Add Extension'}).click();
    const card = page.getByText('3D Pop-Up', {exact: true});
    await expect(card).toBeVisible();
    await card.click();

    // The Pop-Up blocks are now in the palette.
    const cameraBlock = page.getByText('set camera to', {exact: false}).first();
    await expect(cameraBlock).toBeVisible();

    // Set a sky and the camera (defaults to "drag to spin"), by clicking the blocks.
    await clickBlock(page, 'set sky to');
    await cameraBlock.click();

    // The drawing is now an extruded 3D pop-up under the sky; drag the stage to spin.
    await page.waitForTimeout(400);
    await stage.screenshot({path: path.join(SHOTS, '2-drag-start.png')});
    await dragStage(page, stage, 0.72, 0.2);
    await page.waitForTimeout(200);
    await stage.screenshot({path: path.join(SHOTS, '3-drag-turned.png')});

    expect(pageErrors, 'uncaught exceptions during 3D Pop-Up run').toEqual([]);
});
