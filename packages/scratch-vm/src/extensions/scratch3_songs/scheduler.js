/**
 * Song scheduler — pure module used by both the runtime Songs extension and the
 * GUI editor's preview. Given a song JSON, an audio context, and accessors to
 * get instrument/drum sample buffers, it schedules `AudioBufferSourceNode`s
 * for the song's notes and fires beat/note/start/end callbacks at the right
 * audio-context times.
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
     * @param {function} [opts.onStart] - called once at start
     * @param {function} [opts.onBeat] - called(beatIndex, ctxTime) when a beat boundary is reached
     * @param {function} [opts.onNote] - called({trackId, step, pitch, drum}, ctxTime) when a note begins
     * @param {function} [opts.onEnd] - called once when the song's last note's release completes
     * @param {function} [opts.onStep] - called(stepIndex, ctxTime) when the playhead advances (for UI)
     * @param {function} [opts.onLoop] - called(iterationIndex) just after the playhead wraps in loop mode
     * @param {boolean} [opts.loop] - if true, playback wraps from the end of the song back to step 0 seamlessly
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
        this._loop = !!opts.loop;
        // Allow callers to start playback partway through the song. Notes
        // whose step is below startStep are skipped entirely (they're "in the
        // past" relative to the user's intended start).
        this.startStep = Math.max(0, Math.floor(opts.startStep || 0));

        this._activeSources = [];
        this._timer = null;
        this._startCtxTime = 0;
        this._enqueuedThroughCtxTime = 0;
        this._nextBeatToFire = 0;
        this._lastStepFiredAt = -1;
        this._started = false;
        this._ended = false;
        this._iter = 0;
        this._notes = [];   // flat sorted list of {trackId, kind, instrument, drum, volume, muted, step, durationSteps, pitch}
        this._endTime = 0;
        // Per-track FX chains, keyed by trackId. Built lazily on first note of
        // a track so empty / muted tracks cost nothing.
        this._trackChains = {};
        // Latest effect values pushed via setTrackEffects, keyed by trackId.
        // Persists across the lifetime of the scheduler so a chain built AFTER
        // a slider drag still picks up the live values (the scheduler's song
        // reference is frozen at construction and may be stale by then).
        this._effectsCache = {};
        // Shared synthesized impulse response for all per-track reverbs.
        this._reverbBuffer = null;
    }

    get tempo () {
        return this.tempoOverride || this.song.tempo || 120;
    }

    get secondsPerStep () {
        const stepsPerBeat = this.song.stepsPerBeat || 4;
        return (60 / this.tempo) / stepsPerBeat;
    }

    _trackById (trackId) {
        for (const t of (this.song.tracks || [])) {
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
        // Decaying white noise — a cheap, characterful "room" impulse. Two
        // independent channels so the result is naturally stereo.
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                const env = Math.pow(1 - (i / length), 2.6);
                data[i] = (Math.random() * 2 - 1) * env;
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

        // StereoPannerNode isn't in every WebAudio implementation; fall back to
        // a passthrough gain so the chain still works (just without pan).
        const panner = typeof ctx.createStereoPanner === 'function' ?
            ctx.createStereoPanner() : ctx.createGain();
        if (panner.pan) panner.pan.value = 0;

        const dry = ctx.createGain();
        dry.gain.value = 1;

        const reverb = ctx.createConvolver();
        reverb.buffer = this._getReverbBuffer();
        const reverbSend = ctx.createGain();
        reverbSend.gain.value = 0;

        // 1/8-note delay at the song's tempo. Held constant for the lifetime
        // of this chain; tempo changes go through a scheduler restart.
        const stepsPerBeat = this.song.stepsPerBeat || 4;
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

        // Sends fork off the panner so the wet paths share filter+pan colour
        // with the dry. Cheap and produces the most "natural" result.
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
        // Prefer the most recent live-pushed values over the construction-time
        // song JSON, since the song reference doesn't update mid-playback.
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
        // Filter: 0 = closed (200 Hz), 1 = open (12 kHz). Log-mapped so a slider
        // feels musical end-to-end.
        const f = clamp01(effects.filter);
        const cutoff = 200 * Math.pow(60, f);
        chain.filter.frequency.setTargetAtTime(cutoff, now, tau);
        if (chain.panner.pan) {
            const p = Math.max(-1, Math.min(1, effects.pan));
            chain.panner.pan.setTargetAtTime(p, now, tau);
        }
        // Scale wet sends below 1.0 so even max settings stay in a usable range
        // (otherwise reverb at 1.0 swamps the dry signal).
        chain.reverbSend.gain.setTargetAtTime(clamp01(effects.reverb) * 0.6, now, tau);
        chain.delaySend.gain.setTargetAtTime(clamp01(effects.delay) * 0.55, now, tau);
    }

    /**
     * Apply live effect values to a track's audio chain (no-op if no chain has
     * been built yet for this trackId, i.e. the track has not played a note
     * since play() was called). Lets the editor's sliders be heard mid-playback
     * without restarting the scheduler.
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
        for (const track of (this.song.tracks || [])) {
            if (track.muted) continue;
            for (const note of (track.notes || [])) {
                // For drums, prefer the per-note drum field (the new
                // multi-lane drum-machine shape). Fall back to the legacy
                // single-track drum index so old projects still play.
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

    play () {
        if (this._started) return;
        this._started = true;
        this._ended = false;
        this._iter = 0;
        // `_notes` is the full list; the startStep filter applies only to
        // iteration 0 and is enforced inline during scheduling. Notes whose
        // start step is below startStep are skipped on the first iteration —
        // they're "in the past" relative to the user's intended start. Notes
        // that *cross* the start step are dropped too; partial sustains would
        // require slicing the audio buffer.
        this._notes = this._flattenNotes();
        const sps = this.secondsPerStep;
        const length = this.song.lengthSteps || 32;
        // Anchor the audio timeline so step 0 maps to (now + offset - startStep*sps).
        // That way each note still fires at (startCtxTime + note.step * sps),
        // and the playhead reads correctly from the very first onStep tick.
        const offset = 0.05;
        const now = this.audioContext.currentTime;
        this._startCtxTime = now + offset - (this.startStep * sps);
        this._endTime = this._startCtxTime + (length * sps);
        this._enqueuedThroughCtxTime = now + offset;
        this._nextBeatToFire = Math.floor(this.startStep / (this.song.stepsPerBeat || 4));
        this._lastStepFiredAt = this.startStep - 1;

        // Fire onStart slightly later so subscribers can wire up.
        setTimeout(() => this.onStart(), 0);

        this._timer = setInterval(() => this._tick(), 25);
        this._tick();
    }

    /**
     * Toggle loop mode on or off mid-playback. When turning off, the scheduler
     * finishes the current iteration normally and then fires onEnd. When
     * turning on, scheduling extends past the current iteration boundary.
     *
     * @param {boolean} loop
     */
    setLoop (loop) {
        this._loop = !!loop;
    }

    /**
     * Swap in a new song reference and re-flatten the note list. Used by the
     * editor so edits made during one loop iteration are heard in the next.
     * Notes already scheduled within the lookahead window will play with their
     * old parameters — only notes scheduled after this call see the update.
     *
     * @param {object} song
     */
    updateSong (song) {
        if (!song) return;
        this.song = song;
        this._notes = this._flattenNotes();
    }

    /**
     * Internal: handle a loop wrap. Re-flattens notes from the (possibly
     * updated) song reference so live edits show up in the new iteration,
     * resets per-iteration step/beat counters so step 0 fires again, and
     * fires onLoop.
     *
     * @param {number} newIter
     */
    _onLoopWrap (newIter) {
        this._iter = newIter;
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
        // Tear down per-track FX chains so we don't leak audio nodes across
        // play/stop cycles. The reverb impulse buffer is cheap to retain;
        // the audio nodes themselves are not.
        for (const trackId of Object.keys(this._trackChains)) {
            const chain = this._trackChains[trackId];
            for (const key of Object.keys(chain)) {
                try { chain[key].disconnect(); } catch (e) { /* ignore */ }
            }
        }
        this._trackChains = {};
        this._effectsCache = {};
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
        const stepsPerBeat = this.song.stepsPerBeat || 4;
        const length = this.song.lengthSteps || 32;
        const iterDuration = length * sps;

        // Detect loop wraps based on `now` (audible position). If the audible
        // playhead has crossed into a later iteration than `_iter`, run the
        // wrap handler — this refreshes notes from the latest song reference
        // and resets the per-iteration step/beat counters.
        const iterNow = Math.max(0, Math.floor((now - this._startCtxTime) / iterDuration));
        if (this._loop && iterNow > this._iter) {
            this._onLoopWrap(iterNow);
        }

        // UI step callback — step is local to the current iteration.
        const elapsed = now - this._startCtxTime - (this._iter * iterDuration);
        const currentStep = Math.floor(elapsed / sps);
        if (currentStep !== this._lastStepFiredAt && currentStep >= 0 && currentStep < length) {
            this._lastStepFiredAt = currentStep;
            this.onStep(currentStep, now);
        }

        // Schedule notes up to cursor. In loop mode, the cursor may extend
        // past the current iteration's end, so we walk the note list once per
        // iteration that overlaps the lookahead window. The startStep filter
        // applies only to iteration 0 (the user's intended starting point);
        // every subsequent loop iteration plays the full note list from step 0.
        const cursorIter = this._loop ?
            Math.floor((cursor - this._startCtxTime) / iterDuration) :
            this._iter;
        for (let i = this._iter; i <= cursorIter; i++) {
            const iterStart = this._startCtxTime + (i * iterDuration);
            const minStep = i === 0 ? this.startStep : 0;
            for (const note of this._notes) {
                if (note.step < minStep) continue;
                const noteCtxTime = iterStart + (note.step * sps);
                if (noteCtxTime < this._enqueuedThroughCtxTime) continue;
                if (noteCtxTime > cursor) break; // notes are sorted by step
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

        // End of song — only when not looping. Add a 50 ms tail so the final
        // note's release ramp has time to play out before subscribers tear
        // down audio nodes.
        if (!this._loop) {
            const currentIterEnd = this._startCtxTime + ((this._iter + 1) * iterDuration);
            if (now >= currentIterEnd + 0.05 && !this._ended) {
                this._ended = true;
                this.onEnd();
                this._started = false;
                if (this._timer) {
                    clearInterval(this._timer);
                    this._timer = null;
                }
            }
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
        // MIDI-style velocity (1-127) scales the per-note amplitude on top of
        // the track volume. A linear v/127 is far too flat — the Scratch
        // music samples are already loudness-normalized, so the gain node is
        // doing the *entire* job of expressing dynamics. A cubed curve
        // (v/127)^3 gives roughly ~36 dB of useful range from softest to
        // loudest, which is close to the MIDI spec's recommended dB curve and
        // is dramatic enough that an 80 vs 110 difference is plainly audible.
        const velocity = typeof note.velocity === 'number' ? note.velocity : 80;
        const vNorm = Math.max(0, Math.min(1, velocity / 127));
        const velocityGain = Math.max(0.002, vNorm * vNorm * vNorm);
        const finalGain = trackVol * velocityGain;
        volumeGain.gain.setValueAtTime(finalGain, when);
        // Also set the value directly so it takes effect immediately, even if
        // `when` ends up in the past relative to currentTime by the time the
        // node is connected. setValueAtTime alone scheduled in the past can
        // be a no-op in some WebAudio implementations.
        volumeGain.gain.value = finalGain;
        // Debug: log every scheduled note's velocity → gain so the user can
        // verify in the browser console that distinct velocities produce
        // distinct gains. Remove once we're confident the chain is correct.
        if (typeof console !== 'undefined' && console.debug) {
            console.debug(
                `[song] step=${note.step} kind=${note.kind} ` +
                `vel=${velocity} → vGain=${velocityGain.toFixed(4)} ` +
                `trackVol=${trackVol} finalGain=${finalGain.toFixed(4)}`
            );
        }

        const releaseGain = ctx.createGain();
        releaseGain.gain.setValueAtTime(1, when);

        const releaseStart = when + noteDuration;
        const releaseEnd = releaseStart + releaseTime;
        releaseGain.gain.setValueAtTime(1, releaseStart);
        releaseGain.gain.linearRampToValueAtTime(0.0001, releaseEnd);

        source.connect(volumeGain);
        volumeGain.connect(releaseGain);
        // Route through the track's FX chain so per-track filter / pan /
        // reverb / delay shape the sound. _getTrackChain builds the chain
        // on first hit for a track and caches it for the rest of playback.
        const chain = note.trackId ? this._getTrackChain(note.trackId) : null;
        releaseGain.connect(chain ? chain.input : this.destination);

        source.start(when);
        source.stop(releaseEnd + 0.01);

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
