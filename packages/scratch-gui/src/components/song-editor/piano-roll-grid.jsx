import React from 'react';
import PropTypes from 'prop-types';

import {fillForPitch, strokeForPitch} from './pitch-colors.js';
import {LABEL_W, DEFAULT_CELL_W} from './grid-sizing.js';

// Match the Music extension's piano sample range (C1..C8 = 24..108 MIDI).
// The grid is taller than the visible area; the outer container scrolls
// vertically, and we auto-center on the track's notes when entering edit mode.
const MIN_PITCH = 24;   // C1
const MAX_PITCH = 108;  // C8
const CELL_H = 16;
// Hot-zone width on the right edge of a note for "drag to resize".
const RESIZE_EDGE = 6;
// Vertical height of the draggable cursor handle at the top of the grid.
const CURSOR_HANDLE_H = 14;
// Pixel movement threshold before a mouse-down is interpreted as a drag
// rather than a click.
const DRAG_THRESHOLD = 4;

const PITCHES = (() => {
    const arr = [];
    for (let p = MAX_PITCH; p >= MIN_PITCH; p--) arr.push(p);
    return arr;
})();

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const pitchName = midi => `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

const noteKey = note => `${note.pitch}_${note.step}`;

class PianoRollGrid extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            // null | 'pending' | 'resize' | 'rect'
            dragMode: null,
            // Pending/rect drag origin (svg coords).
            dragStart: null,
            // Current pointer position (svg coords).
            dragCurrent: null,
            // Resize state.
            resizeIdx: null,
            resizeOriginalDuration: 1,
            resizePreviewSteps: 1,
            // Tracks the scroll offset of the surrounding scroller so the
            // draggable cursor handle can be rendered at the top of the
            // *visible* area instead of getting clipped above the viewport
            // once the grid is auto-scrolled to the melody.
            scrollTop: 0
        };
        this.svgRef = React.createRef();
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleWindowMouseMove = this.handleWindowMouseMove.bind(this);
        this.handleWindowMouseUp = this.handleWindowMouseUp.bind(this);
        this.handleScrollerScroll = this.handleScrollerScroll.bind(this);
    }

    componentDidMount () {
        // When the user opens a track for editing, scroll the outer container
        // to fit as much of the existing melody as possible. Without this the
        // grid lands at scrollTop=0 (showing the top of the pitch range,
        // typically empty), forcing the user to scroll down before they can
        // see their notes.
        this._scrollToMelody();
        this._attachScroller();
    }

    componentWillUnmount () {
        this._detachWindow();
        this._detachScroller();
    }

    _findScroller () {
        const svg = this.svgRef.current;
        let el = svg && svg.parentElement;
        while (el && el !== document.body) {
            const overflowY = getComputedStyle(el).overflowY;
            if (overflowY === 'auto' || overflowY === 'scroll') return el;
            el = el.parentElement;
        }
        return null;
    }

    _attachScroller () {
        const scroller = this._findScroller();
        if (!scroller) return;
        this._scroller = scroller;
        scroller.addEventListener('scroll', this.handleScrollerScroll, {passive: true});
        // Seed initial state — _scrollToMelody may have already scrolled.
        this.setState({scrollTop: scroller.scrollTop});
    }

    _detachScroller () {
        if (this._scroller) {
            this._scroller.removeEventListener('scroll', this.handleScrollerScroll);
            this._scroller = null;
        }
    }

    handleScrollerScroll () {
        if (!this._scroller) return;
        const top = this._scroller.scrollTop;
        if (top !== this.state.scrollTop) this.setState({scrollTop: top});
    }

    _scrollToMelody () {
        const svg = this.svgRef.current;
        if (!svg) return;
        // Walk up from the SVG to the first ancestor whose vertical overflow
        // is scrollable (`auto` or `scroll`). The SVG's immediate parent is
        // a grid wrapper; the real scroller is the `track-row-grid.is-editing`
        // container further up, and hard-coding that level would break if
        // the surrounding markup ever changes.
        let scroller = svg.parentElement;
        while (scroller && scroller !== document.body) {
            const overflowY = getComputedStyle(scroller).overflowY;
            if ((overflowY === 'auto' || overflowY === 'scroll') &&
                scroller.scrollHeight > scroller.clientHeight) {
                break;
            }
            scroller = scroller.parentElement;
        }
        if (!scroller || scroller === document.body) return;
        const notes = this.props.notes || [];
        let minPitch = Infinity;
        let maxPitch = -Infinity;
        for (const n of notes) {
            if (typeof n.pitch !== 'number') continue;
            if (n.pitch < minPitch) minPitch = n.pitch;
            if (n.pitch > maxPitch) maxPitch = n.pitch;
        }
        if (!Number.isFinite(maxPitch)) {
            // Empty track — frame a middle octave (C4..C5) so the user lands
            // somewhere they can immediately click to add notes.
            minPitch = 60;
            maxPitch = 72;
        }
        // Map pitches to rows. Higher pitch = lower row index = lower y.
        const topRow = PITCHES.indexOf(maxPitch);
        const bottomRow = PITCHES.indexOf(minPitch);
        if (topRow < 0 || bottomRow < 0) return;
        // Center the melody's pitch range vertically inside the viewport.
        const yTop = topRow * CELL_H;
        const yBot = (bottomRow + 1) * CELL_H;
        const melodyCenter = (yTop + yBot) / 2;
        const viewport = scroller.clientHeight;
        const scrollTop = melodyCenter - (viewport / 2);
        const maxScroll = scroller.scrollHeight - viewport;
        scroller.scrollTop = Math.max(0, Math.min(maxScroll, scrollTop));
    }

    _attachWindow () {
        window.addEventListener('mousemove', this.handleWindowMouseMove);
        window.addEventListener('mouseup', this.handleWindowMouseUp);
    }

    _detachWindow () {
        window.removeEventListener('mousemove', this.handleWindowMouseMove);
        window.removeEventListener('mouseup', this.handleWindowMouseUp);
    }

    _svgCoords (e) {
        const svg = this.svgRef.current;
        if (!svg) return {x: 0, y: 0};
        const rect = svg.getBoundingClientRect();
        return {x: e.clientX - rect.left, y: e.clientY - rect.top};
    }

    _cellW () {
        return this.props.cellWidth || DEFAULT_CELL_W;
    }

    _hitTest (x, y) {
        for (let i = 0; i < this.props.notes.length; i++) {
            const n = this.props.notes[i];
            const row = PITCHES.indexOf(n.pitch);
            if (row < 0) continue;
            const noteX = LABEL_W + (n.step * this._cellW());
            const noteW = (n.durationSteps || 1) * this._cellW();
            const noteY = row * CELL_H;
            if (x >= noteX && x <= noteX + noteW && y >= noteY && y <= noteY + CELL_H) {
                return {
                    idx: i,
                    note: n,
                    isRightEdge: x >= noteX + noteW - RESIZE_EDGE
                };
            }
        }
        return null;
    }

    _cellFromCoords ({x, y}) {
        return {
            step: Math.floor((x - LABEL_W) / this._cellW()),
            row: Math.floor(y / CELL_H)
        };
    }

    _cursorHit (x, y) {
        // Only grabbable while paused — when playing, the live playhead takes
        // over and the static cursor isn't drawn. The grab handle floats at
        // the top of the *visible* area (offset by scrollTop) so it stays
        // reachable when the grid is scrolled down to the melody.
        const {cursorStep, playStep, lengthSteps} = this.props;
        if (typeof cursorStep !== 'number' || cursorStep < 0) return false;
        if (typeof playStep === 'number' && playStep >= 0) return false;
        if (cursorStep >= lengthSteps) return false;
        const top = this.state.scrollTop || 0;
        if (y < top || y > top + CURSOR_HANDLE_H) return false;
        const cursorX = LABEL_W + (cursorStep * this._cellW());
        return Math.abs(x - cursorX) <= 6;
    }

    _stepFromX (x) {
        return Math.max(0, Math.min(
            this.props.lengthSteps - 1,
            Math.floor((x - LABEL_W) / this._cellW())
        ));
    }

    handleMouseDown (e) {
        if (e.button !== 0) return;
        const coords = this._svgCoords(e);

        // Grab and drag the paused playhead. Checked before the gutter so a
        // click that lands on the cursor in column 0 still starts a drag
        // instead of just re-snapping the cursor to itself.
        if (this._cursorHit(coords.x, coords.y)) {
            this.setState({
                dragMode: 'cursor-drag',
                dragStart: coords,
                dragCurrent: coords
            });
            this._attachWindow();
            e.preventDefault();
            return;
        }

        // Click in the gutter (or shift+click anywhere): move the playhead.
        const isGutter = coords.x < LABEL_W;
        if (isGutter || e.shiftKey) {
            if (this.props.onSetCursor) this.props.onSetCursor(this._stepFromX(coords.x));
            e.preventDefault();
            return;
        }

        const hit = this._hitTest(coords.x, coords.y);
        if (hit) {
            if (hit.isRightEdge) {
                this.setState({
                    dragMode: 'resize',
                    dragStart: coords,
                    dragCurrent: coords,
                    resizeIdx: hit.idx,
                    resizeOriginalDuration: hit.note.durationSteps || 1,
                    resizePreviewSteps: hit.note.durationSteps || 1
                });
                this._attachWindow();
                e.preventDefault();
                return;
            }
            // Click on note body → make this note part of the selection (or
            // keep the existing selection if it already includes this note).
            // Then prepare for a possible drag-to-move.
            const hitKey = noteKey(hit.note);
            let workingKeys = this.props.selectedKeys;
            if (!workingKeys.has(hitKey)) {
                workingKeys = new Set([hitKey]);
                this.props.onSelectionChange(workingKeys);
            }
            // Snapshot the to-be-moved notes by index so we can preview deltas.
            const baseline = [];
            for (let i = 0; i < this.props.notes.length; i++) {
                if (workingKeys.has(noteKey(this.props.notes[i]))) {
                    baseline.push({idx: i, step: this.props.notes[i].step, pitch: this.props.notes[i].pitch});
                }
            }
            this.setState({
                dragMode: 'pending-move',
                dragStart: coords,
                dragCurrent: coords,
                moveAnchorPitch: hit.note.pitch,
                moveBaseline: baseline,
                moveDelta: {step: 0, pitch: 0},
                lastPreviewedPitch: hit.note.pitch
            });
            this._attachWindow();
            e.preventDefault();
            return;
        }

        // Empty area: pending click (create note) or drag-rect (selection).
        const {step, row} = this._cellFromCoords(coords);
        if (step < 0 || step >= this.props.lengthSteps || row < 0 || row >= PITCHES.length) return;
        this.setState({
            dragMode: 'pending',
            dragStart: {...coords, step, pitch: PITCHES[row]},
            dragCurrent: coords
        });
        this._attachWindow();
        e.preventDefault();
    }

    handleWindowMouseMove (e) {
        const {dragMode, dragStart} = this.state;
        if (!dragMode || !dragStart) return;
        const coords = this._svgCoords(e);
        if (dragMode === 'cursor-drag') {
            const step = this._stepFromX(coords.x);
            if (this.props.onSetCursor && step !== this.props.cursorStep) {
                this.props.onSetCursor(step);
            }
            this.setState({dragCurrent: coords});
            return;
        }
        if (dragMode === 'pending') {
            const dx = coords.x - dragStart.x;
            const dy = coords.y - dragStart.y;
            if ((dx * dx) + (dy * dy) > DRAG_THRESHOLD * DRAG_THRESHOLD) {
                this.setState({dragMode: 'rect', dragCurrent: coords});
            }
            return;
        }
        if (dragMode === 'pending-move') {
            const dx = coords.x - dragStart.x;
            const dy = coords.y - dragStart.y;
            if ((dx * dx) + (dy * dy) > DRAG_THRESHOLD * DRAG_THRESHOLD) {
                this.setState({dragMode: 'move', dragCurrent: coords});
                // Fall through into the move handler below by re-reading state.
            } else {
                return;
            }
        }
        if (this.state.dragMode === 'move') {
            this._updateMoveDelta(coords);
            return;
        }
        if (dragMode === 'rect') {
            this.setState({dragCurrent: coords});
            return;
        }
        if (dragMode === 'resize') {
            const note = this.props.notes[this.state.resizeIdx];
            if (!note) return;
            const dx = coords.x - dragStart.x;
            const stepDelta = Math.round(dx / this._cellW());
            const maxLen = this.props.lengthSteps - note.step;
            const preview = Math.max(1, Math.min(maxLen, this.state.resizeOriginalDuration + stepDelta));
            if (preview !== this.state.resizePreviewSteps) {
                this.setState({resizePreviewSteps: preview, dragCurrent: coords});
            }
        }
    }

    _updateMoveDelta (coords) {
        const dx = coords.x - this.state.dragStart.x;
        const dy = coords.y - this.state.dragStart.y;
        let stepDelta = Math.round(dx / this._cellW());
        // Pitch goes UP as y goes DOWN in pixel coords (because PITCHES[0] is
        // MAX_PITCH at row 0). One row of vertical movement = one semitone.
        let pitchDelta = -Math.round(dy / CELL_H);

        // Clamp deltas so no moved note crosses the song's bounds. We use the
        // pre-move (baseline) positions for clamping.
        const baseline = this.state.moveBaseline || [];
        const lengthSteps = this.props.lengthSteps;
        let minStep = Infinity;
        let maxStep = -Infinity;
        let minPitch = Infinity;
        let maxPitch = -Infinity;
        for (const b of baseline) {
            if (b.step < minStep) minStep = b.step;
            if (b.step > maxStep) maxStep = b.step;
            if (b.pitch < minPitch) minPitch = b.pitch;
            if (b.pitch > maxPitch) maxPitch = b.pitch;
        }
        if (Number.isFinite(minStep)) {
            stepDelta = Math.max(-minStep, Math.min(lengthSteps - 1 - maxStep, stepDelta));
        }
        if (Number.isFinite(minPitch)) {
            pitchDelta = Math.max(MIN_PITCH - minPitch, Math.min(MAX_PITCH - maxPitch, pitchDelta));
        }

        const prev = this.state.moveDelta || {step: 0, pitch: 0};
        if (prev.step === stepDelta && prev.pitch === pitchDelta) return;
        this.setState({moveDelta: {step: stepDelta, pitch: pitchDelta}, dragCurrent: coords});

        // Preview audio: when pitch changes, audition the anchor note's new
        // pitch so the user hears the destination as they drag.
        const newAnchorPitch = (this.state.moveAnchorPitch || 60) + pitchDelta;
        if (this.props.onPreviewPitch && newAnchorPitch !== this.state.lastPreviewedPitch) {
            this.props.onPreviewPitch(newAnchorPitch);
            this.setState({lastPreviewedPitch: newAnchorPitch});
        }
    }

    handleWindowMouseUp () {
        const {dragMode, dragStart, dragCurrent, resizeIdx, resizePreviewSteps, resizeOriginalDuration, moveDelta, moveBaseline} = this.state;
        this._detachWindow();

        if (dragMode === 'pending' && dragStart) {
            // It was a click on empty area: clear selection and add a note.
            if (this.props.selectedKeys.size > 0) {
                this.props.onSelectionChange(new Set());
            }
            this.props.onAddNote(dragStart.step, dragStart.pitch);
        } else if (dragMode === 'pending-move') {
            // No drag — just a click on the note. Selection already updated;
            // nothing else to do.
        } else if (dragMode === 'move' && moveDelta && moveBaseline) {
            if ((moveDelta.step !== 0 || moveDelta.pitch !== 0) && this.props.onMoveSelected) {
                this.props.onMoveSelected(moveDelta.step, moveDelta.pitch);
            }
        } else if (dragMode === 'rect' && dragStart && dragCurrent) {
            const rect = this._normalizeRect(dragStart, dragCurrent);
            const keys = this._notesInRect(rect);
            this.props.onSelectionChange(keys);
        } else if (dragMode === 'resize' && resizeIdx !== null) {
            if (resizePreviewSteps !== resizeOriginalDuration) {
                this.props.onResizeNote(resizeIdx, resizePreviewSteps);
            }
        }

        this.setState({
            dragMode: null,
            dragStart: null,
            dragCurrent: null,
            resizeIdx: null,
            resizeOriginalDuration: 1,
            resizePreviewSteps: 1,
            moveBaseline: null,
            moveDelta: {step: 0, pitch: 0},
            moveAnchorPitch: null,
            lastPreviewedPitch: null
        });
    }

    _normalizeRect (a, b) {
        return {
            x1: Math.min(a.x, b.x),
            y1: Math.min(a.y, b.y),
            x2: Math.max(a.x, b.x),
            y2: Math.max(a.y, b.y)
        };
    }

    _notesInRect (rect) {
        const result = new Set();
        for (const n of this.props.notes) {
            const row = PITCHES.indexOf(n.pitch);
            if (row < 0) continue;
            const noteX = LABEL_W + (n.step * this._cellW());
            const noteW = (n.durationSteps || 1) * this._cellW();
            const noteY = row * CELL_H;
            // Standard rect intersection.
            if (noteX + noteW < rect.x1 || noteX > rect.x2) continue;
            if (noteY + CELL_H < rect.y1 || noteY > rect.y2) continue;
            result.add(noteKey(n));
        }
        return result;
    }

    render () {
        const {notes, lengthSteps, stepsPerBeat, playStep, selectedKeys} = this.props;
        const width = LABEL_W + (lengthSteps * this._cellW());
        const height = PITCHES.length * CELL_H;

        // Pitch labels live in their OWN sticky SVG so they stay pinned to
        // the left edge during horizontal scroll. (See render below.) The
        // main piano-roll SVG reserves the LABEL_W gutter as blank space so
        // its cells start at the same x as before.
        const labelChildren = [];
        for (let row = 0; row < PITCHES.length; row++) {
            const pitch = PITCHES[row];
            labelChildren.push(<text
                key={`lbl-${pitch}`}
                className="row-label"
                x={LABEL_W - 4}
                y={(row * CELL_H) + 12}
                textAnchor="end"
            >{pitchName(pitch)}</text>);
        }

        const cells = [];
        for (let row = 0; row < PITCHES.length; row++) {
            const pitch = PITCHES[row];
            const isBlackKey = [1, 3, 6, 8, 10].indexOf(pitch % 12) >= 0;
            for (let step = 0; step < lengthSteps; step++) {
                const isBeat = (step % stepsPerBeat) === 0;
                let cls = 'cell';
                if (isBlackKey) cls += ' cell-alt';
                if (isBeat) cls += ' cell-beat';
                cells.push(<rect
                    key={`c-${row}-${step}`}
                    className={cls}
                    x={LABEL_W + (step * this._cellW())}
                    y={row * CELL_H}
                    width={this._cellW()}
                    height={CELL_H}
                />);
            }
        }

        const {dragMode, resizeIdx, resizePreviewSteps, moveDelta} = this.state;

        const noteRects = (notes || []).map((n, idx) => {
            const isSelected = selectedKeys.has(noteKey(n));
            // While dragging-to-move, render selected notes at their preview
            // positions (step+pitch offset by the live drag delta).
            let displayStep = n.step;
            let displayPitch = n.pitch;
            if (dragMode === 'move' && isSelected && moveDelta) {
                displayStep = n.step + moveDelta.step;
                displayPitch = n.pitch + moveDelta.pitch;
            }
            const row = PITCHES.indexOf(displayPitch);
            if (row < 0) return null;
            const displayedDuration = (dragMode === 'resize' && idx === resizeIdx)
                ? resizePreviewSteps
                : (n.durationSteps || 1);
            return (<rect
                key={`n-${idx}`}
                className={`note ${isSelected ? 'note-selected' : ''} ${dragMode === 'move' && isSelected ? 'note-moving' : ''}`}
                x={LABEL_W + (displayStep * this._cellW()) + 1}
                y={(row * CELL_H) + 1}
                width={(displayedDuration * this._cellW()) - 2}
                height={CELL_H - 2}
                fill={fillForPitch(displayPitch)}
                stroke={isSelected ? '#1a1a1a' : strokeForPitch(displayPitch)}
                strokeWidth={isSelected ? 2 : 1}
            />);
        });

        const playheadX = typeof playStep === 'number' && playStep >= 0 ?
            LABEL_W + (playStep * this._cellW()) : null;

        // Cursor line shows where paste lands and where Play will start.
        // Only render when not actively playing so it doesn't fight the
        // playhead visually.
        const {cursorStep} = this.props;
        const cursorX = (typeof cursorStep === 'number' && cursorStep >= 0 && playheadX === null) ?
            LABEL_W + (cursorStep * this._cellW()) : null;

        // Selection-rect overlay.
        let selRect = null;
        if (this.state.dragMode === 'rect' && this.state.dragStart && this.state.dragCurrent) {
            const r = this._normalizeRect(this.state.dragStart, this.state.dragCurrent);
            selRect = (<rect
                className="selection-rect"
                x={r.x1}
                y={r.y1}
                width={r.x2 - r.x1}
                height={r.y2 - r.y1}
            />);
        }

        return (
            <div
                className="piano-roll-wrap"
                style={{width, height}}
            >
                <svg
                    ref={this.svgRef}
                    className="piano-roll"
                    width={width}
                    height={height}
                    onMouseDown={this.handleMouseDown}
                >
                    {cells}
                    {noteRects}
                    {selRect}
                    {cursorX !== null ? (
                        <line
                            className="cursor"
                            x1={cursorX}
                            x2={cursorX}
                            y1={0}
                            y2={height}
                        />
                    ) : null}
                    {cursorX !== null ? (
                        <polygon
                            className="cursor-handle"
                            points={(() => {
                                const top = this.state.scrollTop || 0;
                                return `${cursorX - 5},${top} ${cursorX + 5},${top} ${cursorX},${top + CURSOR_HANDLE_H}`;
                            })()}
                        />
                    ) : null}
                    {playheadX !== null ? (
                        <line
                            className="playhead"
                            x1={playheadX}
                            x2={playheadX}
                            y1={0}
                            y2={height}
                        />
                    ) : null}
                </svg>
                <svg
                    className="piano-roll-labels"
                    width={LABEL_W}
                    height={height}
                    aria-hidden="true"
                >
                    <rect
                        x={0}
                        y={0}
                        width={LABEL_W}
                        height={height}
                        fill="#fff"
                    />
                    {labelChildren}
                </svg>
            </div>
        );
    }
}

PianoRollGrid.propTypes = {
    notes: PropTypes.array.isRequired,
    lengthSteps: PropTypes.number.isRequired,
    stepsPerBeat: PropTypes.number.isRequired,
    cellWidth: PropTypes.number,
    playStep: PropTypes.number,
    cursorStep: PropTypes.number,
    selectedKeys: PropTypes.instanceOf(Set).isRequired,
    onAddNote: PropTypes.func.isRequired,
    onResizeNote: PropTypes.func.isRequired,
    onSelectionChange: PropTypes.func.isRequired,
    onMoveSelected: PropTypes.func,
    onSetCursor: PropTypes.func,
    onPreviewPitch: PropTypes.func
};

export default PianoRollGrid;
export {noteKey};
