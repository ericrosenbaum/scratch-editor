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

// Coconet (Bach-style counterpoint) for harmonization + infill, and MusicVAE
// for melodic variation. Both ship in @magenta/music but the narrow esm entry
// points keep them out of the bundle until a harmonize/infill/vary edit is
// actually requested. (Coconet's coconet_utils reads navigator.userAgent at
// import; that's fine in the browser this runs in.)
const COCONET_URL = 'https://storage.googleapis.com/magentadata/js/checkpoints/coconet/bach';
const MUSICVAE_MEL_URL = 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_2bar_small';

let coconetClassPromise = null;
const loadCoconetClass = () => {
    if (!coconetClassPromise) {
        coconetClassPromise = import(/* webpackChunkName: "magenta-extra" */ '@magenta/music/esm/coconet')
            .then(m => m.Coconet);
    }
    return coconetClassPromise;
};
const coconetCache = new Map();
const getCoconet = (url = COCONET_URL) => {
    if (coconetCache.has(url)) return coconetCache.get(url);
    const promise = (async () => {
        const [mm, Coconet] = await Promise.all([loadMagenta(), loadCoconetClass()]);
        const model = new Coconet(url);
        await model.initialize();
        return {mm, model};
    })();
    coconetCache.set(url, promise);
    promise.catch(() => coconetCache.delete(url));
    return promise;
};

let vaeClassPromise = null;
const loadVaeClass = () => {
    if (!vaeClassPromise) {
        vaeClassPromise = import(/* webpackChunkName: "magenta-extra" */ '@magenta/music/esm/music_vae')
            .then(m => m.MusicVAE);
    }
    return vaeClassPromise;
};
const vaeCache = new Map();
const getMusicVae = (url = MUSICVAE_MEL_URL) => {
    if (vaeCache.has(url)) return vaeCache.get(url);
    const promise = (async () => {
        const [mm, MusicVAE] = await Promise.all([loadMagenta(), loadVaeClass()]);
        const model = new MusicVAE(url);
        await model.initialize();
        return {mm, model};
    })();
    vaeCache.set(url, promise);
    promise.catch(() => vaeCache.delete(url));
    return promise;
};

// ===== Drum mapping =====
// Magenta drum_kit_rnn emits GM-MIDI drum pitches. Map each to one of our
// 1-based drum indices (DRUM_NAMES). For drums we don't have (toms, ride),
// fall back to the closest sound in our kit.
const STANDARD_DRUM_LANES = [2, 1, 6, 5, 4, 8]; // kick, snare, closed-hh, open-hh, crash, clap

// Translation between the sampled drum catalog (DRUM_NAMES, used by the Magenta
// drum RNN machinery) and the synthesized-drum preset catalog. Lets Magenta
// generate/edit synthDrum tracks by reusing its drum model and remapping each
// kit piece to the nearest synth-drum preset. The common kit pieces (kick,
// snare, hats, clap, toms, cowbell, clave, cymbal) round-trip cleanly.
const SAMPLED_TO_SYNTHDRUM = {
    1: 2,
    2: 1,
    3: 6,
    4: 12,
    5: 4,
    6: 3,
    7: 3,
    8: 5,
    9: 11,
    10: 11,
    11: 10,
    12: 3,
    13: 8,
    14: 7,
    15: 3,
    16: 3,
    17: 6,
    18: 9
};
const SYNTHDRUM_TO_SAMPLED = {
    1: 2,
    2: 1,
    3: 6,
    4: 5,
    5: 8,
    6: 3,
    7: 14,
    8: 13,
    9: 18,
    10: 11,
    11: 9,
    12: 4,
    13: 2
};
const mapSampledToSynthDrum = d => SAMPLED_TO_SYNTHDRUM[d] || 1;
const mapSynthDrumToSampled = d => SYNTHDRUM_TO_SAMPLED[d] || 2;

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
    happy: ['happy', 'bright', 'cheerful', 'joyful', 'sunny', 'triumphant', 'celebrat',
        'chiptune', 'chip-tune', '8-bit', '8 bit', '8bit', 'retro', 'arcade', 'march', 'parade'],
    sad: ['sad', 'somber', 'melancholy', 'sorrowful', 'gloomy', 'mournful', 'lonely'],
    dark: ['dark', 'cinematic', 'serious', 'epic', 'tense', 'dramatic', 'intense', 'boss'],
    spooky: ['spooky', 'haunting', 'creepy', 'eerie', 'mysterious', 'horror', 'scary', 'ghost', 'maze'],
    bluesy: ['blues', 'bluesy', 'soulful', 'gritty'],
    rock: ['rock', 'metal', 'punk', 'grunge', 'guitar'],
    folk: ['folk', 'whimsical', 'wholesome', 'kid', 'nursery', 'lullaby', 'sing-along', 'singalong'],
    funk: ['funk', 'funky', 'groovy', 'disco'],
    jazz: ['jazz', 'jazzy', 'swing', 'bebop'],
    chill: ['chill', 'lo-fi', 'lofi', 'mellow', 'dreamy', 'ambient', 'relaxed', 'underwater', 'floating', 'calm'],
    upbeat: ['upbeat', 'energetic', 'punchy', 'driving', 'dance', 'party', 'racing', 'race']
};

const TEMPO_KEYWORDS = {
    slow: ['slow', 'ballad', 'sleepy', 'dreamy', 'lullaby', 'mellow'],
    fast: ['fast', 'energetic', 'punchy', 'driving', 'racing', 'frantic', 'party']
};

// Explicit "130 bpm" / "tempo 120" → honor it directly instead of bucketing.
const parseExplicitTempo = lower => {
    const m = lower.match(/(\d{2,3})\s*bpm\b/) || lower.match(/\btempo\s*[:=]?\s*(\d{2,3})\b/);
    if (!m) return null;
    const t = parseInt(m[1], 10);
    return (t >= 40 && t <= 240) ? t : null;
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
    return {
        mood,
        tempoBucket,
        explicitKey: explicit.key,
        explicitScale: explicit.scale,
        explicitTempo: parseExplicitTempo(lower),
        raw: text
    };
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
        {pitch: 42, start: 10, end: 11, isDrum: true},
        {pitch: 38, start: 12, end: 13, isDrum: true}, // snare (beat 4)
        {pitch: 42, start: 12, end: 13, isDrum: true},
        {pitch: 42, start: 14, end: 15, isDrum: true} // steady eighth-note hats through the bar
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
    // The seed is a one-bar (16-step) groove, but quantizeNoteSequence sizes the
    // sequence to the *last hit* — step 13 for the rock/chill seeds, 15 for funk.
    // continueSequence then continues from that step, so offsetting the result by
    // a fixed 16 left a 1-3 step gap and pushed the whole continuation off the
    // beat. Pin the seed to a full bar so the model continues on the next
    // downbeat and the offset matches the seed length exactly.
    const barSteps = 16;
    seed.totalQuantizedSteps = barSteps;
    const stepsToGenerate = Math.max(lengthSteps - barSteps, 16);
    const continued = await rnn.continueSequence(seed, stepsToGenerate, 1.0);
    // Merge seed + continuation, then map to our schema.
    const allNotes = [
        ...(seed.notes || []),
        ...(continued.notes || []).map(n => ({
            ...n,
            quantizedStartStep: (n.quantizedStartStep || 0) + barSteps,
            quantizedEndStep: (n.quantizedEndStep || 0) + barSteps
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
    // Pin the seed length to the offset (same off-beat bug as the drum track):
    // the seed's notes only reach step 6, so without this the continuation would
    // be placed two steps past where the model actually continued from.
    const seedSteps = 8;
    seed.totalQuantizedSteps = seedSteps;
    const stepsToGenerate = Math.max(lengthSteps - seedSteps, 16);
    const continued = await rnn.continueSequence(seed, stepsToGenerate, 1.1);
    const allNotes = [
        ...(seed.notes || []),
        ...(continued.notes || []).map(n => ({
            ...n,
            quantizedStartStep: (n.quantizedStartStep || 0) + seedSteps,
            quantizedEndStep: (n.quantizedEndStep || 0) + seedSteps
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
    const tempo = vibe.explicitTempo || moodToTempo(vibe.mood, vibe.tempoBucket);
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
    if (kind === 'synthDrum') {
        // Reuse the drum RNN, then remap the sampled kit pieces to synth-drum
        // presets. sanitizeTrack dedupes lanes and seeds drumVoices downstream.
        const dt = await buildDrumTrack(lengthSteps, vibe.mood);
        return {
            kind: 'synthDrum',
            drumLanes: dt.drumLanes.map(mapSampledToSynthDrum),
            volume: dt.volume,
            notes: dt.notes.map(n => ({...n, drum: mapSampledToSynthDrum(n.drum)}))
        };
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

    if (originalTrack.kind === 'drum' || originalTrack.kind === 'synthDrum') {
        // synthDrum reuses the drum RNN: translate its lanes/notes to the
        // sampled-drum index space for Magenta, then map the result back.
        const isSynthDrum = originalTrack.kind === 'synthDrum';
        const toSampledDrum = d => (isSynthDrum ? mapSynthDrumToSampled(d) : d);
        const {mm, rnn} = await getRnn(DRUMS_RNN_URL);
        const seedForMagenta = seedNotes.map(n => ({
            pitch: ourIndexToDrumPitch(toSampledDrum(n.drum)),
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
        const rawActiveLanes = Array.isArray(originalTrack.drumLanes) && originalTrack.drumLanes.length > 0 ?
            originalTrack.drumLanes :
            STANDARD_DRUM_LANES;
        const activeLanes = isSynthDrum ? rawActiveLanes.map(mapSynthDrumToSampled) : rawActiveLanes;
        generatedNotes = noteSeqToDrumNotes({notes: shifted}, lengthSteps, activeLanes);
        if (isSynthDrum) {
            generatedNotes = generatedNotes.map(n => ({...n, drum: mapSampledToSynthDrum(n.drum)}));
        }
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

// ===== Coconet / MusicVAE edit modes =====
// These cover what MusicRNN continuation cannot: harmonizing a melody and
// infilling a gap (Coconet), and producing a true latent-space variation
// (MusicVAE). All are best-effort — any model/network failure falls back to
// the continuation path so an edit always returns something usable.
const COCONET_MIN = 36; // Coconet's Bach pitch range
const COCONET_MAX = 81;
// Coconet runs Gibbs sampling; 32 passes is a good quality/speed point on the
// browser's WebGL backend. The eval harness (Node CPU backend) can lower this
// via MAGENTA_COCONET_ITERS to keep batch runs tractable.
const COCONET_ITERS = (typeof process !== 'undefined' && process.env &&
    parseInt(process.env.MAGENTA_COCONET_ITERS, 10)) || 32;

const medianPitch = notes => {
    const ps = notes.map(n => n.pitch).filter(p => typeof p === 'number')
        .sort((a, b) => a - b);
    return ps.length ? ps[Math.floor(ps.length / 2)] : 60;
};

// Whole-octave shift that lands `median` inside [lo, hi].
const octaveShiftIntoRange = (median, lo, hi) => {
    let shift = 0;
    while (median + shift < lo) shift += 12;
    while (median + shift > hi) shift -= 12;
    return shift;
};

// The pitched sibling track with the most notes — treated as "the melody".
const pickMelodyTrack = (song, excludeIndex) => {
    let best = null;
    (song.tracks || []).forEach((t, i) => {
        if (i === excludeIndex) return;
        if (t.kind !== 'instrument' && t.kind !== 'synth') return;
        const count = (t.notes || []).filter(n => typeof n.pitch === 'number').length;
        if (count > 0 && (!best || count > best.count)) best = {track: t, count};
    });
    return best ? best.track : null;
};

// Strictly monophonic, clipped to [0, span): MusicVAE's melody converter
// rejects overlapping notes.
const monophonic = (notes, span) => {
    const sorted = notes
        .filter(n => typeof n.pitch === 'number' && (n.step || 0) < span)
        .map(n => ({
            step: n.step || 0,
            durationSteps: Math.max(1, n.durationSteps || 1),
            pitch: n.pitch,
            velocity: n.velocity || 90
        }))
        .sort((a, b) => a.step - b.step);
    const out = [];
    for (let i = 0; i < sorted.length; i++) {
        const cur = sorted[i];
        if (out.length && cur.step === out[out.length - 1].step) continue; // one note per onset
        const next = sorted[i + 1];
        const maxEnd = next ? next.step : span;
        const end = Math.min(cur.step + cur.durationSteps, maxEnd, span);
        if (end - cur.step >= 1) out.push({...cur, durationSteps: end - cur.step});
    }
    return out;
};

const echoLockedFields = (originalTrack, notes) => ({
    kind: originalTrack.kind,
    instrument: originalTrack.instrument,
    drumLanes: originalTrack.drumLanes,
    synthPreset: originalTrack.synth && originalTrack.synth.preset,
    volume: originalTrack.volume,
    notes
});

const harmonizeTrack = async context => {
    const {song, originalTrack, trackIndex} = context;
    const lengthSteps = song.lengthSteps || 32;
    const melodyTrack = pickMelodyTrack(song, trackIndex);
    const melodyNotes = melodyTrack ?
        (melodyTrack.notes || []).filter(n => typeof n.pitch === 'number') : [];
    if (melodyNotes.length === 0) return editTrackByContinuation(context);

    const shift = octaveShiftIntoRange(medianPitch(melodyNotes), COCONET_MIN, COCONET_MAX);
    const {mm, model} = await getCoconet();
    const seq = mm.NoteSequence.create({
        notes: melodyNotes.map(n => ({
            pitch: clamp(n.pitch + shift, COCONET_MIN, COCONET_MAX),
            quantizedStartStep: n.step || 0,
            quantizedEndStep: Math.max((n.step || 0) + 1, (n.step || 0) + (n.durationSteps || 1)),
            instrument: 0,
            program: 0
        })),
        quantizationInfo: {stepsPerQuarter: 4},
        totalQuantizedSteps: lengthSteps
    });
    const filled = await model.infill(seq, {numIterations: COCONET_ITERS, temperature: 0.99});
    // Coconet emits a dense 4-part chorale; collapse the three lower voices
    // (alto/tenor/bass) into clean block chords on the beat grid so the result
    // reads as a pad/harmony track rather than a wall of one-step notes.
    const lowVoices = (filled.notes || []).filter(n => (n.instrument || 0) >= 1);
    const beat = 4;
    const harmony = [];
    const seen = new Set();
    for (let b = 0; b < lengthSteps; b += beat) {
        for (const voice of [1, 2, 3]) {
            const note = lowVoices.find(n =>
                (n.instrument || 0) === voice &&
                (n.quantizedStartStep || 0) <= b &&
                (n.quantizedEndStep || 0) > b);
            if (!note) continue;
            const pitch = clamp((note.pitch || 60) - shift, 24, 108);
            const key = `${b}:${pitch}`;
            if (seen.has(key)) continue;
            seen.add(key);
            harmony.push({step: b, durationSteps: beat, pitch, velocity: 66});
        }
    }
    return echoLockedFields(originalTrack, harmony);
};

const infillTrack = async context => {
    const {song, originalTrack, editParams} = context;
    const lengthSteps = song.lengthSteps || 32;
    const from = editParams && editParams.maskFromStep;
    const to = editParams && editParams.maskToStep;
    const melodyNotes = (originalTrack.notes || []).filter(n => typeof n.pitch === 'number');
    if (melodyNotes.length === 0 || typeof from !== 'number' || typeof to !== 'number') {
        return editTrackByContinuation(context);
    }
    const shift = octaveShiftIntoRange(medianPitch(melodyNotes), COCONET_MIN, COCONET_MAX);
    const {mm, model} = await getCoconet();
    const seq = mm.NoteSequence.create({
        notes: melodyNotes.map(n => ({
            pitch: clamp(n.pitch + shift, COCONET_MIN, COCONET_MAX),
            quantizedStartStep: n.step || 0,
            quantizedEndStep: Math.max((n.step || 0) + 1, (n.step || 0) + (n.durationSteps || 1)),
            instrument: 0,
            program: 0
        })),
        quantizationInfo: {stepsPerQuarter: 4},
        totalQuantizedSteps: lengthSteps
    });
    const infillMask = [];
    for (let s = from; s < to; s++) infillMask.push({step: s, voice: 0});
    const filled = await model.infill(seq, {numIterations: COCONET_ITERS, temperature: 0.99, infillMask});
    const gapNotes = (filled.notes || [])
        .filter(n => (n.instrument || 0) === 0)
        .filter(n => (n.quantizedStartStep || 0) >= from && (n.quantizedStartStep || 0) < to)
        .map(n => ({
            step: Math.round(n.quantizedStartStep || 0),
            durationSteps: Math.max(1, Math.round((n.quantizedEndStep || 0) - (n.quantizedStartStep || 0))),
            pitch: clamp((n.pitch || 60) - shift, 24, 108),
            velocity: 85
        }));
    const notes = [...melodyNotes.map(n => ({...n})), ...gapNotes]
        .filter(n => (n.step || 0) >= 0 && (n.step || 0) < lengthSteps);
    return echoLockedFields(originalTrack, notes);
};

// Higher = closer to the original. Kept high so a "variation" preserves the
// melody's density/character rather than wandering into a sparse new line.
const VARIATION_SIMILARITY = {subtle: 0.95, balanced: 0.85, bold: 0.7};

const varyTrack = async context => {
    const {song, originalTrack, editParams} = context;
    const lengthSteps = song.lengthSteps || 32;
    const span = 32; // MusicVAE mel_2bar is a fixed 2-bar (32-step) model
    const mono = monophonic((originalTrack.notes || []), span);
    if (mono.length === 0) return editTrackByContinuation(context);

    const {mm, model} = await getMusicVae();
    const seq = mm.NoteSequence.create({
        notes: mono.map(n => ({
            pitch: clamp(n.pitch, 24, 108),
            quantizedStartStep: n.step,
            quantizedEndStep: Math.min(span, n.step + n.durationSteps),
            program: 0
        })),
        quantizationInfo: {stepsPerQuarter: 4},
        totalQuantizedSteps: span
    });
    const similarity = VARIATION_SIMILARITY[(editParams && editParams.variation)] || 0.7;
    const temperature = (editParams && editParams.variation === 'bold') ? 0.9 : 0.6;
    const outs = await model.similar(seq, 1, similarity, temperature);
    const out = Array.isArray(outs) ? outs[0] : outs;
    const vaeNotes = (out.notes || [])
        .slice()
        .sort((a, b) => (a.quantizedStartStep || 0) - (b.quantizedStartStep || 0));
    if (vaeNotes.length === 0) return editTrackByContinuation(context);

    // Re-pitch the ORIGINAL rhythm with MusicVAE's varied melodic contour: keep
    // the part's note density and phrasing (so it still reads as the same idea)
    // while the pitches genuinely change. Using the decoder's own rhythm tends
    // to thin the line out, which scores — and sounds — worse than a variation
    // that preserves the groove.
    const pitchAtStep = step => {
        let best = null;
        for (const n of vaeNotes) {
            if ((n.quantizedStartStep || 0) <= step) best = n;
            else break;
        }
        return best ? clamp(best.pitch || 60, 24, 108) : null;
    };
    const notes = mono
        .map(n => {
            const p = pitchAtStep(n.step);
            return {...n, pitch: p === null ? n.pitch : p};
        })
        .filter(n => (n.step || 0) < lengthSteps);
    return echoLockedFields(originalTrack, notes);
};

// Route an edit to the right engine. Unknown/`continue` modes — and any
// Coconet/MusicVAE failure — use the MusicRNN continuation path.
const editTrack = async context => {
    const mode = context.editParams && context.editParams.mode;
    try {
        if (mode === 'harmonize') return await harmonizeTrack(context);
        if (mode === 'infill') return await infillTrack(context);
        if (mode === 'vary') return await varyTrack(context);
    } catch (err) {
        if (err && err.name === 'AbortError') throw err;
        // fall through to continuation
    }
    return editTrackByContinuation(context);
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
                toolInput = await editTrack(context);
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
