const formatMessage = require('format-message');
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const MathUtil = require('../../util/math-util');
const Timer = require('../../util/timer');
const {displayNameForTrack} = require('./song-defaults');

// eslint-disable-next-line @stylistic/max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cmVjdCB4PSI2IiB5PSI4IiB3aWR0aD0iMjgiIGhlaWdodD0iMjQiIHJ4PSIyIiBmaWxsPSIjZmZmIiBzdHJva2U9IiM0NDQiLz48cGF0aCBkPSJNMTAgMTRoMjBNMTAgMjBoMjBNMTAgMjZoMjAiIHN0cm9rZT0iI2NjYyIvPjxyZWN0IHg9IjEwIiB5PSIxNCIgd2lkdGg9IjQiIGhlaWdodD0iNCIgZmlsbD0iI2ZmYjMzMyIvPjxyZWN0IHg9IjE4IiB5PSIyMCIgd2lkdGg9IjQiIGhlaWdodD0iNCIgZmlsbD0iI2ZmYjMzMyIvPjxyZWN0IHg9IjI2IiB5PSIyNiIgd2lkdGg9IjQiIGhlaWdodD0iNCIgZmlsbD0iI2ZmYjMzMyIvPjwvc3ZnPg==';

const ALL_TRACKS = '__all__';

// Bars are 4/4-assumed, matching the editor's "length in bars" control
// (stepsPerBar = stepsPerBeat * 4). Used to derive bar boundaries and the
// bar position from the scheduler's per-beat callback.
const BEATS_PER_BAR = 4;

/**
 * Songs extension — real-time controls for the single project-wide track set
 * authored in the Song Maker tab. The transport always loops; blocks toggle
 * tracks active/inactive (immediately or quantized to the next loop), tweak
 * per-track effect parameters live, and report/react to the transport's beat,
 * loop, and note position.
 */
class Scratch3SongsBlocks {
    constructor (runtime) {
        this.runtime = runtime;

        /**
         * Track id of the note currently being dispatched to `whenTrackPlaysNote`
         * hats. Set immediately before each `startHats` call so every matching
         * hat's predicate sees it during synchronous evaluation.
         */
        this._currentNoteTrackId = null;

        // Beat position within the current loop (1-based; 0 when idle). Updated
        // from the scheduler's onBeat callback, which passes a 0-based beat index
        // that resets every loop. Read by the `current beat` reporter and the
        // edge-activated `when beat counter reaches` hat.
        this._currentBeat = 0;

        // Bar position within the current loop (1-based; 0 when idle). Derived
        // from the same 0-based beat index (4 beats per bar), so it resets every
        // loop just like _currentBeat. Read by the `current bar` reporter and the
        // `bar` case of the edge-activated `when … counter reaches` hat.
        this._currentBar = 0;

        // Number of times the whole loop has completed since playback started
        // (0 during the first pass). Set from the scheduler's onLoop callback,
        // which passes the completed-loop count. Read by the `loop counter`
        // reporter and the `loop` case of the `when … counter reaches` hat.
        this._loopCount = 0;

        // Most-recent MIDI pitch played per track, keyed by trackId. Fed by the
        // onNote callback and read by the `current note on [track]` reporter.
        this._lastNoteByTrack = new Map();

        // Wire hat-block callbacks once. The scheduler picks them up next
        // time it's built. Each beat/bar/loop/note fires its hats explicitly via
        // `startHats` (the same path broadcasts and key presses use), so every
        // matching hat block gets its own thread. The beat/bar/loop counters are
        // also updated here so the reporters and edge-activated "reaches" hats
        // can read them. NOTE: the playback singleton only invokes these while a
        // transport it considers block-driven is running, so editor previews
        // (the Song Maker Play button / library hover) never fire these hats.
        this.runtime.songPlayback.setHatCallbacks({
            onBeat: beatIndex => {
                const beat0 = (typeof beatIndex === 'number' ? beatIndex : 0);
                this._currentBeat = beat0 + 1;
                this._currentBar = Math.floor(beat0 / BEATS_PER_BAR) + 1;
                // `when each beat starts` — every beat.
                this.runtime.startHats('songs_whenEach', {UNIT: 'beat'});
                // A new bar (and, at beat 0, a new loop) also begins on this
                // downbeat. The scheduler resets its beat counter to 0 at every
                // loop wrap, so beat 0 reliably marks the top of each loop —
                // firing `loop` here (rather than from onLoop) means it also
                // fires on the very first pass, staying consistent with beat/bar.
                if (beat0 % BEATS_PER_BAR === 0) {
                    this.runtime.startHats('songs_whenEach', {UNIT: 'bar'});
                }
                if (beat0 === 0) {
                    this.runtime.startHats('songs_whenEach', {UNIT: 'loop'});
                }
            },
            onNote: note => {
                this._currentNoteTrackId = note.trackId;
                this._lastNoteByTrack.set(note.trackId, note.pitch);
                this.runtime.startHats('songs_whenTrackPlaysNote');
            },
            onLoop: iter => {
                // `iter` is the completed-loop count; assigning (rather than
                // incrementing) stays correct even if a backgrounded tab skips
                // loop wraps. The `when each loop starts` hat fires from onBeat
                // (beat 0), not here, so it also covers the first pass.
                this._loopCount = (typeof iter === 'number' ? iter : this._loopCount + 1);
            }
        });

        // Reset the beat/loop/note state whenever playback stops. Both the stop
        // button and the green flag route through PROJECT_STOP_ALL →
        // songPlayback.stop() (fires 'stop'); idle-out fires 'end'. We do NOT
        // reset on 'start': start() runs its first tick synchronously (firing
        // the first onBeat/onNote) before the deferred 'start' event, so a
        // start-reset would clobber them. A fresh transport is always preceded
        // by a 'stop'/'end' (or is the first run, fields already 0).
        this.runtime.songPlayback.on('stop', () => this._resetPlaybackCounters());
        this.runtime.songPlayback.on('end', () => this._resetPlaybackCounters());

        // Refresh toolbox menus whenever the song changes (tracks added,
        // instruments changed, project loaded, etc).
        this.runtime.on('SONGS_CHANGED', () => {
            if (this.runtime.requestToolboxExtensionsUpdate) {
                this.runtime.requestToolboxExtensionsUpdate();
            }
        });
    }

    _resetPlaybackCounters () {
        this._currentBeat = 0;
        this._currentBar = 0;
        this._loopCount = 0;
        this._currentNoteTrackId = null;
        this._lastNoteByTrack.clear();
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
     * Resolve a single TRACK menu value to its track object. Menus store the
     * track's display name (the same way the "switch costume to" block stores
     * a costume name), so match on that first. Fall back to a trackId match so
     * reporter-supplied ids and any legacy project that still stores a trackId
     * keep working. Returns null when nothing matches.
     * @param value
     */
    _trackByMenuValue (value) {
        const v = Cast.toString(value);
        if (!v) return null;
        for (const t of this._tracks()) {
            if (displayNameForTrack(t) === v) return t;
        }
        return this._trackById(v);
    }

    /**
     * Resolve a TRACK menu value to a list of track IDs to act on. `__all__`
     * expands to every track in the project song; a track name (or legacy
     * trackId) resolves to a single-element list (or empty if the track is
     * gone).
     * @param value
     */
    _resolveTrackIds (value) {
        const v = Cast.toString(value);
        if (!v) return [];
        if (v === ALL_TRACKS) return this._tracks().map(t => t.trackId);
        const t = this._trackByMenuValue(v);
        return t ? [t.trackId] : [];
    }

    getInfo () {
        const tracks = this._tracks();
        // Menu values are the track's display name (not its trackId), so the
        // block always shows a human-readable label — the same pattern the
        // "switch costume to" block uses (see _trackByMenuValue for lookup).
        const trackMenu = [{text: 'all tracks', value: ALL_TRACKS}];
        for (const t of tracks) {
            const name = displayNameForTrack(t);
            trackMenu.push({text: name, value: name});
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
                    // Entry point to the Song Maker editor: a toolbox button
                    // at the top of the category (like "Make a Block" in My
                    // Blocks). The GUI registers the OPEN_SONG_MAKER callback
                    // on its toolbox workspace and opens the editor modal.
                    blockType: BlockType.BUTTON,
                    text: formatMessage({
                        id: 'songs.openSongMaker',
                        default: 'Open Song Maker',
                        description: 'Toolbox button that opens the Song Maker editor'
                    }),
                    func: 'OPEN_SONG_MAKER'
                },
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
                    opcode: 'restForBeats',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'songs.restForBeats',
                        default: 'rest for [BEATS] beats',
                        description: 'Wait (play no sound) for a number of beats'
                    }),
                    arguments: {
                        BEATS: {type: ArgumentType.NUMBER, defaultValue: 1}
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
                    opcode: 'changeTempoBy',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'songs.changeTempoBy',
                        default: 'change tempo by [TEMPO] bpm',
                        description: 'Increment the song tempo at playback time'
                    }),
                    arguments: {
                        TEMPO: {type: ArgumentType.NUMBER, defaultValue: 10}
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
                    opcode: 'changeKeyBy',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'songs.changeKeyBy',
                        default: 'change key by [SEMITONES] semitones',
                        description: 'Transpose the song key at playback time by a number of semitones'
                    }),
                    arguments: {
                        SEMITONES: {type: ArgumentType.NUMBER, defaultValue: 1}
                    }
                },
                '---',
                {
                    opcode: 'getTempo',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'songs.getTempo',
                        default: 'tempo',
                        description: 'Report the current song tempo, in bpm'
                    })
                },
                {
                    opcode: 'getCurrentBeat',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'songs.getCurrentBeat',
                        default: 'current beat',
                        description: 'Report the beat position within the current loop'
                    })
                },
                {
                    opcode: 'getCurrentBar',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'songs.getCurrentBar',
                        default: 'current bar',
                        description: 'Report the bar position within the current loop'
                    })
                },
                {
                    opcode: 'getLoopCount',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'songs.getLoopCount',
                        default: 'loop counter',
                        description: 'Report how many times the loop has played since it started'
                    })
                },
                {
                    opcode: 'getCurrentNote',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'songs.getCurrentNote',
                        default: 'current note on [TRACK]',
                        description: 'Report the MIDI pitch of the most recent note played on a track'
                    }),
                    arguments: {
                        TRACK: {
                            type: ArgumentType.STRING,
                            menu: 'TRACK_NO_ALL',
                            defaultValue: (tracks[0] && displayNameForTrack(tracks[0])) || ''
                        }
                    }
                },
                '---',
                {
                    opcode: 'whenEach',
                    blockType: BlockType.HAT,
                    // Fired explicitly from the scheduler's onBeat callback, not
                    // edge-evaluated every step. Restart so each event retriggers
                    // a still-running script (broadcast/green-flag semantics).
                    // The UNIT dropdown is an inline field (acceptReporters:false),
                    // so startHats can match on it broadcast-style — firing
                    // `songs_whenEach` with {UNIT: 'bar'} restarts only the `bar`
                    // hats and leaves `beat`/`loop` scripts untouched.
                    isEdgeActivated: false,
                    shouldRestartExistingThreads: true,
                    text: formatMessage({
                        id: 'songs.whenEach',
                        default: 'when each [UNIT] starts',
                        description: 'Hat — fires at the start of each beat, bar, or loop'
                    }),
                    arguments: {
                        // Menu name matches the arg name (UNIT) on purpose: the
                        // serialized menu-shadow block names its field after the
                        // menu, and startHats matches whenEach on the UNIT field
                        // (see the onBeat callback) — they must line up. This is
                        // the same convention WHEN / PARAM follow.
                        UNIT: {type: ArgumentType.STRING, menu: 'UNIT', defaultValue: 'beat'}
                    }
                },
                {
                    opcode: 'whenCounterReaches',
                    blockType: BlockType.HAT,
                    // Edge-activated: the runtime evaluates the predicate every
                    // frame and fires on each false→true crossing. beat/bar reset
                    // each loop, so those re-arm and fire once per loop when the
                    // position reaches N; the loop counter is cumulative, so that
                    // one fires once and re-arms only after a stop / green flag.
                    isEdgeActivated: true,
                    shouldRestartExistingThreads: false,
                    text: formatMessage({
                        id: 'songs.whenCounterReaches',
                        default: 'when [COUNTER] counter reaches [N]',
                        description: 'Hat — fires when the beat, bar, or loop counter reaches a value'
                    }),
                    arguments: {
                        COUNTER: {type: ArgumentType.STRING, menu: 'COUNTER', defaultValue: 'beat'},
                        N: {type: ArgumentType.NUMBER, defaultValue: 4}
                    }
                },
                {
                    opcode: 'whenTrackPlaysNote',
                    blockType: BlockType.HAT,
                    isEdgeActivated: false,
                    // NOT restart (unlike whenEach): every note on any track calls
                    // startHats, which re-evaluates ALL whenTrackPlaysNote hats
                    // against the single _currentNoteTrackId. Restarting would
                    // reset a hat another track just triggered and then kill it on
                    // the track mismatch. Skipping already-running threads instead
                    // lets each track's own note keep its hat alive.
                    shouldRestartExistingThreads: false,
                    text: formatMessage({
                        id: 'songs.whenTrackPlaysNote',
                        default: 'when [TRACK] plays note',
                        description: 'Hat — fires when a track plays any note'
                    }),
                    arguments: {
                        TRACK: {
                            type: ArgumentType.STRING,
                            menu: 'TRACK_NO_ALL',
                            defaultValue: (tracks[0] && displayNameForTrack(tracks[0])) || ''
                        }
                    }
                }
            ],
            menus: {
                TRACK: {acceptReporters: true, items: trackMenu},
                TRACK_NO_ALL: {
                    acceptReporters: true,
                    items: tracks.length > 0 ?
                        tracks.map(t => {
                            const name = displayNameForTrack(t);
                            return {text: name, value: name};
                        }) :
                        [{text: '—', value: ''}]
                },
                WHEN: {
                    acceptReporters: false,
                    items: [
                        {text: 'now', value: 'now'},
                        {text: 'at next loop', value: 'loop'}
                    ]
                },
                // Menu name == the whenEach arg name (UNIT) so the serialized
                // menu-shadow field is 'UNIT' — what startHats matches on
                // broadcast-style (see the onBeat callback).
                UNIT: {
                    acceptReporters: false,
                    items: [
                        {text: 'beat', value: 'beat'},
                        {text: 'bar', value: 'bar'},
                        {text: 'loop', value: 'loop'}
                    ]
                },
                COUNTER: {
                    acceptReporters: false,
                    items: [
                        {text: 'beat', value: 'beat'},
                        {text: 'bar', value: 'bar'},
                        {text: 'loop', value: 'loop'}
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
                }
            }
        };
    }

    /* Block implementations */

    playTrack (args) {
        const when = Cast.toString(args.WHEN) === 'loop' ? 'loop' : 'now';
        const ids = this._resolveTrackIds(args.TRACK);
        if (ids.length === 0) return;
        // Batch so the scheduler can add every id to _activeTracks before
        // start() runs its first tick — otherwise tracks past the first lose
        // their step-0 notes to the lookahead-window guard.
        this.runtime.songPlayback.setTracksActive(ids, true, when);
    }

    stopTrack (args) {
        const when = Cast.toString(args.WHEN) === 'loop' ? 'loop' : 'now';
        const ids = this._resolveTrackIds(args.TRACK);
        if (ids.length === 0) return;
        this.runtime.songPlayback.setTracksActive(ids, false, when);
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

    // Composes against the currently-audible tempo (override if set, else the
    // song's authored value) so repeated `change` blocks accumulate.
    changeTempoBy (args) {
        const pb = this.runtime.songPlayback;
        if (!pb) return;
        const bpm = Math.max(20, Math.min(500, pb.getTempo() + Cast.toNumber(args.TEMPO)));
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

    // Transpose the key by whole semitones, composing against the currently
    // effective root pitch. Clamped to the same MIDI span the setSongKey menu
    // can express (octave 1–7).
    changeKeyBy (args) {
        const pb = this.runtime.songPlayback;
        if (!pb) return;
        const delta = Math.round(Cast.toNumber(args.SEMITONES));
        const midi = Math.max(24, Math.min(107, pb.getRootPitch() + delta));
        pb.setRootPitchOverride(midi);
    }

    // Rest (play no sound) for a number of beats, yielding the thread until the
    // duration elapses. Mirrors the Music extension's stack-timer pattern.
    restForBeats (args, util) {
        if (this._stackTimerNeedsInit(util)) {
            const beats = this._clampBeats(Cast.toNumber(args.BEATS));
            this._startStackTimer(util, this._beatsToSec(beats));
        } else {
            this._checkStackTimer(util);
        }
    }

    // One beat = 60 / tempo seconds — the same beat the `when beat` hat fires on.
    // Uses the currently-audible tempo (block override if set, else the song's
    // authored tempo).
    _beatsToSec (beats) {
        const pb = this.runtime.songPlayback;
        const tempo = pb ? pb.getTempo() : 120;
        return (60 / tempo) * beats;
    }

    _clampBeats (beats) {
        return MathUtil.clamp(beats, 0, 100);
    }

    _stackTimerNeedsInit (util) {
        return !util.stackFrame.timer;
    }

    _startStackTimer (util, duration) {
        util.stackFrame.timer = new Timer();
        util.stackFrame.timer.start();
        util.stackFrame.duration = duration;
        util.yield();
    }

    _checkStackTimer (util) {
        const timeElapsed = util.stackFrame.timer.timeElapsed();
        if (timeElapsed < util.stackFrame.duration * 1000) {
            util.yield();
        }
    }

    getTempo () {
        const pb = this.runtime.songPlayback;
        return pb ? pb.getTempo() : 120;
    }

    getCurrentBeat () {
        return this._currentBeat;
    }

    getCurrentBar () {
        return this._currentBar;
    }

    getLoopCount () {
        return this._loopCount;
    }

    getCurrentNote (args) {
        // args.TRACK is a display name; map it back to the trackId the
        // per-track note map is keyed by.
        const track = this._trackByMenuValue(args.TRACK);
        if (!track) return 0;
        const pitch = this._lastNoteByTrack.get(track.trackId);
        return typeof pitch === 'number' ? pitch : 0;
    }

    // Edge-activated: returns whether the selected counter has reached N. beat
    // and bar reset each loop (so this re-arms per loop); the loop counter is
    // cumulative (so it fires once per run).
    whenCounterReaches (args) {
        const n = Cast.toNumber(args.N);
        switch (Cast.toString(args.COUNTER)) {
        case 'bar': return this._currentBar >= n;
        case 'loop': return this._loopCount >= n;
        default: return this._currentBeat >= n;
        }
    }

    whenEach () {
        // Only invoked by the explicit `startHats('songs_whenEach', {UNIT})`
        // calls in the onBeat callback. startHats already matched the UNIT field
        // broadcast-style, so any hat reached here is for the unit that fired.
        return true;
    }

    whenTrackPlaysNote (args) {
        // args.TRACK is a display name; compare the resolved trackId against
        // the track that just played a note.
        const track = this._trackByMenuValue(args.TRACK);
        if (!track) return false;
        return track.trackId === this._currentNoteTrackId;
    }
}

module.exports = Scratch3SongsBlocks;
