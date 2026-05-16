const SongScheduler = require('./scheduler');

/**
 * Project-wide song playback singleton owned by the runtime. There is at most
 * one scheduler active at any time — both the extension's blocks and the GUI
 * editor's preview route through this single instance so they can't produce
 * overlapping audio. A second `play()` interrupts the current song; `queueNext()`
 * defers the new song to the current song's next iteration boundary for
 * gapless transitions (e.g. verse → bridge).
 */
class SongPlayback {
    constructor (runtime) {
        this.runtime = runtime;
        this._scheduler = null;
        this._currentSong = null;
        this._currentCallbacks = null;
        this._queuedSong = null;
        this._queuedCallbacks = null;
        this._loop = false;
        // External subscribers (GUI editor) for high-level events.
        this._listeners = {start: [], step: [], end: [], stop: []};
        this._ensureMusicLoaded();
        // Stop on project-stop-all so song playback halts together with the
        // rest of the project's audio.
        runtime.on('PROJECT_STOP_ALL', () => this.stop());
    }

    /** @returns {boolean} */
    isPlaying () {
        return !!this._scheduler;
    }

    /** @returns {?string} */
    currentSongId () {
        return (this._currentSong && this._currentSong.songId) || null;
    }

    /** Subscribe to a high-level event ('start', 'step', 'end', 'stop'). */
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

    /** Play a song now, interrupting whatever was playing. */
    play (song, opts) {
        if (!song) return;
        const o = opts || {};
        const ctx = this._audioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
            ctx.resume().catch(() => {});
        }
        this._ensureMusicLoaded();
        // Tear down any active scheduler before starting a new one. This
        // fires the previous caller's onEnd and our 'end' event.
        if (this._scheduler) {
            this._scheduler.stop();
            // stop() synchronously triggers our scheduler-onEnd handler which
            // clears state below.
        }
        const callbacks = o.callbacks || {};
        this._currentSong = song;
        this._currentCallbacks = callbacks;
        this._loop = !!o.loop;
        this._queuedSong = null;
        this._queuedCallbacks = null;
        this._scheduler = new SongScheduler({
            song,
            startStep: o.startStep || 0,
            loop: this._loop,
            audioContext: ctx,
            destination: this._audioDestination(),
            tempoOverride: o.tempoOverride,
            getInstrumentBuffer: (i, n) => this._getInstrumentBuffer(i, n),
            getDrumBuffer: d => this._getDrumBuffer(d),
            onStart: () => {
                const cbs = this._currentCallbacks;
                if (cbs && cbs.onStart) cbs.onStart();
                this._fire('start', this._currentSong);
            },
            onStep: (step, time) => {
                const cbs = this._currentCallbacks;
                if (cbs && cbs.onStep) cbs.onStep(step, time);
                this._fire('step', step, time);
            },
            onBeat: (b, t) => {
                const cbs = this._currentCallbacks;
                if (cbs && cbs.onBeat) cbs.onBeat(b, t);
            },
            onNote: (n, t) => {
                const cbs = this._currentCallbacks;
                if (cbs && cbs.onNote) cbs.onNote(n, t);
            },
            onLoop: i => {
                const cbs = this._currentCallbacks;
                if (cbs && cbs.onLoop) cbs.onLoop(i);
            },
            onEnd: () => {
                const cbs = this._currentCallbacks;
                const ended = this._currentSong;
                this._scheduler = null;
                this._currentSong = null;
                this._currentCallbacks = null;
                this._queuedSong = null;
                this._queuedCallbacks = null;
                if (cbs && cbs.onEnd) cbs.onEnd();
                this._fire('end', ended);
            },
            onSongSwap: newSong => {
                // The scheduler reached the boundary and swapped to the
                // queued song. Hand off callbacks: fire the previous song's
                // onEnd, then the new song's onStart, so block-level hat
                // flags fire in the right order.
                const oldCbs = this._currentCallbacks;
                const newCbs = this._queuedCallbacks || {};
                const oldSong = this._currentSong;
                this._currentSong = newSong;
                this._currentCallbacks = newCbs;
                this._queuedSong = null;
                this._queuedCallbacks = null;
                if (oldCbs && oldCbs.onEnd) oldCbs.onEnd();
                this._fire('end', oldSong);
                if (newCbs && newCbs.onStart) newCbs.onStart();
                this._fire('start', newSong);
            }
        });
        this._scheduler.play();
    }

    /**
     * Queue a song to start at the current song's next boundary. If nothing is
     * playing, behaves like play() so the block is safe to use unconditionally.
     */
    queueNext (song, opts) {
        if (!song) return;
        if (!this._scheduler) {
            this.play(song, opts);
            return;
        }
        const o = opts || {};
        this._queuedSong = song;
        this._queuedCallbacks = o.callbacks || {};
        const queueOpts = {};
        if (Object.prototype.hasOwnProperty.call(o, 'loop')) queueOpts.loop = !!o.loop;
        this._scheduler.queueSong(song, queueOpts);
    }

    stop () {
        if (this._scheduler) {
            this._scheduler.stop();
            // The scheduler's onEnd handler clears state.
        }
        this._fire('stop');
    }

    setLoop (loop) {
        this._loop = !!loop;
        if (this._scheduler && this._scheduler.setLoop) {
            this._scheduler.setLoop(this._loop);
        }
    }

    isLoop () {
        return this._loop;
    }

    /** Push an updated song reference (live editing during loop). */
    updateSong (song) {
        if (!song) return;
        if (this._currentSong && this._currentSong.songId === song.songId) {
            this._currentSong = song;
        }
        if (this._scheduler && this._scheduler.updateSong) {
            this._scheduler.updateSong(song);
        }
    }

    setTrackEffects (trackId, effects) {
        if (this._scheduler && this._scheduler.setTrackEffects) {
            this._scheduler.setTrackEffects(trackId, effects);
        }
    }

    /** Tempo override on the running scheduler (preserves playhead). */
    setTempoOverride (bpm) {
        if (this._scheduler) {
            this._scheduler.tempoOverride = bpm;
        }
    }

    /* Internal: music-extension sample lookup ----------------------------- */

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
