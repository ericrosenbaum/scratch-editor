// Default percussion-voice params for "synthDrum" tracks. Mirrors the first
// preset (Kick) in packages/scratch-gui/src/lib/synth-drum-presets.js. The full
// preset catalog lives on the GUI side; the runtime only needs these defaults
// to fill in missing fields on legacy/partial track.drumVoices objects, and to
// build a voice when a lane has no stored params at all.
//
// See synth-drum-voice.js (buildPercussionVoice) for the physical mapping of
// each field.

const DEFAULT_SYNTH_DRUM = Object.freeze({
    preset: 'Kick',
    bodyWave: 'sine',
    tune: 0.10,
    pitchEnv: 0.55,
    pitchDecay: 0.05,
    bodyLevel: 1.0,
    bodyDecay: 0.40,
    noiseLevel: 0.0,
    noiseColor: 0.5,
    noiseDecay: 0.05,
    drive: 0.25
});

// Resolve a lane's voice params: a track's stored override (drumVoices keyed by
// preset index) merged over DEFAULT_SYNTH_DRUM. Mirrors getTrackSynth /
// the GUI's getDrumVoice. presetIndex is 1-based; drumVoices keys are the same
// indices (string keys in serialized JSON — bracket access coerces fine).
const getDrumVoice = (track, presetIndex) => {
    const voices = (track && track.drumVoices) || {};
    const v = voices[presetIndex] || {};
    const out = {...DEFAULT_SYNTH_DRUM};
    for (const k of Object.keys(DEFAULT_SYNTH_DRUM)) {
        if (v[k] !== undefined && v[k] !== null) out[k] = v[k];
    }
    return out;
};

module.exports = {
    DEFAULT_SYNTH_DRUM,
    getDrumVoice
};
