import React from 'react';
import PropTypes from 'prop-types';

import TrackRow from './track-row.jsx';
import NumericMetaField from './numeric-meta-field.jsx';
import {noteKey} from './piano-roll-grid.jsx';
import {drumNoteKey} from './drum-grid.jsx';
import AiEditTrackModal from './ai-edit-track-modal.jsx';
import AiGenerateTrackModal from './ai-generate-track-modal.jsx';
import SongPlayer from '../../lib/song-player.js';
import {createBlankTrack} from '../../lib/song-defaults.js';
import {editTrackWithPrompt, generateTrackWithPrompt, SongAiError} from '../../lib/song-ai.js';

import './song-editor.raw.css';

const keyOfNote = (track, note) =>
    (track.kind === 'drum' ? drumNoteKey(note) : noteKey(note));

class SongEditor extends React.Component {
    constructor (props) {
        super(props);
        const firstTrackId = ((props.song.tracks || [])[0] || {}).trackId || null;
        this.state = {
            playStep: -1,
            playing: false,
            loop: false,
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
            aiGenerateError: null
        };
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
        this.handleLoopToggle = this.handleLoopToggle.bind(this);
        this.handleNameChange = this.handleNameChange.bind(this);
        this.handleTempoChange = this.handleTempoChange.bind(this);
        this.handleLengthChange = this.handleLengthChange.bind(this);
        this.handleAddInstrumentTrack = this.handleAddInstrumentTrack.bind(this);
        this.handleAddDrumTrack = this.handleAddDrumTrack.bind(this);
        this.handleSelectionDelete = this.handleSelectionDelete.bind(this);
        this.handleSelectionCopy = this.handleSelectionCopy.bind(this);
        this.handleSelectionCut = this.handleSelectionCut.bind(this);
        this.handleSelectionPaste = this.handleSelectionPaste.bind(this);
        this.handleOpenAiEdit = this.handleOpenAiEdit.bind(this);
        this.handleCloseAiEdit = this.handleCloseAiEdit.bind(this);
        this.handleApplyAiEdit = this.handleApplyAiEdit.bind(this);
        this.handleOpenAiGenerateInstrument = this.handleOpenAiGenerateInstrument.bind(this);
        this.handleOpenAiGenerateDrum = this.handleOpenAiGenerateDrum.bind(this);
        this.handleCloseAiGenerate = this.handleCloseAiGenerate.bind(this);
        this.handleApplyAiGenerate = this.handleApplyAiGenerate.bind(this);
        this.handleUndo = this.handleUndo.bind(this);
        this.handleRedo = this.handleRedo.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleSetCursor = this.handleSetCursor.bind(this);
        this.handleResetCursor = this.handleResetCursor.bind(this);
        this.handlePreviewNote = this.handlePreviewNote.bind(this);
    }

    componentDidMount () {
        this._unsubStep = this.player.on('step', step => this.setState({playStep: step}));
        this._unsubEnd = this.player.on('end', () => this.setState({playing: false, playStep: -1}));
        this._unsubStart = this.player.on('start', () => this.setState({playing: true}));
        window.addEventListener('keydown', this.handleKeyDown);
    }

    componentWillUnmount () {
        this.player.stop();
        if (this._unsubStep) this._unsubStep();
        if (this._unsubEnd) this._unsubEnd();
        if (this._unsubStart) this._unsubStart();
        if (this.player.dispose) this.player.dispose();
        window.removeEventListener('keydown', this.handleKeyDown);
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

    handleLoopToggle () {
        this.setState(state => {
            const loop = !state.loop;
            this.player.setLoop(loop);
            return {loop};
        });
    }

    handleNameChange (e) {
        this._pushHistory();
        this.props.onRename(e.target.value);
    }

    handleTempoChange (tempo) {
        const clamped = Math.max(20, Math.min(500, parseInt(tempo, 10) || 120));
        if (clamped === (this.props.song.tempo || 120)) return;
        this._commit({tempo: clamped});
        // If the user changes BPM during playback, restart the scheduler at
        // the current step so the new tempo takes effect immediately. The
        // running scheduler captures `secondsPerStep` from its own song
        // reference, so a state-only update wouldn't reach it.
        if (this.state.playing) {
            const updatedSong = {...this.props.song, tempo: clamped};
            const resumeStep = this.state.playStep >= 0 ?
                this.state.playStep :
                (this.state.cursorStep || 0);
            this.player.play(updatedSong, {startStep: resumeStep});
        }
    }

    handleLengthChange (lengthSteps) {
        const clamped = Math.max(4, Math.min(128, parseInt(lengthSteps, 10) || 32));
        if (clamped === (this.props.song.lengthSteps || 32)) return;
        const tracks = (this.props.song.tracks || []).map(t => ({
            ...t,
            notes: (t.notes || []).filter(n => n.step < clamped)
        }));
        this._commit({lengthSteps: clamped, tracks});
        // Notes may have been culled; clear selection to avoid stale keys.
        this.setState({selectedKeys: new Set()});
    }

    handleAddInstrumentTrack () {
        // Track display name is derived from the instrument selection now,
        // so we just append a blank track and let the UI label it.
        const track = createBlankTrack('instrument');
        this._commit({tracks: [...(this.props.song.tracks || []), track]});
        this.setState({editingTrackId: track.trackId, selectedKeys: new Set()});
    }

    handleAddDrumTrack () {
        const track = createBlankTrack('drum');
        this._commit({tracks: [...(this.props.song.tracks || []), track]});
        this.setState({editingTrackId: track.trackId, selectedKeys: new Set()});
    }

    updateTrack (trackIdx, updatedTrack) {
        const prev = (this.props.song.tracks || [])[trackIdx];
        const tracks = (this.props.song.tracks || []).slice();
        tracks[trackIdx] = updatedTrack;
        this._commit({tracks});
        // When only the track's effect values changed, push them to the live
        // audio chain so a slider drag during playback is audible immediately
        // (no scheduler restart, no audio glitch).
        if (prev && prev.trackId === updatedTrack.trackId &&
            prev.effects !== updatedTrack.effects) {
            this.player.setTrackEffects(updatedTrack.trackId, updatedTrack.effects || {});
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
        if (clipboard.kind !== track.kind) return;

        const lengthSteps = this.props.song.lengthSteps || 32;
        const existingNotes = (track.notes || []).slice();
        const newKeys = new Set();
        const isDup = (note) => {
            if (track.kind === 'drum') {
                return existingNotes.some(n => n.step === note.step);
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

    async handleApplyAiEdit (prompt) {
        const idx = this.state.aiEditTrackIdx;
        const song = this.props.song;
        if (idx === null || !song || !song.tracks || !song.tracks[idx]) return;
        this.setState({aiEditBusy: true, aiEditError: null});
        try {
            const newTrack = await editTrackWithPrompt({prompt, song, trackIndex: idx});
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

    handleOpenAiGenerateInstrument () {
        this.setState({aiGenerateKind: 'instrument', aiGenerateBusy: false, aiGenerateError: null});
    }

    handleOpenAiGenerateDrum () {
        this.setState({aiGenerateKind: 'drum', aiGenerateBusy: false, aiGenerateError: null});
    }

    handleCloseAiGenerate () {
        if (this.state.aiGenerateBusy) return;
        this.setState({aiGenerateKind: null, aiGenerateBusy: false, aiGenerateError: null});
    }

    async handleApplyAiGenerate (prompt) {
        const kind = this.state.aiGenerateKind;
        if (!kind) return;
        this.setState({aiGenerateBusy: true, aiGenerateError: null});
        try {
            const newTrack = await generateTrackWithPrompt({
                prompt,
                song: this.props.song,
                kind
            });
            // Append the new track to the current song. We re-read props.song
            // here because the user may have made other edits while waiting.
            const current = this.props.song;
            const tracks = [...((current && current.tracks) || []), newTrack];
            this._commit({tracks});
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

    renderSelectionToolbar () {
        const hasSelection = this.state.selectedKeys.size > 0;
        const hasClipboard = !!(this.state.clipboard && this.state.clipboard.notes && this.state.clipboard.notes.length > 0);
        const track = this._editingTrack();
        const pasteAllowed = hasClipboard && track && this.state.clipboard.kind === track.kind;
        return (
            <div className="selection-toolbar">
                <button
                    type="button"
                    onClick={this.handleSelectionCut}
                    disabled={!hasSelection}
                    title="Cut selected notes (⌘X)"
                    aria-label="Cut"
                >Cut</button>
                <button
                    type="button"
                    onClick={this.handleSelectionCopy}
                    disabled={!hasSelection}
                    title="Copy selected notes (⌘C)"
                    aria-label="Copy"
                >Copy</button>
                <button
                    type="button"
                    onClick={this.handleSelectionPaste}
                    disabled={!pasteAllowed}
                    title="Paste notes from clipboard (⌘V)"
                    aria-label="Paste"
                >Paste</button>
                <button
                    type="button"
                    className="selection-delete"
                    onClick={this.handleSelectionDelete}
                    disabled={!hasSelection}
                    title="Delete selected notes"
                    aria-label="Delete selected notes"
                >Delete</button>
            </div>
        );
    }

    render () {
        const {song} = this.props;
        const {playStep, playing, loop, cursorStep, editingTrackId, selectedKeys, aiEditTrackIdx} = this.state;
        const tracks = song.tracks || [];
        const aiEditTrack = aiEditTrackIdx !== null ? tracks[aiEditTrackIdx] : null;
        const canUndo = this._undoStack.length > 0;
        const canRedo = this._redoStack.length > 0;

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
                            title={playing ? 'Stop (rewind to start)' : 'Play'}
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
                        <button
                            type="button"
                            className={`transport-btn loop ${loop ? 'is-on' : ''}`}
                            onClick={this.handleLoopToggle}
                            aria-pressed={loop}
                            aria-label={loop ? 'Loop on' : 'Loop off'}
                            title={loop ? 'Loop: on' : 'Loop: off'}
                        >
                            <svg
                                viewBox="0 0 16 16"
                                width="14"
                                height="14"
                                aria-hidden="true"
                            ><path
                                d="M4 4.5h6.5a3 3 0 0 1 0 6H9"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                            /><path
                                    d="M11 6.5L13 4.5L11 2.5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.6"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                /><path
                                d="M12 11.5H5.5a3 3 0 0 1 0-6H7"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                            /><path
                                    d="M5 9.5L3 11.5L5 13.5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.6"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
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
                        <label className="song-meta-field song-meta-name">
                            <span className="song-meta-label">Song</span>
                            <input
                                type="text"
                                value={song.name || ''}
                                onChange={this.handleNameChange}
                                aria-label="Song name"
                                placeholder="Untitled"
                            />
                        </label>
                        <NumericMetaField
                            label="BPM"
                            value={song.tempo || 120}
                            min={20}
                            max={500}
                            onCommit={this.handleTempoChange}
                        />
                        <NumericMetaField
                            label="Steps"
                            value={song.lengthSteps || 32}
                            min={4}
                            max={128}
                            sliderStep={4}
                            onCommit={this.handleLengthChange}
                        />
                    </div>
                    {this.renderSelectionToolbar()}
                </div>
                <div className="song-editor-tracks">
                    {tracks.map((track, idx) => (
                        <TrackRow
                            key={track.trackId || idx}
                            track={track}
                            lengthSteps={song.lengthSteps || 32}
                            stepsPerBeat={song.stepsPerBeat || 4}
                            playStep={playStep}
                            cursorStep={cursorStep}
                            isEditing={editingTrackId === track.trackId}
                            isFirst={idx === 0}
                            isLast={idx === tracks.length - 1}
                            selectedKeys={editingTrackId === track.trackId ? selectedKeys : new Set()}
                            onUpdate={updated => this.updateTrack(idx, updated)}
                            onDelete={() => this.deleteTrack(idx)}
                            onToggleEdit={() => this.toggleEdit(track.trackId)}
                            onSelectionChange={keys => this.handleSelectionChange(keys)}
                            onMoveUp={() => this._moveTrack(idx, idx - 1)}
                            onMoveDown={() => this._moveTrack(idx, idx + 1)}
                            onMoveTop={() => this._moveTrack(idx, 0)}
                            onMoveBottom={() => this._moveTrack(idx, tracks.length - 1)}
                            onAiEdit={() => this.handleOpenAiEdit(idx)}
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
            </div>
        );
    }
}

SongEditor.propTypes = {
    song: PropTypes.object.isRequired,
    vm: PropTypes.object.isRequired,
    onChange: PropTypes.func.isRequired,
    onRename: PropTypes.func.isRequired
};

export default SongEditor;
