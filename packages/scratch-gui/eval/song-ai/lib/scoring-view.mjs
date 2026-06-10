// Normalize the several shapes a result can take into ONE "scoring view" so
// metrics never branch on provenance.
//
//   view = {tempo, lengthSteps, rootPitch, scaleType,
//           tracks: [{kind, instrument?, drumLanes?, notes:[{step,durationSteps,velocity,pitch?|drum?}]}]}
//
// Inputs we normalize:
//   - magenta create_song result   -> INTERNAL song (rootPitch/scaleType)
//   - magenta generate/edit result -> a single INTERNAL track (+ ctx for key/scale)
//   - golden create_song           -> WIRE song (key/octave/scale)
//   - golden generate/edit         -> a single WIRE track (+ ctx)
// Note shapes are identical across wire/internal, so a track normalizes the
// same way regardless of provenance; only song-level key/scale differs.
import {PITCH_CLASS_NAMES, DEFAULT_ROOT_PITCH} from '../../../src/lib/scale-utils.js';

const SCALES = ['major', 'minor', 'pentatonicMajor', 'pentatonicMinor', 'chromatic'];

export const keyOctaveToRootPitch = (key, octave) => {
    const pc = PITCH_CLASS_NAMES.indexOf(key);
    if (pc < 0 || !Number.isFinite(octave)) return DEFAULT_ROOT_PITCH;
    return ((octave + 1) * 12) + pc;
};

const normTrack = t => {
    const out = {kind: t.kind, notes: []};
    if (typeof t.instrument === 'number') out.instrument = t.instrument;
    if (Array.isArray(t.drumLanes)) out.drumLanes = t.drumLanes.slice();
    out.notes = (t.notes || []).map(n => {
        const on = {
            step: n.step,
            durationSteps: n.durationSteps || 1,
            velocity: typeof n.velocity === 'number' ? n.velocity : 80
        };
        if (typeof n.pitch === 'number') on.pitch = n.pitch;
        else if (typeof n.drum === 'number') on.drum = n.drum;
        return on;
    });
    return out;
};

export const internalSongToView = song => ({
    tempo: song.tempo,
    lengthSteps: song.lengthSteps,
    rootPitch: typeof song.rootPitch === 'number' ? song.rootPitch : DEFAULT_ROOT_PITCH,
    scaleType: SCALES.indexOf(song.scaleType) >= 0 ? song.scaleType : 'major',
    tracks: (song.tracks || []).map(normTrack)
});

export const wireSongToView = wire => ({
    tempo: wire.tempo,
    lengthSteps: wire.lengthSteps,
    rootPitch: keyOctaveToRootPitch(wire.key, wire.octave),
    scaleType: SCALES.indexOf(wire.scale) >= 0 ? wire.scale : 'major',
    tracks: (wire.tracks || []).map(normTrack)
});

// Wrap a single track (wire or internal) into a one-track view using the
// musical context taken from the seed song / setting.
export const trackToView = (track, ctx) => ({
    tempo: ctx.tempo,
    lengthSteps: ctx.lengthSteps,
    rootPitch: ctx.rootPitch,
    scaleType: ctx.scaleType,
    tracks: [normTrack(track)]
});

// Build the {tempo,lengthSteps,rootPitch,scaleType} context for a case's track
// ops from its seed song (preferred) or the setting's targets.
export const contextFor = (seed, setting) => {
    if (seed) {
        return {
            tempo: seed.tempo,
            lengthSteps: seed.lengthSteps,
            rootPitch: typeof seed.rootPitch === 'number' ? seed.rootPitch : DEFAULT_ROOT_PITCH,
            scaleType: SCALES.indexOf(seed.scaleType) >= 0 ? seed.scaleType : 'major'
        };
    }
    return {
        tempo: setting.targetTempo,
        lengthSteps: setting.targetLengthSteps,
        rootPitch: keyOctaveToRootPitch(setting.targetKey, setting.targetOctave),
        scaleType: setting.targetScale
    };
};
