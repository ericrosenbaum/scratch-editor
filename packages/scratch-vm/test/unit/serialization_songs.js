const test = require('tap').test;
const path = require('path');
const VirtualMachine = require('../../src/index');
const sb3 = require('../../src/serialization/sb3');
const readFileToBuffer = require('../fixtures/readProjectFile').readFileToBuffer;
const makeTestStorage = require('../fixtures/make-test-storage');

const defaultProjectPath = path.resolve(__dirname, '../fixtures/clone-cleanup.sb2');

const sampleSong = () => ({
    songId: 'song-abc',
    name: 'Beat 1',
    tempo: 90,
    lengthSteps: 16,
    stepsPerBeat: 4,
    tracks: [
        {
            trackId: 'track-1',
            kind: 'instrument',
            name: 'Lead',
            instrument: 1,
            volume: 80,
            muted: false,
            notes: [
                {step: 0, durationSteps: 2, pitch: 60, velocity: 100},
                {step: 4, durationSteps: 1, pitch: 64, velocity: 70}
            ]
        },
        {
            trackId: 'track-2',
            kind: 'drum',
            name: 'Beatz',
            drum: 1,
            volume: 70,
            muted: true,
            notes: [
                {step: 0, durationSteps: 1, velocity: 110},
                {step: 8, durationSteps: 1, velocity: 60}
            ]
        }
    ]
});

const loadDefaultProject = vm => {
    vm.attachStorage(makeTestStorage());
    return vm.loadProject(readFileToBuffer(defaultProjectPath));
};

test('Song Maker: vm.setSong stores the project song on runtime.song', t => {
    const vm = new VirtualMachine();
    loadDefaultProject(vm).then(() => {
        vm.setSong(sampleSong());
        const song = vm.runtime.song;
        t.ok(song, 'song stored on runtime');
        t.equal(song.name, 'Beat 1', 'name correct');
        t.equal(song.tracks.length, 2, 'two tracks');
        t.notOk(vm.editingTarget.sprite.songs,
            'sprite does not carry a songs array');
        t.end();
    }).catch(err => {
        t.fail(err.message);
        t.end();
    });
});

test('Song Maker: sb3 round-trip preserves the project song', t => {
    const vm = new VirtualMachine();
    loadDefaultProject(vm).then(() => {
        vm.runtime.song = sampleSong();

        const serialized = sb3.serialize(vm.runtime);
        t.ok(serialized.song, 'project-level song object present');
        t.notOk(Array.isArray(serialized.songs), 'no legacy songs array emitted');
        const song = serialized.song;
        t.equal(song.tempo, 90, 'tempo preserved');
        t.equal(song.tracks[0].notes.length, 2, 'piano notes preserved');
        t.equal(song.tracks[1].notes.length, 2, 'drum notes preserved');
        t.equal(song.tracks[0].notes[0].pitch, 60, 'piano pitch preserved');
        t.equal(song.tracks[0].notes[0].velocity, 100, 'piano velocity preserved');
        t.equal(song.tracks[1].notes[0].velocity, 110, 'drum velocity preserved');
        t.equal(song.tracks[1].kind, 'drum', 'kind preserved');
        t.notOk('pitch' in song.tracks[1].notes[0], 'drum notes omit pitch');
        t.equal(song.tracks[0].name, 'Lead', 'track name serialized');
        t.equal(song.tracks[1].name, 'Beatz', 'drum track name serialized');

        const targetHasSong = serialized.targets.some(tt => tt.song || Array.isArray(tt.songs));
        t.notOk(targetHasSong, 'no target carries a song');

        const vm2 = new VirtualMachine();
        sb3.deserialize(serialized, vm2.runtime).then(() => {
            t.ok(vm2.runtime.song, 'runtime.song assigned');
            t.equal(vm2.runtime.song.tempo, 90, 'tempo round-trips');
            t.equal(vm2.runtime.song.tracks[0].notes[0].pitch, 60, 'pitch round-trips');
            t.equal(vm2.runtime.song.tracks[0].notes[0].velocity, 100, 'velocity round-trips');
            t.equal(vm2.runtime.song.tracks[0].name, 'Lead', 'track name round-trips');
            t.equal(vm2.runtime.song.tracks[1].name, 'Beatz', 'drum track name round-trips');
            t.end();
        });
    }).catch(err => {
        t.fail(err.message);
        t.end();
    });
});

test('Song Maker: sb3 round-trip preserves a synthDrum track (lanes, voices, notes)', t => {
    const vm = new VirtualMachine();
    loadDefaultProject(vm).then(() => {
        vm.runtime.song = {
            songId: 'song-sd',
            name: 'Synth Beat',
            tempo: 120,
            lengthSteps: 16,
            stepsPerBeat: 4,
            tracks: [
                {
                    trackId: 'track-sd',
                    kind: 'synthDrum',
                    drumLanes: [1, 2, 3],
                    drumVoices: {
                        1: {preset: 'Kick', bodyWave: 'sine', tune: 0.42, drive: 0.3},
                        2: {preset: 'Snare', noiseLevel: 0.9},
                        3: {preset: 'Closed Hat'}
                    },
                    volume: 85,
                    muted: false,
                    notes: [
                        {step: 0, durationSteps: 1, drum: 1, velocity: 110},
                        {step: 4, durationSteps: 1, drum: 2, velocity: 90},
                        {step: 2, durationSteps: 1, drum: 3, velocity: 70}
                    ]
                }
            ]
        };

        const serialized = sb3.serialize(vm.runtime);
        const track = serialized.song.tracks[0];
        t.equal(track.kind, 'synthDrum', 'synthDrum kind preserved');
        t.same(track.drumLanes, [1, 2, 3], 'drumLanes preserved');
        t.ok(track.drumVoices, 'drumVoices present');
        t.equal(track.drumVoices[1].tune, 0.42, 'edited voice param preserved');
        t.equal(track.notes[0].drum, 1, 'per-note drum index preserved');
        t.notOk('pitch' in track.notes[0], 'synthDrum notes omit pitch');

        const vm2 = new VirtualMachine();
        sb3.deserialize(serialized, vm2.runtime).then(() => {
            const rt = vm2.runtime.song.tracks[0];
            t.equal(rt.kind, 'synthDrum', 'kind round-trips');
            t.same(rt.drumLanes, [1, 2, 3], 'lanes round-trip');
            t.equal(rt.drumVoices[1].tune, 0.42, 'voice param round-trips');
            t.equal(rt.drumVoices[2].noiseLevel, 0.9, 'second voice param round-trips');
            t.equal(rt.notes[2].drum, 3, 'per-note drum round-trips');
            t.end();
        });
    }).catch(err => {
        t.fail(err.message);
        t.end();
    });
});

test('Song Maker: sb3 deserialize migrates legacy multi-song format (first wins)', t => {
    const vm = new VirtualMachine();
    loadDefaultProject(vm).then(() => {
        // Hand-craft a legacy serialized form with a top-level songs[] array.
        const serialized = sb3.serialize(vm.runtime);
        delete serialized.song;
        serialized.songs = [
            sampleSong(),
            Object.assign(sampleSong(), {songId: 'second', name: 'Beat 2'})
        ];

        const vm2 = new VirtualMachine();
        sb3.deserialize(serialized, vm2.runtime).then(() => {
            t.ok(vm2.runtime.song, 'song hoisted to runtime');
            t.equal(vm2.runtime.song.songId, 'song-abc', 'first song wins');
            t.equal(vm2.runtime.song.name, 'Beat 1', 'song content preserved');
            t.end();
        });
    }).catch(err => {
        t.fail(err.message);
        t.end();
    });
});

test('Song Maker: sb3 deserialize migrates legacy per-sprite songs', t => {
    const vm = new VirtualMachine();
    loadDefaultProject(vm).then(() => {
        const serialized = sb3.serialize(vm.runtime);
        delete serialized.song;
        // Older builds put songs on a target as a `.songs` array.
        const firstSprite = serialized.targets.find(tt => !tt.isStage);
        firstSprite.songs = [sampleSong()];

        const vm2 = new VirtualMachine();
        sb3.deserialize(serialized, vm2.runtime).then(() => {
            t.ok(vm2.runtime.song, 'song hoisted to runtime');
            t.equal(vm2.runtime.song.name, 'Beat 1', 'song content preserved');
            t.notOk(firstSprite.songs, 'legacy field stripped from target');
            t.end();
        });
    }).catch(err => {
        t.fail(err.message);
        t.end();
    });
});

test('Song Maker: Songs extension getInfo returns the new block set', t => {
    const Scratch3SongsBlocks = require('../../src/extensions/scratch3_songs');

    class FakeRuntime {
        constructor () {
            this.targets = [];
            this.song = null;
            this.extensionManager = {
                isExtensionLoaded: () => false,
                loadExtensionIdSync: () => null
            };
            this.audioEngine = null;
            this._handlers = {};
            this._songPlayback = {
                setHatCallbacks: () => {},
                on: () => {}
            };
        }
        get songPlayback () { return this._songPlayback; }
        on (e, fn) { (this._handlers[e] = this._handlers[e] || []).push(fn); }
        emit () { /* no-op */ }
        getEditingTarget () { return null; }
    }

    const runtime = new FakeRuntime();
    const ext = new Scratch3SongsBlocks(runtime);
    const info = ext.getInfo();
    t.equal(info.id, 'songs', 'extension id correct');
    const opcodes = info.blocks.map(b => b.opcode);
    for (const op of [
        'playTrack', 'stopTrack',
        'changeTrackParam', 'setTrackParam', 'restForBeats',
        'setSongTempo', 'changeTempoBy', 'setSongKey', 'changeKeyBy',
        'getTempo', 'getCurrentBeat', 'getCurrentBar', 'getLoopCount', 'getCurrentNote',
        'whenEach', 'whenCounterReaches', 'whenTrackPlaysNote'
    ]) {
        t.ok(opcodes.indexOf(op) >= 0, `has ${op} block`);
    }
    // Removed blocks should no longer appear.
    t.equal(opcodes.indexOf('fadeTrack'), -1, 'fadeTrack removed');
    t.equal(opcodes.indexOf('setSongScale'), -1, 'setSongScale removed');
    // Combined into whenEach / whenCounterReaches.
    t.equal(opcodes.indexOf('whenBeat'), -1, 'whenBeat replaced by whenEach');
    t.equal(opcodes.indexOf('whenBeatCounterReaches'), -1, 'whenBeatCounterReaches folded into whenCounterReaches');
    t.equal(opcodes.indexOf('whenLoopCounterReaches'), -1, 'whenLoopCounterReaches folded into whenCounterReaches');
    const hats = info.blocks.filter(b => b.blockType === 'hat');
    t.equal(hats.length, 3,
        'three hat blocks (whenEach, whenCounterReaches, whenTrackPlaysNote)');
    t.end();
});

test('Song Maker: displayNameForTrack matches the editor (name/synthDrum/synth preset)', t => {
    const {displayNameForTrack} = require('../../src/extensions/scratch3_songs/song-defaults');
    // A user-set name always wins — this is the block-menu/editor mismatch fix.
    t.equal(displayNameForTrack({kind: 'instrument', instrument: 1, name: 'Piano2'}), 'Piano2',
        'track name wins over instrument name');
    t.equal(displayNameForTrack({kind: 'drum', name: 'My Beat'}), 'My Beat',
        'track name wins for drum tracks');
    // Fallbacks for unnamed tracks (legacy / library songs).
    t.equal(displayNameForTrack({kind: 'instrument', instrument: 6}), 'Bass',
        'falls back to instrument name');
    t.equal(displayNameForTrack({kind: 'drum'}), 'Drums', 'unnamed drum falls back to Drums');
    t.equal(displayNameForTrack({kind: 'synthDrum'}), 'Synth Drums',
        'synthDrum falls back to Synth Drums');
    t.equal(displayNameForTrack({kind: 'synth', synth: {preset: 'Warm Pad'}}), 'Warm Pad',
        'synth uses its preset name');
    t.equal(displayNameForTrack({kind: 'synth'}), 'Synth', 'synth without preset falls back to Synth');
    t.equal(displayNameForTrack(null), '', 'null track yields empty string');
    t.end();
});

test('Song Maker: scheduler schedules notes & fires beat callback for active tracks', t => {
    const SongScheduler = require('../../src/extensions/scratch3_songs/scheduler');

    let currentTime = 0;
    const stubGain = () => ({
        gain: {
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            setTargetAtTime: () => {},
            cancelScheduledValues: () => {},
            value: 0
        },
        pan: {setTargetAtTime: () => {}, value: 0},
        frequency: {setTargetAtTime: () => {}, value: 12000},
        Q: {value: 0.7},
        delayTime: {value: 0.1},
        type: 'lowpass',
        connect: () => {},
        disconnect: () => {}
    });
    const stubBufferSource = () => ({
        buffer: null,
        playbackRate: {value: 1},
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => {},
        onended: null
    });
    const audioCtx = {
        get currentTime () { return currentTime; },
        sampleRate: 44100,
        createBufferSource: stubBufferSource,
        createGain: stubGain,
        createBiquadFilter: stubGain,
        createStereoPanner: stubGain,
        createConvolver: () => ({buffer: null, connect: () => {}, disconnect: () => {}}),
        createDelay: () => stubGain(),
        createBuffer: (channels, length) => ({
            getChannelData: () => new Float32Array(length)
        }),
        destination: {}
    };
    const buffer = {duration: 1, sampleRate: 44100};

    const notes = [];
    const beats = [];
    const song = {
        songId: 's',
        tempo: 120,
        lengthSteps: 4,
        stepsPerBeat: 4,
        tracks: [{
            trackId: 't1',
            kind: 'instrument',
            instrument: 1,
            volume: 100,
            muted: false,
            notes: [
                {step: 0, durationSteps: 1, pitch: 60},
                {step: 2, durationSteps: 1, pitch: 64}
            ]
        }]
    };
    const sched = new SongScheduler({
        song,
        audioContext: audioCtx,
        getInstrumentBuffer: () => ({buffer, sampleNote: 60, releaseTime: 0.05}),
        getDrumBuffer: () => buffer,
        onBeat: i => beats.push(i),
        onNote: n => notes.push(n)
    });
    // Activate t1 and start the transport. An idle scheduler with no active
    // tracks would stop on the first tick.
    sched.start({activeTracks: ['t1']});
    currentTime = 5;
    sched._tick();
    sched.stop();
    t.ok(notes.length >= 2, `note callback fired (got ${notes.length})`);
    t.ok(beats.length >= 1, `beat callback fired (got ${beats.length})`);
    t.end();
});

test('Song Maker: inactive tracks are filtered out of the schedule', t => {
    const SongScheduler = require('../../src/extensions/scratch3_songs/scheduler');

    let currentTime = 0;
    const stubGain = () => ({
        gain: {
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            setTargetAtTime: () => {},
            cancelScheduledValues: () => {},
            value: 0
        },
        pan: {setTargetAtTime: () => {}, value: 0},
        frequency: {setTargetAtTime: () => {}, value: 12000},
        Q: {value: 0.7},
        delayTime: {value: 0.1},
        connect: () => {},
        disconnect: () => {}
    });
    const stubBufferSource = () => ({
        buffer: null,
        playbackRate: {value: 1},
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => {},
        onended: null
    });
    const audioCtx = {
        get currentTime () { return currentTime; },
        sampleRate: 44100,
        createBufferSource: stubBufferSource,
        createGain: stubGain,
        createBiquadFilter: stubGain,
        createStereoPanner: stubGain,
        createConvolver: () => ({buffer: null, connect: () => {}, disconnect: () => {}}),
        createDelay: () => stubGain(),
        createBuffer: (channels, length) => ({
            getChannelData: () => new Float32Array(length)
        }),
        destination: {}
    };
    const buffer = {duration: 1, sampleRate: 44100};

    const notes = [];
    const song = {
        songId: 's',
        tempo: 120,
        lengthSteps: 4,
        stepsPerBeat: 4,
        tracks: [
            {
                trackId: 't1',
                kind: 'instrument',
                instrument: 1,
                volume: 100,
                notes: [{step: 0, durationSteps: 1, pitch: 60}]
            },
            {
                trackId: 't2',
                kind: 'instrument',
                instrument: 1,
                volume: 100,
                notes: [{step: 2, durationSteps: 1, pitch: 67}]
            }
        ]
    };
    const sched = new SongScheduler({
        song,
        audioContext: audioCtx,
        getInstrumentBuffer: () => ({buffer, sampleNote: 60, releaseTime: 0.05}),
        getDrumBuffer: () => buffer,
        onNote: n => notes.push(n)
    });
    // Only activate t1 — t2's note should never fire.
    sched.start({activeTracks: ['t1']});
    currentTime = 5;
    sched._tick();
    sched.stop();
    t.ok(notes.length > 0, 'active track\'s notes fire');
    t.notOk(notes.some(n => n.trackId === 't2'), 'inactive track\'s notes are filtered out');
    t.end();
});
