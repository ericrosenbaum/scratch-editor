// @ts-check
const {test, expect} = require('@playwright/test');
const path = require('path');

const SHOTS = path.resolve(__dirname, '../../test-results/popup-shots');

// 3D rendering needs WebGL, which Firefox headless lacks. Chromium only.
test.skip(({browserName}) => browserName !== 'chromium', 'WebGL/3D requires Chromium');

// Note: opening an example uses fetch(), which Chromium blocks under the file://
// baseURL these tests run against, so this spec verifies the modal opens on GUI load
// with the examples and that choosing one dismisses it. The examples themselves
// loading and running in 3D is verified in popup-examples.spec.js.
test('3D Pop-Up: welcome modal opens on GUI load with the example projects', async ({page}) => {
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.stack || err.message || String(err)));
    page.on('dialog', d => d.accept());

    await page.goto('index.html');
    await expect(page.getByText('Backpack', {exact: true})).toBeVisible();

    // The welcome modal opens on load, showing every example (one card per starter).
    await expect(page.getByText('Open an example to get started:', {exact: false})).toBeVisible();
    await expect(page.getByTestId('popup-example')).toHaveCount(14);
    await expect(page.getByText('Pop-Up Card', {exact: true})).toBeVisible();
    await expect(page.getByText('Fish Tank', {exact: true})).toBeVisible();
    await expect(page.getByText('Build a Forest', {exact: true})).toBeVisible();
    await expect(page.getByText('Space Flyer', {exact: true})).toBeVisible();
    await expect(page.getByText('Jump!', {exact: true})).toBeVisible();
    await expect(page.getByText('Magic Garden', {exact: true})).toBeVisible();
    await page.screenshot({path: path.join(SHOTS, 'modal.png')});

    // Choosing an example dismisses the modal.
    await page.getByText('Fish Tank', {exact: true}).click();
    await expect(page.getByText('Open an example to get started:', {exact: false})).toHaveCount(0);

    expect(pageErrors, 'uncaught exceptions during modal flow').toEqual([]);
});
