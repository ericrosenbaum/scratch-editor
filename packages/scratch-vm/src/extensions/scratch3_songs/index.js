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

    _writeParam (track, param, value) {
        // Volume lives directly on the track (0..100). Effects live in the
        // effects bag with engine-native ranges (0..1, pan -1..1). Convert
        // from the block's user-facing range before writing.
        if (param === 'volume') {
            track.volume = Math.max(0, Math.min(100, value));
            return;
        }
        if (!track.effects) track.effects = {};
        if (param === 'pan') {
            track.effects.pan = Math.max(-1, Math.min(1, value / 100));
            return;
        }
        track.effects[param] = Math.max(0, Math.min(1, value / 100));
    }

    _readParam (track, param) {
        // Read back in user-facing units so `change … by` composes correctly.
        if (param === 'volume') return typeof track.volume === 'number' ? track.volume : 80;
        const fx = track.effects || {};
        if (param === 'pan') return (typeof fx.pan === 'number' ? fx.pan : 0) * 100;
        // filter defaults to 1 (open) so a fresh track maps to "100".
        const def = param === 'filter' ? 1 : 0;
        return (typeof fx[param] === 'number' ? fx[param] : def) * 100;
    }

    _commitTrackChange (track, param) {
        // Notify the playback layer so the change is heard live. Effect
        // changes go through setTrackEffects (zero-restart, smoothed). Volume
        // is read at note-schedule time, so we push the new song reference
        // through updateSong to refresh the next loop's note list.
        if (param === 'volume') {
            if (this.runtime.songPlayback && this.runtime.songPlayback.updateSong) {
                this.runtime.songPlayback.updateSong(this.runtime.song);
            }
        } else {
            this.runtime.songPlayback.setTrackEffects(track.trackId, track.effects);
        }
    }

    changeTrackParam (args) {
        const param = Cast.toString(args.PARAM);
        const delta = Cast.toNumber(args.VALUE);
        for (const id of this._resolveTrackIds(args.TRACK)) {
            const track = this._trackById(id);
            if (!track) continue;
            const current = this._readParam(track, param);
            this._writeParam(track, param, current + delta);
            this._commitTrackChange(track, param);
        }
    }

    setTrackParam (args) {
        const param = Cast.toString(args.PARAM);
        const value = Cast.toNumber(args.VALUE);
        for (const id of this._resolveTrackIds(args.TRACK)) {
            const track = this._trackById(id);
            if (!track) continue;
            this._writeParam(track, param, value);
            this._commitTrackChange(track, param);
        }
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
