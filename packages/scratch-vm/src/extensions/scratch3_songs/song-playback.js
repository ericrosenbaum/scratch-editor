const SongScheduler = require('./scheduler');

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
        const {kind, instrument, drum, pitch, velocity = 90, durationSec = 0.18} = opts || {};
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
}

module.exports = SongPlayback;
