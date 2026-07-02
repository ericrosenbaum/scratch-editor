/**
 * Integration tests for every non-AI Songs extension block.
 *
 * Each test builds a real VirtualMachine, loads a project, installs a synth +
 * synthDrum song (no sample buffers needed), gives the runtime a deterministic
 * mock audio engine, then invokes block primitives exactly as the interpreter
 * would (the extension methods take an `args` bag). Assertions read the
 * authoritative SongPlayback state: isPlaying / activeTrackIds / getTempo /
 * getRootPitch / getTrackVolume / getTrackEffect and the override maps.
 */

const tap = require('tap');
const VirtualMachine = require('../../src/index');
const makeTestStorage = require('../fixtures/make-test-storage');
const {attachFakeAudio} = require('../fixtures/songs/make-fake-audio');
const Scratch3SongsBlocks = require('../../src/extensions/scratch3_songs');

const baseProject = JSON.parse(JSON.stringify(
    require('../fixtures/songs/project-single-song.json')
));

// A small synth/synthDrum song so playback needs no decoded sample buffers.
const makeTestSong = () => ({
    songId: 'song-blocks',
    name: 'Blocks',
    tempo: 120,
    lengthSteps: 8,
    stepsPerBeat: 4,
    rootPitch: 60,
    scaleType: 'chromatic',
    tracks: [
        {
            trackId: 'lead',
            kind: 'synth',
            volume: 80,
            muted: false,
            synth: {},
            effects: {},
            notes: [{step: 0, durationSteps: 2, pitch: 60, velocity: 100}, {step: 4, pitch: 64, velocity: 90}]
        },
        {
            trackId: 'beat',
            kind: 'synthDrum',
            volume: 70,
            muted: false,
            drumLanes: [1, 2],
            drumVoices: {},
            effects: {},
            notes: [{step: 0, drum: 1, velocity: 110}, {step: 4, drum: 2, velocity: 100}]
        }
    ]
});

// Resolve to {vm, ext, pb, ctx} ready to run blocks.
const setup = () => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());
    return vm.loadProject(JSON.stringify(baseProject)).then(() => {
        vm.setSong(makeTestSong());
        const ctx = attachFakeAudio(vm);
        const ext = new Scratch3SongsBlocks(vm.runtime);
        return {vm, ext, pb: vm.runtime.songPlayback, ctx};
    });
};

// Stop the transport (clears the real setInterval) so the test process can exit.
const teardown = pb => {
    if (pb) pb.stop();
};

tap.test('playTrack / stopTrack ("now") toggle the active set and transport', t => {
    setup().then(({ext, pb}) => {
        t.notOk(pb.isPlaying(), 'idle before any block');
        ext.playTrack({TRACK: 'lead', WHEN: 'now'});
        t.ok(pb.isPlaying(), 'transport runs after playTrack');
        t.same(pb.activeTrackIds(), ['lead'], 'lead is active');
        ext.playTrack({TRACK: 'beat', WHEN: 'now'});
        t.same(pb.activeTrackIds().sort(), ['beat', 'lead'], 'both tracks active');
        ext.stopTrack({TRACK: 'lead', WHEN: 'now'});
        t.same(pb.activeTrackIds(), ['beat'], 'lead removed, beat remains');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('playTrack "all tracks" activates every track at once', t => {
    setup().then(({ext, pb}) => {
        ext.playTrack({TRACK: '__all__', WHEN: 'now'});
        t.same(pb.activeTrackIds().sort(), ['beat', 'lead'], 'all tracks active');
        ext.stopTrack({TRACK: '__all__', WHEN: 'now'});
        t.same(pb.activeTrackIds(), [], 'all tracks stopped');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('playTrack "at next loop" defers activation while running', t => {
    setup().then(({ext, pb}) => {
        ext.playTrack({TRACK: 'lead', WHEN: 'now'});
        ext.playTrack({TRACK: 'beat', WHEN: 'loop'});
        t.same(pb.activeTrackIds(), ['lead'], 'beat NOT active immediately on "at next loop"');
        t.ok(pb._scheduler._pendingTrackChanges.has('beat'), 'beat queued for the next loop boundary');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('setTrackParam volume writes an override; changeTrackParam composes', t => {
    setup().then(({ext, pb}) => {
        ext.playTrack({TRACK: 'lead', WHEN: 'now'});
        ext.setTrackParam({TRACK: 'lead', PARAM: 'volume', VALUE: 50});
        t.equal(pb.getTrackVolume('lead'), 50, 'volume override set to 50');
        t.equal(pb._volumeOverrides.get('lead'), 50, 'override stored on the playback map');
        ext.changeTrackParam({TRACK: 'lead', PARAM: 'volume', VALUE: 30});
        t.equal(pb.getTrackVolume('lead'), 80, 'change composes against current (50 + 30)');
        ext.changeTrackParam({TRACK: 'lead', PARAM: 'volume', VALUE: 999});
        t.equal(pb.getTrackVolume('lead'), 100, 'volume clamps at 100');
        ext.setTrackParam({TRACK: 'lead', PARAM: 'volume', VALUE: -50});
        t.equal(pb.getTrackVolume('lead'), 0, 'volume clamps at 0');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('setTrackParam handles each effect param with correct ranges', t => {
    setup().then(({ext, pb}) => {
        ext.playTrack({TRACK: 'lead', WHEN: 'now'});
        // filter / delay / reverb are 0..100 user-facing → 0..1 engine-native.
        for (const param of ['filter', 'delay', 'reverb']) {
            ext.setTrackParam({TRACK: 'lead', PARAM: param, VALUE: 50});
            t.equal(pb.getTrackEffect('lead', param), 50, `${param} reads back 50 (user range)`);
            t.equal(pb._effectOverrides.get('lead')[param], 0.5, `${param} stored 0.5 (engine range)`);
        }
        // pan is -100..100 user-facing → -1..1 engine-native.
        ext.setTrackParam({TRACK: 'lead', PARAM: 'pan', VALUE: -100});
        t.equal(pb.getTrackEffect('lead', 'pan'), -100, 'pan reads back -100');
        t.equal(pb._effectOverrides.get('lead').pan, -1, 'pan stored -1 (engine range)');
        // changeTrackParam composes the engine value, read back in user range.
        ext.changeTrackParam({TRACK: 'lead', PARAM: 'reverb', VALUE: 30});
        t.equal(pb.getTrackEffect('lead', 'reverb'), 80, 'reverb 50 + 30 = 80');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('setSongTempo / changeTempoBy override and compose, clamped 20..500', t => {
    setup().then(({ext, pb}) => {
        ext.playTrack({TRACK: 'lead', WHEN: 'now'});
        t.equal(pb.getTempo(), 120, 'starts at the song tempo');
        ext.setSongTempo({TEMPO: 140});
        t.equal(pb.getTempo(), 140, 'setSongTempo overrides to 140');
        t.equal(pb._scheduler.tempoOverride, 140, 'override pushed to the running scheduler');
        ext.changeTempoBy({TEMPO: 10});
        t.equal(pb.getTempo(), 150, 'changeTempoBy composes (140 + 10)');
        ext.setSongTempo({TEMPO: 9999});
        t.equal(pb.getTempo(), 500, 'tempo clamps at 500');
        ext.setSongTempo({TEMPO: 1});
        t.equal(pb.getTempo(), 20, 'tempo clamps at 20');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('setSongKey / changeKeyBy override and compose, clamped to MIDI 24..107', t => {
    setup().then(({ext, pb}) => {
        ext.playTrack({TRACK: 'lead', WHEN: 'now'});
        t.equal(pb.getRootPitch(), 60, 'starts at the song root (C4 = 60)');
        ext.setSongKey({NOTE: '2', OCTAVE: 4}); // D, octave 4 → MIDI 62
        t.equal(pb.getRootPitch(), 62, 'setSongKey D4 → MIDI 62');
        ext.changeKeyBy({SEMITONES: 3});
        t.equal(pb.getRootPitch(), 65, 'changeKeyBy composes (62 + 3)');
        ext.changeKeyBy({SEMITONES: 999});
        t.equal(pb.getRootPitch(), 107, 'key clamps at MIDI 107');
        ext.changeKeyBy({SEMITONES: -999});
        t.equal(pb.getRootPitch(), 24, 'key clamps at MIDI 24');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('all block overrides are cleared on PROJECT_STOP_ALL (green-flag stop)', t => {
    setup().then(({vm, ext, pb}) => {
        ext.playTrack({TRACK: '__all__', WHEN: 'now'});
        ext.setTrackParam({TRACK: 'lead', PARAM: 'volume', VALUE: 30});
        ext.setTrackParam({TRACK: 'lead', PARAM: 'reverb', VALUE: 80});
        ext.setSongTempo({TEMPO: 200});
        ext.setSongKey({NOTE: '5', OCTAVE: 3});
        t.ok(pb._volumeOverrides.size > 0 && pb._effectOverrides.size > 0, 'overrides present before stop');
        vm.runtime.emit('PROJECT_STOP_ALL');
        t.equal(pb._volumeOverrides.size, 0, 'volume overrides cleared');
        t.equal(pb._effectOverrides.size, 0, 'effect overrides cleared');
        t.equal(pb._tempoOverride, null, 'tempo override cleared');
        t.equal(pb._rootPitchOverride, null, 'root pitch override cleared');
        t.notOk(pb.isPlaying(), 'transport stopped');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('tempo reporter reflects the current effective tempo', t => {
    setup().then(({ext, pb}) => {
        ext.playTrack({TRACK: 'lead', WHEN: 'now'});
        t.equal(ext.getTempo(), 120, 'reports the song tempo before any override');
        ext.setSongTempo({TEMPO: 145});
        t.equal(ext.getTempo(), 145, 'reflects the tempo override');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('rest for beats converts beats to seconds at the current tempo and yields', t => {
    setup().then(({ext, pb}) => {
        ext.playTrack({TRACK: 'lead', WHEN: 'now'});
        t.equal(ext._beatsToSec(1), 0.5, 'one beat = 0.5s at 120 bpm');
        ext.setSongTempo({TEMPO: 240});
        t.equal(ext._beatsToSec(1), 0.25, 'one beat = 0.25s at 240 bpm');
        // First call initializes the stack timer and yields; duration is in seconds.
        const util = {
            stackFrame: {},
            yielded: false,
            yield () {
                this.yielded = true;
            }
        };
        ext.restForBeats({BEATS: 2}, util);
        t.ok(util.yielded, 'first call yields the thread');
        t.ok(util.stackFrame.timer, 'stack timer initialized');
        t.equal(util.stackFrame.duration, 0.5, '2 beats at 240 bpm = 0.5s');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('beat / bar / loop / note reporters track the transport and reset on stop', t => {
    setup().then(({ext, pb}) => {
        t.equal(ext.getCurrentBeat(), 0, 'current beat is 0 before playback');
        t.equal(ext.getCurrentBar(), 0, 'current bar is 0 before playback');
        t.equal(ext.getLoopCount(), 0, 'loop counter starts at 0');
        t.equal(ext.getCurrentNote({TRACK: 'lead'}), 0, 'current note is 0 before playback');
        // Drive the hat callbacks exactly as the scheduler would (not via
        // playTrack, whose first tick auto-schedules step-0 notes on every track).
        pb._hatCallbacks.onBeat(2); // 0-based beat index → 1-based beat 3, bar 1
        t.equal(ext.getCurrentBeat(), 3, 'current beat is 1-based within the loop');
        t.equal(ext.getCurrentBar(), 1, 'beats 1-4 are bar 1');
        pb._hatCallbacks.onBeat(4); // beat 5 → bar 2 (4 beats/bar)
        t.equal(ext.getCurrentBar(), 2, 'beat 5 is bar 2');
        pb._hatCallbacks.onLoop(4);
        t.equal(ext.getLoopCount(), 4, 'loop counter reflects completed loops');
        pb._hatCallbacks.onNote({trackId: 'lead', pitch: 67});
        t.equal(ext.getCurrentNote({TRACK: 'lead'}), 67, 'current note reports the last MIDI pitch');
        t.equal(ext.getCurrentNote({TRACK: 'beat'}), 0, 'a track with no note yet reports 0');
        // Green-flag / stop resets all of it.
        pb.stop();
        t.equal(ext.getCurrentBeat(), 0, 'current beat reset on stop');
        t.equal(ext.getCurrentBar(), 0, 'current bar reset on stop');
        t.equal(ext.getLoopCount(), 0, 'loop counter reset on stop');
        t.equal(ext.getCurrentNote({TRACK: 'lead'}), 0, 'current note cleared on stop');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('whenCounterReaches predicate is true at/after the threshold for each counter', t => {
    setup().then(({ext, pb}) => {
        ext.playTrack({TRACK: 'lead', WHEN: 'now'});
        pb._hatCallbacks.onBeat(1); // beat 2, bar 1
        t.notOk(ext.whenCounterReaches({COUNTER: 'beat', N: 4}), 'beat false before beat 4');
        pb._hatCallbacks.onBeat(3); // beat 4, bar 1
        t.ok(ext.whenCounterReaches({COUNTER: 'beat', N: 4}), 'beat true once the beat reaches 4');
        t.notOk(ext.whenCounterReaches({COUNTER: 'bar', N: 2}), 'bar false while still in bar 1');
        pb._hatCallbacks.onBeat(4); // beat 5, bar 2
        t.ok(ext.whenCounterReaches({COUNTER: 'bar', N: 2}), 'bar true once the bar reaches 2');
        pb._hatCallbacks.onLoop(1);
        t.notOk(ext.whenCounterReaches({COUNTER: 'loop', N: 2}), 'loop false before 2 loops');
        pb._hatCallbacks.onLoop(2);
        t.ok(ext.whenCounterReaches({COUNTER: 'loop', N: 2}), 'loop true once 2 loops complete');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

// The scheduler's beat/note callbacks are the wrappers song-playback installs;
// they only forward to the extension (which updates counters + fires hats) when
// the transport is block-driven. Calling scheduler.onBeat directly exercises
// that gate through the real wrapper.
tap.test('editor preview does not drive hat/reporter state (only block-caused playback does)', t => {
    setup().then(({ext, pb}) => {
        // Editor Play button → playAll: NOT block-driven.
        pb.playAll({startStep: 0});
        t.notOk(pb._blockDriven, 'playAll (editor preview) is not block-driven');
        pb._scheduler.onBeat(2, 0);
        t.equal(ext.getCurrentBeat(), 0, 'editor-preview beats do not update the reporters');
        // Editor adding a track mid-preview (activateTrack) must not flip
        // ownership — the transport is already running, so it did not start it.
        pb.setTrackActive('beat', true, 'now');
        t.notOk(pb._blockDriven, 'mid-preview activateTrack stays not-block-driven');
        pb._scheduler.onBeat(2, 0);
        t.equal(ext.getCurrentBeat(), 0, 'still inert after activateTrack');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('block-caused playback drives hat/reporter state and stop clears ownership', t => {
    setup().then(({ext, pb}) => {
        // play [track] block spins up an idle transport → block-driven.
        ext.playTrack({TRACK: 'lead', WHEN: 'now'});
        t.ok(pb._blockDriven, 'playTrack marks the transport block-driven');
        pb._scheduler.onBeat(2, 0);
        t.equal(ext.getCurrentBeat(), 3, 'block-driven beats update the reporters');
        pb.stop();
        t.notOk(pb._blockDriven, 'stop clears block-driven ownership');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

// The hat tests run the real interpreter (not bare predicate calls), so the
// extension must be registered with the runtime — `loadExtensionIdSync` binds
// the block functions and the `songs_*` hats. Each hat gets a "change tempo by
// 10" body, so a hat that fired moves the tempo by +10 and we can count how
// many of several identical hats actually ran.
const setupHats = () => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());
    return vm.loadProject(JSON.stringify(baseProject)).then(() => {
        vm.setSong(makeTestSong());
        attachFakeAudio(vm);
        vm.runtime.extensionManager.loadExtensionIdSync('songs');
        vm.runtime.currentStepTime = 1000 / 60;
        const pb = vm.runtime.songPlayback;
        const target = vm.runtime.targets.find(tt => !tt.isStage) || vm.runtime.targets[0];
        return {vm, pb, target};
    });
};

// Build a `<hat> → change tempo by 10` script on `target`. The numeric input
// (and, for whenTrackPlaysNote, the TRACK input) is supplied by a native shadow
// value block (math_number / text), which the interpreter resolves without any
// extra primitive registration. Pass `trackId` only for whenTrackPlaysNote;
// pass `unit` (e.g. 'bar') only for whenEach — modelled exactly as a real
// project serializes it: a `songs_menu_UNIT` shadow on the UNIT input whose
// field startHats matches on broadcast-style.
const addTempoHat = (target, idx, opcode, trackId, unit) => {
    const hatId = `hat_${idx}`;
    const bodyId = `body_${idx}`;
    const numId = `num_${idx}`;
    const hat = {
        id: hatId,
        opcode,
        next: bodyId,
        parent: null,
        inputs: {},
        fields: {},
        topLevel: true,
        shadow: false,
        x: 0,
        y: idx * 200
    };
    if (typeof unit === 'string') {
        const unitShadowId = `unit_${idx}`;
        hat.inputs.UNIT = {name: 'UNIT', block: unitShadowId, shadow: unitShadowId};
        target.blocks.createBlock({
            id: unitShadowId,
            opcode: 'songs_menu_UNIT',
            next: null,
            parent: hatId,
            inputs: {},
            fields: {UNIT: {name: 'UNIT', value: unit}},
            topLevel: false,
            shadow: true
        });
    }
    if (typeof trackId === 'string') {
        const trackShadowId = `track_${idx}`;
        hat.inputs.TRACK = {name: 'TRACK', block: trackShadowId, shadow: trackShadowId};
        target.blocks.createBlock({
            id: trackShadowId,
            opcode: 'text',
            next: null,
            parent: hatId,
            inputs: {},
            fields: {TEXT: {name: 'TEXT', value: trackId}},
            topLevel: false,
            shadow: true
        });
    }
    target.blocks.createBlock(hat);
    target.blocks.createBlock({
        id: bodyId,
        opcode: 'songs_changeTempoBy',
        next: null,
        parent: hatId,
        inputs: {TEMPO: {name: 'TEMPO', block: numId, shadow: numId}},
        fields: {},
        topLevel: false,
        shadow: false
    });
    target.blocks.createBlock({
        id: numId,
        opcode: 'math_number',
        next: null,
        parent: bodyId,
        inputs: {},
        fields: {NUM: {name: 'NUM', value: '10'}},
        topLevel: false,
        shadow: true
    });
};

tap.test('hat blocks: every "when each beat starts" hat fires on a beat (regression: shared-flag bug)', t => {
    setupHats().then(({vm, pb, target}) => {
        addTempoHat(target, 0, 'songs_whenEach', null, 'beat');
        addTempoHat(target, 1, 'songs_whenEach', null, 'beat');
        t.equal(pb.getTempo(), 120, 'tempo starts at the song value');
        // Simulate the transport's first downbeat — onBeat(0) fires beat, bar,
        // and loop hats via startHats; the step runs their queued bodies.
        pb._hatCallbacks.onBeat(0);
        vm.runtime._step();
        t.equal(pb.getTempo(), 140, 'BOTH "when each beat starts" hats ran (+10 each); the old bug left it at 130');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('hat blocks: "when each [unit] starts" fires only the hats for the unit that started', t => {
    setupHats().then(({vm, pb, target}) => {
        addTempoHat(target, 0, 'songs_whenEach', null, 'beat');
        addTempoHat(target, 1, 'songs_whenEach', null, 'bar');
        addTempoHat(target, 2, 'songs_whenEach', null, 'loop');
        t.equal(pb.getTempo(), 120, 'tempo starts at the song value');
        // Mid-loop beat that is NOT a bar/loop boundary (beat 6 → bar 2, not a
        // downbeat): only the `beat` hat should fire.
        pb._hatCallbacks.onBeat(5);
        vm.runtime._step();
        t.equal(pb.getTempo(), 130, 'only the beat hat fired on a non-boundary beat (+10)');
        // Downbeat of the loop (beat 0): beat + bar + loop all start.
        pb._hatCallbacks.onBeat(0);
        vm.runtime._step();
        t.equal(pb.getTempo(), 160, 'beat + bar + loop hats all fired on the downbeat (+30)');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('hat blocks: a played note fires every whenTrackPlaysNote hat for that track only', t => {
    setupHats().then(({vm, pb, target}) => {
        addTempoHat(target, 0, 'songs_whenTrackPlaysNote', 'lead');
        addTempoHat(target, 1, 'songs_whenTrackPlaysNote', 'lead');
        addTempoHat(target, 2, 'songs_whenTrackPlaysNote', 'beat');
        t.equal(pb.getTempo(), 120, 'tempo starts at the song value');
        // The "lead" track plays a note.
        pb._hatCallbacks.onNote({trackId: 'lead'});
        vm.runtime._step();
        t.equal(pb.getTempo(), 140, 'both "lead" hats fired (+10 each); the "beat" hat did not');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('hat blocks: concurrent notes on different tracks each fire their own hat (no cross-track clobber)', t => {
    setupHats().then(({vm, pb, target}) => {
        addTempoHat(target, 0, 'songs_whenTrackPlaysNote', 'lead');
        addTempoHat(target, 1, 'songs_whenTrackPlaysNote', 'beat');
        t.equal(pb.getTempo(), 120, 'tempo starts at the song value');
        // Both tracks play a note in the same tick, before the runtime steps.
        // With restart-existing-threads this let the second note reset and kill
        // the first track's hat, so only one fired (tempo 130).
        pb._hatCallbacks.onNote({trackId: 'lead'});
        pb._hatCallbacks.onNote({trackId: 'beat'});
        vm.runtime._step();
        t.equal(pb.getTempo(), 140, 'both the lead and beat hats fired (+10 each)');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('getInfo TRACK menus reflect the current song tracks by display name', t => {
    setup().then(({ext, pb}) => {
        // Menu values are the tracks' display names (not trackIds), mirroring the
        // "switch costume to" block, so the field always renders a readable label.
        // The fixture's tracks are a preset-less synth ('Synth') and a synthDrum
        // ('Synth Drums').
        const info = ext.getInfo();
        const trackValues = info.menus.TRACK.items.map(i => i.value);
        t.ok(trackValues.includes('__all__'), 'TRACK menu has the "all tracks" option');
        t.ok(trackValues.includes('Synth') && trackValues.includes('Synth Drums'),
            'TRACK menu lists both tracks by display name');
        const noAll = info.menus.TRACK_NO_ALL.items;
        const noAllValues = noAll.map(i => i.value);
        t.notOk(noAllValues.includes('__all__'), 'TRACK_NO_ALL excludes the "all tracks" option');
        t.same(noAllValues.sort(), ['Synth', 'Synth Drums'], 'TRACK_NO_ALL lists individual tracks by name');
        t.ok(noAll.every(i => i.text === i.value), 'each track item shows its value as its text');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});

tap.test('track blocks resolve a track by its display name (and still by legacy trackId)', t => {
    setup().then(({ext, pb}) => {
        // Primary path: the menu stores the display name.
        ext.playTrack({TRACK: 'Synth', WHEN: 'now'});
        t.same(pb.activeTrackIds(), ['lead'], 'display name resolves to the matching trackId');
        // Fallback path: a raw trackId (legacy projects / reporters) still resolves.
        ext.playTrack({TRACK: 'beat', WHEN: 'now'});
        t.same(pb.activeTrackIds().sort(), ['beat', 'lead'], 'legacy trackId still resolves');
        ext.stopTrack({TRACK: 'Synth', WHEN: 'now'});
        t.same(pb.activeTrackIds(), ['beat'], 'stop by display name deactivates the right track');
        teardown(pb);
        t.end();
    })
        .catch(e => {
            t.fail(e.stack || e); t.end();
        });
});
