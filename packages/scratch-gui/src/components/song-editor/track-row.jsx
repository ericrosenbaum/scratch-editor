import React from 'react';
import PropTypes from 'prop-types';

import PianoRollGrid, {noteKey} from './piano-roll-grid.jsx';
import DrumGrid, {drumNoteKey} from './drum-grid.jsx';
import MiniGrid from './mini-grid.jsx';
import VelocityStrip from './velocity-strip.jsx';
import {computeCellWidth, DEFAULT_CELL_W} from './grid-sizing.js';
import {INSTRUMENT_NAMES, DRUM_NAMES, DEFAULT_VELOCITY, getTrackEffects, displayNameForTrack, SYNTH_PRESETS, DEFAULT_SYNTH, getTrackSynth} from '../../lib/song-defaults.js';

class TrackRow extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            // Width of one step column, derived from the grid container width
            // so a default-length song (32 steps) fits without horizontal
            // scroll. Falls back to the static default until first measure.
            cellWidth: DEFAULT_CELL_W,
            // Height of the visible grid in compact mode, so the mini-grid
            // preview can fill the full row instead of leaving whitespace.
            canvasHeight: 80,
            // Synth tracks: expose only the preset menu by default — the rest
            // of the synth params (oscillators, ADSR, LFO…) are advanced
            // controls that most users won't reach for, so keep them tucked
            // behind a disclosure toggle.
            synthParamsExpanded: false
        };
        this.handleInstrumentChange = this.handleInstrumentChange.bind(this);
        this.handleDrumChange = this.handleDrumChange.bind(this);
        this.handleVolumeChange = this.handleVolumeChange.bind(this);
        this.handleMuteToggle = this.handleMuteToggle.bind(this);
        this.handleSoloToggle = this.handleSoloToggle.bind(this);
        this.handleDelete = this.handleDelete.bind(this);
        this.handleEditToggle = this.handleEditToggle.bind(this);

        this.handleEffectChange = this.handleEffectChange.bind(this);
        this.handleSynthPresetChange = this.handleSynthPresetChange.bind(this);
        this.handleSynthParamChange = this.handleSynthParamChange.bind(this);
        this.handleSynthWaveChange = this.handleSynthWaveChange.bind(this);
        this.handleSynthParamsToggle = this.handleSynthParamsToggle.bind(this);

        this.handleAddNote = this.handleAddNote.bind(this);
        this.handleRemoveNote = this.handleRemoveNote.bind(this);
        this.handleResizeNote = this.handleResizeNote.bind(this);
        this.handleSelectionChange = this.handleSelectionChange.bind(this);
        this.handleUpdateVelocity = this.handleUpdateVelocity.bind(this);
        this.handleMoveSelected = this.handleMoveSelected.bind(this);
        this.handlePreviewPitch = this.handlePreviewPitch.bind(this);
        this._gridRef = React.createRef();
        this._velocityRef = React.createRef();
        this._canvasRef = React.createRef();
        this._syncingScroll = false;
        this.handleGridScroll = this.handleGridScroll.bind(this);
        this.handleVelocityScroll = this.handleVelocityScroll.bind(this);
        this._measureCellWidth = this._measureCellWidth.bind(this);
    }

    componentDidMount () {
        this._attachScrollSync();
        this._measureCellWidth();
        // Listen for container resize so the cell width adapts to layout
        // changes (window resize, panel toggles, etc.). ResizeObserver is
        // available in all evergreen browsers we target.
        if (typeof ResizeObserver !== 'undefined' && this._canvasRef.current) {
            this._resizeObs = new ResizeObserver(() => this._measureCellWidth());
            this._resizeObs.observe(this._canvasRef.current);
        }
    }

    componentDidUpdate (prevProps) {
        if (prevProps.isEditing !== this.props.isEditing) {
            this._attachScrollSync();
            this._measureCellWidth();
        }
        if (prevProps.lengthSteps !== this.props.lengthSteps) {
            this._measureCellWidth();
        }
    }

    componentWillUnmount () {
        this._detachScrollSync();
        if (this._resizeObs) {
            this._resizeObs.disconnect();
            this._resizeObs = null;
        }
    }

    _measureCellWidth () {
        const canvas = this._canvasRef.current;
        if (!canvas) return;
        // Use the visible-area width of the scroll container that contains
        // the grid. We measure the canvas wrapper (parent of grid + velocity
        // strip), which is the column that controls horizontal layout.
        const width = canvas.clientWidth;
        const nextW = computeCellWidth(width, this.props.lengthSteps || 32);
        // Also feed the canvas pixel height to the mini-grid so the compact
        // preview stretches to fill the row instead of being hardcoded short.
        const nextH = canvas.clientHeight || this.state.canvasHeight;
        const patch = {};
        if (nextW !== this.state.cellWidth) patch.cellWidth = nextW;
        if (nextH !== this.state.canvasHeight) patch.canvasHeight = nextH;
        if (Object.keys(patch).length > 0) this.setState(patch);
    }

    _attachScrollSync () {
        this._detachScrollSync();
        const grid = this._gridRef.current;
        const vel = this._velocityRef.current;
        if (!grid || !vel) return;
        grid.addEventListener('scroll', this.handleGridScroll, {passive: true});
        vel.addEventListener('scroll', this.handleVelocityScroll, {passive: true});
        this._attachedGrid = grid;
        this._attachedVel = vel;
    }

    _detachScrollSync () {
        if (this._attachedGrid) {
            this._attachedGrid.removeEventListener('scroll', this.handleGridScroll);
            this._attachedGrid = null;
        }
        if (this._attachedVel) {
            this._attachedVel.removeEventListener('scroll', this.handleVelocityScroll);
            this._attachedVel = null;
        }
    }

    handleGridScroll () {
        if (this._syncingScroll) return;
        const grid = this._gridRef.current;
        const vel = this._velocityRef.current;
        if (!grid || !vel) return;
        if (vel.scrollLeft === grid.scrollLeft) return;
        this._syncingScroll = true;
        vel.scrollLeft = grid.scrollLeft;
        // The matching scroll event from the velocity strip is queued; flip the
        // flag back synchronously after the browser fires it. Using
        // requestAnimationFrame keeps the guard tight without missing real
        // user-driven events.
        requestAnimationFrame(() => { this._syncingScroll = false; });
    }

    handleVelocityScroll () {
        if (this._syncingScroll) return;
        const grid = this._gridRef.current;
        const vel = this._velocityRef.current;
        if (!grid || !vel) return;
        if (grid.scrollLeft === vel.scrollLeft) return;
        this._syncingScroll = true;
        grid.scrollLeft = vel.scrollLeft;
        requestAnimationFrame(() => { this._syncingScroll = false; });
    }

    _updateTrack (patch) {
        this.props.onUpdate({...this.props.track, ...patch});
    }

    handleInstrumentChange (e) {
        this._updateTrack({instrument: parseInt(e.target.value, 10)});
    }

    handleDrumChange (e) {
        // Kept for legacy compatibility (single-lane drum tracks).
        this._updateTrack({drum: parseInt(e.target.value, 10)});
    }

    _drumLanes () {
        const track = this.props.track;
        return Array.isArray(track.drumLanes) && track.drumLanes.length > 0 ?
            track.drumLanes :
            [track.drum || 1];
    }

    handleLaneChange (laneIdx, newDrum) {
        const track = this.props.track;
        const lanes = this._drumLanes().slice();
        const prevDrum = lanes[laneIdx];
        lanes[laneIdx] = newDrum;
        // Re-tag any notes that were on the old lane so they now play the new
        // drum sound. This is what the user expects when they swap a lane's
        // sound: the same hits, just on a different drum.
        const notes = (track.notes || []).map(n =>
            ((n.drum || track.drum || 1) === prevDrum) ? {...n, drum: newDrum} : n
        );
        this._updateTrack({drumLanes: lanes, notes});
    }

    handleAddLane () {
        const lanes = this._drumLanes();
        // Add the first drum not already in the kit; if all 18 are present
        // (unlikely), just append the first one again.
        const unused = [];
        for (let d = 1; d <= DRUM_NAMES.length; d++) {
            if (lanes.indexOf(d) < 0) unused.push(d);
        }
        const newDrum = unused[0] || 1;
        this._updateTrack({drumLanes: [...lanes, newDrum]});
    }

    handleRemoveLane (laneIdx) {
        const track = this.props.track;
        const lanes = this._drumLanes();
        if (lanes.length <= 1) return; // keep at least one lane
        const removed = lanes[laneIdx];
        const newLanes = lanes.filter((_, i) => i !== laneIdx);
        // Drop any notes that were on the removed lane.
        const notes = (track.notes || []).filter(n =>
            (n.drum || track.drum || 1) !== removed
        );
        this._updateTrack({drumLanes: newLanes, notes});
    }

    renderLanePicker () {
        const lanes = this._drumLanes();
        const canRemove = lanes.length > 1;
        return (
            <div className="drum-lane-picker">
                {lanes.map((drum, idx) => (
                    <div
                        className="drum-lane-row"
                        key={`lane-${idx}`}
                    >
                        <select
                            value={drum}
                            onChange={e => this.handleLaneChange(idx, parseInt(e.target.value, 10))}
                            aria-label={`Drum sound for lane ${idx + 1}`}
                        >
                            {DRUM_NAMES.map((name, i) => (
                                <option
                                    key={i + 1}
                                    value={i + 1}
                                >{name}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            className="icon-btn lane-remove-btn"
                            onClick={() => this.handleRemoveLane(idx)}
                            disabled={!canRemove}
                            aria-label="Remove lane"
                            title="Remove lane"
                        >−</button>
                    </div>
                ))}
                <button
                    type="button"
                    className="drum-lane-add"
                    onClick={() => this.handleAddLane()}
                    disabled={lanes.length >= DRUM_NAMES.length}
                >+ Add drum sound</button>
            </div>
        );
    }

    handleVolumeChange (e) {
        this._updateTrack({volume: parseInt(e.target.value, 10)});
    }

    handleEffectChange (name, value) {
        const current = getTrackEffects(this.props.track);
        const next = {...current, [name]: value};
        this._updateTrack({effects: next});
    }

    handleSynthPresetChange (e) {
        const name = e.target.value;
        const preset = SYNTH_PRESETS.find(p => p.name === name);
        if (!preset) return;
        // Overwrite the whole synth bag with the preset's params. The `name`
        // field is a UI label only — tweaking sliders later does not clear it.
        const {name: presetName, ...params} = preset;
        this._updateTrack({synth: {preset: presetName, ...params}});
    }

    handleSynthParamChange (key, value) {
        const current = getTrackSynth(this.props.track);
        this._updateTrack({synth: {...current, [key]: value}});
    }

    handleSynthWaveChange (which, e) {
        this.handleSynthParamChange(which, e.target.value);
    }

    handleSynthParamsToggle () {
        this.setState(state => ({synthParamsExpanded: !state.synthParamsExpanded}));
    }

    handleMuteToggle () {
        this._updateTrack({muted: !this.props.track.muted});
    }

    handleSoloToggle () {
        this._updateTrack({solo: !this.props.track.solo});
    }

    renderSoloButton () {
        const {track} = this.props;
        const isSolo = !!track.solo;
        return (
            <button
                type="button"
                className={`icon-btn track-btn solo-btn ${isSolo ? 'is-solo' : ''}`}
                onClick={this.handleSoloToggle}
                aria-label={isSolo ? 'Unsolo' : 'Solo'}
                aria-pressed={isSolo}
                title={isSolo ? 'Unsolo (play all tracks)' : 'Solo (play only this track)'}
            >S</button>
        );
    }

    handleDelete () {
        this.props.onDelete();
    }

    handleEditToggle () {
        this.props.onToggleEdit();
    }

    handleAddNote (step, pitchOrDrum) {
        const track = this.props.track;
        if (track.kind === 'drum') {
            // Second arg is the drum sound index (the lane that was clicked).
            // Notes are identified by (drum, step), so the same step can have
            // hits across different lanes.
            const drum = pitchOrDrum || 1;
            const exists = (track.notes || []).some(n =>
                n.step === step && (n.drum || track.drum || 1) === drum);
            if (exists) return;
            this._updateTrack({
                notes: [...(track.notes || []), {step, durationSteps: 1, drum, velocity: DEFAULT_VELOCITY}]
            });
            this._preview({drum});
        } else {
            const pitch = pitchOrDrum;
            const exists = (track.notes || []).some(n => n.step === step && n.pitch === pitch);
            if (exists) return;
            this._updateTrack({
                notes: [...(track.notes || []), {step, durationSteps: 1, pitch, velocity: DEFAULT_VELOCITY}]
            });
            this._preview({pitch});
        }
    }

    _preview ({pitch, drum}) {
        if (!this.props.onPreviewNote) return;
        const track = this.props.track;
        if (track.muted) return;
        if (track.kind === 'drum') {
            this.props.onPreviewNote({
                kind: 'drum',
                // Prefer the per-note drum index passed in (the lane clicked);
                // fall back to the track-level legacy drum for single-lane
                // drum tracks.
                drum: drum || track.drum || 1,
                velocity: DEFAULT_VELOCITY
            });
        } else if (track.kind === 'synth') {
            this.props.onPreviewNote({
                kind: 'synth',
                synth: track.synth || DEFAULT_SYNTH,
                pitch,
                velocity: DEFAULT_VELOCITY
            });
        } else {
            this.props.onPreviewNote({
                kind: 'instrument',
                instrument: track.instrument || 1,
                pitch,
                velocity: DEFAULT_VELOCITY
            });
        }
    }

    handleRemoveNote (noteIdx) {
        const notes = (this.props.track.notes || []).slice();
        if (!notes[noteIdx]) return;
        notes.splice(noteIdx, 1);
        this._updateTrack({notes});
    }

    handleResizeNote (noteIdx, newDurationSteps) {
        const notes = (this.props.track.notes || []).slice();
        if (!notes[noteIdx]) return;
        notes[noteIdx] = {...notes[noteIdx], durationSteps: newDurationSteps};
        this._updateTrack({notes});
    }

    handleUpdateVelocity (noteIdx, velocity) {
        const notes = (this.props.track.notes || []).slice();
        if (!notes[noteIdx]) return;
        notes[noteIdx] = {...notes[noteIdx], velocity};
        this._updateTrack({notes});
    }

    handleMoveSelected (deltaStep, deltaPitch) {
        const track = this.props.track;
        const selectedKeys = this.props.selectedKeys;
        if (!selectedKeys || selectedKeys.size === 0) return;
        const lengthSteps = this.props.lengthSteps;
        const isDrum = track.kind === 'drum';
        // Build a key function consistent with the grid (instrument uses pitch_step;
        // drum uses step). The keyOfNote helper from song-editor isn't imported
        // here but we can replicate via the kind.
        const keyOf = isDrum ? (n => `${n.drum || 0}_${n.step}`) : (n => `${n.pitch}_${n.step}`);
        const newNotes = [];
        const newSelectionKeys = new Set();
        const seen = new Set();
        for (const n of (track.notes || [])) {
            const k = keyOf(n);
            if (!selectedKeys.has(k)) {
                newNotes.push(n);
                continue;
            }
            const newStep = n.step + deltaStep;
            const newPitch = isDrum ? n.pitch : (n.pitch + deltaPitch);
            if (newStep < 0 || newStep >= lengthSteps) continue;
            if (!isDrum && (newPitch < 24 || newPitch > 108)) continue;
            const moved = {...n, step: newStep};
            if (!isDrum) moved.pitch = newPitch;
            // De-dupe against earlier kept notes
            const newK = keyOf(moved);
            if (seen.has(newK)) continue;
            seen.add(newK);
            newNotes.push(moved);
            newSelectionKeys.add(newK);
        }
        this._updateTrack({notes: newNotes});
        if (this.props.onSelectionChange) {
            this.props.onSelectionChange(newSelectionKeys);
        }
    }

    handlePreviewPitch (pitch) {
        const track = this.props.track;
        if (track.kind === 'drum') return; // drum has no pitch concept
        this._preview({pitch});
    }

    handleSelectionChange (keys) {
        this.props.onSelectionChange(keys);
    }

    renderEditToggleButton () {
        const {isEditing} = this.props;
        return (
            <button
                type="button"
                className={`edit-toggle-btn ${isEditing ? 'is-editing' : ''}`}
                onClick={this.handleEditToggle}
                aria-label={isEditing ? 'Done editing this track' : 'Edit this track'}
                title={isEditing ? 'Done' : 'Edit'}
            >{isEditing ? 'Done' : 'Edit'}</button>
        );
    }

    renderCompactControls () {
        const {track, isFirst, isLast, onMoveUp, onMoveDown, onMoveTop, onMoveBottom} = this.props;
        return (
            <div className="track-row-controls compact">
                {this.renderNameRow()}
                <div className="actions-row compact-actions">
                    <div className="track-state-group">
                        <button
                            type="button"
                            className={`icon-btn track-btn mute-btn ${track.muted ? 'is-muted' : ''}`}
                            onClick={this.handleMuteToggle}
                            aria-label={track.muted ? 'Muted' : 'Mute'}
                            aria-pressed={!!track.muted}
                            title={track.muted ? 'Unmute' : 'Mute'}
                        >
                            <svg
                                viewBox="0 0 16 16"
                                width="14"
                                height="14"
                                aria-hidden="true"
                            ><path
                                d="M3 6v4h2.5L9 12.5V3.5L5.5 6H3z"
                                fill="currentColor"
                            />{track.muted ? (
                                    <path
                                        d="M11 5l4 4M15 5l-4 4"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.4"
                                        strokeLinecap="round"
                                    />
                                ) : (
                                    <path
                                        d="M11 5.5a3 3 0 0 1 0 5M12.5 4a5 5 0 0 1 0 8"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.3"
                                        strokeLinecap="round"
                                    />
                                )}</svg>
                        </button>
                        {this.renderSoloButton()}
                    </div>
                    <div className="move-stack">
                        <button
                            type="button"
                            className="icon-btn move-btn move-top"
                            onClick={onMoveTop}
                            disabled={isFirst}
                            aria-label="Move track to top"
                            title="Move to top"
                        ><svg
                            viewBox="0 0 16 16"
                            width="11"
                            height="11"
                            aria-hidden="true"
                        ><path
                            d="M3 4h10"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                        /><path
                            d="M4 11l4-4 4 4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        /></svg></button>
                        <button
                            type="button"
                            className="icon-btn move-btn"
                            onClick={onMoveUp}
                            disabled={isFirst}
                            aria-label="Move track up"
                            title="Move up"
                        ><svg
                            viewBox="0 0 16 16"
                            width="11"
                            height="11"
                            aria-hidden="true"
                        ><path
                            d="M3 10l5-5 5 5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        /></svg></button>
                        <button
                            type="button"
                            className="icon-btn move-btn"
                            onClick={onMoveDown}
                            disabled={isLast}
                            aria-label="Move track down"
                            title="Move down"
                        ><svg
                            viewBox="0 0 16 16"
                            width="11"
                            height="11"
                            aria-hidden="true"
                        ><path
                            d="M3 6l5 5 5-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        /></svg></button>
                        <button
                            type="button"
                            className="icon-btn move-btn move-bottom"
                            onClick={onMoveBottom}
                            disabled={isLast}
                            aria-label="Move track to bottom"
                            title="Move to bottom"
                        ><svg
                            viewBox="0 0 16 16"
                            width="11"
                            height="11"
                            aria-hidden="true"
                        ><path
                            d="M3 12h10"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                        /><path
                            d="M4 5l4 4 4-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        /></svg></button>
                    </div>
                    <button
                        type="button"
                        className="icon-btn delete-btn"
                        onClick={this.handleDelete}
                        aria-label="Delete track"
                        title="Delete track"
                    >
                        <svg
                            viewBox="0 0 16 16"
                            width="14"
                            height="14"
                            aria-hidden="true"
                        ><path
                            d="M6.7 2.2a.7 .7 0 0 0-.7 .7V3.5H2.5a.5 .5 0 0 0 0 1h11a.5 .5 0 0 0 0-1H10V2.9a.7 .7 0 0 0-.7-.7zm.3 1.3V2.9a.07 .07 0 0 1 .07-.07h1.86a.07 .07 0 0 1 .07 .07V3.5z"
                            fill="currentColor"
                            fillRule="evenodd"
                        /><path
                            d="M3.4 5.7h9.2l-.7 8.1a1.3 1.3 0 0 1-1.3 1.2H5.4a1.3 1.3 0 0 1-1.3-1.2z"
                            fill="currentColor"
                        /><path
                            d="M6.5 7.5v6M9.5 7.5v6"
                            stroke="#fff"
                            strokeWidth="0.9"
                            strokeLinecap="round"
                            fill="none"
                        /></svg>
                    </button>
                </div>
            </div>
        );
    }

    renderEffects () {
        const effects = getTrackEffects(this.props.track);
        // UI-facing integer values; map to/from the audio-side floats on commit.
        const rows = [
            {name: 'reverb', label: 'Reverb', min: 0, max: 100,
                uiValue: Math.round(effects.reverb * 100), centered: false,
                fromUi: v => v / 100},
            {name: 'delay', label: 'Delay', min: 0, max: 100,
                uiValue: Math.round(effects.delay * 100), centered: false,
                fromUi: v => v / 100},
            {name: 'filter', label: 'Filter', min: 0, max: 100,
                uiValue: Math.round(effects.filter * 100), centered: false,
                fromUi: v => v / 100},
            {name: 'distortion', label: 'Distort', min: 0, max: 100,
                uiValue: Math.round((effects.distortion || 0) * 100), centered: false,
                fromUi: v => v / 100},
            {name: 'pan', label: 'Pan', min: -50, max: 50,
                uiValue: Math.round(effects.pan * 50), centered: true,
                fromUi: v => v / 50}
        ];
        const displayValue = row => {
            if (row.name === 'pan') {
                if (row.uiValue === 0) return 'C';
                return row.uiValue < 0 ?
                    `L${Math.abs(row.uiValue)}` :
                    `R${row.uiValue}`;
            }
            return row.uiValue;
        };
        return (
            <div className="track-effects">
                <div className="track-effects-title">Effects</div>
                {rows.map(row => {
                    const range = row.max - row.min;
                    const fillPct = row.centered ?
                        50 :
                        Math.max(0, Math.min(100, ((row.uiValue - row.min) / range) * 100));
                    const style = row.centered ? {
                        // Two-sided fill, centred on zero, so the bar reads as
                        // L/R balance instead of a one-way meter.
                        '--fx-left': `${Math.min(50, 50 + (row.uiValue / row.max) * 50)}%`,
                        '--fx-right': `${Math.max(50, 50 + (row.uiValue / row.max) * 50)}%`
                    } : {'--fx-pct': `${fillPct}%`};
                    return (
                        <div
                            className={`effect-row ${row.centered ? 'centered' : ''}`}
                            key={row.name}
                        >
                            <span className="effect-label">{row.label}</span>
                            <input
                                type="range"
                                min={row.min}
                                max={row.max}
                                step={1}
                                value={row.uiValue}
                                onChange={e => this.handleEffectChange(
                                    row.name,
                                    row.fromUi(parseInt(e.target.value, 10))
                                )}
                                aria-label={`${row.label} amount`}
                                style={style}
                            />
                            <span className="effect-value">{displayValue(row)}</span>
                        </div>
                    );
                })}
            </div>
        );
    }

    renderSynthControls () {
        const params = getTrackSynth(this.props.track);
        const presetName = (this.props.track.synth && this.props.track.synth.preset) || DEFAULT_SYNTH.preset;
        // Exponential mapping for ADSR-time sliders so the 0–100 UI scale has
        // fine control at short values (most musical territory) and still
        // reaches ~3 s (amp/filter A/D/R) or ~4 s (release) at the top end.
        const secToUi = (s, max = 3) => Math.round(100 * Math.pow(Math.max(0, Math.min(s, max)) / max, 1 / 2.5));
        const uiToSec = (u, max = 3) => max * Math.pow(Math.max(0, Math.min(100, u)) / 100, 2.5);
        const WAVES = ['sine', 'square', 'sawtooth', 'triangle'];
        const LFO_DESTS = ['none', 'pitch', 'filter', 'amp'];
        // LFO rate 0..100 -> 0.1..20 Hz, log-scaled so 1-8 Hz lives in the
        // middle of the slider.
        const rateToUi = hz => Math.round(100 * Math.log10(Math.max(0.1, Math.min(20, hz)) / 0.1) / Math.log10(200));
        const uiToRate = u => 0.1 * Math.pow(200, Math.max(0, Math.min(100, u)) / 100);

        const normRows = [
            {key: 'oscMix', label: 'Mix',
                uiValue: Math.round(params.oscMix * 100), fromUi: v => v / 100},
            {key: 'filterCutoff', label: 'Cutoff',
                uiValue: Math.round(params.filterCutoff * 100), fromUi: v => v / 100},
            {key: 'filterResonance', label: 'Reso',
                uiValue: Math.round(params.filterResonance * 100), fromUi: v => v / 100},
            {key: 'filterEnvAmount', label: 'F.Env',
                uiValue: Math.round(params.filterEnvAmount * 100), fromUi: v => v / 100}
        ];
        const adsrRows = [
            {key: 'ampAttack', label: 'A.Atk',
                uiValue: secToUi(params.ampAttack, 3), fromUi: v => uiToSec(v, 3)},
            {key: 'ampDecay', label: 'A.Dec',
                uiValue: secToUi(params.ampDecay, 3), fromUi: v => uiToSec(v, 3)},
            {key: 'ampSustain', label: 'A.Sus',
                uiValue: Math.round(params.ampSustain * 100), fromUi: v => v / 100},
            {key: 'ampRelease', label: 'A.Rel',
                uiValue: secToUi(params.ampRelease, 4), fromUi: v => uiToSec(v, 4)},
            {key: 'filterAttack', label: 'F.Atk',
                uiValue: secToUi(params.filterAttack, 3), fromUi: v => uiToSec(v, 3)},
            {key: 'filterDecay', label: 'F.Dec',
                uiValue: secToUi(params.filterDecay, 3), fromUi: v => uiToSec(v, 3)},
            {key: 'filterSustain', label: 'F.Sus',
                uiValue: Math.round(params.filterSustain * 100), fromUi: v => v / 100},
            {key: 'filterRelease', label: 'F.Rel',
                uiValue: secToUi(params.filterRelease, 4), fromUi: v => uiToSec(v, 4)}
        ];
        const lfoGlideRows = [
            {key: 'lfoRate', label: 'LFO Rate',
                uiValue: rateToUi(params.lfoRate || 5), fromUi: v => uiToRate(v)},
            {key: 'lfoDepth', label: 'LFO Depth',
                uiValue: Math.round((params.lfoDepth || 0) * 100), fromUi: v => v / 100},
            {key: 'glideTime', label: 'Glide',
                uiValue: secToUi(params.glideTime || 0, 2), fromUi: v => uiToSec(v, 2)}
        ];
        const detuneUi = Math.max(-50, Math.min(50, Math.round(params.osc2Detune || 0)));

        const renderRow = row => {
            const fillPct = Math.max(0, Math.min(100, row.uiValue));
            return (
                <div
                    className="effect-row"
                    key={row.key}
                >
                    <span className="effect-label">{row.label}</span>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={row.uiValue}
                        onChange={e => this.handleSynthParamChange(row.key, row.fromUi(parseInt(e.target.value, 10)))}
                        aria-label={`${row.label} amount`}
                        style={{'--fx-pct': `${fillPct}%`}}
                    />
                    <span className="effect-value">{row.uiValue}</span>
                </div>
            );
        };

        const expanded = !!this.state.synthParamsExpanded;
        return (
            <div className="track-effects synth-controls">
                <button
                    type="button"
                    className={`track-effects-title synth-disclosure ${expanded ? 'is-open' : ''}`}
                    onClick={this.handleSynthParamsToggle}
                    aria-expanded={expanded}
                    aria-controls="synth-params-panel"
                    title={expanded ? 'Hide synth params' : 'Show synth params'}
                >
                    <svg
                        className="synth-disclosure-arrow"
                        viewBox="0 0 10 10"
                        width="10"
                        height="10"
                        aria-hidden="true"
                    ><path
                            d="M3 2.5l3 2.5-3 2.5z"
                            fill="currentColor"
                        /></svg>
                    <span>Synth</span>
                </button>
                <select
                    value={presetName}
                    onChange={this.handleSynthPresetChange}
                    aria-label="Synth preset"
                >
                    {SYNTH_PRESETS.map(p => (
                        <option
                            key={p.name}
                            value={p.name}
                        >{p.name}</option>
                    ))}
                </select>
                {expanded ? (
                    <div
                        className="synth-params-panel"
                        id="synth-params-panel"
                    >
                        <div className="synth-wave-row">
                            <label className="synth-wave-label">
                                <span>Osc 1</span>
                                <select
                                    value={params.osc1Wave}
                                    onChange={e => this.handleSynthWaveChange('osc1Wave', e)}
                                    aria-label="Oscillator 1 waveform"
                                >
                                    {WAVES.map(w => (<option
                                        key={w}
                                        value={w}
                                    >{w}</option>))}
                                </select>
                            </label>
                            <label className="synth-wave-label">
                                <span>Osc 2</span>
                                <select
                                    value={params.osc2Wave}
                                    onChange={e => this.handleSynthWaveChange('osc2Wave', e)}
                                    aria-label="Oscillator 2 waveform"
                                >
                                    {WAVES.map(w => (<option
                                        key={w}
                                        value={w}
                                    >{w}</option>))}
                                </select>
                            </label>
                        </div>
                        <div
                            className="effect-row centered"
                            key="osc2Detune"
                        >
                            <span className="effect-label">Detune</span>
                            <input
                                type="range"
                                min={-50}
                                max={50}
                                step={1}
                                value={detuneUi}
                                onChange={e => this.handleSynthParamChange('osc2Detune', parseInt(e.target.value, 10))}
                                aria-label="Oscillator 2 detune"
                                style={{
                                    '--fx-left': `${Math.min(50, 50 + (detuneUi / 50) * 50)}%`,
                                    '--fx-right': `${Math.max(50, 50 + (detuneUi / 50) * 50)}%`
                                }}
                            />
                            <span className="effect-value">{detuneUi}</span>
                        </div>
                        {normRows.map(renderRow)}
                        {adsrRows.map(renderRow)}
                        <div className="synth-wave-row">
                            <label className="synth-wave-label">
                                <span>LFO dest</span>
                                <select
                                    value={params.lfoDest || 'none'}
                                    onChange={e => this.handleSynthParamChange('lfoDest', e.target.value)}
                                    aria-label="LFO destination"
                                >
                                    {LFO_DESTS.map(d => (<option
                                        key={d}
                                        value={d}
                                    >{d}</option>))}
                                </select>
                            </label>
                            <label className="synth-wave-label">
                                <span>LFO wave</span>
                                <select
                                    value={params.lfoWave || 'sine'}
                                    onChange={e => this.handleSynthParamChange('lfoWave', e.target.value)}
                                    aria-label="LFO waveform"
                                >
                                    {WAVES.map(w => (<option
                                        key={w}
                                        value={w}
                                    >{w}</option>))}
                                </select>
                            </label>
                        </div>
                        {lfoGlideRows.map(renderRow)}
                    </div>
                ) : null}
            </div>
        );
    }

    renderNameRow () {
        const {track} = this.props;
        const isDrum = track.kind === 'drum';
        const isSynth = track.kind === 'synth';
        const badgeClass = isDrum ? 'drum' : (isSynth ? 'synth' : 'instrument');
        const badgeTitle = isDrum ? 'Drum track' : (isSynth ? 'Synth track' : 'Instrument track');
        return (
            <div className="track-name-row">
                <span
                    className={`track-kind-badge ${badgeClass}`}
                    aria-hidden="true"
                    title={badgeTitle}
                >{isDrum ? (
                        <svg
                            viewBox="0 0 16 16"
                            width="12"
                            height="12"
                        ><ellipse
                            cx="8"
                            cy="5"
                            rx="6"
                            ry="2.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                        /><path
                            d="M2 5v6c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                        /></svg>
                    ) : isSynth ? (
                        <svg
                            viewBox="0 0 16 16"
                            width="12"
                            height="12"
                        ><path
                            d="M1.5 8 Q 3 3.5 4.5 8 T 7.5 8 T 10.5 8 T 13.5 8 T 16 8"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        /></svg>
                    ) : (
                        <svg
                            viewBox="0 0 16 16"
                            width="12"
                            height="12"
                        ><path
                            d="M7 2v8.6a2.4 2.4 0 1 1-1.4-2.2V3.4l6.4-1.4v7.2A2.4 2.4 0 1 1 10.6 7V3.5L7 4.3z"
                            fill="currentColor"
                        /></svg>
                    )}</span>
                <span
                    className="track-name"
                    aria-label="Track name"
                >{displayNameForTrack(track)}</span>
                {this.renderEditToggleButton()}
            </div>
        );
    }

    renderControls () {
        const {track, isFirst, isLast, onMoveUp, onMoveDown, onMoveTop, onMoveBottom} = this.props;
        const isDrum = track.kind === 'drum';
        const isSynth = track.kind === 'synth';
        const volume = typeof track.volume === 'number' ? track.volume : 80;
        return (
            <div className={`track-row-controls ${isDrum ? 'drum-track' : ''} ${isSynth ? 'synth-track' : ''}`}>
                {isDrum ? (
                    // Drum tracks put the lane picker at the very top of the
                    // panel so its rows are vertically aligned with the grid's
                    // rows on the right. The track name + edit toggle live in
                    // a full-width header bar above the controls panel.
                    this.renderLanePicker()
                ) : isSynth ? (
                    // Synth tracks: just the name row at the top; the preset
                    // dropdown + synth params render below (via renderSynthControls).
                    this.renderNameRow()
                ) : (
                    <React.Fragment>
                        {this.renderNameRow()}
                        <select
                            value={track.instrument || 1}
                            onChange={this.handleInstrumentChange}
                            aria-label="Instrument"
                        >
                            {INSTRUMENT_NAMES.map((name, i) => (
                                <option
                                    key={i + 1}
                                    value={i + 1}
                                >{name}</option>
                            ))}
                        </select>
                    </React.Fragment>
                )}
                <div className="volume-row">
                    <button
                        type="button"
                        className={`icon-btn track-btn mute-btn ${track.muted ? 'is-muted' : ''}`}
                        onClick={this.handleMuteToggle}
                        aria-label={track.muted ? 'Muted' : 'Mute'}
                        aria-pressed={!!track.muted}
                        title={track.muted ? 'Unmute' : 'Mute'}
                    >
                        {track.muted ? (
                            <svg
                                viewBox="0 0 16 16"
                                width="14"
                                height="14"
                                aria-hidden="true"
                            ><path
                                d="M3 6v4h2.5L9 12.5V3.5L5.5 6H3z"
                                fill="currentColor"
                            /><path
                                d="M11 5l4 4M15 5l-4 4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.4"
                                strokeLinecap="round"
                            /></svg>
                        ) : (
                            <svg
                                viewBox="0 0 16 16"
                                width="14"
                                height="14"
                                aria-hidden="true"
                            ><path
                                d="M3 6v4h2.5L9 12.5V3.5L5.5 6H3z"
                                fill="currentColor"
                            /><path
                                d="M11 5.5a3 3 0 0 1 0 5M12.5 4a5 5 0 0 1 0 8"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.3"
                                strokeLinecap="round"
                            /></svg>
                        )}
                    </button>
                    {this.renderSoloButton()}
                    <input
                        type="range"
                        min={0}
                        max={100}
                        value={volume}
                        onChange={this.handleVolumeChange}
                        aria-label="Volume"
                        style={{'--vol-pct': `${volume}%`}}
                    />
                    <span className="volume-value">{volume}</span>
                </div>
                {isSynth ? this.renderSynthControls() : null}
                {this.renderEffects()}
                <div className="actions-row bottom-actions">
                    <button
                        type="button"
                        className="icon-btn track-btn-kb"
                        onClick={this.props.onKeyboardEntry}
                        aria-label="Keyboard Entry"
                        title="Play notes into this track with the keyboard"
                    >
                        <svg
                            viewBox="0 0 16 16"
                            width="14"
                            height="14"
                            aria-hidden="true"
                        ><rect
                            x="1.5"
                            y="4"
                            width="13"
                            height="8"
                            rx="1"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.2"
                        /><path
                            d="M4 4v5M6.5 4v5M9 4v5M11.5 4v5"
                            stroke="currentColor"
                            strokeWidth="1.2"
                        /><rect
                            x="3"
                            y="4"
                            width="1.6"
                            height="3.5"
                            fill="currentColor"
                        /><rect
                            x="5.5"
                            y="4"
                            width="1.6"
                            height="3.5"
                            fill="currentColor"
                        /><rect
                            x="8.5"
                            y="4"
                            width="1.6"
                            height="3.5"
                            fill="currentColor"
                        /><rect
                            x="10.8"
                            y="4"
                            width="1.6"
                            height="3.5"
                            fill="currentColor"
                        /></svg>
                    </button>
                    <button
                        type="button"
                        className="icon-btn ai-btn track-btn-ai"
                        onClick={this.props.onAiEdit}
                        aria-label="AI Edit"
                        title="Edit this track with AI"
                    >
                        <svg
                            viewBox="0 0 16 16"
                            width="14"
                            height="14"
                            aria-hidden="true"
                        ><path
                            d="M8 1.5l1.4 3.6L13 6.5l-3.6 1.4L8 11.5 6.6 7.9 3 6.5l3.6-1.4L8 1.5z"
                            fill="currentColor"
                        /><path
                            d="M12.5 11l.7 1.8L15 13.5l-1.8.7-.7 1.8-.7-1.8L10 13.5l1.8-.7z"
                            fill="currentColor"
                        /></svg>
                    </button>
                    <div className="move-stack">
                        <button
                            type="button"
                            className="icon-btn move-btn move-top"
                            onClick={onMoveTop}
                            disabled={isFirst}
                            aria-label="Move track to top"
                            title="Move to top"
                        >
                            <svg
                                viewBox="0 0 16 16"
                                width="11"
                                height="11"
                                aria-hidden="true"
                            ><path
                                d="M3 4h10"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                            /><path
                                d="M4 11l4-4 4 4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            /></svg>
                        </button>
                        <button
                            type="button"
                            className="icon-btn move-btn"
                            onClick={onMoveUp}
                            disabled={isFirst}
                            aria-label="Move track up"
                            title="Move up"
                        >
                            <svg
                                viewBox="0 0 16 16"
                                width="11"
                                height="11"
                                aria-hidden="true"
                            ><path
                                d="M3 10l5-5 5 5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            /></svg>
                        </button>
                        <button
                            type="button"
                            className="icon-btn move-btn"
                            onClick={onMoveDown}
                            disabled={isLast}
                            aria-label="Move track down"
                            title="Move down"
                        >
                            <svg
                                viewBox="0 0 16 16"
                                width="11"
                                height="11"
                                aria-hidden="true"
                            ><path
                                d="M3 6l5 5 5-5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            /></svg>
                        </button>
                        <button
                            type="button"
                            className="icon-btn move-btn move-bottom"
                            onClick={onMoveBottom}
                            disabled={isLast}
                            aria-label="Move track to bottom"
                            title="Move to bottom"
                        >
                            <svg
                                viewBox="0 0 16 16"
                                width="11"
                                height="11"
                                aria-hidden="true"
                            ><path
                                d="M3 12h10"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                            /><path
                                d="M4 5l4 4 4-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            /></svg>
                        </button>
                    </div>
                    <button
                        type="button"
                        className="icon-btn delete-btn"
                        onClick={this.handleDelete}
                        aria-label="Delete track"
                        title="Delete track"
                    >
                        <svg
                            viewBox="0 0 16 16"
                            width="14"
                            height="14"
                            aria-hidden="true"
                        ><path
                            d="M6.7 2.2a.7 .7 0 0 0-.7 .7V3.5H2.5a.5 .5 0 0 0 0 1h11a.5 .5 0 0 0 0-1H10V2.9a.7 .7 0 0 0-.7-.7zm.3 1.3V2.9a.07 .07 0 0 1 .07-.07h1.86a.07 .07 0 0 1 .07 .07V3.5z"
                            fill="currentColor"
                            fillRule="evenodd"
                        /><path
                            d="M3.4 5.7h9.2l-.7 8.1a1.3 1.3 0 0 1-1.3 1.2H5.4a1.3 1.3 0 0 1-1.3-1.2z"
                            fill="currentColor"
                        /><path
                            d="M6.5 7.5v6M9.5 7.5v6"
                            stroke="#fff"
                            strokeWidth="0.9"
                            strokeLinecap="round"
                            fill="none"
                        /></svg>
                    </button>
                </div>
            </div>
        );
    }

    render () {
        const {track, lengthSteps, stepsPerBeat, playStep, isEditing, selectedKeys} = this.props;
        const isDrum = track.kind === 'drum';
        const muted = !!track.muted;
        const isDrumEditing = isEditing && isDrum;
        // selectedKeys for compact mode is ignored — only the editing track shows selection state.

        const body = (
            <React.Fragment>
                {isEditing ? this.renderControls() : this.renderCompactControls()}
                <div
                    ref={this._canvasRef}
                    className="track-row-canvas"
                >
                    <div
                        ref={this._gridRef}
                        className={`track-row-grid ${isEditing ? 'is-editing' : 'is-compact'}`}
                    >
                        {isEditing ? (
                            isDrum ? (
                                <DrumGrid
                                    notes={track.notes || []}
                                    lengthSteps={lengthSteps}
                                    stepsPerBeat={stepsPerBeat}
                                    lanes={Array.isArray(track.drumLanes) && track.drumLanes.length > 0
                                        ? track.drumLanes
                                        : [track.drum || 1]}
                                    cellWidth={this.state.cellWidth}
                                    playStep={playStep}
                                    cursorStep={this.props.cursorStep}
                                    selectedKeys={selectedKeys || new Set()}
                                    onAddNote={this.handleAddNote}
                                    onRemoveNote={this.handleRemoveNote}
                                    onResizeNote={this.handleResizeNote}
                                    onSelectionChange={this.handleSelectionChange}
                                    onSetCursor={this.props.onSetCursor}
                                />
                            ) : (
                                <PianoRollGrid
                                    notes={track.notes || []}
                                    lengthSteps={lengthSteps}
                                    stepsPerBeat={stepsPerBeat}
                                    rootPitch={this.props.rootPitch}
                                    scaleType={this.props.scaleType}
                                    cellWidth={this.state.cellWidth}
                                    playStep={playStep}
                                    cursorStep={this.props.cursorStep}
                                    selectedKeys={selectedKeys || new Set()}
                                    onAddNote={this.handleAddNote}
                                    onResizeNote={this.handleResizeNote}
                                    onSelectionChange={this.handleSelectionChange}
                                    onMoveSelected={this.handleMoveSelected}
                                    onSetCursor={this.props.onSetCursor}
                                    onPreviewPitch={this.handlePreviewPitch}
                                />
                            )
                        ) : (
                            <MiniGrid
                                track={track}
                                lengthSteps={lengthSteps}
                                stepsPerBeat={stepsPerBeat}
                                playStep={playStep}
                                height={this.state.canvasHeight}
                                cellWidth={this.state.cellWidth}
                            />
                        )}
                    </div>
                    {isEditing ? (
                        <div
                            ref={this._velocityRef}
                            className="track-row-velocity"
                        >
                            <VelocityStrip
                                notes={track.notes || []}
                                lengthSteps={lengthSteps}
                                stepsPerBeat={stepsPerBeat}
                                cellWidth={this.state.cellWidth}
                                kind={track.kind}
                                onUpdateVelocity={this.handleUpdateVelocity}
                            />
                        </div>
                    ) : null}
                </div>
            </React.Fragment>
        );

        return (
            <div className={`track-row ${muted ? 'muted' : ''} ${isEditing ? 'editing' : 'compact'} ${isDrumEditing ? 'drum-editing' : ''}`}>
                {isDrumEditing ? (
                    <React.Fragment>
                        <div className="track-row-header">
                            {this.renderNameRow()}
                        </div>
                        <div className="track-row-body">
                            {body}
                        </div>
                    </React.Fragment>
                ) : body}
            </div>
        );
    }
}

TrackRow.propTypes = {
    track: PropTypes.object.isRequired,
    lengthSteps: PropTypes.number.isRequired,
    stepsPerBeat: PropTypes.number.isRequired,
    rootPitch: PropTypes.number,
    scaleType: PropTypes.string,
    playStep: PropTypes.number,
    isEditing: PropTypes.bool.isRequired,
    isFirst: PropTypes.bool.isRequired,
    isLast: PropTypes.bool.isRequired,
    selectedKeys: PropTypes.instanceOf(Set),
    onUpdate: PropTypes.func.isRequired,
    onDelete: PropTypes.func.isRequired,
    onToggleEdit: PropTypes.func.isRequired,
    onSelectionChange: PropTypes.func.isRequired,
    onMoveUp: PropTypes.func.isRequired,
    onMoveDown: PropTypes.func.isRequired,
    onMoveTop: PropTypes.func.isRequired,
    onMoveBottom: PropTypes.func.isRequired,
    onAiEdit: PropTypes.func.isRequired,
    onKeyboardEntry: PropTypes.func.isRequired
};

export default TrackRow;
export {noteKey, drumNoteKey};
