// Default subtractive-synth params for new "synth" tracks. Mirrors the first
// preset in packages/scratch-gui/src/lib/synth-presets.js (Warm Pad). The full
// preset catalog lives on the GUI side; the runtime only needs these defaults
// to fill in missing fields on legacy/partial track.synth objects, and to
// build a voice when no synth params are present at all.

const DEFAULT_SYNTH = Object.freeze({
    preset: 'Warm Pad',
    osc1Wave: 'sawtooth',
    osc2Wave: 'sawtooth',
    osc2Detune: 9,
    oscMix: 0.5,
    filterCutoff: 0.45,
    filterResonance: 0.15,
    filterEnvAmount: 0.25,
    ampAttack: 0.03,
    ampDecay: 0.30,
    ampSustain: 0.85,
    ampRelease: 1.20,
    filterAttack: 0.05,
    filterDecay: 0.60,
    filterSustain: 0.70,
    filterRelease: 1.00,
    // LFO: a sub-audio oscillator that modulates one destination on each
    // voice. lfoDest='none' or lfoDepth=0 disables it entirely.
    // lfoRate is Hz (useful 0.1..20); lfoDepth is 0..1; lfoWave is one of
    // sine/square/sawtooth/triangle; lfoDest is 'none'|'pitch'|'filter'|'amp'.
    lfoRate: 5.0,
    lfoDepth: 0.0,
    lfoWave: 'sine',
    lfoDest: 'none',
    // Glide / portamento: seconds to slide from the previous note's pitch
    // to the new note's pitch. 0 = off. Polyphonic-friendly: each new voice
    // glides from the most-recently-scheduled pitch on the same track, so
    // chords-at-the-same-step still land in tune.
    glideTime: 0.0
});

const getTrackSynth = track => {
    const s = (track && track.synth) || {};
    const out = {};
    for (const k of Object.keys(DEFAULT_SYNTH)) {
        out[k] = (typeof s[k] === 'undefined' || s[k] === null) ? DEFAULT_SYNTH[k] : s[k];
    }
    return out;
};

module.exports = {
    DEFAULT_SYNTH,
    getTrackSynth
};
