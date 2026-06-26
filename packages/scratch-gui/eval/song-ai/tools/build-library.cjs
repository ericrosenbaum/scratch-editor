#!/usr/bin/env node
/**
 * build-library — assemble the song-maker track/section library manifest.
 *
 * v0 (this file) BOOTSTRAPS the manifest from the committed Opus goldens so the
 * GUI has real, high-quality content immediately:
 *   - gen-<setting>-<kind> goldens  -> single-track library items ("track")
 *   - song-<setting> goldens        -> multi-track section items   ("song")
 *
 * It wraps each golden's wire-format payload with the browsing/reconciliation
 * metadata the library UI needs (name, tags, tempo, key, scale, length).
 *
 * Later this command grows into the full authoring pipeline (Opus + MIDI
 * few-shot generation, scored/filtered by eval/song-ai/scoring), but the OUTPUT
 * SHAPE — src/lib/libraries/song-tracks.json — stays the same.
 *
 * Run:  node packages/scratch-gui/eval/song-ai/tools/build-library.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GOLDENS = path.join(ROOT, 'goldens');
const SETTINGS = path.join(ROOT, 'settings', 'settings.json');
const OUT = path.resolve(ROOT, '../../src/lib/libraries/song-tracks.json');

// Mirror of song-defaults INSTRUMENT_NAMES (kept inline so this build tool has
// no dependency on the GUI's ES modules). Indexed 1-based by the wire format.
const INSTRUMENT_NAMES = [
    'Piano', 'Electric Piano', 'Organ', 'Guitar', 'Electric Guitar', 'Bass',
    'Pizzicato', 'Cello', 'Trombone', 'Clarinet', 'Saxophone', 'Flute',
    'Wooden Flute', 'Bassoon', 'Choir', 'Vibraphone', 'Music Box', 'Steel Drum',
    'Marimba', 'Synth Lead', 'Synth Pad'
];
const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// settingId -> canonical {genre, mood, context} library tags, following the
// Phase 0 genre-research taxonomy (genre + mood + context + role facets). The
// curated v1 covers 12 settings; the full pipeline widens this from
// eval/song-ai/library-taxonomy.md.
const TAGS_BY_SETTING = {
    'platformer-chiptune': {label: 'Platformer', genre: 'chiptune', mood: 'upbeat', context: 'platformer'},
    'boss-battle-rock': {label: 'Boss Battle', genre: 'rock', mood: 'epic', context: 'boss'},
    'lofi-study-loop': {label: 'Lo-fi Chill', genre: 'lofi', mood: 'chill', context: 'story'},
    'spooky-maze': {label: 'Spooky Maze', genre: 'cinematic', mood: 'spooky', context: 'maze'},
    'nursery-singalong': {label: 'Sing-Along', genre: 'cinematic', mood: 'happy', context: 'story'},
    'dance-party-loop': {label: 'Dance Party', genre: 'funk', mood: 'upbeat', context: 'dance'},
    'quiz-correct-jingle': {label: 'Quiz Jingle', genre: 'cinematic', mood: 'happy', context: 'quiz'},
    'underwater-ambient': {label: 'Underwater', genre: 'ambient', mood: 'chill', context: 'underwater'},
    'racing-game-drive': {label: 'Racing', genre: 'electronic', mood: 'upbeat', context: 'racing'},
    'sad-story-piano': {label: 'Sad Story', genre: 'cinematic', mood: 'sad', context: 'story'},
    'marching-parade': {label: 'Parade', genre: 'cinematic', mood: 'happy', context: 'story'},
    'epic-cinematic-intro': {label: 'Epic Intro', genre: 'cinematic', mood: 'epic', context: 'intro'}
};

const KIND_SUFFIXES = ['synthDrum', 'instrument', 'drum', 'synth'];
const titleCase = s => s.replace(/(^|[-\s])([a-z])/g, (_, p, c) => p.replace('-', ' ') + c.toUpperCase());

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));

const settings = readJson(SETTINGS).reduce((acc, s) => {
    acc[s.id] = s;
    return acc;
}, {});

const genreLabel = genre => ({
    chiptune: 'Chiptune', rock: 'Rock', lofi: 'Lo-fi', funk: 'Funk',
    electronic: 'Electronic', ambient: 'Ambient', cinematic: 'Cinematic'
}[genre] || titleCase(genre));

const roleForKind = kind =>
    (kind === 'drum' || kind === 'synthDrum') ? 'drums' :
        kind === 'synth' ? 'pad' : 'melody';

const roleWord = role =>
    ({melody: 'Melody', drums: 'Beat', pad: 'Pad', lead: 'Lead', bass: 'Bass'}[role] || 'Track');

// Compute a track's loop length from its notes (the setting's targetLengthSteps
// is a generation hint, not always the authored length — use the notes).
const lengthFromNotes = notes => (notes || []).reduce(
    (max, n) => Math.max(max, (n.step || 0) + (n.durationSteps || 1)), 0) || 32;

const rootPitchFor = setting => {
    const pc = PITCH_CLASS_NAMES.indexOf(setting.targetKey);
    const oct = typeof setting.targetOctave === 'number' ? setting.targetOctave : 4;
    return ((oct + 1) * 12) + (pc >= 0 ? pc : 0);
};

const instrumentNameFor = golden =>
    (golden.kind === 'instrument') ? (INSTRUMENT_NAMES[(golden.instrument || 1) - 1] || 'Instrument') :
        (golden.kind === 'synth') ? (golden.synthPreset || 'Synth') :
            (golden.kind === 'synthDrum') ? 'Synth Drums' : 'Drums';

const parseTrackDir = dir => {
    // gen-<settingId>-<kind>
    const rest = dir.replace(/^gen-/, '');
    const kind = KIND_SUFFIXES.find(k => rest.endsWith(`-${k}`));
    if (!kind) return null;
    return {settingId: rest.slice(0, rest.length - kind.length - 1), kind};
};

const items = [];

for (const dir of fs.readdirSync(GOLDENS).sort()) {
    const goldenPath = path.join(GOLDENS, dir, 'golden.json');
    if (!fs.existsSync(goldenPath)) continue;
    const golden = readJson(goldenPath);

    if (dir.startsWith('gen-')) {
        const parsed = parseTrackDir(dir);
        if (!parsed) continue;
        const setting = settings[parsed.settingId];
        if (!setting) continue;
        const tagset = TAGS_BY_SETTING[parsed.settingId] ||
            {label: genreLabel(setting.genre), genre: setting.genre, mood: 'chill', context: 'story'};
        const role = roleForKind(golden.kind);
        items.push({
            name: `${tagset.label} ${roleWord(role)}`,
            itemType: 'track',
            kind: golden.kind,
            tags: Array.from(new Set([tagset.genre, tagset.mood, tagset.context, role])),
            tempo: setting.targetTempo || 120,
            rootPitch: rootPitchFor(setting),
            scaleType: setting.targetScale || 'major',
            lengthSteps: lengthFromNotes(golden.notes),
            stepsPerBeat: 4,
            instrumentName: instrumentNameFor(golden),
            payload: golden
        });
    } else if (dir.startsWith('song-')) {
        const settingId = dir.replace(/^song-/, '');
        const setting = settings[settingId];
        const tagset = TAGS_BY_SETTING[settingId] ||
            {label: 'Section', genre: (setting && setting.genre) || 'cinematic', mood: 'epic', context: 'story'};
        const pc = PITCH_CLASS_NAMES.indexOf(golden.key);
        const rootPitch = ((typeof golden.octave === 'number' ? golden.octave : 4) + 1) * 12 +
            (pc >= 0 ? pc : 0);
        items.push({
            name: tagset.label,
            itemType: 'song',
            tags: Array.from(new Set([tagset.genre, tagset.mood, tagset.context, 'section'])),
            tempo: golden.tempo || 120,
            rootPitch,
            scaleType: golden.scale || 'major',
            lengthSteps: golden.lengthSteps || 32,
            stepsPerBeat: golden.stepsPerBeat || 4,
            trackCount: (golden.tracks || []).length,
            payload: golden
        });
    }
}

// Stable order: sections first (they read as "starters"), then tracks, each
// alphabetical by name — keeps the manifest diff-friendly across rebuilds.
items.sort((a, b) =>
    (a.itemType === b.itemType ? a.name.localeCompare(b.name) : (a.itemType === 'song' ? -1 : 1)));

fs.writeFileSync(OUT, `${JSON.stringify(items, null, 2)}\n`);
process.stdout.write(`Wrote ${items.length} library items to ${path.relative(process.cwd(), OUT)}\n`);
