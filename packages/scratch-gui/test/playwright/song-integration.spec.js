// @ts-check
// 3-layer integration scenarios: drive the Song Maker UI (and the shared
// transport that the extension blocks also use), then verify all three state
// layers — song DATA (runtime.song), VM/scheduler RUNTIME state, and the
// visual DOM. AI features are out of scope.
const {test, expect} = require('@playwright/test');
const {openSongMaker, songData} = require('./song-test-helpers');

const setTrackNotes = (page, idx, notes) => page.evaluate(arg => {
    const vm = window.__SONG_TEST__.vm;
    const song = JSON.parse(JSON.stringify(vm.runtime.song));
    song.tracks[arg.idx].notes = arg.notes;
    vm.updateSong(song);
}, {idx, notes});

test('build a 2-track song in the UI, play it, and verify data + VM + DOM', async ({page}) => {
    await openSongMaker(page);

    // Add a synth track via the UI; it becomes the editing track, the first
    // (instrument) track collapses to a mini grid.
    await page.getByRole('button', {name: /Add Synth Track/i}).click();
    await expect(page.locator('.track-row')).toHaveCount(2);
    await expect(page.locator('svg.piano-roll')).toHaveCount(1);
    await expect(page.locator('svg.mini-grid')).toHaveCount(1);

    // Give each track a note (data layer).
    await setTrackNotes(page, 0, [{step: 0, durationSteps: 2, pitch: 60, velocity: 100}]);
    await setTrackNotes(page, 1, [{step: 4, durationSteps: 2, pitch: 67, velocity: 90}]);

    // DATA: two tracks, expected kinds and notes.
    const data = await songData(page);
    expect(data.tracks.map(t => t.kind)).toEqual(['instrument', 'synth']);
    expect(data.tracks[0].notes).toHaveLength(1);
    expect(data.tracks[1].notes[0].pitch).toBe(67);

    // Play via the UI transport.
    await page.locator('.song-editor-transport .transport-btn.play').click();

    // VM: the shared transport is running with both tracks active.
    await expect.poll(() => page.evaluate(() =>
        window.__SONG_TEST__.vm.runtime.songPlayback.activeTrackIds().length
    )).toBe(2);
    expect(await page.evaluate(() =>
        window.__SONG_TEST__.vm.runtime.songPlayback.isPlaying())).toBe(true);

    // DOM: play button shows the playing state and a playhead is drawn.
    await expect(page.locator('.transport-btn.play.is-playing')).toHaveCount(1);
    await expect(page.locator('svg.piano-roll line.playhead')).toHaveCount(1);

    await page.locator('.song-editor-transport .transport-btn.play').click();
});

test('muting a track removes it from the scheduled note set (data + VM + DOM)', async ({page}) => {
    await openSongMaker(page);
    await page.getByRole('button', {name: /Add Synth Track/i}).click();
    await setTrackNotes(page, 0, [{step: 0, durationSteps: 1, pitch: 60, velocity: 100}]);
    await setTrackNotes(page, 1, [{step: 2, durationSteps: 1, pitch: 64, velocity: 100}]);

    // Mute the first (now compact) track via its Mute button.
    await page.locator('.track-row').first()
        .getByRole('button', {name: 'Mute'})
        .click();

    // DATA: the track is flagged muted.
    expect((await songData(page)).tracks[0].muted).toBe(true);
    // DOM: the row reflects the muted styling.
    await expect(page.locator('.track-row.muted')).toHaveCount(1);

    // VM: with the track muted, the scheduler's flattened notes exclude it.
    await page.locator('.song-editor-transport .transport-btn.play').click();
    await expect.poll(() => page.evaluate(() => {
        const s = window.__SONG_TEST__.vm.runtime.songPlayback._scheduler;
        if (!s) return null;
        return s._notes.map(n => n.trackId);
    })).not.toBeNull();
    const trackIds = await page.evaluate(() => {
        const vm = window.__SONG_TEST__.vm;
        const mutedId = vm.runtime.song.tracks[0].trackId;
        const s = vm.runtime.songPlayback._scheduler;
        return {mutedId, scheduled: s._notes.map(n => n.trackId)};
    });
    expect(trackIds.scheduled).not.toContain(trackIds.mutedId);

    await page.locator('.song-editor-transport .transport-btn.play').click();
});

test('save → reload round-trips the song through the VM and re-renders', async ({page}) => {
    await openSongMaker(page);
    await page.getByRole('button', {name: /Add Drum Track/i}).click();
    await setTrackNotes(page, 0, [{step: 0, durationSteps: 2, pitch: 62, velocity: 110}]);
    const bpm = page.getByLabel('BPM', {exact: true});
    await bpm.fill('132');
    await bpm.press('Enter');

    const before = await songData(page);
    expect(before.tracks).toHaveLength(2);

    // Serialize and reload through the same VM (the Save/Open round-trip).
    await page.evaluate(async () => {
        const vm = window.__SONG_TEST__.vm;
        const json = vm.toJSON();
        await vm.loadProject(json);
    });

    const after = await songData(page);
    expect(after.tempo).toBe(132);
    expect(after.tracks).toHaveLength(2);
    expect(after.tracks[0].notes[0].pitch).toBe(62);
    // DOM still shows two track rows after the reload.
    await expect(page.locator('.track-row')).toHaveCount(2);
});
