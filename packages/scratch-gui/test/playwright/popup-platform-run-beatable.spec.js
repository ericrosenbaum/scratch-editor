// @ts-check
// Verifies the Platform Run example (popup-example-13.sb3) can actually be beaten.
//
// The level is an ascending trail of square tiles along the DEPTH axis (0..-2280 —
// far beyond the old sprite fence, which the 3D Pop-Up extension now switches off),
// staggered left and right, with an over-the-shoulder camera behind the hero. "Move
// in 3D" carries the hero forward along the depth axis, so holding up + space runs
// the trail auto-hopping on every landing; a fall respawns the hero at the last tile
// it stood on, so the crude hold-both-keys strategy always converges on the goal
// (validated against the layout by simulation in make-popup-examples.js, and
// end-to-end here). Reaching the goal sets the global "Win" flag to 1, which we read
// from its on-stage monitor. 3D rendering needs WebGL, so this runs in Chromium only.
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
    // The full run is ~15s of play at full frame rate, but headless/software-GL
    // environments can step the VM at a fraction of real time, so allow several
    // minutes before giving up.
    test.setTimeout(330000);
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

    // Hold up + space to run the trail. The VM keeps both keys "down" until keyup, so
    // the forever loop sees them pressed every frame: the hero runs forward (along the
    // depth axis) continuously and auto-hops on every landing.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('Space');

    // Poll the Win monitor; the run is ~15s in simulation at 30fps, but leave a very
    // generous margin for slow (software-GL) environments.
    let won = false;
    for (let i = 0; i < 560 && !won; i++) {
        await page.waitForTimeout(500);
        won = (await readWin(page)) === '1';
    }
    await page.keyboard.up('Space');
    await page.keyboard.up('ArrowUp');

    expect(won, 'the hero reached the goal flag (Win === 1)').toBe(true);
    expect(pageErrors, 'no uncaught exceptions while playing').toEqual([]);
});
