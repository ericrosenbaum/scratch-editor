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
            name: 'Piano',
            kind: 'instrument',
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
            name: 'Snare',
            kind: 'drum',
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

test('Song Maker: vm.addSong stores in the project-global runtime.songs', t => {
    const vm = new VirtualMachine();
    loadDefaultProject(vm).then(() => {
        vm.addSong(sampleSong());
        const songs = vm.runtime.songs;
        t.equal(songs.length, 1, 'one song added');
        t.equal(songs[0].name, 'Beat 1', 'name correct');
        t.equal(songs[0].tracks.length, 2, 'two tracks');
        // Songs are not sprite-scoped any more.
        t.notOk(vm.editingTarget.sprite.songs,
            'sprite no longer carries a songs array');
        t.end();
    }).catch(err => {
        t.fail(err.message);
        t.end();
    });
});

test('Song Maker: sb3 round-trip preserves project songs', t => {
    const vm = new VirtualMachine();
    loadDefaultProject(vm).then(() => {
        vm.runtime.songs = [sampleSong()];

        const serialized = sb3.serialize(vm.runtime);
        t.ok(Array.isArray(serialized.songs), 'project-level songs array present');
        t.equal(serialized.songs.length, 1, 'one song serialized at project level');
        const song = serialized.songs[0];
        t.equal(song.tempo, 90, 'tempo preserved');
        t.equal(song.tracks[0].notes.length, 2, 'piano notes preserved');
        t.equal(song.tracks[1].notes.length, 2, 'drum notes preserved');
        t.equal(song.tracks[0].notes[0].pitch, 60, 'piano pitch preserved');
        t.equal(song.tracks[0].notes[0].velocity, 100, 'piano velocity preserved');
        t.equal(song.tracks[1].notes[0].velocity, 110, 'drum velocity preserved');
        t.equal(song.tracks[1].kind, 'drum', 'kind preserved');
        t.notOk('pitch' in song.tracks[1].notes[0], 'drum notes omit pitch');

        const targetHasSong = serialized.targets.some(tt => Array.isArray(tt.songs));
        t.notOk(targetHasSong, 'no target carries a songs array post-refactor');

        // Deserialize back
        const vm2 = new VirtualMachine();
        sb3.deserialize(serialized, vm2.runtime).then(() => {
            t.ok(Array.isArray(vm2.runtime.songs), 'runtime.songs assigned');
            t.equal(vm2.runtime.songs.length, 1, 'one song restored');
            t.equal(vm2.runtime.songs[0].tempo, 90, 'tempo round-trips');
            t.equal(vm2.runtime.songs[0].tracks[0].notes[0].pitch, 60, 'pitch round-trips');
            t.equal(vm2.runtime.songs[0].tracks[0].notes[0].velocity, 100, 'velocity round-trips');
            t.end();
        });
    }).catch(err => {
        t.fail(err.message);
        t.end();
    });
});

test('Song Maker: sb3 deserialize migrates legacy per-sprite songs into project list', t => {
    const vm = new VirtualMachine();
    loadDefaultProject(vm).then(() => {
        // Simulate an SB3 saved by an older build that put songs on a target.
        const serialized = sb3.serialize(vm.runtime);
        // Attach the song to the first sprite target's serialized payload, as
        // older serializations would have. Dedupe should keep both visible at
        // the project level even if multiple targets carried copies.
        const firstSprite = serialized.targets.find(tt => !tt.isStage);
        firstSprite.songs = [sampleSong()];
        // Second target with the same songId — should dedupe to one entry.
        const stage = serialized.targets.find(tt => tt.isStage);
        if (stage) stage.songs = [sampleSong()];

        const vm2 = new VirtualMachine();
        sb3.deserialize(serialized, vm2.runtime).then(() => {
            t.ok(Array.isArray(vm2.runtime.songs), 'songs hoisted to runtime');
            t.equal(vm2.runtime.songs.length, 1, 'duplicate songIds deduped');
            t.equal(vm2.runtime.songs[0].name, 'Beat 1', 'song content preserved');
            t.end();
        });
    }).catch(err => {
        t.fail(err.message);
        t.end();
    });
});

test('Song Maker: vm.updateSong / renameSong / duplicateSong / deleteSong', t => {
    const vm = new VirtualMachine();
    loadDefaultProject(vm).then(() => {
        vm.addSong(sampleSong());

        // update
        const updated = Object.assign({}, vm.runtime.songs[0], {tempo: 200});
        vm.updateSong(0, updated);
        t.equal(vm.runtime.songs[0].tempo, 200, 'updateSong applied');

        // rename
        vm.renameSong(0, 'Renamed');
        t.equal(vm.runtime.songs[0].name, 'Renamed', 'renameSong applied');

        // duplicate
        vm.duplicateSong(0);
        t.equal(vm.runtime.songs.length, 2, 'duplicate adds entry');
        t.not(
            vm.runtime.songs[0].songId,
            vm.runtime.songs[1].songId,
            'duplicate gets a new songId'
        );

        // delete
        vm.deleteSong(1);
        t.equal(vm.runtime.songs.length, 1, 'delete removes entry');

        t.end();
    }).catch(err => {
        t.fail(err.message);
        t.end();
    });
});

test('Song Maker: Songs extension getInfo returns 11 blocks + 4 hats', t => {
    const Scratch3SongsBlocks = require('../../src/extensions/scratch3_songs');

    class FakeRuntime {
        constructor () {
            this.targets = [];
            this.songs = [];
            this.extensionManager = {
                isExtensionLoaded: () => false,
                loadExtensionIdSync: () => null
            };
            this.audioEngine = null;
            this._handlers = {};
        }
        on (e, fn) { (this._handlers[e] = this._handlers[e] || []).push(fn); }
        emit () { /* no-op */ }
        getEditingTarget () { return null; }
    }

    const runtime = new FakeRuntime();
    const ext = new Scratch3SongsBlocks(runtime);
    const info = ext.getInfo();
    t.equal(info.id, 'songs', 'extension id correct');
    t.equal(info.blocks.length, 11, 'eleven blocks total (with playSongNext)');
    const hats = info.blocks.filter(b => b.blockType === 'hat');
    t.equal(hats.length, 4, 'four hat blocks');
    const opcodes = info.blocks.map(b => b.opcode);
    for (const op of [
        'playSong', 'playSongUntilDone', 'playSongForever', 'playSongNext',
        'stopSong', 'stopAllSongsBlock', 'setSongTempo',
        'whenSongStarts', 'whenSongEnds', 'whenSongBeat', 'whenTrackPlaysNote'
    ]) {
        t.ok(opcodes.indexOf(op) >= 0, `has ${op} block`);
    }
    t.end();
});

test('Song Maker: scheduler schedules notes & fires beat callback', t => {
    const SongScheduler = require('../../src/extensions/scratch3_songs/scheduler');

    let currentTime = 0;
    const stubGain = () => ({
        gain: {
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            setTargetAtTime: () => {},
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
    sched.play();
    currentTime = 5;
    sched._tick();
    sched.stop();
    t.ok(notes.length >= 2, `note callback fired (got ${notes.length})`);
    t.ok(beats.length >= 1, `beat callback fired (got ${beats.length})`);
    t.end();
});

test('Song Maker: queueSong swaps to next song at boundary', t => {
    const SongScheduler = require('../../src/extensions/scratch3_songs/scheduler');

    let currentTime = 0;
    const stubGain = () => ({
        gain: {
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            setTargetAtTime: () => {},
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

    const verse = {
        songId: 'verse',
        tempo: 120,
        lengthSteps: 4,
        stepsPerBeat: 4,
        tracks: [{
            trackId: 't1',
            kind: 'instrument',
            instrument: 1,
            volume: 100,
            muted: false,
            notes: [{step: 0, durationSteps: 1, pitch: 60}]
        }]
    };
    const bridge = {
        songId: 'bridge',
        tempo: 120,
        lengthSteps: 4,
        stepsPerBeat: 4,
        tracks: [{
            trackId: 't1',
            kind: 'instrument',
            instrument: 1,
            volume: 100,
            muted: false,
            notes: [{step: 0, durationSteps: 1, pitch: 67}]
        }]
    };

    let swapped = null;
    let endedNaturally = false;
    const sched = new SongScheduler({
        song: verse,
        audioContext: audioCtx,
        loop: false,
        getInstrumentBuffer: () => ({buffer, sampleNote: 60, releaseTime: 0.05}),
        getDrumBuffer: () => buffer,
        onSongSwap: newSong => { swapped = newSong; },
        onEnd: () => { endedNaturally = true; }
    });
    sched.play();
    sched.queueSong(bridge);
    // Advance well past the verse's length (4 steps @ 120 BPM stepsPerBeat=4
    // = 0.5s) but only just past the boundary so the swap fires before the
    // natural-end grace window.
    currentTime = 1.0;
    sched._tick();
    t.ok(swapped, 'onSongSwap fired');
    t.equal(swapped && swapped.songId, 'bridge', 'swapped to queued song');
    t.equal(sched.song.songId, 'bridge', 'scheduler now references bridge');
    t.notOk(endedNaturally, 'did not fire onEnd — handed off cleanly');
    sched.stop();
    t.end();
});
