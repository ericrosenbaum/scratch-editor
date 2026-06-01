import {SongAiError} from '../errors.js';
import {INSTRUMENT_NAMES, DRUM_NAMES, SYNTH_PRESETS} from '../../song-defaults.js';

// Lazy import so @magenta/music (and its TensorFlow.js deps) only enter the
// bundle and only download when this provider is actually selected. Webpack
// splits this into its own chunk via the magicComment.
//
// We import narrow entry points instead of the umbrella `@magenta/music` to
// skip the large models we don't use (DDSP, GANSynth, MusicVAE, PianoGenie,
// SPICE, Coconet) and — importantly — to skip `@magenta/music/esm/core`'s
// metronome module, which imports `Tone.MembraneSynth` / `Tone.Transport` /
// `Tone.immediate`. Those have not existed since Tone.js 14, which is what
// scratch-audio brings in, so the umbrella path produces a wall of webpack
// warnings about missing exports.
let magentaPromise = null;
const loadMagenta = () => {
    if (!magentaPromise) {
        magentaPromise = Promise.all([
            import(/* webpackChunkName: "magenta" */ '@magenta/music/esm/music_rnn'),
            import(/* webpackChunkName: "magenta" */ '@magenta/music/esm/core/sequences'),
            import(/* webpackChunkName: "magenta" */ '@magenta/music/esm/protobuf')
        ]).then(([musicRnn, sequences, protobuf]) => ({
            MusicRNN: musicRnn.MusicRNN,
            sequences,
            NoteSequence: protobuf.NoteSequence
        }));
    }
    return magentaPromise;
};

// All MusicRNN-based checkpoints (basic melody RNN, drum-kit RNN, etc.) live
// under the same `music_rnn/` directory on Magenta's CDN — the per-checkpoint
// subdirectories `melody_rnn/` and `drums_rnn/` that older docs mention do
// not exist and 404.
const MELODY_RNN_URL = 'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn';
const DRUMS_RNN_URL = 'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/drum_kit_rnn';

// One initialized model per checkpoint URL, shared across calls.
const modelCache = new Map();
const getRnn = url => {
    if (modelCache.has(url)) return modelCache.get(url);
    const promise = (async () => {
        const mm = await loadMagenta();
        const rnn = new mm.MusicRNN(url);
        await rnn.initialize();
        return {mm, rnn};
    })();
    modelCache.set(url, promise);
    promise.catch(() => modelCache.delete(url));
    return promise;
};

// ===== Drum mapping =====
// Magenta drum_kit_rnn emits GM-MIDI drum pitches. Map each to one of our
// 1-based drum indices (DRUM_NAMES). For drums we don't have (toms, ride),
// fall back to the closest sound in our kit.
const STANDARD_DRUM_LANES = [2, 1, 6, 5, 4, 8]; // kick, snare, closed-hh, open-hh, crash, clap

const drumPitchToOurIndex = pitch => {
    if (pitch === 35 || pitch === 36) return 2; // kick
    if (pitch === 38 || pitch === 40 || pitch === 37) return 1; // snare / side-stick → snare
    if (pitch === 42 || pitch === 44) return 6; // closed hi-hat
    if (pitch === 46) return 5; // open hi-hat
    if (pitch === 49 || pitch === 55 || pitch === 57 || pitch === 52) return 4; // crash / china
    if (pitch === 39) return 8; // clap
    if (pitch === 51 || pitch === 53 || pitch === 59) return 6; // ride → closed hi-hat
    if (pitch === 54) return 7; // tambourine
    if (pitch === 60 || pitch === 61) return 13; // bongo
    if (pitch === 62 || pitch === 63 || pitch === 64) return 14; // conga
    if (pitch === 56) return 11; // cowbell
    if (pitch === 75) return 9; // claves
    if (pitch === 81) return 12; // triangle
    return 6; // sensible default: closed hi-hat
};

// ===== Vibe parsing =====
// Lightweight keyword spotting; everything is best-effort and falls back to
// musical defaults when no match is found.
const MOOD_KEYWORDS = {
    happy: ['happy', 'bright', 'cheerful', 'joyful', 'sunny', 'triumphant', 'celebrat'],
    sad: ['sad', 'somber', 'melancholy', 'sorrowful', 'gloomy', 'mournful'],
    dark: ['dark', 'cinematic', 'serious', 'epic', 'tense'],
    spooky: ['spooky', 'haunting', 'creepy', 'eerie', 'mysterious', 'horror', 'scary', 'ghost'],
    bluesy: ['blues', 'bluesy', 'soulful', 'gritty'],
    rock: ['rock', 'metal', 'punk', 'grunge'],
    folk: ['folk', 'whimsical', 'wholesome', 'kid', 'nursery', 'lullaby'],
    funk: ['funk', 'funky', 'groovy'],
    jazz: ['jazz', 'jazzy', 'swing', 'bebop'],
    chill: ['chill', 'lo-fi', 'lofi', 'mellow', 'dreamy', 'ambient', 'relaxed'],
    upbeat: ['upbeat', 'energetic', 'punchy', 'driving', 'dance', 'party']
};

const TEMPO_KEYWORDS = {
    slow: ['slow', 'ballad', 'sleepy', 'dreamy', 'lullaby', 'mellow'],
    fast: ['fast', 'energetic', 'punchy', 'driving', 'racing', 'frantic', 'party']
};

const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const parseExplicitKey = lower => {
    // "in F# minor", "G major", "key of A", "Bb major"
    const m = lower.match(/(?:in|key of)\s+([a-g])([#b♯♭])?\s*(major|minor|maj|min|m)?\b/);
    if (!m) return {key: null, scale: null};
    const root = m[1].toUpperCase();
    const accidental = m[2] || '';
    let pc = root;
    if (accidental === '#' || accidental === '♯') pc = `${root}#`;
    else if (accidental === 'b' || accidental === '♭') {
        // Map flats to sharps so we hit PITCH_CLASSES.
        const flatToSharp = {Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#'};
        pc = flatToSharp[`${root}b`] || root;
    }
    if (PITCH_CLASSES.indexOf(pc) < 0) return {key: null, scale: null};
    const mode = (m[3] || '').toLowerCase();
    let scale = null;
    if (mode.startsWith('min') || mode === 'm') scale = 'minor';
    else if (mode.startsWith('maj')) scale = 'major';
    return {key: pc, scale};
};

const parseVibe = text => {
    const lower = (text || '').toLowerCase();
    let mood = null;
    for (const [name, kws] of Object.entries(MOOD_KEYWORDS)) {
        if (kws.some(k => lower.includes(k))) {
            mood = name;
            break;
        }
    }
    let tempoBucket = null;
    for (const [name, kws] of Object.entries(TEMPO_KEYWORDS)) {
        if (kws.some(k => lower.includes(k))) {
            tempoBucket = name;
            break;
        }
    }
    const explicit = parseExplicitKey(lower);
    return {mood, tempoBucket, explicitKey: explicit.key, explicitScale: explicit.scale, raw: text};
};

// ===== Mood → musical settings =====
const moodToScale = mood => {
    if (mood === 'sad' || mood === 'dark' || mood === 'spooky') return 'minor';
    if (mood === 'bluesy' || mood === 'rock') return 'pentatonicMinor';
    if (mood === 'chill' || mood === 'jazz') return 'minor';
    if (mood === 'folk') return 'pentatonicMajor';
    return 'major';
};

const moodToKey = mood => {
    if (mood === 'sad' || mood === 'spooky' || mood === 'dark') return 'A';
    if (mood === 'bluesy' || mood === 'rock') return 'E';
    if (mood === 'chill') return 'D';
    return 'C';
};

const moodToTempo = (mood, tempoBucket) => {
    if (tempoBucket === 'slow') return 80;
    if (tempoBucket === 'fast') return 140;
    if (mood === 'spooky' || mood === 'sad') return 75;
    if (mood === 'chill' || mood === 'folk') return 95;
    if (mood === 'funk' || mood === 'upbeat' || mood === 'rock') return 130;
    return 110;
};

// Pick lead-instrument index based on mood. Falls back to piano.
const moodToLeadInstrument = mood => {
    if (mood === 'spooky') return 17; // Music Box
    if (mood === 'sad') return 8; // Cello
    if (mood === 'folk') return 12; // Flute
    if (mood === 'rock' || mood === 'bluesy') return 5; // Electric Guitar
    if (mood === 'funk') return 2; // Electric Piano
    if (mood === 'jazz') return 11; // Saxophone
    if (mood === 'chill') return 2; // Electric Piano
    if (mood === 'upbeat') return 19; // Marimba
    return 1; // Piano
};

// ===== Chord progressions =====
// Each chord is given as semitone offsets from the song's root pitch (the
// tonic note). Progressions are 4 chords; we'll spread them across the song.
const PROGRESSIONS = {
    major: [
        [0, 7, 9, 5], // I-V-vi-IV (axis-of-awesome)
        [0, 5, 7, 0], // I-IV-V-I
        [0, 9, 5, 7] // I-vi-IV-V (50s)
    ],
    minor: [
        [0, 8, 5, 7], // i-VI-iv-v
        [0, 5, 0, 7], // i-iv-i-v
        [0, 10, 8, 7] // i-VII-VI-v
    ],
    pentatonicMajor: [
        [0, 7, 5, 0],
        [0, 5, 7, 0]
    ],
    pentatonicMinor: [
        [0, 5, 7, 0],
        [0, 7, 5, 0]
    ],
    chromatic: [
        [0, 5, 7, 0]
    ]
};

const pickProgression = (mood, scaleType) => {
    const list = PROGRESSIONS[scaleType] || PROGRESSIONS.major;
    // Stable pick based on mood so the same mood lands on similar harmony.
    const idx = mood ? Math.abs(hashString(mood)) % list.length : 0;
    return list[idx];
};

const hashString = s => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) | 0;
    return h;
};

// ===== Key → MIDI pitch =====
const pitchClassIndex = pc => Math.max(0, PITCH_CLASSES.indexOf(pc));
const rootPitchFromKey = (key, octave) => (((octave + 1) * 12) + pitchClassIndex(key));

// ===== NoteSequence helpers =====
// We always use stepsPerQuarter=4 so one Magenta step == one of our song
// steps (since the editor pins stepsPerBeat to 4).
const STEPS_PER_QUARTER = 4;

const makeSeedSequence = (mm, notes) => mm.sequences.quantizeNoteSequence(
    mm.NoteSequence.create({
        notes: notes.map(n => ({
            pitch: n.pitch,
            startTime: n.start / (STEPS_PER_QUARTER * 2),
            endTime: n.end / (STEPS_PER_QUARTER * 2),
            isDrum: !!n.isDrum,
            velocity: n.velocity || 90
        })),
        totalTime: notes.reduce((m, n) => Math.max(m, n.end), 0) / (STEPS_PER_QUARTER * 2),
        tempos: [{time: 0, qpm: 120}]
    }),
    STEPS_PER_QUARTER
);

// ===== Drum seed patterns =====
const DRUM_SEEDS = {
    rock: [
        {pitch: 36, start: 0, end: 1, isDrum: true}, // kick
        {pitch: 42, start: 0, end: 1, isDrum: true}, // hh
        {pitch: 42, start: 2, end: 3, isDrum: true},
        {pitch: 38, start: 4, end: 5, isDrum: true}, // snare
        {pitch: 42, start: 4, end: 5, isDrum: true},
        {pitch: 42, start: 6, end: 7, isDrum: true},
        {pitch: 36, start: 8, end: 9, isDrum: true},
        {pitch: 42, start: 8, end: 9, isDrum: true},
        {pitch: 38, start: 12, end: 13, isDrum: true}
    ],
    funk: [
        {pitch: 36, start: 0, end: 1, isDrum: true},
        {pitch: 42, start: 2, end: 3, isDrum: true},
        {pitch: 38, start: 4, end: 5, isDrum: true},
        {pitch: 36, start: 6, end: 7, isDrum: true},
        {pitch: 42, start: 6, end: 7, isDrum: true},
        {pitch: 42, start: 10, end: 11, isDrum: true},
        {pitch: 38, start: 12, end: 13, isDrum: true},
        {pitch: 42, start: 14, end: 15, isDrum: true}
    ],
    chill: [
        {pitch: 36, start: 0, end: 1, isDrum: true},
        {pitch: 42, start: 4, end: 5, isDrum: true},
        {pitch: 38, start: 8, end: 9, isDrum: true},
        {pitch: 42, start: 12, end: 13, isDrum: true}
    ]
};

const pickDrumSeed = mood => {
    if (mood === 'funk' || mood === 'rock' || mood === 'upbeat') return DRUM_SEEDS.funk;
    if (mood === 'chill' || mood === 'sad' || mood === 'spooky') return DRUM_SEEDS.chill;
    return DRUM_SEEDS.rock;
};

// ===== Melody seed =====
// Build a short seed using a few notes from the first chord, in the target
// register. The RNN continues from there.
const buildMelodySeed = (rootPitch, chordOffset) => {
    const base = rootPitch + chordOffset;
    return [
        {pitch: base, start: 0, end: 2},
        {pitch: base + 4, start: 2, end: 4},
        {pitch: base + 7, start: 4, end: 6}
    ];
};

// ===== Conversion: Magenta NoteSequence → our note list =====
const noteSeqToInstrumentNotes = (seq, lengthSteps, targetRootPitch, magentaRootPitch) => {
    const transpose = targetRootPitch - magentaRootPitch;
    const notes = [];
    for (const n of (seq.notes || [])) {
        const step = Math.round(n.quantizedStartStep);
        if (step < 0 || step >= lengthSteps) continue;
        const endStep = Math.max(step + 1, Math.round(n.quantizedEndStep));
        const durationSteps = Math.min(endStep, lengthSteps) - step;
        if (durationSteps < 1) continue;
        const pitch = clamp(n.pitch + transpose, 24, 108);
        notes.push({
            step,
            durationSteps,
            pitch,
            velocity: n.velocity || 90
        });
    }
    return notes;
};

const noteSeqToDrumNotes = (seq, lengthSteps, activeLanes) => {
    const laneSet = new Set(activeLanes);
    const notes = [];
    for (const n of (seq.notes || [])) {
        const step = Math.round(n.quantizedStartStep);
        if (step < 0 || step >= lengthSteps) continue;
        let drum = drumPitchToOurIndex(n.pitch);
        // Keep the model's output inside the kit we picked when possible.
        if (!laneSet.has(drum)) drum = activeLanes[0];
        notes.push({
            step,
            durationSteps: 1,
            drum,
            velocity: n.velocity || 90
        });
    }
    return notes;
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ===== Track builders =====
const buildDrumTrack = async (lengthSteps, mood) => {
    const {mm, rnn} = await getRnn(DRUMS_RNN_URL);
    const seed = makeSeedSequence(mm, pickDrumSeed(mood));
    const stepsToGenerate = Math.max(lengthSteps - 16, 16);
    const continued = await rnn.continueSequence(seed, stepsToGenerate, 1.0);
    // Merge seed + continuation, then map to our schema.
    const allNotes = [
        ...(seed.notes || []),
        ...(continued.notes || []).map(n => ({
            ...n,
            quantizedStartStep: (n.quantizedStartStep || 0) + 16,
            quantizedEndStep: (n.quantizedEndStep || 0) + 16
        }))
    ];
    const drumNotes = noteSeqToDrumNotes({notes: allNotes}, lengthSteps, STANDARD_DRUM_LANES);
    return {
        kind: 'drum',
        drumLanes: STANDARD_DRUM_LANES.slice(),
        volume: 85,
        notes: drumNotes
    };
};

const buildMelodyTrack = async ({
    lengthSteps,
    rootPitch,
    chordOffsets,
    leadInstrumentIdx,
    leadRegister = 12 // semitones above the song's tonic to center the lead
}) => {
    const {mm, rnn} = await getRnn(MELODY_RNN_URL);
    // MelodyRNN was trained near C4; seed at C4-ish so the continuation
    // doesn't drift too far. We'll transpose to the actual key on conversion.
    const magentaRoot = 60;
    const seed = makeSeedSequence(mm, buildMelodySeed(magentaRoot, chordOffsets[0]));
    const stepsToGenerate = Math.max(lengthSteps - 8, 16);
    const continued = await rnn.continueSequence(seed, stepsToGenerate, 1.1);
    const allNotes = [
        ...(seed.notes || []),
        ...(continued.notes || []).map(n => ({
            ...n,
            quantizedStartStep: (n.quantizedStartStep || 0) + 8,
            quantizedEndStep: (n.quantizedEndStep || 0) + 8
        }))
    ];
    const notes = noteSeqToInstrumentNotes(
        {notes: allNotes},
        lengthSteps,
        rootPitch + leadRegister,
        magentaRoot
    );
    return {
        kind: 'instrument',
        instrument: leadInstrumentIdx,
        volume: 80,
        notes
    };
};

// Bass: arpeggiated root-and-fifth on each chord change. Pure rule-based.
const buildBassTrack = (lengthSteps, rootPitch, chordOffsets) => {
    const notes = [];
    const stepsPerChord = Math.max(4, Math.floor(lengthSteps / chordOffsets.length));
    const bassBase = rootPitch - 24; // two octaves down from the tonic
    for (let c = 0; c < chordOffsets.length; c++) {
        const chordStart = c * stepsPerChord;
        if (chordStart >= lengthSteps) break;
        const root = clamp(bassBase + chordOffsets[c], 28, 48);
        const fifth = clamp(root + 7, 28, 48);
        for (let s = 0; s < stepsPerChord && (chordStart + s) < lengthSteps; s += 4) {
            const isRootBeat = (s % 8) === 0;
            notes.push({
                step: chordStart + s,
                durationSteps: 3,
                pitch: isRootBeat ? root : fifth,
                velocity: isRootBeat ? 100 : 80
            });
        }
    }
    return {
        kind: 'instrument',
        instrument: 6, // Bass
        volume: 85,
        notes
    };
};

// Pad: sustained 3-note chord per progression step.
const buildPadTrack = (lengthSteps, rootPitch, chordOffsets) => {
    const notes = [];
    const stepsPerChord = Math.max(4, Math.floor(lengthSteps / chordOffsets.length));
    const padBase = rootPitch; // around C4 by default
    for (let c = 0; c < chordOffsets.length; c++) {
        const chordStart = c * stepsPerChord;
        if (chordStart >= lengthSteps) break;
        const chordRoot = padBase + chordOffsets[c];
        const dur = Math.min(stepsPerChord - 1, lengthSteps - chordStart);
        for (const offset of [0, 4, 7]) {
            notes.push({
                step: chordStart,
                durationSteps: dur,
                pitch: clamp(chordRoot + offset, 48, 84),
                velocity: 60
            });
        }
    }
    return {
        kind: 'instrument',
        instrument: 21, // Synth Pad
        volume: 65,
        effects: {reverb: 35, delay: 10},
        notes
    };
};

// ===== Operation entry points =====
const composeSong = async ({prompt, fallbackName}) => {
    const vibe = parseVibe(prompt);
    const scale = vibe.explicitScale || moodToScale(vibe.mood);
    const key = vibe.explicitKey || moodToKey(vibe.mood);
    const octave = 4;
    const tempo = moodToTempo(vibe.mood, vibe.tempoBucket);
    const lengthSteps = 32;
    const rootPitch = rootPitchFromKey(key, octave);
    const chordOffsets = pickProgression(vibe.mood, scale);
    const leadIdx = moodToLeadInstrument(vibe.mood);

    const [drumTrack, melodyTrack] = await Promise.all([
        buildDrumTrack(lengthSteps, vibe.mood),
        buildMelodyTrack({lengthSteps, rootPitch, chordOffsets, leadInstrumentIdx: leadIdx})
    ]);
    const bassTrack = buildBassTrack(lengthSteps, rootPitch, chordOffsets);
    const padTrack = buildPadTrack(lengthSteps, rootPitch, chordOffsets);

    return {
        name: (prompt || fallbackName || 'AI Song').slice(0, 40),
        tempo,
        lengthSteps,
        key,
        octave,
        scale,
        tracks: [melodyTrack, bassTrack, padTrack, drumTrack]
    };
};

const composeTrack = async ({prompt, song, kind}) => {
    const vibe = parseVibe(prompt);
    const lengthSteps = song.lengthSteps || 32;
    const rootPitch = typeof song.rootPitch === 'number' ? song.rootPitch : 60;
    const scale = song.scaleType || 'major';
    const chordOffsets = pickProgression(vibe.mood, scale);

    if (kind === 'drum') {
        return buildDrumTrack(lengthSteps, vibe.mood);
    }
    if (kind === 'synth') {
        const presetIdx = Math.abs(hashString(vibe.mood || 'default')) % SYNTH_PRESETS.length;
        const preset = SYNTH_PRESETS[presetIdx].name;
        const melodyLike = await buildMelodyTrack({
            lengthSteps,
            rootPitch,
            chordOffsets,
            leadInstrumentIdx: 1, // unused in synth branch below
            leadRegister: 7
        });
        return {
            kind: 'synth',
            synthPreset: preset,
            volume: 75,
            notes: melodyLike.notes
        };
    }
    // instrument
    const leadIdx = moodToLeadInstrument(vibe.mood);
    return buildMelodyTrack({lengthSteps, rootPitch, chordOffsets, leadInstrumentIdx: leadIdx});
};

// ===== Edit by continuation =====
// Feed the user's existing notes as the seed to continueSequence and let the
// RNN produce a related variation. This replaces the old keyword-matched
// procedural transforms — for the AI Edit modal the model is actually a good
// fit, since "given these notes, what comes next" is literally what it does.

// Inverse of drumPitchToOurIndex: pick a representative GM-MIDI pitch for
// each of our drum-lane indices so we can build a seed the drum RNN
// recognizes. Anything not in this list falls back to closed hi-hat (42),
// matching the forward mapping's default.
const ourIndexToDrumPitch = drum => {
    if (drum === 2) return 36; // kick
    if (drum === 1) return 38; // snare
    if (drum === 6) return 42; // closed hi-hat
    if (drum === 5) return 46; // open hi-hat
    if (drum === 4) return 49; // crash
    if (drum === 8) return 39; // clap
    if (drum === 7) return 54; // tambourine
    if (drum === 9) return 75; // claves
    if (drum === 11) return 56; // cowbell
    if (drum === 12) return 81; // triangle
    if (drum === 13) return 60; // bongo
    if (drum === 14) return 62; // conga
    return 42;
};

const VARIATION_TEMPERATURE = {
    subtle: 0.7,
    balanced: 1.0,
    bold: 1.4
};

const pickSeedNotes = (notes, lengthSteps, seedFrom) => {
    if (!notes || notes.length === 0) return [];
    const cutoff = seedFrom === 'first-4' ? 4 :
        seedFrom === 'all' ? lengthSteps :
            Math.max(4, Math.floor(lengthSteps / 2)); // 'first-half' default
    const taken = notes.filter(n => (n.step || 0) < cutoff);
    // If the cutoff fell before any notes (e.g. 'first-4' on a track that
    // doesn't start until step 6), keep the earliest note so we have at
    // least something to seed with.
    if (taken.length === 0) {
        const earliest = notes.reduce((a, b) => ((a.step || 0) <= (b.step || 0) ? a : b));
        return [earliest];
    }
    return taken;
};

const combineByApplyAs = ({originalNotes, seedNotes, generatedNotes, applyAs, lengthSteps}) => {
    if (applyAs === 'append') {
        // Keep originals where they are; drop the generated notes in
        // immediately after the last original note (clipped to lengthSteps).
        const originalEnd = originalNotes.reduce(
            (m, n) => Math.max(m, (n.step || 0) + (n.durationSteps || 1)),
            0
        );
        const shift = originalEnd;
        const generatedStart = generatedNotes.reduce(
            (m, n) => Math.min(m, n.step || 0),
            Infinity
        );
        const offset = generatedStart === Infinity ? 0 : shift - generatedStart;
        const shifted = generatedNotes
            .map(n => ({...n, step: (n.step || 0) + offset}))
            .filter(n => n.step >= 0 && n.step < lengthSteps);
        return [...originalNotes, ...shifted];
    }
    if (applyAs === 'layer') {
        // Keep originals at their positions; add the generated notes on top
        // at their own positions for a layered variation.
        return [...originalNotes, ...generatedNotes];
    }
    // 'replace' (default): seed portion + generated continuation, replacing
    // any of the original track that came after the seed cutoff.
    return [...seedNotes, ...generatedNotes];
};

const editTrackByContinuation = async ({song, originalTrack, editParams = {}}) => {
    const lengthSteps = song.lengthSteps || 32;
    const seedFrom = editParams.seedFrom || 'first-half';
    const variation = editParams.variation || 'balanced';
    const applyAs = editParams.applyAs || 'replace';
    const temperature = VARIATION_TEMPERATURE[variation] || 1.0;

    const originalNotes = (originalTrack.notes || []).map(n => ({...n}));

    // Empty track: nothing to seed from, so fall back to a fresh composition
    // of the same kind. Same behaviour as the old "regenerate" path.
    if (originalNotes.length === 0) {
        const fresh = await composeTrack({prompt: '', song, kind: originalTrack.kind});
        return {...fresh, kind: originalTrack.kind};
    }

    const seedNotes = pickSeedNotes(originalNotes, lengthSteps, seedFrom);
    const seedSpan = seedNotes.reduce(
        (m, n) => Math.max(m, (n.step || 0) + (n.durationSteps || 1)),
        0
    );
    const stepsToGenerate = Math.max(lengthSteps - seedSpan, 16);

    let generatedNotes;

    if (originalTrack.kind === 'drum') {
        const {mm, rnn} = await getRnn(DRUMS_RNN_URL);
        const seedForMagenta = seedNotes.map(n => ({
            pitch: ourIndexToDrumPitch(n.drum),
            start: n.step || 0,
            end: (n.step || 0) + (n.durationSteps || 1),
            isDrum: true,
            velocity: n.velocity || 90
        }));
        const seed = makeSeedSequence(mm, seedForMagenta);
        const continued = await rnn.continueSequence(seed, stepsToGenerate, temperature);
        const shifted = (continued.notes || []).map(n => ({
            ...n,
            quantizedStartStep: (n.quantizedStartStep || 0) + seedSpan,
            quantizedEndStep: (n.quantizedEndStep || 0) + seedSpan
        }));
        const activeLanes = Array.isArray(originalTrack.drumLanes) && originalTrack.drumLanes.length > 0 ?
            originalTrack.drumLanes :
            STANDARD_DRUM_LANES;
        generatedNotes = noteSeqToDrumNotes({notes: shifted}, lengthSteps, activeLanes);
    } else {
        // instrument or synth: melody RNN. Center the seed near C4 so the RNN
        // doesn't drift far, then transpose the continuation back to where
        // the user's notes actually lived.
        const {mm, rnn} = await getRnn(MELODY_RNN_URL);
        const seedPitches = seedNotes
            .map(n => n.pitch)
            .filter(p => typeof p === 'number');
        const sorted = seedPitches.slice().sort((a, b) => a - b);
        const referencePitch = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 60;
        const transposeToMagenta = 60 - referencePitch;
        const seedForMagenta = seedNotes
            .filter(n => typeof n.pitch === 'number')
            .map(n => ({
                pitch: clamp(n.pitch + transposeToMagenta, 24, 108),
                start: n.step || 0,
                end: (n.step || 0) + (n.durationSteps || 1),
                velocity: n.velocity || 90
            }));
        const seed = makeSeedSequence(mm, seedForMagenta);
        const continued = await rnn.continueSequence(seed, stepsToGenerate, temperature);
        const shifted = (continued.notes || []).map(n => ({
            ...n,
            quantizedStartStep: (n.quantizedStartStep || 0) + seedSpan,
            quantizedEndStep: (n.quantizedEndStep || 0) + seedSpan
        }));
        generatedNotes = noteSeqToInstrumentNotes(
            {notes: shifted},
            lengthSteps,
            referencePitch, // target root — transpose back to user's range
            60 // magenta root
        );
    }

    const notes = combineByApplyAs({originalNotes, seedNotes, generatedNotes, applyAs, lengthSteps});

    return {
        kind: originalTrack.kind,
        // Echo the locked fields so the orchestrator-side restore is a no-op.
        instrument: originalTrack.instrument,
        drumLanes: originalTrack.drumLanes,
        synthPreset: originalTrack.synth && originalTrack.synth.preset,
        volume: originalTrack.volume,
        notes
    };
};

// ===== Provider =====
const magentaProvider = {
    id: 'magenta',
    label: 'Magenta.js (on-device)',
    isAvailable () {
        // Magenta itself runs in any browser. We don't pre-load the model
        // here because that would force a multi-MB download on every Song
        // Maker visit; the dropdown should still surface the option.
        return Promise.resolve(true);
    },
    async callTool ({tool, context}) {
        if (!context) {
            throw new SongAiError('Magenta provider requires structured context.', 'PROVIDER');
        }
        try {
            let toolInput;
            switch (tool.name) {
            case 'create_song':
                toolInput = await composeSong(context);
                break;
            case 'generate_track':
                toolInput = await composeTrack(context);
                break;
            case 'edit_track':
                toolInput = await editTrackByContinuation(context);
                break;
            default:
                throw new SongAiError(`Magenta cannot handle tool: ${tool.name}`, 'NO_TOOL_USE');
            }
            return {toolInput, stopReason: 'end_turn', raw: null};
        } catch (err) {
            if (err?.name === 'AbortError') throw err;
            if (err instanceof SongAiError) throw err;
            throw new SongAiError(`Magenta error: ${err.message}`, 'PROVIDER');
        }
    }
};

export {magentaProvider};
// Exported for test stubbing.
export const __testables = {
    parseVibe,
    moodToScale,
    moodToKey,
    moodToTempo,
    pickProgression,
    drumPitchToOurIndex,
    ourIndexToDrumPitch,
    buildBassTrack,
    buildPadTrack,
    pickSeedNotes,
    combineByApplyAs,
    INSTRUMENT_NAMES,
    DRUM_NAMES
};
