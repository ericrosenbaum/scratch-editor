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

test('Song Maker: vm.addSong attaches song to editing target', t => {
    const vm = new VirtualMachine();
    loadDefaultProject(vm).then(() => {
        vm.addSong(sampleSong());
        const songs = vm.editingTarget.sprite.songs;
        t.equal(songs.length, 1, 'one song added');
        t.equal(songs[0].name, 'Beat 1', 'name correct');
        t.equal(songs[0].tracks.length, 2, 'two tracks');
        t.end();
    }).catch(err => {
        t.fail(err.message);
        t.end();
    });
});

test('Song Maker: sb3 round-trip preserves songs', t => {
    const vm = new VirtualMachine();
    loadDefaultProject(vm).then(() => {
        // Attach a song directly to the editing target's sprite.
        vm.editingTarget.sprite.songs = [sampleSong()];

        const serialized = sb3.serialize(vm.runtime);
        // Find the sprite that has the song
        const targetWithSong = serialized.targets.find(tt => Array.isArray(tt.songs) && tt.songs.length > 0);
        t.ok(targetWithSong, 'a target has serialized songs');
        const song = targetWithSong.songs[0];
        t.equal(song.tempo, 90, 'tempo preserved');
        t.equal(song.tracks[0].notes.length, 2, 'piano notes preserved');
        t.equal(song.tracks[1].notes.length, 2, 'drum notes preserved');
        t.equal(song.tracks[0].notes[0].pitch, 60, 'piano pitch preserved');
        t.equal(song.tracks[0].notes[0].velocity, 100, 'piano velocity preserved');
        t.equal(song.tracks[1].notes[0].velocity, 110, 'drum velocity preserved');
        t.equal(song.tracks[1].kind, 'drum', 'kind preserved');
        t.notOk('pitch' in song.tracks[1].notes[0], 'drum notes omit pitch');

        // Deserialize back
        const vm2 = new VirtualMachine();
        sb3.deserialize(serialized, vm2.runtime).then(({targets}) => {
            const restored = targets.find(tt => Array.isArray(tt.sprite.songs) && tt.sprite.songs.length > 0);
            t.ok(restored, 'songs restored on a target after deserialize');
            t.equal(restored.sprite.songs[0].tempo, 90, 'tempo round-trips');
            t.equal(restored.sprite.songs[0].tracks[0].notes[0].pitch, 60, 'pitch round-trips');
            t.equal(restored.sprite.songs[0].tracks[0].notes[0].velocity, 100, 'velocity round-trips');
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
        const updated = Object.assign({}, vm.editingTarget.sprite.songs[0], {tempo: 200});
        vm.updateSong(0, updated);
        t.equal(vm.editingTarget.sprite.songs[0].tempo, 200, 'updateSong applied');

        // rename
        vm.renameSong(0, 'Renamed');
        t.equal(vm.editingTarget.sprite.songs[0].name, 'Renamed', 'renameSong applied');

        // duplicate
        vm.duplicateSong(0);
        t.equal(vm.editingTarget.sprite.songs.length, 2, 'duplicate adds entry');
        t.not(
            vm.editingTarget.sprite.songs[0].songId,
            vm.editingTarget.sprite.songs[1].songId,
            'duplicate gets a new songId'
        );

        // delete
        vm.deleteSong(1);
        t.equal(vm.editingTarget.sprite.songs.length, 1, 'delete removes entry');

        t.end();
    }).catch(err => {
        t.fail(err.message);
        t.end();
    });
});

test('Song Maker: Sprite.duplicate clones songs with new ids', t => {
    const vm = new VirtualMachine();
    loadDefaultProject(vm).then(() => {
        const sprite = vm.editingTarget.sprite;
        sprite.songs = [sampleSong()];
        return sprite.duplicate();
    }).then(newSprite => {
        t.equal(newSprite.songs.length, 1, 'songs deep-cloned');
        t.not(newSprite.songs[0].songId, 'song-abc', 'new songId assigned');
        t.equal(newSprite.songs[0].tracks.length, 2, 'tracks copied');
        t.end();
    }).catch(err => {
        t.fail(err.message);
        t.end();
    });
});

test('Song Maker: Songs extension getInfo returns 9 blocks + 4 hats', t => {
    const Scratch3SongsBlocks = require('../../src/extensions/scratch3_songs');

    class FakeRuntime {
        constructor () {
            this.targets = [];
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
    t.equal(info.blocks.length, 9, 'nine blocks total');
    const hats = info.blocks.filter(b => b.blockType === 'hat');
    t.equal(hats.length, 4, 'four hat blocks');
    const opcodes = info.blocks.map(b => b.opcode);
    for (const op of [
        'playSong', 'playSongUntilDone', 'stopSong', 'stopAllSongsBlock', 'setSongTempo',
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
            linearRampToValueAtTime: () => {}
        },
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
        createBufferSource: stubBufferSource,
        createGain: stubGain,
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
