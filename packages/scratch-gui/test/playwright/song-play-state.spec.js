// @ts-check
// Issue 3 — the play button / play state could get stuck in "playing". The
// editor now reconciles its play state against the authoritative VM transport
// on every transport-stop signal (green-flag stop, block stop, idle-out) and
// ignores stale deferred 'start' events. These specs drive the transport into
// the situations that used to leave it stuck and assert it always recovers.
const {test, expect} = require('@playwright/test');
const {openSongMaker} = require('./song-test-helpers');

const playBtn = page => page.locator('.song-editor-transport .transport-btn.play');
const isPlaying = page => page.locator('.song-editor-transport .transport-btn.play.is-playing');

test('a green-flag / project stop clears the editor play state', async ({page}) => {
    await openSongMaker(page);
    await playBtn(page).click();
    await expect(isPlaying(page)).toHaveCount(1);

    // Simulate the green flag's "stop all" — the transport stops out from under
    // the editor. The reconcile subscription must clear the playing state.
    await page.evaluate(() => window.__SONG_TEST__.vm.runtime.stopAll());

    await expect(isPlaying(page)).toHaveCount(0);
    // VM agrees the transport is stopped.
    expect(await page.evaluate(() => window.__SONG_TEST__.vm.runtime.songPlayback.isPlaying())).toBe(false);
});

test('a block "stop all tracks" clears the editor play state', async ({page}) => {
    await openSongMaker(page);
    await playBtn(page).click();
    await expect(isPlaying(page)).toHaveCount(1);

    // Deactivate every track via the playback API (what `stop [all tracks]`
    // does). The transport idles out; the editor must not stay stuck playing.
    await page.evaluate(() => {
        const pb = window.__SONG_TEST__.vm.runtime.songPlayback;
        pb.setTracksActive(pb.activeTrackIds(), false, 'now');
    });

    await expect(isPlaying(page)).toHaveCount(0);
});

test('rapid play then tab-switch does not leave a stuck play state', async ({page}) => {
    await openSongMaker(page);
    await playBtn(page).click();
    // Immediately leave the tab (unmounts the editor, which stops playback)…
    await page.getByRole('tab', {name: /^Code$/}).click();
    // …then return. The editor remounts fresh and must not show "playing".
    await page.getByRole('tab', {name: /Song Maker/i}).click();
    await expect(page.locator('.song-editor')).toBeVisible();
    await expect(isPlaying(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.__SONG_TEST__.vm.runtime.songPlayback.isPlaying())).toBe(false);
});

test('changing BPM during playback keeps a single running transport (no stuck flicker)', async ({page}) => {
    // Count transport 'start' events: a BPM change must NOT restart the
    // transport (which both glitched audio and risked a stuck state).
    await openSongMaker(page);
    await page.evaluate(() => {
        window.__songStarts = 0;
        window.__SONG_TEST__.vm.runtime.songPlayback.on('start', () => {
            window.__songStarts++;
        });
    });

    await playBtn(page).click();
    await expect(isPlaying(page)).toHaveCount(1);

    const bpm = page.getByLabel('BPM', {exact: true});
    await bpm.fill('150');
    await bpm.press('Enter'); // Enter commits (Tab focuses the popover slider, not a commit)
    await bpm.fill('90');
    await bpm.press('Enter');

    // Still playing, exactly one transport, no orphaned restarts.
    await expect(isPlaying(page)).toHaveCount(1);
    expect(await page.evaluate(() => window.__songStarts)).toBe(1);

    await playBtn(page).click();
});
