import React from 'react';
import PropTypes from 'prop-types';

import {fillForPitch, strokeForPitch} from './pitch-colors.js';
import {LABEL_W, DEFAULT_CELL_W} from './grid-sizing.js';

const MINI_DRUM_LANE_COLORS = [
    '#4C97FF', '#FF8C1A', '#9966FF', '#0FBD8C',
    '#FFAB19', '#FF6680', '#5CB1D6', '#C56F00'
];

/**
 * A compact preview of a track's notes. Uses the SAME LABEL_W gutter and
 * cellWidth as the editing piano-roll / drum-grid so the time-step columns
 * line up perfectly across every track in the song — beat 1 of a compact
 * track sits at exactly the same x as beat 1 of the editing track.
 */
const MiniGrid = ({track, lengthSteps, stepsPerBeat, playStep, height = 80, cellWidth}) => {
    // synthDrum tracks use the same lane-based (drum, step) note model as
    // sampled drum tracks, so they render identically in the compact preview.
    const isDrum = track.kind === 'drum' || track.kind === 'synthDrum';
    const notes = track.notes || [];
    const cellW = cellWidth || DEFAULT_CELL_W;
    const viewH = Math.max(24, height);
    const totalW = LABEL_W + (lengthSteps * cellW);

    const drumLanes = isDrum ? (
        Array.isArray(track.drumLanes) && track.drumLanes.length > 0 ?
            track.drumLanes :
            [track.drum || 1]
    ) : null;

    let minPitch = 60;
    let maxPitch = 72;
    if (!isDrum && notes.length > 0) {
        minPitch = Math.min(...notes.map(n => n.pitch));
        maxPitch = Math.max(...notes.map(n => n.pitch));
    }
    const pitchRange = Math.max(1, maxPitch - minPitch);

    const beats = [];
    for (let b = 1; b * stepsPerBeat < lengthSteps; b++) {
        const x = LABEL_W + (b * stepsPerBeat * cellW);
        beats.push(<line
            key={`b-${b}`}
            className="mini-beat"
            x1={x}
            x2={x}
            y1={0}
            y2={viewH}
        />);
    }

    const padY = Math.max(4, viewH * 0.08);
    const usableH = viewH - (padY * 2);

    const noteRects = notes.map((n, idx) => {
        const x = LABEL_W + (n.step * cellW);
        const w = Math.max(2, (n.durationSteps || 1) * cellW);
        let y;
        let h;
        let fill;
        let stroke;
        if (isDrum) {
            const laneIdx = Math.max(0, drumLanes.indexOf(n.drum || track.drum || 1));
            const rowH = Math.max(3, Math.min(usableH * 0.35, usableH / Math.max(1, drumLanes.length)));
            const t = drumLanes.length > 1 ? laneIdx / (drumLanes.length - 1) : 0.5;
            y = padY + (t * (usableH - rowH));
            h = rowH;
            const color = MINI_DRUM_LANE_COLORS[laneIdx % MINI_DRUM_LANE_COLORS.length];
            fill = color;
            stroke = color;
        } else {
            const rowH = Math.max(3, Math.min(usableH * 0.35, usableH / (pitchRange + 1)));
            const t = pitchRange > 0 ? (maxPitch - n.pitch) / pitchRange : 0;
            y = padY + (t * (usableH - rowH));
            h = rowH;
            fill = fillForPitch(n.pitch);
            stroke = strokeForPitch(n.pitch);
        }
        return (<rect
            key={`n-${idx}`}
            className="mini-note"
            x={x}
            y={y}
            width={w}
            height={h}
            fill={fill}
            stroke={stroke}
        />);
    });

    const playheadX = typeof playStep === 'number' && playStep >= 0 ?
        LABEL_W + (playStep * cellW) : null;

    return (
        <svg
            className={`mini-grid ${isDrum ? 'mini-drum' : 'mini-piano'}`}
            viewBox={`0 0 ${totalW} ${viewH}`}
            preserveAspectRatio="none"
            width={totalW}
            height={viewH}
            style={{display: 'block'}}
        >
            <rect
                className="mini-bg"
                x={LABEL_W}
                y={0}
                width={totalW - LABEL_W}
                height={viewH}
            />
            {beats}
            {noteRects}
            {playheadX !== null ? (
                <line
                    className="mini-playhead"
                    x1={playheadX}
                    x2={playheadX}
                    y1={0}
                    y2={viewH}
                />
            ) : null}
        </svg>
    );
};

MiniGrid.propTypes = {
    track: PropTypes.object.isRequired,
    lengthSteps: PropTypes.number.isRequired,
    stepsPerBeat: PropTypes.number.isRequired,
    cellWidth: PropTypes.number,
    playStep: PropTypes.number,
    height: PropTypes.number
};

export default MiniGrid;
