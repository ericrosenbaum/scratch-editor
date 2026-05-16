const formatMessage = require('format-message');
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const Timer = require('../../util/timer');
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

        /**
         * Edge-triggered fire flags keyed by `${songId}|<event>` (or
         * `${songId}|${trackId}|note`). When a scheduler callback fires we set
         * the flag; the corresponding hat predicate returns true once and
         * clears the flag.
         */
        this._fireFlags = {};

        // PROJECT_STOP_ALL is wired up by SongPlayback itself; we just need to
        // refresh the toolbox menus when the song list changes. The runtime
        // also fans SONGS_CHANGED out from handleProjectLoaded, so this
        // single listener covers both authoring edits and project loads.
        this.runtime.on('SONGS_CHANGED', () => {
            if (this.runtime.requestToolboxExtensionsUpdate) {
                this.runtime.requestToolboxExtensionsUpdate();
            }
        });
    }

    /** Look up a song in the project's global list. @returns {?object} */
    _findSong (songId) {
        const songs = this.runtime.songs || [];
        for (const s of songs) {
            if (s.songId === songId) return s;
        }
        return null;
    }

    /** Get all project songs (used to build the SONG / TRACK menus). */
    _allSongs () {
        return this.runtime.songs || [];
    }

    /**
     * Build the callbacks bag that the runtime's SongPlayback should invoke
     * for hat-block firing on this specific song.
     */
    _callbacksForSong (songId) {
        return {
            onStart: () => this._setFlag(`${songId}|start`),
            onEnd: () => this._setFlag(`${songId}|end`),
            onBeat: () => this._setFlag(`${songId}|beat`),
            onNote: note => this._setFlag(`${songId}|${note.trackId}|note`)
        };
    }

    getInfo () {
        const songs = this._allSongs();
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
                    opcode: 'playSongForever',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'songs.playSongForever',
                        default: 'play song [SONG] forever',
                        description: 'Play a song on loop until stopped'
                    }),
                    arguments: {
                        SONG: {
                            type: ArgumentType.STRING,
                            menu: 'SONG',
                            defaultValue: (songMenu[0] && songMenu[0].value) || ''
                        }
                    }
                },
                {
                    opcode: 'playSongNext',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'songs.playSongNext',
                        // eslint-disable-next-line @stylistic/max-len
                        default: 'play song [SONG] when current song ends',
                        // eslint-disable-next-line @stylistic/max-len
                        description: 'Schedule a song to start at the current song\'s next loop boundary'
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

    /* Block implementations */

    playSong (args) {
        const songId = Cast.toString(args.SONG);
        if (!songId) return;
        const song = this._findSong(songId);
        if (!song) return;
        this.runtime.songPlayback.play(song, {callbacks: this._callbacksForSong(songId)});
    }

    playSongForever (args) {
        const songId = Cast.toString(args.SONG);
        if (!songId) return;
        const song = this._findSong(songId);
        if (!song) return;
        this.runtime.songPlayback.play(song, {
            loop: true,
            callbacks: this._callbacksForSong(songId)
        });
    }

    /**
     * Defer the start of [SONG] until the currently playing song's next
     * iteration boundary. With nothing currently playing, behaves like
     * playSong. The new song inherits the current song's loop state by default.
     */
    playSongNext (args) {
        const songId = Cast.toString(args.SONG);
        if (!songId) return;
        const song = this._findSong(songId);
        if (!song) return;
        this.runtime.songPlayback.queueNext(song, {callbacks: this._callbacksForSong(songId)});
    }

    playSongUntilDone (args, util) {
        const songId = Cast.toString(args.SONG);
        if (!songId) return;

        if (!util.stackFrame.songStarted) {
            const song = this._findSong(songId);
            if (!song) return;
            this.runtime.songPlayback.play(song, {callbacks: this._callbacksForSong(songId)});
            util.stackFrame.songStarted = true;
            util.stackFrame.songId = songId;
            const sps = (60 / (song.tempo || 120)) / (song.stepsPerBeat || 4);
            util.stackFrame.expectedDuration = (song.lengthSteps || 32) * sps * 1000;
            util.stackFrame.timer = new Timer();
            util.stackFrame.timer.start();
            util.yield();
            return;
        }
        // Wait until either the scheduler has moved on (interrupted by
        // another play, stop, or finished naturally) or the expected duration
        // has elapsed with a small grace window.
        const elapsed = util.stackFrame.timer.timeElapsed();
        const stillRunning = this.runtime.songPlayback.currentSongId() === util.stackFrame.songId;
        if (stillRunning && elapsed < util.stackFrame.expectedDuration + 200) {
            util.yield();
        }
    }

    stopSong (args) {
        const songId = Cast.toString(args.SONG);
        if (!songId) return;
        // Only stop if the song currently playing is the one named.
        if (this.runtime.songPlayback.currentSongId() === songId) {
            this.runtime.songPlayback.stop();
        }
    }

    stopAllSongsBlock () {
        this.runtime.songPlayback.stop();
    }

    setSongTempo (args) {
        const songId = Cast.toString(args.SONG);
        const bpm = Math.max(20, Math.min(500, Cast.toNumber(args.BPM)));
        const song = this._findSong(songId);
        if (song) song.tempo = bpm;
        if (this.runtime.songPlayback.currentSongId() === songId) {
            this.runtime.songPlayback.setTempoOverride(bpm);
        }
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
