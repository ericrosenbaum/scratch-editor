/**
 * Thin facade around the runtime's SongPlayback singleton, exposing the
 * editor-preview-shaped API (play / stop / on / updateSong / setTrackEffects
 * / previewNote). The transport is shared with the extension blocks, so a
 * block that activates a track while the editor's preview is running just
 * keeps everything playing — there's only one transport in the VM.
 *
 * "Play" here means "preview every track of the current song from the cursor"
 * — `playAll()` on the playback singleton. Loop is implicit: the transport
 * always loops, so there is no loop toggle to expose.
 */
class SongPlayer {
    constructor (vm) {
        this.vm = vm;
        // 'start'/'step'/'end' are editor-scoped (gated by _isMyPlayback).
        // 'transportstop' fires UNCONDITIONALLY whenever the shared transport
        // stops (editor, blocks, or a green-flag stop), so the editor can
        // reconcile its play state even if _isMyPlayback drifted out of sync.
        this._listeners = {start: [], step: [], end: [], transportstop: []};
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
            this._fire('transportstop');
        }));
        this._unsubs.push(pb.on('stop', () => {
            if (this._isMyPlayback) {
                this._fire('end');
                this._isMyPlayback = false;
            }
            this._fire('transportstop');
        }));
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

    // Animates the per-track volume gain node directly — no song-state round
    // trip, no scheduler re-flatten, no React props churn. Pair with the
    // Redux commit (which persists the value) so slider drags stay smooth.
    setTrackVolume (trackId, volume) {
        const pb = this._playback();
        if (pb && pb.setTrackVolume) pb.setTrackVolume(trackId, volume);
    }

    // Live tempo change during playback. Routes through the playback's tempo
    // override (the same path the `set tempo` block uses), which re-derives
    // secondsPerStep on the running scheduler WITHOUT tearing it down — so a
    // BPM change mid-playback doesn't restart the transport (no audible gap).
    setTempoOverride (bpm) {
        const pb = this._playback();
        if (pb && pb.setTempoOverride) pb.setTempoOverride(bpm);
    }

    // When the user moves an editor slider for a param that a block has
    // overridden, the editor should "win back" control. The editor calls
    // these to drop the corresponding block override so its value takes
    // effect immediately.
    clearTrackEffectOverride (trackId, param) {
        const pb = this._playback();
        if (pb && pb.clearTrackEffectOverride) pb.clearTrackEffectOverride(trackId, param);
    }

    clearTrackVolumeOverride (trackId) {
        const pb = this._playback();
        if (pb && pb.clearTrackVolumeOverride) pb.clearTrackVolumeOverride(trackId);
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

    // True if the shared transport is running for ANY owner (editor or blocks).
    // Used by the editor to detect "the transport stopped underneath me".
    isTransportRunning () {
        const pb = this._playback();
        return !!(pb && pb.isPlaying());
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
        this._listeners = {start: [], step: [], end: [], transportstop: []};
        this._subscribed = false;
    }
}

export default SongPlayer;
