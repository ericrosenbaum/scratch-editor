// @ts-check
// Loads each Songs example, presses the green flag, drives a little interaction, asserts
// it runs without errors, and screenshots the stage. The shots are the source for the
// modal thumbnails: run after `npm run build`
//   npx playwright test songs-examples --project=chromium
// then copy test-results/songs-shots/songs-example-N.png into
// src/components/songs-examples-modal/starters/ and rebuild so they're bundled.
const {test, expect} = require('@playwright/test');
const path = require('path');

const STARTERS = path.resolve(__dirname, '../../src/components/songs-examples-modal/starters');
const SHOTS = path.resolve(__dirname, '../../test-results/songs-shots');

// These examples are ordinary 2D projects, but we only need one browser to capture
// thumbnails; Chromium is enough (and Firefox headless lacks WebGL that other stage
// features may want).
test.skip(({browserName}) => browserName !== 'chromium', 'thumbnails captured in Chromium');

// Stage coordinates (-240..240, -180..180) to screen fractions for clicks.
const frac = (sx, sy) => ({xFrac: (240 + sx) / 480, yFrac: (180 - sy) / 360});

const examples = [
    // Dance Party: dancers animate on the beat; just let it run.
    {file: 'songs-example-1.sb3', shot: 'songs-example-1.png'},
    // Composition: click each instrument to cue its track in so they all light up.
    {file: 'songs-example-2.sb3',
        shot: 'songs-example-2.png',
        clicks: [frac(-165, -30), frac(-55, -30), frac(55, -30), frac(165, -30)]},
    // Gem Hunt: walk up into the centre gem so the score ticks and the music layers up.
    {file: 'songs-example-3.sb3',
        shot: 'songs-example-3.png',
        keys: ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp']}
];

for (const ex of examples) {
    test(`Songs example loads and runs: ${ex.file}`, async ({page}) => {
        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.stack || err.message || String(err)));
        page.on('dialog', d => d.accept());

        await page.goto('index.html');
        await expect(page.getByText('Backpack', {exact: true})).toBeVisible();

        // The Songs welcome modal opens on load; close it first.
        const prompt = page.getByText('press the green flag', {exact: false});
        await prompt.waitFor({timeout: 6000}).catch(() => {});
        const close = page.getByRole('button', {name: 'Close'});
        if (await close.count()) {
            await close.first().click();
            await prompt.waitFor({state: 'detached'}).catch(() => {});
        }

        // Load the example via File > Load from your computer.
        await page.getByText('File', {exact: true}).click();
        const [chooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            page.getByText('Load from your computer', {exact: false}).click()
        ]);
        await chooser.setFiles(path.join(STARTERS, ex.file));
        await page.waitForTimeout(1500);

        // Press the green flag; scripts start the song and the animation. The control
        // is an <img title="Go"> inside the button; clicking it fires the green flag.
        const greenFlag = page.locator('img[title="Go"]').first();
        await greenFlag.click();
        await page.waitForTimeout(1400);

        const stage = page.locator('[class*="stage_stage-wrapper"]').first();

        // Click sprites (e.g. instruments) to fire their "when clicked" scripts.
        if (ex.clicks) {
            const box = await stage.boundingBox();
            for (const c of ex.clicks) {
                await page.mouse.click(box.x + (box.width * c.xFrac), box.y + (box.height * c.yFrac));
                await page.waitForTimeout(300);
            }
        }

        // Drive keyboard-interactive examples. The VM only accepts keys whose event
        // target is the document/body (not a focused button), so blur first.
        if (ex.keys) {
            await page.evaluate(() => document.activeElement && document.activeElement.blur());
            for (const key of ex.keys) {
                await page.keyboard.press(key);
                await page.waitForTimeout(200);
            }
        }

        await page.waitForTimeout(600);
        await stage.screenshot({path: path.join(SHOTS, ex.shot)});

        expect(pageErrors, `uncaught exceptions running ${ex.file}`).toEqual([]);
    });
}
