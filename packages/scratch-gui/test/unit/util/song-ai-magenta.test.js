import {createBlankSong, createBlankTrack} from '../../../src/lib/song-defaults.js';
import {magentaProvider, __testables} from '../../../src/lib/song-ai/providers/magenta.js';

const {
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
    combineByApplyAs
} = __testables;

describe('magenta provider — vibe parser', () => {
    test('detects mood keywords', () => {
        expect(parseVibe('a happy bouncy tune').mood).toBe('happy');
        expect(parseVibe('a sad ballad').mood).toBe('sad');
        expect(parseVibe('something spooky and eerie').mood).toBe('spooky');
        expect(parseVibe('lo-fi chill beats').mood).toBe('chill');
    });

    test('detects tempo bucket', () => {
        expect(parseVibe('a fast driving rock song').tempoBucket).toBe('fast');
        expect(parseVibe('a slow ballad').tempoBucket).toBe('slow');
    });

    test('extracts explicit key', () => {
        expect(parseVibe('a melody in F# minor').explicitKey).toBe('F#');
        expect(parseVibe('a melody in F# minor').explicitScale).toBe('minor');
        expect(parseVibe('key of A major').explicitKey).toBe('A');
        expect(parseVibe('key of A major').explicitScale).toBe('major');
    });

    test('falls back to nulls when no keywords match', () => {
        const v = parseVibe('just generate something');
        expect(v.mood).toBeNull();
        expect(v.tempoBucket).toBeNull();
        expect(v.explicitKey).toBeNull();
    });
});

describe('magenta provider — mood mapping', () => {
    test('mood drives scale selection', () => {
        expect(moodToScale('sad')).toBe('minor');
        expect(moodToScale('happy')).toBe('major');
        expect(moodToScale('bluesy')).toBe('pentatonicMinor');
        expect(moodToScale('folk')).toBe('pentatonicMajor');
    });

    test('mood drives key selection', () => {
        expect(moodToKey('sad')).toBe('A');
        expect(moodToKey('happy')).toBe('C');
        expect(moodToKey('bluesy')).toBe('E');
    });

    test('tempo bucket overrides mood for BPM', () => {
        expect(moodToTempo('chill', 'fast')).toBeGreaterThan(120);
        expect(moodToTempo('upbeat', 'slow')).toBeLessThan(90);
    });

    test('progression length is always 4 chords', () => {
        for (const scale of ['major', 'minor', 'pentatonicMinor', 'pentatonicMajor', 'chromatic']) {
            expect(pickProgression('happy', scale)).toHaveLength(4);
        }
    });
});

describe('magenta provider — drum mapping', () => {
    test('maps GM kick / snare to our drum indices', () => {
        expect(drumPitchToOurIndex(36)).toBe(2); // Bass Drum
        expect(drumPitchToOurIndex(38)).toBe(1); // Snare Drum
        expect(drumPitchToOurIndex(42)).toBe(6); // Closed Hi-Hat
        expect(drumPitchToOurIndex(46)).toBe(5); // Open Hi-Hat
        expect(drumPitchToOurIndex(49)).toBe(4); // Crash
        expect(drumPitchToOurIndex(39)).toBe(8); // Clap
    });

    test('unknown drum pitches fall back to closed hi-hat', () => {
        expect(drumPitchToOurIndex(99)).toBe(6);
    });
});

describe('magenta provider — pure track builders', () => {
    test('buildBassTrack stays in the bass register', () => {
        const track = buildBassTrack(32, 60 /* C4 root */, [0, 7, 5, 0]);
        expect(track.kind).toBe('instrument');
        expect(track.instrument).toBe(6);
        for (const note of track.notes) {
            expect(note.pitch).toBeLessThanOrEqual(48);
            expect(note.pitch).toBeGreaterThanOrEqual(28);
        }
        expect(track.notes.length).toBeGreaterThan(0);
    });

    test('buildPadTrack emits 3-note chords', () => {
        const track = buildPadTrack(32, 60, [0, 7, 5, 0]);
        expect(track.kind).toBe('instrument');
        expect(track.instrument).toBe(21);
        // 4 chords × 3 notes each = 12 notes.
        expect(track.notes).toHaveLength(12);
        // The first chord (offset 0) should include root (60), third (64),
        // and fifth (67).
        const firstChordPitches = track.notes
            .filter(n => n.step === 0)
            .map(n => n.pitch)
            .sort((a, b) => a - b);
        expect(firstChordPitches).toEqual([60, 64, 67]);
    });
});

describe('magenta provider — edit-by-continuation helpers', () => {
    const baseNotes = [
        {step: 0, durationSteps: 2, pitch: 60, velocity: 80},
        {step: 2, durationSteps: 2, pitch: 64, velocity: 80},
        {step: 8, durationSteps: 2, pitch: 67, velocity: 80},
        {step: 20, durationSteps: 2, pitch: 72, velocity: 80}
    ];

    test('pickSeedNotes "first-4" takes notes that start before step 4', () => {
        const out = pickSeedNotes(baseNotes, 32, 'first-4');
        expect(out.map(n => n.step)).toEqual([0, 2]);
    });

    test('pickSeedNotes "first-half" takes notes from the first half', () => {
        const out = pickSeedNotes(baseNotes, 32, 'first-half');
        expect(out.map(n => n.step)).toEqual([0, 2, 8]);
    });

    test('pickSeedNotes "all" returns every note', () => {
        const out = pickSeedNotes(baseNotes, 32, 'all');
        expect(out).toHaveLength(4);
    });

    test('pickSeedNotes falls back to the earliest note when cutoff is empty', () => {
        const sparse = [{step: 10, durationSteps: 2, pitch: 60, velocity: 80}];
        const out = pickSeedNotes(sparse, 32, 'first-4');
        expect(out).toHaveLength(1);
        expect(out[0].step).toBe(10);
    });

    test('pickSeedNotes returns [] when input is empty', () => {
        expect(pickSeedNotes([], 32, 'first-half')).toEqual([]);
    });

    test('combineByApplyAs "replace" returns seed + generated', () => {
        const seedNotes = [{step: 0, pitch: 60, durationSteps: 2}];
        const generatedNotes = [{step: 4, pitch: 64, durationSteps: 2}];
        const out = combineByApplyAs({
            originalNotes: baseNotes,
            seedNotes,
            generatedNotes,
            applyAs: 'replace',
            lengthSteps: 32
        });
        expect(out).toEqual([...seedNotes, ...generatedNotes]);
    });

    test('combineByApplyAs "layer" returns original + generated together', () => {
        const generatedNotes = [{step: 4, pitch: 64, durationSteps: 2}];
        const out = combineByApplyAs({
            originalNotes: baseNotes,
            seedNotes: [baseNotes[0]],
            generatedNotes,
            applyAs: 'layer',
            lengthSteps: 32
        });
        expect(out).toHaveLength(baseNotes.length + generatedNotes.length);
    });

    test('combineByApplyAs "append" shifts generated notes past the original end', () => {
        const generatedNotes = [
            {step: 0, pitch: 60, durationSteps: 2},
            {step: 4, pitch: 64, durationSteps: 2}
        ];
        const out = combineByApplyAs({
            originalNotes: baseNotes, // last note ends at step 22
            seedNotes: [baseNotes[0]],
            generatedNotes,
            applyAs: 'append',
            lengthSteps: 32
        });
        const appended = out.slice(baseNotes.length);
        // First generated note should now sit right at where the original ends.
        expect(appended[0].step).toBe(22);
        expect(appended[1].step).toBe(26);
    });

    test('combineByApplyAs "append" drops generated notes that overflow lengthSteps', () => {
        const generatedNotes = [
            {step: 0, pitch: 60, durationSteps: 2},
            {step: 12, pitch: 64, durationSteps: 2}
        ];
        const out = combineByApplyAs({
            originalNotes: baseNotes, // ends at step 22
            seedNotes: [baseNotes[0]],
            generatedNotes,
            applyAs: 'append',
            lengthSteps: 32
        });
        // The second generated note shifts to 22 + 12 = 34, past lengthSteps,
        // so it's dropped.
        expect(out).toHaveLength(baseNotes.length + 1);
    });
});

describe('magenta provider — drum index round-trip', () => {
    test('ourIndexToDrumPitch is the inverse of drumPitchToOurIndex for standard lanes', () => {
        for (const idx of [1, 2, 4, 5, 6, 8]) {
            const pitch = ourIndexToDrumPitch(idx);
            expect(drumPitchToOurIndex(pitch)).toBe(idx);
        }
    });

    test('ourIndexToDrumPitch falls back to closed hi-hat for unknown lanes', () => {
        expect(ourIndexToDrumPitch(99)).toBe(42);
    });
});

describe('magenta provider — fixture helpers', () => {
    // Keep an empty test slot using createBlankSong / createBlankTrack so the
    // shared imports above still get referenced even when individual tests
    // change. Without this the linter complains about unused imports.
    test('createBlankSong / createBlankTrack still importable', () => {
        const song = createBlankSong('s');
        const track = createBlankTrack('instrument');
        expect(song).toBeTruthy();
        expect(track.kind).toBe('instrument');
    });
});

describe('magenta provider — interface contract', () => {
    test('isAvailable resolves to true (no preflight network check)', async () => {
        await expect(magentaProvider.isAvailable()).resolves.toBe(true);
    });

    test('callTool throws if context is missing', async () => {
        await expect(magentaProvider.callTool({
            tool: {name: 'create_song'},
            context: null
        })).rejects.toMatchObject({code: 'PROVIDER'});
    });
});
