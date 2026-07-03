/**
 * Extended serialization round-trips for the Song Maker data model.
 *
 * The existing serialization_songs.js covers a basic instrument + drum song.
 * This file exercises the full schema: all four track kinds (instrument, drum,
 * synth, synthDrum), per-track effects (reverb/delay/filter/pan/distortion),
 * synth param bags, synthDrum drumVoices, multi-lane drums, and song-level
 * key/scale metadata — through both the JSON path (vm.toJSON / loadProject) and
 * the binary .sb3 zip path (saveProjectSb3 / loadProject).
 *
 * Regression guard: track.effects and song.rootPitch/scaleType were previously
 * dropped by serializeSong, silently resetting every track to dry defaults and
 * losing the authored key/scale on save. These tests fail if that recurs.
 */

const tap = require('tap');
const VirtualMachine = require('../../src/index');
const makeTestStorage = require('../fixtures/make-test-storage');

const project = JSON.parse(JSON.stringify(
    require('../fixtures/songs/project-single-song.json')
));

const makeVm = () => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());
    return vm;
};

const trackById = (song, id) => song.tracks.find(tk => tk.trackId === id);

// Assert every field of interest survived, given a loaded runtime song.
const assertSongIntact = (t, song, label) => {
    t.ok(song, `${label}: song present`);
    t.equal(song.tempo, 128, `${label}: tempo`);
    t.equal(song.lengthSteps, 16, `${label}: lengthSteps`);
    t.equal(song.rootPitch, 62, `${label}: rootPitch (key) preserved`);
    t.equal(song.scaleType, 'minor', `${label}: scaleType preserved`);
    t.equal(song.tracks.length, 4, `${label}: all four tracks`);

    const piano = trackById(song, 'track-piano');
    t.equal(piano.kind, 'instrument', `${label}: instrument kind`);
    t.equal(piano.instrument, 1, `${label}: instrument index`);
    t.same(piano.effects, {reverb: 0.4, delay: 0.1, filter: 0.9, pan: -0.3, distortion: 0},
        `${label}: instrument effects (incl. pan) preserved`);
    t.equal(piano.notes[0].pitch, 62, `${label}: pitched note`);

    const drums = trackById(song, 'track-drums');
    t.equal(drums.kind, 'drum', `${label}: drum kind`);
    t.same(drums.drumLanes, [4, 5, 6], `${label}: drum lanes preserved`);
    t.equal(drums.effects.distortion, 0.2, `${label}: drum distortion preserved`);
    t.equal(drums.notes[0].drum, 4, `${label}: per-note drum lane`);

    const synth = trackById(song, 'track-synth');
    t.equal(synth.kind, 'synth', `${label}: synth kind`);
    t.equal(synth.synth.preset, 'Warm Pad', `${label}: synth preset`);
    t.equal(synth.synth.osc2Detune, 7, `${label}: synth osc2Detune`);
    t.equal(synth.synth.glideTime, 0.15, `${label}: synth glideTime`);
    t.equal(synth.synth.lfoDest, 'filter', `${label}: synth lfoDest`);
    t.equal(synth.effects.reverb, 0.6, `${label}: synth reverb preserved`);

    const sd = trackById(song, 'track-synthdrum');
    t.equal(sd.kind, 'synthDrum', `${label}: synthDrum kind`);
    t.same(sd.drumLanes, [1, 2], `${label}: synthDrum lanes`);
    t.equal(sd.drumVoices['1'].preset, 'Kick', `${label}: drumVoice 1 preset`);
    t.equal(sd.drumVoices['2'].noiseLevel, 0.9, `${label}: drumVoice 2 param`);
    t.equal(sd.notes.length, 4, `${label}: synthDrum notes`);
};

tap.test('load → runtime.song carries the full schema (singular project song)', t => {
    const vm = makeVm();
    vm.loadProject(JSON.stringify(project)).then(() => {
        t.equal(vm.runtime.songs.length, 1, 'songs list holds the one song');
        assertSongIntact(t, vm.runtime.song, 'load');
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('JSON serialize emits top-level songs with effects + key/scale', t => {
    const vm = makeVm();
    vm.loadProject(JSON.stringify(project)).then(() => {
        const serialized = JSON.parse(vm.toJSON());
        t.ok(Array.isArray(serialized.songs), 'top-level songs array emitted');
        t.notOk(serialized.song, 'no legacy singular song emitted');
        const targetHasSong = serialized.targets.some(tg => tg.song || Array.isArray(tg.songs));
        t.notOk(targetHasSong, 'no target carries song data');
        assertSongIntact(t, serialized.songs[0], 'serialized');
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('JSON load → save → load round-trip preserves the full schema', t => {
    const vm1 = makeVm();
    vm1.loadProject(JSON.stringify(project)).then(() => {
        const savedJson = vm1.toJSON();
        const vm2 = makeVm();
        return vm2.loadProject(savedJson).then(() => {
            assertSongIntact(t, vm2.runtime.song, 'json round-trip');
            t.end();
        });
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('binary .sb3 round-trip preserves the full schema', t => {
    const vm = makeVm();
    vm.loadProject(JSON.stringify(project)).then(() =>
        vm.saveProjectSb3()
    )
        .then(blob => {
            const asArrayBuffer = blob.arrayBuffer ? blob.arrayBuffer() : Promise.resolve(blob);
            return asArrayBuffer.then(buf => {
                const vm2 = makeVm();
                return vm2.loadProject(buf).then(() => {
                    assertSongIntact(t, vm2.runtime.song, 'sb3 round-trip');
                    t.end();
                });
            });
        })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('effects survive save when set on every track kind (regression)', t => {
    const vm = makeVm();
    vm.loadProject(JSON.stringify(project)).then(() => {
        const serialized = JSON.parse(vm.toJSON());
        for (const track of serialized.songs[0].tracks) {
            t.ok(track.effects, `track ${track.trackId} retains its effects bag after serialize`);
        }
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});
