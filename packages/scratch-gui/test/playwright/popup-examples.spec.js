// @ts-check
const {test, expect} = require('@playwright/test');
const path = require('path');
const {dragStage, dismissExamplesModal} = require('./popup-helpers');

const SHOTS = path.resolve(__dirname, '../../test-results/popup-shots');
const STARTERS = path.resolve(__dirname, '../../src/components/popup-examples-modal/starters');

// 3D rendering needs WebGL, which Firefox headless lacks. Chromium only.
test.skip(({browserName}) => browserName !== 'chromium', 'WebGL/3D requires Chromium');

const examples = [
    {file: 'popup-example-1.sb3', shot: 'example-card.png', drag: true},
    {file: 'popup-example-2.sb3', shot: 'example-fish.png', drag: true},
    {file: 'popup-example-3.sb3', shot: 'example-forest.png', drag: true},
    // Keyboard-interactive examples: drive the arrow keys / space, then capture.
    {file: 'popup-example-4.sb3',
        shot: 'example-space.png',
        drag: true,
        keys: ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowRight', 'ArrowRight']},
    {file: 'popup-example-5.sb3',
        shot: 'example-jump.png',
        drag: true,
        keys: ['ArrowRight', 'ArrowRight', 'Space']},
    {file: 'popup-example-6.sb3',
        shot: 'example-garden.png',
        drag: true,
        keys: ['Space', 'ArrowRight', 'ArrowRight', 'Space', 'ArrowUp', 'ArrowUp', 'Space',
            'ArrowRight', 'ArrowRight', 'Space']},
    // Platformer: jump up the tower of floating platforms (the camera follows the hero).
    // A full beatable playthrough is covered by popup-platformer-beatable.spec.js.
    {file: 'popup-example-7.sb3',
        shot: 'example-platformer.png',
        drag: true,
        keys: ['Space', 'Space', 'Space']},
    // Birthday card: click around the upper stage to pop balloons; runs its own
    // animated effects on the green flag.
    {file: 'popup-example-8.sb3',
        shot: 'example-birthday.png',
        drag: true,
        clicks: [{xFrac: 0.32, yFrac: 0.52}, {xFrac: 0.68, yFrac: 0.45}, {xFrac: 0.5, yFrac: 0.78}]},
    // Crystal: auto-orbits, so no drag needed; the crossed clones build on green flag.
    {file: 'popup-example-9.sb3',
        shot: 'example-crystal.png',
        drag: false},
    // Solar system: planets orbit the sun on the green flag; camera auto-orbits.
    {file: 'popup-example-10.sb3',
        shot: 'example-solar.png',
        drag: false},
    // Gem hunt: roam in 3D (across + into/out of the scene) collecting gems.
    {file: 'popup-example-11.sb3',
        shot: 'example-gems.png',
        drag: true,
        keys: ['ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp']},
    // Carousel: clones are placed + revolved with the orbit block; camera auto-orbits.
    {file: 'popup-example-12.sb3',
        shot: 'example-carousel.png',
        drag: false},
    // Platform run: an ascending, staggered trail of tiles along the depth axis; the
    // camera sits behind the hero (over-the-shoulder), so no stage drag is needed. A
    // full beatable playthrough is covered by popup-platform-run-beatable.spec.js.
    {file: 'popup-example-13.sb3',
        shot: 'example-platform-run.png',
        drag: false,
        keys: ['ArrowUp', 'ArrowUp', 'Space']},
    // Race day: drive down the opening straight of the giant track map; the camera
    // rides behind the car. A drive through the first gate is covered by
    // popup-race-drivable.spec.js.
    {file: 'popup-example-14.sb3',
        shot: 'example-race.png',
        drag: false,
        keys: ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp']}
];

for (const ex of examples) {
    test(`3D Pop-Up example loads and runs: ${ex.file}`, async ({page}) => {
        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.stack || err.message || String(err)));
        page.on('dialog', d => d.accept());

        await page.goto('index.html');
        await expect(page.getByText('Backpack', {exact: true})).toBeVisible();
        // The 3D Pop-Up welcome modal opens on load; close it first.
        await dismissExamplesModal(page);

        // Load the example via File > Load from your computer.
        await page.getByText('File', {exact: true}).click();
        const [chooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            page.getByText('Load from your computer', {exact: false}).click()
        ]);
        await chooser.setFiles(path.join(STARTERS, ex.file));
        await page.waitForTimeout(1500);

        // Press the green flag; the scripts set the sky + camera and pop into 3D.
        await page.getByRole('button', {name: 'Start project'}).click();
        await page.waitForTimeout(1500);

        // Drive keyboard-interactive examples. The VM only accepts keys whose event
        // target is the document/body/SVG (not a focused button), so blur first.
        if (ex.keys) {
            await page.evaluate(() => document.activeElement && document.activeElement.blur());
            for (const key of ex.keys) {
                await page.keyboard.press(key);
                await page.waitForTimeout(150);
            }
            await page.waitForTimeout(400);
        }

        const stage = page.locator('canvas').first();

        // Click sprites on the stage (e.g. balloons) to fire their "when clicked" scripts.
        if (ex.clicks) {
            const box = await stage.boundingBox();
            for (const c of ex.clicks) {
                await page.mouse.click(box.x + (box.width * c.xFrac), box.y + (box.height * c.yFrac));
                await page.waitForTimeout(350);
            }
        }

        if (ex.drag) await dragStage(page, stage, 0.68, 0.32);
        await page.waitForTimeout(300);
        await stage.screenshot({path: path.join(SHOTS, ex.shot)});

        expect(pageErrors, `uncaught exceptions running ${ex.file}`).toEqual([]);
    });
}
