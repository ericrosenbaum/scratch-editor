// Colors for the 12 pitch classes (C, C#, D, ... B). Used by the piano-roll
// grid and mini-grid so a single note's chroma is recognizable at a glance.
const PITCH_CLASS_FILL = [
    '#FF6B6B', // C
    '#FF9F4F', // C#
    '#FFCC4F', // D
    '#FFE94F', // D#
    '#B8E94F', // E
    '#4FE974', // F
    '#4FE9D9', // F#
    '#4FB8E9', // G
    '#4F74E9', // G#
    '#944FE9', // A
    '#E94FD9', // A#
    '#E94F74'  // B
];

const PITCH_CLASS_STROKE = [
    '#B84F4F',
    '#B87237',
    '#B89337',
    '#B8A537',
    '#88A537',
    '#37A554',
    '#37A59C',
    '#3788A5',
    '#3754A5',
    '#6A37A5',
    '#A5379C',
    '#A53754'
];

const fillForPitch = pitch => PITCH_CLASS_FILL[((pitch % 12) + 12) % 12];
const strokeForPitch = pitch => PITCH_CLASS_STROKE[((pitch % 12) + 12) % 12];

export {
    PITCH_CLASS_FILL,
    PITCH_CLASS_STROKE,
    fillForPitch,
    strokeForPitch
};
