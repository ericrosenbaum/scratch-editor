// @ts-check
const {test, expect} = require('@playwright/test');
const {openSongMaker, pianoClickBox} = require('./song-test-helpers');

const PAGE = 'index.html';

const setupSongWithNote = async (page, x, y) => {
    await openSongMaker(page);
    const piano = page.locator('svg.piano-roll').first();
    const pbox = await pianoClickBox(page);
    await page.mouse.click(pbox.x + x, pbox.y + y);
    return {piano, pbox};
};

test('Edit toggle sits in the track info panel and toggles edit mode', async ({page}) => {
    await openSongMaker(page);

    // Add a second track so the first is in compact mode and has an "Edit" button.
    await page.getByRole('button', {name: /Add Instrument Track/i}).click();

    const firstRow = page.locator('.track-row').first();
    const btn = firstRow.locator('.edit-toggle-btn');
    await expect(btn).toBeVisible();

    // The Edit toggle is inside the controls panel (left column of the row).
    const controls = firstRow.locator('.track-row-controls');
    const btnBox = await btn.boundingBox();
    const controlsBox = await controls.boundingBox();
    expect(btnBox.x).toBeGreaterThanOrEqual(controlsBox.x);
    expect(btnBox.x + btnBox.width).toBeLessThanOrEqual(controlsBox.x + controlsBox.width + 1);

    // It should read "Edit" when the track is compact.
    await expect(btn).toHaveText(/Edit/);
    // Clicking it should expand the track; the button now reads "Done".
    await btn.click();
    await expect(firstRow.locator('.edit-toggle-btn')).toHaveText(/Done/);
});

test('Drag the right edge of a note resizes its duration', async ({page}) => {
    const {piano, pbox} = await setupSongWithNote(page, 80, 60);
    await expect(page.locator('svg.piano-roll rect.note')).toHaveCount(1);

    const noteBefore = page.locator('svg.piano-roll rect.note').first();
    const beforeBox = await noteBefore.boundingBox();
    // Drag the right edge 2 cells (~44px) to the right.
    const startX = beforeBox.x + beforeBox.width - 2;
    const startY = beforeBox.y + (beforeBox.height / 2);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 44, startY, {steps: 5});
    await page.mouse.up();

    const afterBox = await page.locator('svg.piano-roll rect.note').first().boundingBox();
    // Width should have grown by roughly 2 cells (CELL_W = 22).
    expect(afterBox.width).toBeGreaterThan(beforeBox.width + 30);
});

test('Drag selection rect highlights notes; toolbar enables Delete/Cut/Copy', async ({page}) => {
    await setupSongWithNote(page, 80, 60);
    // Add two more notes
    const pbox = await pianoClickBox(page);
    await page.mouse.click(pbox.x + 130, pbox.y + 60);
    await page.mouse.click(pbox.x + 180, pbox.y + 60);
    await expect(page.locator('svg.piano-roll rect.note')).toHaveCount(3);

    // Initially the toolbar buttons are disabled.
    const deleteBtn = page.locator('.selection-toolbar button', {hasText: 'Delete'});
    await expect(deleteBtn).toBeDisabled();

    // Drag a rectangle over all three notes.
    await page.mouse.move(pbox.x + 70, pbox.y + 50);
    await page.mouse.down();
    await page.mouse.move(pbox.x + 200, pbox.y + 80, {steps: 10});
    await page.mouse.up();

    await expect(page.locator('svg.piano-roll rect.note-selected')).toHaveCount(3);
    await expect(deleteBtn).toBeEnabled();
    await expect(page.locator('.selection-toolbar button', {hasText: 'Cut'})).toBeEnabled();
    await expect(page.locator('.selection-toolbar button', {hasText: 'Copy'})).toBeEnabled();
});

test('Cut + Paste round-trips selected notes', async ({page}) => {
    await setupSongWithNote(page, 80, 60);
    const pbox = await pianoClickBox(page);
    await page.mouse.click(pbox.x + 130, pbox.y + 60);
    await expect(page.locator('svg.piano-roll rect.note')).toHaveCount(2);

    // Select both via drag.
    await page.mouse.move(pbox.x + 70, pbox.y + 50);
    await page.mouse.down();
    await page.mouse.move(pbox.x + 160, pbox.y + 80, {steps: 5});
    await page.mouse.up();
    await expect(page.locator('svg.piano-roll rect.note-selected')).toHaveCount(2);

    // Cut removes them.
    await page.locator('.selection-toolbar button', {hasText: 'Cut'}).click();
    await expect(page.locator('svg.piano-roll rect.note')).toHaveCount(0);

    // Paste re-inserts them.
    await page.locator('.selection-toolbar button', {hasText: 'Paste'}).click();
    await expect(page.locator('svg.piano-roll rect.note')).toHaveCount(2);
});

test('Notes use pitch-class colors', async ({page}) => {
    await openSongMaker(page);

    // Place two notes on different rows (different pitches) at the same step.
    const pbox = await pianoClickBox(page);
    await page.mouse.click(pbox.x + 80, pbox.y + 60);
    await page.mouse.click(pbox.x + 80, pbox.y + 80); // different pitch

    const fills = await page.locator('svg.piano-roll rect.note').evaluateAll(els =>
        els.map(el => el.getAttribute('fill')));
    expect(fills.length).toBe(2);
    // Two different pitches should yield different fills.
    expect(fills[0]).not.toEqual(fills[1]);
    // Each fill should be a hex color from the pitch-class palette.
    for (const f of fills) {
        expect(f).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
});

test('AI Edit button on each track opens the AI edit modal', async ({page}) => {
    await openSongMaker(page);

    // Each track row gets an AI Edit button.
    const aiBtn = page.locator('.track-row').first().locator('.track-btn-ai');
    await expect(aiBtn).toBeVisible();
    await expect(aiBtn).toHaveAttribute('aria-label', /AI Edit/i);

    // Clicking it opens the modal with the track name in the title.
    await aiBtn.click();
    await expect(page.locator('.ai-song-modal-title')).toBeVisible();
    await expect(page.locator('.ai-song-modal-title')).toContainText(/AI Edit Track/i);

    // The textarea + Apply button are present.
    await expect(page.locator('#aiEditTrackPrompt')).toBeVisible();
    await expect(page.getByRole('button', {name: /^Apply$/})).toBeDisabled();

    // Typing enables Apply; Cancel closes the modal.
    await page.locator('#aiEditTrackPrompt').fill('harmonize this');
    await expect(page.getByRole('button', {name: /^Apply$/})).toBeEnabled();
    await page.getByRole('button', {name: /^Cancel$/}).click();
    await expect(page.locator('.ai-song-modal-title')).toHaveCount(0);
});

test('Double-click on a note deletes it', async ({page}) => {
    await setupSongWithNote(page, 80, 60);
    await expect(page.locator('svg.piano-roll rect.note')).toHaveCount(1);

    await page.locator('svg.piano-roll rect.note').first()
        .dblclick();
    await expect(page.locator('svg.piano-roll rect.note')).toHaveCount(0);
});

test('Double-click on an empty cell creates a note without deleting it', async ({page}) => {
    // The first click of the double-click creates a note; the delete gesture
    // must not fire on the note it just created (both clicks have to land on
    // a pre-existing note).
    const {pbox} = await setupSongWithNote(page, 80, 60);
    await page.mouse.dblclick(pbox.x + 180, pbox.y + 100);
    await expect(page.locator('svg.piano-roll rect.note')).toHaveCount(2);
});

test('Hovering a note shows move/resize cursors', async ({page}) => {
    await setupSongWithNote(page, 80, 60);
    const piano = page.locator('svg.piano-roll').first();
    const box = await page.locator('svg.piano-roll rect.note').first()
        .boundingBox();

    // Note body → move cursor.
    await page.mouse.move(box.x + 4, box.y + (box.height / 2));
    expect(await piano.evaluate(el => el.style.cursor)).toBe('move');

    // Right edge (stretch zone) → horizontal resize cursor.
    await page.mouse.move(box.x + box.width - 2, box.y + (box.height / 2));
    expect(await piano.evaluate(el => el.style.cursor)).toBe('ew-resize');

    // Empty cell → back to the default grid cursor.
    await page.mouse.move(box.x + 200, box.y + 100);
    expect(await piano.evaluate(el => el.style.cursor)).toBe('');
});

test('Space toggles play and stop', async ({page}) => {
    await setupSongWithNote(page, 80, 60);
    const playing = page.locator('.song-editor-transport .transport-btn.play.is-playing');

    await page.keyboard.press('Space');
    await expect(playing).toHaveCount(1);

    await page.keyboard.press('Space');
    await expect(playing).toHaveCount(0);
});

test('Drum-track resize works the same way', async ({page}) => {
    await openSongMaker(page);
    await page.getByRole('button', {name: /Add Drum Track/i}).click();

    const drum = page.locator('svg.drum-grid').first();
    const dbox = await drum.boundingBox();
    // Click past the corner button to place a note.
    await page.mouse.click(dbox.x + 80, dbox.y + 14);
    await expect(page.locator('svg.drum-grid rect.note')).toHaveCount(1);

    const beforeBox = await page.locator('svg.drum-grid rect.note').first().boundingBox();
    const startX = beforeBox.x + beforeBox.width - 2;
    const startY = beforeBox.y + (beforeBox.height / 2);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 44, startY, {steps: 5});
    await page.mouse.up();

    const afterBox = await page.locator('svg.drum-grid rect.note').first().boundingBox();
    expect(afterBox.width).toBeGreaterThan(beforeBox.width + 30);
});
