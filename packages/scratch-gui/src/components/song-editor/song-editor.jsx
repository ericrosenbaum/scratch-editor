import React from 'react';
import PropTypes from 'prop-types';

import TrackRow from './track-row.jsx';
import NumericMetaField from './numeric-meta-field.jsx';
import {noteKey} from './piano-roll-grid.jsx';
import {drumNoteKey} from './drum-grid.jsx';
import AiEditTrackModal from './ai-edit-track-modal.jsx';
import AiGenerateTrackModal from './ai-generate-track-modal.jsx';
import AiSongModal from './ai-song-modal.jsx';
import KeyboardEntryModal from './keyboard-entry-modal.jsx';
import SongLibrary from '../../containers/song-library.jsx';
import SongPlayer from '../../lib/song-player.js';
import {handleFileUpload} from '../../lib/file-uploader.js';
import {createBlankTrack, displayNameForTrack, unusedTrackName} from '../../lib/song-defaults.js';
import {reconcileTrackForSong, songFromLibraryItem} from '../../lib/song-library/import.js';
import {editTrackWithPrompt, generateSongFromPrompt, generateTrackWithPrompt, SongAiError} from '../../lib/song-ai.js';
import {
    SCALE_LABELS,
    PITCH_CLASS_NAMES,
    DEFAULT_ROOT_PITCH,
    DEFAULT_SCALE_TYPE_LEGACY,
    MIN_PITCH,
    MAX_PITCH,
    MIN_LENGTH_STEPS,
    MAX_LENGTH_STEPS,
    transposeNotes,
    snapNotesToScale
} from '../../lib/scale-utils.js';

import './song-editor.raw.css';

const keyOfNote = (track, note) =>
    ((track.kind === 'drum' || track.kind === 'synthDrum') ? drumNoteKey(note) : noteKey(note));

// Synth and instrument tracks both store pitched notes ({step, pitch, ...}),
// so the clipboard travels freely between them. Drum and synthDrum tracks use a
// (drum, step) addressing scheme with no pitch — and their `drum` indexes
// different catalogs (sampled drum names vs synth-drum presets) — so paste only
// flows within the exact same kind for those.
const clipboardCompatible = (clipKind, trackKind) => {
    if (clipKind === trackKind) return true;
    const pitched = k => k === 'synth' || k === 'instrument';
    return pitched(clipKind) && pitched(trackKind);
};

class SongEditor extends React.Component {
    constructor (props) {
        super(props);
        const firstTrackId = ((props.song.tracks || [])[0] || {}).trackId || null;
        this.state = {
            playStep: -1,
            playing: false,
            // The "cursor" / playhead position when not playing. Drives the
            // step at which Play begins and at which Paste lands its first
            // note. Click on a grid cell to move it.
            cursorStep: 0,
            editingTrackId: firstTrackId,
            // Selection only ever applies to the editing track.
            selectedKeys: new Set(),
            // Clipboard holds snapshots of notes (with their kind), so paste works
            // across tracks of compatible kind.
            clipboard: null,
            // AI edit modal state. aiEditTrackIdx === null means the modal is closed.
            aiEditTrackIdx: null,
            aiEditBusy: false,
            aiEditError: null,
            // AI generate-track modal state. aiGenerateKind === null means closed.
            aiGenerateKind: null,
            aiGenerateBusy: false,
            aiGenerateError: null,
            // AI generate-whole-song modal state.
            aiSongOpen: false,
            aiSongBusy: false,
            aiSongError: null,
            // Keyboard-entry modal: index of the track being edited, or null.
            keyEntryTrackIdx: null,
            // Song library browser: null (closed), 'track' (add a track), or
            // 'song' (start from a section). Each opens the shared library
            // container filtered to that item type.
            songLibraryMode: null,
            // MIDI import: busy while parsing a chosen .mid; error holds a
            // user-facing message when a file can't be imported.
            midiImporting: false,
            midiImportError: null
        };
        // Hidden <input type="file"> for MIDI import, clicked programmatically.
        this.midiInputRef = React.createRef();
        // Undo/redo history stack of song snapshots. The current song is held
        // in props (owned by the parent), so we record snapshots *before* each
        // commit and step the props.song forward via onChange on undo/redo.
        // Stacks hold serialised song JSON strings so they can't be mutated.
        this._undoStack = [];
        this._redoStack = [];
        this._undoCap = 100;
        this.player = new SongPlayer(props.vm);
        this.handlePlay = this.handlePlay.bind(this);
        this.handlePause = this.handlePause.bind(this);
        this.handleTempoChange = this.handleTempoChange.bind(this);
        this.handleLengthChange = this.handleLengthChange.bind(this);
        this.handleBarsChange = this.handleBarsChange.bind(this);
        this.handleRootPitchChange = this.handleRootPitchChange.bind(this);
        this.handleScaleTypeChange = this.handleScaleTypeChange.bind(this);
        this.handleRootPitchClassChange = this.handleRootPitchClassChange.bind(this);
        this.handleRootOctaveChange = this.handleRootOctaveChange.bind(this);
        this.handleScaleSelectChange = this.handleScaleSelectChange.bind(this);
        this.handleAddInstrumentTrack = this.handleAddInstrumentTrack.bind(this);
        this.handleAddDrumTrack = this.handleAddDrumTrack.bind(this);
        this.handleAddSynthTrack = this.handleAddSynthTrack.bind(this);
        this.handleAddSynthDrumTrack = this.handleAddSynthDrumTrack.bind(this);
        this.handleSelectionDelete = this.handleSelectionDelete.bind(this);
        this.handleSelectionCopy = this.handleSelectionCopy.bind(this);
        this.handleSelectionCut = this.handleSelectionCut.bind(this);
        this.handleSelectionPaste = this.handleSelectionPaste.bind(this);
        this.handleOpenAiEdit = this.handleOpenAiEdit.bind(this);
        this.handleCloseAiEdit = this.handleCloseAiEdit.bind(this);
        this.handleApplyAiEdit = this.handleApplyAiEdit.bind(this);
        this.handleOpenKeyboardEntry = this.handleOpenKeyboardEntry.bind(this);
        this.handleCloseKeyboardEntry = this.handleCloseKeyboardEntry.bind(this);
        this.handleCommitKeyboardEntry = this.handleCommitKeyboardEntry.bind(this);
        this.handleOpenAiGenerateInstrument = this.handleOpenAiGenerateInstrument.bind(this);
        this.handleOpenAiGenerateDrum = this.handleOpenAiGenerateDrum.bind(this);
        this.handleOpenAiGenerateSynth = this.handleOpenAiGenerateSynth.bind(this);
        this.handleOpenAiGenerateSynthDrum = this.handleOpenAiGenerateSynthDrum.bind(this);
        this.handleCloseAiGenerate = this.handleCloseAiGenerate.bind(this);
        this.handleApplyAiGenerate = this.handleApplyAiGenerate.bind(this);
        this.handleOpenAiSong = this.handleOpenAiSong.bind(this);
        this.handleCloseAiSong = this.handleCloseAiSong.bind(this);
        this.handleApplyAiSong = this.handleApplyAiSong.bind(this);
        this.handleOpenTrackLibrary = this.handleOpenTrackLibrary.bind(this);
        this.handleOpenSectionLibrary = this.handleOpenSectionLibrary.bind(this);
        this.handleCloseSongLibrary = this.handleCloseSongLibrary.bind(this);
        this.handleAddLibraryTrack = this.handleAddLibraryTrack.bind(this);
        this.handleReplaceWithLibrarySong = this.handleReplaceWithLibrarySong.bind(this);
        this.handleImportMidiClick = this.handleImportMidiClick.bind(this);
        this.handleMidiFileChange = this.handleMidiFileChange.bind(this);
        this.handleDismissMidiError = this.handleDismissMidiError.bind(this);
        this.handleUndo = this.handleUndo.bind(this);
        this.handleRedo = this.handleRedo.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleSetCursor = this.handleSetCursor.bind(this);
        this.handleResetCursor = this.handleResetCursor.bind(this);
        this.handlePreviewNote = this.handlePreviewNote.bind(this);
        this._reconcilePlaying = this._reconcilePlaying.bind(this);
    }

    componentDidMount () {
        this._unsubStep = this.player.on('step', step => this.setState({playStep: step}));
        this._unsubEnd = this.player.on('end', () => this.setState({playing: false, playStep: -1}));
        // Guard against a stale deferred 'start' (the scheduler fires onStart
        // via setTimeout, so it can land after a teardown): only flip to playing
        // if the transport is actually still ours and running.
        this._unsubStart = this.player.on('start', () => {
            if (this.player.isPlaying()) this.setState({playing: true});
        });
        // Whenever the shared transport stops for ANY reason — a green-flag
        // stop, a `stop all tracks` block, the scheduler idling out, or our own
        // stop — reconcile our play state against the authoritative VM state.
        // This is what un-sticks the play button if the event bookkeeping ever
        // drifts (the historical "stuck in playing" bug).
        this._unsubTransportStop = this.player.on('transportstop', this._reconcilePlaying);
        window.addEventListener('keydown', this.handleKeyDown);
    }

    componentWillUnmount () {
        this.player.stop();
        if (this._unsubStep) this._unsubStep();
        if (this._unsubEnd) this._unsubEnd();
        if (this._unsubStart) this._unsubStart();
        if (this._unsubTransportStop) this._unsubTransportStop();
        if (this.player.dispose) this.player.dispose();
        window.removeEventListener('keydown', this.handleKeyDown);
    }

    // Derive play state from the authoritative VM transport rather than
    // trusting paired start/end events. Called on every transport-stop signal.
    _reconcilePlaying () {
        const playing = this.player.isPlaying();
        if (playing !== this.state.playing) {
            this.setState({playing, playStep: playing ? this.state.playStep : -1});
        }
    }

    componentDidUpdate (prevProps) {
        if (prevProps.song && this.props.song && prevProps.song.songId !== this.props.song.songId) {
            this.player.stop();
            const firstTrack = (this.props.song.tracks || [])[0];
            this.setState({
                playing: false,
                playStep: -1,
                editingTrackId: firstTrack ? firstTrack.trackId : null,
                selectedKeys: new Set()
            });
            // Clear history when switching songs — undo across songs would be
            // surprising (and trying to restore a song that no longer exists
            // by id would silently no-op).
            this._undoStack = [];
            this._redoStack = [];
            this.forceUpdate();
        } else if (this.state.playing && prevProps.song !== this.props.song) {
            // Same song, but content changed during playback. Push the new
            // reference to the player so the scheduler's next loop wrap (or
            // current iteration's remaining lookahead) picks up the edit.
            this.player.updateSong(this.props.song);
        }
    }

    _pushHistory () {
        const snapshot = JSON.stringify(this.props.song);
        const top = this._undoStack[this._undoStack.length - 1];
        if (top === snapshot) return;
        this._undoStack.push(snapshot);
        if (this._undoStack.length > this._undoCap) this._undoStack.shift();
        // Any new edit invalidates the redo stack.
        this._redoStack.length = 0;
    }

    _commit (patch) {
        this._pushHistory();
        const updated = {...this.props.song, ...patch};
        this.props.onChange(updated);
    }

    handleUndo () {
        if (this._undoStack.length === 0) return;
        const current = JSON.stringify(this.props.song);
        const prev = this._undoStack.pop();
        this._redoStack.push(current);
        if (this._redoStack.length > this._undoCap) this._redoStack.shift();
        try {
            const parsed = JSON.parse(prev);
            // Selection refers to the editing track's notes; after a history
            // jump those keys may not map to anything sensible.
            this.setState({selectedKeys: new Set()});
            this.props.onChange(parsed);
        } catch (e) {
            // Snapshot corrupted; drop it.
        }
        this.forceUpdate();
    }

    handleRedo () {
        if (this._redoStack.length === 0) return;
        const current = JSON.stringify(this.props.song);
        const next = this._redoStack.pop();
        this._undoStack.push(current);
        if (this._undoStack.length > this._undoCap) this._undoStack.shift();
        try {
            const parsed = JSON.parse(next);
            this.setState({selectedKeys: new Set()});
            this.props.onChange(parsed);
        } catch (e) {
            // Snapshot corrupted; drop it.
        }
        this.forceUpdate();
    }

    handleKeyDown (e) {
        // Only respond when the song editor is on screen and focus isn't in a
        // text field — typing into a name input shouldn't trigger undo.
        const target = e.target;
        const tag = target && target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (target && target.isContentEditable)) {
            return;
        }
        const root = this._rootEl;
        if (!root || !root.isConnected) return;
        const meta = e.metaKey || e.ctrlKey;
        if (!meta && e.key === ' ') {
            // Space toggles play/stop. Skip when a modal owns the keyboard
            // (the keyboard-entry modal records notes; the others own focus)
            // or when a focused button/select would also react to Space.
            if (tag === 'BUTTON' || tag === 'SELECT') return;
            if (this.state.aiEditTrackIdx !== null || this.state.aiGenerateKind ||
                this.state.aiSongOpen || this.state.keyEntryTrackIdx !== null ||
                this.state.songLibraryMode) {
                return;
            }
            e.preventDefault();
            this.handlePlay();
            return;
        }
        if (!meta && (e.key === 'Backspace' || e.key === 'Delete')) {
            if (this.state.selectedKeys.size === 0) return;
            e.preventDefault();
            this.handleSelectionDelete();
            return;
        }
        if (!meta) return;
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
            e.preventDefault();
            this.handleUndo();
        } else if ((key === 'z' && e.shiftKey) || key === 'y') {
            e.preventDefault();
            this.handleRedo();
        }
    }

    _editingTrackIdx () {
        return (this.props.song.tracks || []).findIndex(t => t.trackId === this.state.editingTrackId);
    }

    _editingTrack () {
        const idx = this._editingTrackIdx();
        return idx >= 0 ? this.props.song.tracks[idx] : null;
    }

    handlePlay () {
        if (this.state.playing) {
            // Click while playing means "stop" — halt playback and rewind the
            // playhead to the start, so the next Play starts from the
            // beginning. To pause without losing position, use the Pause
            // button to the right.
            this.player.stop();
            this.setState({playing: false, playStep: -1, cursorStep: 0});
        } else {
            this.player.play(this.props.song, {startStep: this.state.cursorStep || 0});
        }
    }

    handlePause () {
        // Halt playback while preserving the playhead position as the cursor,
        // so the next Play continues from the same spot.
        if (!this.state.playing) return;
        this._pauseAndCapture();
    }

    _pauseAndCapture () {
        const currentStep = this.state.playStep;
        this.player.stop();
        if (typeof currentStep === 'number' && currentStep >= 0) {
            // Schedule the cursor update after the player's 'end' fires (which
            // resets playStep to -1). setState merges with later updates.
            this.setState({cursorStep: currentStep, playStep: -1});
        }
    }

    handleResetCursor () {
        this.player.stop();
        this.setState({cursorStep: 0, playStep: -1});
    }

    handleSetCursor (step) {
        const lengthSteps = (this.props.song && this.props.song.lengthSteps) || 32;
        const clamped = Math.max(0, Math.min(lengthSteps - 1, Math.round(step)));
        this.setState({cursorStep: clamped});
    }

    handlePreviewNote (opts) {
        // opts: {kind, instrument?, drum?, pitch?, velocity?}
        this.player.previewNote(opts);
    }

    handleTempoChange (tempo) {
        const clamped = Math.max(20, Math.min(500, parseInt(tempo, 10) || 120));
        if (clamped === (this.props.song.tempo || 120)) return;
        this._commit({tempo: clamped});
        // If the user changes BPM during playback, push the new tempo to the
        // RUNNING scheduler live instead of restarting it. Restarting (the old
        // behavior) tore down and rebuilt the whole transport — an audible gap
        // on every change. setTempoOverride re-derives secondsPerStep on the
        // fly with no teardown, so playback stays continuous.
        if (this.state.playing) {
            this.player.setTempoOverride(clamped);
        }
    }

    handleLengthChange (lengthSteps) {
        const clamped = Math.max(MIN_LENGTH_STEPS, Math.min(MAX_LENGTH_STEPS, parseInt(lengthSteps, 10) || 32));
        if (clamped === (this.props.song.lengthSteps || 32)) return;
        const tracks = (this.props.song.tracks || []).map(t => ({
            ...t,
            notes: (t.notes || []).filter(n => n.step < clamped)
        }));
        this._commit({lengthSteps: clamped, tracks});
        // Notes may have been culled; clear selection to avoid stale keys.
        this.setState({selectedKeys: new Set()});
    }

    // Length is presented in the UI as bars (4/4 assumed). Convert the user's
    // bar count to lengthSteps using the song's stepsPerBeat * 4 beats/bar.
    handleBarsChange (bars) {
        const stepsPerBar = (this.props.song.stepsPerBeat || 4) * 4;
        this.handleLengthChange(parseInt(bars, 10) * stepsPerBar);
    }

    handleRootPitchChange (newRootPitch) {
        const oldRoot = (typeof this.props.song.rootPitch === 'number') ?
            this.props.song.rootPitch : DEFAULT_ROOT_PITCH;
        const clamped = Math.max(MIN_PITCH, Math.min(MAX_PITCH,
            parseInt(newRootPitch, 10) || DEFAULT_ROOT_PITCH));
        if (clamped === oldRoot) return;
        const tracks = transposeNotes(this.props.song.tracks || [], clamped - oldRoot);
        this._commit({rootPitch: clamped, tracks});
        this.setState({selectedKeys: new Set()});
    }

    handleScaleTypeChange (newScaleType) {
        const oldScale = this.props.song.scaleType || DEFAULT_SCALE_TYPE_LEGACY;
        if (newScaleType === oldScale) return;
        const rootPitch = (typeof this.props.song.rootPitch === 'number') ?
            this.props.song.rootPitch : DEFAULT_ROOT_PITCH;
        const tracks = snapNotesToScale(this.props.song.tracks || [], rootPitch, newScaleType);
        this._commit({scaleType: newScaleType, tracks});
        this.setState({selectedKeys: new Set()});
    }

    handleRootPitchClassChange (e) {
        const newPc = parseInt(e.target.value, 10);
        const root = (typeof this.props.song.rootPitch === 'number') ?
            this.props.song.rootPitch : DEFAULT_ROOT_PITCH;
        const oct = Math.floor(root / 12) - 1;
        this.handleRootPitchChange(((oct + 1) * 12) + newPc);
    }

    handleRootOctaveChange (newOct) {
        const root = (typeof this.props.song.rootPitch === 'number') ?
            this.props.song.rootPitch : DEFAULT_ROOT_PITCH;
        const pc = ((root % 12) + 12) % 12;
        this.handleRootPitchChange(((newOct + 1) * 12) + pc);
    }

    handleScaleSelectChange (e) {
        this.handleScaleTypeChange(e.target.value);
    }

    _existingTrackNames () {
        return (this.props.song.tracks || []).map(t => displayNameForTrack(t));
    }

    handleAddInstrumentTrack () {
        const blank = createBlankTrack('instrument');
        const base = displayNameForTrack(blank);
        blank.name = unusedTrackName(base, this._existingTrackNames());
        this._commit({tracks: [...(this.props.song.tracks || []), blank]});
        this.setState({editingTrackId: blank.trackId, selectedKeys: new Set()});
    }

    handleAddDrumTrack () {
        const blank = createBlankTrack('drum');
        const base = displayNameForTrack(blank);
        blank.name = unusedTrackName(base, this._existingTrackNames());
        this._commit({tracks: [...(this.props.song.tracks || []), blank]});
        this.setState({editingTrackId: blank.trackId, selectedKeys: new Set()});
    }

    handleAddSynthTrack () {
        const blank = createBlankTrack('synth');
        const base = displayNameForTrack(blank);
        blank.name = unusedTrackName(base, this._existingTrackNames());
        this._commit({tracks: [...(this.props.song.tracks || []), blank]});
        this.setState({editingTrackId: blank.trackId, selectedKeys: new Set()});
    }

    handleAddSynthDrumTrack () {
        const blank = createBlankTrack('synthDrum');
        const base = displayNameForTrack(blank);
        blank.name = unusedTrackName(base, this._existingTrackNames());
        this._commit({tracks: [...(this.props.song.tracks || []), blank]});
        this.setState({editingTrackId: blank.trackId, selectedKeys: new Set()});
    }

    renameTrack (trackIdx, newName) {
        const tracks = this.props.song.tracks || [];
        const target = tracks[trackIdx];
        if (!target) return;
        const trimmed = (newName || '').trim();
        if (!trimmed) return;
        // Predict the de-duplicated name the VM will settle on and bail when it
        // matches the current display name. This ignores empty/no-op edits and,
        // crucially, makes BufferedInput's Enter-then-blur double submit
        // idempotent — otherwise the second call would push a redundant
        // (post-rename) undo snapshot. Uses the same dedupe algorithm as the VM.
        const used = tracks
            .filter((_, i) => i !== trackIdx)
            .map(t => displayNameForTrack(t));
        if (unusedTrackName(trimmed, used) === displayNameForTrack(target)) return;
        // Snapshot the pre-rename song so the rename participates in the
        // editor's undo/redo like every other edit. The VM then owns trimming,
        // de-duplication, and rewriting the song blocks that reference this
        // track; it emits SONGS_CHANGED, which re-renders from runtime.song.
        this._pushHistory();
        this.props.vm.renameTrack(target.trackId, trimmed);
    }

    // Cheap, audio-only application of a track edit to the running scheduler:
    // the editor "wins back" any block override for the changed param, then
    // animates the audio node directly so the change is heard immediately
    // (no song-state round-trip, no scheduler re-flatten). Shared by the
    // committing updateTrack and the drag-time liveUpdateTrack.
    _applyLiveAudio (prev, updatedTrack) {
        if (!prev || prev.trackId !== updatedTrack.trackId) return;
        if (prev.effects !== updatedTrack.effects) {
            const prevFx = prev.effects || {};
            const nextFx = updatedTrack.effects || {};
            for (const param of ['reverb', 'delay', 'filter', 'pan', 'distortion']) {
                if (prevFx[param] !== nextFx[param]) {
                    this.player.clearTrackEffectOverride(updatedTrack.trackId, param);
                }
            }
            this.player.setTrackEffects(updatedTrack.trackId, nextFx);
        }
        if (prev.volume !== updatedTrack.volume) {
            this.player.clearTrackVolumeOverride(updatedTrack.trackId);
            this.player.setTrackVolume(updatedTrack.trackId, updatedTrack.volume);
        }
    }

    updateTrack (trackIdx, updatedTrack) {
        const prev = (this.props.song.tracks || [])[trackIdx];
        const tracks = (this.props.song.tracks || []).slice();
        tracks[trackIdx] = updatedTrack;
        this._commit({tracks});
        this._applyLiveAudio(prev, updatedTrack);
    }

    // Live (slider-drag) track update: apply only the cheap audio change to the
    // running scheduler — NO _commit, so no per-pixel undo push or Redux/render
    // churn (the cause of slider hitches during playback). The single commit
    // happens on release via updateTrack. Synth / synthDrum params are re-read
    // per note from the live song, so also swap the scheduler's song reference;
    // that's cheap because the note list is unchanged (updateSong skips the
    // re-flatten).
    liveUpdateTrack (trackIdx, updatedTrack) {
        const prev = (this.props.song.tracks || [])[trackIdx];
        if (!prev || prev.trackId !== updatedTrack.trackId) return;
        this._applyLiveAudio(prev, updatedTrack);
        if (this.state.playing) {
            const tracks = (this.props.song.tracks || []).slice();
            tracks[trackIdx] = updatedTrack;
            this.player.updateSong({...this.props.song, tracks});
        }
    }

    deleteTrack (trackIdx) {
        const removed = (this.props.song.tracks || [])[trackIdx];
        const tracks = (this.props.song.tracks || []).filter((_, i) => i !== trackIdx);
        this._commit({tracks});
        if (removed && removed.trackId === this.state.editingTrackId) {
            const next = tracks[Math.min(trackIdx, tracks.length - 1)];
            this.setState({editingTrackId: next ? next.trackId : null, selectedKeys: new Set()});
        }
    }

    toggleEdit (trackId) {
        this.setState(state => ({
            editingTrackId: state.editingTrackId === trackId ? null : trackId,
            selectedKeys: new Set()
        }));
    }

    _moveTrack (fromIdx, toIdx) {
        const tracks = (this.props.song.tracks || []).slice();
        if (fromIdx < 0 || fromIdx >= tracks.length) return;
        const clamped = Math.max(0, Math.min(tracks.length - 1, toIdx));
        if (clamped === fromIdx) return;
        const [moved] = tracks.splice(fromIdx, 1);
        tracks.splice(clamped, 0, moved);
        this._commit({tracks});
    }

    handleSelectionChange (keys) {
        // keys is a Set passed from the grid component.
        this.setState({selectedKeys: keys instanceof Set ? keys : new Set(keys)});
    }

    _selectedNotesFromTrack (track) {
        if (!track) return [];
        return (track.notes || []).filter(n => this.state.selectedKeys.has(keyOfNote(track, n)));
    }

    handleSelectionDelete () {
        const idx = this._editingTrackIdx();
        const track = this._editingTrack();
        if (!track) return;
        const notes = (track.notes || []).filter(n => !this.state.selectedKeys.has(keyOfNote(track, n)));
        this.updateTrack(idx, {...track, notes});
        this.setState({selectedKeys: new Set()});
    }

    handleSelectionCopy () {
        const track = this._editingTrack();
        if (!track) return;
        const notes = this._selectedNotesFromTrack(track);
        if (notes.length === 0) return;
        // Store the source kind so paste into a mismatched-kind track can be rejected
        // (or projected appropriately).
        this.setState({clipboard: {kind: track.kind, notes: notes.map(n => ({...n}))}});
    }

    handleSelectionCut () {
        this.handleSelectionCopy();
        this.handleSelectionDelete();
    }

    handleSelectionPaste () {
        const clipboard = this.state.clipboard;
        if (!clipboard) return;
        const idx = this._editingTrackIdx();
        const track = this._editingTrack();
        if (!track) return;
        if (!clipboardCompatible(clipboard.kind, track.kind)) return;

        const lengthSteps = this.props.song.lengthSteps || 32;
        const existingNotes = (track.notes || []).slice();
        const newKeys = new Set();
        const isDup = (note) => {
            if (track.kind === 'drum' || track.kind === 'synthDrum') {
                return existingNotes.some(n => n.step === note.step && (n.drum || 1) === (note.drum || 1));
            }
            return existingNotes.some(n => n.step === note.step && n.pitch === note.pitch);
        };
        // Translate the clipboard so its earliest note lands at cursorStep.
        // This makes paste DAW-like: cut a phrase, move the cursor, paste —
        // the phrase appears starting at the cursor.
        const minClipStep = clipboard.notes.reduce(
            (acc, n) => Math.min(acc, n.step), Infinity);
        const target = this.state.cursorStep || 0;
        const offset = Number.isFinite(minClipStep) ? (target - minClipStep) : 0;
        for (const n of clipboard.notes) {
            const copy = {...n, step: n.step + offset};
            if (copy.step < 0) continue;
            if (copy.step >= lengthSteps) continue;
            if (isDup(copy)) continue;
            existingNotes.push(copy);
            newKeys.add(keyOfNote(track, copy));
        }
        this.updateTrack(idx, {...track, notes: existingNotes});
        this.setState({selectedKeys: newKeys});
    }

    handleOpenAiEdit (trackIdx) {
        // Snapshot the index of the track to edit. We capture by index (not by
        // trackId) because that's what we send to the model and what we'll write
        // back to. The Apply handler verifies the index is still valid against
        // the current props.song before committing.
        this.setState({aiEditTrackIdx: trackIdx, aiEditError: null, aiEditBusy: false});
    }

    handleCloseAiEdit () {
        if (this.state.aiEditBusy) return;
        this.setState({aiEditTrackIdx: null, aiEditError: null, aiEditBusy: false});
    }

    async handleApplyAiEdit (prompt, providerId, editParams) {
        const idx = this.state.aiEditTrackIdx;
        const song = this.props.song;
        if (idx === null || !song || !song.tracks || !song.tracks[idx]) return;
        this.setState({aiEditBusy: true, aiEditError: null});
        try {
            const newTrack = await editTrackWithPrompt({prompt, editParams, song, trackIndex: idx, providerId});
            // Re-check the index still maps to a track of the same kind in case
            // the song was reordered while the request was in flight.
            const current = this.props.song;
            const target = current && current.tracks && current.tracks[idx];
            if (!target) {
                throw new SongAiError('Track no longer exists.', 'STALE_TRACK');
            }
            // updateTrack merges the model output with the original track's
            // identifying fields (trackId/muted) via sanitizeTrack already, so
            // we can write straight through.
            this.updateTrack(idx, newTrack);
            this.setState({
                aiEditTrackIdx: null,
                aiEditBusy: false,
                aiEditError: null,
                // Clear selection because the note keys have all changed.
                selectedKeys: new Set()
            });
        } catch (err) {
            const message = err instanceof SongAiError ?
                err.message :
                (err && err.message) || 'Something went wrong editing the track.';
            this.setState({aiEditBusy: false, aiEditError: message});
        }
    }

    handleOpenKeyboardEntry (trackIdx) {
        // Stop any active playback so the modal owns the transport during recording.
        this.player.stop();
        this.setState({keyEntryTrackIdx: trackIdx});
    }

    handleCloseKeyboardEntry () {
        this.setState({keyEntryTrackIdx: null});
    }

    handleCommitKeyboardEntry (mergedNotes) {
        const idx = this.state.keyEntryTrackIdx;
        const tracks = this.props.song.tracks || [];
        const track = idx !== null ? tracks[idx] : null;
        if (track) {
            this.updateTrack(idx, {...track, notes: mergedNotes});
        }
        this.setState({keyEntryTrackIdx: null, selectedKeys: new Set()});
    }

    handleOpenAiGenerateInstrument () {
        this.setState({aiGenerateKind: 'instrument', aiGenerateBusy: false, aiGenerateError: null});
    }

    handleOpenAiGenerateDrum () {
        this.setState({aiGenerateKind: 'drum', aiGenerateBusy: false, aiGenerateError: null});
    }

    handleOpenAiGenerateSynth () {
        this.setState({aiGenerateKind: 'synth', aiGenerateBusy: false, aiGenerateError: null});
    }

    handleOpenAiGenerateSynthDrum () {
        this.setState({aiGenerateKind: 'synthDrum', aiGenerateBusy: false, aiGenerateError: null});
    }

    handleCloseAiGenerate () {
        if (this.state.aiGenerateBusy) return;
        this.setState({aiGenerateKind: null, aiGenerateBusy: false, aiGenerateError: null});
    }

    async handleApplyAiGenerate (prompt, providerId) {
        const kind = this.state.aiGenerateKind;
        if (!kind) return;
        this.setState({aiGenerateBusy: true, aiGenerateError: null});
        try {
            const newTrack = await generateTrackWithPrompt({
                prompt,
                song: this.props.song,
                kind,
                providerId
            });
            // Append the new track to the current song. We re-read props.song
            // here because the user may have made other edits while waiting.
            const current = this.props.song;
            const existing = (current && current.tracks) || [];
            const base = displayNameForTrack(newTrack);
            const named = {
                ...newTrack,
                name: unusedTrackName(base, existing.map(t => displayNameForTrack(t)))
            };
            const tracks = [...existing, named];
            this._commit({tracks});
            // If the editor preview is running, the scheduler only flattens
            // notes from tracks it considers active. New trackIds aren't in
            // that set, so without this the new notes would be silent until
            // the user stopped and started again.
            if (this.state.playing) {
                this.player.activateTrack(named.trackId);
            }
            this.setState({
                aiGenerateKind: null,
                aiGenerateBusy: false,
                aiGenerateError: null,
                editingTrackId: newTrack.trackId,
                selectedKeys: new Set()
            });
        } catch (err) {
            const message = err instanceof SongAiError ?
                err.message :
                (err && err.message) || 'Something went wrong generating the track.';
            this.setState({aiGenerateBusy: false, aiGenerateError: message});
        }
    }

    handleOpenAiSong () {
        this.setState({aiSongOpen: true, aiSongBusy: false, aiSongError: null});
    }

    handleCloseAiSong () {
        if (this.state.aiSongBusy) return;
        this.setState({aiSongOpen: false, aiSongBusy: false, aiSongError: null});
    }

    async handleApplyAiSong (prompt, providerId) {
        this.setState({aiSongBusy: true, aiSongError: null});
        try {
            const generated = await generateSongFromPrompt({
                prompt,
                providerId,
                fallbackName: 'AI Song'
            });
            // Replace the current song's musical content but keep its
            // songId so undo can step back to the prior song.
            const patch = {
                name: generated.name,
                tempo: generated.tempo,
                lengthSteps: generated.lengthSteps,
                stepsPerBeat: generated.stepsPerBeat || 4,
                rootPitch: generated.rootPitch,
                scaleType: generated.scaleType,
                tracks: generated.tracks
            };
            this._commit(patch);
            const firstTrack = generated.tracks[0];
            // Mid-playback, every new trackId is unknown to the scheduler's
            // active set; activate them all so the AI song plays right away.
            // (updateSong already prunes the old trackIds since they're no
            // longer in the song.)
            if (this.state.playing) {
                for (const t of generated.tracks) {
                    this.player.activateTrack(t.trackId);
                }
            }
            this.setState({
                aiSongOpen: false,
                aiSongBusy: false,
                aiSongError: null,
                editingTrackId: firstTrack ? firstTrack.trackId : null,
                selectedKeys: new Set()
            });
        } catch (err) {
            const message = err instanceof SongAiError ?
                err.message :
                (err && err.message) || 'Something went wrong generating the song.';
            this.setState({aiSongBusy: false, aiSongError: message});
        }
    }

    // Stop editor playback before opening a library so the shared transport is
    // free for hover previews (and the editor playhead doesn't keep running
    // behind the full-screen modal).
    handleOpenTrackLibrary () {
        this.player.stop();
        this.setState({songLibraryMode: 'track', playing: false, playStep: -1});
    }

    handleOpenSectionLibrary () {
        this.player.stop();
        this.setState({songLibraryMode: 'song', playing: false, playStep: -1});
    }

    handleCloseSongLibrary () {
        // Defensive: the container also stops preview on unmount/select.
        this.props.vm.stopSongPreview();
        this.setState({songLibraryMode: null});
    }

    // Layer a single library track onto the current song, reconciled to its
    // key/scale/length. Mirrors handleApplyAiGenerate (naming, activate,
    // editing focus) so it flows through undo/redo via _commit.
    handleAddLibraryTrack (item) {
        const current = this.props.song;
        const track = reconcileTrackForSong(item, current);
        const existing = (current && current.tracks) || [];
        const named = {
            ...track,
            name: unusedTrackName(displayNameForTrack(track), existing.map(t => displayNameForTrack(t)))
        };
        this._commit({tracks: [...existing, named]});
        if (this.state.playing) {
            this.player.activateTrack(named.trackId);
        }
        this.setState({
            songLibraryMode: null,
            editingTrackId: named.trackId,
            selectedKeys: new Set()
        });
    }

    // Replace the whole arrangement with a freshly-built song (from a library
    // section, an AI generation, or a MIDI import). Adopts the new song's
    // key/scale/tempo/length but keeps the existing songId so undo can step
    // back. Returns the first track (for setting editing focus).
    _replaceSong (generated) {
        this._commit({
            name: generated.name,
            tempo: generated.tempo,
            lengthSteps: generated.lengthSteps,
            stepsPerBeat: generated.stepsPerBeat || 4,
            rootPitch: generated.rootPitch,
            scaleType: generated.scaleType,
            tracks: generated.tracks
        });
        if (this.state.playing) {
            for (const t of generated.tracks) {
                this.player.activateTrack(t.trackId);
            }
        }
        return (generated.tracks && generated.tracks[0]) || null;
    }

    // Start a new arrangement from a library section. Adopts the section's
    // key/scale/tempo/length (musically correct) but keeps the existing songId
    // so undo can step back. Mirrors handleApplyAiSong.
    handleReplaceWithLibrarySong (item) {
        const firstTrack = this._replaceSong(songFromLibraryItem(item));
        this.setState({
            songLibraryMode: null,
            editingTrackId: firstTrack ? firstTrack.trackId : null,
            selectedKeys: new Set()
        });
    }

    // Open the OS file picker for a .mid file. Parsing/conversion happens in
    // handleMidiFileChange once a file is chosen.
    handleImportMidiClick () {
        this.player.stop();
        this.setState({playing: false, playStep: -1, midiImportError: null});
        if (this.midiInputRef.current) {
            this.midiInputRef.current.click();
        }
    }

    // Read the chosen .mid into an ArrayBuffer, convert it to a song (the
    // converter and its midi-file dependency are code-split via dynamic import
    // so they only load on first use), then replace the current song. Like the
    // library/AI paths, this flows through _commit so it is undoable.
    handleMidiFileChange (e) {
        const input = e.target;
        if (!input || !input.files || input.files.length === 0) return;
        this.setState({midiImporting: true, midiImportError: null});
        handleFileUpload(
            input,
            (buffer, fileType, fileName) => {
                import(/* webpackChunkName: "midi-import" */ '../../lib/song-library/midi-to-song.js')
                    .then(({parseMidiToSong}) => {
                        const song = parseMidiToSong(buffer, fileName);
                        const firstTrack = this._replaceSong(song);
                        this.setState({
                            midiImporting: false,
                            editingTrackId: firstTrack ? firstTrack.trackId : null,
                            selectedKeys: new Set()
                        });
                    })
                    .catch(err => {
                        this.setState({
                            midiImporting: false,
                            midiImportError: (err && err.message) || 'Could not import that MIDI file.'
                        });
                    });
            },
            () => {
                this.setState({midiImporting: false, midiImportError: 'Could not read that file.'});
            }
        );
    }

    handleDismissMidiError () {
        this.setState({midiImportError: null});
    }

    renderSelectionToolbar () {
        const hasSelection = this.state.selectedKeys.size > 0;
        const hasClipboard = !!(this.state.clipboard && this.state.clipboard.notes && this.state.clipboard.notes.length > 0);
        const track = this._editingTrack();
        const pasteAllowed = hasClipboard && track &&
            clipboardCompatible(this.state.clipboard.kind, track.kind);
        return (
            <div className="selection-toolbar">
                <button
                    type="button"
                    onClick={this.handleSelectionCut}
                    disabled={!hasSelection}
                    title="Cut selected notes (⌘X)"
                    aria-label="Cut"
                ><span className="selection-toolbar-label">Cut</span></button>
                <button
                    type="button"
                    onClick={this.handleSelectionCopy}
                    disabled={!hasSelection}
                    title="Copy selected notes (⌘C)"
                    aria-label="Copy"
                ><span className="selection-toolbar-label">Copy</span></button>
                <button
                    type="button"
                    onClick={this.handleSelectionPaste}
                    disabled={!pasteAllowed}
                    title="Paste notes from clipboard (⌘V)"
                    aria-label="Paste"
                ><span className="selection-toolbar-label">Paste</span></button>
                <button
                    type="button"
                    className="selection-delete"
                    onClick={this.handleSelectionDelete}
                    disabled={!hasSelection}
                    title="Delete selected notes (Delete or Backspace)"
                    aria-label="Delete selected notes"
                ><span className="selection-toolbar-label">Delete</span></button>
            </div>
        );
    }

    render () {
        const {song} = this.props;
        const {
            playStep, playing, cursorStep, editingTrackId, selectedKeys,
            aiEditTrackIdx, keyEntryTrackIdx
        } = this.state;
        const tracks = song.tracks || [];
        const aiEditTrack = aiEditTrackIdx !== null ? tracks[aiEditTrackIdx] : null;
        const keyEntryTrack = keyEntryTrackIdx !== null ? tracks[keyEntryTrackIdx] : null;
        const canUndo = this._undoStack.length > 0;
        const canRedo = this._redoStack.length > 0;
        const rootPitch = (typeof song.rootPitch === 'number') ? song.rootPitch : DEFAULT_ROOT_PITCH;
        const rootPitchClass = ((rootPitch % 12) + 12) % 12;
        const rootOctave = Math.floor(rootPitch / 12) - 1;
        const scaleType = song.scaleType || DEFAULT_SCALE_TYPE_LEGACY;

        return (
            <div
                className="song-editor"
                ref={el => {
                    this._rootEl = el;
                }}
            >
                <div className="song-editor-header">
                    <div className="song-editor-transport">
                        <button
                            type="button"
                            className="transport-btn reset"
                            onClick={this.handleResetCursor}
                            disabled={cursorStep === 0 && !playing}
                            aria-label="Reset playhead to start"
                            title="Reset playhead to start"
                        >
                            <svg
                                viewBox="0 0 16 16"
                                width="14"
                                height="14"
                                aria-hidden="true"
                            ><rect
                                x="3"
                                y="3"
                                width="1.6"
                                height="10"
                                rx="0.5"
                                fill="currentColor"
                            /><path
                                    d="M14 3.5v9a.6.6 0 0 1-.94.48L6 8l7.06-4.98A.6.6 0 0 1 14 3.5z"
                                    fill="currentColor"
                                /></svg>
                        </button>
                        <button
                            type="button"
                            className={`transport-btn play ${playing ? 'is-playing' : ''}`}
                            onClick={this.handlePlay}
                            aria-label={playing ? 'Stop' : 'Play'}
                            title={playing ? 'Stop (Space; rewinds to start)' : 'Play (Space)'}
                        >
                            {playing ? (
                                <svg
                                    viewBox="0 0 16 16"
                                    width="14"
                                    height="14"
                                    aria-hidden="true"
                                ><rect
                                    x="3"
                                    y="3"
                                    width="10"
                                    height="10"
                                    rx="1.5"
                                /></svg>
                            ) : (
                                <svg
                                    viewBox="0 0 16 16"
                                    width="14"
                                    height="14"
                                    aria-hidden="true"
                                ><path d="M4 2.5v11a.8.8 0 0 0 1.2.69l9-5.5a.8.8 0 0 0 0-1.38l-9-5.5A.8.8 0 0 0 4 2.5z" /></svg>
                            )}
                        </button>
                        <button
                            type="button"
                            className="transport-btn stop"
                            onClick={this.handlePause}
                            disabled={!playing}
                            aria-label="Pause"
                            title="Pause"
                        >
                            <svg
                                viewBox="0 0 16 16"
                                width="12"
                                height="12"
                                aria-hidden="true"
                            ><rect
                                x="3"
                                y="2"
                                width="3.5"
                                height="12"
                                rx="1"
                                fill="currentColor"
                            /><rect
                                    x="9.5"
                                    y="2"
                                    width="3.5"
                                    height="12"
                                    rx="1"
                                    fill="currentColor"
                                /></svg>
                        </button>
                    </div>
                    <div className="history-group">
                        <button
                            type="button"
                            className="transport-btn history"
                            onClick={this.handleUndo}
                            disabled={!canUndo}
                            aria-label="Undo"
                            title="Undo (⌘Z)"
                        >
                            <svg
                                viewBox="0 0 16 16"
                                width="14"
                                height="14"
                                aria-hidden="true"
                            ><path
                                d="M3.5 6.5h6a3.5 3.5 0 0 1 0 7H7"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                            /><path
                                    d="M6 4L3 6.5L6 9"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.6"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                /></svg>
                        </button>
                        <button
                            type="button"
                            className="transport-btn history"
                            onClick={this.handleRedo}
                            disabled={!canRedo}
                            aria-label="Redo"
                            title="Redo (⌘⇧Z)"
                        >
                            <svg
                                viewBox="0 0 16 16"
                                width="14"
                                height="14"
                                aria-hidden="true"
                            ><path
                                d="M12.5 6.5h-6a3.5 3.5 0 0 0 0 7H9"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                            /><path
                                    d="M10 4L13 6.5L10 9"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.6"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                /></svg>
                        </button>
                    </div>
                    <div className="song-meta">
                        <NumericMetaField
                            label="BPM"
                            value={song.tempo || 120}
                            min={20}
                            max={500}
                            sliderMax={240}
                            onCommit={this.handleTempoChange}
                        />
                        <NumericMetaField
                            label="Bars"
                            value={Math.max(1, Math.round((song.lengthSteps || 32) / ((song.stepsPerBeat || 4) * 4)))}
                            min={1}
                            max={Math.floor(MAX_LENGTH_STEPS / ((song.stepsPerBeat || 4) * 4))}
                            sliderMax={16}
                            sliderStep={1}
                            onCommit={this.handleBarsChange}
                        />
                        <label className="song-meta-field song-meta-field-select">
                            <span className="song-meta-label">Key</span>
                            <select
                                className="song-meta-select"
                                aria-label="Root note"
                                value={rootPitchClass}
                                onChange={this.handleRootPitchClassChange}
                            >
                                {PITCH_CLASS_NAMES.map((name, i) => (
                                    <option
                                        key={i}
                                        value={i}
                                    >{name}</option>
                                ))}
                            </select>
                        </label>
                        <NumericMetaField
                            label="Oct"
                            value={rootOctave}
                            min={1}
                            max={7}
                            onCommit={this.handleRootOctaveChange}
                        />
                        <label className="song-meta-field song-meta-field-select">
                            <span className="song-meta-label">Scale</span>
                            <select
                                className="song-meta-select"
                                aria-label="Scale type"
                                value={scaleType}
                                onChange={this.handleScaleSelectChange}
                            >
                                {SCALE_LABELS.map(s => (
                                    <option
                                        key={s.value}
                                        value={s.value}
                                    >{s.label}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <button
                        type="button"
                        className="library-song"
                        onClick={this.handleOpenSectionLibrary}
                        title="Start from a ready-made section in the library (replaces current song)"
                        aria-label="Start from a section in the library"
                    >
                        <svg
                            viewBox="0 0 16 16"
                            width="13"
                            height="13"
                            aria-hidden="true"
                        ><rect
                            x="2"
                            y="2.5"
                            width="12"
                            height="2.4"
                            rx="0.8"
                            fill="currentColor"
                        /><rect
                            x="2"
                            y="6.8"
                            width="12"
                            height="2.4"
                            rx="0.8"
                            fill="currentColor"
                        /><rect
                            x="2"
                            y="11.1"
                            width="12"
                            height="2.4"
                            rx="0.8"
                            fill="currentColor"
                        /></svg>
                    </button>
                    <button
                        type="button"
                        className="generate-song"
                        onClick={this.handleOpenAiSong}
                        title="Generate a whole song with AI (replaces current song)"
                        aria-label="Generate a whole song with AI"
                    >
                        <svg
                            viewBox="0 0 16 16"
                            width="13"
                            height="13"
                            aria-hidden="true"
                        ><path
                                d="M8 1.5l1.4 3.6L13 6.5l-3.6 1.4L8 11.5 6.6 7.9 3 6.5l3.6-1.4L8 1.5z"
                                fill="currentColor"
                            /><path
                                d="M12.5 11l.7 1.8L15 13.5l-1.8.7-.7 1.8-.7-1.8L10 13.5l1.8-.7z"
                                fill="currentColor"
                            /></svg>
                    </button>
                    <button
                        type="button"
                        className="import-midi"
                        onClick={this.handleImportMidiClick}
                        disabled={this.state.midiImporting}
                        title="Import a MIDI file as a new song (replaces current song)"
                        aria-label="Import a MIDI file"
                    >
                        <svg
                            viewBox="0 0 16 16"
                            width="13"
                            height="13"
                            aria-hidden="true"
                        >
                            <path
                                d="M8 2v6.2M5.4 5.8 8 8.4l2.6-2.6M3 10.8v1.7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1.7"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>
                    <input
                        className="import-midi-input"
                        type="file"
                        accept=".mid,.midi,audio/midi"
                        ref={this.midiInputRef}
                        onChange={this.handleMidiFileChange}
                    />
                    {this.renderSelectionToolbar()}
                </div>
                {this.state.midiImportError ? (
                    <div
                        className="midi-import-error"
                        role="alert"
                    >
                        <span>{this.state.midiImportError}</span>
                        <button
                            type="button"
                            className="midi-import-error-dismiss"
                            onClick={this.handleDismissMidiError}
                            aria-label="Dismiss"
                        >{'×'}</button>
                    </div>
                ) : null}
                <div className="song-editor-tracks">
                    {tracks.map((track, idx) => (
                        <TrackRow
                            key={track.trackId || idx}
                            track={track}
                            lengthSteps={song.lengthSteps || 32}
                            stepsPerBeat={song.stepsPerBeat || 4}
                            rootPitch={rootPitch}
                            scaleType={scaleType}
                            playStep={playStep}
                            cursorStep={cursorStep}
                            isEditing={editingTrackId === track.trackId}
                            isFirst={idx === 0}
                            isLast={idx === tracks.length - 1}
                            selectedKeys={editingTrackId === track.trackId ? selectedKeys : new Set()}
                            onUpdate={updated => this.updateTrack(idx, updated)}
                            onLiveUpdate={updated => this.liveUpdateTrack(idx, updated)}
                            onRename={newName => this.renameTrack(idx, newName)}
                            onDelete={() => this.deleteTrack(idx)}
                            onToggleEdit={() => this.toggleEdit(track.trackId)}
                            onSelectionChange={keys => this.handleSelectionChange(keys)}
                            onMoveUp={() => this._moveTrack(idx, idx - 1)}
                            onMoveDown={() => this._moveTrack(idx, idx + 1)}
                            onMoveTop={() => this._moveTrack(idx, 0)}
                            onMoveBottom={() => this._moveTrack(idx, tracks.length - 1)}
                            onAiEdit={() => this.handleOpenAiEdit(idx)}
                            onKeyboardEntry={() => this.handleOpenKeyboardEntry(idx)}
                            onSetCursor={this.handleSetCursor}
                            onPreviewNote={this.handlePreviewNote}
                        />
                    ))}
                    <div className="track-row-add">
                        <div className="track-row-add-group">
                            <button
                                type="button"
                                className="add-track"
                                onClick={this.handleAddInstrumentTrack}
                            >+ Add Instrument Track</button>
                            <button
                                type="button"
                                className="generate-track"
                                onClick={this.handleOpenAiGenerateInstrument}
                                title="Generate a new instrument track with AI"
                                aria-label="Generate instrument track with AI"
                            >
                                <svg
                                    viewBox="0 0 16 16"
                                    width="13"
                                    height="13"
                                    aria-hidden="true"
                                ><path
                                    d="M8 1.5l1.4 3.6L13 6.5l-3.6 1.4L8 11.5 6.6 7.9 3 6.5l3.6-1.4L8 1.5z"
                                    fill="currentColor"
                                /><path
                                        d="M12.5 11l.7 1.8L15 13.5l-1.8.7-.7 1.8-.7-1.8L10 13.5l1.8-.7z"
                                        fill="currentColor"
                                    /></svg>
                            </button>
                        </div>
                        <div className="track-row-add-group">
                            <button
                                type="button"
                                className="add-track"
                                onClick={this.handleAddDrumTrack}
                            >+ Add Drum Track</button>
                            <button
                                type="button"
                                className="generate-track"
                                onClick={this.handleOpenAiGenerateDrum}
                                title="Generate a new drum track with AI"
                                aria-label="Generate drum track with AI"
                            >
                                <svg
                                    viewBox="0 0 16 16"
                                    width="13"
                                    height="13"
                                    aria-hidden="true"
                                ><path
                                    d="M8 1.5l1.4 3.6L13 6.5l-3.6 1.4L8 11.5 6.6 7.9 3 6.5l3.6-1.4L8 1.5z"
                                    fill="currentColor"
                                /><path
                                        d="M12.5 11l.7 1.8L15 13.5l-1.8.7-.7 1.8-.7-1.8L10 13.5l1.8-.7z"
                                        fill="currentColor"
                                    /></svg>
                            </button>
                        </div>
                        <div className="track-row-add-group">
                            <button
                                type="button"
                                className="add-track"
                                onClick={this.handleAddSynthTrack}
                            >+ Add Synth Track</button>
                            <button
                                type="button"
                                className="generate-track"
                                onClick={this.handleOpenAiGenerateSynth}
                                title="Generate a new synth track with AI"
                                aria-label="Generate synth track with AI"
                            >
                                <svg
                                    viewBox="0 0 16 16"
                                    width="13"
                                    height="13"
                                    aria-hidden="true"
                                ><path
                                    d="M8 1.5l1.4 3.6L13 6.5l-3.6 1.4L8 11.5 6.6 7.9 3 6.5l3.6-1.4L8 1.5z"
                                    fill="currentColor"
                                /><path
                                        d="M12.5 11l.7 1.8L15 13.5l-1.8.7-.7 1.8-.7-1.8L10 13.5l1.8-.7z"
                                        fill="currentColor"
                                    /></svg>
                            </button>
                        </div>
                        <div className="track-row-add-group">
                            <button
                                type="button"
                                className="add-track"
                                onClick={this.handleAddSynthDrumTrack}
                            >+ Add Synth Drum Track</button>
                            <button
                                type="button"
                                className="generate-track"
                                onClick={this.handleOpenAiGenerateSynthDrum}
                                title="Generate a new synth drum track with AI"
                                aria-label="Generate synth drum track with AI"
                            >
                                <svg
                                    viewBox="0 0 16 16"
                                    width="13"
                                    height="13"
                                    aria-hidden="true"
                                ><path
                                    d="M8 1.5l1.4 3.6L13 6.5l-3.6 1.4L8 11.5 6.6 7.9 3 6.5l3.6-1.4L8 1.5z"
                                    fill="currentColor"
                                /><path
                                        d="M12.5 11l.7 1.8L15 13.5l-1.8.7-.7 1.8-.7-1.8L10 13.5l1.8-.7z"
                                        fill="currentColor"
                                    /></svg>
                            </button>
                        </div>
                        <div className="track-row-add-group">
                            <button
                                type="button"
                                className="add-track add-track-library"
                                onClick={this.handleOpenTrackLibrary}
                                title="Browse ready-made tracks and add one to your song"
                            >♪ Add from Library</button>
                        </div>
                    </div>
                </div>
                {aiEditTrack ? (
                    <AiEditTrackModal
                        busy={this.state.aiEditBusy}
                        error={this.state.aiEditError}
                        trackName={aiEditTrack.name}
                        trackKind={aiEditTrack.kind}
                        onCancel={this.handleCloseAiEdit}
                        onApply={this.handleApplyAiEdit}
                    />
                ) : null}
                {this.state.aiGenerateKind ? (
                    <AiGenerateTrackModal
                        busy={this.state.aiGenerateBusy}
                        error={this.state.aiGenerateError}
                        kind={this.state.aiGenerateKind}
                        onCancel={this.handleCloseAiGenerate}
                        onApply={this.handleApplyAiGenerate}
                    />
                ) : null}
                {this.state.aiSongOpen ? (
                    <AiSongModal
                        busy={this.state.aiSongBusy}
                        error={this.state.aiSongError}
                        onCancel={this.handleCloseAiSong}
                        onGenerate={this.handleApplyAiSong}
                    />
                ) : null}
                {keyEntryTrack ? (
                    <KeyboardEntryModal
                        song={song}
                        trackIdx={keyEntryTrackIdx}
                        cursorStep={cursorStep}
                        vm={this.props.vm}
                        player={this.player}
                        onCommit={this.handleCommitKeyboardEntry}
                        onCancel={this.handleCloseKeyboardEntry}
                    />
                ) : null}
                {this.state.songLibraryMode ? (
                    <SongLibrary
                        vm={this.props.vm}
                        itemType={this.state.songLibraryMode}
                        onAddTrack={this.handleAddLibraryTrack}
                        onReplaceSong={this.handleReplaceWithLibrarySong}
                        onRequestClose={this.handleCloseSongLibrary}
                    />
                ) : null}
            </div>
        );
    }
}

SongEditor.propTypes = {
    song: PropTypes.object.isRequired,
    vm: PropTypes.object.isRequired,
    onChange: PropTypes.func.isRequired
};

export default SongEditor;
