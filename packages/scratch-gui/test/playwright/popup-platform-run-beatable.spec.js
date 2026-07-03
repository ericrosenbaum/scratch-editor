// @ts-check
// Verifies the Platform Run example (popup-example-13.sb3) can actually be beaten.
//
// The level is a long row of platforms along +x (0..2800 — far beyond the old sprite
// fence, which the 3D Pop-Up extension now switches off), with an over-the-shoulder
// camera behind the hero. Holding right + space runs the row auto-hopping on every
// landing; a fall respawns the hero at the last platform it stood on, so the crude
// hold-both-keys strategy always converges on the goal (validated against the layout
// by simulation in make-popup-examples.js, and end-to-end here). Reaching the goal
// sets the global "Win" flag to 1, which we read from its on-stage monitor.
// 3D rendering needs WebGL, so this runs in Chromium only.
const {test, expect} = require('@playwright/test');
const path = require('path');
const {dismissExamplesModal} = require('./popup-helpers');

const STARTERS = path.resolve(__dirname, '../../src/components/popup-examples-modal/starters');

test.skip(({browserName}) => browserName !== 'chromium', 'WebGL/3D requires Chromium');

// Read the value shown in the "Win" variable monitor (the label div's sibling), or null.
const readWin = page => page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('[class*="label"]'));
    for (const label of labels) {
        if (label.textContent && label.textContent.trim() === 'Win') {
            const value = label.parentElement.querySelector('[class*="value"]');
            return value ? value.textContent.trim() : null;
        }
    }
    return null;
});

test('3D Pop-Up platform run (example 13) can be beaten', async ({page}) => {
    // The full run is ~2800 units at ~8/frame plus a respawn or two: allow well over a minute.
    test.setTimeout(150000);
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.stack || err.message || String(err)));
    page.on('dialog', d => d.accept());

    await page.goto('index.html');
    await expect(page.getByText('Backpack', {exact: true})).toBeVisible();
    await dismissExamplesModal(page);

    // Load the platformer via File > Load from your computer.
    await page.getByText('File', {exact: true}).click();
    const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByText('Load from your computer', {exact: false}).click()
    ]);
    await chooser.setFiles(path.join(STARTERS, 'popup-example-13.sb3'));
    await page.waitForTimeout(1500);

    // Green flag: builds the row, pops into 3D and puts the camera behind the hero.
    await page.getByRole('button', {name: 'Start project'}).click();
    await page.waitForTimeout(1200);

    // Win starts at 0.
    expect(await readWin(page)).toBe('0');

    // Hold right + space to run the row. The VM keeps both keys "down" until keyup, so
    // the forever loop sees them pressed every frame: the hero runs right continuously
    // and auto-hops on every landing.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('Space');

    // Poll the Win monitor; the run is ~20s in simulation, so 90s is a generous margin.
    let won = false;
    for (let i = 0; i < 360 && !won; i++) {
        await page.waitForTimeout(250);
        won = (await readWin(page)) === '1';
    }
    await page.keyboard.up('Space');
    await page.keyboard.up('ArrowRight');

    expect(won, 'the hero reached the goal flag (Win === 1)').toBe(true);
    expect(pageErrors, 'no uncaught exceptions while playing').toEqual([]);
});
