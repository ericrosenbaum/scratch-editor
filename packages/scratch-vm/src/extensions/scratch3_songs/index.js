const formatMessage = require('format-message');
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const Timer = require('../../util/timer');
const SongScheduler = require('./scheduler');
const {displayNameForTrack} = require('./song-defaults');

// eslint-disable-next-line @stylistic/max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cmVjdCB4PSI2IiB5PSI4IiB3aWR0aD0iMjgiIGhlaWdodD0iMjQiIHJ4PSIyIiBmaWxsPSIjZmZmIiBzdHJva2U9IiM0NDQiLz48cGF0aCBkPSJNMTAgMTRoMjBNMTAgMjBoMjBNMTAgMjZoMjAiIHN0cm9rZT0iI2NjYyIvPjxyZWN0IHg9IjEwIiB5PSIxNCIgd2lkdGg9IjQiIGhlaWdodD0iNCIgZmlsbD0iI2ZmYjMzMyIvPjxyZWN0IHg9IjE4IiB5PSIyMCIgd2lkdGg9IjQiIGhlaWdodD0iNCIgZmlsbD0iI2ZmYjMzMyIvPjxyZWN0IHg9IjI2IiB5PSIyNiIgd2lkdGg9IjQiIGhlaWdodD0iNCIgZmlsbD0iI2ZmYjMzMyIvPjwvc3ZnPg==';

/**
 * Songs extension — plays back per-sprite "song" data authored in the
 * Song Maker tab and fires hat blocks on song / beat / track-note events.
 */
class Scratch3SongsBlocks {
    constructor (runtime) {
        this.runtime = runtime;

        /** Active scheduler per songId @type {Map<string, SongScheduler>} */
        this._activeSongs = new Map();

        /**
         * Per-songId edge-triggered fire flags. When a moment fires, set the
         * flag to true; the corresponding hat predicate returns true once and
         * clears the flag.
         */
        this._fireFlags = {};

        // Ensure music extension is loaded so we can borrow its instrument/drum buffers.
        this._loadMusicIfPossible();

        this.runtime.on('PROJECT_STOP_ALL', () => this.stopAllSongs());
        this.runtime.on('SONGS_CHANGED', () => {
            if (this.runtime.requestToolboxExtensionsUpdate) {
                this.runtime.requestToolboxExtensionsUpdate();
            }
        });
    }

    _music () {
        if (!this.runtime._musicExtension) {
            this._loadMusicIfPossible();
        }
        return this.runtime._musicExtension || null;
    }

    _loadMusicIfPossible () {
        const em = this.runtime.extensionManager;
        if (em && em.isExtensionLoaded && !em.isExtensionLoaded('music')) {
            try { em.loadExtensionIdSync('music'); } catch (e) { /* no-op */ }
        }
    }

    _audioContext () {
        return this.runtime.audioEngine && this.runtime.audioEngine.audioContext;
    }

    _audioDestination () {
        const engine = this.runtime.audioEngine;
        if (engine && typeof engine.getInputNode === 'function') return engine.getInputNode();
        return engine && engine.audioContext && engine.audioContext.destination;
    }

    /** Search every sprite for a song matching songId. @returns {?object} */
    _findSong (songId) {
        const targets = this.runtime.targets || [];
        for (const t of targets) {
            const songs = t.sprite && t.sprite.songs;
            if (!songs) continue;
            for (const s of songs) {
                if (s.songId === songId) return s;
            }
        }
        return null;
    }

    /** Get all songs from the editing target (used to build the SONG menu). */
    _editingTargetSongs () {
        const target = this.runtime.getEditingTarget && this.runtime.getEditingTarget();
        if (!target) return [];
        return (target.sprite && target.sprite.songs) || [];
    }

    getInfo () {
        const songs = this._editingTargetSongs();
        const songMenu = songs.length > 0 ?
            songs.map(s => ({text: s.name, value: s.songId})) :
            [{text: '—', value: ''}];

        const trackMenu = [];
        for (const s of songs) {
            for (const t of (s.tracks || [])) {
                trackMenu.push({
                    text: `${s.name} · ${displayNameForTrack(t)}`,
                    value: `${s.songId}|${t.trackId}`
                });
            }
        }
        if (trackMenu.length === 0) trackMenu.push({text: '—', value: ''});

        return {
            id: 'songs',
            name: formatMessage({
                id: 'songs.categoryName',
                default: 'Songs',
                description: 'Label for the Songs extension category'
            }),
            blockIconURI,
            blocks: [
                {
                    opcode: 'playSong',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'songs.playSong',
                        default: 'play song [SONG]',
                        description: 'Start playing a song'
                    }),
                    arguments: {
                        SONG: {type: ArgumentType.STRING, menu: 'SONG', defaultValue: (songMenu[0] && songMenu[0].value) || ''}
                    }
                },
                {
                    opcode: 'playSongUntilDone',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'songs.playSongUntilDone',
                        default: 'play song [SONG] until done',
                        description: 'Play a song and wait for it to finish'
                    }),
                    arguments: {
                        SONG: {type: ArgumentType.STRING, menu: 'SONG', defaultValue: (songMenu[0] && songMenu[0].value) || ''}
                    }
                },
                {
                    opcode: 'stopSong',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'songs.stopSong',
                        default: 'stop song [SONG]',
                        description: 'Stop a specific song'
                    }),
                    arguments: {
                        SONG: {type: ArgumentType.STRING, menu: 'SONG', defaultValue: (songMenu[0] && songMenu[0].value) || ''}
                    }
                },
                {
                    opcode: 'stopAllSongsBlock',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'songs.stopAllSongs',
                        default: 'stop all songs',
                        description: 'Stop every playing song'
                    })
                },
                {
                    opcode: 'setSongTempo',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'songs.setSongTempo',
                        default: 'set tempo of song [SONG] to [BPM]',
                        description: 'Change the tempo of a song'
                    }),
                    arguments: {
                        SONG: {type: ArgumentType.STRING, menu: 'SONG', defaultValue: (songMenu[0] && songMenu[0].value) || ''},
                        BPM: {type: ArgumentType.NUMBER, defaultValue: 120}
                    }
                },
                {
                    opcode: 'whenSongStarts',
                    blockType: BlockType.HAT,
                    text: formatMessage({
                        id: 'songs.whenSongStarts',
                        default: 'when song [SONG] starts',
                        description: 'Hat block — when song begins playing'
                    }),
                    arguments: {
                        SONG: {type: ArgumentType.STRING, menu: 'SONG', defaultValue: (songMenu[0] && songMenu[0].value) || ''}
                    }
                },
                {
                    opcode: 'whenSongEnds',
                    blockType: BlockType.HAT,
                    text: formatMessage({
                        id: 'songs.whenSongEnds',
                        default: 'when song [SONG] ends',
                        description: 'Hat block — when song finishes playing'
                    }),
                    arguments: {
                        SONG: {type: ArgumentType.STRING, menu: 'SONG', defaultValue: (songMenu[0] && songMenu[0].value) || ''}
                    }
                },
                {
                    opcode: 'whenSongBeat',
                    blockType: BlockType.HAT,
                    text: formatMessage({
                        id: 'songs.whenSongBeat',
                        default: 'when song [SONG] beat',
                        description: 'Hat block — on every beat of a song'
                    }),
                    arguments: {
                        SONG: {type: ArgumentType.STRING, menu: 'SONG', defaultValue: (songMenu[0] && songMenu[0].value) || ''}
                    }
                },
                {
                    opcode: 'whenTrackPlaysNote',
                    blockType: BlockType.HAT,
                    text: formatMessage({
                        id: 'songs.whenTrackPlaysNote',
                        default: 'when track [TRACK] plays note',
                        description: 'Hat block — when a track plays any note'
                    }),
                    arguments: {
                        TRACK: {type: ArgumentType.STRING, menu: 'TRACK', defaultValue: (trackMenu[0] && trackMenu[0].value) || ''}
                    }
                }
            ],
            menus: {
                SONG: {acceptReporters: true, items: songMenu},
                TRACK: {acceptReporters: true, items: trackMenu}
            }
        };
    }

    _setFlag (key) {
        this._fireFlags[key] = true;
    }

    _consumeFlag (key) {
        if (this._fireFlags[key]) {
            this._fireFlags[key] = false;
            return true;
        }
        return false;
    }

    _instrumentBuffer (instIdx, midiNote) {
        const music = this._music();
        if (!music) return null;
        const info = music.getInstrumentPlayer(instIdx, midiNote);
        if (!info) return null;
        return {
            buffer: info.player && info.player.buffer,
            sampleNote: info.sampleNote,
            releaseTime: info.releaseTime
        };
    }

    _drumBuffer (drumIdx) {
        const music = this._music();
        if (!music) return null;
        const drumPlayer = music.getDrumPlayer(drumIdx);
        return drumPlayer && drumPlayer.buffer;
    }

    _startSong (songId, tempoOverride) {
        const ctx = this._audioContext();
        if (!ctx) return null;
        const song = this._findSong(songId);
        if (!song) return null;

        // Stop any running instance of this song first.
        this._stopSong(songId);

        const scheduler = new SongScheduler({
            song,
            audioContext: ctx,
            destination: this._audioDestination(),
            getInstrumentBuffer: (inst, note) => this._instrumentBuffer(inst, note),
            getDrumBuffer: drum => this._drumBuffer(drum),
            tempoOverride,
            onStart: () => this._setFlag(`${songId}|start`),
            onEnd: () => {
                this._setFlag(`${songId}|end`);
                this._activeSongs.delete(songId);
            },
            onBeat: () => this._setFlag(`${songId}|beat`),
            onNote: note => this._setFlag(`${songId}|${note.trackId}|note`)
        });
        this._activeSongs.set(songId, scheduler);
        scheduler.play();
        return scheduler;
    }

    _stopSong (songId) {
        const sched = this._activeSongs.get(songId);
        if (sched) {
            sched.stop();
            this._activeSongs.delete(songId);
        }
    }

    /* Block implementations */

    playSong (args) {
        const songId = Cast.toString(args.SONG);
        if (!songId) return;
        this._startSong(songId);
    }

    playSongUntilDone (args, util) {
        const songId = Cast.toString(args.SONG);
        if (!songId) return;

        if (!util.stackFrame.songStarted) {
            const song = this._findSong(songId);
            if (!song) return;
            this._startSong(songId);
            util.stackFrame.songStarted = true;
            util.stackFrame.songId = songId;
            const sps = (60 / (song.tempo || 120)) / (song.stepsPerBeat || 4);
            util.stackFrame.expectedDuration = (song.lengthSteps || 32) * sps * 1000;
            util.stackFrame.timer = new Timer();
            util.stackFrame.timer.start();
            util.yield();
            return;
        }
        // Wait until either the song's scheduler is no longer active or expected duration elapsed.
        const elapsed = util.stackFrame.timer.timeElapsed();
        const stillRunning = this._activeSongs.has(util.stackFrame.songId);
        if (stillRunning && elapsed < util.stackFrame.expectedDuration + 200) {
            util.yield();
        }
    }

    stopSong (args) {
        const songId = Cast.toString(args.SONG);
        if (!songId) return;
        this._stopSong(songId);
    }

    stopAllSongsBlock () {
        this.stopAllSongs();
    }

    stopAllSongs () {
        for (const songId of Array.from(this._activeSongs.keys())) {
            this._stopSong(songId);
        }
    }

    setSongTempo (args) {
        const songId = Cast.toString(args.SONG);
        const bpm = Math.max(20, Math.min(500, Cast.toNumber(args.BPM)));
        const song = this._findSong(songId);
        if (song) song.tempo = bpm;
        const sched = this._activeSongs.get(songId);
        if (sched) sched.tempoOverride = bpm;
    }

    whenSongStarts (args) {
        return this._consumeFlag(`${Cast.toString(args.SONG)}|start`);
    }

    whenSongEnds (args) {
        return this._consumeFlag(`${Cast.toString(args.SONG)}|end`);
    }

    whenSongBeat (args) {
        return this._consumeFlag(`${Cast.toString(args.SONG)}|beat`);
    }

    whenTrackPlaysNote (args) {
        const combined = Cast.toString(args.TRACK); // "songId|trackId"
        if (!combined || combined.indexOf('|') === -1) return false;
        return this._consumeFlag(`${combined}|note`);
    }
}

module.exports = Scratch3SongsBlocks;
