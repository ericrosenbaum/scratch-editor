// Computer-keyboard mappings for the Keyboard Entry modal.
//
// Piano: standard "FL Studio" two-row layout — both visible octaves are
// playable simultaneously. The lower octave lives on the bottom keyboard
// rows (zsxdcvgbhnjm), the upper octave on the top two rows (q2w3er5t6y7u).
// Values are semitone offsets from the modal's `octaveBase` (the MIDI of
// the leftmost visible C). The component computes the actual MIDI pitch
// as `octaveBase + offset`.
//
// Drum: simple linear mapping from lane index to key char (first 16 lanes
// keyboardable; rest are mouse-only).

const PIANO_KEY_MAP = {
    // Lower octave
    'z': 0, // C
    's': 1, // C#
    'x': 2, // D
    'd': 3, // D#
    'c': 4, // E
    'v': 5, // F
    'g': 6, // F#
    'b': 7, // G
    'h': 8, // G#
    'n': 9, // A
    'j': 10, // A#
    'm': 11, // B
    ',': 12, // C (overlap with upper-octave start)
    // Upper octave
    'q': 12, // C
    '2': 13, // C#
    'w': 14, // D
    '3': 15, // D#
    'e': 16, // E
    'r': 17, // F
    '5': 18, // F#
    't': 19, // G
    '6': 20, // G#
    'y': 21, // A
    '7': 22, // A#
    'u': 23, // B
    'i': 24 // C (top end of upper octave)
};

// Inverse of PIANO_KEY_MAP keyed by semitone offset → key char. Used to label
// piano keys with their assigned computer key. For offsets that have multiple
// keys (the overlap at C/12), prefer the "primary" key for that octave: the
// lower octave's key for offsets 0..12 and the upper octave's key for 12..24.
// We special-case 12 to prefer the upper-octave Q (it visually sits in the
// upper octave's leftmost white key).
const PIANO_LABEL_FOR_OFFSET = {};
[
    ['z', 0], ['s', 1], ['x', 2], ['d', 3], ['c', 4], ['v', 5],
    ['g', 6], ['b', 7], ['h', 8], ['n', 9], ['j', 10], ['m', 11]
].forEach(([k, off]) => {
    PIANO_LABEL_FOR_OFFSET[off] = k;
});
[
    ['q', 12], ['2', 13], ['w', 14], ['3', 15], ['e', 16], ['r', 17],
    ['5', 18], ['t', 19], ['6', 20], ['y', 21], ['7', 22], ['u', 23],
    ['i', 24]
].forEach(([k, off]) => {
    PIANO_LABEL_FOR_OFFSET[off] = k;
});

const DRUM_KEY_MAP = [
    'a', 's', 'd', 'f', 'g', 'h', 'j', 'k',
    'q', 'w', 'e', 'r', 't', 'y', 'u', 'i'
];

// Inverse of DRUM_KEY_MAP keyed by key char → lane index, for fast lookup.
const DRUM_LANE_FOR_KEY = {};
DRUM_KEY_MAP.forEach((k, i) => {
    DRUM_LANE_FOR_KEY[k] = i;
});

const OCTAVE_DOWN_KEY = '[';
const OCTAVE_UP_KEY = ']';

// Constants the modal needs.
const OCTAVES_VISIBLE = 2;
const SEMITONES_VISIBLE = OCTAVES_VISIBLE * 12;
const MIN_OCTAVE_BASE = 24; // C1
const MAX_OCTAVE_BASE = 84; // so base + 24 == C8 == 108

const pianoKeyLabel = offset => PIANO_LABEL_FOR_OFFSET[offset] || '';
const drumKeyLabel = laneIdx => DRUM_KEY_MAP[laneIdx] || '';

export {
    PIANO_KEY_MAP,
    DRUM_KEY_MAP,
    DRUM_LANE_FOR_KEY,
    OCTAVE_DOWN_KEY,
    OCTAVE_UP_KEY,
    OCTAVES_VISIBLE,
    SEMITONES_VISIBLE,
    MIN_OCTAVE_BASE,
    MAX_OCTAVE_BASE,
    pianoKeyLabel,
    drumKeyLabel
};
