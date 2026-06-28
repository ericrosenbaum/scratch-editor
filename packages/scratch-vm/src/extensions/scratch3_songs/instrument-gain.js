// Level math for the Song Maker mix — the single home for every gain curve and
// per-instrument loudness trim. Imported by scheduler.js, song-playback.js and
// synth-drum-voice.js so velocity, faders, and calibration behave identically on
// scheduled playback and editor previews.
//
// Three concerns live here:
//   1. velocityToGain  — per-note velocity → linear gain (perceptual curve)
//   2. faderToGain      — track volume slider position → linear gain (dB taper)
//   3. per-instrument trims — measured dB offsets that equalize perceived
//      loudness (LUFS) across instrument families, so nothing is buried or
//      blaring. Derived empirically by eval/song-ai measure-loudness; see
//      TARGET_LUFS. dB is stored (human-readable, composes additively); the
//      accessors convert to linear at the multiply site.

// --- 1. Velocity curve -------------------------------------------------------
// MIDI velocity → linear gain. A square law (gentler than the old cube) with an
// audible floor: soft notes stay present, accents still read clearly. Tuned for
// "moderate, even" dynamics — see TARGET below. At default velocity 80 this is
// (80/127)^2 ≈ 0.40 (vs 0.25 under the old cube). The 0.06 floor (~-24 dB)
// keeps the very softest notes audible instead of vanishing.
const VELOCITY_EXP = 2;
const VELOCITY_FLOOR = 0.06;
const velocityToGain = velocity => {
    const v = typeof velocity === 'number' ? velocity : 80;
    const vNorm = Math.max(0, Math.min(1, v / 127));
    return Math.max(VELOCITY_FLOOR, Math.pow(vNorm, VELOCITY_EXP));
};

// --- 2. Fader taper ----------------------------------------------------------
// Track volume slider position (0..1, i.e. slider/100) → linear gain. A linear
// fader feels wrong because loudness is ~logarithmic; this is the standard
// "audio taper": linear-in-dB over a 40 dB range, silent at the bottom.
//   pos 1.0 → 0 dB (×1.0)   pos 0.8 → -8 dB (×0.40)
//   pos 0.5 → -20 dB (×0.10)   pos 0 → silence
const FADER_RANGE_DB = 40;
const faderToGain = pos => {
    const p = Math.max(0, Math.min(1, Number(pos) || 0));
    if (p <= 0) return 0;
    return Math.pow(10, ((p - 1) * FADER_RANGE_DB) / 20);
};

// --- 3. Per-instrument / per-preset loudness trims ---------------------------
// Common loudness the trims below were calibrated to (LUFS, EBU R128). Each
// instrument is trimmed toward this at velocity 100 / unity fader, so a fresh
// multi-track song is balanced. Boosts are clamped to keep the full-velocity
// peak below -1 dBFS, so quiet-but-peaky and genuinely-quiet samples may sit a
// little under target — the master limiter handles the summed peaks.
// Re-derive with: eval/song-ai launch.cjs measure-loudness --target -20
const TARGET_LUFS = -20;

const dbToGain = db => Math.pow(10, db / 20);

// dB trims. Sample instruments / drums are keyed by their stable menu index;
// synth / synth-drum presets by preset NAME (survives array reordering). Derived
// empirically by `measure-loudness`; 0 / missing = unchanged (×1.0).
// Index comments are the instrument/drum menu order.
const SAMPLE_INSTRUMENT_TRIM_DB = [
    10.8, // 0  Piano
    13.4, // 1  Electric Piano
    5.8, // 2  Organ
    13.1, // 3  Guitar
    18.0, // 4  Electric Guitar
    9.7, // 5  Bass
    2.7, // 6  Pizzicato
    5.9, // 7  Cello
    10.3, // 8  Trombone
    9.7, // 9  Clarinet
    12.5, // 10 Saxophone
    6.2, // 11 Flute
    7.0, // 12 Wooden Flute
    5.5, // 13 Bassoon
    5.5, // 14 Choir
    6.3, // 15 Vibraphone
    5.0, // 16 Music Box
    6.8, // 17 Steel Drum
    2.4, // 18 Marimba
    -3.0, // 19 Synth Lead
    7.4 // 20 Synth Pad
];
const SAMPLED_DRUM_TRIM_DB = [
    4.3, // 0  Snare Drum
    1.8, // 1  Bass Drum
    1.7, // 2  Side Stick
    3.7, // 3  Crash Cymbal
    3.0, // 4  Open Hi-Hat
    4.1, // 5  Closed Hi-Hat
    1.8, // 6  Tambourine
    2.0, // 7  Hand Clap
    2.6, // 8  Claves
    2.4, // 9  Wood Block
    2.9, // 10 Cowbell
    5.4, // 11 Triangle
    2.9, // 12 Bongo
    0.4, // 13 Conga
    4.6, // 14 Cabasa
    8.8, // 15 Guiro
    1.6, // 16 Vibraslap
    -3.1 // 17 Cuica
];
const SYNTH_PRESET_TRIM_DB = {
    'Warm Pad': 4.8,
    'Soft Strings': 4.1,
    'Pluck Lead': 6.8,
    'Detuned Saw Lead': 5.7,
    'Square Lead': -0.1,
    'Sub Bass': -2.5,
    'Reese Bass': 3.2,
    'Acid Bass': 4.3,
    'Bell': 4.5,
    'Wobble': 2.9,
    'Hollow Flute': 0.0,
    'Glass Pad': 4.0,
    'Buzz Stab': 7.2,
    'Synth Drum': 6.7
};
const SYNTH_DRUM_PRESET_TRIM_DB = {
    'Kick': 4.4,
    'Snare': 7.4,
    'Closed Hat': 9.0,
    'Open Hat': 6.0,
    'Clap': 11.1,
    'Rimshot': 6.2,
    'Tom Low': 6.8,
    'Tom Mid': 6.9,
    'Tom High': 6.8,
    'Cowbell': 2.8,
    'Clave': 7.2,
    'Cymbal': 5.6,
    'Zap': 3.5
};

const gainForSampleInstrument = instIdx => {
    const db = SAMPLE_INSTRUMENT_TRIM_DB[instIdx];
    return typeof db === 'number' ? dbToGain(db) : 1;
};
const gainForSampledDrum = drumIdx => {
    const db = SAMPLED_DRUM_TRIM_DB[drumIdx];
    return typeof db === 'number' ? dbToGain(db) : 1;
};
const gainForSynthPreset = presetName => {
    const db = SYNTH_PRESET_TRIM_DB[presetName];
    return typeof db === 'number' ? dbToGain(db) : 1;
};
const gainForSynthDrumPreset = presetName => {
    const db = SYNTH_DRUM_PRESET_TRIM_DB[presetName];
    return typeof db === 'number' ? dbToGain(db) : 1;
};

module.exports = {
    velocityToGain,
    faderToGain,
    TARGET_LUFS,
    SAMPLE_INSTRUMENT_TRIM_DB,
    SAMPLED_DRUM_TRIM_DB,
    SYNTH_PRESET_TRIM_DB,
    SYNTH_DRUM_PRESET_TRIM_DB,
    gainForSampleInstrument,
    gainForSampledDrum,
    gainForSynthPreset,
    gainForSynthDrumPreset
};
