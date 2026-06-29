// @ts-check
// Issue 1 — at narrow widths the editor header (transport, history, song
// metadata, library/AI buttons, selection toolbar) used to overflow a single
// non-wrapping row and get clipped by the editor's overflow:hidden, so buttons
// disappeared and the metadata fields crushed/overlapped. The header now wraps
// and shrinks responsively. These specs assert no horizontal overflow and that
// the metadata fields stay visible across a range of viewport widths.
const {test, expect} = require('@playwright/test');
const {openSongMaker} = require('./song-test-helpers');

const VIEWPORTS = [
    {w: 1440, h: 900},
    {w: 800, h: 800},
    {w: 600, h: 800},
    {w: 480, h: 800}
];

for (const {w, h} of VIEWPORTS) {
    test(`header does not overflow horizontally at ${w}x${h}`, async ({page}) => {
        await page.setViewportSize({width: w, height: h});
        await openSongMaker(page);

        // The header must fit its own width (wrap rather than clip). Allow 1px
        // for sub-pixel rounding.
        const overflow = await page.locator('.song-editor-header').evaluate(
            el => el.scrollWidth - el.clientWidth);
        expect(overflow, `header scrollWidth-clientWidth at ${w}px`).toBeLessThanOrEqual(1);

        // The whole editor shell must not overflow the viewport horizontally.
        const editorOverflow = await page.locator('.song-editor').evaluate(
            el => el.scrollWidth - el.clientWidth);
        expect(editorOverflow, `editor scrollWidth-clientWidth at ${w}px`).toBeLessThanOrEqual(1);

        // Metadata fields stay reachable (visible, non-zero box) even when wrapped.
        await expect(page.getByLabel('BPM', {exact: true})).toBeVisible();
        await expect(page.getByLabel('Bars', {exact: true})).toBeVisible();
    });
}

test('header control groups do not overlap each other at 480px', async ({page}) => {
    // The reported symptom was groups overlapping (text on top of text) once the
    // single row ran out of space. With the header wrapping, groups should tile
    // without intersecting. We check every pair of visible header children.
    await page.setViewportSize({width: 480, height: 800});
    await openSongMaker(page);

    const boxes = await page.locator('.song-editor-header > *').evaluateAll(els =>
        els.map(el => {
            const r = el.getBoundingClientRect();
            return {x: r.x, y: r.y, right: r.x + r.width, bottom: r.y + r.height, w: r.width, h: r.height};
        }).filter(b => b.w > 0 && b.h > 0));
    expect(boxes.length).toBeGreaterThan(1);

    const tol = 1; // sub-pixel tolerance
    for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i];
            const b = boxes[j];
            const overlapX = Math.min(a.right, b.right) - Math.max(a.x, b.x);
            const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
            const intersects = overlapX > tol && overlapY > tol;
            expect(intersects, `header groups ${i} and ${j} overlap`).toBe(false);
        }
    }
});
