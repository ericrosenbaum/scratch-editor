// Subtractive-synth presets for the Song Maker "synth" track kind.
//
// Each preset is a flat bag of params consumed by the scheduler's
// _scheduleSynthNote. UI sliders edit the same fields in-place on
// `track.synth`. `preset` is a label only — tweaking sliders does NOT clear
// it (no dirty indicator in v1).
//
// Parameter ranges (kept dimensionless so the scheduler owns the physical
// mapping):
//   osc1Wave/osc2Wave  'sine' | 'square' | 'sawtooth' | 'triangle'
//   osc2Detune         cents, -50..50
//   oscMix             0..1 (0 = osc1 only, 1 = osc2 only)
//   filterCutoff       0..1 -> ~80..12000 Hz (exponential)
//   filterResonance    0..1 -> Q 0.7..18
//   filterEnvAmount    0..1 -> 0..4 octaves of cutoff sweep at envelope peak
//   ampAttack/Decay/Release    seconds
//   ampSustain         0..1
//   filterAttack/Decay/Release seconds
//   filterSustain      0..1
//   lfoRate            Hz, ~0.1..20
//   lfoDepth           0..1
//   lfoWave            'sine' | 'square' | 'sawtooth' | 'triangle'
//   lfoDest            'none' | 'pitch' | 'filter' | 'amp'
//   glideTime          seconds, 0..2 (0 = off)

const SYNTH_PRESETS = [
    {name: 'Warm Pad',
        osc1Wave: 'sawtooth', osc2Wave: 'sawtooth', osc2Detune: 9, oscMix: 0.5,
        filterCutoff: 0.45, filterResonance: 0.15, filterEnvAmount: 0.25,
        ampAttack: 0.03, ampDecay: 0.30, ampSustain: 0.85, ampRelease: 1.20,
        filterAttack: 0.05, filterDecay: 0.60, filterSustain: 0.70, filterRelease: 1.00,
        lfoRate: 5.0, lfoDepth: 0.0, lfoWave: 'sine', lfoDest: 'none',
        glideTime: 0.0},
    {name: 'Soft Strings',
        osc1Wave: 'sawtooth', osc2Wave: 'sawtooth', osc2Detune: 4, oscMix: 0.5,
        filterCutoff: 0.55, filterResonance: 0.10, filterEnvAmount: 0.20,
        ampAttack: 0.3, ampDecay: 0.40, ampSustain: 0.90, ampRelease: 0.80,
        filterAttack: 0.4, filterDecay: 0.50, filterSustain: 0.70, filterRelease: 0.70,
        // Gentle vibrato — a believable string section breathes a bit.
        lfoRate: 5.5, lfoDepth: 0.05, lfoWave: 'sine', lfoDest: 'pitch',
        glideTime: 0.0},
    {name: 'Pluck Lead',
        osc1Wave: 'sawtooth', osc2Wave: 'square', osc2Detune: 0, oscMix: 0.35,
        filterCutoff: 0.65, filterResonance: 0.35, filterEnvAmount: 0.60,
        ampAttack: 0.002, ampDecay: 0.18, ampSustain: 0.00, ampRelease: 0.15,
        filterAttack: 0.001, filterDecay: 0.16, filterSustain: 0.00, filterRelease: 0.15,
        lfoRate: 5.0, lfoDepth: 0.0, lfoWave: 'sine', lfoDest: 'none',
        glideTime: 0.0},
    {name: 'Detuned Saw Lead',
        osc1Wave: 'sawtooth', osc2Wave: 'sawtooth', osc2Detune: 12, oscMix: 0.5,
        filterCutoff: 0.70, filterResonance: 0.25, filterEnvAmount: 0.40,
        ampAttack: 0.01, ampDecay: 0.20, ampSustain: 0.70, ampRelease: 0.25,
        filterAttack: 0.01, filterDecay: 0.30, filterSustain: 0.60, filterRelease: 0.25,
        lfoRate: 5.0, lfoDepth: 0.0, lfoWave: 'sine', lfoDest: 'none',
        // Light glide makes consecutive lead notes feel connected.
        glideTime: 0.03},
    {name: 'Square Lead',
        osc1Wave: 'square', osc2Wave: 'square', osc2Detune: -5, oscMix: 0.4,
        filterCutoff: 0.75, filterResonance: 0.20, filterEnvAmount: 0.30,
        ampAttack: 0.005, ampDecay: 0.10, ampSustain: 0.80, ampRelease: 0.15,
        filterAttack: 0.005, filterDecay: 0.10, filterSustain: 0.70, filterRelease: 0.15,
        lfoRate: 5.0, lfoDepth: 0.0, lfoWave: 'sine', lfoDest: 'none',
        glideTime: 0.0},
    {name: 'Sub Bass',
        osc1Wave: 'sine', osc2Wave: 'triangle', osc2Detune: 0, oscMix: 0.2,
        filterCutoff: 0.35, filterResonance: 0.10, filterEnvAmount: 0.10,
        ampAttack: 0.005, ampDecay: 0.20, ampSustain: 0.90, ampRelease: 0.10,
        filterAttack: 0.005, filterDecay: 0.15, filterSustain: 0.80, filterRelease: 0.10,
        lfoRate: 5.0, lfoDepth: 0.0, lfoWave: 'sine', lfoDest: 'none',
        // Classic mono-bass slide between notes.
        glideTime: 0.08},
    {name: 'Reese Bass',
        osc1Wave: 'sawtooth', osc2Wave: 'sawtooth', osc2Detune: 14, oscMix: 0.5,
        filterCutoff: 0.45, filterResonance: 0.40, filterEnvAmount: 0.50,
        ampAttack: 0.005, ampDecay: 0.20, ampSustain: 0.85, ampRelease: 0.20,
        filterAttack: 0.005, filterDecay: 0.25, filterSustain: 0.70, filterRelease: 0.20,
        lfoRate: 5.0, lfoDepth: 0.0, lfoWave: 'sine', lfoDest: 'none',
        glideTime: 0.12},
    {name: 'Acid Bass',
        osc1Wave: 'sawtooth', osc2Wave: 'square', osc2Detune: 0, oscMix: 0.15,
        // High resonance + big filter env sweep is the 303 fingerprint.
        filterCutoff: 0.28, filterResonance: 0.80, filterEnvAmount: 0.85,
        ampAttack: 0.002, ampDecay: 0.25, ampSustain: 0.40, ampRelease: 0.12,
        filterAttack: 0.002, filterDecay: 0.30, filterSustain: 0.10, filterRelease: 0.18,
        lfoRate: 5.0, lfoDepth: 0.0, lfoWave: 'sine', lfoDest: 'none',
        glideTime: 0.06},
    {name: 'Bell',
        osc1Wave: 'sine', osc2Wave: 'sine', osc2Detune: 24, oscMix: 0.35,
        filterCutoff: 0.85, filterResonance: 0.10, filterEnvAmount: 0.00,
        ampAttack: 0.001, ampDecay: 1.40, ampSustain: 0.00, ampRelease: 1.00,
        filterAttack: 0.001, filterDecay: 0.50, filterSustain: 0.30, filterRelease: 0.50,
        lfoRate: 5.0, lfoDepth: 0.0, lfoWave: 'sine', lfoDest: 'none',
        glideTime: 0.0},
    {name: 'Wobble',
        osc1Wave: 'sawtooth', osc2Wave: 'square', osc2Detune: -7, oscMix: 0.5,
        filterCutoff: 0.40, filterResonance: 0.50, filterEnvAmount: 0.70,
        ampAttack: 0.02, ampDecay: 0.30, ampSustain: 0.60, ampRelease: 0.30,
        filterAttack: 0.02, filterDecay: 0.50, filterSustain: 0.20, filterRelease: 0.40,
        // The whole point of Wobble — heavy filter LFO at dub-step rate.
        lfoRate: 5.5, lfoDepth: 0.7, lfoWave: 'sine', lfoDest: 'filter',
        glideTime: 0.0},
    {name: 'Hollow Flute',
        osc1Wave: 'triangle', osc2Wave: 'sine', osc2Detune: 0, oscMix: 0.35,
        filterCutoff: 0.60, filterResonance: 0.20, filterEnvAmount: 0.15,
        ampAttack: 0.08, ampDecay: 0.20, ampSustain: 0.85, ampRelease: 0.30,
        filterAttack: 0.05, filterDecay: 0.20, filterSustain: 0.80, filterRelease: 0.30,
        // Flautists vibrato their sustained notes.
        lfoRate: 4.5, lfoDepth: 0.06, lfoWave: 'sine', lfoDest: 'pitch',
        glideTime: 0.0},
    {name: 'Glass Pad',
        osc1Wave: 'triangle', osc2Wave: 'sine', osc2Detune: 7, oscMix: 0.5,
        filterCutoff: 0.70, filterResonance: 0.10, filterEnvAmount: 0.20,
        ampAttack: 0.4, ampDecay: 0.50, ampSustain: 0.80, ampRelease: 1.00,
        filterAttack: 0.5, filterDecay: 0.50, filterSustain: 0.70, filterRelease: 0.90,
        // Slow filter sweep gives the pad some movement.
        lfoRate: 0.4, lfoDepth: 0.15, lfoWave: 'sine', lfoDest: 'filter',
        glideTime: 0.0},
    {name: 'Buzz Stab',
        osc1Wave: 'square', osc2Wave: 'sawtooth', osc2Detune: -12, oscMix: 0.55,
        filterCutoff: 0.55, filterResonance: 0.45, filterEnvAmount: 0.80,
        ampAttack: 0.001, ampDecay: 0.10, ampSustain: 0.00, ampRelease: 0.05,
        filterAttack: 0.001, filterDecay: 0.08, filterSustain: 0.00, filterRelease: 0.05,
        lfoRate: 5.0, lfoDepth: 0.0, lfoWave: 'sine', lfoDest: 'none',
        glideTime: 0.0},
    {name: 'Synth Drum',
        // Sine body + a touch of square gives both thump and click; the
        // resonant filter snap on top is what reads as "percussive".
        osc1Wave: 'sine', osc2Wave: 'square', osc2Detune: 0, oscMix: 0.18,
        filterCutoff: 0.30, filterResonance: 0.70, filterEnvAmount: 0.80,
        ampAttack: 0.001, ampDecay: 0.12, ampSustain: 0.00, ampRelease: 0.04,
        filterAttack: 0.001, filterDecay: 0.06, filterSustain: 0.00, filterRelease: 0.04,
        lfoRate: 5.0, lfoDepth: 0.0, lfoWave: 'sine', lfoDest: 'none',
        glideTime: 0.0}
];

const DEFAULT_SYNTH = (() => {
    const first = SYNTH_PRESETS[0];
    return {
        preset: first.name,
        osc1Wave: first.osc1Wave,
        osc2Wave: first.osc2Wave,
        osc2Detune: first.osc2Detune,
        oscMix: first.oscMix,
        filterCutoff: first.filterCutoff,
        filterResonance: first.filterResonance,
        filterEnvAmount: first.filterEnvAmount,
        ampAttack: first.ampAttack,
        ampDecay: first.ampDecay,
        ampSustain: first.ampSustain,
        ampRelease: first.ampRelease,
        filterAttack: first.filterAttack,
        filterDecay: first.filterDecay,
        filterSustain: first.filterSustain,
        filterRelease: first.filterRelease,
        lfoRate: first.lfoRate,
        lfoDepth: first.lfoDepth,
        lfoWave: first.lfoWave,
        lfoDest: first.lfoDest,
        glideTime: first.glideTime
    };
})();

// Merge a track's partial/legacy synth params over the defaults so the
// scheduler never has to defend against undefined fields.
const getTrackSynth = (track) => {
    const s = (track && track.synth) || {};
    const out = {...DEFAULT_SYNTH};
    for (const k of Object.keys(DEFAULT_SYNTH)) {
        if (s[k] !== undefined && s[k] !== null) out[k] = s[k];
    }
    return out;
};

export {SYNTH_PRESETS, DEFAULT_SYNTH, getTrackSynth};
