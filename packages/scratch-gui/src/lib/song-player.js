/**
 * Thin facade around the runtime's single SongPlayback singleton. There's
 * only one song scheduler in the whole VM, shared between the editor preview
 * here and the Songs extension's blocks — so when the editor hits Play it
 * interrupts any project-driven song (and vice versa). This shim preserves
 * the prior SongPlayer API (play / stop / on / setLoop / updateSong /
 * setTrackEffects / previewNote) so call-sites don't have to know.
 */
class SongPlayer {
    constructor (vm) {
        this.vm = vm;
        this._loop = false;
        this._listeners = {start: [], step: [], end: []};
        this._unsubs = [];
        // Lazily subscribe to playback events the first time `on()` is called.
        this._subscribed = false;
    }

    _playback () {
        return this.vm.runtime.songPlayback;
    }

    _subscribeOnce () {
        if (this._subscribed) return;
        this._subscribed = true;
        const pb = this._playback();
        // Forward only the events the editor cares about. We don't unwrap
        // through to the underlying scheduler — too coupled.
        this._unsubs.push(pb.on('start', song => {
            // The editor only wants 'start' for the song it kicked off via
            // play(); ignore start events for songs initiated elsewhere.
            if (this._myCurrentSongId && song && song.songId === this._myCurrentSongId) {
                this._fire('start');
            }
        }));
        this._unsubs.push(pb.on('step', (step, time) => {
            // Step events are noisy; only forward while we believe we're the
            // active caller (i.e. our last play() wasn't superseded).
            if (this._myCurrentSongId &&
                pb.currentSongId() === this._myCurrentSongId) {
                this._fire('step', step, time);
            }
        }));
        this._unsubs.push(pb.on('end', () => {
            if (this._myCurrentSongId) {
                this._fire('end');
                this._myCurrentSongId = null;
            }
        }));
        // 'stop' covers external interruption (e.g. blocks took over).
        this._unsubs.push(pb.on('stop', () => {
            if (this._myCurrentSongId) {
                this._fire('end');
                this._myCurrentSongId = null;
            }
        }));
    }

    setLoop (loop) {
        this._loop = !!loop;
        const pb = this._playback();
        if (pb && pb.currentSongId() === this._myCurrentSongId) {
            pb.setLoop(this._loop);
        }
    }

    updateSong (song) {
        if (!song) return;
        const pb = this._playback();
        if (pb && pb.currentSongId() === this._myCurrentSongId) {
            pb.updateSong(song);
        }
    }

    setTrackEffects (trackId, effects) {
        const pb = this._playback();
        if (pb && pb.currentSongId() === this._myCurrentSongId) {
            pb.setTrackEffects(trackId, effects);
        }
    }

    isLoop () {
        return this._loop;
    }

    isPlaying () {
        const pb = this._playback();
        return !!(pb && pb.currentSongId() === this._myCurrentSongId);
    }

    on (event, fn) {
        this._subscribeOnce();
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

    play (song, opts = {}) {
        this._subscribeOnce();
        const pb = this._playback();
        if (!pb || !song) return;
        // Track which song we kicked off so we know which playback events
        // belong to us versus other callers (blocks, etc.).
        this._myCurrentSongId = song.songId;
        pb.play(song, {
            startStep: opts.startStep || 0,
            loop: this._loop
        });
    }

    stop () {
        const pb = this._playback();
        if (!pb) return;
        if (pb.currentSongId() === this._myCurrentSongId) {
            pb.stop();
        }
        this._myCurrentSongId = null;
    }

    previewNote (opts) {
        const pb = this._playback();
        if (pb && pb.previewNote) pb.previewNote(opts);
    }

    /** Tear down event subscriptions so this SongPlayer can be GC'd. */
    dispose () {
        for (const unsub of this._unsubs) {
            try {
                unsub();
            } catch (e) { /* ignore */ }
        }
        this._unsubs = [];
        this._listeners = {start: [], step: [], end: []};
        this._subscribed = false;
    }
}

export default SongPlayer;
