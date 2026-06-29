// @ts-check
// Shared helpers for the Song Maker Playwright specs.
const {expect} = require('@playwright/test');

const PAGE = process.env.SONG_TEST_BASE ? `${process.env.SONG_TEST_BASE}` : 'index.html';

// Load the playground, wait for the editor shell, and switch to the Song Maker
// tab. The tab auto-loads the project song (one instrument track open for
// editing), so no explicit "add song" step is needed.
const openSongMaker = async page => {
    await page.goto(PAGE, {waitUntil: 'domcontentloaded'});
    await expect(page.getByRole('tab', {name: /^Code$/})).toBeVisible({timeout: 30000});
    await page.getByRole('tab', {name: /Song Maker/i}).click();
    await expect(page.locator('.song-editor')).toBeVisible();
    await expect(page.locator('svg.piano-roll').first()).toBeVisible();
};

// Read the live project song (runtime.song) via the guarded test hook the dev
// build attaches in render-gui.jsx. Returns null if the hook isn't present.
const songData = page => page.evaluate(() => {
    const vm = window.__SONG_TEST__ && window.__SONG_TEST__.vm;
    return vm ? JSON.parse(JSON.stringify(vm.runtime.song || null)) : null;
});

// Place a note near the top-left of the first piano-roll and return its bbox.
const clickPianoCell = async (page, dx = 80, dy = 40) => {
    const piano = page.locator('svg.piano-roll').first();
    await expect(piano).toBeVisible();
    const box = await piano.boundingBox();
    await page.mouse.click(box.x + dx, box.y + dy);
    return box;
};

module.exports = {PAGE, openSongMaker, songData, clickPianoCell};
