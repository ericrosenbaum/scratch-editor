import {
    createBlankSong,
    createBlankTrack,
    newId,
    INSTRUMENT_NAMES,
    DRUM_NAMES,
    SYNTH_PRESETS,
    DEFAULT_SYNTH
} from '../song-defaults.js';
import {
    PITCH_CLASS_NAMES,
    DEFAULT_ROOT_PITCH,
    DEFAULT_SCALE_TYPE_LEGACY,
    snapNotesToScale
} from '../scale-utils.js';
import {
    SCALE_TYPE_NAMES,
    PITCH_MIN,
    PITCH_MAX,
    VELOCITY_MIN,
    VELOCITY_MAX,
    MAX_TRACKS
} from './prompts.js';

const pitchClassNameToIndex = name => {
    if (typeof name !== 'string') return null;
    const key = name
        .trim()
        .toUpperCase()
        .replace('♯', '#')
        .replace('♭', 'b');
    const flatToSharp = {Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#'};
    const normalized = flatToSharp[key] || key;
    const idx = PITCH_CLASS_NAMES.indexOf(normalized);
    return idx >= 0 ? idx : null;
};

const pitchFromKeyOctave = (pcIndex, octave) => ((octave + 1) * 12) + pcIndex;

const synthParamsFromPresetName = name => {
    const key = (typeof name === 'string' ? name.trim().toLowerCase() : '');
    const preset = SYNTH_PRESETS.find(p => p.name.toLowerCase() === key);
    if (!preset) {
        return {...DEFAULT_SYNTH};
    }
    const {name: presetName, ...params} = preset;
    return {preset: presetName, ...params};
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const effectsForModel = track => {
    const fx = (track && track.effects) || {};
    return {
        reverb: Math.round((typeof fx.reverb === 'number' ? fx.reverb : 0) * 100),
        delay: Math.round((typeof fx.delay === 'number' ? fx.delay : 0) * 100),
        filter: Math.round((typeof fx.filter === 'number' ? fx.filter : 1) * 100),
        pan: Math.round((typeof fx.pan === 'number' ? fx.pan : 0) * 50)
    };
};

const sanitizeTrack = (rt, lengthSteps, baseEffects) => {
    const rawKind = rt?.kind;
    const kind = rawKind === 'drum' ? 'drum' : (rawKind === 'synth' ? 'synth' : 'instrument');
    const track = createBlankTrack(kind);
    if (kind === 'instrument') {
        track.instrument = clamp(
            Math.round(Number(rt?.instrument) || 1),
            1,
            INSTRUMENT_NAMES.length
        );
        delete track.drum;
        delete track.drumLanes;
        delete track.synth;
    } else if (kind === 'synth') {
        track.synth = synthParamsFromPresetName(rt?.synthPreset);
        delete track.instrument;
        delete track.drum;
        delete track.drumLanes;
    } else {
        let lanes = Array.isArray(rt?.drumLanes) ? rt.drumLanes : null;
        if (lanes) {
            lanes = lanes
                .map(d => clamp(Math.round(Number(d)), 1, DRUM_NAMES.length))
                .filter((d, i, a) => a.indexOf(d) === i);
        }
        if (!lanes || lanes.length === 0) {
            const legacy = clamp(Math.round(Number(rt?.drum) || 1), 1, DRUM_NAMES.length);
            lanes = [legacy];
        }
        track.drumLanes = lanes;
        delete track.instrument;
        delete track.drum;
        delete track.synth;
    }
    const rawVolume = Number(rt?.volume);
    track.volume = clamp(
        Math.round(Number.isFinite(rawVolume) ? rawVolume : 80),
        0,
        100
    );
    track.muted = false;

    if (baseEffects) {
        track.effects = {...baseEffects};
    }
    if (rt && rt.effects && typeof rt.effects === 'object') {
        const fx = rt.effects;
        const out = {...track.effects};
        if (Number.isFinite(Number(fx.reverb))) {
            out.reverb = clamp(Number(fx.reverb), 0, 100) / 100;
        }
        if (Number.isFinite(Number(fx.delay))) {
            out.delay = clamp(Number(fx.delay), 0, 100) / 100;
        }
        if (Number.isFinite(Number(fx.filter))) {
            out.filter = clamp(Number(fx.filter), 0, 100) / 100;
        }
        if (Number.isFinite(Number(fx.pan))) {
            out.pan = clamp(Number(fx.pan), -50, 50) / 50;
        }
        if (Number.isFinite(Number(fx.distortion))) {
            out.distortion = clamp(Number(fx.distortion), 0, 100) / 100;
        }
        track.effects = out;
    }

    const rawNotes = Array.isArray(rt?.notes) ? rt.notes : [];
    track.notes = [];
    for (const rn of rawNotes) {
        if (rn && rn.rest === true) continue;
        const step = Math.round(Number(rn?.step));
        if (!Number.isFinite(step) || step < 0 || step >= lengthSteps) continue;
        const durationSteps = Math.max(1, Math.round(Number(rn?.durationSteps) || 1));
        const rawVelocity = Number(rn?.velocity);
        const velocity = clamp(
            Math.round(Number.isFinite(rawVelocity) ? rawVelocity : 80),
            VELOCITY_MIN,
            VELOCITY_MAX
        );
        const note = {step, durationSteps, velocity};
        if (kind === 'instrument' || kind === 'synth') {
            const pitch = Math.round(Number(rn?.pitch));
            if (!Number.isFinite(pitch)) continue;
            note.pitch = clamp(pitch, 0, 127);
        } else {
            const rawDrum = Math.round(Number(rn?.drum));
            const lanes = track.drumLanes;
            let drum;
            if (Number.isFinite(rawDrum) && lanes.indexOf(rawDrum) >= 0) {
                drum = rawDrum;
            } else if (Number.isFinite(rawDrum) && rawDrum >= 1 && rawDrum <= DRUM_NAMES.length) {
                drum = rawDrum;
                if (lanes.indexOf(drum) < 0) lanes.push(drum);
            } else {
                drum = lanes[0];
            }
            note.drum = drum;
        }
        track.notes.push(note);
    }

    return track;
};

const sanitizeSong = (raw, fallbackName) => {
    const safeName = (typeof raw?.name === 'string' && raw.name.trim()) ?
        raw.name.trim().slice(0, 40) :
        fallbackName;

    const song = createBlankSong(safeName);
    song.tracks = [];

    song.tempo = clamp(
        Math.round(Number(raw?.tempo) || 120),
        20,
        500
    );
    song.lengthSteps = clamp(
        Math.round(Number(raw?.lengthSteps) || 32),
        4,
        128
    );
    song.stepsPerBeat = 4;

    const pcIdx = pitchClassNameToIndex(raw?.key);
    const rawOct = Math.round(Number(raw?.octave));
    const octave = Number.isFinite(rawOct) ? clamp(rawOct, 1, 7) : 4;
    song.rootPitch = pcIdx === null ?
        DEFAULT_ROOT_PITCH :
        clamp(pitchFromKeyOctave(pcIdx, octave), PITCH_MIN, PITCH_MAX);
    song.scaleType = SCALE_TYPE_NAMES.indexOf(raw?.scale) >= 0 ?
        raw.scale :
        'major';

    const rawTracks = Array.isArray(raw?.tracks) ? raw.tracks.slice(0, MAX_TRACKS) : [];
    for (const rt of rawTracks) {
        song.tracks.push(sanitizeTrack(rt, song.lengthSteps));
    }

    if (song.tracks.length === 0) {
        song.tracks = [createBlankTrack('instrument')];
    }

    song.tracks = snapNotesToScale(song.tracks, song.rootPitch, song.scaleType);

    song.songId = newId('song');
    for (const track of song.tracks) {
        track.trackId = newId('track');
    }

    return song;
};

const stripIdsFromSong = song => {
    const rootPitch = (typeof song.rootPitch === 'number') ?
        song.rootPitch :
        DEFAULT_ROOT_PITCH;
    const scaleType = SCALE_TYPE_NAMES.indexOf(song.scaleType) >= 0 ?
        song.scaleType :
        DEFAULT_SCALE_TYPE_LEGACY;
    const keyPc = ((rootPitch % 12) + 12) % 12;
    const keyOctave = Math.floor(rootPitch / 12) - 1;
    const out = {
        tempo: song.tempo,
        lengthSteps: song.lengthSteps,
        stepsPerBeat: song.stepsPerBeat || 4,
        key: PITCH_CLASS_NAMES[keyPc],
        octave: keyOctave,
        scale: scaleType,
        tracks: (song.tracks || []).map(t => {
            const isDrum = t.kind === 'drum';
            const isSynth = t.kind === 'synth';
            const ot = {
                kind: t.kind,
                volume: t.volume,
                muted: !!t.muted,
                effects: effectsForModel(t),
                notes: (t.notes || []).map(n => {
                    const on = {
                        step: n.step,
                        durationSteps: n.durationSteps,
                        velocity: typeof n.velocity === 'number' ? n.velocity : 80
                    };
                    if (isDrum) {
                        on.drum = typeof n.drum === 'number' ? n.drum : (t.drum || 1);
                    } else if (typeof n.pitch === 'number') {
                        on.pitch = n.pitch;
                    }
                    return on;
                })
            };
            if (isDrum) {
                ot.drumLanes = Array.isArray(t.drumLanes) && t.drumLanes.length > 0 ?
                    t.drumLanes.slice() :
                    [t.drum || 1];
            } else if (isSynth) {
                ot.synthPreset = (t.synth && t.synth.preset) || DEFAULT_SYNTH.preset;
            } else {
                ot.instrument = t.instrument;
            }
            return ot;
        })
    };
    return out;
};

export {
    sanitizeTrack,
    sanitizeSong,
    stripIdsFromSong
};
