const SongScheduler = require('./scheduler');
const {displayNameForTrack} = require('./song-defaults');
const {getTrackSynth} = require('./synth-defaults');
const {buildPercussionVoice} = require('./synth-drum-voice');
const {midiToFreq} = require('./scheduler');
const {
    velocityToGain,
    gainForSampleInstrument, gainForSampledDrum, gainForSynthPreset, gainForSynthDrumPreset
} = require('./instrument-gain');

// Song master bus: all song tracks (and editor previews) sum here before the
// shared audio-engine input, so sprite sounds are unaffected. The chain is
//   makeup gain → limiter → soft-clip ceiling → engine input.
// The limiter rides the macro level when layers stack, but a DynamicsCompressor
// has an attack window (and finite ratio), so fast transients — note onsets,
// kicks — punch through it above 0 dBFS and hard-clip on the hardware. The
// soft-clip ceiling is the brick wall the limiter isn't: a WaveShaper has no
// attack, so it catches every transient and saturates gently toward the ceiling
// instead of clipping. Measured across the library this takes dense sections
// from ~0.15% of samples clipping (audible distortion) to zero. See the
// whole-song render harness in scratch-gui src/playground/song-loudness.jsx.
// A dense multi-track song sums many voices: even with each instrument peak-safe
// on its own note (~-1 dBFS at velocity 127), 3-4 note chords and 4 stacked
// tracks drive the raw sum to ~+8 dBFS. The old settings (makeup 1.0, limiter
// threshold -3) left the soft-clip saturating ~0.1-0.15% of samples on the
// densest library songs — audible distortion, worst on harmonized/loud parts.
// Two changes fix it (verified via song-loudness.jsx measureSong across the
// densest songs → soft-clip engagement 0.00%):
//   - 0.7 makeup gives ~3 dB of summing headroom and pulls the full-mix level
//     down from a too-hot ~-6 LUFS toward a saner ~-7.5 LUFS.
//   - a -6 dB limiter threshold catches the polyphonic peaks the old -3 let
//     through, so the soft-clip is a barely-touched final safety net, not the
//     workhorse. Per-instrument trims are unchanged — they're already balanced
//     and peak-safe; the problem was the summed level, not any single voice.
const MASTER_MAKEUP_GAIN = 0.7;
const MASTER_LIMITER = {threshold: -6, knee: 0, ratio: 20, attack: 0.003, release: 0.25};
// Final peak ceiling (linear). 0.95 ≈ -0.45 dBFS, leaving margin for inter-sample
// peaks; KNEE is where saturation begins (below it the bus is transparent). The
// earlier knee (0.70) rounds the rare residual transient off gently rather than
// near-flat-topping it.
const MASTER_CEILING = 0.95;
const MASTER_CEILING_KNEE = 0.70;

// Soft-clip transfer curve for the master WaveShaper: identity below KNEE, then a
// tanh approach to CEILING so |output| can never exceed CEILING (inputs past ±1
// clamp to the curve endpoints, which sit at the ceiling). Built once and reused.
const makeSoftClipCurve = (ceiling, knee) => {
    const N = 4096;
    const curve = new Float32Array(N);
    const span = Math.max(1e-3, ceiling - knee);
    for (let i = 0; i < N; i++) {
        const x = ((i / (N - 1)) * 2) - 1;
        const a = Math.abs(x);
        const y = a <= knee ? a : knee + (span * Math.tanh((a - knee) / span));
        curve[i] = Math.sign(x) * y;
    }
    return curve;
};
let _softClipCurve = null;

/**
 * Project-wide song playback singleton owned by the runtime. Holds at most
 * one scheduler — both the extension's blocks and the GUI editor's preview
 * route through this single instance so they can't produce overlapping audio.
 *
 * The transport is implicitly always-looping; it only ticks when ≥1 track is
 * active. Activation/deactivation can happen "now" or be deferred to the next
 * loop boundary. Fades animate the per-track gain and (for fade-out) also
 * deactivate the track when the ramp completes.
 */
class SongPlayback {
    constructor (runtime) {
        this.runtime = runtime;
        this._scheduler = null;
        // External subscribers (GUI editor) for high-level events.
        this._listeners = {start: [], step: [], end: [], stop: []};
        // Hat-block callbacks the extension wires once at construction. The
        // scheduler is constructed lazily, so we apply these whenever a new
        // scheduler comes online.
        this._hatCallbacks = {};
        // Whether the CURRENT transport session was started by project blocks
        // (playTrack / stopTrack) rather than an editor preview (the Song Maker
        // Play button or a library hover). Song hat blocks (`when each …`,
        // `when … plays note`) should only fire for block-driven playback — an
        // editor preview must not run the user's scripts — so the scheduler's
        // beat/bar/loop/note callbacks are gated on this flag. Set when a block
        // spins up an idle transport; the editor's mid-preview activateTrack
        // leaves it alone (the transport is already running, so it can't be the
        // one that started it). Reset on stop.
        this._blockDriven = false;
        // Block-driven overrides for per-track effects and volume. Editor
        // sliders write to `track.effects` / `track.volume` on the song;
        // blocks write here instead so their changes are temporary, audible,
        // and don't bleed into the editor state or the saved project. Cleared
        // on stop (green-flag stop), so each green-flag run starts fresh.
        //   _effectOverrides: Map<trackId, { [param]: value }>   engine-native ranges
        //   _volumeOverrides: Map<trackId, number>               0..1
        this._effectOverrides = new Map();
        this._volumeOverrides = new Map();
        // Song-wide playback overrides — tempo (bpm) and root pitch (MIDI int).
        // Stored at the playback level so they survive scheduler re-creation,
        // then pushed into the scheduler when it spins up or when they change.
        // null = no override (fall back to the song's authored value). Cleared
        // alongside the effect maps on green-flag stop so each run starts fresh.
        // `_scaleTypeOverride` is retained (always null) because the scheduler's
        // setPitchOverrides(root, scale) is shared with the root-pitch override.
        this._tempoOverride = null;
        this._rootPitchOverride = null;
        this._scaleTypeOverride = null;
        // Editor library preview: when previewing a not-yet-added track/section
        // we play a detached preview song held here (NOT written into
        // runtime.songs — with multiple songs the runtime list is the saved
        // project, so a swap would corrupt it). Everything that needs "the
        // song being played" goes through _currentSong(), which prefers the
        // preview when one is in flight.
        this._previewing = false;
        this._previewSong = null;
        this._ensureMusicLoaded();
        runtime.on('PROJECT_STOP_ALL', () => this.stop());
    }

    isPlaying () {
        return !!(this._scheduler && this._scheduler.isRunning());
    }

    /**
     * The song the transport plays (or would play if started now): the
     * detached library-preview song when one is in flight, else the project's
     * active song.
     * @returns {?object}
     */
    _currentSong () {
        return this._previewSong || this.runtime.song;
    }

    activeTrackIds () {
        return this._scheduler ? this._scheduler.activeTrackIds() : [];
    }

    /**
     * The songId of the song the transport is currently playing, or null when
     * idle. Note this can differ from runtime.song's id — the scheduler keeps
     * its own reference (e.g. a detached library preview, or editor CRUD that
     * moved the selection mid-playback).
     * @returns {?string}
     */
    playingSongId () {
        if (!this.isPlaying()) return null;
        return (this._scheduler.song && this._scheduler.song.songId) || null;
    }

    /**
     * Subscribe to a high-level event ('start', 'step', 'end', 'stop').
     * @param event
     * @param fn
     */
    on (event, fn) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(fn);
        return () => {
            const arr = this._listeners[event];
            const i = arr.indexOf(fn);
            if (i >= 0) arr.splice(i, 1);
        };
    }

    _fire (event, ...args) {
        const arr = this._listeners[event] || [];
        for (const fn of arr) {
            try {
                fn(...args);
            } catch (e) { /* ignore */ }
        }
    }

    /**
     * Register hat-block callbacks. The extension calls this once at startup;
     * the scheduler picks them up the next time it is built. `onSongSwitch`
     * is dispatched directly from switchToSong when a switch is applied.
     * @param {object} callbacks - {onBeat, onNote, onLoop, onSongSwitch}
     */
    setHatCallbacks (callbacks) {
        this._hatCallbacks = callbacks || {};
    }

    _ensureScheduler () {
        if (this._scheduler) return this._scheduler;
        const ctx = this._audioContext();
        if (!ctx) return null;
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
            ctx.resume().catch(() => {});
        }
        this._ensureMusicLoaded();
        const song = this._currentSong();
        if (!song) return null;
        const hat = this._hatCallbacks;
        this._scheduler = new SongScheduler({
            song,
            audioContext: ctx,
            destination: this._masterBus(),
            getInstrumentBuffer: (i, n) => this._getInstrumentBuffer(i, n),
            getDrumBuffer: d => this._getDrumBuffer(d),
            tempoOverride: this._tempoOverride === null ? void 0 : this._tempoOverride,
            rootPitchOverride: this._rootPitchOverride,
            scaleTypeOverride: this._scaleTypeOverride,
            onStart: () => this._fire('start', this._currentSong()),
            onStep: (step, time) => this._fire('step', step, time),
            // Only dispatch hat callbacks for block-driven playback — an editor
            // preview shares this transport but must not fire the user's `when
            // each …` / `when … plays note` scripts (see _blockDriven).
            onBeat: (b, t) => {
                if (this._blockDriven && hat.onBeat) hat.onBeat(b, t);
            },
            onNote: (n, t) => {
                if (this._blockDriven && hat.onNote) hat.onNote(n, t);
            },
            onLoop: iter => {
                if (this._blockDriven && hat.onLoop) hat.onLoop(iter);
            },
            onEnd: () => {
                const endedSong = this._currentSong();
                this._scheduler = null;
                this._endPreview();
                this._fire('end', endedSong);
            }
        });
        // If a block already set overrides before the scheduler existed
        // (e.g. setTrackParam before playTrack), push them now so the first
        // chain build sees them.
        for (const trackId of this._effectOverrides.keys()) {
            this._scheduler.setTrackEffects(trackId, this._resolveEffects(trackId, null));
        }
        for (const [trackId, value] of this._volumeOverrides) {
            this._scheduler.setTrackVolume(trackId, value / 100);
        }
        return this._scheduler;
    }

    /**
     * Activate or deactivate a track. Activating an inactive track on an idle
     * transport spins the transport back up (anchored at "now"). Deactivating
     * the last active track lets the transport idle out on the next tick.
     * @param {string} trackId
     * @param {boolean} active
     * @param {string} [when] - 'now' or 'loop'
     */
    setTrackActive (trackId, active, when) {
        // A block that spins the transport up from idle owns this session, so
        // its hats should fire. If the transport is already running it's an
        // editor preview adding a track mid-play (activateTrack) — leave the
        // ownership flag as-is so we don't start firing hats under the editor.
        const wasRunning = this.isPlaying();
        const sched = this._ensureScheduler();
        if (!sched) return;
        if (!wasRunning) this._blockDriven = true;
        sched.setTrackActive(trackId, !!active, when || 'now');
    }

    /**
     * Atomically activate/deactivate a list of tracks. Used by the extension's
     * `play all tracks` / `stop all tracks` blocks so that every track joins
     * the transport at the same anchor and no track loses its first note.
     * @param {string[]} trackIds
     * @param {boolean} active
     * @param {string} [when] - 'now' or 'loop'
     */
    setTracksActive (trackIds, active, when) {
        // See setTrackActive: block-driven only when starting from idle.
        const wasRunning = this.isPlaying();
        const sched = this._ensureScheduler();
        if (!sched) return;
        if (!wasRunning) this._blockDriven = true;
        sched.setTracksActive(trackIds || [], !!active, when || 'now');
    }

    /**
     * Editor preview convenience: stop any current transport, then start it
     * anchored at `startStep` with every track in the project song active.
     * Mirrors the prior "play the whole song" semantics so the editor's Play
     * button continues to work without knowing about per-track activation.
     * @param {object} [opts] - {startStep?: number}
     */
    playAll (opts) {
        // Tear down the existing scheduler so the start step takes effect.
        if (this._scheduler) {
            this._scheduler.stop();
        }
        // Editor preview: hats must not fire (see _blockDriven).
        this._blockDriven = false;
        const sched = this._ensureScheduler();
        if (!sched) return;
        const song = this._currentSong();
        const tracks = (song && song.tracks) || [];
        sched.start({
            startStep: (opts && opts.startStep) || 0,
            activeTracks: tracks.map(t => t.trackId)
        });
    }

    /**
     * Play a detached song (not part of runtime.songs) for editor library
     * preview. The supplied song is held in _previewSong — never written into
     * the project's song list — with every track activated, and dropped when
     * playback stops or ends. Mirrors playAll()'s teardown so it composes
     * with any in-flight transport (editor preview or blocks).
     * @param {object} song - a fully-formed, playable song (see sanitizeSong).
     * @param {object} [opts] - {startStep?: number}
     */
    previewSong (song, opts) {
        if (!song) return;
        // Tear down the current transport first (synchronously fires onEnd,
        // which drops any prior preview song and nulls the scheduler).
        if (this._scheduler) {
            this._scheduler.stop();
        }
        // Editor library preview: hats must not fire (see _blockDriven).
        this._blockDriven = false;
        this._previewing = true;
        this._previewSong = song;
        const sched = this._ensureScheduler();
        if (!sched) {
            this._endPreview();
            return;
        }
        sched.start({
            startStep: (opts && opts.startStep) || 0,
            activeTracks: (song.tracks || []).map(t => t.trackId)
        });
    }

    /** Drop the detached preview song after a library preview. Idempotent. */
    _endPreview () {
        if (!this._previewing) return;
        this._previewing = false;
        this._previewSong = null;
    }

    /**
     * Switch the active song — the backdrop-style block (`switch to song`)
     * and the editor's song selector both land here. Selection state
     * (runtime.activeSongIndex) always updates; when the shared transport is
     * running, the audio switches too, carrying over active tracks BY DISPLAY
     * NAME: a playing "Drums" keeps playing if the new song also has a track
     * named "Drums", and non-matching tracks stop. If nothing carries over,
     * the transport idles out naturally.
     *
     * `when` follows playTrack's pattern: 'now' switches immediately; 'loop'
     * defers to the next loop boundary so the transition lands in musical
     * phase (collapsed to 'now' when the transport is idle — no boundary to
     * wait for). Block-driven param overrides are intentionally left alone:
     * they're keyed by trackId, so they simply stop matching until you switch
     * back (cleared, as always, on green-flag stop). Tempo/key overrides are
     * song-agnostic and persist across the switch.
     * @param {string} songId The songId of the song to switch to.
     * @param {string} [when] - 'now' or 'loop'
     */
    switchToSong (songId, when = 'now') {
        const runtime = this.runtime;
        const index = runtime.songs.findIndex(s => s.songId === songId);
        if (index === -1) return;
        const newSong = runtime.songs[index];

        const applySwitch = () => {
            runtime.activeSongIndex = index;
            runtime.emit('ACTIVE_SONG_CHANGED');
            // Hat blocks (`when song switches to …`) fire only for
            // block-driven playback, like every other song hat.
            if (this._blockDriven && this._hatCallbacks.onSongSwitch) {
                this._hatCallbacks.onSongSwitch(newSong);
            }
        };

        // A library preview transport plays a detached song — stop it rather
        // than trying to "switch" a song that isn't in the project.
        if (this._previewing && this._scheduler) {
            this._scheduler.stop();
        }

        const sched = this._scheduler;
        if (!sched || !sched.isRunning()) {
            if (index !== runtime.activeSongIndex) applySwitch();
            return;
        }
        if (index === runtime.activeSongIndex) return;

        if (when === 'loop') {
            // Carried tracks are resolved at APPLY time from the then-current
            // active set (and the then-current old song reference), so tracks
            // played/stopped between now and the boundary are honored.
            sched.scheduleSongSwitch(
                newSong,
                () => this._carryTracksByName(sched.song, newSong, sched.activeTrackIds()),
                applySwitch
            );
            return;
        }
        const carried = this._carryTracksByName(sched.song, newSong, sched.activeTrackIds());
        sched.switchSong(newSong, carried, this._audioContext().currentTime);
        applySwitch();
    }

    /**
     * Map active track ids in `fromSong` to the ids of same-display-name
     * tracks in `toSong` — the carry-over-by-name rule for song switches.
     * First name match wins when a song has duplicate display names.
     * @param {object} fromSong
     * @param {object} toSong
     * @param {Array.<string>} activeIds
     * @returns {Array.<string>} track ids in `toSong` to keep active.
     */
    _carryTracksByName (fromSong, toSong, activeIds) {
        const nameById = new Map(
            ((fromSong && fromSong.tracks) || []).map(t => [t.trackId, displayNameForTrack(t)])
        );
        const idByName = new Map();
        for (const t of ((toSong && toSong.tracks) || [])) {
            const name = displayNameForTrack(t);
            if (!idByName.has(name)) idByName.set(name, t.trackId);
        }
        const carried = [];
        for (const id of activeIds || []) {
            const name = nameById.get(id);
            const newTrackId = typeof name === 'string' && idByName.get(name);
            if (newTrackId) carried.push(newTrackId);
        }
        return carried;
    }

    /** Immediately stop the transport and tear down all audio nodes. */
    stop () {
        if (this._scheduler) {
            this._scheduler.stop();
        }
        // Drop any block-driven overrides so the next run starts from the
        // editor's authored values. Sliders bound to track.effects/volume now
        // reflect the audible state again, and tempo/key/scale revert to the
        // song's authored values.
        this._effectOverrides.clear();
        this._volumeOverrides.clear();
        this._tempoOverride = null;
        this._rootPitchOverride = null;
        this._scaleTypeOverride = null;
        // Next session re-establishes ownership; default back to not-block-driven.
        this._blockDriven = false;
        this._endPreview();
        this._fire('stop');
    }

    /**
     * Push an updated song reference (live editing). Only forwarded when the
     * scheduler is actually playing that song — edits to a non-playing song
     * (or during a detached library preview) must not clobber the transport's
     * song reference.
     * @param song
     */
    updateSong (song) {
        if (!song) return;
        if (this._previewing) return;
        if (this._scheduler && this._scheduler.updateSong &&
            this._scheduler.song && this._scheduler.song.songId === song.songId) {
            this._scheduler.updateSong(song);
        }
    }

    /**
     * Editor-side write: replace the baseline effects for a track. Composes
     * with any active block override (override wins per param) and pushes the
     * effective values to the scheduler chain.
     * @param trackId
     * @param effects
     */
    setTrackEffects (trackId, effects) {
        const sched = this._scheduler;
        if (!sched || !sched.setTrackEffects) return;
        sched.setTrackEffects(trackId, this._resolveEffects(trackId, effects));
    }

    /**
     * Editor-side write: set the baseline track volume (0..100). Composes
     * with any active block override. The scheduler animates a per-track
     * gain node, so this is a single setTargetAtTime — no song re-flatten,
     * no React round-trip required for the audio to respond.
     * @param trackId
     * @param volume - 0..100 (matches the slider's range)
     */
    setTrackVolume (trackId, volume) {
        const sched = this._scheduler;
        if (!sched || !sched.setTrackVolume) return;
        sched.setTrackVolume(trackId, this._resolveVolume(trackId, volume) / 100);
    }

    /**
     * Block-side write: temporary per-param effect override. Lasts until the
     * next green-flag stop (or until the editor clears it). Does NOT mutate
     * runtime.song, so the editor sliders and project file are untouched.
     * @param trackId
     * @param param - one of reverb / delay / filter / pan / distortion
     * @param value - engine-native range (0..1, pan -1..1)
     */
    setTrackEffectOverride (trackId, param, value) {
        if (!trackId || !param) return;
        let bag = this._effectOverrides.get(trackId);
        if (!bag) {
            bag = {};
            this._effectOverrides.set(trackId, bag);
        }
        bag[param] = value;
        const sched = this._scheduler;
        if (sched && sched.setTrackEffects) {
            sched.setTrackEffects(trackId, this._resolveEffects(trackId, null));
        }
    }

    /**
     * Block-side write: temporary track-volume override. Same semantics as
     * setTrackEffectOverride. Value is in 0..100 (matches the block's
     * user-facing range).
     * @param trackId
     * @param value - 0..100
     */
    setTrackVolumeOverride (trackId, value) {
        if (!trackId) return;
        const clamped = Math.max(0, Math.min(100, Number(value) || 0));
        this._volumeOverrides.set(trackId, clamped);
        const sched = this._scheduler;
        if (sched && sched.setTrackVolume) {
            sched.setTrackVolume(trackId, clamped / 100);
        }
    }

    /**
     * Clear a single param's override, e.g. when the user moves an editor
     * slider for that param so the editor "wins back" control. Re-applies
     * the resolved value so audio matches.
     * @param trackId
     * @param param
     */
    clearTrackEffectOverride (trackId, param) {
        const bag = this._effectOverrides.get(trackId);
        if (!bag || !(param in bag)) return;
        delete bag[param];
        if (Object.keys(bag).length === 0) this._effectOverrides.delete(trackId);
        const sched = this._scheduler;
        if (sched && sched.setTrackEffects) {
            sched.setTrackEffects(trackId, this._resolveEffects(trackId, null));
        }
    }

    /** @param trackId */
    clearTrackVolumeOverride (trackId) {
        if (!this._volumeOverrides.has(trackId)) return;
        this._volumeOverrides.delete(trackId);
        const sched = this._scheduler;
        if (sched && sched.setTrackVolume) {
            sched.setTrackVolume(trackId, this._resolveVolume(trackId, null) / 100);
        }
    }

    /**
     * Read the current effective effect value (in user-facing 0..100 range,
     * or -100..100 for pan) for `change … by` composition in blocks. Falls
     * back to the track's baseline if no override is set.
     * @param trackId
     * @param param
     */
    getTrackEffect (trackId, param) {
        const bag = this._effectOverrides.get(trackId);
        if (bag && param in bag) {
            return param === 'pan' ? bag[param] * 100 : bag[param] * 100;
        }
        const track = this._trackById(trackId);
        const fx = (track && track.effects) || {};
        if (param === 'pan') return (typeof fx.pan === 'number' ? fx.pan : 0) * 100;
        const def = param === 'filter' ? 1 : 0;
        return (typeof fx[param] === 'number' ? fx[param] : def) * 100;
    }

    /** @param trackId */
    getTrackVolume (trackId) {
        if (this._volumeOverrides.has(trackId)) return this._volumeOverrides.get(trackId);
        const track = this._trackById(trackId);
        return typeof (track && track.volume) === 'number' ? track.volume : 80;
    }

    /**
     * Current effective tempo (BPM): the block override if one is set, else
     * the song's authored tempo, else 120. Lets `change tempo by` compose
     * against the currently-audible value.
     */
    getTempo () {
        if (this._tempoOverride !== null) return this._tempoOverride;
        const song = this._currentSong();
        return (song && song.tempo) || 120;
    }

    /**
     * Current effective root pitch (MIDI int): the block override if set, else
     * the song's authored root, else 60 (C4). Lets `change key by` compose
     * against the currently-audible value.
     */
    getRootPitch () {
        if (this._rootPitchOverride !== null) return this._rootPitchOverride;
        const song = this._currentSong();
        const root = song && song.rootPitch;
        return (typeof root === 'number') ? root : 60;
    }

    _trackById (trackId) {
        const song = this._currentSong();
        for (const t of ((song && song.tracks) || [])) {
            if (t.trackId === trackId) return t;
        }
        return null;
    }

    /**
     * Compose the effective effects for a track: baseline (from `nextBase`
     * if supplied, else `track.effects`) overlaid with any block override.
     */
    _resolveEffects (trackId, nextBase) {
        const track = this._trackById(trackId);
        const base = nextBase || (track && track.effects) || {};
        const override = this._effectOverrides.get(trackId);
        if (!override) return base;
        return Object.assign({}, base, override);
    }

    _resolveVolume (trackId, nextBase) {
        if (this._volumeOverrides.has(trackId)) return this._volumeOverrides.get(trackId);
        if (typeof nextBase === 'number') return nextBase;
        const track = this._trackById(trackId);
        return typeof (track && track.volume) === 'number' ? track.volume : 80;
    }

    /**
     * Tempo override (BPM). Persisted at the playback level so a block run
     * before the scheduler exists still takes effect on the next start.
     * Preserves the playhead when a scheduler is already running.
     * @param bpm
     */
    setTempoOverride (bpm) {
        const v = Number(bpm);
        this._tempoOverride = Number.isFinite(v) ? v : null;
        if (this._scheduler) {
            // Re-anchor the running transport so the playhead stays continuous;
            // a bare `tempoOverride =` assignment leaves the old anchor in place
            // and can strand playback in a long silent pause (see scheduler).
            this._scheduler.setTempoOverride(this._tempoOverride);
        }
    }

    /**
     * Song-wide root-pitch override (MIDI int). At flatten time the scheduler
     * transposes pitched notes by (override - song.rootPitch) semitones; drum
     * tracks pass through. Cleared on green-flag stop.
     * @param midi
     */
    setRootPitchOverride (midi) {
        const v = parseInt(midi, 10);
        this._rootPitchOverride = Number.isFinite(v) ? v : null;
        if (this._scheduler && this._scheduler.setPitchOverrides) {
            this._scheduler.setPitchOverrides(this._rootPitchOverride, this._scaleTypeOverride);
        }
    }

    _audioContext () {
        const engine = this.runtime && this.runtime.audioEngine;
        return engine && engine.audioContext;
    }

    _audioDestination () {
        const engine = this.runtime && this.runtime.audioEngine;
        if (engine && typeof engine.getInputNode === 'function') return engine.getInputNode();
        return engine && engine.audioContext && engine.audioContext.destination;
    }

    /**
     * Lazily build (and cache) the song master bus and return its INPUT node:
     *   makeupGain → limiter → engine input (→ ctx.destination).
     * The scheduler's track chains and the editor previews all connect here so
     * the whole song is peak-limited together and can't clip when many tracks
     * stack. Rebuilt if the audio context is replaced (engine re-created).
     * Falls back to the raw destination if Web Audio nodes are unavailable.
     * @returns {AudioNode}
     */
    _masterBus () {
        const ctx = this._audioContext();
        if (!ctx || typeof ctx.createGain !== 'function') return this._audioDestination();
        if (this._masterBusCtx === ctx && this._masterBusInput) return this._masterBusInput;

        const input = ctx.createGain();
        input.gain.value = MASTER_MAKEUP_GAIN;
        let tail = input;
        if (typeof ctx.createDynamicsCompressor === 'function') {
            const limiter = ctx.createDynamicsCompressor();
            const now = ctx.currentTime;
            // setValueAtTime where available (AudioParam) so we don't trip on
            // read-only param assignment in strict engines.
            const setP = (param, v) => {
                if (param && typeof param.setValueAtTime === 'function') param.setValueAtTime(v, now);
                else if (param) param.value = v;
            };
            setP(limiter.threshold, MASTER_LIMITER.threshold);
            setP(limiter.knee, MASTER_LIMITER.knee);
            setP(limiter.ratio, MASTER_LIMITER.ratio);
            setP(limiter.attack, MASTER_LIMITER.attack);
            setP(limiter.release, MASTER_LIMITER.release);
            input.connect(limiter);
            tail = limiter;
            this._masterLimiter = limiter;
        }
        // Brick-wall safety: a WaveShaper soft-clip ceiling after the limiter
        // catches the transients its attack window lets through (see header).
        if (typeof ctx.createWaveShaper === 'function') {
            const clip = ctx.createWaveShaper();
            if (!_softClipCurve) _softClipCurve = makeSoftClipCurve(MASTER_CEILING, MASTER_CEILING_KNEE);
            clip.curve = _softClipCurve;
            clip.oversample = '4x';
            tail.connect(clip);
            tail = clip;
        }
        tail.connect(this._audioDestination());
        this._masterBusCtx = ctx;
        this._masterBusInput = input;
        return input;
    }

    _music () {
        if (!this.runtime._musicExtension) {
            this._ensureMusicLoaded();
        }
        return this.runtime._musicExtension || null;
    }

    _ensureMusicLoaded () {
        const em = this.runtime && this.runtime.extensionManager;
        if (em && em.isExtensionLoaded && !em.isExtensionLoaded('music')) {
            try {
                em.loadExtensionIdSync('music');
            } catch (e) { /* no-op */ }
        }
    }

    _getInstrumentBuffer (instIdx, midiNote) {
        const music = this._music();
        if (!music) return null;
        const info = music.getInstrumentPlayer(instIdx, midiNote);
        if (!info || !info.player) return null;
        return {
            buffer: info.player.buffer,
            sampleNote: info.sampleNote,
            releaseTime: info.releaseTime
        };
    }

    _getDrumBuffer (drumIdx) {
        const music = this._music();
        if (!music) return null;
        const drumPlayer = music.getDrumPlayer(drumIdx);
        return drumPlayer && drumPlayer.buffer;
    }

    /**
     * One-shot non-scheduled note for UI preview (e.g. clicking a cell). Best
     * effort — silently no-ops if samples aren't loaded yet.
     * @param opts
     */
    previewNote (opts) {
        const ctx = this._audioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
            ctx.resume().catch(() => {});
        }
        this._ensureMusicLoaded();
        const {kind, instrument, drum, pitch, velocity = 90, durationSec = 0.18, synth, synthDrum} = opts || {};
        if (kind === 'synth') {
            const synthDur = opts && opts.durationSec ? opts.durationSec : 0.35;
            this._previewSynthNote({synth, pitch, velocity, durationSec: synthDur});
            return;
        }
        if (kind === 'synthDrum') {
            this._previewSynthDrumNote({synthDrum, velocity});
            return;
        }
        let buffer;
        let playbackRate = 1;
        let releaseTime = 0.05;
        if (kind === 'drum') {
            buffer = this._getDrumBuffer((drum || 1) - 1);
            if (!buffer) return;
        } else {
            const info = this._getInstrumentBuffer((instrument || 1) - 1, pitch);
            if (!info || !info.buffer) return;
            buffer = info.buffer;
            playbackRate = Math.pow(2, (pitch - info.sampleNote) / 12);
            releaseTime = info.releaseTime || 0.05;
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = playbackRate;

        const volumeGain = ctx.createGain();
        // Match scheduled playback: velocity curve × per-instrument loudness trim
        // (instrument-gain.js) so cell-click previews are at the same level.
        const previewTrim = kind === 'drum' ?
            gainForSampledDrum((drum || 1) - 1) : gainForSampleInstrument((instrument || 1) - 1);
        const velocityGain = velocityToGain(velocity) * previewTrim;
        volumeGain.gain.setValueAtTime(velocityGain, ctx.currentTime);

        const releaseGain = ctx.createGain();
        const now = ctx.currentTime;
        const releaseStart = now + durationSec;
        const releaseEnd = releaseStart + releaseTime;
        releaseGain.gain.setValueAtTime(1, now);
        releaseGain.gain.setValueAtTime(1, releaseStart);
        releaseGain.gain.linearRampToValueAtTime(0.0001, releaseEnd);

        source.connect(volumeGain);
        volumeGain.connect(releaseGain);
        releaseGain.connect(this._masterBus());

        try {
            source.start(now);
            source.stop(releaseEnd + 0.01);
        } catch (e) { /* ignore */ }
        source.onended = () => {
            try {
                source.disconnect();
                volumeGain.disconnect();
                releaseGain.disconnect();
            } catch (e) { /* ignore */ }
        };
    }

    // One-shot percussion voice for editor previews — mirror of the synth
    // preview but for synthDrum lanes. `synthDrum` is an already-resolved voice
    // param bag (the editor merges it via getDrumVoice before previewing).
    // Routes straight to the playback destination (no per-track FX chain).
    _previewSynthDrumNote ({synthDrum, velocity = 90}) {
        const ctx = this._audioContext();
        if (!ctx) return;
        const sd = synthDrum || {};
        buildPercussionVoice(
            ctx, sd, ctx.currentTime, velocity, this._masterBus(),
            gainForSynthDrumPreset(sd.preset)
        );
    }

    // One-shot synth voice for editor previews — same voice graph as
    // SongScheduler._scheduleSynthNote but standalone (no scheduler, no
    // per-track FX chain). Routes straight to the playback destination.
    _previewSynthNote ({synth, pitch, velocity = 90, durationSec = 0.35}) {
        const ctx = this._audioContext();
        if (!ctx) return;
        const params = getTrackSynth({synth});
        const when = ctx.currentTime;
        const noteOff = when + durationSec;
        const freq = midiToFreq(pitch);

        const osc1 = ctx.createOscillator();
        osc1.type = params.osc1Wave;
        osc1.frequency.value = freq;
        const osc2 = ctx.createOscillator();
        osc2.type = params.osc2Wave;
        osc2.frequency.value = freq;
        if (osc2.detune) osc2.detune.value = params.osc2Detune || 0;

        const mix = Math.max(0, Math.min(1, params.oscMix));
        const mix1 = ctx.createGain();
        const mix2 = ctx.createGain();
        mix1.gain.value = 1 - mix;
        mix2.gain.value = mix;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        const baseCutoff = 80 * Math.pow(150, Math.max(0, Math.min(1, params.filterCutoff)));
        filter.Q.value = 0.7 + (Math.max(0, Math.min(1, params.filterResonance)) * 17.3);

        const amp = ctx.createGain();
        amp.gain.value = 0;

        const peak = velocityToGain(velocity) * 0.35 * gainForSynthPreset(params.preset);

        const a = Math.max(0.001, params.ampAttack);
        const d = Math.max(0.001, params.ampDecay);
        const s = Math.max(0, Math.min(1, params.ampSustain));
        const r = Math.max(0.001, params.ampRelease);
        amp.gain.setValueAtTime(0, when);
        amp.gain.linearRampToValueAtTime(peak, when + a);
        amp.gain.linearRampToValueAtTime(peak * s, when + a + d);
        amp.gain.setValueAtTime(peak * s, noteOff);
        amp.gain.linearRampToValueAtTime(0.0001, noteOff + r);

        const envCents = Math.max(0, Math.min(1, params.filterEnvAmount)) * 4800;
        const ratio = Math.pow(2, envCents / 1200);
        const peakHz = Math.min(20000, baseCutoff * ratio);
        const sustainHz = baseCutoff + ((peakHz - baseCutoff) * Math.max(0, Math.min(1, params.filterSustain)));
        const fa = Math.max(0.001, params.filterAttack);
        const fd = Math.max(0.001, params.filterDecay);
        const fr = Math.max(0.001, params.filterRelease);
        filter.frequency.setValueAtTime(baseCutoff, when);
        filter.frequency.linearRampToValueAtTime(peakHz, when + fa);
        filter.frequency.linearRampToValueAtTime(sustainHz, when + fa + fd);
        filter.frequency.setValueAtTime(sustainHz, noteOff);
        filter.frequency.linearRampToValueAtTime(baseCutoff, noteOff + fr);

        osc1.connect(mix1);
        osc2.connect(mix2);
        mix1.connect(filter);
        mix2.connect(filter);
        filter.connect(amp);
        amp.connect(this._masterBus());

        const stopAt = noteOff + r + 0.02;

        // LFO for preview — same routing as the scheduler. No glide in
        // preview because previews are one-shot (no previous-note context).
        const lfoDest = params.lfoDest || 'none';
        const lfoDepth = Math.max(0, Math.min(1, params.lfoDepth || 0));
        let lfo = null;
        let lfoGain = null;
        if (lfoDest !== 'none' && lfoDepth > 0.001) {
            lfo = ctx.createOscillator();
            lfo.type = params.lfoWave || 'sine';
            lfo.frequency.value = Math.max(0.05, Math.min(20, params.lfoRate || 5));
            lfoGain = ctx.createGain();
            if (lfoDest === 'pitch') {
                lfoGain.gain.value = lfoDepth * 200;
                lfo.connect(lfoGain);
                if (osc1.detune) lfoGain.connect(osc1.detune);
                if (osc2.detune) lfoGain.connect(osc2.detune);
            } else if (lfoDest === 'filter') {
                lfoGain.gain.value = lfoDepth * 2400;
                lfo.connect(lfoGain);
                if (filter.detune) {
                    lfoGain.connect(filter.detune);
                }
            } else if (lfoDest === 'amp') {
                lfoGain.gain.value = lfoDepth * 0.5 * peak;
                lfo.connect(lfoGain);
                lfoGain.connect(amp.gain);
            }
            try {
                lfo.start(when);
                lfo.stop(stopAt);
            } catch (e) { /* ignore */ }
        }

        try {
            osc1.start(when);
            osc2.start(when);
            osc1.stop(stopAt);
            osc2.stop(stopAt);
        } catch (e) { /* ignore */ }
        osc2.onended = () => {
            try {
                osc1.disconnect();
                osc2.disconnect();
                mix1.disconnect();
                mix2.disconnect();
                filter.disconnect();
                amp.disconnect();
                if (lfo) lfo.disconnect();
                if (lfoGain) lfoGain.disconnect();
            } catch (e) { /* ignore */ }
        };
    }
}

module.exports = SongPlayback;
