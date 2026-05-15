// @ts-check
const {test, expect} = require('@playwright/test');

test('Drum grid time columns align with piano roll', async ({page}) => {
    await page.setViewportSize({width: 1280, height: 800});
    await page.goto('index.html', {waitUntil: 'domcontentloaded'});
    await page.waitForTimeout(3000);

    await page.getByRole('tab', {name: /Song Maker/i}).click();
    await page.getByLabel('Add Song', {exact: true}).first().click();
    await page.getByRole('button', {name: /Add Drum Track/i}).click();

    // The drum track is auto-edited; expand the piano track back into edit mode.
    await page.locator('.track-row').first().locator('.edit-toggle-btn').click();

    // Place a piano note on the first step
    const piano = page.locator('svg.piano-roll').first();
    const pbox = await piano.boundingBox();
    await page.mouse.click(pbox.x + 80, pbox.y + 60);

    // Re-edit the drum track to show its full grid.
    await page.locator('.track-row').nth(1).locator('.edit-toggle-btn').click();

    // Place a drum note on the first step
    const drum = page.locator('svg.drum-grid').first();
    await drum.scrollIntoViewIfNeeded();
    const dbox = await drum.boundingBox();
    await page.mouse.click(dbox.x + 80, dbox.y + 14);

    // To verify x-alignment, briefly bring the piano back into edit view alongside the drum.
    // Since only one can be in edit mode at a time, instead compare using known geometry:
    // both grids start cell 0 at LABEL_W = 32 from the SVG's left and share CELL_W = 22.
    // Check the drum note's x relative to the SVG, then re-edit the piano track and check
    // its note's x relative to its SVG. They should be equal.
    const drumNoteX = await page.locator('svg.drum-grid rect.note').first().evaluate(el => {
        const svg = el.closest('svg');
        return el.getBoundingClientRect().x - svg.getBoundingClientRect().x;
    });

    await page.locator('.track-row').first().locator('.edit-toggle-btn').click();
    const pianoNoteX = await page.locator('svg.piano-roll rect.note').first().evaluate(el => {
        const svg = el.closest('svg');
        return el.getBoundingClientRect().x - svg.getBoundingClientRect().x;
    });

    // Cell 0 starts at x=32 for both. Notes have +1 (piano) and +2 (drum) inset. ±2 tolerance.
    expect(Math.abs(pianoNoteX - drumNoteX)).toBeLessThanOrEqual(2);

    await page.screenshot({path: 'test-results/song-align.png', fullPage: false});
});
