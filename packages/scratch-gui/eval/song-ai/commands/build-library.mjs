// Full song-library authoring pipeline (Phase 1). Generates pre-made track /
// section library items with Opus, scores them with the music-theory metrics as
// a quality gate, and writes src/lib/libraries/song-tracks.json.
//
// Travels the SAME path as goldens (runOperation -> toWire), so library payloads
// are byte-identical to a golden / a UI save. The committed goldens are kept as
// the curated seed (source:'golden'); Opus-generated items are appended
// (source:'opus'). Re-running strips prior 'opus' items first, so it's
// idempotent. Opus-only for now (no MIDI few-shot — that needs a licensing
// sign-off; few-shot can be layered into the prompts later).
//
//   node launch.cjs library [--limit N]
//     --limit N   only run the first N generation specs (smoke test)
//
// CONTEXTS below is a compact data table; one property per line would bloat it,
// so the multi-prop-per-line stylistic rule is disabled for this tool file
// (cf. launch.cjs, which disables lint wholesale).
/* eslint-disable @stylistic/object-property-newline */
import fs from 'fs';
import path from 'path';
import {PATHS} from '../config.mjs';
import {GOLDEN_PROVIDER_ID} from '../config.mjs';
import {generateTrackWithPrompt, generateSongFromPrompt} from '../../../src/lib/song-ai/index.js';
import {toWire} from '../lib/to-wire.mjs';
import {trackToView, wireSongToView, keyOctaveToRootPitch} from '../lib/scoring-view.mjs';
import {scaleConformance} from '../scoring/metrics.mjs';
import {createBlankSong, createBlankTrack, INSTRUMENT_NAMES} from '../../../src/lib/song-defaults.js';

const OUT = path.resolve(PATHS.root, '../../src/lib/libraries/song-tracks.json');

// --- Generation specs, expanded from the Phase 0 taxonomy (library-taxonomy.md).
// Each context carries its musical params + which single-role tracks and how many
// sections to author. Genres/moods deliberately span the validated facets and
// COMPLEMENT the goldens seed (adds hiphop, synthwave, pop, exploration, etc.).
const ROLE_KIND = {melody: 'instrument', bass: 'instrument', lead: 'synth', pad: 'synth', drums: 'drum'};
const ROLE_WORD = {melody: 'Melody', bass: 'Bass', lead: 'Lead', pad: 'Pad', drums: 'Beat'};

const CONTEXTS = [
    {context: 'platformer', label: 'Platformer', genre: 'chiptune', mood: 'upbeat',
        key: 'C', octave: 4, scale: 'major', tempo: 130, bars: 2,
        roles: ['melody', 'bass', 'lead'], sections: 1,
        sectionDesc: 'a bouncy 8-bit chiptune loop for a side-scrolling platformer level'},
    {context: 'boss', label: 'Boss Battle', genre: 'rock', mood: 'epic',
        key: 'E', octave: 3, scale: 'pentatonicMinor', tempo: 160, bars: 2,
        roles: ['melody', 'bass', 'drums'], sections: 1,
        sectionDesc: 'a driving, intense rock loop for a boss fight'},
    {context: 'boss', label: 'Boss Rush', genre: 'electronic', mood: 'epic',
        key: 'A', octave: 3, scale: 'minor', tempo: 170, bars: 2,
        roles: ['lead', 'bass'], sections: 1,
        sectionDesc: 'a high-energy EDM boss-battle loop with a screaming synth lead'},
    {context: 'racing', label: 'Racing', genre: 'synthwave', mood: 'upbeat',
        key: 'E', octave: 4, scale: 'major', tempo: 140, bars: 2,
        roles: ['melody', 'bass', 'drums'], sections: 1,
        sectionDesc: 'a high-energy synthwave driving loop for a racing game'},
    {context: 'maze', label: 'Spooky Maze', genre: 'cinematic', mood: 'spooky',
        key: 'A', octave: 3, scale: 'minor', tempo: 90, bars: 2,
        roles: ['melody', 'pad'], sections: 1,
        sectionDesc: 'an eerie, suspenseful loop for a dark maze level'},
    {context: 'exploration', label: 'Adventure', genre: 'cinematic', mood: 'epic',
        key: 'D', octave: 4, scale: 'major', tempo: 110, bars: 2,
        roles: ['melody', 'pad', 'bass'], sections: 1,
        sectionDesc: 'a warm orchestral exploration theme for an RPG overworld'},
    {context: 'underwater', label: 'Underwater', genre: 'ambient', mood: 'chill',
        key: 'D', octave: 4, scale: 'minor', tempo: 75, bars: 2,
        roles: ['pad', 'melody'], sections: 1,
        sectionDesc: 'a floating, dreamy ambient loop for an underwater scene, lots of space'},
    {context: 'underwater', label: 'Deep Dive', genre: 'electronic', mood: 'chill',
        key: 'F', octave: 3, scale: 'minor', tempo: 100, bars: 2,
        roles: ['drums'], sections: 0,
        sectionDesc: ''},
    {context: 'dance', label: 'Dance Party', genre: 'funk', mood: 'upbeat',
        key: 'C', octave: 4, scale: 'major', tempo: 120, bars: 2,
        roles: ['melody', 'bass', 'drums'], sections: 1,
        sectionDesc: 'a funky four-on-the-floor groove for a dance party'},
    {context: 'dance', label: 'Pop Hit', genre: 'pop', mood: 'happy',
        key: 'G', octave: 4, scale: 'major', tempo: 118, bars: 2,
        roles: ['melody', 'lead'], sections: 1,
        sectionDesc: 'an upbeat catchy pop loop a kid would dance to'},
    {context: 'dance', label: 'Hip-Hop', genre: 'hiphop', mood: 'chill',
        key: 'F', octave: 3, scale: 'minor', tempo: 90, bars: 2,
        roles: ['bass', 'drums'], sections: 1,
        sectionDesc: 'a laid-back hip-hop beat with a fat bass line'},
    {context: 'intro', label: 'Epic Intro', genre: 'cinematic', mood: 'epic',
        key: 'D', octave: 4, scale: 'minor', tempo: 100, bars: 4,
        roles: ['melody', 'pad'], sections: 1,
        sectionDesc: 'a big, dramatic cinematic intro theme for a title cutscene'},
    {context: 'story', label: 'Sad Story', genre: 'cinematic', mood: 'sad',
        key: 'A', octave: 3, scale: 'minor', tempo: 70, bars: 2,
        roles: ['melody', 'pad'], sections: 1,
        sectionDesc: 'a gentle, melancholy piano theme for a sad story moment'},
    {context: 'story', label: 'Lo-fi Chill', genre: 'lofi', mood: 'chill',
        key: 'D', octave: 4, scale: 'minor', tempo: 80, bars: 2,
        roles: ['melody', 'bass', 'drums'], sections: 1,
        sectionDesc: 'a mellow lo-fi loop to play behind a calm animation'},
    {context: 'quiz', label: 'Quiz Jingle', genre: 'jingle', mood: 'happy',
        key: 'G', octave: 4, scale: 'major', tempo: 120, bars: 1,
        roles: ['melody'], sections: 1,
        sectionDesc: 'a short, happy jingle for a correct quiz answer'}
];

const titleScale = {major: 'major', minor: 'minor', pentatonicMajor: 'pentatonic major',
    pentatonicMinor: 'pentatonic minor', chromatic: 'chromatic'};

const roleInstrumentHint = role => ({
    melody: 'Use a clear lead melody instrument (e.g. Piano, Marimba, Flute, or Synth Lead).',
    bass: 'Use the Bass instrument and write a steady, low-register bass line.',
    lead: 'Use a bright synth lead preset (e.g. Pluck Lead or Detuned Saw Lead).',
    pad: 'Use a warm, sustained synth pad preset (e.g. Warm Pad or Glass Pad).',
    drums: 'Write a tight, looping drum pattern (kick, snare, hats).'
}[role] || '');

const trackPrompt = (spec, role) =>
    `${ROLE_WORD[role] === 'Beat' ? 'A drum beat' : `A ${role}`} for ${spec.sectionDesc || spec.label}. ` +
    `${spec.genre} style, ${spec.mood} mood. ${roleInstrumentHint(role)} ` +
    `It must loop seamlessly over ${spec.bars * 16} steps.`;

const sectionPrompt = spec =>
    `${spec.sectionDesc}. Make it ${spec.genre} style in ${spec.key} ${titleScale[spec.scale]} ` +
    `at ${spec.tempo} bpm, ${spec.bars * 16} steps long, and loop seamlessly.`;

const ctxFor = spec => ({
    tempo: spec.tempo,
    lengthSteps: spec.bars * 16,
    rootPitch: keyOctaveToRootPitch(spec.key, spec.octave),
    scaleType: spec.scale
});

const seedSongFor = spec => {
    const song = createBlankSong(spec.label);
    song.tempo = spec.tempo;
    song.lengthSteps = spec.bars * 16;
    song.rootPitch = keyOctaveToRootPitch(spec.key, spec.octave);
    song.scaleType = spec.scale;
    song.tracks = [createBlankTrack('instrument')];
    return song;
};

const instrumentNameFor = wireTrack =>
    (wireTrack.kind === 'instrument') ? (INSTRUMENT_NAMES[(wireTrack.instrument || 1) - 1] || 'Instrument') :
        (wireTrack.kind === 'synth') ? (wireTrack.synthPreset || 'Synth') :
            (wireTrack.kind === 'synthDrum') ? 'Synth Drums' : 'Drums';

// Quality gate: enough notes, and (for pitched parts) high scale conformance.
const passesGate = (view, {minNotes}) => {
    const noteCount = view.tracks.reduce((n, t) => n + (t.notes || []).length, 0);
    if (noteCount < minNotes) return {ok: false, reason: `too few notes (${noteCount})`};
    const sc = scaleConformance(view);
    if (sc !== null && sc < 0.8) return {ok: false, reason: `low scale conformance (${sc.toFixed(2)})`};
    return {ok: true, score: sc};
};

const uniqueName = (base, used) => {
    if (!used.has(base)) return base;
    let n = 2;
    while (used.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
};

const expandSpecs = () => {
    const out = [];
    for (const spec of CONTEXTS) {
        for (const role of spec.roles) {
            out.push({type: 'track', spec, role, kind: ROLE_KIND[role]});
        }
        for (let i = 0; i < (spec.sections || 0); i++) {
            out.push({type: 'song', spec});
        }
    }
    return out;
};

export const buildLibrary = async flags => {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is required to generate library items.');
    }
    // Base set = current manifest minus any prior generated items, so the
    // generated set is rebuilt fresh each run (idempotent). The goldens-seed
    // items (written by build-library.cjs, no `source` field) are preserved.
    let base = [];
    try {
        base = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    } catch { /* no manifest yet */ }
    base = base.filter(it => it.source !== 'opus');

    const used = new Set(base.map(it => it.name));
    let specs = expandSpecs();
    if (flags.limit) specs = specs.slice(0, parseInt(flags.limit, 10));

    const generated = [];
    let made = 0;
    let dropped = 0;
    let failed = 0;
    for (const s of specs) {
        const tag = s.type === 'track' ? `${s.spec.label}/${s.role}` : `${s.spec.label}/section`;
        process.stdout.write(`[library] ${tag} ...\n`);
        try {
            const ctx = ctxFor(s.spec);
            let item;
            if (s.type === 'track') {
                const result = await generateTrackWithPrompt({
                    prompt: trackPrompt(s.spec, s.role),
                    song: seedSongFor(s.spec),
                    kind: s.kind,
                    providerId: GOLDEN_PROVIDER_ID
                });
                const wire = toWire('track', result, ctx);
                const view = trackToView(wire, ctx);
                const gate = passesGate(view, {minNotes: 3});
                if (!gate.ok) {
                    dropped++;
                    process.stdout.write(`  dropped: ${gate.reason}\n`);
                    continue;
                }
                item = {
                    name: uniqueName(`${s.spec.label} ${ROLE_WORD[s.role]}`, used),
                    itemType: 'track',
                    kind: wire.kind,
                    tags: Array.from(new Set([s.spec.genre, s.spec.mood, s.spec.context, s.role])),
                    tempo: ctx.tempo,
                    rootPitch: ctx.rootPitch,
                    scaleType: ctx.scaleType,
                    lengthSteps: ctx.lengthSteps,
                    stepsPerBeat: 4,
                    instrumentName: instrumentNameFor(wire),
                    source: 'opus',
                    payload: wire
                };
            } else {
                const result = await generateSongFromPrompt({
                    prompt: sectionPrompt(s.spec),
                    providerId: GOLDEN_PROVIDER_ID,
                    fallbackName: s.spec.label
                });
                const wire = toWire('song', result, ctx);
                const view = wireSongToView(wire);
                const gate = passesGate(view, {minNotes: 8});
                if (!gate.ok) {
                    dropped++;
                    process.stdout.write(`  dropped: ${gate.reason}\n`);
                    continue;
                }
                item = {
                    name: uniqueName(s.spec.label, used),
                    itemType: 'song',
                    tags: Array.from(new Set([s.spec.genre, s.spec.mood, s.spec.context, 'section'])),
                    tempo: wire.tempo,
                    rootPitch: keyOctaveToRootPitch(wire.key, wire.octave),
                    scaleType: wire.scale,
                    lengthSteps: wire.lengthSteps,
                    stepsPerBeat: wire.stepsPerBeat || 4,
                    trackCount: (wire.tracks || []).length,
                    source: 'opus',
                    payload: wire
                };
            }
            used.add(item.name);
            generated.push(item);
            made++;
        } catch (err) {
            failed++;
            process.stderr.write(`[library] FAILED ${tag}: ${err.message}\n`);
        }
    }

    const all = base.concat(generated);
    // Sections first (they read as starters), then tracks; alphabetical within.
    all.sort((a, b) =>
        (a.itemType === b.itemType ? a.name.localeCompare(b.name) : (a.itemType === 'song' ? -1 : 1)));
    fs.writeFileSync(OUT, `${JSON.stringify(all, null, 2)}\n`);
    process.stdout.write(
        `[library] done. ${made} generated, ${dropped} dropped, ${failed} failed. ` +
        `${all.length} total items in ${path.relative(process.cwd(), OUT)}\n`);
};
