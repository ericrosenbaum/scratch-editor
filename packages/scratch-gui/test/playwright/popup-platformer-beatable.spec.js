// @ts-check
// Verifies the 3D Platformer example (popup-example-7.sb3) can actually be beaten.
//
// The hero climbs the central tower of platforms by jumping straight up: each platform
// overlaps x = 0 and a jump clears exactly one step, so simply HOLDING space (the jump
// only fires when grounded, so it auto-hops on every landing) walks it to the flag at
// the top. Reaching the flag sets the global "Win" flag to 1, which we read from its
// on-stage monitor. 3D rendering needs WebGL, so this runs in Chromium only.
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

test('3D Pop-Up platformer (example 7) can be beaten', async ({page}) => {
    // The climb itself is ~5 hops, but loading + entering 3D can be slow on a busy
    // machine (parallel workers), so give the whole playthrough plenty of room.
    test.setTimeout(120000);
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
    await chooser.setFiles(path.join(STARTERS, 'popup-example-7.sb3'));
    await page.waitForTimeout(1500);

    // Green flag: builds the tower, pops into 3D and starts the follow camera.
    await page.getByRole('button', {name: 'Start project'}).click();
    await page.waitForTimeout(1200);

    // Win starts at 0.
    expect(await readWin(page)).toBe('0');

    // Hold space to climb. The VM keeps the key "down" until keyup, so the forever loop
    // sees it pressed every frame and auto-hops on each landing.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.down('Space');

    // Poll the Win monitor; the climb is ~5 hops (~4s), so 20s is a generous margin.
    let won = false;
    for (let i = 0; i < 80 && !won; i++) {
        await page.waitForTimeout(250);
        won = (await readWin(page)) === '1';
    }
    await page.keyboard.up('Space');

    expect(won, 'the hero reached the goal flag (Win === 1)').toBe(true);
    expect(pageErrors, 'no uncaught exceptions while playing').toEqual([]);
});
