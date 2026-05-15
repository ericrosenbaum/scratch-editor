// @ts-check
const {test, expect} = require('@playwright/test');

// Use the playwright config's baseURL (the local build/ directory) unless overridden.
const PAGE = process.env.SONG_TEST_BASE ? `${process.env.SONG_TEST_BASE}` : 'index.html';

test.beforeEach(async ({page}) => {
    page.on('pageerror', err => {
        // eslint-disable-next-line no-console
        console.log('PAGE ERROR:', err.message);
    });
});

test('Song Maker: tab appears next to Sounds', async ({page}) => {
    await page.goto(PAGE, {waitUntil: 'domcontentloaded'});
    await expect(page.getByRole('tab', {name: /^Code$/})).toBeVisible({timeout: 30000});
    const tabs = await page.locator('[role="tab"]').allInnerTexts();
    expect(tabs).toEqual(['Code', 'Costumes', 'Sounds', 'Song Maker']);
});

test('Song Maker: add a song, edit notes on piano and drum, play/stop', async ({page}) => {
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.stack || err.message || String(err)));

    await page.goto(PAGE, {waitUntil: 'domcontentloaded'});
    await expect(page.getByRole('tab', {name: /^Code$/})).toBeVisible({timeout: 30000});

    await page.getByRole('tab', {name: /Song Maker/i}).click();

    // Add a song
    await page.getByLabel('Add Song', {exact: true}).first().click();

    // BPM input visible
    await expect(page.locator('.song-editor input[type="number"]').first()).toBeVisible();

    // Edit song name
    await page.locator('input[aria-label="Song name"]').fill('Test Song');

    // Place a note on the piano roll
    const piano = page.locator('svg.piano-roll').first();
    await expect(piano).toBeVisible();
    const pbox = await piano.boundingBox();
    expect(pbox).not.toBeNull();
    await page.mouse.click(pbox.x + 80, pbox.y + 40);
    await expect(page.locator('svg.piano-roll rect.note')).toHaveCount(1);

    // Add a drum track
    await page.getByRole('button', {name: /Add Drum Track/i}).click();
    const drum = page.locator('svg.drum-grid').first();
    await expect(drum).toBeVisible();
    await drum.scrollIntoViewIfNeeded();
    const dbox = await drum.boundingBox();
    // Click in the middle of the first cell — past the 32px label gutter that
    // aligns drum cells with piano-roll cells, then ~10px into cell 0.
    // Click past the Edit corner button (which overlays the top-left ~50px).
    await page.mouse.click(dbox.x + 80, dbox.y + 14);
    await expect(page.locator('svg.drum-grid rect.note')).toHaveCount(1);

    // Play and stop
    const playBtn = page.locator('.song-editor-transport .transport-btn.play');
    await playBtn.click();
    await page.waitForTimeout(200);
    await playBtn.click();

    expect(pageErrors).toEqual([]);
});

test('Song Maker: switching tabs preserves song state', async ({page}) => {
    await page.goto(PAGE, {waitUntil: 'domcontentloaded'});
    await expect(page.getByRole('tab', {name: /^Code$/})).toBeVisible({timeout: 30000});

    await page.getByRole('tab', {name: /Song Maker/i}).click();
    await page.getByLabel('Add Song', {exact: true}).first().click();
    await page.getByRole('button', {name: /Add Drum Track/i}).click();
    await expect(page.locator('.track-row')).toHaveCount(2);

    await page.getByRole('tab', {name: /^Code$/}).click();
    await page.getByRole('tab', {name: /Song Maker/i}).click();
    await expect(page.locator('.track-row')).toHaveCount(2);
});

test('Song Maker: rename song updates the selector list', async ({page}) => {
    await page.goto(PAGE, {waitUntil: 'domcontentloaded'});
    await expect(page.getByRole('tab', {name: /^Code$/})).toBeVisible({timeout: 30000});

    await page.getByRole('tab', {name: /Song Maker/i}).click();
    await page.getByLabel('Add Song', {exact: true}).first().click();
    await page.locator('input[aria-label="Song name"]').fill('Renamed');
    // Blur to commit if needed:
    await page.locator('input[aria-label="Song name"]').press('Tab');

    // The selector list (left column) should reflect the new name somewhere on the page.
    await expect(page.getByText('Renamed').first()).toBeVisible();
});

test('Song Maker: BPM and length update', async ({page}) => {
    await page.goto(PAGE, {waitUntil: 'domcontentloaded'});
    await expect(page.getByRole('tab', {name: /^Code$/})).toBeVisible({timeout: 30000});

    await page.getByRole('tab', {name: /Song Maker/i}).click();
    await page.getByLabel('Add Song', {exact: true}).first().click();

    const bpmInput = page.locator('.song-editor input[type="number"]').first();
    await bpmInput.fill('90');
    await bpmInput.press('Tab');
    await expect(bpmInput).toHaveValue('90');

    // Length input is the second number input in the header
    const lengthInput = page.locator('.song-editor input[type="number"]').nth(1);
    await lengthInput.fill('16');
    await lengthInput.press('Tab');
    await expect(lengthInput).toHaveValue('16');
});

test('Songs extension appears in the extension library', async ({page}) => {
    await page.goto(PAGE, {waitUntil: 'domcontentloaded'});
    await expect(page.getByRole('tab', {name: /^Code$/})).toBeVisible({timeout: 30000});

    const extButton = page.locator('[class*="extension-button"]').first();
    await expect(extButton).toBeVisible();
    await extButton.click();

    await expect(page.getByText('Songs', {exact: true}).first()).toBeVisible({timeout: 10000});
});

test('Song Maker: Play actually schedules audio buffer sources', async ({page}) => {
    await page.addInitScript(() => {
        window.__bsCount = 0;
        const real = window.AudioContext || window.webkitAudioContext;
        if (real) {
            const Wrapped = function (...a) {
                const ctx = new real(...a);
                const orig = ctx.createBufferSource.bind(ctx);
                ctx.createBufferSource = function () {
                    window.__bsCount++;
                    return orig();
                };
                return ctx;
            };
            Wrapped.prototype = real.prototype;
            window.AudioContext = Wrapped;
        }
    });

    await page.goto(PAGE, {waitUntil: 'domcontentloaded'});
    await expect(page.getByRole('tab', {name: /^Code$/})).toBeVisible({timeout: 30000});
    // Give the music extension time to decode its sample MP3s.
    await page.waitForTimeout(4000);

    await page.getByRole('tab', {name: /Song Maker/i}).click();
    await page.getByLabel('Add Song', {exact: true}).first().click();

    // Place 3 notes
    const piano = page.locator('svg.piano-roll').first();
    const pbox = await piano.boundingBox();
    await page.mouse.click(pbox.x + 50, pbox.y + 60);
    await page.mouse.click(pbox.x + 120, pbox.y + 80);
    await page.mouse.click(pbox.x + 200, pbox.y + 100);

    const before = await page.evaluate(() => window.__bsCount || 0);
    await page.locator('.song-editor-transport .transport-btn.play').click();
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => window.__bsCount || 0);

    expect(after - before).toBeGreaterThanOrEqual(3);
});

test('Song Maker: piano notes can be removed via the Delete toolbar button', async ({page}) => {
    await page.goto(PAGE, {waitUntil: 'domcontentloaded'});
    await expect(page.getByRole('tab', {name: /^Code$/})).toBeVisible({timeout: 30000});

    await page.getByRole('tab', {name: /Song Maker/i}).click();
    await page.getByLabel('Add Song', {exact: true}).first().click();

    const piano = page.locator('svg.piano-roll').first();
    const pbox = await piano.boundingBox();
    await page.mouse.click(pbox.x + 80, pbox.y + 40);
    await expect(page.locator('svg.piano-roll rect.note')).toHaveCount(1);

    // Click the note to select it, then click Delete in the selection toolbar.
    await page.locator('svg.piano-roll rect.note').first().click();
    await page.locator('.selection-toolbar button', {hasText: 'Delete'}).click();
    await expect(page.locator('svg.piano-roll rect.note')).toHaveCount(0);
});
