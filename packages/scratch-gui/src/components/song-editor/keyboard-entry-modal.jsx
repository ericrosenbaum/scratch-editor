import React from 'react';
import PropTypes from 'prop-types';

import Modal from '../../containers/modal.jsx';
import {
    displayNameForTrack,
    normalizeDrumTrack,
    DEFAULT_VELOCITY,
    DEFAULT_SYNTH,
    DRUM_NAMES,
    SYNTH_DRUM_PRESET_NAMES,
    getDrumVoice
} from '../../lib/song-defaults.js';
import PianoKeyboard from './piano-keyboard.jsx';
import DrumPadGrid from './drum-pad-grid.jsx';
import {
    PIANO_KEY_MAP,
    DRUM_LANE_FOR_KEY,
    OCTAVE_DOWN_KEY,
    OCTAVE_UP_KEY,
    SEMITONES_VISIBLE,
    MIN_OCTAVE_BASE,
    MAX_OCTAVE_BASE
} from './key-mapping.js';
import {fillForPitch} from './pitch-colors.js';

import './ai-song-modal.raw.css';

const MIDI_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = midi => `${MIDI_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

const BEATS_PER_BAR = 4;

// Returns true if the user is typing into something we shouldn't capture.
const isTextTarget = target => {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
};

class KeyboardEntryModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            mode: 'step', // 'step' | 'realtime'
            octaveBase: 48, // C3 → upper octave ends at C5
            isRecording: false,
            isCountingIn: false,
            countInBeat: 0,
            playStep: 0,
            stepCursor: Math.max(0, Math.min(props.cursorStep || 0, (props.song.lengthSteps || 32) - 1)),
            recordedNotes: [],
            cursorAdvancePending: false,
            heldVersion: 0 // bumped on every held-keys mutation so React re-renders
        };
        // Map<keyChar | "__mouse_<id>", { pitch?: number, drum?: number, startCtxTime: number }>
        this._heldKeys = new Map();
        this._playStartCtxTime = 0;
        this._countInTimer = null;
        this._unsubStep = null;
        this._unsubEnd = null;
        this._stoppedByEnd = false;
        // Timer that stops recording after one full pass (single-take semantics).
        this._recordStopTimer = null;
        // Tracks the last step index we played a click on, so the quarter-note
        // metronome fires at most once per beat even though 'step' events arrive
        // for every step.
        this._lastClickedBeat = -1;
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleSetModeStep = this.handleSetModeStep.bind(this);
        this.handleSetModeRealtime = this.handleSetModeRealtime.bind(this);
        this.handleOctaveDown = this.handleOctaveDown.bind(this);
        this.handleOctaveUp = this.handleOctaveUp.bind(this);
        this.handleRecord = this.handleRecord.bind(this);
        this.handleStop = this.handleStop.bind(this);
        this.handleDone = this.handleDone.bind(this);
        this.handleCancel = this.handleCancel.bind(this);
        this.handlePianoDown = this.handlePianoDown.bind(this);
        this.handlePianoUp = this.handlePianoUp.bind(this);
        this.handleDrumDown = this.handleDrumDown.bind(this);
        this.handleDrumUp = this.handleDrumUp.bind(this);
    }

    componentDidMount () {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        this._unsubStep = this.props.player.on('step', step => {
            this.setState({playStep: step});
            // Quarter-note metronome click during recording. The transport
            // emits 'step' for every step, so gate on beat boundaries and
            // dedupe via _lastClickedBeat (loop wraps reset it to -1 in
            // _finalizeRecording).
            if (!this.state.isRecording) return;
            const stepsPerBeat = this.props.song.stepsPerBeat || 4;
            if (step % stepsPerBeat !== 0) return;
            const beat = Math.floor(step / stepsPerBeat);
            if (beat === this._lastClickedBeat) return;
            this._lastClickedBeat = beat;
            this.props.player.previewNote({
                kind: 'drum',
                drum: 3, // side stick — quieter than the count-in kick
                velocity: 40,
                durationSec: 0.05
            });
        });
        this._unsubEnd = this.props.player.on('end', () => {
            // Real-time single-pass: when the song completes one play, stop recording.
            if (this.state.isRecording) {
                this._stoppedByEnd = true;
                this._finalizeRecording();
            }
        });
    }

    componentWillUnmount () {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        if (this._unsubStep) this._unsubStep();
        if (this._unsubEnd) this._unsubEnd();
        if (this._countInTimer) {
            this._countInTimer.clear();
            this._countInTimer = null;
        }
        if (this._recordStopTimer) {
            clearTimeout(this._recordStopTimer);
            this._recordStopTimer = null;
        }
        // Make sure we leave the transport quiet if the modal closes mid-record.
        if (this.props.player.isPlaying && this.props.player.isPlaying()) {
            this.props.player.stop();
        }
    }

    _audioContext () {
        const vm = this.props.vm;
        const engine = vm && vm.runtime && vm.runtime.audioEngine;
        return (engine && engine.audioContext) || null;
    }

    _secondsPerStep () {
        const tempo = this.props.song.tempo || 120;
        const spb = this.props.song.stepsPerBeat || 4;
        return (60 / tempo) / spb;
    }

    _track () {
        // Use the index-based lookup so we always see the live track.
        const tracks = (this.props.song.tracks || []);
        return tracks[this.props.trackIdx] || null;
    }

    _isDrum () {
        const t = this._track();
        // synthDrum uses the same lane-based pad entry as sampled drums.
        return t && (t.kind === 'drum' || t.kind === 'synthDrum');
    }

    _isSynthDrum () {
        const t = this._track();
        return t && t.kind === 'synthDrum';
    }

    _drumLanes () {
        const raw = this._track();
        if (!raw) return [];
        if (raw.kind === 'synthDrum') return raw.drumLanes || [];
        if (raw.kind !== 'drum') return [];
        const normalized = normalizeDrumTrack(raw);
        return normalized.drumLanes || [];
    }

    // Names for the current track's lane catalog, for pad labels.
    _laneNames () {
        return this._isSynthDrum() ? SYNTH_DRUM_PRESET_NAMES : DRUM_NAMES;
    }

    // --- mode + octave ---

    handleSetModeStep () {
        if (this.state.isRecording || this.state.isCountingIn) return;
        this.setState({mode: 'step'});
    }

    handleSetModeRealtime () {
        if (this.state.isRecording || this.state.isCountingIn) return;
        this.setState({mode: 'realtime'});
    }

    _shiftOctave (delta) {
        this.setState(state => {
            const next = state.octaveBase + (delta * 12);
            const clamped = Math.max(MIN_OCTAVE_BASE, Math.min(MAX_OCTAVE_BASE, next));
            return {octaveBase: clamped};
        });
    }

    handleOctaveDown () {
        this._shiftOctave(-1);
    }

    handleOctaveUp () {
        this._shiftOctave(1);
    }

    // --- preview ---

    _previewPitch (pitch) {
        const track = this._track();
        if (!track) return;
        const opts = {velocity: DEFAULT_VELOCITY, durationSec: 4};
        if (track.kind === 'synth') {
            opts.kind = 'synth';
            opts.synth = track.synth || DEFAULT_SYNTH;
            opts.pitch = pitch;
        } else {
            opts.kind = 'instrument';
            opts.instrument = track.instrument || 1;
            opts.pitch = pitch;
        }
        this.props.player.previewNote(opts);
    }

    _previewDrum (drum) {
        if (this._isSynthDrum()) {
            this.props.player.previewNote({
                kind: 'synthDrum',
                synthDrum: getDrumVoice(this._track(), drum),
                velocity: DEFAULT_VELOCITY
            });
            return;
        }
        this.props.player.previewNote({
            kind: 'drum',
            drum,
            velocity: DEFAULT_VELOCITY,
            durationSec: 0.5
        });
    }

    // --- piano (pitched) entry ---

    _heldPitches () {
        const set = new Set();
        for (const v of this._heldKeys.values()) {
            if (typeof v.pitch === 'number') set.add(v.pitch);
        }
        return set;
    }

    _heldLanes () {
        const set = new Set();
        for (const v of this._heldKeys.values()) {
            if (typeof v.drum === 'number') set.add(v.drum);
        }
        return set;
    }

    _bumpHeld () {
        this.setState(state => ({heldVersion: state.heldVersion + 1}));
    }

    _startPitchNote (key, pitch) {
        if (this._heldKeys.has(key)) return;
        const ctx = this._audioContext();
        const startCtxTime = ctx ? ctx.currentTime : 0;
        this._heldKeys.set(key, {pitch, startCtxTime});
        this._previewPitch(pitch);
        if (this.state.mode === 'step') {
            this._placeNoteAtCursor({pitch});
        }
        this._bumpHeld();
    }

    _endPitchNote (key) {
        const held = this._heldKeys.get(key);
        if (!held) return;
        this._heldKeys.delete(key);
        if (this.state.mode === 'realtime' && this.state.isRecording) {
            this._commitRealtimeNote(held);
        }
        this._maybeAdvanceStepCursor();
        this._bumpHeld();
    }

    _startDrumNote (key, drum) {
        if (this._heldKeys.has(key)) return;
        const ctx = this._audioContext();
        const startCtxTime = ctx ? ctx.currentTime : 0;
        this._heldKeys.set(key, {drum, startCtxTime});
        this._previewDrum(drum);
        if (this.state.mode === 'step') {
            this._placeNoteAtCursor({drum});
        }
        this._bumpHeld();
    }

    _endDrumNote (key) {
        const held = this._heldKeys.get(key);
        if (!held) return;
        this._heldKeys.delete(key);
        if (this.state.mode === 'realtime' && this.state.isRecording) {
            this._commitRealtimeNote(held);
        }
        this._maybeAdvanceStepCursor();
        this._bumpHeld();
    }

    // --- step mode ---

    _placeNoteAtCursor ({pitch, drum}) {
        const lengthSteps = this.props.song.lengthSteps || 32;
        const step = this.state.stepCursor;
        const note = {step, durationSteps: 1, velocity: DEFAULT_VELOCITY};
        if (typeof drum === 'number') note.drum = drum;
        else note.pitch = pitch;
        this.setState(state => {
            // Skip if this exact (step, pitch/drum) already exists in recordedNotes
            // for this session (dedup happens against existing track on commit).
            const dup = state.recordedNotes.some(n => {
                if (n.step !== step) return false;
                if (typeof drum === 'number') return n.drum === drum;
                return n.pitch === pitch;
            });
            if (dup) {
                return {cursorAdvancePending: true};
            }
            return {
                recordedNotes: [...state.recordedNotes, note],
                cursorAdvancePending: true,
                stepCursor: state.stepCursor // keep cursor until release
            };
        });
        // The `% lengthSteps` happens in _maybeAdvanceStepCursor.
        void lengthSteps;
    }

    _maybeAdvanceStepCursor () {
        if (this.state.mode !== 'step') return;
        if (this._heldKeys.size > 0) return;
        if (!this.state.cursorAdvancePending) return;
        const lengthSteps = this.props.song.lengthSteps || 32;
        this.setState(state => ({
            stepCursor: (state.stepCursor + 1) % lengthSteps,
            cursorAdvancePending: false
        }));
    }

    _stepBackspace () {
        this.setState(state => {
            if (state.recordedNotes.length === 0) return null;
            const lengthSteps = this.props.song.lengthSteps || 32;
            return {
                recordedNotes: state.recordedNotes.slice(0, -1),
                stepCursor: (state.stepCursor - 1 + lengthSteps) % lengthSteps,
                cursorAdvancePending: false
            };
        });
    }

    // --- real-time ---

    _commitRealtimeNote (held) {
        const ctx = this._audioContext();
        if (!ctx) return;
        const lengthSteps = this.props.song.lengthSteps || 32;
        const secondsPerStep = this._secondsPerStep();
        const startStep = this.props.cursorStep || 0;
        const startCtxTime = held.startCtxTime;
        const endCtxTime = Math.min(
            ctx.currentTime,
            this._playStartCtxTime + ((lengthSteps - startStep) * secondsPerStep)
        );
        const relStart = Math.max(0, startCtxTime - this._playStartCtxTime);
        const step = startStep + Math.round(relStart / secondsPerStep);
        if (step >= lengthSteps) return;
        let durationSteps = Math.max(1, Math.round((endCtxTime - startCtxTime) / secondsPerStep));
        durationSteps = Math.min(durationSteps, lengthSteps - step);
        const note = {step, durationSteps, velocity: DEFAULT_VELOCITY};
        if (typeof held.drum === 'number') note.drum = held.drum;
        else note.pitch = held.pitch;
        this.setState(state => ({recordedNotes: [...state.recordedNotes, note]}));
    }

    handleRecord () {
        if (this.state.isRecording || this.state.isCountingIn) return;
        const ctx = this._audioContext();
        if (!ctx) return;
        // Clear recording session state and stop any current playback.
        this._heldKeys.clear();
        this._stoppedByEnd = false;
        this._lastClickedBeat = -1;
        this.props.player.stop();
        this.setState({
            recordedNotes: [],
            isCountingIn: true,
            countInBeat: 0
        });
        const secondsPerStep = this._secondsPerStep();
        const stepsPerBeat = this.props.song.stepsPerBeat || 4;
        const secondsPerBeat = stepsPerBeat * secondsPerStep;
        const barSeconds = BEATS_PER_BAR * secondsPerBeat;
        // Schedule four metronome clicks via previewNote (kick on beat 1,
        // side stick on 2/3/4). previewNote starts immediately, so use
        // setTimeout for the subsequent beats.
        const doClick = beat => {
            // Beat 1 (zero-indexed 0) → kick (drum 2). Others → side stick (drum 3).
            const drum = beat === 0 ? 2 : 3;
            this.props.player.previewNote({
                kind: 'drum',
                drum,
                velocity: DEFAULT_VELOCITY,
                durationSec: 0.18
            });
            this.setState({countInBeat: beat});
        };
        // Fire the first click right now.
        doClick(0);
        // Schedule beats 1..3.
        const timers = [];
        for (let i = 1; i < BEATS_PER_BAR; i++) {
            const t = setTimeout(() => doClick(i), i * secondsPerBeat * 1000);
            timers.push(t);
        }
        // After the full bar, start playback and arm the single-pass stop.
        const startTimer = setTimeout(() => {
            this._playStartCtxTime = (this._audioContext() || ctx).currentTime;
            this.setState({isCountingIn: false, isRecording: true, countInBeat: 0});
            const startStep = this.props.cursorStep || 0;
            this.props.player.play(this.props.song, {startStep});
            // The transport always loops, so 'end' won't naturally fire after
            // one pass. Stop recording manually after the song's worth of audio
            // (from startStep through the end of the song) has elapsed. A small
            // tail (one beat) gives held notes room to release at their natural
            // length before we truncate them in _finalizeRecording.
            const lengthSteps = this.props.song.lengthSteps || 32;
            const stepsRemaining = Math.max(1, lengthSteps - startStep);
            const passSeconds = (stepsRemaining * secondsPerStep) + secondsPerBeat;
            this._recordStopTimer = setTimeout(() => {
                this._recordStopTimer = null;
                if (this.state.isRecording) {
                    this._finalizeRecording();
                }
            }, passSeconds * 1000);
        }, barSeconds * 1000);
        timers.push(startTimer);
        this._countInTimer = {clear: () => timers.forEach(clearTimeout)};
    }

    _finalizeRecording () {
        // Drain any held keys → record them with end time = now (truncated).
        for (const [key, held] of this._heldKeys) {
            this._commitRealtimeNote(held);
            void key;
        }
        this._heldKeys.clear();
        if (this._recordStopTimer) {
            clearTimeout(this._recordStopTimer);
            this._recordStopTimer = null;
        }
        this._lastClickedBeat = -1;
        if (!this._stoppedByEnd) this.props.player.stop();
        this.setState({isRecording: false, isCountingIn: false, countInBeat: 0});
        this._bumpHeld();
    }

    handleStop () {
        if (this._countInTimer) {
            this._countInTimer.clear();
            this._countInTimer = null;
        }
        if (this.state.isRecording) {
            this._finalizeRecording();
        } else if (this.state.isCountingIn) {
            this.setState({isCountingIn: false, countInBeat: 0});
        }
    }

    // --- commit + cancel ---

    _mergedNotes () {
        const track = this._track();
        if (!track) return [];
        const recorded = this.state.recordedNotes;
        const existing = (track.notes || []).slice();
        const isDup = (a, b) => {
            if (a.step !== b.step) return false;
            if (track.kind === 'drum' || track.kind === 'synthDrum') return a.drum === b.drum;
            return a.pitch === b.pitch;
        };
        const merged = existing.slice();
        for (const n of recorded) {
            if (!merged.some(m => isDup(n, m))) merged.push(n);
        }
        return merged;
    }

    handleDone () {
        if (this.state.isRecording || this.state.isCountingIn) return;
        if (this.state.recordedNotes.length > 0) {
            this.props.onCommit(this._mergedNotes());
        } else {
            this.props.onCancel();
        }
    }

    handleCancel () {
        if (this.state.isCountingIn) {
            if (this._countInTimer) {
                this._countInTimer.clear();
                this._countInTimer = null;
            }
            this.setState({isCountingIn: false});
        }
        if (this.state.isRecording) {
            // Stop transport but discard recorded notes — treat Cancel as discard.
            if (this._recordStopTimer) {
                clearTimeout(this._recordStopTimer);
                this._recordStopTimer = null;
            }
            this._lastClickedBeat = -1;
            this.props.player.stop();
            this.setState({isRecording: false, recordedNotes: []});
            this._heldKeys.clear();
        }
        this.props.onCancel();
    }

    // --- keyboard handlers ---

    handleKeyDown (e) {
        if (isTextTarget(e.target)) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return; // let ⌘Z etc through
        const key = (e.key || '').toLowerCase();
        if (!key) return;
        // Octave shift.
        if (key === OCTAVE_DOWN_KEY) {
            e.preventDefault();
            this.handleOctaveDown();
            return;
        }
        if (key === OCTAVE_UP_KEY) {
            e.preventDefault();
            this.handleOctaveUp();
            return;
        }
        // Backspace in step mode = remove last placed note.
        if (key === 'backspace' && this.state.mode === 'step') {
            e.preventDefault();
            this._stepBackspace();
            return;
        }
        // Filter auto-repeat.
        if (this._heldKeys.has(key)) {
            e.preventDefault();
            return;
        }
        if (this._isDrum()) {
            const laneIdx = DRUM_LANE_FOR_KEY[key];
            if (typeof laneIdx !== 'number') return;
            const lanes = this._drumLanes();
            const drum = lanes[laneIdx];
            if (typeof drum !== 'number') return;
            e.preventDefault();
            this._startDrumNote(key, drum);
        } else {
            const offset = PIANO_KEY_MAP[key];
            if (typeof offset !== 'number') return;
            const pitch = this.state.octaveBase + offset;
            if (pitch < 0 || pitch > 127) return;
            e.preventDefault();
            this._startPitchNote(key, pitch);
        }
    }

    handleKeyUp (e) {
        if (isTextTarget(e.target)) return;
        const key = (e.key || '').toLowerCase();
        if (!key || !this._heldKeys.has(key)) return;
        if (this._isDrum()) {
            this._endDrumNote(key);
        } else {
            this._endPitchNote(key);
        }
    }

    // --- mouse handlers (proxy from keyboard / pad components) ---

    handlePianoDown (pitch) {
        const key = `__mouse_p_${pitch}`;
        this._startPitchNote(key, pitch);
    }

    handlePianoUp (pitch) {
        const key = `__mouse_p_${pitch}`;
        this._endPitchNote(key);
    }

    handleDrumDown (drum) {
        const key = `__mouse_d_${drum}`;
        this._startDrumNote(key, drum);
    }

    handleDrumUp (drum) {
        const key = `__mouse_d_${drum}`;
        this._endDrumNote(key);
    }

    // --- render helpers ---

    _renderModeToggle () {
        const {mode, isRecording, isCountingIn} = this.state;
        const disabled = isRecording || isCountingIn;
        return (
            <div className="kbe-mode-toggle">
                <button
                    type="button"
                    className={`kbe-mode-btn ${mode === 'step' ? 'is-active' : ''}`}
                    onClick={this.handleSetModeStep}
                    disabled={disabled}
                >Step</button>
                <button
                    type="button"
                    className={`kbe-mode-btn ${mode === 'realtime' ? 'is-active' : ''}`}
                    onClick={this.handleSetModeRealtime}
                    disabled={disabled}
                >Real-time</button>
            </div>
        );
    }

    _renderOctaveControls () {
        if (this._isDrum()) return null;
        const {octaveBase} = this.state;
        const lowLabel = noteName(octaveBase);
        const highLabel = noteName(octaveBase + SEMITONES_VISIBLE);
        return (
            <div className="kbe-octave-controls">
                <button
                    type="button"
                    className="kbe-octave-btn"
                    onClick={this.handleOctaveDown}
                    disabled={octaveBase <= MIN_OCTAVE_BASE}
                    title="Shift octave down ([)"
                >− Oct</button>
                <span className="kbe-octave-label">{`${lowLabel} – ${highLabel}`}</span>
                <button
                    type="button"
                    className="kbe-octave-btn"
                    onClick={this.handleOctaveUp}
                    disabled={octaveBase >= MAX_OCTAVE_BASE}
                    title="Shift octave up (])"
                >+ Oct</button>
            </div>
        );
    }

    _renderTransport () {
        const {mode, isRecording, isCountingIn} = this.state;
        if (mode !== 'realtime') return null;
        const recording = isRecording || isCountingIn;
        return (
            <div className="kbe-record-row">
                {recording ? (
                    <button
                        type="button"
                        className="kbe-record-btn recording"
                        onClick={this.handleStop}
                    >Stop</button>
                ) : (
                    <button
                        type="button"
                        className="kbe-record-btn"
                        onClick={this.handleRecord}
                    >● Record</button>
                )}
                {isCountingIn ? (
                    <span className="kbe-count-in-overlay">
                        {`Count-in: ${this.state.countInBeat + 1}/${BEATS_PER_BAR}`}
                    </span>
                ) : null}
                {isRecording ? (
                    <span className="kbe-record-status">Recording…</span>
                ) : null}
            </div>
        );
    }

    _renderMiniTimeline () {
        const {mode, stepCursor, recordedNotes} = this.state;
        if (mode !== 'step') return null;
        const lengthSteps = this.props.song.lengthSteps || 32;
        const stepsPerBeat = this.props.song.stepsPerBeat || 4;
        const isDrum = this._isDrum();
        return (
            <div className="kbe-mini-timeline">
                {Array.from({length: lengthSteps}).map((_, i) => (
                    <div
                        key={`tick-${i}`}
                        className={`kbe-tick ${i % stepsPerBeat === 0 ? 'accent' : ''}`}
                        style={{left: `${(i / lengthSteps) * 100}%`}}
                    />
                ))}
                {recordedNotes.map((n, i) => {
                    const color = isDrum ? '#4FB8E9' : fillForPitch(n.pitch);
                    return (
                        <div
                            key={`dot-${i}`}
                            className="kbe-dot"
                            style={{
                                left: `${(n.step / lengthSteps) * 100}%`,
                                background: color
                            }}
                        />
                    );
                })}
                <div
                    className="kbe-cursor"
                    style={{left: `${(stepCursor / lengthSteps) * 100}%`}}
                />
            </div>
        );
    }

    render () {
        const track = this._track();
        if (!track) return null;
        const trackName = displayNameForTrack(track);
        const isDrum = this._isDrum();
        const heldPitches = this._heldPitches();
        const heldLanes = this._heldLanes();
        const disableDone = this.state.isRecording || this.state.isCountingIn;
        const modeHelp = this.state.mode === 'step' ?
            'Press keys to place notes at the cursor. Hold multiple keys for chords. Backspace removes the last note.' :
            'Click Record for a 1-bar count-in, then play. A quiet click ticks every beat; recording stops after one pass through the song.';
        return (
            <Modal
                className="ai-song-modal kbe-modal"
                contentLabel={`Keyboard Entry — ${trackName}`}
                id="keyboardEntryModal"
                onRequestClose={disableDone ? null : this.handleCancel}
            >
                <div className="ai-song-modal-body kbe-body">
                    <h2 className="ai-song-modal-title">
                        {`Keyboard Entry — ${trackName}`}
                    </h2>
                    <div className="kbe-toolbar">
                        {this._renderModeToggle()}
                        {this._renderOctaveControls()}
                    </div>
                    <div className="kbe-help">{modeHelp}</div>
                    {this._renderTransport()}
                    {this._renderMiniTimeline()}
                    {isDrum ? (
                        <DrumPadGrid
                            lanes={this._drumLanes()}
                            names={this._laneNames()}
                            heldLanes={heldLanes}
                            onLaneDown={this.handleDrumDown}
                            onLaneUp={this.handleDrumUp}
                        />
                    ) : (
                        <PianoKeyboard
                            octaveBase={this.state.octaveBase}
                            heldPitches={heldPitches}
                            onPitchDown={this.handlePianoDown}
                            onPitchUp={this.handlePianoUp}
                        />
                    )}
                    <div className="ai-song-modal-buttons kbe-buttons">
                        <button
                            type="button"
                            className="ai-song-modal-cancel"
                            onClick={this.handleCancel}
                        >Cancel</button>
                        <button
                            type="button"
                            className="ai-song-modal-generate"
                            disabled={disableDone}
                            onClick={this.handleDone}
                        >Done</button>
                    </div>
                </div>
            </Modal>
        );
    }
}

KeyboardEntryModal.propTypes = {
    song: PropTypes.object.isRequired,
    trackIdx: PropTypes.number.isRequired,
    cursorStep: PropTypes.number,
    vm: PropTypes.object.isRequired,
    player: PropTypes.object.isRequired,
    onCommit: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
};

export default KeyboardEntryModal;
