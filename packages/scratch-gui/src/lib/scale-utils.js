// Song-level key/scale utilities. A song carries a `rootPitch` (MIDI int,
// 24..108) and a `scaleType` (one of the keys in SCALE_OFFSETS). The piano
// roll uses these to snap clicks to in-scale pitches and to visually
// emphasize in-key rows; SongEditor uses them to migrate existing notes
// when the user changes the song's key.

const MIN_PITCH = 24; // C1 — mirrors piano-roll-grid.jsx
const MAX_PITCH = 108; // C8

const SCALE_OFFSETS = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    pentatonicMajor: [0, 2, 4, 7, 9],
    pentatonicMinor: [0, 3, 5, 7, 10],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
};

const SCALE_LABELS = [
    {value: 'major', label: 'Major'},
    {value: 'minor', label: 'Minor'},
    {value: 'pentatonicMajor', label: 'Pentatonic Major'},
    {value: 'pentatonicMinor', label: 'Pentatonic Minor'},
    {value: 'chromatic', label: 'Chromatic'}
];

const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const DEFAULT_ROOT_PITCH = 60; // C4
const DEFAULT_SCALE_TYPE_NEW = 'major'; // for createBlankSong
const DEFAULT_SCALE_TYPE_LEGACY = 'chromatic'; // for songs loaded without the field

const mod12 = n => ((n % 12) + 12) % 12;

const _offsetsFor = scaleType => SCALE_OFFSETS[scaleType] || SCALE_OFFSETS.chromatic;

const isInScale = (pitch, rootPitch, scaleType) => {
    const offsets = _offsetsFor(scaleType);
    return offsets.indexOf(mod12(pitch - rootPitch)) >= 0;
};

const _clamp = p => Math.max(MIN_PITCH, Math.min(MAX_PITCH, p));

// Returns the in-scale MIDI pitch nearest `pitch`. Tie-break prefers upward
// so the visual layout (higher pitch = higher on screen) feels natural.
const snapToScale = (pitch, rootPitch, scaleType) => {
    const clamped = _clamp(pitch);
    if (isInScale(clamped, rootPitch, scaleType)) return clamped;
    for (let d = 1; d <= 6; d++) {
        const up = clamped + d;
        if (up <= MAX_PITCH && isInScale(up, rootPitch, scaleType)) return up;
        const down = clamped - d;
        if (down >= MIN_PITCH && isInScale(down, rootPitch, scaleType)) return down;
    }
    // Extreme-edge fallback: search the full range for *any* in-scale pitch.
    // Every scale contains at least one pitch per octave, so this always
    // resolves.
    for (let p = clamped + 1; p <= MAX_PITCH; p++) {
        if (isInScale(p, rootPitch, scaleType)) return p;
    }
    for (let p = clamped - 1; p >= MIN_PITCH; p--) {
        if (isInScale(p, rootPitch, scaleType)) return p;
    }
    return clamped;
};

const _isPitched = track => track && track.kind !== 'drum';

const transposeNotes = (tracks, deltaSemitones) => (tracks || []).map(track => {
    if (!_isPitched(track)) return track;
    const notes = [];
    for (const note of track.notes || []) {
        if (typeof note.pitch !== 'number') {
            notes.push(note);
            continue;
        }
        const newPitch = note.pitch + deltaSemitones;
        if (newPitch < MIN_PITCH || newPitch > MAX_PITCH) continue;
        notes.push({...note, pitch: newPitch});
    }
    return {...track, notes};
});

const snapNotesToScale = (tracks, rootPitch, scaleType) => (tracks || []).map(track => {
    if (!_isPitched(track)) return track;
    const seen = new Set();
    const notes = [];
    for (const note of track.notes || []) {
        if (typeof note.pitch !== 'number') {
            notes.push(note);
            continue;
        }
        const snapped = snapToScale(note.pitch, rootPitch, scaleType);
        const key = `${snapped}_${note.step}`;
        if (seen.has(key)) continue;
        seen.add(key);
        notes.push({...note, pitch: snapped});
    }
    return {...track, notes};
});

export {
    SCALE_OFFSETS,
    SCALE_LABELS,
    PITCH_CLASS_NAMES,
    DEFAULT_ROOT_PITCH,
    DEFAULT_SCALE_TYPE_NEW,
    DEFAULT_SCALE_TYPE_LEGACY,
    MIN_PITCH,
    MAX_PITCH,
    isInScale,
    snapToScale,
    transposeNotes,
    snapNotesToScale
};
