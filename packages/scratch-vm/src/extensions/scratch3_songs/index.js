const formatMessage = require('format-message');
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const {displayNameForTrack} = require('./song-defaults');

// eslint-disable-next-line @stylistic/max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cmVjdCB4PSI2IiB5PSI4IiB3aWR0aD0iMjgiIGhlaWdodD0iMjQiIHJ4PSIyIiBmaWxsPSIjZmZmIiBzdHJva2U9IiM0NDQiLz48cGF0aCBkPSJNMTAgMTRoMjBNMTAgMjBoMjBNMTAgMjZoMjAiIHN0cm9rZT0iI2NjYyIvPjxyZWN0IHg9IjEwIiB5PSIxNCIgd2lkdGg9IjQiIGhlaWdodD0iNCIgZmlsbD0iI2ZmYjMzMyIvPjxyZWN0IHg9IjE4IiB5PSIyMCIgd2lkdGg9IjQiIGhlaWdodD0iNCIgZmlsbD0iI2ZmYjMzMyIvPjxyZWN0IHg9IjI2IiB5PSIyNiIgd2lkdGg9IjQiIGhlaWdodD0iNCIgZmlsbD0iI2ZmYjMzMyIvPjwvc3ZnPg==';

const ALL_TRACKS = '__all__';

/**
 * Songs extension — real-time controls for the single project-wide track set
 * authored in the Song Maker tab. The transport always loops; blocks toggle
 * tracks active/inactive (immediately or quantized to the next loop), fade
 * tracks in/out, and tweak per-track effect parameters live.
 */
class Scratch3SongsBlocks {
    constructor (runtime) {
        this.runtime = runtime;

        /**
         * Edge-triggered fire flags for hat blocks. Keys: `beat` (global) and
         * `<trackId>|note` (per track).
         */
        this._fireFlags = {};

        // Wire hat-block callbacks once. The scheduler picks them up next
        // time it's built.
        this.runtime.songPlayback.setHatCallbacks({
            onBeat: () => this._setFlag('beat'),
            onNote: note => this._setFlag(`${note.trackId}|note`)
        });

        // Refresh toolbox menus whenever the song changes (tracks added,
        // instruments changed, project loaded, etc).
        this.runtime.on('SONGS_CHANGED', () => {
            if (this.runtime.requestToolboxExtensionsUpdate) {
                this.runtime.requestToolboxExtensionsUpdate();
            }
        });
    }

    _song () {
        return this.runtime.song || null;
    }

    _tracks () {
        const s = this._song();
        return (s && s.tracks) || [];
    }

    _trackById (trackId) {
        for (const t of this._tracks()) {
            if (t.trackId === trackId) return t;
        }
        return null;
    }

    /**
     * Resolve a TRACK menu value to a list of track IDs to act on. `__all__`
     * expands to every track in the project song; an individual trackId
     * resolves to a single-element list (or empty if the track is gone).
     * @param value
     */
    _resolveTrackIds (value) {
        const v = Cast.toString(value);
        if (!v) return [];
        if (v === ALL_TRACKS) return this._tracks().map(t => t.trackId);
        return this._trackById(v) ? [v] : [];
    }

    getInfo () {
        const tracks = this._tracks();
        const trackMenu = [{text: 'all tracks', value: ALL_TRACKS}];
        for (const t of tracks) {
            trackMenu.push({text: displayNameForTrack(t), value: t.trackId});
        }
        const defaultTrack = trackMenu[0].value;

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
                    opcode: 'playTrack',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'songs.playTrack',
                        default: 'play [TRACK] [WHEN]',
                        description: 'Activate one or more tracks'
                    }),
                    arguments: {
                        TRACK: {type: ArgumentType.STRING, menu: 'TRACK', defaultValue: defaultTrack},
                        WHEN: {type: ArgumentType.STRING, menu: 'WHEN', defaultValue: 'now'}
                    }
                },
                {
                    opcode: 'stopTrack',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'songs.stopTrack',
                        default: 'stop [TRACK] [WHEN]',
                        description: 'Deactivate one or more tracks'
                    }),
                    arguments: {
                        TRACK: {type: ArgumentType.STRING, menu: 'TRACK', defaultValue: defaultTrack},
                        WHEN: {type: ArgumentType.STRING, menu: 'WHEN', defaultValue: 'now'}
                    }
                },
                {
                    opcode: 'fadeTrack',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'songs.fadeTrack',
                        default: 'fade [DIR] [TRACK] [WHEN]',
                        description: 'Fade tracks in or out'
                    }),
                    arguments: {
                        DIR: {type: ArgumentType.STRING, menu: 'DIR', defaultValue: 'in'},
                        TRACK: {type: ArgumentType.STRING, menu: 'TRACK', defaultValue: defaultTrack},
                        WHEN: {type: ArgumentType.STRING, menu: 'WHEN', defaultValue: 'now'}
                    }
                },
                {
                    opcode: 'changeTrackParam',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'songs.changeTrackParam',
                        default: 'change [TRACK] [PARAM] by [VALUE]',
                        description: 'Increment a per-track parameter'
                    }),
                    arguments: {
                        TRACK: {type: ArgumentType.STRING, menu: 'TRACK', defaultValue: defaultTrack},
                        PARAM: {type: ArgumentType.STRING, menu: 'PARAM', defaultValue: 'volume'},
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 10}
                    }
                },
                {
                    opcode: 'setTrackParam',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'songs.setTrackParam',
                        default: 'set [TRACK] [PARAM] to [VALUE]',
                        description: 'Set a per-track parameter to an absolute value'
                    }),
                    arguments: {
                        TRACK: {type: ArgumentType.STRING, menu: 'TRACK', defaultValue: defaultTrack},
                        PARAM: {type: ArgumentType.STRING, menu: 'PARAM', defaultValue: 'volume'},
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 100}
                    }
                },
                {
                    opcode: 'setSongTempo',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'songs.setSongTempo',
                        default: 'set tempo to [TEMPO] bpm',
                        description: 'Override the song tempo at playback time'
                    }),
                    arguments: {
                        TEMPO: {type: ArgumentType.NUMBER, defaultValue: 120}
                    }
                },
                {
                    opcode: 'setSongKey',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'songs.setSongKey',
                        default: 'set key to [NOTE] octave [OCTAVE]',
                        description: 'Override the song root note at playback time'
                    }),
                    arguments: {
                        NOTE: {type: ArgumentType.STRING, menu: 'NOTE', defaultValue: '0'},
                        OCTAVE: {type: ArgumentType.NUMBER, defaultValue: 4}
                    }
                },
                {
                    opcode: 'setSongScale',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'songs.setSongScale',
                        default: 'set scale to [SCALE]',
                        description: 'Override the song scale at playback time'
                    }),
                    arguments: {
                        SCALE: {type: ArgumentType.STRING, menu: 'SCALE', defaultValue: 'major'}
                    }
                },
                {
                    opcode: 'whenBeat',
                    blockType: BlockType.HAT,
                    text: formatMessage({
                        id: 'songs.whenBeat',
                        default: 'when beat',
                        description: 'Hat — fires on each transport beat'
                    })
                },
                {
                    opcode: 'whenTrackPlaysNote',
                    blockType: BlockType.HAT,
                    text: formatMessage({
                        id: 'songs.whenTrackPlaysNote',
                        default: 'when [TRACK] plays note',
                        description: 'Hat — fires when a track plays any note'
                    }),
                    arguments: {
                        TRACK: {
                            type: ArgumentType.STRING,
                            menu: 'TRACK_NO_ALL',
                            defaultValue: (tracks[0] && tracks[0].trackId) || ''
                        }
                    }
                }
            ],
            menus: {
                TRACK: {acceptReporters: true, items: trackMenu},
                TRACK_NO_ALL: {
                    acceptReporters: true,
                    items: tracks.length > 0 ?
                        tracks.map(t => ({text: displayNameForTrack(t), value: t.trackId})) :
                        [{text: '—', value: ''}]
                },
                WHEN: {
                    acceptReporters: false,
                    items: [
                        {text: 'now', value: 'now'},
                        {text: 'at next loop', value: 'loop'}
                    ]
                },
                DIR: {
                    acceptReporters: false,
                    items: [
                        {text: 'in', value: 'in'},
                        {text: 'out', value: 'out'}
                    ]
                },
                PARAM: {
                    acceptReporters: false,
                    items: [
                        {text: 'volume', value: 'volume'},
                        {text: 'filter', value: 'filter'},
                        {text: 'delay', value: 'delay'},
                        {text: 'reverb', value: 'reverb'},
                        {text: 'pan', value: 'pan'}
                    ]
                },
                NOTE: {
                    acceptReporters: true,
                    items: [
                        {text: 'C', value: '0'},
                        {text: 'C#', value: '1'},
                        {text: 'D', value: '2'},
                        {text: 'D#', value: '3'},
                        {text: 'E', value: '4'},
                        {text: 'F', value: '5'},
                        {text: 'F#', value: '6'},
                        {text: 'G', value: '7'},
                        {text: 'G#', value: '8'},
                        {text: 'A', value: '9'},
                        {text: 'A#', value: '10'},
                        {text: 'B', value: '11'}
                    ]
                },
                SCALE: {
                    acceptReporters: true,
                    items: [
                        {text: 'major', value: 'major'},
                        {text: 'minor', value: 'minor'},
                        {text: 'pentatonic major', value: 'pentatonicMajor'},
                        {text: 'pentatonic minor', value: 'pentatonicMinor'},
                        {text: 'chromatic', value: 'chromatic'}
                    ]
                }
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

    playTrack (args) {
        const when = Cast.toString(args.WHEN) === 'loop' ? 'loop' : 'now';
        for (const id of this._resolveTrackIds(args.TRACK)) {
            this.runtime.songPlayback.setTrackActive(id, true, when);
        }
    }

    stopTrack (args) {
        const when = Cast.toString(args.WHEN) === 'loop' ? 'loop' : 'now';
        const ids = this._resolveTrackIds(args.TRACK);
        if (ids.length === 0) return;
        // Stopping every track immediately is equivalent to stop() — but
        // doing it per-track lets the user mix `__all__` deactivations with
        // partial ones cleanly.
        for (const id of ids) {
            this.runtime.songPlayback.setTrackActive(id, false, when);
        }
    }

    fadeTrack (args) {
        const dir = Cast.toString(args.DIR) === 'out' ? 'out' : 'in';
        const when = Cast.toString(args.WHEN) === 'loop' ? 'loop' : 'now';
        for (const id of this._resolveTrackIds(args.TRACK)) {
            this.runtime.songPlayback.fadeTrack(id, dir, when, 1.0);
        }
    }

    // Block writes never mutate runtime.song — they go through the playback's
    // override layer instead. Overrides are temporary (cleared on green-flag
    // stop) and do not leak into the editor sliders or the saved project.
    // Reads come back from the same override layer so `change … by` composes
    // against the currently-audible value.

    _writeParam (trackId, param, value) {
        const pb = this.runtime.songPlayback;
        if (!pb) return;
        if (param === 'volume') {
            pb.setTrackVolumeOverride(trackId, Math.max(0, Math.min(100, value)));
            return;
        }
        if (param === 'pan') {
            pb.setTrackEffectOverride(trackId, 'pan', Math.max(-1, Math.min(1, value / 100)));
            return;
        }
        pb.setTrackEffectOverride(trackId, param, Math.max(0, Math.min(1, value / 100)));
    }

    _readParam (trackId, param) {
        const pb = this.runtime.songPlayback;
        if (!pb) {
            // Pre-playback fallback: read the baseline directly so a sole
            // `change … by` (with no playback yet) still composes sensibly.
            const track = this._trackById(trackId);
            if (param === 'volume') return typeof (track && track.volume) === 'number' ? track.volume : 80;
            const fx = (track && track.effects) || {};
            if (param === 'pan') return (typeof fx.pan === 'number' ? fx.pan : 0) * 100;
            const def = param === 'filter' ? 1 : 0;
            return (typeof fx[param] === 'number' ? fx[param] : def) * 100;
        }
        return param === 'volume' ? pb.getTrackVolume(trackId) : pb.getTrackEffect(trackId, param);
    }

    changeTrackParam (args) {
        const param = Cast.toString(args.PARAM);
        const delta = Cast.toNumber(args.VALUE);
        for (const id of this._resolveTrackIds(args.TRACK)) {
            const current = this._readParam(id, param);
            this._writeParam(id, param, current + delta);
        }
    }

    setTrackParam (args) {
        const param = Cast.toString(args.PARAM);
        const value = Cast.toNumber(args.VALUE);
        for (const id of this._resolveTrackIds(args.TRACK)) {
            this._writeParam(id, param, value);
        }
    }

    setSongTempo (args) {
        const pb = this.runtime.songPlayback;
        if (!pb) return;
        const bpm = Math.max(20, Math.min(500, Cast.toNumber(args.TEMPO)));
        pb.setTempoOverride(bpm);
    }

    setSongKey (args) {
        const pb = this.runtime.songPlayback;
        if (!pb) return;
        const pc = Math.max(0, Math.min(11, parseInt(Cast.toString(args.NOTE), 10) || 0));
        const oct = Math.max(1, Math.min(7, Cast.toNumber(args.OCTAVE) || 4));
        // Octave 4 + pitch class 0 = MIDI 60 (C4). Same encoding as the editor.
        const midi = ((oct + 1) * 12) + pc;
        pb.setRootPitchOverride(midi);
    }

    setSongScale (args) {
        const pb = this.runtime.songPlayback;
        if (!pb) return;
        const valid = {major: 1, minor: 1, pentatonicMajor: 1, pentatonicMinor: 1, chromatic: 1};
        const raw = Cast.toString(args.SCALE);
        pb.setScaleTypeOverride(valid[raw] ? raw : 'chromatic');
    }

    whenBeat () {
        return this._consumeFlag('beat');
    }

    whenTrackPlaysNote (args) {
        const trackId = Cast.toString(args.TRACK);
        if (!trackId) return false;
        return this._consumeFlag(`${trackId}|note`);
    }
}

module.exports = Scratch3SongsBlocks;
