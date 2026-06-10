#!/usr/bin/env node
/* eslint-disable */
/**
 * Source of truth for the initial eval dataset. Emits:
 *   settings/settings.json
 *   cases/<category>/<id>.case.json
 *   seeds/_specs.json   (prompts the `seeds` command turns into seed songs)
 *
 * Re-run after editing this file:  node tools/build-dataset.cjs
 * (Individual case files can also be hand-edited; this builder is just the
 * convenient way to author the matrix in one place.)
 */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..');

const writeJson = (rel, obj) => {
    const file = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`);
};

// ----- Chord progressions (semitone offsets from tonic) by scale -----
const PROG = {
    major: [0, 7, 9, 5], // I V vi IV
    minor: [0, 8, 5, 7], // i VI iv v
    pentatonicMajor: [0, 7, 9, 5],
    pentatonicMinor: [0, 5, 7, 0]
};
const fourGen = ['instrument', 'instrument', 'instrument', 'drum']; // melody, bass, pad, drums

// ----- Settings: genre × kid project type (curated, ~12) -----
const SETTINGS = [
    ['platformer-chiptune', 'chiptune', 'platformer game', 'Bouncy 8-bit loop for a side-scrolling platformer level.', 'C', 4, 'major', 130, 32],
    ['boss-battle-rock', 'rock', 'boss battle', 'Driving, intense rock loop for a boss fight.', 'E', 3, 'pentatonicMinor', 160, 32],
    ['lofi-study-loop', 'lo-fi', 'background animation', 'Mellow lo-fi loop to play behind a calm animation.', 'D', 4, 'minor', 80, 32],
    ['spooky-maze', 'spooky', 'maze game', 'Eerie, suspenseful loop for a dark maze level.', 'A', 3, 'minor', 90, 32],
    ['nursery-singalong', 'nursery', 'storytelling animation', 'Sweet, simple sing-along tune for a kids story.', 'C', 4, 'pentatonicMajor', 100, 32],
    ['dance-party-loop', 'funk', 'dance loop', 'Funky four-on-the-floor groove for a dance party.', 'C', 4, 'major', 124, 32],
    ['quiz-correct-jingle', 'jingle', 'quiz game', 'Short happy jingle for a correct answer.', 'G', 4, 'major', 120, 16],
    ['underwater-ambient', 'ambient', 'exploration animation', 'Floating, dreamy ambience for an underwater scene.', 'D', 4, 'minor', 75, 32],
    ['racing-game-drive', 'upbeat', 'racing game', 'High-energy driving loop for a racing game.', 'E', 4, 'major', 140, 32],
    ['sad-story-piano', 'sad', 'storytelling', 'Gentle, melancholy piano theme for a sad moment.', 'A', 3, 'minor', 70, 32],
    ['marching-parade', 'march', 'parade animation', 'Cheerful marching-band parade tune.', 'C', 4, 'major', 120, 32],
    ['epic-cinematic-intro', 'cinematic', 'intro cutscene', 'Big, dramatic cinematic intro theme.', 'D', 4, 'minor', 100, 64]
].map(([id, genre, projectType, description, targetKey, targetOctave, targetScale, targetTempo, targetLengthSteps]) => ({
    id, genre, projectType, description,
    targetKey, targetOctave, targetScale, targetTempo, targetLengthSteps,
    expectedTrackKinds: fourGen,
    chordProgressionOffsets: PROG[targetScale]
}));

writeJson('settings/settings.json', SETTINGS);

// ----- Seed songs: one full base song per setting that has track cases -----
// (The `seeds` command turns each spec into a sanitized internal-shape song.)
const SEED_SETTINGS = [
    'platformer-chiptune', 'boss-battle-rock', 'lofi-study-loop', 'spooky-maze',
    'nursery-singalong', 'dance-party-loop', 'underwater-ambient', 'racing-game-drive',
    'sad-story-piano', 'epic-cinematic-intro'
];
const setting = id => SETTINGS.find(s => s.id === id);
const seedSpecs = SEED_SETTINGS.map(id => {
    const s = setting(id);
    return {
        id, // seed file = seeds/<id>.seed.json
        settingId: id,
        prompt: `${s.description} ${s.genre} style, in ${s.targetKey} ${s.targetScale} at ${s.targetTempo} bpm. Include a melody, a bass line, a chord/pad part, and drums.`
    };
});
writeJson('seeds/_specs.json', seedSpecs);

// ----- Cases -----
const cases = [];
const add = c => cases.push(c);
const intent = (s, extra = {}) => ({
    requireKey: null, requireScale: null, requireTempo: null, requireLengthSteps: null,
    expectKind: null, moodTags: [s.genre], ...extra
});
const seedRef = id => `seeds/${id}.seed.json`;
const goldenRef = id => `goldens/${id}/golden.json`;

// --- multitrack-song (8): whole songs from a prompt ---
['platformer-chiptune', 'boss-battle-rock', 'lofi-study-loop', 'spooky-maze',
    'nursery-singalong', 'dance-party-loop', 'racing-game-drive', 'epic-cinematic-intro']
    .forEach(sid => {
        const s = setting(sid);
        const id = `song-${sid}`;
        add({
            id, category: 'multitrack-song', settingId: sid, operation: 'generateSong',
            prompt: `${s.description} Make it ${s.genre} style in ${s.targetKey} ${s.targetScale} at ${s.targetTempo} bpm.`,
            intent: intent(s, {
                requireKey: s.targetKey, requireScale: s.targetScale, requireTempo: s.targetTempo
            }),
            goldenRef: goldenRef(id)
        });
    });

// --- single-track-gen (9): add one new track to an existing song ---
const genTrackCases = [
    ['platformer-chiptune', 'instrument', 'a catchy 8-bit lead melody'],
    ['boss-battle-rock', 'instrument', 'a heavy driving bass line'],
    ['lofi-study-loop', 'instrument', 'a warm mellow chord/pad part'],
    ['spooky-maze', 'instrument', 'a creepy high music-box countermelody'],
    ['nursery-singalong', 'instrument', 'a simple flute melody a child could sing'],
    ['dance-party-loop', 'drum', 'a funky danceable drum groove'],
    ['racing-game-drive', 'drum', 'a fast energetic drum beat'],
    ['underwater-ambient', 'synth', 'a slow floating pad'],
    ['sad-story-piano', 'instrument', 'a gentle melancholy piano melody']
];
genTrackCases.forEach(([sid, kind, desc], i) => {
    const s = setting(sid);
    const id = `gen-${sid}-${kind}`;
    add({
        id, category: 'single-track-gen', settingId: sid, operation: 'generateTrack',
        prompt: `Add ${desc}. Keep it in the song's key and groove.`,
        kind, seedRef: seedRef(sid),
        intent: intent(s, {expectKind: kind}),
        goldenRef: goldenRef(id)
    });
});

// --- single-track-edit (9): continuation + variation on a seed track ---
const editCases = [
    ['platformer-chiptune', 0, 'continue', 'first-half', 'balanced', 'replace', 'extend the melody to fill the rest of the loop'],
    ['lofi-study-loop', 0, 'vary', 'all', 'subtle', 'replace', 'give a subtle variation of the melody'],
    ['boss-battle-rock', 0, 'vary', 'all', 'bold', 'replace', 'make a bolder, busier variation of the riff'],
    ['dance-party-loop', 0, 'continue', 'first-half', 'balanced', 'replace', 'continue the melody naturally'],
    ['nursery-singalong', 0, 'vary', 'all', 'balanced', 'replace', 'a playful variation of the tune'],
    ['racing-game-drive', 0, 'continue', 'first-half', 'bold', 'replace', 'extend with a more energetic ending'],
    ['sad-story-piano', 0, 'vary', 'all', 'subtle', 'replace', 'a slightly different, equally gentle version'],
    ['spooky-maze', 0, 'continue', 'first-4', 'balanced', 'replace', 'develop the spooky motif over the whole loop'],
    ['underwater-ambient', 0, 'vary', 'all', 'subtle', 'replace', 'a calm reinterpretation of the melody']
];
editCases.forEach(([sid, trackIndex, mode, seedFrom, variation, applyAs, desc]) => {
    const s = setting(sid);
    const id = `edit-${sid}-${mode}`;
    add({
        id, category: 'single-track-edit', settingId: sid, operation: 'editTrack',
        prompt: `Edit the melody: ${desc}.`,
        trackIndex,
        editParams: {mode, seedFrom, variation, applyAs},
        seedRef: seedRef(sid),
        intent: intent(s, {expectKind: 'instrument'}),
        goldenRef: goldenRef(id)
    });
});

// --- harmonize (5, knownGap): fill an emptied harmony track under the melody ---
const harmCases = [
    ['nursery-singalong', 2], ['sad-story-piano', 2], ['lofi-study-loop', 2],
    ['epic-cinematic-intro', 2], ['spooky-maze', 2]
];
harmCases.forEach(([sid, trackIndex]) => {
    const s = setting(sid);
    const id = `harm-${sid}`;
    add({
        id, category: 'harmonize', settingId: sid, operation: 'editTrack',
        prompt: 'Add a chord/harmony accompaniment that supports the melody in the other track. Use chord tones that fit the song key.',
        trackIndex,
        editParams: {mode: 'harmonize', seedFrom: 'all', variation: 'balanced', applyAs: 'replace'},
        seedRef: seedRef(sid),
        seedMutation: {clearTrack: trackIndex}, // start from an empty harmony track
        intent: intent(s, {expectKind: 'instrument'}),
        goldenRef: goldenRef(id)
    });
});

// --- infill (4, knownGap): fill a blanked middle region of the melody ---
const infillCases = [
    ['platformer-chiptune', 0, 12, 20], ['lofi-study-loop', 0, 12, 20],
    ['nursery-singalong', 0, 8, 16], ['epic-cinematic-intro', 0, 24, 40]
];
infillCases.forEach(([sid, trackIndex, from, to]) => {
    const s = setting(sid);
    const id = `infill-${sid}`;
    add({
        id, category: 'infill', settingId: sid, operation: 'editTrack',
        prompt: `The melody is missing its middle section (steps ${from}-${to - 1}). Fill in that gap so the two halves connect smoothly, keeping the same style and key.`,
        trackIndex,
        editParams: {mode: 'infill', maskFromStep: from, maskToStep: to, seedFrom: 'all', variation: 'balanced', applyAs: 'replace'},
        seedRef: seedRef(sid),
        seedMutation: {maskTrack: trackIndex, from, to},
        intent: intent(s, {expectKind: 'instrument'}),
        goldenRef: goldenRef(id)
    });
});

// Write one file per case under its category dir.
for (const c of cases) {
    writeJson(`cases/${c.category}/${c.id}.case.json`, c);
}

process.stdout.write(
    `Wrote ${SETTINGS.length} settings, ${seedSpecs.length} seed specs, ${cases.length} cases ` +
    `(${cases.filter(c => c.category === 'multitrack-song').length} song, ` +
    `${cases.filter(c => c.category === 'single-track-gen').length} gen, ` +
    `${cases.filter(c => c.category === 'single-track-edit').length} edit, ` +
    `${cases.filter(c => c.category === 'harmonize').length} harmonize, ` +
    `${cases.filter(c => c.category === 'infill').length} infill).\n`
);
