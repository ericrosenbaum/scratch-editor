// @ts-check
const {test, expect} = require('@playwright/test');
const {openSongMaker} = require('./song-test-helpers');

const PAGE = 'index.html';

// Open the Song Maker modal; the editor auto-loads the project song (one
// instrument track open), so there is no "add song" step.
const addSong = page => openSongMaker(page);

test('Compact tracks render mini grid; editing track shows full piano roll', async ({page}) => {
    await addSong(page);

    // First track is auto-edited (full piano roll).
    await expect(page.locator('svg.piano-roll')).toHaveCount(1);
    await expect(page.locator('svg.mini-grid')).toHaveCount(0);

    // Add a second instrument track. That becomes the editing one; the first collapses.
    await page.getByRole('button', {name: /Add Instrument Track/i}).click();
    await expect(page.locator('svg.piano-roll')).toHaveCount(1);
    await expect(page.locator('svg.mini-grid')).toHaveCount(1);

    // Click Edit on the first (compact) track — Done on the currently-editing one.
    const tracks = page.locator('.track-row');
    await expect(tracks).toHaveCount(2);
    await tracks.first().locator('.edit-toggle-btn')
        .click();
    // Now the first is editing, the second is compact.
    await expect(tracks.first().locator('svg.piano-roll')).toHaveCount(1);
    await expect(tracks.nth(1).locator('svg.mini-grid')).toHaveCount(1);

    await page.screenshot({path: 'test-results/song-compact-and-edit.png', fullPage: false});
});

test('Muted track is visually grayed', async ({page}) => {
    await addSong(page);
    const piano = page.locator('svg.piano-roll').first();
    const pbox = await piano.boundingBox();
    await page.mouse.click(pbox.x + 80, pbox.y + 40);

    // Mute the track
    await page.getByRole('button', {name: /^Mute$/}).click();
    const row = page.locator('.track-row').first();
    await expect(row).toHaveClass(/muted/);

    // Verify reduced opacity
    const opacity = await row.evaluate(el => parseFloat(getComputedStyle(el).opacity));
    expect(opacity).toBeLessThan(1);

    await page.screenshot({path: 'test-results/song-muted.png', fullPage: false});
});

test('Track reorder: move up/down/top/bottom', async ({page}) => {
    await addSong(page);
    // Add two more tracks (3 total).
    await page.getByRole('button', {name: /Add Drum Track/i}).click();
    await page.getByRole('button', {name: /Add Instrument Track/i}).click();
    const rows = page.locator('.track-row');
    await expect(rows).toHaveCount(3);

    // Track display names are derived from the instrument selection now,
    // so reordering still produces a deterministic order. Use trackId (via
    // the .track-row's React key isn't exposed, so we capture order by
    // reading the static display labels) — we only care that an order
    // change is reflected. We use a synthetic id: a stable hash of the
    // text + position-among-same-kind. For this test we just track the
    // *position of the drum track* before and after each move.
    const drumIndex = () => rows.evaluateAll(els => {
        for (let i = 0; i < els.length; i++) {
            const badge = els[i].querySelector('.track-kind-badge.drum');
            if (badge) return i;
        }
        return -1;
    });

    // Initial order: Track (piano), Drum 1 (drum), Track 3 (piano)
    expect(await drumIndex()).toBe(1);

    // Move the last track (a piano) to the top → drum is now at index 2.
    await rows.nth(2).getByLabel('Move track to top')
        .click();
    expect(await drumIndex()).toBe(2);

    // Move the first track (Track 3 piano now at index 0) down by one.
    await rows.nth(0).getByLabel('Move track down')
        .click();
    // Order: Track, Track 3, Drum 1 → drum at index 2 still.
    expect(await drumIndex()).toBe(2);

    // Move the middle track (Track 3) to the bottom.
    await rows.nth(1).getByLabel('Move track to bottom')
        .click();
    // Order: Track, Drum 1, Track 3 → drum at index 1.
    expect(await drumIndex()).toBe(1);

    // Top button is disabled on the first row.
    await expect(rows.nth(0).getByLabel('Move track up')).toBeDisabled();
    await expect(rows.nth(2).getByLabel('Move track down')).toBeDisabled();
});

test('Song editor stays within the container when steps is large', async ({page}) => {
    await addSong(page);
    // Use a long song (8 bars → 128 steps) to force a wide grid.
    const bars = page.getByLabel('Bars', {exact: true});
    await bars.fill('8');
    await bars.press('Enter');

    // The song-editor container should not be wider than the AssetPanel detail area.
    const editorWidth = await page.locator('.song-editor').evaluate(el => el.getBoundingClientRect().width);
    // The detail area is the parent's nearest div.
    const parentWidth = await page.locator('.song-editor').evaluate(el =>
        el.parentElement.getBoundingClientRect().width);
    expect(editorWidth).toBeLessThanOrEqual(parentWidth + 1);

    // The piano roll SVG can be wider, but its container scrolls horizontally.
    const gridScroll = await page.locator('.track-row-grid.is-editing').first()
        .evaluate(el =>
            el.scrollWidth > el.clientWidth);
    expect(gridScroll).toBe(true);

    await page.screenshot({path: 'test-results/song-many-steps.png', fullPage: false});
});

test('Many tracks: outer container scrolls vertically', async ({page}) => {
    await addSong(page);
    // Add ~6 tracks to overflow the viewport.
    for (let i = 0; i < 6; i++) {
        await page.getByRole('button', {name: /Add Drum Track/i}).click();
    }
    await expect(page.locator('.track-row')).toHaveCount(7);

    const scroller = page.locator('.song-editor-tracks');
    const canScroll = await scroller.evaluate(el => el.scrollHeight > el.clientHeight);
    expect(canScroll).toBe(true);

    // Verify scrolling actually moves the viewport — set top to 0 then to 100
    // and confirm the second value is observed.
    await scroller.evaluate(el => {
        el.scrollTop = 0;
    });
    const before = await scroller.evaluate(el => el.scrollTop);
    await scroller.evaluate(el => {
        el.scrollTop = 100;
    });
    const after = await scroller.evaluate(el => el.scrollTop);
    expect(after).toBeGreaterThan(before);

    await page.screenshot({path: 'test-results/song-many-tracks.png', fullPage: false});
});
