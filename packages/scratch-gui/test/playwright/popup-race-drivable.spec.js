// @ts-check
// Verifies the Race Day example (popup-example-14.sb3) is actually drivable.
//
// The car spawns on the finish line of a giant track map (a single 1920x1440 SVG
// drawing laid flat far beyond the old sprite fence), facing down the bottom
// straight with the first checkered gate 400 units dead ahead. Holding the up arrow
// drives the car forward along its heading ("move in 3D"), so the gate registers the
// car driving through it and bumps the global "Gates" counter — proving the whole
// loop: driving, the shoulder camera, 3D gate collision and the race scoring. The
// full lap (steering through all four gates) is for humans. 3D rendering needs
// WebGL, so this runs in Chromium only.
const {test, expect} = require('@playwright/test');
const path = require('path');
const {dismissExamplesModal} = require('./popup-helpers');

const STARTERS = path.resolve(__dirname, '../../src/components/popup-examples-modal/starters');

test.skip(({browserName}) => browserName !== 'chromium', 'WebGL/3D requires Chromium');

// Read the value shown in the "Gates" variable monitor (the label div's sibling), or null.
const readGates = page => page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('[class*="label"]'));
    for (const label of labels) {
        if (label.textContent && label.textContent.trim() === 'Gates') {
            const value = label.parentElement.querySelector('[class*="value"]');
            return value ? value.textContent.trim() : null;
        }
    }
    return null;
});

test('3D Pop-Up race (example 14): driving through the first gate scores it', async ({page}) => {
    // Reaching the gate is ~2s of driving at full frame rate, but headless/software-GL
    // environments can step the VM at a fraction of real time: leave a big margin.
    test.setTimeout(240000);
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.stack || err.message || String(err)));
    page.on('dialog', d => d.accept());

    await page.goto('index.html');
    await expect(page.getByText('Backpack', {exact: true})).toBeVisible();
    await dismissExamplesModal(page);

    // Load the race via File > Load from your computer.
    await page.getByText('File', {exact: true}).click();
    const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByText('Load from your computer', {exact: false}).click()
    ]);
    await chooser.setFiles(path.join(STARTERS, 'popup-example-14.sb3'));
    await page.waitForTimeout(1500);

    // Green flag: builds the world, pops into 3D and puts the camera behind the car.
    await page.getByRole('button', {name: 'Start project'}).click();
    await page.waitForTimeout(1200);

    // No gates passed yet.
    expect(await readGates(page)).toBe('0');

    // Hold up to drive straight down the opening straight, through gate 1.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.down('ArrowUp');
    let gates = 0;
    for (let i = 0; i < 240 && gates < 1; i++) {
        await page.waitForTimeout(500);
        gates = Number(await readGates(page)) || 0;
    }
    await page.keyboard.up('ArrowUp');

    expect(gates, 'the car drove through the first gate (Gates >= 1)').toBeGreaterThanOrEqual(1);
    expect(pageErrors, 'no uncaught exceptions while driving').toEqual([]);
});
