// @ts-check
const {test, expect} = require('@playwright/test');
const {openSongMaker, pianoClickBox, songData} = require('./song-test-helpers');

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
    const pbox = await pianoClickBox(page);
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

test('Rename a track: the name field only shows while editing and persists', async ({page}) => {
    await addSong(page);

    // The first track auto-opens for editing, so its name is an editable field.
    const firstRow = page.locator('.track-row').first();
    const nameInput = firstRow.locator('.track-name-input');
    await expect(nameInput).toBeVisible();

    await nameInput.fill('My Melody');
    await nameInput.press('Enter');

    // Persisted to the live project song.
    await expect.poll(async () => (await songData(page)).tracks[0].name).toBe('My Melody');

    // Collapse the track (Done): the name becomes a static label, not an input.
    await firstRow.locator('.edit-toggle-btn').click();
    await expect(firstRow.locator('.track-name-input')).toHaveCount(0);
    await expect(firstRow.locator('.track-name')).toHaveText('My Melody');
});

test('Renaming a track to an existing name gets a numeric suffix', async ({page}) => {
    await addSong(page);

    // Name the first (auto-editing) track.
    const first = page.locator('.track-row').first()
        .locator('.track-name-input');
    await first.fill('Bass');
    await first.press('Enter');

    // Add a second instrument track — it becomes the editing one.
    await page.getByRole('button', {name: /Add Instrument Track/i}).click();
    const second = page.locator('.track-row').nth(1)
        .locator('.track-name-input');
    await expect(second).toBeVisible();
    await second.fill('Bass');
    await second.press('Enter');

    // The duplicate is de-duplicated to "Bass2".
    await expect.poll(async () => (await songData(page)).tracks.map(t => t.name))
        .toEqual(['Bass', 'Bass2']);
});

test('Undo reverts a track rename', async ({page}) => {
    await addSong(page);

    const nameInput = page.locator('.track-row').first()
        .locator('.track-name-input');
    const original = await nameInput.inputValue();

    await nameInput.fill('Renamed Track');
    await nameInput.press('Enter');
    await expect(nameInput).toHaveValue('Renamed Track');

    // Rename goes through the same history stack as every other edit.
    await page.getByRole('button', {name: 'Undo'}).click();
    await expect(nameInput).toHaveValue(original);
});

test('Renaming a track rewrites existing song block references', async ({page}) => {
    await openSongMaker(page);

    const nameInput = page.locator('.track-row').first()
        .locator('.track-name-input');
    const original = await nameInput.inputValue();

    // Create a "play [track] now" block that references the track by its
    // current display name — the same value the block menu would store.
    await page.evaluate(name => {
        const vm = window.__SONG_TEST__.vm;
        const target = vm.runtime.targets.find(t => !t.isStage) || vm.runtime.targets[0];
        target.blocks.createBlock({
            id: 'test-play-block',
            opcode: 'songs_playTrack',
            inputs: {},
            fields: {
                TRACK: {name: 'TRACK', value: name},
                WHEN: {name: 'WHEN', value: 'now'}
            },
            topLevel: true,
            shadow: false,
            x: 0,
            y: 0
        });
    }, original);

    await nameInput.fill('Bassline');
    await nameInput.press('Enter');
    await expect(nameInput).toHaveValue('Bassline');

    // The block field followed the rename, so the script still targets the track.
    const fieldValue = await page.evaluate(() => {
        const vm = window.__SONG_TEST__.vm;
        for (const t of vm.runtime.targets) {
            const b = t.blocks.getBlock('test-play-block');
            if (b) return b.fields.TRACK.value;
        }
        return null;
    });
    expect(fieldValue).toBe('Bassline');
});

test('Song editor stays within the container when steps is large', async ({page}) => {
    await addSong(page);
    // Use the longest song (16 bars → 256 steps) to force a wide grid: even
    // at the minimum cell width the grid is wider than the full-screen modal.
    const bars = page.getByLabel('Bars', {exact: true});
    await bars.fill('16');
    await bars.press('Enter');

    // The song-editor container should not be wider than its parent.
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
    // Add enough tracks to overflow even the full-screen modal's viewport.
    for (let i = 0; i < 9; i++) {
        await page.getByRole('button', {name: /Add Drum Track/i}).click();
    }
    await expect(page.locator('.track-row')).toHaveCount(10);

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
