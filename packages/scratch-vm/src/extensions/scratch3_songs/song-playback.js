const SongScheduler = require('./scheduler');
const {getTrackSynth} = require('./synth-defaults');
const {midiToFreq} = require('./scheduler');

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
        this._ensureMusicLoaded();
        runtime.on('PROJECT_STOP_ALL', () => this.stop());
    }

    isPlaying () {
        return !!(this._scheduler && this._scheduler.isRunning());
    }

    activeTrackIds () {
        return this._scheduler ? this._scheduler.activeTrackIds() : [];
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
     * the scheduler picks them up the next time it is built.
     * @param {object} callbacks - {onBeat, onNote}
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
        const song = this.runtime.song;
        if (!song) return null;
        const hat = this._hatCallbacks;
        this._scheduler = new SongScheduler({
            song,
            audioContext: ctx,
            destination: this._audioDestination(),
            getInstrumentBuffer: (i, n) => this._getInstrumentBuffer(i, n),
            getDrumBuffer: d => this._getDrumBuffer(d),
            onStart: () => this._fire('start', this.runtime.song),
            onStep: (step, time) => this._fire('step', step, time),
            onBeat: (b, t) => {
                if (hat.onBeat) hat.onBeat(b, t);
            },
            onNote: (n, t) => {
                if (hat.onNote) hat.onNote(n, t);
            },
            onLoop: () => { /* no external subscribers yet */ },
            onEnd: () => {
                const endedSong = this.runtime.song;
                this._scheduler = null;
                this._fire('end', endedSong);
            }
        });
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
        const sched = this._ensureScheduler();
        if (!sched) return;
        sched.setTrackActive(trackId, !!active, when || 'now');
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
        const sched = this._ensureScheduler();
        if (!sched) return;
        const tracks = (this.runtime.song && this.runtime.song.tracks) || [];
        sched.start({
            startStep: (opts && opts.startStep) || 0,
            activeTracks: tracks.map(t => t.trackId)
        });
    }

    /**
     * Begin a linear fade on a track. Direction 'in' activates and ramps up
     * from silence; direction 'out' ramps down and deactivates on completion.
     * @param {string} trackId
     * @param {string} direction - 'in' or 'out'
     * @param {string} [when]
     * @param {number} [durationSec]
     */
    fadeTrack (trackId, direction, when, durationSec) {
        const sched = this._ensureScheduler();
        if (!sched) return;
        sched.fadeTrack(trackId, direction, when || 'now', durationSec || 1.0);
    }

    /** Immediately stop the transport and tear down all audio nodes. */
    stop () {
        if (this._scheduler) {
            this._scheduler.stop();
        }
        this._fire('stop');
    }

    /**
     * Push an updated song reference (live editing).
     * @param song
     */
    updateSong (song) {
        if (!song) return;
        if (this._scheduler && this._scheduler.updateSong) {
            this._scheduler.updateSong(song);
        }
    }

    setTrackEffects (trackId, effects) {
        if (this._scheduler && this._scheduler.setTrackEffects) {
            this._scheduler.setTrackEffects(trackId, effects);
        }
    }

    /**
     * Tempo override on the running scheduler (preserves playhead).
     * @param bpm
     */
    setTempoOverride (bpm) {
        if (this._scheduler) {
            this._scheduler.tempoOverride = bpm;
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
        const {kind, instrument, drum, pitch, velocity = 90, durationSec = 0.18, synth} = opts || {};
        if (kind === 'synth') {
            const synthDur = opts && opts.durationSec ? opts.durationSec : 0.35;
            this._previewSynthNote({synth, pitch, velocity, durationSec: synthDur});
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
        const vNorm = Math.max(0, Math.min(1, velocity / 127));
        const velocityGain = Math.max(0.002, vNorm * vNorm * vNorm);
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
        releaseGain.connect(this._audioDestination());

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

        const vNorm = Math.max(0, Math.min(1, velocity / 127));
        const velocityGain = Math.max(0.002, vNorm * vNorm * vNorm);
        const peak = velocityGain * 0.35;

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
        amp.connect(this._audioDestination());

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
