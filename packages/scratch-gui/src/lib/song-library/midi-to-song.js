// Client-side MIDI import for the Song Maker. Parses a user-supplied .mid file
// and converts it into a sanitized, editable song.
//
// This is a near-mechanical JavaScript port of the offline generator
// `tools/midi_to_song.py` (which produced the "cc0-midi" library items). That
// Python file is the SOURCE OF TRUTH for the General-MIDI mapping tables and
// the part-selection heuristics — keep the two in sync. `midi-file`'s parse
// output maps 1:1 onto the `mido` message model the Python reads:
//
//   parseMidi(bytes) -> {header: {ticksPerBeat}, tracks: MidiEvent[][]}
//   events: {deltaTime, type, channel, noteNumber, velocity, programNumber,
//            microsecondsPerBeat, text}   // noteOn/noteOff/programChange/…
//
// Deviations from the Python, chosen for playable, performant imports:
//   1. Leading silence is trimmed — the first note starts at step 0.
//   2. Only the first MAX_IMPORT_BARS bars are kept (not the densest window,
//      not the whole song) so playback stays light.
//   3. Timing is NOT quantized — note onsets/durations keep their exact
//      fractional step positions (the scheduler plays `step * secondsPerStep`,
//      so fractional steps are honored) and sanitizeTrack preserves them.
//   4. Per-track polyphony is capped so dense chords/pedal passages can't spawn
//      an unbounded number of simultaneous Web Audio voices.
// The emitted payload is otherwise byte-compatible with stripIdsFromSong, so it
// routes through the shared sanitizeSong like a library or AI-generated song.

import {parseMidi} from 'midi-file';

import {sanitizeSong} from '../song-ai/sanitize.js';
import {MIN_PITCH, MAX_PITCH, MAX_LENGTH_STEPS, PITCH_CLASS_NAMES} from '../scale-utils.js';
import {MAX_TRACKS} from '../song-ai/prompts.js';

const STEPS_PER_BAR = 16; // 4 steps/beat * 4 beats
// Only import the first 16 bars of a file (clamped to the editor's own cap).
const MAX_IMPORT_BARS = 16;
const MAX_IMPORT_STEPS = Math.min(MAX_IMPORT_BARS * STEPS_PER_BAR, MAX_LENGTH_STEPS);
// Max simultaneously-sounding notes kept per track. Bounds the live voice count
// (≈ this × number of tracks) so imports don't overload playback.
const MAX_VOICES_PER_TRACK = 8;
// Drums are one-shot samples; a fixed short length lets them ring naturally
// rather than being cut to a near-zero MIDI note-off.
const DRUM_DURATION_STEPS = 1;

// 1-based index into INSTRUMENT_NAMES (song-defaults.js):
//  1 Piano        2 ElecPiano   3 Organ       4 Guitar     5 ElecGuitar
//  6 Bass         7 Pizzicato   8 Cello       9 Trombone  10 Clarinet
// 11 Saxophone   12 Flute      13 WoodenFlute 14 Bassoon  15 Choir
// 16 Vibraphone  17 MusicBox   18 SteelDrum   19 Marimba  20 SynthLead  21 SynthPad
const gmToInstrument = p => {
    if (p <= 1) return 1; // Ac/Bright grand -> Piano
    if (p >= 2 && p <= 5) return 2; // Electric pianos
    if (p >= 6 && p <= 7) return 1; // Harpsichord/Clav -> Piano
    if (p >= 8 && p <= 10) return 17; // Celesta/Glock/Music Box -> Music Box
    if (p === 11) return 16; // Vibraphone
    if (p >= 12 && p <= 13) return 19; // Marimba/Xylophone
    if (p >= 14 && p <= 15) return 16; // Tubular bells/Dulcimer -> Vibraphone
    if (p >= 16 && p <= 23) return 3; // Organs
    if (p >= 24 && p <= 25) return 4; // Acoustic guitars
    if (p >= 26 && p <= 31) return 5; // Electric/jazz/dist guitars
    if (p >= 32 && p <= 39) return 6; // Basses
    if (p === 45) return 7; // Pizzicato strings
    if (p >= 40 && p <= 44) return 8; // Violin/viola/cello/contrabass -> Cello
    if (p === 46) return 17; // Harp -> Music Box
    if (p === 47) return 6; // Timpani -> (low) Bass-ish
    if (p >= 48 && p <= 51) return 21; // String ensembles / synth strings -> Synth Pad
    if (p >= 52 && p <= 54) return 15; // Choir / voice
    if (p === 55) return 21; // Orchestra hit -> Synth Pad
    if (p >= 56 && p <= 63) return 9; // Brass -> Trombone
    if (p >= 64 && p <= 67) return 11; // Saxes
    if (p === 68 || p === 69) return 10; // Oboe/English horn -> Clarinet
    if (p === 70) return 14; // Bassoon
    if (p === 71) return 10; // Clarinet
    if ((p >= 72 && p <= 73) || p === 78 || p === 79) return 12; // Piccolo/Flute/Whistle/Ocarina -> Flute
    if (p >= 74 && p <= 77) return 13; // Recorder/PanFlute/Bottle/Shakuhachi -> Wooden Flute
    if (p >= 80 && p <= 87) return 20; // Synth leads
    if (p >= 88 && p <= 103) return 21; // Synth pads / FX
    if (p >= 104 && p <= 107) return 4; // Sitar/Banjo/Shamisen/Koto -> Guitar
    if (p === 108) return 19; // Kalimba -> Marimba
    if (p === 109) return 14; // Bagpipe -> Bassoon
    if (p === 110) return 8; // Fiddle -> Cello
    if (p === 111) return 10; // Shanai -> Clarinet
    if (p >= 112 && p <= 113) return 16; // Tinkle bell/Agogo -> Vibraphone
    if (p === 114) return 18; // Steel drums
    if (p === 115) return 19; // Woodblock -> Marimba
    if (p >= 116 && p <= 119) return 18; // Taiko/toms/synth drum -> Steel Drum (pitched perc)
    return 21; // SFX / fallback -> Synth Pad
};

// GM percussion note (channel 10) -> 1-based DRUM_NAMES:
//  1 Snare  2 Bass  3 SideStick  4 Crash  5 OpenHH  6 ClosedHH  7 Tambourine
//  8 Clap   9 Claves 10 WoodBlock 11 Cowbell 12 Triangle 13 Bongo 14 Conga
// 15 Cabasa 16 Guiro 17 Vibraslap 18 Cuica
const DRUM_MAP = {
    35: 2,
    36: 2,
    37: 3,
    38: 1,
    39: 8,
    40: 1,
    41: 14,
    43: 14,
    45: 13,
    47: 13,
    48: 13,
    50: 13, // toms -> bongo/conga
    42: 6,
    44: 6,
    46: 5, // hats
    49: 4,
    52: 4,
    55: 4,
    57: 4, // crashes
    51: 6,
    59: 6, // rides -> closed hat (rhythmic)
    53: 12,
    54: 7,
    56: 11,
    58: 17, // ride bell, tambourine, cowbell, vibraslap
    60: 13,
    61: 13,
    65: 13, // bongos / hi timbale
    62: 14,
    63: 14,
    64: 14,
    66: 14, // congas / lo timbale
    67: 11,
    68: 11, // agogo -> cowbell
    69: 15,
    70: 15, // cabasa / maracas
    71: 16,
    72: 16,
    73: 16,
    74: 16, // whistles / guiro -> guiro
    75: 9,
    76: 10,
    77: 10, // claves, wood blocks
    78: 18,
    79: 18,
    80: 12,
    81: 12 // cuica, triangle
};

// Name-based drum tracks that use the small LMMS beat/bassline pitch cluster
// (48..51) rather than GM percussion numbers: kick / snare / closed hat / open
// hat. Tracks whose pitches fall outside this cluster are treated as GM.
const LMMS_DRUM_MAP = {48: 2, 49: 1, 50: 6, 51: 5};

// Some packs put every instrument on its own named track (channel 0, no
// program_change). Keyword -> 1-based INSTRUMENT_NAMES index; first match wins,
// so more specific keywords come first.
const NAME_INSTRUMENT_RULES = [
    ['bass', 6],
    ['rhodes', 2], ['mellowpiano', 1], ['piano', 1],
    ['overdrive', 5], ['distortion', 5], ['elecguitar', 5], ['electric guitar', 5],
    ['steelguitar', 4], ['acoustic', 4], ['guitar', 4], ['banjo', 4], ['sitar', 4],
    ['synthlead', 20], ['square', 20], ['sawtooth', 20], ['saw', 20],
    ['lead', 20], ['synth', 20],
    ['strings', 21], ['pad', 21], ['choir', 15], ['voice', 15], ['vox', 15],
    ['trumpet', 9], ['trombone', 9], ['french horn', 9], ['horn', 9], ['brass', 9],
    ['sax', 11], ['clarinet', 10], ['oboe', 10],
    ['whistle', 12], ['flute', 12], ['piccolo', 12],
    ['recorder', 13], ['panflute', 13], ['pan flute', 13],
    ['bassoon', 14],
    ['vibra', 16], ['musicbox', 17], ['music box', 17], ['bell', 16],
    ['steeldrum', 18], ['steel drum', 18],
    ['marimba', 19], ['xylophone', 19], ['xylo', 19], ['kalimba', 19],
    ['accordeon', 3], ['accordion', 3], ['orgue', 3], ['organ', 3],
    ['cello', 8], ['violin', 8], ['viola', 8], ['contrabass', 6],
    ['pizz', 7]
];

const instrumentFromName = name => {
    const n = (name || '').toLowerCase();
    for (const [kw, inst] of NAME_INSTRUMENT_RULES) {
        if (n.indexOf(kw) >= 0) return inst;
    }
    return 1; // default -> Piano
};

// Krumhansl-Kessler key profiles, for the (cosmetic) key label / rootPitch.
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Returns the estimated tonic pitch-class index (0..11). Import always uses the
// 'chromatic' scale (lossless), so this only picks the song's display key.
const estimateKey = pcWeights => {
    const total = pcWeights.reduce((a, b) => a + b, 0) || 1;
    const x = pcWeights.map(w => w / total);
    const mx = x.reduce((a, b) => a + b, 0) / 12;
    const corr = (profile, rot) => {
        const prof = [];
        for (let i = 0; i < 12; i++) prof.push(profile[mod12(i - rot)]);
        const mp = prof.reduce((a, b) => a + b, 0) / 12;
        let num = 0;
        let dp = 0;
        let dx = 0;
        for (let i = 0; i < 12; i++) {
            num += (prof[i] - mp) * (x[i] - mx);
            dp += (prof[i] - mp) ** 2;
            dx += (x[i] - mx) ** 2;
        }
        const den = Math.sqrt(dp * dx) || 1e-9;
        return num / den;
    };
    let bestRot = 0;
    let bestCorr = -1e9;
    for (let rot = 0; rot < 12; rot++) {
        for (const profile of [KK_MAJOR, KK_MINOR]) {
            const c = corr(profile, rot);
            if (c > bestCorr) {
                bestCorr = c;
                bestRot = rot;
            }
        }
    }
    return bestRot;
};

const fitPitch = p => {
    let pitch = p;
    while (pitch < MIN_PITCH) pitch += 12;
    while (pitch > MAX_PITCH) pitch -= 12;
    return pitch;
};

const mod12 = n => ((n % 12) + 12) % 12;

// A rhythm+pitch-class fingerprint of a part, used to skip doubled parts.
const noteSignature = (notes, tpb) => {
    const step = tpb / 4;
    const sig = new Set();
    for (const n of notes) sig.add(`${Math.round(n.start / step)}_${mod12(n.pitch)}`);
    return sig;
};

// channel -> {notes:[{start, dur, pitch, vel, prog}], progCounter: Map<prog,count>}
const extractNotes = midi => {
    const notesByCh = new Map();
    const progByCh = new Map();
    for (const tr of midi.tracks) {
        let t = 0;
        const active = new Map();
        const localProg = new Map();
        for (const msg of tr) {
            t += msg.deltaTime;
            if (msg.type === 'programChange') {
                localProg.set(msg.channel, msg.programNumber);
            } else if (msg.type === 'noteOn' && msg.velocity > 0) {
                const prog = localProg.get(msg.channel) || 0;
                active.set(`${msg.channel}_${msg.noteNumber}`, {start: t, vel: msg.velocity});
                if (!progByCh.has(msg.channel)) progByCh.set(msg.channel, new Map());
                const pc = progByCh.get(msg.channel);
                pc.set(prog, (pc.get(prog) || 0) + 1);
            } else if (msg.type === 'noteOff' || (msg.type === 'noteOn' && msg.velocity === 0)) {
                const k = `${msg.channel}_${msg.noteNumber}`;
                const a = active.get(k);
                if (a) {
                    active.delete(k);
                    if (!notesByCh.has(msg.channel)) notesByCh.set(msg.channel, []);
                    notesByCh.get(msg.channel).push(
                        {start: a.start, dur: Math.max(1, t - a.start), pitch: msg.noteNumber, vel: a.vel});
                }
            }
        }
    }
    return {notesByCh, progByCh};
};

const dominantProgram = counter => {
    if (!counter || counter.size === 0) return 0;
    let best = 0;
    let bestCount = -1;
    for (const [prog, count] of counter) {
        if (count > bestCount) {
            bestCount = count;
            best = prog;
        }
    }
    return best;
};

const firstTempoBpm = midi => {
    for (const tr of midi.tracks) {
        for (const msg of tr) {
            if (msg.type === 'setTempo' && msg.microsecondsPerBeat) {
                return Math.max(20, Math.min(500, Math.round(60000000 / msg.microsecondsPerBeat)));
            }
        }
    }
    return 120;
};

// Reduce a MIDI file to instrument "parts". Channel-distributed files (the GM
// norm: >=2 channels carry notes) group by channel and read the instrument
// from the dominant program_change. Track-distributed files (everything on one
// channel, instruments split into named tracks) group by track and read the
// instrument from the track name.
const extractParts = midi => {
    const {notesByCh, progByCh} = extractNotes(midi);
    const nonempty = [...notesByCh.keys()].filter(c => notesByCh.get(c).length > 0);
    if (nonempty.length >= 2) {
        return nonempty.map(c => ({
            notes: notesByCh.get(c),
            program: dominantProgram(progByCh.get(c)),
            name: '',
            isDrum: c === 9,
            drumLmms: false
        }));
    }

    const parts = [];
    for (const tr of midi.tracks) {
        let name = '';
        let t = 0;
        const active = new Map();
        const progs = new Set();
        const chans = new Set();
        const notes = [];
        for (const msg of tr) {
            t += msg.deltaTime;
            if (msg.type === 'trackName') {
                name = msg.text || '';
            } else if (msg.type === 'programChange') {
                progs.add(msg.programNumber);
            } else if (msg.type === 'noteOn' && msg.velocity > 0) {
                active.set(`${msg.channel}_${msg.noteNumber}`, {start: t, vel: msg.velocity});
                chans.add(msg.channel);
            } else if (msg.type === 'noteOff' || (msg.type === 'noteOn' && msg.velocity === 0)) {
                const k = `${msg.channel}_${msg.noteNumber}`;
                const a = active.get(k);
                if (a) {
                    active.delete(k);
                    notes.push({start: a.start, dur: Math.max(1, t - a.start), pitch: msg.noteNumber, vel: a.vel});
                }
            }
        }
        if (notes.length === 0) continue;
        const nm = (name || '').trim();
        const isDrum = chans.has(9) || /drum|perc/i.test(nm);
        const drumLmms = isDrum && notes.every(n => n.pitch in LMMS_DRUM_MAP);
        parts.push({
            notes,
            program: progs.size ? Math.max(...progs) : null,
            name: nm,
            isDrum,
            drumLmms
        });
    }
    return parts;
};

// Bound the number of notes sounding at once within a track. Walks notes in
// onset order; when `maxVoices` are already sounding, the new note is dropped
// (rather than stealing a voice) so the earliest/lowest of a stack survives.
// `notes` carry fractional {step, durationSteps}.
const capPolyphony = (notes, maxVoices) => {
    const sorted = [...notes].sort((a, b) => a.step - b.step);
    const kept = [];
    const activeEnds = []; // end steps of currently-sounding kept notes
    for (const n of sorted) {
        for (let i = activeEnds.length - 1; i >= 0; i--) {
            if (activeEnds[i] <= n.step) activeEnds.splice(i, 1);
        }
        if (activeEnds.length >= maxVoices) continue;
        kept.push(n);
        activeEnds.push(n.step + (n.durationSteps || 1));
    }
    return kept;
};

const isBassPart = part => {
    if (part.program !== null && part.program >= 32 && part.program <= 39) return true;
    return /bass/i.test(part.name);
};

// Pick up to MAX_TRACKS parts: drums first, then a bass, then the busiest
// remaining melodic parts, skipping near-duplicate (doubled) parts.
const selectParts = (parts, tpb) => {
    const busiest = list => list.reduce((a, b) => (b.notes.length > a.notes.length ? b : a));
    const chosen = [];
    const drums = parts.filter(p => p.isDrum && p.notes.length);
    if (drums.length) chosen.push(busiest(drums));

    const melodic = parts.filter(p => !p.isDrum && p.notes.length);
    const medianPitch = p => {
        const ps = p.notes.map(n => n.pitch).sort((a, b) => a - b);
        return ps[Math.floor(ps.length / 2)];
    };
    const bassCandidates = melodic.filter(isBassPart);
    if (bassCandidates.length) {
        chosen.push(busiest(bassCandidates));
    } else if (melodic.length) {
        chosen.push(melodic.reduce((a, b) => (medianPitch(b) < medianPitch(a) ? b : a)));
    }

    const chosenSet = new Set(chosen);
    const chosenSigs = chosen.filter(p => !p.isDrum).map(p => [p, noteSignature(p.notes, tpb)]);
    const remaining = melodic.filter(p => !chosenSet.has(p)).sort((a, b) => b.notes.length - a.notes.length);
    for (const p of remaining) {
        if (chosen.length >= MAX_TRACKS) break;
        const sig = noteSignature(p.notes, tpb);
        // Program-distributed parts only count as duplicates of a same-program
        // part; name/track parts (program null) dedupe purely on rhythm+pitch
        // overlap, which catches the common doubled lead.
        const dup = chosenSigs.some(([op, osig]) => {
            if (!osig || osig.size === 0) return false;
            let inter = 0;
            for (const s of sig) if (osig.has(s)) inter++;
            const union = new Set([...sig, ...osig]).size || 1;
            return (inter / union) > 0.55 && (p.program === null || p.program === op.program);
        });
        if (!dup) {
            chosen.push(p);
            chosenSet.add(p);
            chosenSigs.push([p, sig]);
        }
    }
    return chosen;
};

// Build the wire-format payload (pre-sanitize) from a parsed MIDI file, plus a
// count of notes dropped for falling outside the imported window. Returns null
// if the file has no usable notes. Timing is kept fractional (un-quantized).
const buildPayload = midi => {
    const tpb = midi.header.ticksPerBeat || 480;
    const parts = extractParts(midi);
    if (!parts.length) return null;
    const bpm = firstTempoBpm(midi);
    const stepTicks = tpb / 4;
    const chosen = selectParts(parts, tpb);

    // Trim leading silence: shift every part so the earliest note across the
    // chosen parts lands at step 0 (inter-track alignment is preserved).
    let minStart = Infinity;
    for (const part of chosen) {
        for (const n of part.notes) if (n.start < minStart) minStart = n.start;
    }
    if (!Number.isFinite(minStart)) return null;
    const windowTicks = MAX_IMPORT_STEPS * stepTicks; // keep only the first N bars

    const tracks = [];
    const pcWeights = new Array(12).fill(0);
    let maxStep = 0;
    let truncated = 0;
    for (const part of chosen) {
        const isDrum = part.isDrum;
        const drumMap = part.drumLmms ? LMMS_DRUM_MAP : DRUM_MAP;
        let outNotes = [];
        const laneCounter = new Map();
        for (const n of part.notes) {
            const startTicks = n.start - minStart;
            if (startTicks < 0) continue;
            if (startTicks >= windowTicks) {
                truncated++;
                continue;
            }
            const step = startTicks / stepTicks; // fractional — no quantization
            const vel = Math.max(1, Math.min(127, Math.round(n.vel)));
            if (isDrum) {
                const lane = drumMap[n.pitch];
                if (typeof lane !== 'number') continue;
                outNotes.push({step, durationSteps: DRUM_DURATION_STEPS, velocity: vel, drum: lane});
                laneCounter.set(lane, (laneCounter.get(lane) || 0) + 1);
            } else {
                const dur = n.dur / stepTicks; // fractional — no quantization
                if (dur <= 0) continue;
                const pitch = fitPitch(n.pitch);
                outNotes.push({step, durationSteps: dur, velocity: vel, pitch});
                pcWeights[mod12(pitch)] += dur;
            }
            if (step > maxStep) maxStep = step;
        }
        if (!outNotes.length) continue;
        outNotes = capPolyphony(outNotes, MAX_VOICES_PER_TRACK);
        const effects = {reverb: 0, delay: 0, filter: 100, pan: 0};
        if (isDrum) {
            const keep = [...laneCounter.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6) // 6 busiest lanes
                .map(e => e[0]);
            const keepSet = new Set(keep);
            outNotes = outNotes.filter(n => keepSet.has(n.drum));
            if (!outNotes.length) continue;
            tracks.push({kind: 'drum', volume: 100, muted: false, effects, notes: outNotes, drumLanes: keep});
        } else {
            const inst = part.program === null ? instrumentFromName(part.name) : gmToInstrument(part.program);
            tracks.push({kind: 'instrument', volume: 100, muted: false, effects, notes: outNotes, instrument: inst});
        }
    }
    if (!tracks.length) return null;
    // Drums last (stable sort keeps melodic order).
    const isLane = t => (t.kind === 'drum' || t.kind === 'synthDrum' ? 1 : 0);
    tracks.sort((a, b) => isLane(a) - isLane(b));

    // Length covers the last onset, rounded up to whole bars, within the window.
    const lengthSteps = Math.min(
        MAX_IMPORT_STEPS,
        Math.max(STEPS_PER_BAR, Math.ceil((maxStep + 1) / STEPS_PER_BAR) * STEPS_PER_BAR)
    );
    // Keep notes (and their tails) from spilling past the loop point.
    for (const track of tracks) {
        for (const note of track.notes) {
            const maxDur = lengthSteps - note.step;
            if (note.durationSteps > maxDur) note.durationSteps = maxDur;
        }
    }

    const rot = estimateKey(pcWeights);
    const payload = {
        tempo: bpm,
        lengthSteps,
        stepsPerBeat: 4,
        key: PITCH_CLASS_NAMES[rot],
        octave: 4,
        scale: 'chromatic', // lossless import: snapToScale is a no-op
        tracks
    };
    return {payload, truncated};
};

/**
 * Parse a user-supplied MIDI file into a fully-sanitized, editable song.
 * @param {ArrayBuffer|Uint8Array} data - the raw bytes of a .mid file.
 * @param {string} [name] - display name for the song (e.g. the file name).
 * @returns {object} a sanitized song ready to hand to SongEditor / vm.updateSong.
 * @throws {Error} with a friendly message if the file can't be parsed or has no notes.
 */
const parseMidiToSong = (data, name) => {
    let midi;
    try {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        midi = parseMidi(bytes);
    } catch (e) {
        throw new Error('This file doesn’t look like a valid MIDI file.');
    }
    const result = buildPayload(midi);
    if (!result || !result.payload.tracks.length) {
        throw new Error('No playable notes were found in this MIDI file.');
    }
    if (result.truncated > 0) {
        // Only the first MAX_IMPORT_BARS bars are imported; later notes are
        // dropped. Surfaced here so the truncation isn't silent.
        // eslint-disable-next-line no-console
        console.warn(`MIDI import: kept the first ${MAX_IMPORT_BARS} bars; dropped ${result.truncated} later note(s).`);
    }
    return sanitizeSong(result.payload, (name && String(name).trim()) || 'Imported Song');
};

export {parseMidiToSong};
