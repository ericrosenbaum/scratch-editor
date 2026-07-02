// @ts-check
// Core Song Maker flows: the editor lives in a full-screen modal opened from
// the "Open Song Maker" toolbox button at the top of the Songs extension
// category (there is no Song Maker tab).
const {test, expect} = require('@playwright/test');
const {openSongMaker, dismissSongsExamplesModal} = require('./song-test-helpers');

// Use the playwright config's baseURL (the local build/ directory) unless overridden.
const PAGE = process.env.SONG_TEST_BASE ? `${process.env.SONG_TEST_BASE}` : 'index.html';

test.beforeEach(async ({page}) => {
    page.on('pageerror', err => {
        // eslint-disable-next-line no-console
        console.log('PAGE ERROR:', err.message);
    });
});

test('Song Maker: no editor tab; the Songs toolbox button opens the modal', async ({page}) => {
    await page.goto(PAGE, {waitUntil: 'domcontentloaded'});
    await dismissSongsExamplesModal(page);
    await expect(page.getByRole('tab', {name: /^Code$/})).toBeVisible({timeout: 30000});
    const tabs = await page.locator('[role="tab"]').allInnerTexts();
    expect(tabs).toEqual(['Code', 'Costumes', 'Sounds']);

    // Add the Songs extension; its category gains an "Open Song Maker" button.
    await page.evaluate(() => window.__SONG_TEST__.vm.extensionManager.loadExtensionIdSync('songs'));
    await page.locator('.blocklyToolboxCategory').filter({hasText: 'Songs'})
        .click();
    const openButton = page.locator('.blocklyFlyoutButton').filter({hasText: 'Open Song Maker'});
    await expect(openButton).toBeVisible();

    await openButton.click();
    await expect(page.locator('.song-editor')).toBeVisible();

    // The Back button closes the modal and returns to the workspace.
    await page.getByRole('button', {name: /Back/i}).click();
    await expect(page.locator('.song-editor')).toHaveCount(0);
});

test('Song Maker: edit notes on piano and drum, play/stop', async ({page}) => {
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.stack || err.message || String(err)));

    await openSongMaker(page);

    // Place a note on the piano roll
    const piano = page.locator('svg.piano-roll').first();
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
    // Click past the 32px label gutter that aligns drum cells with
    // piano-roll cells, then ~10px into cell 0.
    await page.mouse.click(dbox.x + 80, dbox.y + 14);
    await expect(page.locator('svg.drum-grid rect.note')).toHaveCount(1);

    // Play and stop
    const playBtn = page.locator('.song-editor-transport .transport-btn.play');
    await playBtn.click();
    await page.waitForTimeout(200);
    await playBtn.click();

    expect(pageErrors).toEqual([]);
});

test('Song Maker: closing and reopening the modal preserves song state', async ({page}) => {
    await openSongMaker(page);
    await page.getByRole('button', {name: /Add Drum Track/i}).click();
    await expect(page.locator('.track-row')).toHaveCount(2);

    await page.getByRole('button', {name: /Back/i}).click();
    await expect(page.locator('.song-editor')).toHaveCount(0);
    await page.locator('.blocklyFlyoutButton').filter({hasText: 'Open Song Maker'})
        .click();
    await expect(page.locator('.track-row')).toHaveCount(2);
});

test('Songs extension appears in the extension library', async ({page}) => {
    await page.goto(PAGE, {waitUntil: 'domcontentloaded'});
    await dismissSongsExamplesModal(page);
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

    await openSongMaker(page);
    // Give the music extension time to decode its sample MP3s.
    await page.waitForTimeout(4000);

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
    await openSongMaker(page);

    const piano = page.locator('svg.piano-roll').first();
    const pbox = await piano.boundingBox();
    await page.mouse.click(pbox.x + 80, pbox.y + 60);
    await expect(page.locator('svg.piano-roll rect.note')).toHaveCount(1);

    // Select the note, then delete it with the toolbar button.
    await page.locator('svg.piano-roll rect.note').first()
        .click();
    await page.locator('.selection-toolbar button', {hasText: 'Delete'}).click();
    await expect(page.locator('svg.piano-roll rect.note')).toHaveCount(0);
});
