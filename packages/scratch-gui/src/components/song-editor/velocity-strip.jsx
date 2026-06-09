import React from 'react';
import PropTypes from 'prop-types';

import {fillForPitch, strokeForPitch} from './pitch-colors.js';
import {LABEL_W, DEFAULT_CELL_W} from './grid-sizing.js';

const STRIP_H = 56;
const HEAD_R = 3.5;
const VEL_MIN = 1;
const VEL_MAX = 127;
const DEFAULT_VELOCITY = 80;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Convert a velocity (1..127) into a stem height in px. Velocity 1 should still
// be visible, so we anchor the minimum to 4px above the baseline.
const stemTopForVelocity = velocity => {
    const ratio = clamp(velocity, VEL_MIN, VEL_MAX) / VEL_MAX;
    const usableH = STRIP_H - 6;
    return STRIP_H - 4 - (ratio * usableH);
};

const velocityFromY = y => {
    // Inverse of stemTopForVelocity, clamped.
    const usableH = STRIP_H - 6;
    const ratio = clamp((STRIP_H - 4 - y) / usableH, 0, 1);
    return clamp(Math.round(ratio * VEL_MAX), VEL_MIN, VEL_MAX);
};

class VelocityStrip extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            dragIdx: null,
            // Live velocity while dragging — committed to the parent on mouseup.
            dragVelocity: null
        };
        this.svgRef = React.createRef();
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleWindowMouseMove = this.handleWindowMouseMove.bind(this);
        this.handleWindowMouseUp = this.handleWindowMouseUp.bind(this);
    }

    componentWillUnmount () {
        this._detachWindow();
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
        // Find the note whose lollipop head is closest to (x, y), within a
        // generous click radius. Iterate in reverse so visually-stacked
        // (later-drawn) notes win.
        const notes = this.props.notes || [];
        const click = 8;
        let best = null;
        let bestD2 = (click * click);
        for (let i = notes.length - 1; i >= 0; i--) {
            const n = notes[i];
            const cx = LABEL_W + (n.step * this._cellW()) + (this._cellW() / 2);
            const v = typeof n.velocity === 'number' ? n.velocity : DEFAULT_VELOCITY;
            const cy = stemTopForVelocity(v);
            const dx = x - cx;
            const dy = y - cy;
            const d2 = (dx * dx) + (dy * dy);
            if (d2 < bestD2) {
                bestD2 = d2;
                best = i;
            }
        }
        return best;
    }

    handleMouseDown (e) {
        if (e.button !== 0) return;
        const coords = this._svgCoords(e);
        const idx = this._hitTest(coords.x, coords.y);
        if (idx === null) return;
        const note = this.props.notes[idx];
        if (!note) return;
        const startVelocity = typeof note.velocity === 'number' ? note.velocity : DEFAULT_VELOCITY;
        this.setState({
            dragIdx: idx,
            dragVelocity: startVelocity
        });
        this._attachWindow();
        e.preventDefault();
    }

    handleWindowMouseMove (e) {
        if (this.state.dragIdx === null) return;
        const coords = this._svgCoords(e);
        const velocity = velocityFromY(coords.y);
        if (velocity !== this.state.dragVelocity) {
            this.setState({dragVelocity: velocity});
        }
    }

    handleWindowMouseUp () {
        const {dragIdx, dragVelocity} = this.state;
        this._detachWindow();
        if (dragIdx !== null && typeof dragVelocity === 'number') {
            this.props.onUpdateVelocity(dragIdx, dragVelocity);
        }
        this.setState({dragIdx: null, dragVelocity: null});
    }

    _velocityForNote (n, idx) {
        if (this.state.dragIdx === idx && typeof this.state.dragVelocity === 'number') {
            return this.state.dragVelocity;
        }
        return typeof n.velocity === 'number' ? n.velocity : DEFAULT_VELOCITY;
    }

    render () {
        const {notes, lengthSteps, stepsPerBeat, kind} = this.props;
        const width = LABEL_W + (lengthSteps * this._cellW());
        // synthDrum hits have no pitch, so color them like sampled drums.
        const isDrum = kind === 'drum' || kind === 'synthDrum';

        // Beat-tick lines so the strip reads like a horizontal ruler.
        const ticks = [];
        for (let s = 0; s < lengthSteps; s++) {
            if ((s % stepsPerBeat) !== 0) continue;
            const x = LABEL_W + (s * this._cellW());
            ticks.push(<line
                key={`tick-${s}`}
                className="velocity-tick"
                x1={x}
                x2={x}
                y1={4}
                y2={STRIP_H - 3}
            />);
        }

        // One lollipop per note. Color from pitch palette (or a fixed drum blue).
        const stems = (notes || []).map((n, idx) => {
            const cx = LABEL_W + (n.step * this._cellW()) + (this._cellW() / 2);
            const velocity = this._velocityForNote(n, idx);
            const cy = stemTopForVelocity(velocity);
            const fill = isDrum ? '#4C97FF' : fillForPitch(n.pitch);
            const stroke = isDrum ? '#295EA8' : strokeForPitch(n.pitch);
            const isDragging = this.state.dragIdx === idx;
            return (
                <g
                    key={`stem-${idx}`}
                    className={`velocity-stem ${isDragging ? 'is-dragging' : ''}`}
                >
                    <line
                        x1={cx}
                        x2={cx}
                        y1={STRIP_H - 3}
                        y2={cy}
                        stroke={stroke}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                    />
                    <circle
                        cx={cx}
                        cy={cy}
                        r={isDragging ? HEAD_R + 1 : HEAD_R}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth="1"
                    />
                </g>
            );
        });

        // While dragging, render the live numeric velocity above the head so
        // the user gets immediate feedback on the value they're setting.
        let dragLabel = null;
        if (this.state.dragIdx !== null) {
            const n = (notes || [])[this.state.dragIdx];
            if (n) {
                const cx = LABEL_W + (n.step * this._cellW()) + (this._cellW() / 2);
                const cy = stemTopForVelocity(this.state.dragVelocity);
                const labelY = Math.max(10, cy - 8);
                dragLabel = (
                    <g className="velocity-drag-label">
                        <rect
                            x={cx - 14}
                            y={labelY - 9}
                            width={28}
                            height={13}
                            rx={3}
                            fill="rgba(20, 30, 60, 0.85)"
                        />
                        <text
                            x={cx}
                            y={labelY + 1}
                            textAnchor="middle"
                            fontSize="9"
                            fontFamily="'SFMono-Regular', Consolas, monospace"
                            fill="#fff"
                        >{this.state.dragVelocity}</text>
                    </g>
                );
            }
        }

        return (
            <svg
                ref={this.svgRef}
                className="velocity-strip"
                width={width}
                height={STRIP_H}
                onMouseDown={this.handleMouseDown}
            >
                <rect
                    className="velocity-bg"
                    x={LABEL_W}
                    y={0}
                    width={width - LABEL_W}
                    height={STRIP_H}
                />
                {ticks}
                <line
                    className="velocity-baseline"
                    x1={LABEL_W}
                    x2={width}
                    y1={STRIP_H - 3}
                    y2={STRIP_H - 3}
                />
                <text
                    className="velocity-gutter-label"
                    x={LABEL_W - 4}
                    y={STRIP_H / 2 + 3}
                    textAnchor="end"
                >vel</text>
                {stems}
                {dragLabel}
            </svg>
        );
    }
}

VelocityStrip.propTypes = {
    notes: PropTypes.array.isRequired,
    lengthSteps: PropTypes.number.isRequired,
    stepsPerBeat: PropTypes.number.isRequired,
    cellWidth: PropTypes.number,
    kind: PropTypes.oneOf(['instrument', 'drum', 'synth', 'synthDrum']).isRequired,
    onUpdateVelocity: PropTypes.func.isRequired
};

export default VelocityStrip;
