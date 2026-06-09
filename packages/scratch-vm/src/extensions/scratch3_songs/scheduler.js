/**
 * Song scheduler — pure module used by both the runtime Songs extension and the
 * GUI editor's preview. Holds a single shared transport keyed to the project's
 * song (tempo + length + tracks). Tracks are individually `active` or
 * `inactive`; the transport ticks whenever ≥1 track is active and always loops.
 * Track activation can be scheduled to take effect immediately ("now") or at
 * the next loop boundary ("loop"). Per-track fades animate a gain node on the
 * track's FX chain so they compose with per-note velocity gain.
 */

const {getTrackSynth} = require('./synth-defaults');
const {getDrumVoice} = require('./synth-drum-defaults');
const {buildPercussionVoice} = require('./synth-drum-voice');
const {snapToScale, MIN_PITCH, MAX_PITCH} = require('./scale-utils');

const ratioForPitchInterval = interval => Math.pow(2, interval / 12);

const midiToFreq = midi => 440 * Math.pow(2, (midi - 69) / 12);

const selectSampleIndexForNote = (note, samples) => {
    for (let i = samples.length - 1; i >= 0; i--) {
        if (note >= samples[i]) return i;
    }
    return 0;
};

class SongScheduler {
    /**
     * @param {object} opts
     * @param {object} opts.song - song JSON
     * @param {AudioContext} opts.audioContext
     * @param {AudioNode} [opts.destination] - audio destination node (defaults to ctx.destination)
     * @param {function} opts.getInstrumentBuffer - (instIdx0, midiNote) -> {buffer, sampleNote, releaseTime} or null
     * @param {function} opts.getDrumBuffer - (drumIdx0) -> AudioBuffer or null
     * @param {function} [opts.onStart] - called once when the transport spins up
     * @param {function} [opts.onBeat] - called(beatIndex, ctxTime) when a beat boundary is reached
     * @param {function} [opts.onNote] - called({trackId, step, pitch, drum}, ctxTime) when a note begins
     * @param {function} [opts.onEnd] - called once when the transport idles out (no active tracks remain)
     * @param {function} [opts.onStep] - called(stepIndex, ctxTime) when the playhead advances (for UI)
     * @param {function} [opts.onLoop] - called(iterationIndex) just after the playhead wraps
     * @param {number} [opts.tempoOverride] - if set, used instead of song.tempo
     * @param {number} [opts.rootPitchOverride] - MIDI int; if set, transposes
     *   playback by (override - song.rootPitch) semitones at flatten time.
     * @param {string} [opts.scaleTypeOverride] - scale name; if set, played
     *   notes are snapped to this scale (using the effective root) at flatten
     *   time. Both pitch overrides only affect pitched tracks (drums pass
     *   through unchanged) and never mutate the underlying song.
     */
    constructor (opts) {
        this.song = opts.song;
        this.audioContext = opts.audioContext;
        this.destination = opts.destination || opts.audioContext.destination;
        this.getInstrumentBuffer = opts.getInstrumentBuffer;
        this.getDrumBuffer = opts.getDrumBuffer;
        this.onStart = opts.onStart || (() => {});
        this.onBeat = opts.onBeat || (() => {});
        this.onNote = opts.onNote || (() => {});
        this.onEnd = opts.onEnd || (() => {});
        this.onStep = opts.onStep || (() => {});
        this.onLoop = opts.onLoop || (() => {});
        this.tempoOverride = opts.tempoOverride;
        this.rootPitchOverride = (typeof opts.rootPitchOverride === 'number') ?
            opts.rootPitchOverride : null;
        this.scaleTypeOverride = opts.scaleTypeOverride || null;

        this._activeSources = [];
        this._timer = null;
        this._startCtxTime = 0;
        this._enqueuedThroughCtxTime = 0;
        this._nextBeatToFire = 0;
        this._lastStepFiredAt = -1;
        this._started = false;
        this._ended = false;
        this._iter = 0;
        this._notes = [];

        // Per-track active set. A track is heard only when its trackId is in
        // this set; otherwise it's filtered out of the flat note list. The
        // transport runs as long as this set is non-empty.
        this._activeTracks = new Set();
        // Pending activate/deactivate changes to apply at the next loop
        // boundary. Map<trackId, boolean>. Last write wins.
        this._pendingTrackChanges = new Map();
        // Pending deactivations triggered by fade-out: when audioContext time
        // reaches the stored ctxTime, the track is removed from _activeTracks.
        // Map<trackId, number /* ctxTime */>.
        this._pendingDeactivations = new Map();

        // Per-track FX chains, keyed by trackId. Built lazily on first note of
        // a track so empty / muted tracks cost nothing.
        this._trackChains = {};
        // Latest effect values pushed via setTrackEffects, keyed by trackId.
        // Used to initialize the chain when it's built (since setTrackEffects
        // may arrive before the first note plays).
        this._effectsCache = {};
        // Latest track volume pushed via setTrackVolume (0..1), keyed by
        // trackId. Same role as _effectsCache: lets a volume slider drag take
        // effect before the chain exists, and seeds chain.volume.gain when
        // the chain is built.
        this._volumeCache = {};
        // Shared synthesized impulse response for all per-track reverbs.
        this._reverbBuffer = null;
        // Most-recently-scheduled pitch per synth track, used to apply
        // glide/portamento on the next note. Map<trackId, {pitch, when}>.
        this._lastPitchByTrack = new Map();
    }

    get tempo () {
        return this.tempoOverride || (this.song && this.song.tempo) || 120;
    }

    get secondsPerStep () {
        const stepsPerBeat = (this.song && this.song.stepsPerBeat) || 4;
        return (60 / this.tempo) / stepsPerBeat;
    }

    get iterDuration () {
        const length = (this.song && this.song.lengthSteps) || 32;
        return length * this.secondsPerStep;
    }

    isRunning () {
        return this._started;
    }

    activeTrackIds () {
        return Array.from(this._activeTracks);
    }

    _trackById (trackId) {
        for (const t of ((this.song && this.song.tracks) || [])) {
            if (t.trackId === trackId) return t;
        }
        return null;
    }

    _normalizeEffects (fx) {
        const e = fx || {};
        return {
            reverb: typeof e.reverb === 'number' ? e.reverb : 0,
            delay: typeof e.delay === 'number' ? e.delay : 0,
            filter: typeof e.filter === 'number' ? e.filter : 1,
            pan: typeof e.pan === 'number' ? e.pan : 0,
            distortion: typeof e.distortion === 'number' ? e.distortion : 0
        };
    }

    // Build a waveshaper curve for a given distortion amount (0..1). At 0 the
    // curve is the identity (passthrough); as amount climbs we drive a tanh
    // saturator harder, normalized so the output still peaks near ±1. Curve
    // is rebuilt each time the slider value changes — 2048 samples is a small
    // allocation and the typed-array writes are cheap.
    _makeDistortionCurve (amount) {
        const samples = 2048;
        const curve = new Float32Array(samples);
        const a = Math.max(0, Math.min(1, amount));
        if (a <= 0.001) {
            for (let i = 0; i < samples; i++) {
                curve[i] = ((i * 2) / samples) - 1;
            }
            return curve;
        }
        const drive = 1 + (a * 40);
        const norm = Math.tanh(drive);
        for (let i = 0; i < samples; i++) {
            const x = ((i * 2) / samples) - 1;
            curve[i] = Math.tanh(x * drive) / norm;
        }
        return curve;
    }

    _getReverbBuffer () {
        if (this._reverbBuffer) return this._reverbBuffer;
        const ctx = this.audioContext;
        const sr = ctx.sampleRate;
        const seconds = 1.8;
        const length = Math.floor(sr * seconds);
        const buffer = ctx.createBuffer(2, length, sr);
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                const env = Math.pow(1 - (i / length), 2.6);
                data[i] = ((Math.random() * 2) - 1) * env;
            }
        }
        this._reverbBuffer = buffer;
        return buffer;
    }

    _getTrackChain (trackId) {
        if (this._trackChains[trackId]) return this._trackChains[trackId];
        const ctx = this.audioContext;
        // `input` is the per-voice mixer at the head of the chain. Per-track
        // fades animate this node directly, so we keep volume on a separate
        // gain so the two automations compose multiplicatively.
        const input = ctx.createGain();
        input.gain.value = 1;

        // Per-track volume node — the single source of truth for track level.
        // Editor slider drags and block volume overrides both animate
        // `volume.gain` via setTargetAtTime so changes are instantaneous and
        // smooth, without re-flattening notes or rebuilding the chain.
        const volume = ctx.createGain();
        const cachedVol = this._volumeCache[trackId];
        const track = this._trackById(trackId);
        const baseVol = typeof cachedVol === 'number' ? cachedVol :
            ((typeof (track && track.volume) === 'number' ? track.volume : 80) / 100);
        volume.gain.value = baseVol;

        // Distortion sits at the head of the chain so subsequent EQ (filter)
        // and spatial fx (panner / reverb / delay) shape and place the
        // already-distorted signal — the more natural ordering for a guitar /
        // synth tone.
        const distortion = typeof ctx.createWaveShaper === 'function' ?
            ctx.createWaveShaper() : ctx.createGain();
        if (typeof ctx.createWaveShaper === 'function') {
            distortion.curve = this._makeDistortionCurve(0);
            distortion.oversample = '2x';
        }

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 0.7;
        filter.frequency.value = 12000;

        const panner = typeof ctx.createStereoPanner === 'function' ?
            ctx.createStereoPanner() : ctx.createGain();
        if (panner.pan) panner.pan.value = 0;

        const dry = ctx.createGain();
        dry.gain.value = 1;

        const reverb = ctx.createConvolver();
        reverb.buffer = this._getReverbBuffer();
        const reverbSend = ctx.createGain();
        reverbSend.gain.value = 0;

        const stepsPerBeat = (this.song && this.song.stepsPerBeat) || 4;
        const eighth = this.secondsPerStep * (stepsPerBeat / 2);
        const delay = ctx.createDelay(2.0);
        delay.delayTime.value = Math.min(2.0, Math.max(0.05, eighth));
        const feedback = ctx.createGain();
        feedback.gain.value = 0.42;
        const delaySend = ctx.createGain();
        delaySend.gain.value = 0;

        input.connect(volume);
        volume.connect(distortion);
        distortion.connect(filter);
        filter.connect(panner);
        panner.connect(dry);
        dry.connect(this.destination);

        panner.connect(reverbSend);
        reverbSend.connect(reverb);
        reverb.connect(this.destination);

        panner.connect(delaySend);
        delaySend.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(this.destination);

        const chain = {
            input,
            volume,
            distortion,
            filter,
            panner,
            dry,
            reverb,
            reverbSend,
            delay,
            delaySend,
            feedback,
            // Cache the last applied distortion amount so we only rebuild the
            // curve when it actually changes (slider drags are rapid).
            _distortionAmount: 0
        };
        this._trackChains[trackId] = chain;
        const cached = this._effectsCache[trackId];
        const effects = cached || this._normalizeEffects(track && track.effects);
        this._applyEffectsToChain(chain, effects);
        return chain;
    }

    _applyEffectsToChain (chain, effects) {
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const tau = 0.02;
        const clamp01 = v => Math.max(0, Math.min(1, v));
        const f = clamp01(effects.filter);
        const cutoff = 200 * Math.pow(60, f);
        chain.filter.frequency.setTargetAtTime(cutoff, now, tau);
        if (chain.panner.pan) {
            const p = Math.max(-1, Math.min(1, effects.pan));
            chain.panner.pan.setTargetAtTime(p, now, tau);
        }
        chain.reverbSend.gain.setTargetAtTime(clamp01(effects.reverb) * 0.6, now, tau);
        chain.delaySend.gain.setTargetAtTime(clamp01(effects.delay) * 0.55, now, tau);
        const dist = clamp01(effects.distortion);
        if (chain.distortion && 'curve' in chain.distortion &&
            Math.abs((chain._distortionAmount || 0) - dist) > 0.001) {
            chain.distortion.curve = this._makeDistortionCurve(dist);
            chain._distortionAmount = dist;
        }
    }

    /**
     * Apply live effect values to a track's audio chain. Builds the chain on
     * demand so a slider drag on a track that hasn't yet played a note still
     * applies the next time it does.
     * @param trackId
     * @param effects
     */
    setTrackEffects (trackId, effects) {
        const normalized = this._normalizeEffects(effects);
        this._effectsCache[trackId] = normalized;
        const chain = this._trackChains[trackId];
        if (!chain) return;
        this._applyEffectsToChain(chain, normalized);
    }

    /**
     * Set a track's volume by animating its `volume` gain node. Volume is in
     * the 0..1 domain (multiply 0..100 sliders by 0.01 before calling). Smooth
     * via setTargetAtTime so slider drags don't click; tau=0.02 matches the
     * effect-change smoothing.
     *
     * If the chain hasn't been built yet (track hasn't played its first note),
     * the value is cached and applied when the chain is constructed.
     * @param {string} trackId
     * @param {number} volume - 0..1
     */
    setTrackVolume (trackId, volume) {
        const v = Math.max(0, Math.min(1, Number(volume) || 0));
        this._volumeCache[trackId] = v;
        const chain = this._trackChains[trackId];
        if (!chain || !chain.volume) return;
        const now = this.audioContext.currentTime;
        chain.volume.gain.setTargetAtTime(v, now, 0.02);
    }

    _flattenNotes () {
        const notes = [];
        const tracks = (this.song && this.song.tracks) || [];
        // Solo overrides mute: if any track is soloed, only soloed (and
        // unmuted) tracks are audible. Otherwise honor mute as before.
        const anySolo = tracks.some(t => t && t.solo);
        const songRoot = (this.song && typeof this.song.rootPitch === 'number') ?
            this.song.rootPitch : 60;
        const songScale = (this.song && this.song.scaleType) || 'chromatic';
        const effRoot = (this.rootPitchOverride === null) ? songRoot : this.rootPitchOverride;
        const effScale = this.scaleTypeOverride || songScale;
        // Only apply the transform when the effective values differ from the
        // song's authored values — keeps drum / chromatic / no-override paths
        // bit-identical to the previous behavior.
        const transformPitch = (effRoot !== songRoot) || (effScale !== songScale);
        const delta = effRoot - songRoot;
        for (const track of tracks) {
            if (!this._activeTracks.has(track.trackId)) continue;
            if (track.muted) continue;
            if (anySolo && !track.solo) continue;
            // synthDrum tracks are unpitched (lane-based, like sampled drums),
            // so key/scale overrides must leave their hits alone.
            const isPitched = track.kind !== 'drum' && track.kind !== 'synthDrum';
            for (const note of (track.notes || [])) {
                const drumIdx = (typeof note.drum === 'number' ? note.drum : (track.drum || 1)) - 1;
                let pitch = typeof note.pitch === 'number' ? note.pitch : 60;
                if (transformPitch && isPitched) {
                    pitch = snapToScale(pitch + delta, effRoot, effScale);
                    if (pitch < MIN_PITCH || pitch > MAX_PITCH) continue;
                }
                notes.push({
                    trackId: track.trackId,
                    kind: track.kind,
                    instrument: (track.instrument || 1) - 1,
                    drum: drumIdx,
                    velocity: typeof note.velocity === 'number' ? note.velocity : 80,
                    step: note.step,
                    durationSteps: note.durationSteps || 1,
                    pitch
                });
            }
        }
        notes.sort((a, b) => a.step - b.step);
        return notes;
    }

    /**
     * Update key / scale overrides on a running scheduler and re-flatten the
     * note list so the next scheduling pass picks them up. Notes already
     * scheduled in the immediate lookahead window play at their previous
     * pitch — that's a one-tick glitch, not a leak.
     * @param {number|null} rootPitch - MIDI int, or null to clear the override.
     * @param {string|null} scaleType - scale name, or null to clear the override.
     */
    setPitchOverrides (rootPitch, scaleType) {
        this.rootPitchOverride = (typeof rootPitch === 'number') ? rootPitch : null;
        this.scaleTypeOverride = scaleType || null;
        this._notes = this._flattenNotes();
    }

    /**
     * Spin up the transport. Idempotent — calling start() on an already-running
     * scheduler is a no-op. The transport then loops forever until the active
     * set empties out (or stop() is called explicitly).
     * @param {object} [opts]
     * @param {number} [opts.startStep] - anchor the transport so that this
     *   step lines up with "now". Useful for editor previews that resume at a
     *   non-zero cursor. The transport still loops normally from there.
     * @param {Array.<string>} [opts.activeTracks] - track IDs to mark active
     *   before the first tick, so the transport doesn't immediately idle out.
     */
    start (opts) {
        if (this._started) return;
        if (!this.song) return;
        const startStep = Math.max(0, Math.floor((opts && opts.startStep) || 0));
        if (opts && Array.isArray(opts.activeTracks)) {
            for (const id of opts.activeTracks) this._activeTracks.add(id);
        }
        this._started = true;
        this._ended = false;
        this._iter = 0;
        this._notes = this._flattenNotes();
        const sps = this.secondsPerStep;
        const offset = 0.05;
        const now = this.audioContext.currentTime;
        // Anchor so that (now + offset) corresponds to startStep within iter 0.
        this._startCtxTime = now + offset - (startStep * sps);
        this._enqueuedThroughCtxTime = now + offset;
        this._nextBeatToFire = Math.floor(startStep / ((this.song && this.song.stepsPerBeat) || 4));
        this._lastStepFiredAt = startStep - 1;
        setTimeout(() => this.onStart(), 0);
        this._timer = setInterval(() => this._tick(), 25);
        this._tick();
    }

    /**
     * Schedule a track to become active or inactive.
     * @param {string} trackId
     * @param {boolean} active
     * @param {string} [when] - 'now' for immediate; 'loop' to defer to
     *   the next loop boundary so musical phase is preserved.
     */
    setTrackActive (trackId, active, when = 'now') {
        if (!trackId) return;
        // 'loop' only makes sense when something is already running; with the
        // transport idle there's no boundary to wait for, so collapse to 'now'.
        if (when === 'loop' && this._started) {
            this._pendingTrackChanges.set(trackId, !!active);
            return;
        }
        this._applyTrackActiveChange(trackId, !!active);
    }

    /**
     * Activate or deactivate several tracks atomically. Routing through
     * setTrackActive() once per id has a subtle bug when the transport is
     * idle: the first id's call triggers start(), which immediately runs a
     * _tick() and advances _enqueuedThroughCtxTime past the lookahead window.
     * Subsequent ids are added to _activeTracks AFTER that tick, so the next
     * tick's "noteCtxTime < _enqueuedThroughCtxTime" guard silently drops
     * their step-0 (and sometimes step-1) notes. Batching here makes all the
     * tracks live BEFORE start() runs its first tick, so every track gets
     * its first note.
     * @param {string[]} trackIds
     * @param {boolean} active
     * @param {string} [when]
     */
    setTracksActive (trackIds, active, when = 'now') {
        const ids = (trackIds || []).filter(Boolean);
        if (ids.length === 0) return;
        if (ids.length === 1) {
            this.setTrackActive(ids[0], active, when);
            return;
        }
        if (when === 'loop' && this._started) {
            for (const id of ids) this._pendingTrackChanges.set(id, !!active);
            return;
        }
        if (active) {
            const toAdd = ids.filter(id => !this._activeTracks.has(id));
            if (toAdd.length === 0) return;
            for (const id of toAdd) {
                this._activeTracks.add(id);
                this._pendingDeactivations.delete(id);
            }
            if (this._started) {
                this._notes = this._flattenNotes();
            } else {
                // start() does its own _flattenNotes() with whatever's in
                // _activeTracks, so all the just-added ids' notes are included
                // in the first lookahead window.
                this.start();
            }
        } else {
            const toRemove = ids.filter(id => this._activeTracks.has(id));
            if (toRemove.length === 0) return;
            for (const id of toRemove) this._activeTracks.delete(id);
            this._notes = this._flattenNotes();
            for (const id of toRemove) {
                this._cancelScheduledForTrack(id);
                this._lastPitchByTrack.delete(id);
            }
        }
    }

    _applyTrackActiveChange (trackId, active) {
        if (active) {
            if (this._activeTracks.has(trackId)) return;
            this._activeTracks.add(trackId);
            this._pendingDeactivations.delete(trackId);
            if (this._started) {
                this._notes = this._flattenNotes();
            } else {
                this.start();
            }
        } else {
            if (!this._activeTracks.has(trackId)) return;
            this._activeTracks.delete(trackId);
            this._notes = this._flattenNotes();
            // Cancel any not-yet-started scheduled sources for this track so
            // we don't hear notes from a track the user just stopped.
            this._cancelScheduledForTrack(trackId);
            // Drop glide history so re-activating doesn't slide from a stale
            // pitch scheduled long ago.
            this._lastPitchByTrack.delete(trackId);
        }
    }

    _cancelScheduledForTrack (trackId) {
        const now = this.audioContext.currentTime;
        for (let i = this._activeSources.length - 1; i >= 0; i--) {
            const src = this._activeSources[i];
            if (src._trackId !== trackId) continue;
            // Only cancel sources that haven't started yet — letting an
            // already-sounding note finish its release sounds more natural
            // than a hard cut.
            if (typeof src._scheduledStart === 'number' && src._scheduledStart > now) {
                try {
                    src.stop();
                    src.disconnect();
                } catch (e) { /* already stopped */ }
                this._activeSources.splice(i, 1);
            }
        }
    }

    /**
     * Start a linear gain fade on a track. Direction 'in' activates the
     * track (silent, ramping up); direction 'out' ramps down and deactivates
     * once the fade completes.
     * @param {string} trackId
     * @param {string} direction - 'in' or 'out'
     * @param {string} [when] - 'now' or 'loop'
     * @param {number} [durationSec]
     */
    fadeTrack (trackId, direction, when = 'now', durationSec = 1.0) {
        if (!trackId) return;
        if (when === 'loop' && this._started) {
            // Defer the entire fade by scheduling it at the next boundary in
            // _tick. We co-opt _pendingTrackChanges with a sentinel object.
            this._pendingTrackChanges.set(trackId, {fade: direction, durationSec});
            return;
        }
        this._beginFade(trackId, direction, durationSec);
    }

    _beginFade (trackId, direction, durationSec) {
        const ctx = this.audioContext;
        if (direction === 'in') {
            // Build the chain proactively so we can set gain=0 before any note
            // hits, then activate so notes start flowing.
            const chain = this._getTrackChain(trackId);
            const now = ctx.currentTime;
            try {
                chain.input.gain.cancelScheduledValues(now);
            } catch (e) { /* ignore */ }
            chain.input.gain.setValueAtTime(0, now);
            chain.input.gain.linearRampToValueAtTime(1, now + durationSec);
            this._pendingDeactivations.delete(trackId);
            this._applyTrackActiveChange(trackId, true);
        } else if (direction === 'out') {
            // If the track isn't active, there's nothing to fade.
            if (!this._activeTracks.has(trackId)) return;
            const chain = this._getTrackChain(trackId);
            const now = ctx.currentTime;
            try {
                chain.input.gain.cancelScheduledValues(now);
            } catch (e) { /* ignore */ }
            // Capture the current gain so the ramp starts from where we are.
            const startVal = chain.input.gain.value;
            chain.input.gain.setValueAtTime(startVal, now);
            chain.input.gain.linearRampToValueAtTime(0, now + durationSec);
            // Mark for deactivation when the fade completes. _tick checks the
            // map each cycle and removes the track from _activeTracks at that
            // time, restoring the chain gain to 1 so a later activation isn't
            // silent.
            this._pendingDeactivations.set(trackId, now + durationSec);
        }
    }

    /**
     * Swap in a new song reference and re-flatten the note list. Used by the
     * editor so edits made during one loop iteration are heard in the next.
     * If track set changed (e.g. tracks added/removed), prune stale entries
     * from _activeTracks so the scheduler can decide to idle correctly.
     *
     * Fast path: editor slider drags on volume / effects commit a fresh song
     * reference to Redux on every event, which used to re-flatten the whole
     * note list 30-60×/sec and starve the main thread (audible hitching on
     * the filter slider, etc.). Skip the flatten when nothing the flatten
     * output depends on has actually changed — volume / effects are pushed
     * straight to the audio chain via setTrackVolume / setTrackEffects.
     * @param song
     */
    updateSong (song) {
        if (!song) return;
        const prevSong = this.song;
        this.song = song;
        const validIds = new Set((song.tracks || []).map(t => t.trackId));
        for (const id of Array.from(this._activeTracks)) {
            if (!validIds.has(id)) this._activeTracks.delete(id);
        }
        if (this._flattenInputsUnchanged(prevSong, song)) return;
        this._notes = this._flattenNotes();
    }

    // True iff every input _flattenNotes reads is reference- or value-equal
    // between `prev` and `next`. Conservative: any time we're unsure (new
    // song, different track count, etc.) return false to force a re-flatten.
    _flattenInputsUnchanged (prev, next) {
        if (!prev || !next) return false;
        if (prev === next) return true;
        if (prev.rootPitch !== next.rootPitch) return false;
        if (prev.scaleType !== next.scaleType) return false;
        const pt = prev.tracks || [];
        const nt = next.tracks || [];
        if (pt.length !== nt.length) return false;
        for (let i = 0; i < pt.length; i++) {
            const a = pt[i];
            const b = nt[i];
            if (a === b) continue;
            if (a.trackId !== b.trackId) return false;
            if (a.kind !== b.kind) return false;
            if (a.muted !== b.muted) return false;
            if (a.solo !== b.solo) return false;
            if (a.instrument !== b.instrument) return false;
            if (a.drum !== b.drum) return false;
            if (a.drumLanes !== b.drumLanes) return false;
            if (a.notes !== b.notes) return false;
        }
        return true;
    }

    _onLoopWrap (newIter) {
        this._iter = newIter;
        if (this._pendingTrackChanges.size > 0) {
            for (const [trackId, value] of this._pendingTrackChanges) {
                if (value && typeof value === 'object' && value.fade) {
                    this._beginFade(trackId, value.fade, value.durationSec);
                } else {
                    this._applyTrackActiveChange(trackId, !!value);
                }
            }
            this._pendingTrackChanges.clear();
        }
        this._notes = this._flattenNotes();
        this._lastStepFiredAt = -1;
        this._nextBeatToFire = 0;
        this.onLoop(newIter);
    }

    stop () {
        if (!this._started) return;
        this._started = false;
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
        for (const src of this._activeSources) {
            try {
                src.stop();
                src.disconnect();
            } catch (e) { /* already stopped */ }
        }
        this._activeSources = [];
        for (const trackId of Object.keys(this._trackChains)) {
            const chain = this._trackChains[trackId];
            for (const key of Object.keys(chain)) {
                // Skip non-node bookkeeping fields like _distortionAmount.
                if (key.charAt(0) === '_') continue;
                try {
                    chain[key].disconnect();
                } catch (e) { /* ignore */ }
            }
        }
        this._trackChains = {};
        this._effectsCache = {};
        this._volumeCache = {};
        this._activeTracks.clear();
        this._pendingTrackChanges.clear();
        this._pendingDeactivations.clear();
        this._lastPitchByTrack.clear();
        if (!this._ended) {
            this._ended = true;
            this.onEnd();
        }
    }

    _tick () {
        if (!this._started) return;
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const lookahead = 0.1;
        const cursor = now + lookahead;
        const sps = this.secondsPerStep;
        const stepsPerBeat = (this.song && this.song.stepsPerBeat) || 4;
        const length = (this.song && this.song.lengthSteps) || 32;
        const iterDuration = length * sps;

        // Loop wraps based on audible position.
        const iterNow = Math.max(0, Math.floor((now - this._startCtxTime) / iterDuration));
        if (iterNow > this._iter) {
            this._onLoopWrap(iterNow);
        }

        // Apply fade-out deactivations whose ramps have completed.
        if (this._pendingDeactivations.size > 0) {
            for (const [trackId, atTime] of Array.from(this._pendingDeactivations)) {
                if (now >= atTime) {
                    this._activeTracks.delete(trackId);
                    this._pendingDeactivations.delete(trackId);
                    // Restore chain gain so a future fade-in / play starts at full level.
                    const chain = this._trackChains[trackId];
                    if (chain) {
                        try {
                            chain.input.gain.cancelScheduledValues(now);
                        } catch (e) { /* ignore */ }
                        chain.input.gain.setValueAtTime(1, now);
                    }
                    this._notes = this._flattenNotes();
                    this._cancelScheduledForTrack(trackId);
                }
            }
        }

        // Idle-out when nothing is active and no pending work remains.
        if (this._activeTracks.size === 0 &&
            this._pendingTrackChanges.size === 0 &&
            this._pendingDeactivations.size === 0 &&
            this._activeSources.length === 0) {
            // Defer to next tick to give onStep a final flush, then halt.
            this._started = false;
            if (this._timer) {
                clearInterval(this._timer);
                this._timer = null;
            }
            if (!this._ended) {
                this._ended = true;
                this.onEnd();
            }
            return;
        }

        // UI step callback — step is local to the current iteration.
        const elapsed = now - this._startCtxTime - (this._iter * iterDuration);
        const currentStep = Math.floor(elapsed / sps);
        if (currentStep !== this._lastStepFiredAt && currentStep >= 0 && currentStep < length) {
            this._lastStepFiredAt = currentStep;
            this.onStep(currentStep, now);
        }

        // Schedule notes up to cursor across however many iterations overlap
        // the lookahead window (typically 0 or 1 boundaries).
        const cursorIter = Math.floor((cursor - this._startCtxTime) / iterDuration);
        for (let i = this._iter; i <= cursorIter; i++) {
            const iterStart = this._startCtxTime + (i * iterDuration);
            for (const note of this._notes) {
                const noteCtxTime = iterStart + (note.step * sps);
                if (noteCtxTime < this._enqueuedThroughCtxTime) continue;
                if (noteCtxTime > cursor) break;
                this._scheduleNote(note, noteCtxTime);
            }
        }
        this._enqueuedThroughCtxTime = cursor;

        // Fire beat events for the current iteration.
        const iterStartForBeats = this._startCtxTime + (this._iter * iterDuration);
        const beatsPerIter = Math.ceil(length / stepsPerBeat);
        while (true) {
            const beatCtxTime = iterStartForBeats + (this._nextBeatToFire * stepsPerBeat * sps);
            if (beatCtxTime > now + 0.01) break;
            if (this._nextBeatToFire >= beatsPerIter) break;
            this.onBeat(this._nextBeatToFire, beatCtxTime);
            this._nextBeatToFire++;
        }
    }

    _scheduleNote (note, when) {
        if (note.kind === 'synth') {
            this._scheduleSynthNote(note, when);
            return;
        }
        if (note.kind === 'synthDrum') {
            this._scheduleSynthDrumNote(note, when);
            return;
        }
        const ctx = this.audioContext;
        const sps = this.secondsPerStep;
        const noteDuration = (note.durationSteps || 1) * sps;
        let buffer;
        let playbackRate = 1;
        let releaseTime = 0.05;

        if (note.kind === 'drum') {
            buffer = this.getDrumBuffer(note.drum);
            if (!buffer) return;
        } else {
            const info = this.getInstrumentBuffer(note.instrument, note.pitch);
            if (!info || !info.buffer) return;
            buffer = info.buffer;
            playbackRate = ratioForPitchInterval(note.pitch - info.sampleNote);
            releaseTime = info.releaseTime || 0.05;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = playbackRate;

        const volumeGain = ctx.createGain();
        const velocity = typeof note.velocity === 'number' ? note.velocity : 80;
        const vNorm = Math.max(0, Math.min(1, velocity / 127));
        // Cubed velocity curve so 80 vs 110 is plainly audible (the music
        // samples are already loudness-normalized). Track-level volume lives
        // on chain.volume — see setTrackVolume — so this gain is per-voice
        // velocity only.
        const velocityGain = Math.max(0.002, vNorm * vNorm * vNorm);
        volumeGain.gain.setValueAtTime(velocityGain, when);
        volumeGain.gain.value = velocityGain;

        const releaseGain = ctx.createGain();
        releaseGain.gain.setValueAtTime(1, when);

        const releaseStart = when + noteDuration;
        const releaseEnd = releaseStart + releaseTime;
        releaseGain.gain.setValueAtTime(1, releaseStart);
        releaseGain.gain.linearRampToValueAtTime(0.0001, releaseEnd);

        source.connect(volumeGain);
        volumeGain.connect(releaseGain);
        const chain = note.trackId ? this._getTrackChain(note.trackId) : null;
        releaseGain.connect(chain ? chain.input : this.destination);

        source.start(when);
        source.stop(releaseEnd + 0.01);
        source._scheduledStart = when;
        source._trackId = note.trackId;

        this._activeSources.push(source);
        source.onended = () => {
            const idx = this._activeSources.indexOf(source);
            if (idx >= 0) this._activeSources.splice(idx, 1);
            try {
                source.disconnect();
                volumeGain.disconnect();
                releaseGain.disconnect();
            } catch (e) { /* ignore */ }
        };

        this.onNote(note, when);
    }

    // Map a normalized 0..1 value to a musically-spaced filter cutoff in Hz.
    // 0 → ~80 Hz, 1 → ~12 kHz, exponential so slider feels uniform.
    _mapCutoffHz (norm) {
        const x = Math.max(0, Math.min(1, norm));
        return 80 * Math.pow(150, x);
    }

    // Resonance 0..1 → Biquad Q 0.7..18. Above ~15 starts to ring; the cap
    // keeps things musical without self-oscillating into clipping.
    _mapQ (norm) {
        const x = Math.max(0, Math.min(1, norm));
        return 0.7 + (x * 17.3);
    }

    // Filter envelope amount 0..1 → 0..4 octaves of upward sweep, expressed
    // in cents so we can ratio the base cutoff.
    _mapEnvCents (norm) {
        return Math.max(0, Math.min(1, norm)) * 4800;
    }

    _scheduleSynthNote (note, when) {
        const ctx = this.audioContext;
        const sps = this.secondsPerStep;
        // Resolve fresh params from the live track so slider tweaks during
        // playback take effect on the next note (no waiting for re-flatten).
        const track = note.trackId ? this._trackById(note.trackId) : null;
        const params = getTrackSynth(track || {});
        const noteDuration = (note.durationSteps || 1) * sps;
        const freq = midiToFreq(note.pitch);
        const noteOff = when + noteDuration;

        // Glide / portamento: if the track has a non-zero glideTime and we
        // scheduled an earlier note on the same track, start at the previous
        // pitch and linear-ramp to the target. The check `prev.when < when`
        // means notes that start at the exact same step (chord-stacked) do
        // NOT glide off each other — only sequential notes do.
        const glideTime = Math.max(0, Math.min(2, params.glideTime || 0));
        let startFreq = freq;
        if (glideTime > 0.001 && note.trackId) {
            const prev = this._lastPitchByTrack.get(note.trackId);
            if (prev && prev.when < when) {
                startFreq = midiToFreq(prev.pitch);
            }
        }

        const osc1 = ctx.createOscillator();
        osc1.type = params.osc1Wave;
        osc1.frequency.cancelScheduledValues(when);
        osc1.frequency.setValueAtTime(startFreq, when);
        if (startFreq !== freq) {
            osc1.frequency.linearRampToValueAtTime(freq, when + glideTime);
        }

        const osc2 = ctx.createOscillator();
        osc2.type = params.osc2Wave;
        osc2.frequency.cancelScheduledValues(when);
        osc2.frequency.setValueAtTime(startFreq, when);
        if (startFreq !== freq) {
            osc2.frequency.linearRampToValueAtTime(freq, when + glideTime);
        }
        // osc2Detune stored as cents (range -50..50), assignable directly to
        // OscillatorNode.detune which is in cents.
        if (osc2.detune) osc2.detune.value = params.osc2Detune || 0;

        // Record this note's pitch so the next scheduled note on this track
        // can glide from here. We do this regardless of whether THIS note
        // glided so that the next one always has a reference.
        if (note.trackId) {
            this._lastPitchByTrack.set(note.trackId, {pitch: note.pitch, when});
        }

        const mix = Math.max(0, Math.min(1, params.oscMix));
        const mix1 = ctx.createGain();
        const mix2 = ctx.createGain();
        mix1.gain.value = 1 - mix;
        mix2.gain.value = mix;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        const baseCutoff = this._mapCutoffHz(params.filterCutoff);
        filter.Q.value = this._mapQ(params.filterResonance);

        const amp = ctx.createGain();
        amp.gain.value = 0;

        // Velocity → per-voice peak gain. 0.35 headroom keeps two oscs at full
        // mix from clipping into the per-track chain. Track-level volume is
        // applied downstream on chain.volume — see setTrackVolume.
        const velocity = typeof note.velocity === 'number' ? note.velocity : 80;
        const vNorm = Math.max(0, Math.min(1, velocity / 127));
        const velocityGain = Math.max(0.002, vNorm * vNorm * vNorm);
        const peak = velocityGain * 0.35;

        // Amp ADSR. Clamp times so setValueAtTime / linearRamp pairs always
        // have a strictly increasing time argument.
        const a = Math.max(0.001, params.ampAttack);
        const d = Math.max(0.001, params.ampDecay);
        const s = Math.max(0, Math.min(1, params.ampSustain));
        const r = Math.max(0.001, params.ampRelease);
        amp.gain.cancelScheduledValues(when);
        amp.gain.setValueAtTime(0, when);
        amp.gain.linearRampToValueAtTime(peak, when + a);
        amp.gain.linearRampToValueAtTime(peak * s, when + a + d);
        amp.gain.setValueAtTime(peak * s, noteOff);
        amp.gain.linearRampToValueAtTime(0.0001, noteOff + r);

        // Filter ADSR — additive cents above the base cutoff. Ratio domain
        // (multiplicative) means a fixed envelope amount sweeps the same
        // octaves regardless of base cutoff.
        const envCents = this._mapEnvCents(params.filterEnvAmount);
        const ratio = Math.pow(2, envCents / 1200);
        const peakHz = Math.min(20000, baseCutoff * ratio);
        const sustainHz = baseCutoff + ((peakHz - baseCutoff) * Math.max(0, Math.min(1, params.filterSustain)));
        const fa = Math.max(0.001, params.filterAttack);
        const fd = Math.max(0.001, params.filterDecay);
        const fr = Math.max(0.001, params.filterRelease);
        filter.frequency.cancelScheduledValues(when);
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
        const chain = note.trackId ? this._getTrackChain(note.trackId) : null;
        amp.connect(chain ? chain.input : this.destination);

        const stopAt = noteOff + r + 0.02;

        // LFO — built per voice. We could share one LFO across all voices on
        // a track, but per-voice keeps lifecycle simple (LFO stops when the
        // voice stops) and the polyphony cost is trivial. Skip entirely when
        // depth is 0 or destination is 'none' so unused presets are free.
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
                // ±200 cents (2 semitones) at full depth — generous for
                // vibrato, restrained enough that depth ~0.05 is still subtle.
                lfoGain.gain.value = lfoDepth * 200;
                lfo.connect(lfoGain);
                if (osc1.detune) lfoGain.connect(osc1.detune);
                if (osc2.detune) lfoGain.connect(osc2.detune);
            } else if (lfoDest === 'filter') {
                // ±2400 cents = ±2 octaves at full depth. Hits filter.detune
                // so it stacks additively with the filter envelope.
                lfoGain.gain.value = lfoDepth * 2400;
                lfo.connect(lfoGain);
                if (filter.detune) {
                    lfoGain.connect(filter.detune);
                }
            } else if (lfoDest === 'amp') {
                // ±0.5 of peak gain at full depth — tremolo without going
                // fully silent on each swing.
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

        // Voice wrapper exposing the same surface _activeSources consumers
        // already use: _scheduledStart, _trackId, stop(t), disconnect().
        // stop() with no args stops immediately (matches BufferSource); with
        // a time argument schedules the stop.
        const voice = {
            _scheduledStart: when,
            _trackId: note.trackId,
            stop (t) {
                try {
                    osc1.stop(t);
                } catch (e) { /* ignore */ }
                try {
                    osc2.stop(t);
                } catch (e) { /* ignore */ }
                if (lfo) {
                    try {
                        lfo.stop(t);
                    } catch (e) { /* ignore */ }
                }
            },
            disconnect () {
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
            }
        };
        this._activeSources.push(voice);
        // Pick a single oscillator to drive cleanup — both stop at the same
        // time so either would do; osc2 is arbitrary.
        osc2.onended = () => {
            const idx = this._activeSources.indexOf(voice);
            if (idx >= 0) this._activeSources.splice(idx, 1);
            voice.disconnect();
        };

        this.onNote(note, when);
    }

    // Synthesized percussion voice for "synthDrum" tracks. Resolves the lane's
    // params fresh from the live track (so slider tweaks during playback take
    // effect on the next hit, like _scheduleSynthNote) and hands off to the
    // shared percussion voice builder. Drums are one-shots — note duration is
    // ignored; the voice rings for its own envelope.
    _scheduleSynthDrumNote (note, when) {
        const ctx = this.audioContext;
        const track = note.trackId ? this._trackById(note.trackId) : null;
        // _flattenNotes stores `drum` 0-based (for getDrumBuffer); the synthDrum
        // catalog and drumVoices are keyed 1-based, so add one back here.
        const presetIndex = (note.drum || 0) + 1;
        const params = getDrumVoice(track || {}, presetIndex);
        const chain = note.trackId ? this._getTrackChain(note.trackId) : null;
        const voice = buildPercussionVoice(
            ctx, params, when, note.velocity,
            chain ? chain.input : this.destination
        );
        voice._trackId = note.trackId;
        this._activeSources.push(voice);
        voice.onEnded = () => {
            const idx = this._activeSources.indexOf(voice);
            if (idx >= 0) this._activeSources.splice(idx, 1);
        };
        this.onNote(note, when);
    }
}

module.exports = SongScheduler;
module.exports.ratioForPitchInterval = ratioForPitchInterval;
module.exports.midiToFreq = midiToFreq;
module.exports.selectSampleIndexForNote = selectSampleIndexForNote;
