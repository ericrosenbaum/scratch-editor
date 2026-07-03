/**
 * Integration tests for song switching — the `switch to song` block's engine
 * path. Scheduler level: switchSong (immediate swap + re-anchor + boundary
 * source cancellation) and scheduleSongSwitch (quantized to the loop wrap).
 * Playback level: SongPlayback.switchToSong's carry-over-by-name of active
 * tracks and its selection-only behavior on an idle transport.
 *
 * Uses synth/synthDrum tracks against the deterministic mock AudioContext
 * (see make-fake-audio.js), same style as scheduler_songs.js.
 */

const tap = require('tap');
const VirtualMachine = require('../../src/index');
const SongScheduler = require('../../src/extensions/scratch3_songs/scheduler');
const {makeAudioContext, attachFakeAudio, startDeterministic, advance} = require('../fixtures/songs/make-fake-audio');

const synthTrack = (trackId, name, notes) => ({
    trackId, kind: 'synth', name, volume: 80, muted: false, synth: {}, effects: {}, notes
});

// Song A: lengthSteps 8 @ 120bpm, 4 steps/beat → sps 0.125s, loop = 1.0s.
const makeSongA = () => ({
    songId: 'A',
    name: 'Verse',
    tempo: 120,
    lengthSteps: 8,
    stepsPerBeat: 4,
    rootPitch: 60,
    scaleType: 'chromatic',
    tracks: [
        synthTrack('a-drums', 'Drums', [{step: 0, pitch: 60, velocity: 90}, {step: 4, pitch: 60, velocity: 90}]),
        synthTrack('a-bass', 'Bass', [{step: 2, pitch: 48, velocity: 90}])
    ]
});

// Song B: lengthSteps 4 → loop = 0.5s. Shares the "Drums" display name with A.
const makeSongB = () => ({
    songId: 'B',
    name: 'Chorus',
    tempo: 120,
    lengthSteps: 4,
    stepsPerBeat: 4,
    rootPitch: 60,
    scaleType: 'chromatic',
    tracks: [
        synthTrack('b-drums', 'Drums', [{step: 0, pitch: 62, velocity: 90}]),
        synthTrack('b-lead', 'Lead', [{step: 1, pitch: 72, velocity: 90}])
    ]
});

const makeScheduler = (song, ctx, cbs = {}) => new SongScheduler(Object.assign({
    song,
    audioContext: ctx,
    destination: ctx.destination,
    getInstrumentBuffer: () => null,
    getDrumBuffer: () => null
}, cbs));

tap.test('switchSong swaps the song mid-flight, carries the given ids, re-anchors', t => {
    const ctx = makeAudioContext();
    const songB = makeSongB();
    const noted = [];
    const sched = makeScheduler(makeSongA(), ctx, {onNote: n => noted.push(n.trackId)});
    startDeterministic(sched, {startStep: 0, activeTracks: ['a-drums', 'a-bass']});
    advance(ctx, sched, {toSec: 0.4});

    noted.length = 0;
    sched.switchSong(songB, ['b-drums'], ctx.currentTime);
    t.equal(sched.song, songB, 'scheduler holds the new song');
    t.same(sched.activeTrackIds(), ['b-drums'], 'only the carried id is active');
    t.equal(sched._iter, 0, 'iteration reset — the boundary is the new song\'s step 0');
    t.ok(Math.abs(sched._startCtxTime - 0.4) < 0.03, 'anchored at the switch time');
    t.same(Array.from(new Set(sched._notes.map(n => n.trackId))), ['b-drums'],
        'note list reflects the new song\'s active tracks only');

    // Keep running: only the new song's notes fire from here on.
    advance(ctx, sched, {fromSec: 0.425, toSec: 1.2});
    t.ok(noted.length > 0, 'new song notes fire after the switch');
    t.same(Array.from(new Set(noted)), ['b-drums'], 'no old-song notes after the switch');
    sched.stop();
    t.end();
});

tap.test('switchSong cancels old-song sources already enqueued past the boundary', t => {
    const ctx = makeAudioContext();
    const sched = makeScheduler(makeSongA(), ctx);
    startDeterministic(sched, {startStep: 0, activeTracks: ['a-drums', 'a-bass']});
    // At 0.95s the 0.1s lookahead crosses the 1.0s wrap, so iteration 1's
    // step-0 notes of song A are already scheduled.
    advance(ctx, sched, {toSec: 0.95});
    t.ok(sched._activeSources.some(src => src._scheduledStart >= 0.99),
        'precondition: old song has sources enqueued past the wrap');

    sched.switchSong(makeSongB(), ['b-drums'], ctx.currentTime);
    t.notOk(sched._activeSources.some(src => src._scheduledStart >= ctx.currentTime - 0.001),
        'every source at/after the boundary was cancelled');
    sched.stop();
    t.end();
});

tap.test('scheduleSongSwitch applies exactly at the loop wrap (new tempo/length take over)', t => {
    const ctx = makeAudioContext();
    const songB = makeSongB();
    let applied = 0;
    const sched = makeScheduler(makeSongA(), ctx);
    startDeterministic(sched, {startStep: 0, activeTracks: ['a-drums', 'a-bass']});
    // start() anchors at now + a small offset; the first wrap is one old-song
    // loop (1.0s) after that anchor.
    const boundary = sched._startCtxTime + 1.0;

    sched.scheduleSongSwitch(songB, () => ['b-drums'], () => applied++);
    advance(ctx, sched, {toSec: 0.5});
    t.equal(applied, 0, 'not applied mid-loop');
    t.not(sched.song, songB, 'still playing the old song mid-loop');

    advance(ctx, sched, {fromSec: 0.525, toSec: 1.2});
    t.equal(applied, 1, 'applied once at the wrap');
    t.equal(sched.song, songB, 'new song installed');
    t.ok(Math.abs(sched._startCtxTime - boundary) < 1e-6,
        'anchored exactly at the old song\'s loop boundary');
    t.same(sched.activeTrackIds(), ['b-drums'], 'carried ids resolved at apply time');

    // Song B loops every 0.5s from the boundary anchor: expect a wrap by 1.7s.
    advance(ctx, sched, {fromSec: 1.225, toSec: 1.7});
    t.ok(sched._iter >= 1, 'new song\'s shorter loop length drives the wrap cadence');
    sched.stop();
    t.end();
});

tap.test('SongPlayback.switchToSong carries active tracks over by display name', t => {
    const vm = new VirtualMachine();
    attachFakeAudio(vm);
    vm.addSong(makeSongA());
    vm.addSong(makeSongB());
    vm.setActiveSong('A');

    const pb = vm.runtime.songPlayback;
    pb.setTracksActive(['a-drums', 'a-bass'], true, 'now');
    t.ok(pb.isPlaying(), 'transport running on song A');
    // Detach the real interval so the test process controls time and can exit.
    if (pb._scheduler._timer) {
        clearInterval(pb._scheduler._timer);
        pb._scheduler._timer = null;
    }

    let selectionEvents = 0;
    vm.runtime.on('ACTIVE_SONG_CHANGED', () => selectionEvents++);
    pb.switchToSong('B', 'now');
    t.equal(vm.runtime.activeSongIndex, 1, 'selection moved to song B');
    t.equal(selectionEvents, 1, 'ACTIVE_SONG_CHANGED fired');
    t.equal(pb._scheduler.song.songId, 'B', 'transport plays song B');
    t.same(pb.activeTrackIds(), ['b-drums'],
        '"Drums" carried over by name; "Bass" (no match in B) stopped');
    t.equal(pb.playingSongId(), 'B', 'playingSongId reports the new song');

    pb.switchToSong('nope', 'now');
    t.equal(vm.runtime.activeSongIndex, 1, 'unknown songId is a no-op');
    pb.stop();
    t.end();
});

tap.test('SongPlayback.switchToSong on an idle transport just moves the selection', t => {
    const vm = new VirtualMachine();
    attachFakeAudio(vm);
    vm.addSong(makeSongA());
    vm.addSong(makeSongB());

    const pb = vm.runtime.songPlayback;
    t.notOk(pb.isPlaying(), 'idle');
    pb.switchToSong('A', 'loop');
    t.equal(vm.runtime.activeSongIndex, 0, 'selection moved (loop collapses to now when idle)');
    t.notOk(pb.isPlaying(), 'still idle — switching does not start playback');
    t.end();
});
