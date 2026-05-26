/**
 * Thin facade around the runtime's SongPlayback singleton, exposing the
 * editor-preview-shaped API (play / stop / on / updateSong / setTrackEffects
 * / previewNote). The transport is shared with the extension blocks, so a
 * block that activates a track while the editor's preview is running just
 * keeps everything playing — there's only one transport in the VM.
 *
 * "Play" here means "preview every track of the current song from the cursor"
 * — `playAll()` on the playback singleton. Loop is implicit (the transport
 * always loops); the prior `setLoop`/`isLoop` API is retained as a no-op
 * shim so the editor's loop toggle continues to compile without churn.
 */
class SongPlayer {
    constructor (vm) {
        this.vm = vm;
        this._listeners = {start: [], step: [], end: []};
        this._unsubs = [];
        this._subscribed = false;
        // Becomes true between play() and the playback's 'end'/'stop' event
        // so we can ignore events from external callers.
        this._isMyPlayback = false;
    }

    _playback () {
        return this.vm.runtime.songPlayback;
    }

    _subscribeOnce () {
        if (this._subscribed) return;
        this._subscribed = true;
        const pb = this._playback();
        this._unsubs.push(pb.on('start', () => {
            if (this._isMyPlayback) this._fire('start');
        }));
        this._unsubs.push(pb.on('step', (step, time) => {
            if (this._isMyPlayback) this._fire('step', step, time);
        }));
        this._unsubs.push(pb.on('end', () => {
            if (this._isMyPlayback) {
                this._fire('end');
                this._isMyPlayback = false;
            }
        }));
        this._unsubs.push(pb.on('stop', () => {
            if (this._isMyPlayback) {
                this._fire('end');
                this._isMyPlayback = false;
            }
        }));
    }

    // No-op shims — the new transport is always-looping, so loop state is
    // not configurable. Kept so call-sites compile during the transition.
    setLoop () { /* always loops */ }
    isLoop () {
        return true;
    }

    updateSong (song) {
        if (!song) return;
        const pb = this._playback();
        if (pb && pb.updateSong) pb.updateSong(song);
    }

    setTrackEffects (trackId, effects) {
        const pb = this._playback();
        if (pb) pb.setTrackEffects(trackId, effects);
    }

    // Used by the editor when a track is added mid-playback (e.g. an AI
    // generate-track finishing while the preview is looping). The scheduler
    // only flattens notes for tracks in its active set, so without this the
    // freshly-committed notes would be silent until the user stopped and
    // restarted.
    activateTrack (trackId) {
        const pb = this._playback();
        if (pb && pb.setTrackActive) pb.setTrackActive(trackId, true, 'now');
    }

    deactivateTrack (trackId) {
        const pb = this._playback();
        if (pb && pb.setTrackActive) pb.setTrackActive(trackId, false, 'now');
    }

    isPlaying () {
        const pb = this._playback();
        return !!(pb && pb.isPlaying() && this._isMyPlayback);
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
        this._isMyPlayback = true;
        pb.playAll({startStep: opts.startStep || 0});
    }

    stop () {
        const pb = this._playback();
        if (pb) pb.stop();
        this._isMyPlayback = false;
    }

    previewNote (opts) {
        const pb = this._playback();
        if (pb && pb.previewNote) pb.previewNote(opts);
    }

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
