/**
 * Song scheduler — pure module used by both the runtime Songs extension and the
 * GUI editor's preview. Holds a single shared transport keyed to the project's
 * song (tempo + length + tracks). Tracks are individually `active` or
 * `inactive`; the transport ticks whenever ≥1 track is active and always loops.
 * Track activation can be scheduled to take effect immediately ("now") or at
 * the next loop boundary ("loop"). Per-track fades animate a gain node on the
 * track's FX chain so they compose with per-note velocity gain.
 */

const ratioForPitchInterval = interval => Math.pow(2, interval / 12);

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
        this._effectsCache = {};
        // Shared synthesized impulse response for all per-track reverbs.
        this._reverbBuffer = null;
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
            pan: typeof e.pan === 'number' ? e.pan : 0
        };
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
        const input = ctx.createGain();
        input.gain.value = 1;

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

        input.connect(filter);
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

        const chain = {input, filter, panner, dry, reverb, reverbSend, delay, delaySend, feedback};
        this._trackChains[trackId] = chain;
        const cached = this._effectsCache[trackId];
        const track = this._trackById(trackId);
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

    _flattenNotes () {
        const notes = [];
        const tracks = (this.song && this.song.tracks) || [];
        for (const track of tracks) {
            if (!this._activeTracks.has(track.trackId)) continue;
            if (track.muted) continue;
            for (const note of (track.notes || [])) {
                const drumIdx = (typeof note.drum === 'number' ? note.drum : (track.drum || 1)) - 1;
                notes.push({
                    trackId: track.trackId,
                    kind: track.kind,
                    instrument: (track.instrument || 1) - 1,
                    drum: drumIdx,
                    volume: typeof track.volume === 'number' ? track.volume : 80,
                    velocity: typeof note.velocity === 'number' ? note.velocity : 80,
                    step: note.step,
                    durationSteps: note.durationSteps || 1,
                    pitch: typeof note.pitch === 'number' ? note.pitch : 60
                });
            }
        }
        notes.sort((a, b) => a.step - b.step);
        return notes;
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
     * @param song
     */
    updateSong (song) {
        if (!song) return;
        this.song = song;
        const validIds = new Set((song.tracks || []).map(t => t.trackId));
        for (const id of Array.from(this._activeTracks)) {
            if (!validIds.has(id)) this._activeTracks.delete(id);
        }
        this._notes = this._flattenNotes();
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
                try {
                    chain[key].disconnect();
                } catch (e) { /* ignore */ }
            }
        }
        this._trackChains = {};
        this._effectsCache = {};
        this._activeTracks.clear();
        this._pendingTrackChanges.clear();
        this._pendingDeactivations.clear();
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
        const trackVol = (typeof note.volume === 'number' ? note.volume : 80) / 100;
        const velocity = typeof note.velocity === 'number' ? note.velocity : 80;
        const vNorm = Math.max(0, Math.min(1, velocity / 127));
        // Cubed velocity curve so 80 vs 110 is plainly audible (the music
        // samples are already loudness-normalized).
        const velocityGain = Math.max(0.002, vNorm * vNorm * vNorm);
        const finalGain = trackVol * velocityGain;
        volumeGain.gain.setValueAtTime(finalGain, when);
        volumeGain.gain.value = finalGain;

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
}

module.exports = SongScheduler;
module.exports.ratioForPitchInterval = ratioForPitchInterval;
module.exports.selectSampleIndexForNote = selectSampleIndexForNote;
