const {DEFAULT_SYNTH} = require('./synth-defaults');

const newId = prefix => `${prefix}-${Math.random().toString(36)
    .slice(2, 10)}`;

// Keep these arrays in sync with packages/scratch-gui/src/lib/song-defaults.js.
// They're duplicated so the runtime can derive track display names from the
// instrument selection without having to import GUI-side code.
const INSTRUMENT_NAMES = [
    'Piano',
    'Electric Piano',
    'Organ',
    'Guitar',
    'Electric Guitar',
    'Bass',
    'Pizzicato',
    'Cello',
    'Trombone',
    'Clarinet',
    'Saxophone',
    'Flute',
    'Wooden Flute',
    'Bassoon',
    'Choir',
    'Vibraphone',
    'Music Box',
    'Steel Drum',
    'Marimba',
    'Synth Lead',
    'Synth Pad'
];

const DEFAULT_DRUM_LANES = [4, 5, 6, 1, 2, 8];

const createBlankTrack = (kind = 'instrument') => {
    const t = {
        trackId: newId('track'),
        kind,
        instrument: kind === 'instrument' ? 1 : undefined,
        volume: 80,
        muted: false,
        notes: []
    };
    if (kind === 'drum') {
        t.drumLanes = DEFAULT_DRUM_LANES.slice();
    }
    if (kind === 'synth') {
        t.synth = {...DEFAULT_SYNTH};
    }
    return t;
};

const createBlankSong = (name = 'Song') => ({
    songId: newId('song'),
    name,
    tempo: 120,
    lengthSteps: 32,
    stepsPerBeat: 4,
    tracks: [createBlankTrack('instrument')]
});

// Keep this in sync with displayNameForTrack in
// packages/scratch-gui/src/lib/song-defaults.js. A user-set (or auto-numbered)
// track name wins; otherwise fall back to the track's kind/instrument so legacy
// and library songs without names still display sensibly.
const displayNameForTrack = track => {
    if (!track) return '';
    if (typeof track.name === 'string' && track.name.length > 0) return track.name;
    if (track.kind === 'drum') return 'Drums';
    if (track.kind === 'synthDrum') return 'Synth Drums';
    if (track.kind === 'synth') {
        const preset = track.synth && track.synth.preset;
        return preset || 'Synth';
    }
    const idx = (track.instrument || 1) - 1;
    return INSTRUMENT_NAMES[idx] || 'Track';
};

module.exports = {
    createBlankSong,
    createBlankTrack,
    displayNameForTrack,
    newId,
    INSTRUMENT_NAMES,
    DEFAULT_DRUM_LANES
};
