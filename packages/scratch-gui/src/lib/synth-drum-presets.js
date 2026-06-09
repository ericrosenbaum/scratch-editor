// Synthesized-percussion presets for the Song Maker "synthDrum" track kind.
//
// A synthDrum track is a drum machine (like the sampled "drum" track) whose
// lanes are SYNTHESIZED voices instead of samples. Each lane is one of the
// presets below; the track stores the editable params per lane in
// `track.drumVoices` (keyed by preset index), so the same catalog defines both
// the lane picker's options and the starting point for the per-lane controls.
//
// Each preset is a flat param bag consumed by the runtime's percussion voice
// builder (scratch-vm .../synth-drum-voice.js). UI sliders edit the same fields
// in-place on track.drumVoices[index]. `preset` is a label only.
//
// A percussion voice = a pitched body oscillator (with a downward pitch
// envelope) + a band-passed white-noise burst + optional drive. Parameter
// ranges (kept dimensionless so the runtime owns the physical mapping):
//   bodyWave    'sine' | 'square' | 'sawtooth' | 'triangle' (tonal oscillator)
//   tune        0..1 -> ~30..1500 Hz (exponential) base pitch of the body
//   pitchEnv    0..1 -> 0..3 octaves of upward pitch offset at attack
//   pitchDecay  seconds, time for the pitch to fall to `tune` (0..0.5)
//   bodyLevel   0..1 amount of the tonal body
//   bodyDecay   seconds, body amplitude decay (0..2)
//   noiseLevel  0..1 amount of band-passed noise (snares/hats/claps)
//   noiseColor  0..1 -> ~200..12000 Hz bandpass center (dark..bright)
//   noiseDecay  seconds, noise amplitude decay (0..2)
//   drive       0..1 tanh saturation for punch/grit

const SYNTH_DRUM_PRESETS = [
    {name: 'Kick',
        // Sine body + a deep, fast pitch drop = the classic synthesized thump.
        bodyWave: 'sine', tune: 0.10, pitchEnv: 0.55, pitchDecay: 0.05,
        bodyLevel: 1.0, bodyDecay: 0.40,
        noiseLevel: 0.0, noiseColor: 0.5, noiseDecay: 0.05,
        drive: 0.25},
    {name: 'Snare',
        // A short tonal body for the "shell" plus a fat band of noise for the
        // wires underneath.
        bodyWave: 'triangle', tune: 0.45, pitchEnv: 0.15, pitchDecay: 0.03,
        bodyLevel: 0.5, bodyDecay: 0.12,
        noiseLevel: 0.8, noiseColor: 0.55, noiseDecay: 0.16,
        drive: 0.15},
    {name: 'Closed Hat',
        // Bright noise, very short — pure metallic tick.
        bodyWave: 'square', tune: 0.7, pitchEnv: 0.0, pitchDecay: 0.01,
        bodyLevel: 0.0, bodyDecay: 0.05,
        noiseLevel: 1.0, noiseColor: 0.88, noiseDecay: 0.04,
        drive: 0.0},
    {name: 'Open Hat',
        // Same color as the closed hat but with a long ringing tail.
        bodyWave: 'square', tune: 0.7, pitchEnv: 0.0, pitchDecay: 0.01,
        bodyLevel: 0.0, bodyDecay: 0.05,
        noiseLevel: 1.0, noiseColor: 0.85, noiseDecay: 0.35,
        drive: 0.0},
    {name: 'Clap',
        // Mid-band noise with a medium decay (single-burst approximation).
        bodyWave: 'square', tune: 0.5, pitchEnv: 0.0, pitchDecay: 0.01,
        bodyLevel: 0.0, bodyDecay: 0.05,
        noiseLevel: 1.0, noiseColor: 0.55, noiseDecay: 0.18,
        drive: 0.1},
    {name: 'Rimshot',
        // Short pitched click with a touch of noise snap on top.
        bodyWave: 'triangle', tune: 0.55, pitchEnv: 0.1, pitchDecay: 0.01,
        bodyLevel: 0.8, bodyDecay: 0.05,
        noiseLevel: 0.25, noiseColor: 0.7, noiseDecay: 0.03,
        drive: 0.2},
    {name: 'Tom Low',
        bodyWave: 'sine', tune: 0.30, pitchEnv: 0.35, pitchDecay: 0.08,
        bodyLevel: 1.0, bodyDecay: 0.40,
        noiseLevel: 0.05, noiseColor: 0.5, noiseDecay: 0.10,
        drive: 0.1},
    {name: 'Tom Mid',
        bodyWave: 'sine', tune: 0.40, pitchEnv: 0.35, pitchDecay: 0.07,
        bodyLevel: 1.0, bodyDecay: 0.35,
        noiseLevel: 0.05, noiseColor: 0.5, noiseDecay: 0.10,
        drive: 0.1},
    {name: 'Tom High',
        bodyWave: 'sine', tune: 0.50, pitchEnv: 0.30, pitchDecay: 0.06,
        bodyLevel: 1.0, bodyDecay: 0.30,
        noiseLevel: 0.05, noiseColor: 0.5, noiseDecay: 0.10,
        drive: 0.1},
    {name: 'Cowbell',
        // Square body, no pitch sweep — the steady metallic ring.
        bodyWave: 'square', tune: 0.62, pitchEnv: 0.0, pitchDecay: 0.01,
        bodyLevel: 0.8, bodyDecay: 0.25,
        noiseLevel: 0.0, noiseColor: 0.6, noiseDecay: 0.05,
        drive: 0.3},
    {name: 'Clave',
        // High, dry, very short pitched click.
        bodyWave: 'triangle', tune: 0.70, pitchEnv: 0.05, pitchDecay: 0.005,
        bodyLevel: 1.0, bodyDecay: 0.08,
        noiseLevel: 0.0, noiseColor: 0.6, noiseDecay: 0.05,
        drive: 0.1},
    {name: 'Cymbal',
        // Very bright noise with a long wash.
        bodyWave: 'square', tune: 0.7, pitchEnv: 0.0, pitchDecay: 0.01,
        bodyLevel: 0.0, bodyDecay: 0.05,
        noiseLevel: 1.0, noiseColor: 0.95, noiseDecay: 0.80,
        drive: 0.0},
    {name: 'Zap',
        // Big pitch sweep over a fast decay — a playful laser/zap.
        bodyWave: 'sine', tune: 0.50, pitchEnv: 1.0, pitchDecay: 0.12,
        bodyLevel: 1.0, bodyDecay: 0.15,
        noiseLevel: 0.0, noiseColor: 0.5, noiseDecay: 0.05,
        drive: 0.2}
];

const SYNTH_DRUM_PRESET_NAMES = SYNTH_DRUM_PRESETS.map(p => p.name);

// Lanes a fresh synthDrum track starts with (1-based indices into
// SYNTH_DRUM_PRESETS): Kick, Snare, Closed Hat, Open Hat, Clap. Mirrors the
// sampled drum track's DEFAULT_DRUM_LANES.
const DEFAULT_SYNTH_DRUM_LANES = [1, 2, 3, 4, 5];

// Fallback voice used only when a lane has no stored params (legacy / partial
// tracks). Mirrors the first preset (Kick), exactly like DEFAULT_SYNTH mirrors
// the first synth preset. The runtime keeps an identical copy in
// scratch-vm .../synth-drum-defaults.js.
const DEFAULT_SYNTH_DRUM = (() => {
    const {name, ...params} = SYNTH_DRUM_PRESETS[0];
    return {preset: name, ...params};
})();

// Param bag for a preset by 1-based index, ready to drop into drumVoices.
const voiceParamsForPreset = presetIndex => {
    const preset = SYNTH_DRUM_PRESETS[presetIndex - 1];
    if (!preset) return {...DEFAULT_SYNTH_DRUM};
    const {name, ...params} = preset;
    return {preset: name, ...params};
};

// Resolve a lane's voice params: a track's stored override (drumVoices keyed by
// preset index) merged over DEFAULT_SYNTH_DRUM so callers never see undefined
// fields. Mirrors getTrackSynth.
const getDrumVoice = (track, presetIndex) => {
    const voices = (track && track.drumVoices) || {};
    const v = voices[presetIndex] || {};
    const out = {...DEFAULT_SYNTH_DRUM};
    for (const k of Object.keys(DEFAULT_SYNTH_DRUM)) {
        if (v[k] !== undefined && v[k] !== null) out[k] = v[k];
    }
    // Carry the lane's preset label if it has one (the default's would be wrong
    // for non-Kick lanes that only stored a partial override).
    if (typeof v.preset === 'string') out.preset = v.preset;
    return out;
};

// Seed a full drumVoices object from a list of lane preset indices. Used when
// creating a track or sanitizing an AI track so every lane has editable params.
const drumVoicesForLanes = lanes => {
    const out = {};
    for (const idx of lanes) out[idx] = voiceParamsForPreset(idx);
    return out;
};

export {
    SYNTH_DRUM_PRESETS,
    SYNTH_DRUM_PRESET_NAMES,
    DEFAULT_SYNTH_DRUM_LANES,
    DEFAULT_SYNTH_DRUM,
    voiceParamsForPreset,
    getDrumVoice,
    drumVoicesForLanes
};
