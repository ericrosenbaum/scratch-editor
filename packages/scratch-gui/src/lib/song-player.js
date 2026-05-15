import SongScheduler from '@scratch/scratch-vm/src/extensions/scratch3_songs/scheduler';

/**
 * Editor-side song preview engine. Reuses the music extension's already-loaded
 * instrument/drum sample buffers via the VM runtime.
 */
class SongPlayer {
    constructor (vm) {
        this.vm = vm;
        this._scheduler = null;
        this._listeners = {step: [], end: [], start: []};
        this._loop = false;
        this._lastSong = null;
        // Preload the Music extension up front so samples are decoded by the
        // time the user hits Play.
        this._ensureMusicLoaded();
    }

    setLoop (loop) {
        this._loop = !!loop;
        // Toggle scheduler-native loop mode so flipping the loop button
        // mid-playback takes effect without a scheduler restart.
        if (this._scheduler && typeof this._scheduler.setLoop === 'function') {
            this._scheduler.setLoop(this._loop);
        }
    }

    /**
     * Update the player's reference to the song JSON. Pushed to the running
     * scheduler so edits made during a loop iteration are heard on the next
     * wrap. The editor should call this whenever the user commits an edit.
     *
     * @param {object} song
     */
    updateSong (song) {
        if (!song) return;
        this._lastSong = song;
        if (this._scheduler && typeof this._scheduler.updateSong === 'function') {
            this._scheduler.updateSong(song);
        }
    }

    /**
     * Push updated per-track effect values to the active scheduler so the
     * change is audible mid-playback. No-op when not playing (the new values
     * still take effect on the next `play()` because the scheduler reads from
     * the song JSON when it builds each track's FX chain).
     */
    setTrackEffects (trackId, effects) {
        if (this._scheduler && typeof this._scheduler.setTrackEffects === 'function') {
            this._scheduler.setTrackEffects(trackId, effects);
        }
    }

    isLoop () {
        return this._loop;
    }

    _ensureMusicLoaded () {
        const em = this.vm.extensionManager;
        if (em && !em.isExtensionLoaded('music')) {
            try { em.loadExtensionIdSync('music'); } catch (e) { /* swallow */ }
        }
        return this.vm.runtime._musicExtension || null;
    }

    _getInstrumentBuffer (instIdx, midiNote) {
        const music = this._ensureMusicLoaded();
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
        const music = this._ensureMusicLoaded();
        if (!music) return null;
        const player = music.getDrumPlayer(drumIdx);
        return player && player.buffer;
    }

    _audioContext () {
        const engine = this.vm.runtime && this.vm.runtime.audioEngine;
        return engine && engine.audioContext;
    }

    _audioDestination () {
        const engine = this.vm.runtime && this.vm.runtime.audioEngine;
        if (engine && typeof engine.getInputNode === 'function') return engine.getInputNode();
        return this._audioContext().destination;
    }

    /** @returns {boolean} */
    isPlaying () {
        return !!this._scheduler;
    }

    /**
     * Subscribe to player events ('start', 'step', 'end').
     * Returns an unsubscribe function.
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
            try { fn(...args); } catch (e) { /* ignore */ }
        }
    }

    play (song, opts = {}) {
        this.stop();
        const ctx = this._audioContext();
        if (!ctx) return;
        // Make sure the audio context is running — browser may suspend it
        // until a user gesture.
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
            ctx.resume().catch(() => {});
        }
        this._ensureMusicLoaded();
        this._lastSong = song;
        this._lastStartStep = opts.startStep || 0;

        this._scheduler = new SongScheduler({
            song,
            startStep: opts.startStep || 0,
            loop: this._loop,
            audioContext: ctx,
            destination: this._audioDestination(),
            getInstrumentBuffer: (inst, note) => this._getInstrumentBuffer(inst, note),
            getDrumBuffer: drum => this._getDrumBuffer(drum),
            onStart: () => this._fire('start'),
            onStep: (step, time) => this._fire('step', step, time),
            // On every loop wrap, push the latest song reference into the
            // scheduler so edits made during the previous iteration are heard.
            onLoop: () => {
                if (this._lastSong && this._scheduler) {
                    this._scheduler.updateSong(this._lastSong);
                }
            },
            onEnd: () => {
                this._fire('end');
                this._scheduler = null;
            }
        });
        this._scheduler.play();
    }

    stop () {
        if (this._scheduler) {
            this._scheduler.stop();
            this._scheduler = null;
        }
    }

    /**
     * Fire a single one-shot note for UI preview (e.g. when the user clicks a
     * cell to create a note, or drags a note's pitch). Best-effort — silently
     * no-ops if samples aren't loaded yet or the audio context can't run.
     *
     * @param {object} opts
     * @param {('instrument'|'drum')} opts.kind
     * @param {number} [opts.instrument] 1-based instrument index (when kind=instrument)
     * @param {number} [opts.drum] 1-based drum index (when kind=drum)
     * @param {number} [opts.pitch] MIDI pitch (when kind=instrument)
     * @param {number} [opts.velocity] MIDI velocity (1-127, default 90)
     * @param {number} [opts.durationSec] Sustain in seconds (default 0.18)
     */
    previewNote ({kind, instrument, drum, pitch, velocity = 90, durationSec = 0.18} = {}) {
        const ctx = this._audioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
            ctx.resume().catch(() => {});
        }
        this._ensureMusicLoaded();

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
            // Pitch-shift the sample to the requested MIDI pitch.
            playbackRate = Math.pow(2, (pitch - info.sampleNote) / 12);
            releaseTime = info.releaseTime || 0.05;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = playbackRate;

        const volumeGain = ctx.createGain();
        const vNorm = Math.max(0, Math.min(1, velocity / 127));
        // Use the same cubed curve as the scheduler so previews and playback
        // perceptually agree.
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

export default SongPlayer;
