import {SYNTH_PRESETS, DEFAULT_SYNTH, getTrackSynth} from './synth-presets';

// Default MIDI velocity for notes created in the UI (no per-note velocity
// editor yet). 80 sits in the middle of "comfortably audible" territory.
const DEFAULT_VELOCITY = 80;

const newId = prefix => `${prefix}-${Math.random().toString(36)
    .slice(2, 10)}`;

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
    pan: 0,
    distortion: 0
});

const getTrackEffects = track => {
    const fx = (track && track.effects) || {};
    return {
        reverb: typeof fx.reverb === 'number' ? fx.reverb : DEFAULT_EFFECTS.reverb,
        delay: typeof fx.delay === 'number' ? fx.delay : DEFAULT_EFFECTS.delay,
        filter: typeof fx.filter === 'number' ? fx.filter : DEFAULT_EFFECTS.filter,
        pan: typeof fx.pan === 'number' ? fx.pan : DEFAULT_EFFECTS.pan,
        distortion: typeof fx.distortion === 'number' ? fx.distortion : DEFAULT_EFFECTS.distortion
    };
};

const createBlankTrack = (kind = 'instrument', name) => {
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
    if (kind === 'synth') {
        t.synth = {...DEFAULT_SYNTH};
    }
    if (typeof name === 'string' && name.length > 0) {
        t.name = name;
    }
    return t;
};

/**
 * Return a human-readable name for a track. If the track has a `name` field
 * (set when the user renames or via auto-numbering at creation), that wins.
 * Otherwise fall back to the instrument's name (or "Drums" for drum tracks)
 * so legacy songs without names still display sensibly.
 * @param {object} track
 * @returns {string}
 */
const displayNameForTrack = track => {
    if (!track) return '';
    if (typeof track.name === 'string' && track.name.length > 0) return track.name;
    if (track.kind === 'drum') return 'Drums';
    if (track.kind === 'synth') {
        const preset = track.synth && track.synth.preset;
        return preset || 'Synth';
    }
    const idx = (track.instrument || 1) - 1;
    return INSTRUMENT_NAMES[idx] || 'Track';
};

// Mirror of scratch-vm's StringUtil.unusedName, copied here so the editor's
// auto-numbering doesn't pull in a runtime dependency. Strips trailing digits
// from the proposed name and appends an incrementing suffix until it's unique
// against existingNames.
const unusedTrackName = (name, existingNames) => {
    if (existingNames.indexOf(name) < 0) return name;
    let base = name;
    let i = base.length - 1;
    while ((i >= 0) && ('0123456789'.indexOf(base.charAt(i)) > -1)) i--;
    base = base.slice(0, i + 1);
    let n = 2;
    while (existingNames.indexOf(base + n) >= 0) n++;
    return base + n;
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
    rootPitch: 60,
    scaleType: 'major',
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
    unusedTrackName,
    normalizeDrumTrack,
    newId,
    INSTRUMENT_NAMES,
    DRUM_NAMES,
    DEFAULT_DRUM_LANES,
    DEFAULT_VELOCITY,
    DEFAULT_EFFECTS,
    getTrackEffects,
    SYNTH_PRESETS,
    DEFAULT_SYNTH,
    getTrackSynth
};
