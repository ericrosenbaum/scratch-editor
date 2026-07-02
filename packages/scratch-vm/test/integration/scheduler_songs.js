/**
 * Scheduler-level integration tests for the Song Maker transport.
 *
 * These drive a real SongScheduler against a deterministic mock AudioContext
 * (see make-fake-audio.js). We use synth / synthDrum tracks because they
 * synthesize via oscillators and need no decoded sample buffers (which aren't
 * available in Node).
 *
 * Two assertion styles:
 *   - Clock-free: read scheduler._notes after activation to verify the flatten
 *     (active-track filtering, mute, solo, key/scale snapping, drum bypass).
 *   - Clock-driven: advance the mock clock through one loop iteration and count
 *     onNote / onBeat callbacks, and verify "at next loop" quantization.
 */

const tap = require('tap');
const SongScheduler = require('../../src/extensions/scratch3_songs/scheduler');
const {makeAudioContext, startDeterministic, advance} = require('../fixtures/songs/make-fake-audio');

const synthTrack = (trackId, notes, extra = {}) => Object.assign({
    trackId, kind: 'synth', volume: 80, muted: false, synth: {}, effects: {}, notes
}, extra);

const synthDrumTrack = (trackId, notes, extra = {}) => Object.assign({
    trackId, kind: 'synthDrum', volume: 80, muted: false, drumLanes: [1, 2], drumVoices: {}, effects: {}, notes
}, extra);

const makeSong = (tracks, extra = {}) => Object.assign({
    songId: 'test', tempo: 120, lengthSteps: 8, stepsPerBeat: 4, rootPitch: 60, scaleType: 'chromatic', tracks
}, extra);

const makeScheduler = (song, ctx, cbs = {}) => new SongScheduler(Object.assign({
    song,
    audioContext: ctx,
    destination: ctx.destination,
    getInstrumentBuffer: () => null,
    getDrumBuffer: () => null
}, cbs));

tap.test('flatten: only active, unmuted tracks contribute notes', t => {
    const ctx = makeAudioContext();
    const song = makeSong([
        synthTrack('a', [{step: 0, pitch: 60, velocity: 90}, {step: 4, pitch: 64, velocity: 90}]),
        synthTrack('b', [{step: 2, pitch: 67, velocity: 90}]),
        synthTrack('c', [{step: 0, pitch: 72, velocity: 90}])
    ]);
    const sched = makeScheduler(song, ctx);
    // Activate only a and b; c stays inactive.
    startDeterministic(sched, {startStep: 0, activeTracks: ['a', 'b']});
    const ids = sched._notes.map(n => n.trackId).sort();
    t.same(Array.from(new Set(ids)), ['a', 'b'], 'inactive track c excluded from flatten');
    t.equal(sched._notes.length, 3, 'a (2 notes) + b (1 note) = 3 flattened notes');
    sched.stop();
    t.end();
});

tap.test('flatten: muted track is silent; solo overrides everything else', t => {
    const ctx = makeAudioContext();
    // Mute test: b muted → excluded even though active.
    const muteSong = makeSong([
        synthTrack('a', [{step: 0, pitch: 60, velocity: 90}]),
        synthTrack('b', [{step: 0, pitch: 64, velocity: 90}], {muted: true})
    ]);
    const s1 = makeScheduler(muteSong, ctx);
    startDeterministic(s1, {activeTracks: ['a', 'b']});
    t.same(Array.from(new Set(s1._notes.map(n => n.trackId))), ['a'], 'muted track b excluded');
    s1.stop();

    // Solo test: c soloed → only c audible, even though a/b active & unmuted.
    const soloSong = makeSong([
        synthTrack('a', [{step: 0, pitch: 60, velocity: 90}]),
        synthTrack('b', [{step: 0, pitch: 64, velocity: 90}]),
        synthTrack('c', [{step: 0, pitch: 67, velocity: 90}], {solo: true})
    ]);
    const s2 = makeScheduler(soloSong, ctx);
    startDeterministic(s2, {activeTracks: ['a', 'b', 'c']});
    t.same(Array.from(new Set(s2._notes.map(n => n.trackId))), ['c'], 'only soloed track c audible');
    s2.stop();
    t.end();
});

tap.test('flatten: key/scale override transposes & snaps pitched notes, drums bypass', t => {
    const ctx = makeAudioContext();
    const song = makeSong([
        synthTrack('p', [{step: 0, pitch: 61, velocity: 90}, {step: 1, pitch: 66, velocity: 90}]),
        synthDrumTrack('d', [{step: 0, drum: 1, velocity: 90}])
    ]);
    const sched = makeScheduler(song, ctx);
    // Don't need the transport running to exercise the flatten — just mark
    // tracks active and re-flatten via setPitchOverrides.
    sched._activeTracks.add('p');
    sched._activeTracks.add('d');
    sched.setPitchOverrides(62, 'major'); // root C(60)->D(62); snap to D major
    const synthPitches = sched._notes.filter(n => n.kind === 'synth').map(n => n.pitch)
        .sort((x, y) => x - y);
    // 61 -> +2 = 63 -> snap up to E(64); 66 -> +2 = 68 -> snap to A(69).
    t.same(synthPitches, [64, 69], 'pitched notes transposed +2 then snapped to D major');
    const drumNotes = sched._notes.filter(n => n.kind === 'synthDrum');
    t.equal(drumNotes.length, 1, 'synthDrum note survives');
    t.equal(drumNotes[0].drum, 0, 'synthDrum lane index passes through 0-based (1 - 1)');
    t.end();
});

tap.test('transport: every note in iteration 0 fires onNote; beats fire per iteration', t => {
    const ctx = makeAudioContext();
    const song = makeSong([
        synthTrack('a', [{step: 0, durationSteps: 2, pitch: 60, velocity: 100}, {step: 4, pitch: 67, velocity: 90}]),
        synthDrumTrack('d', [{step: 0, drum: 1, velocity: 110}, {step: 2, drum: 2, velocity: 100}])
    ]);
    const seen = new Set();
    let beats = 0;
    const sched = makeScheduler(song, ctx, {
        onNote: n => seen.add(`${n.trackId}@${n.step}`),
        onBeat: () => beats++
    });
    startDeterministic(sched, {startStep: 0, activeTracks: ['a', 'd']});
    // Advance only within iteration 0 (wrap is at lengthSteps*sps = 8*0.125 = 1.0s)
    // so each note fires exactly once and we don't double-count across the loop.
    advance(ctx, sched, {toSec: 0.9});
    t.same(Array.from(seen).sort(), ['a@0', 'a@4', 'd@0', 'd@2'], 'all four iter-0 notes fired onNote');
    t.equal(beats, 2, 'two beats per 8-step / 4-steps-per-beat iteration');
    sched.stop();
    t.end();
});

tap.test('transport: changing tempo mid-playback re-anchors the playhead (no long pause)', t => {
    const ctx = makeAudioContext();
    const song = makeSong([
        synthTrack('a', [{step: 0, pitch: 60, velocity: 90}, {step: 4, pitch: 67, velocity: 90}])
    ]);
    let beats = 0;
    const sched = makeScheduler(song, ctx, {onBeat: () => beats++});
    startDeterministic(sched, {startStep: 0, activeTracks: ['a']});
    // Run through several loops at 120 bpm (iterDuration 1.0s) so the anchor is
    // many iterations behind — this is what turns a stale anchor into a long
    // silent pause when the tempo then drops.
    advance(ctx, sched, {toSec: 5.0});
    const beatsBefore = beats;
    t.ok(beatsBefore > 0, 'beats fired during the initial 120 bpm run');

    // Slow to 60 bpm (iterDuration doubles to 2.0s). A bare tempoOverride
    // assignment would leave the current iteration's start far in the future.
    sched.setTempoOverride(60);
    const dNew = sched.iterDuration;
    const now = ctx.currentTime;
    const iterStart = sched._startCtxTime + (sched._iter * dNew);
    // The playhead must still sit INSIDE the current iteration, at/just behind
    // now — not stranded in the future (the pause bug drove iterStart > now).
    t.ok(now - iterStart >= 0 && now - iterStart < dNew,
        'current iteration brackets now after the tempo change (was: stranded in the future)');

    // Playback keeps producing beats promptly at the new rate: at 60 bpm a beat
    // is 1.0s, so within ~1.5s more we must see at least one new beat.
    advance(ctx, sched, {fromSec: now + 0.025, toSec: now + 1.5});
    t.ok(beats > beatsBefore, 'beats continue to fire after slowing down (no long pause)');
    sched.stop();
    t.end();
});

tap.test('transport: "at next loop" defers activation to the loop boundary', t => {
    const ctx = makeAudioContext();
    const song = makeSong([
        synthTrack('a', [{step: 0, pitch: 60, velocity: 90}]),
        synthTrack('b', [{step: 0, pitch: 67, velocity: 90}])
    ]);
    const sched = makeScheduler(song, ctx);
    startDeterministic(sched, {startStep: 0, activeTracks: ['a']});
    // Defer b to the next loop while the transport is running.
    sched.setTrackActive('b', true, 'loop');
    t.notOk(sched.activeTrackIds().includes('b'), 'b not active immediately after "loop" request');
    t.ok(sched._pendingTrackChanges.has('b'), 'b is queued as a pending change');
    // Advance past the loop boundary (1.0s) so _onLoopWrap applies the pending change.
    advance(ctx, sched, {toSec: 1.2});
    t.ok(sched.activeTrackIds().includes('b'), 'b becomes active after the loop wrap');
    sched.stop();
    t.end();
});

tap.test('transport: explicit stop() ends the transport and fires onEnd once', t => {
    const ctx = makeAudioContext();
    const song = makeSong([synthTrack('a', [{step: 0, pitch: 60, velocity: 90}])]);
    let ends = 0;
    const sched = makeScheduler(song, ctx, {onEnd: () => ends++});
    startDeterministic(sched, {startStep: 0, activeTracks: ['a']});
    t.ok(sched.isRunning(), 'running after start');
    sched.stop();
    t.notOk(sched.isRunning(), 'not running after stop');
    t.equal(ends, 1, 'onEnd fired exactly once');
    sched.stop();
    t.equal(ends, 1, 'a second stop() does not re-fire onEnd');
    t.end();
});

tap.test('updateSong: swaps the song reference but skips re-flatten when notes unchanged', t => {
    const ctx = makeAudioContext();
    const notesA = [{step: 0, pitch: 60, velocity: 90}];
    const song = makeSong([synthTrack('a', notesA)]);
    const sched = makeScheduler(song, ctx);
    startDeterministic(sched, {activeTracks: ['a']});
    const flattenedBefore = sched._notes;
    // Volume-only change (same notes array reference) → flatten is skipped, but
    // the song reference is still swapped so the next note reads fresh params.
    const volChanged = makeSong([synthTrack('a', notesA, {volume: 30})]);
    sched.updateSong(volChanged);
    t.equal(sched.song, volChanged, 'song reference swapped to the new object');
    t.equal(sched._notes, flattenedBefore, 'note list NOT re-flattened for a volume-only change');
    // A real structural change (new notes array) forces a re-flatten.
    const newNotes = [{step: 0, pitch: 60, velocity: 90}, {step: 4, pitch: 64, velocity: 90}];
    sched.updateSong(makeSong([synthTrack('a', newNotes)]));
    t.not(sched._notes, flattenedBefore, 'note list re-flattened when notes change');
    t.equal(sched._notes.length, 2, 'new note included after re-flatten');
    sched.stop();
    t.end();
});
