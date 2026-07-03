// @ts-check
const {test, expect} = require('@playwright/test');
const path = require('path');
const {dragStage, dismissExamplesModal, clickBlock} = require('./popup-helpers');

const SHOTS = path.resolve(__dirname, '../../test-results/popup-shots');
const FIXTURE = path.resolve(__dirname, '../fixtures/popup-diorama.sb3');

// 3D rendering needs WebGL, which Firefox headless lacks. Chromium only.
test.skip(({browserName}) => browserName !== 'chromium', 'WebGL/3D requires Chromium');

test('3D Pop-Up diorama: backdrop becomes a back wall, sprites sit at different depths', async ({page}) => {
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.stack || err.message || String(err)));
    page.on('dialog', d => d.accept()); // accept the "replace project?" confirm if shown

    await page.goto('index.html');
    await expect(page.getByText('Backpack', {exact: true})).toBeVisible();
    // The 3D Pop-Up welcome modal opens on load; close it to use the editor.
    await dismissExamplesModal(page);

    // Load the diorama fixture via File > Load from your computer.
    await page.getByText('File', {exact: true}).click();
    const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByText('Load from your computer', {exact: false}).click()
    ]);
    await chooser.setFiles(FIXTURE);

    // Wait for the fixture's sprites to appear in the sprite list.
    await expect(page.getByText('Balloon', {exact: true})).toBeVisible({timeout: 15000});
    await expect(page.getByText('Star', {exact: true})).toBeVisible();
    await page.waitForTimeout(1000);
    const stage = page.locator('canvas').first();
    await stage.screenshot({path: path.join(SHOTS, 'diorama-1-flat.png')});

    // Add the 3D Pop-Up extension.
    await page.getByRole('button', {name: 'Add Extension'}).click();
    await page.getByRole('button', {name: /^3D Pop-Up /}).click();
    await expect(page.getByText('set camera to', {exact: false}).first()).toBeVisible();

    // Push the Balloon deep into the scene: select it, then click "change depth by".
    await page.getByText('Balloon', {exact: true}).click();
    // Two clicks of "change depth by (50)" -> depth 100, sitting between the
    // front (Star at depth 0) and the back wall.
    const changeDepth = page.getByText('change depth by', {exact: false}).first();
    await changeDepth.click();
    await changeDepth.click();

    // Set a sky and orbit the camera.
    await clickBlock(page, 'set sky to');
    await clickBlock(page, 'set camera to');

    // Drag the stage to orbit so depth (Star in front, Balloon mid, backdrop as the
    // back wall) becomes visible.
    await page.waitForTimeout(400);
    await stage.screenshot({path: path.join(SHOTS, 'diorama-2-front.png')});
    await dragStage(page, stage, 0.7, 0.25);
    await page.waitForTimeout(200);
    await stage.screenshot({path: path.join(SHOTS, 'diorama-3-turned.png')});

    expect(pageErrors, 'uncaught exceptions during diorama run').toEqual([]);
});
