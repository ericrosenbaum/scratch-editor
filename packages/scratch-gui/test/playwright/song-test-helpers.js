// @ts-check
// Shared helpers for the Song Maker Playwright specs.
const {expect} = require('@playwright/test');

const PAGE = process.env.SONG_TEST_BASE ? `${process.env.SONG_TEST_BASE}` : 'index.html';

// The songs welcome (examples) modal opens on every fresh page load and — as
// an open react-modal — removes the rest of the app from the accessibility
// tree, so it must be dismissed before any getByRole() query can see the
// editor tabs.
const dismissSongsExamplesModal = async page => {
    await page.getByRole('button', {name: 'Close'}).click({timeout: 30000});
};

// Add the Songs extension to the project (via the VM test hook — same code
// path as picking it in the extension library) and click the "Open Song
// Maker" button at the top of its toolbox category, which opens the Song
// Maker editor modal. The editor auto-loads the project song (one instrument
// track open for editing), so no explicit "add song" step is needed.
const openSongMaker = async page => {
    await page.goto(PAGE, {waitUntil: 'domcontentloaded'});
    await dismissSongsExamplesModal(page);
    await expect(page.getByRole('tab', {name: /^Code$/})).toBeVisible({timeout: 30000});
    await page.evaluate(() => window.__SONG_TEST__.vm.extensionManager.loadExtensionIdSync('songs'));
    await page.locator('.blocklyToolboxCategory').filter({hasText: 'Songs'})
        .click();
    await page.locator('.blocklyFlyoutButton').filter({hasText: 'Open Song Maker'})
        .click();
    await expect(page.locator('.song-editor')).toBeVisible();
    await expect(page.locator('svg.piano-roll').first()).toBeVisible();
};

// Read the live project song (runtime.song) via the guarded test hook the dev
// build attaches in render-gui.jsx. Returns null if the hook isn't present.
const songData = page => page.evaluate(() => {
    const vm = window.__SONG_TEST__ && window.__SONG_TEST__.vm;
    return vm ? JSON.parse(JSON.stringify(vm.runtime.song || null)) : null;
});

// The piano-roll SVG is much taller than its scroll viewport and auto-scrolls
// to centre the melody, so the SVG's bounding box usually starts hundreds of
// pixels ABOVE the visible area. Cell clicks must therefore be computed from
// the VISIBLE grid — the scroller's box — not the SVG's.
const pianoClickBox = async page => {
    const scroller = page.locator('.track-row-grid.is-editing').first();
    await expect(scroller).toBeVisible();
    return scroller.boundingBox();
};

// Place a note near the top-left of the visible piano-roll area and return
// the visible-area bbox the click was relative to.
const clickPianoCell = async (page, dx = 80, dy = 40) => {
    const box = await pianoClickBox(page);
    await page.mouse.click(box.x + dx, box.y + dy);
    return box;
};

module.exports = {PAGE, dismissSongsExamplesModal, openSongMaker, songData, pianoClickBox, clickPianoCell};
