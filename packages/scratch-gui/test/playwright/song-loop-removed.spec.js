// @ts-check
// Issue 2 — the redundant, non-functional Loop button was removed. The
// transport always loops, so there is no toggle to expose. This spec confirms
// the button is gone AND that playback still loops (notes re-scheduled across
// the loop boundary).
const {test, expect} = require('@playwright/test');
const {openSongMaker} = require('./song-test-helpers');

test('Loop button is gone from the transport', async ({page}) => {
    await openSongMaker(page);
    // No loop control by class or by accessible name.
    await expect(page.locator('.song-editor-transport .transport-btn.loop')).toHaveCount(0);
    await expect(page.getByRole('button', {name: /loop/i})).toHaveCount(0);
    // The other transport controls remain.
    await expect(page.locator('.song-editor-transport .transport-btn.play')).toHaveCount(1);
    await expect(page.locator('.song-editor-transport .transport-btn.stop')).toHaveCount(1);
    await expect(page.locator('.song-editor-transport .transport-btn.reset')).toHaveCount(1);
});

test('Playback still loops (transport wraps past the song end)', async ({page}) => {
    await openSongMaker(page);

    // Shorten the loop so it wraps several times within the measurement window
    // (4 steps @ 240bpm / 4 steps-per-beat = 0.0625s/step → 0.25s per loop).
    await page.evaluate(() => {
        const vm = window.__SONG_TEST__.vm;
        const song = JSON.parse(JSON.stringify(vm.runtime.song));
        song.lengthSteps = 4;
        song.tempo = 240;
        vm.updateSong(song);
    });

    await page.locator('.song-editor-transport .transport-btn.play').click();

    // The scheduler's iteration counter must advance past 0 — i.e. the transport
    // wrapped and kept playing rather than stopping at the end of the song.
    await expect.poll(
        () => page.evaluate(() => {
            const s = window.__SONG_TEST__.vm.runtime.songPlayback._scheduler;
            return s ? s._iter : -1;
        }),
        {timeout: 5000, message: 'scheduler should loop past iteration 0'}
    ).toBeGreaterThanOrEqual(2);

    // And the play button is still in its playing state (didn't get stuck/stop).
    await expect(page.locator('.song-editor-transport .transport-btn.play.is-playing')).toHaveCount(1);

    await page.locator('.song-editor-transport .transport-btn.play').click();
});
