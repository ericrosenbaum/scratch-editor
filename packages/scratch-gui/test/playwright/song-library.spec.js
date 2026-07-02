// @ts-check
// Coverage for song-library attribution: every library card carries a byline
// crediting the author — the human musician for converted CC0 material, or an
// explicit "AI-generated" flag for machine-made content.
const {test, expect} = require('@playwright/test');
const {openSongMaker} = require('./song-test-helpers');

test('track library flags AI-generated items', async ({page}) => {
    await openSongMaker(page);
    await page.getByRole('button', {name: /Add from Library/i}).click();

    // Every current track item comes from the AI pipeline, so the flag
    // should be on the first visible card.
    await expect(page.getByText('AI-generated').first()).toBeVisible();
});

test('section library credits human MIDI authors', async ({page}) => {
    await openSongMaker(page);
    await page.getByLabel('Start from a section in the library').click();

    // CC0 sections carry their author byline...
    await expect(page.getByText('by m-malandro').first()).toBeVisible();
    await expect(page.getByText('by Roppy Chop Studios').first()).toBeVisible();
    // ...and generated sections are flagged as such alongside them.
    await expect(page.getByText('AI-generated').first()).toBeVisible();
});
