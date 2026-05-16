// Default MIDI velocity for notes created in the UI (no per-note velocity
// editor yet). 80 sits in the middle of "comfortably audible" territory.
const DEFAULT_VELOCITY = 80;

const newId = prefix => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

// Default lanes (drum-sound indices, 1-based into DRUM_NAMES) shown in a
// fresh drum track's grid. A drum track is now a multi-lane drum machine:
// each lane is a drum sound, each note carries the lane it hit via its
// own `drum` field.
const DEFAULT_DRUM_LANES = [4, 5, 6, 1, 2, 8]; // Crash, OpenHH, ClosedHH, Snare, Kick, Clap

// Neutral effect values — a freshly-created track sounds exactly as before
// (filter wide open, no reverb/delay send, centered pan). Effect ranges are
// kept dimensionless (0..1, except pan -1..1) so the audio scheduler decides
// the physical mapping (cutoff Hz, send gain, etc.).
const DEFAULT_EFFECTS = Object.freeze({
    reverb: 0,
    delay: 0,
    filter: 1,
    pan: 0
});

const getTrackEffects = track => {
    const fx = (track && track.effects) || {};
    return {
        reverb: typeof fx.reverb === 'number' ? fx.reverb : DEFAULT_EFFECTS.reverb,
        delay: typeof fx.delay === 'number' ? fx.delay : DEFAULT_EFFECTS.delay,
        filter: typeof fx.filter === 'number' ? fx.filter : DEFAULT_EFFECTS.filter,
        pan: typeof fx.pan === 'number' ? fx.pan : DEFAULT_EFFECTS.pan
    };
};

const createBlankTrack = (kind = 'instrument') => {
    const t = {
        trackId: newId('track'),
        kind,
        instrument: kind === 'instrument' ? 1 : undefined,
        volume: 80,
        muted: false,
        solo: false,
        notes: [],
        effects: {...DEFAULT_EFFECTS}
    };
    if (kind === 'drum') {
        t.drumLanes = DEFAULT_DRUM_LANES.slice();
    }
    return t;
};

/**
 * Return a human-readable name for a track, derived from its instrument or
 * drum-kit setting. Tracks no longer carry an editable `name` field — the
 * display name is always the instrument's name so the UI label stays in sync
 * with the actual sound.
 *
 * @param {object} track
 * @returns {string}
 */
const displayNameForTrack = track => {
    if (!track) return '';
    if (track.kind === 'drum') return 'Drums';
    const idx = (track.instrument || 1) - 1;
    return INSTRUMENT_NAMES[idx] || 'Track';
};

// Project a track (possibly legacy single-drum) into the new multi-lane
// shape so the editor and scheduler can always assume per-note drum fields.
// Pure — does not mutate the input.
const normalizeDrumTrack = track => {
    if (!track || track.kind !== 'drum') return track;
    const lanes = Array.isArray(track.drumLanes) && track.drumLanes.length > 0 ?
        track.drumLanes.slice() :
        // Legacy: a single drum index lived on the track. Promote it to a
        // one-lane drum track so the multi-lane grid can render it.
        [Math.max(1, Math.min(DRUM_NAMES.length, track.drum || 1))];
    const fallback = Math.max(1, Math.min(DRUM_NAMES.length, track.drum || lanes[0] || 1));
    const notes = (track.notes || []).map(n => {
        if (typeof n.drum === 'number' && n.drum >= 1 && n.drum <= DRUM_NAMES.length) {
            return n;
        }
        return {...n, drum: fallback};
    });
    return {...track, drumLanes: lanes, notes};
};

const createBlankSong = (name = 'Song') => ({
    songId: newId('song'),
    name,
    tempo: 120,
    lengthSteps: 32,
    stepsPerBeat: 4,
    tracks: [createBlankTrack('instrument')]
});

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

const DRUM_NAMES = [
    'Snare Drum',
    'Bass Drum',
    'Side Stick',
    'Crash Cymbal',
    'Open Hi-Hat',
    'Closed Hi-Hat',
    'Tambourine',
    'Hand Clap',
    'Claves',
    'Wood Block',
    'Cowbell',
    'Triangle',
    'Bongo',
    'Conga',
    'Cabasa',
    'Guiro',
    'Vibraslap',
    'Cuica'
];

export {
    createBlankSong,
    createBlankTrack,
    displayNameForTrack,
    normalizeDrumTrack,
    newId,
    INSTRUMENT_NAMES,
    DRUM_NAMES,
    DEFAULT_DRUM_LANES,
    DEFAULT_VELOCITY,
    DEFAULT_EFFECTS,
    getTrackEffects
};
