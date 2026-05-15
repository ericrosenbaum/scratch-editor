import React from 'react';
import PropTypes from 'prop-types';

import {LABEL_W, DEFAULT_CELL_W} from './grid-sizing.js';

const CELL_H = 28;
const RESIZE_EDGE = 6;
const DRAG_THRESHOLD = 4;
const CURSOR_HANDLE_H = 14;

// A note's identity in a multi-lane drum machine is (drum, step) — two hits
// at the same step on different lanes are different notes.
const drumNoteKey = note => `${note.drum || 0}_${note.step}`;

const COLOR_FOR_LANE = [
    '#4C97FF', // lane 0 — Scratch blue
    '#FF8C1A', // orange
    '#9966FF', // purple
    '#0FBD8C', // teal
    '#FFAB19', // gold
    '#FF6680', // red
    '#5CB1D6', // sky
    '#C56F00'  // burnt
];

class DrumGrid extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            dragMode: null,
            dragStart: null,
            dragCurrent: null,
            resizeIdx: null,
            resizeOriginalDuration: 1,
            resizePreviewSteps: 1,
            scrollTop: 0
        };
        this.svgRef = React.createRef();
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleWindowMouseMove = this.handleWindowMouseMove.bind(this);
        this.handleWindowMouseUp = this.handleWindowMouseUp.bind(this);
        this.handleScrollerScroll = this.handleScrollerScroll.bind(this);
    }

    componentDidMount () {
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

    _lanes () {
        const lanes = this.props.lanes;
        return (Array.isArray(lanes) && lanes.length > 0) ? lanes : [1];
    }

    // Map a y pixel coordinate to a lane index in the current lanes array.
    _laneFromY (y) {
        const idx = Math.floor(y / CELL_H);
        const lanes = this._lanes();
        if (idx < 0 || idx >= lanes.length) return -1;
        return idx;
    }

    _hitTest (x, y) {
        const laneIdx = this._laneFromY(y);
        if (laneIdx < 0) return null;
        const laneDrum = this._lanes()[laneIdx];
        for (let i = 0; i < this.props.notes.length; i++) {
            const n = this.props.notes[i];
            if ((n.drum || 1) !== laneDrum) continue;
            const noteX = LABEL_W + (n.step * this._cellW());
            const noteW = (n.durationSteps || 1) * this._cellW();
            const noteY = laneIdx * CELL_H;
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

    _cursorHit (x, y) {
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
        // Grab and drag the paused playhead.
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
        // Click in the gutter or shift+click anywhere: move the playhead cursor.
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
            const k = drumNoteKey(hit.note);
            if (!this.props.selectedKeys.has(k)) {
                this.props.onSelectionChange(new Set([k]));
            }
            e.preventDefault();
            return;
        }

        const laneIdx = this._laneFromY(coords.y);
        if (laneIdx < 0) return;
        const step = Math.floor((coords.x - LABEL_W) / this._cellW());
        if (step < 0 || step >= this.props.lengthSteps) return;
        this.setState({
            dragMode: 'pending',
            dragStart: {...coords, step, laneIdx},
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

    handleWindowMouseUp () {
        const {dragMode, dragStart, dragCurrent, resizeIdx, resizePreviewSteps, resizeOriginalDuration} = this.state;
        this._detachWindow();

        if (dragMode === 'pending' && dragStart) {
            if (this.props.selectedKeys.size > 0) {
                this.props.onSelectionChange(new Set());
            }
            const lanes = this._lanes();
            const drum = lanes[dragStart.laneIdx];
            // Parent's onAddNote(step, drum) — drum is the actual drum sound
            // index, not the lane index. That keeps the data model lane-order-
            // independent: reordering lanes never rewrites existing notes.
            this.props.onAddNote(dragStart.step, drum);
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
            resizePreviewSteps: 1
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
        const lanes = this._lanes();
        for (const n of this.props.notes) {
            const laneIdx = lanes.indexOf(n.drum || 1);
            if (laneIdx < 0) continue;
            const noteX = LABEL_W + (n.step * this._cellW());
            const noteW = (n.durationSteps || 1) * this._cellW();
            const noteY = laneIdx * CELL_H;
            if (noteX + noteW < rect.x1 || noteX > rect.x2) continue;
            if (noteY + CELL_H < rect.y1 || noteY > rect.y2) continue;
            result.add(drumNoteKey(n));
        }
        return result;
    }

    render () {
        const {notes, lengthSteps, stepsPerBeat, playStep, selectedKeys} = this.props;
        const lanes = this._lanes();
        const width = LABEL_W + (lengthSteps * this._cellW());
        const height = lanes.length * CELL_H;

        // Lane background + per-cell grid. (Lane names live in the drum-sound
        // pickers to the left of the grid, so the grid gutter is unlabeled.)
        const cells = [];
        for (let laneIdx = 0; laneIdx < lanes.length; laneIdx++) {
            const y = laneIdx * CELL_H;
            const isAltRow = (laneIdx % 2) === 1;
            for (let step = 0; step < lengthSteps; step++) {
                const isBeat = (step % stepsPerBeat) === 0;
                let cls = 'cell';
                if (isAltRow) cls += ' cell-alt';
                if (isBeat) cls += ' cell-beat';
                cells.push(<rect
                    key={`c-${laneIdx}-${step}`}
                    className={cls}
                    x={LABEL_W + (step * this._cellW())}
                    y={y}
                    width={this._cellW()}
                    height={CELL_H}
                />);
            }
        }

        const {dragMode, resizeIdx, resizePreviewSteps} = this.state;

        const noteRects = (notes || []).map((n, idx) => {
            const laneIdx = lanes.indexOf(n.drum || 1);
            if (laneIdx < 0) return null;
            const isSelected = selectedKeys.has(drumNoteKey(n));
            const displayedDuration = (dragMode === 'resize' && idx === resizeIdx)
                ? resizePreviewSteps
                : (n.durationSteps || 1);
            const color = COLOR_FOR_LANE[laneIdx % COLOR_FOR_LANE.length];
            return (<rect
                key={`n-${idx}`}
                className={`note ${isSelected ? 'note-selected' : ''}`}
                x={LABEL_W + (n.step * this._cellW()) + 2}
                y={(laneIdx * CELL_H) + 4}
                width={(displayedDuration * this._cellW()) - 4}
                height={CELL_H - 8}
                rx={2}
                fill={color}
                stroke={isSelected ? '#1a1a1a' : color}
                strokeWidth={isSelected ? 2 : 1}
            />);
        });

        const playheadX = typeof playStep === 'number' && playStep >= 0 ?
            LABEL_W + (playStep * this._cellW()) : null;

        const {cursorStep} = this.props;
        const cursorX = (typeof cursorStep === 'number' && cursorStep >= 0 && playheadX === null) ?
            LABEL_W + (cursorStep * this._cellW()) : null;

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
            <svg
                ref={this.svgRef}
                className="drum-grid"
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
        );
    }
}

DrumGrid.propTypes = {
    notes: PropTypes.array.isRequired,
    lengthSteps: PropTypes.number.isRequired,
    stepsPerBeat: PropTypes.number.isRequired,
    // Ordered list of drum-sound indices (1-based) shown as the rows of this
    // grid. Each row corresponds to one drum sound; clicks add notes that
    // carry the lane's drum index as their `drum` field.
    lanes: PropTypes.arrayOf(PropTypes.number),
    cellWidth: PropTypes.number,
    playStep: PropTypes.number,
    cursorStep: PropTypes.number,
    selectedKeys: PropTypes.instanceOf(Set).isRequired,
    onAddNote: PropTypes.func.isRequired,
    onResizeNote: PropTypes.func.isRequired,
    onSelectionChange: PropTypes.func.isRequired,
    onSetCursor: PropTypes.func
};

export default DrumGrid;
export {drumNoteKey};
