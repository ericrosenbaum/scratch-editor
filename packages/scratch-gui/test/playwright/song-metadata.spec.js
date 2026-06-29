// @ts-check
// Coverage for the song-metadata header controls (non-AI): BPM, Bars, Key
// (root note + octave) and Scale. Each assertion checks the UI control, the
// committed song DATA (runtime.song via the test hook), and — for key/scale —
// the resulting note transform.
const {test, expect} = require('@playwright/test');
const {openSongMaker, songData} = require('./song-test-helpers');

// Replace the first track's notes via the VM (robust vs. pixel-clicking the
// SVG grid) and wait for the editor to re-render them.
const setFirstTrackNotes = (page, notes) => page.evaluate(n => {
    const vm = window.__SONG_TEST__.vm;
    const song = JSON.parse(JSON.stringify(vm.runtime.song));
    song.tracks[0].notes = n;
    vm.updateSong(song);
}, notes);

test('BPM commits to song.tempo', async ({page}) => {
    await openSongMaker(page);
    const bpm = page.getByLabel('BPM', {exact: true});
    await bpm.fill('96');
    await bpm.press('Enter');
    await expect(bpm).toHaveValue('96');
    expect((await songData(page)).tempo).toBe(96);
});

test('Bars commits to song.lengthSteps (bars × stepsPerBeat × 4)', async ({page}) => {
    await openSongMaker(page);
    const before = await songData(page);
    const stepsPerBar = (before.stepsPerBeat || 4) * 4;
    const bars = page.getByLabel('Bars', {exact: true});
    await bars.fill('3');
    await bars.press('Enter');
    expect((await songData(page)).lengthSteps).toBe(3 * stepsPerBar);
});

test('changing Key transposes existing notes and updates rootPitch', async ({page}) => {
    await openSongMaker(page);
    await setFirstTrackNotes(page, [{step: 0, durationSteps: 2, pitch: 60, velocity: 100}]);
    // A note rect should render for the data we set (DOM reflects data).
    await expect(page.locator('svg.piano-roll rect.note')).toHaveCount(1);

    const before = await songData(page);
    const oldRoot = typeof before.rootPitch === 'number' ? before.rootPitch : 60;
    const oldPc = ((oldRoot % 12) + 12) % 12;
    // Pick a different pitch class (two semitones up, wrapping).
    const newPc = (oldPc + 2) % 12;
    await page.getByLabel('Root note').selectOption(String(newPc));

    const after = await songData(page);
    expect(((after.rootPitch % 12) + 12) % 12).toBe(newPc);
    // The note moved by the same interval the root moved (transpose).
    const delta = after.rootPitch - oldRoot;
    expect(after.tracks[0].notes[0].pitch).toBe(60 + delta);
});

test('changing Scale snaps notes into the selected scale', async ({page}) => {
    await openSongMaker(page);
    const before = await songData(page);
    const rootPitch = typeof before.rootPitch === 'number' ? before.rootPitch : 60;
    // root+1 (a minor second) is out of BOTH major and minor scales, so it must
    // snap whichever of the two we switch to. Pick a scale different from the
    // current one so the change handler actually runs.
    const target = (before.scaleType === 'minor') ? 'major' : 'minor';
    await setFirstTrackNotes(page, [{step: 0, durationSteps: 1, pitch: rootPitch + 1, velocity: 100}]);

    await page.getByLabel('Scale type').selectOption(target);

    const after = await songData(page);
    expect(after.scaleType).toBe(target);
    // The out-of-scale note snapped to an in-scale pitch (changed off root+1).
    expect(after.tracks[0].notes[0].pitch).not.toBe(rootPitch + 1);
});
