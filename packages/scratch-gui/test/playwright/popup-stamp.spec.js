// @ts-check
const {test, expect} = require('@playwright/test');
const path = require('path');
const {dragStage, dismissExamplesModal, clickBlock} = require('./popup-helpers');

const SHOTS = path.resolve(__dirname, '../../test-results/popup-shots');
const FIXTURE = path.resolve(__dirname, '../fixtures/popup-diorama.sb3');

// 3D rendering needs WebGL, which Firefox headless lacks. Chromium only.
test.skip(({browserName}) => browserName !== 'chromium', 'WebGL/3D requires Chromium');

test('3D Pop-Up: "stamp in 3D" leaves a persistent copy where the sprite was', async ({page}) => {
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.stack || err.message || String(err)));
    page.on('dialog', d => d.accept());

    await page.goto('index.html');
    await expect(page.getByText('Backpack', {exact: true})).toBeVisible();
    // The 3D Pop-Up welcome modal opens on load; close it to use the editor.
    await dismissExamplesModal(page);

    // Load the diorama fixture.
    await page.getByText('File', {exact: true}).click();
    const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByText('Load from your computer', {exact: false}).click()
    ]);
    await chooser.setFiles(FIXTURE);
    await expect(page.getByText('Star', {exact: true})).toBeVisible({timeout: 15000});

    // Add the extension and select the Star.
    await page.getByRole('button', {name: 'Add Extension'}).click();
    await page.getByRole('button', {name: /^3D Pop-Up /}).click();
    await expect(page.getByText('stamp in 3D', {exact: false}).first()).toBeVisible();
    // Palette dropdowns also read "Star", so target the sprite-selector item's button.
    await page.getByRole('button', {name: 'Star', exact: true}).click();

    // Stamp the Star at its current spot, then move the live Star to the right.
    await clickBlock(page, 'stamp in 3D');
    const xInput = page.getByPlaceholder('x').first();
    await xInput.fill('150');
    await xInput.press('Enter');

    // Set a sky and enter the camera (drag) mode, then drag to spin so both the
    // stamp (left, where the Star was) and the live Star (right) are visible.
    await clickBlock(page, 'set sky to');
    await clickBlock(page, 'set camera to');

    const stage = page.locator('canvas').first();
    await page.waitForTimeout(400);
    await stage.screenshot({path: path.join(SHOTS, 'stamp-1.png')});
    await dragStage(page, stage, 0.7, 0.3);
    await page.waitForTimeout(200);
    await stage.screenshot({path: path.join(SHOTS, 'stamp-2.png')});

    expect(pageErrors, 'uncaught exceptions during stamp run').toEqual([]);
});
