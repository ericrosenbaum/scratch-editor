// @ts-check
// Verifies the Robot Builder example (popup-example-16.sb3) really articulates.
//
// The robot is six separate sprites (torso, head, two arms, two legs) whose limb
// costumes put their rotation centres at the joints — the 3D scene honours those
// pivots, so turning a part's direction swings it around its shoulder/hip/neck.
// Holding Q must visibly raise the left arm: the stage is otherwise static (drag
// camera, no auto-spin), so the before/after screenshots differing proves a part
// moved, and the final posed screenshot is kept for visual verification.
// 3D rendering needs WebGL, so this runs in Chromium only.
const {test, expect} = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const {dismissExamplesModal} = require('./popup-helpers');

const STARTERS = path.resolve(__dirname, '../../src/components/popup-examples-modal/starters');
const SHOTS = path.resolve(__dirname, '../../test-results/popup-shots');

test.skip(({browserName}) => browserName !== 'chromium', 'WebGL/3D requires Chromium');

test('3D Pop-Up robot (example 16): the parts articulate around their joints', async ({page}) => {
    // A few seconds of key-holding at full frame rate; leave a big margin for
    // slow (software-GL) environments.
    test.setTimeout(240000);
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.stack || err.message || String(err)));
    page.on('dialog', d => d.accept());

    await page.goto('index.html');
    await expect(page.getByText('Backpack', {exact: true})).toBeVisible();
    await dismissExamplesModal(page);

    // Load the robot via File > Load from your computer.
    await page.getByText('File', {exact: true}).click();
    const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByText('Load from your computer', {exact: false}).click()
    ]);
    await chooser.setFiles(path.join(STARTERS, 'popup-example-16.sb3'));
    await page.waitForTimeout(1500);

    // Green flag: assembles the robot in 3D (drag camera; nothing moves by itself
    // once the head's instruction bubble is up).
    await page.getByRole('button', {name: 'Start project'}).click();
    await page.waitForTimeout(2500);

    const stage = page.locator('canvas').first();
    const before = path.join(SHOTS, 'robot-rest.png');
    const after = path.join(SHOTS, 'robot-arm-raised.png');
    await stage.screenshot({path: before});

    // Hold Q: the left arm should swing up around its shoulder bolt.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.down('q');
    await page.waitForTimeout(3000);
    await page.keyboard.up('q');
    await page.waitForTimeout(400);
    await stage.screenshot({path: after});

    expect(
        fs.readFileSync(before).equals(fs.readFileSync(after)),
        'the stage changed while Q was held (the arm moved)'
    ).toBe(false);

    // Strike a pose for the visual record: both arms up, legs mid-march, head nod.
    await page.keyboard.down('p');
    await page.keyboard.down('ArrowLeft');
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(2500);
    await page.keyboard.up('p');
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(300);
    await stage.screenshot({path: path.join(SHOTS, 'robot-pose.png')});

    expect(pageErrors, 'no uncaught exceptions while posing').toEqual([]);
});
