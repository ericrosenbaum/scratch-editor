// Runtime-side scale utilities. The editor (scratch-gui) has its own copy at
// packages/scratch-gui/src/components/song-editor/scale-utils.js — keep the
// two in sync. This module is consumed by the scheduler when transforming
// pitches at playback time in response to the songs extension's key/scale
// override blocks.

const MIN_PITCH = 24; // C1
const MAX_PITCH = 108; // C8

const SCALE_OFFSETS = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    pentatonicMajor: [0, 2, 4, 7, 9],
    pentatonicMinor: [0, 3, 5, 7, 10],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
};

const mod12 = n => ((n % 12) + 12) % 12;

const _offsetsFor = scaleType => SCALE_OFFSETS[scaleType] || SCALE_OFFSETS.chromatic;

const isInScale = (pitch, rootPitch, scaleType) => {
    const offsets = _offsetsFor(scaleType);
    return offsets.indexOf(mod12(pitch - rootPitch)) >= 0;
};

const _clamp = p => Math.max(MIN_PITCH, Math.min(MAX_PITCH, p));

// Returns the in-scale MIDI pitch nearest `pitch`. Tie-break prefers upward
// (mirrors the editor's piano-roll snap behavior).
const snapToScale = (pitch, rootPitch, scaleType) => {
    const clamped = _clamp(pitch);
    if (isInScale(clamped, rootPitch, scaleType)) return clamped;
    for (let d = 1; d <= 6; d++) {
        const up = clamped + d;
        if (up <= MAX_PITCH && isInScale(up, rootPitch, scaleType)) return up;
        const down = clamped - d;
        if (down >= MIN_PITCH && isInScale(down, rootPitch, scaleType)) return down;
    }
    for (let p = clamped + 1; p <= MAX_PITCH; p++) {
        if (isInScale(p, rootPitch, scaleType)) return p;
    }
    for (let p = clamped - 1; p >= MIN_PITCH; p--) {
        if (isInScale(p, rootPitch, scaleType)) return p;
    }
    return clamped;
};

module.exports = {
    SCALE_OFFSETS,
    MIN_PITCH,
    MAX_PITCH,
    isInScale,
    snapToScale
};
