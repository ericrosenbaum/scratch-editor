// @ts-check
// Verifies the Tiny Town example (popup-example-15.sb3) is actually explorable.
//
// The cat drops into a big open world (a giant map SVG far beyond the old sprite
// fence) facing the welcome sign, which stands a short walk straight ahead. Holding
// the up arrow walks the cat into it; the bump makes the sign SAY its welcome line —
// with the speech bubble anchored to the sign's projected 3D position via the
// runtime's bubblePositionProvider — and ticks the global "Found" counter, which we
// read from its monitor. That proves the whole loop: walking, the shoulder camera,
// 3D bump detection, the discovery counter and 3D-anchored bubbles (the bubble
// placement itself is captured in a screenshot for visual checking). 3D rendering
// needs WebGL, so this runs in Chromium only.
const {test, expect} = require('@playwright/test');
const path = require('path');
const {dismissExamplesModal} = require('./popup-helpers');

const STARTERS = path.resolve(__dirname, '../../src/components/popup-examples-modal/starters');
const SHOTS = path.resolve(__dirname, '../../test-results/popup-shots');

test.skip(({browserName}) => browserName !== 'chromium', 'WebGL/3D requires Chromium');

// Read the value shown in the "Found" variable monitor (the label div's sibling), or null.
const readFound = page => page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('[class*="label"]'));
    for (const label of labels) {
        if (label.textContent && label.textContent.trim() === 'Found') {
            const value = label.parentElement.querySelector('[class*="value"]');
            return value ? value.textContent.trim() : null;
        }
    }
    return null;
});

test('3D Pop-Up town (example 15): bumping the welcome sign counts as a discovery', async ({page}) => {
    // Reaching the sign is ~1s of walking at full frame rate, but headless/software-GL
    // environments can step the VM at a fraction of real time: leave a big margin.
    test.setTimeout(240000);
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.stack || err.message || String(err)));
    page.on('dialog', d => d.accept());

    await page.goto('index.html');
    await expect(page.getByText('Backpack', {exact: true})).toBeVisible();
    await dismissExamplesModal(page);

    // Load the town via File > Load from your computer.
    await page.getByText('File', {exact: true}).click();
    const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByText('Load from your computer', {exact: false}).click()
    ]);
    await chooser.setFiles(path.join(STARTERS, 'popup-example-15.sb3'));
    await page.waitForTimeout(1500);

    // Green flag: builds the world, pops into 3D and puts the camera behind the cat.
    await page.getByRole('button', {name: 'Start project'}).click();
    await page.waitForTimeout(1200);

    // Nothing found yet.
    expect(await readFound(page)).toBe('0');

    // Walk straight ahead into the welcome sign.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.down('ArrowUp');
    let found = 0;
    for (let i = 0; i < 240 && found < 1; i++) {
        await page.waitForTimeout(500);
        found = Number(await readFound(page)) || 0;
    }
    await page.keyboard.up('ArrowUp');

    expect(found, 'the cat discovered the welcome sign (Found >= 1)').toBeGreaterThanOrEqual(1);

    // Capture the moment right away for visual verification: the sign says its
    // welcome line for 2.5s from the bump, with the bubble hanging over the sign's
    // projected 3D position.
    const stage = page.locator('canvas').first();
    await stage.screenshot({path: path.join(SHOTS, 'town-sign-bubble.png')});

    expect(pageErrors, 'no uncaught exceptions while exploring').toEqual([]);
});
