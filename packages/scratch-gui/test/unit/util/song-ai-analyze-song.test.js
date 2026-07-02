import {analyzeSong, formatSongBrief} from '../../../src/lib/song-ai/analyze-song.js';
import seed from '../../../eval/song-ai/seeds/sad-story-piano.seed.json';

describe('analyzeSong harmony inference', () => {
    test('recovers the real chord progression from a known seed', () => {
        // The sad-story seed (A minor, 64 steps) has a sustained pad + bass that
        // spell Am / F / G repeating. We assert the analyzer recovers THAT (the
        // musically-correct harmony), not the eval metric's coarser [0,8,5,7]
        // approximation — the analyzer reads the actual notes.
        const analysis = analyzeSong({
            tracks: seed.tracks,
            rootPitch: seed.rootPitch,
            scaleType: seed.scaleType,
            lengthSteps: seed.lengthSteps
        });
        expect(analysis.hasHarmony).toBe(true);
        expect(analysis.harmony.map(r => r.label)).toEqual(
            ['Am', 'F', 'G', 'Am', 'F', 'G', 'Am']
        );
        // Adjacent identical chords are merged: the two F regions (steps 8-15 and
        // 16-23) collapse into one span.
        expect(analysis.harmony[0]).toMatchObject({start: 0, end: 8});
        expect(analysis.harmony[1]).toMatchObject({start: 8, end: 24});
        // Every region resolved with confidence (pad fully spells each triad).
        expect(analysis.harmony.every(r => r.confident)).toBe(true);
        // Am region lists the correct chord tones.
        expect(analysis.harmony[0].tonePcs.slice().sort((a, b) => a - b))
            .toEqual([0, 4, 9]); // C, E, A
    });

    test('formatted brief states the scale and the chord regions', () => {
        const analysis = analyzeSong({
            tracks: seed.tracks,
            rootPitch: seed.rootPitch,
            scaleType: seed.scaleType,
            lengthSteps: seed.lengthSteps
        });
        const brief = formatSongBrief(analysis, {
            rootPitch: seed.rootPitch,
            scaleType: seed.scaleType
        });
        expect(brief).toContain('Key/scale: A minor');
        expect(brief).toContain('Am (A C E)');
        expect(brief).toContain('F (F A C)');
        expect(brief).toContain('Structure');
    });
});

describe('analyzeSong scale edge cases', () => {
    test('pentatonic thirdless degree yields a sus voicing, no out-of-scale third', () => {
        // C pentatonic-minor: C D# F G A#. A chord rooted on F has no diatonic
        // third (neither F+3 nor F+4 is in scale) -> root/4th/5th sus voicing.
        const analysis = analyzeSong({
            tracks: [
                {kind: 'instrument',
                    instrument: 8,
                    notes: [
                        {step: 0, durationSteps: 8, pitch: 41, velocity: 80} // F2 bass
                    ]},
                {kind: 'instrument',
                    instrument: 1,
                    notes: [
                        {step: 0, durationSteps: 8, pitch: 53, velocity: 80}, // F3
                        {step: 0, durationSteps: 8, pitch: 60, velocity: 70} // C4 (the 5th)
                    ]}
            ],
            rootPitch: 60,
            scaleType: 'pentatonicMinor',
            lengthSteps: 8
        });
        expect(analysis.harmony).toHaveLength(1);
        const chord = analysis.harmony[0];
        expect(chord.label).toMatch(/sus$/);
        // No chord tone is out of the pentatonic-minor scale (offsets 0,3,5,7,10).
        const inScalePcs = [0, 3, 5, 7, 10].map(o => (o + 60) % 12);
        for (const pc of chord.tonePcs) expect(inScalePcs).toContain(pc);
    });

    test('chromatic scale still resolves a chord label', () => {
        const analysis = analyzeSong({
            tracks: [
                {kind: 'instrument',
                    instrument: 1,
                    notes: [
                        {step: 0, durationSteps: 8, pitch: 60, velocity: 80},
                        {step: 0, durationSteps: 8, pitch: 64, velocity: 80},
                        {step: 0, durationSteps: 8, pitch: 67, velocity: 80}
                    ]}
            ],
            rootPitch: 60,
            scaleType: 'chromatic',
            lengthSteps: 8
        });
        expect(analysis.hasHarmony).toBe(true);
        expect(analysis.harmony[0].label).toBe('C');
    });
});

describe('analyzeSong empty / drum-only', () => {
    test('no pitched notes -> hasHarmony false and a tonic-fallback brief', () => {
        const analysis = analyzeSong({
            tracks: [
                {kind: 'drum',
                    drumLanes: [1, 2],
                    notes: [
                        {step: 0, durationSteps: 1, drum: 1, velocity: 90},
                        {step: 8, durationSteps: 1, drum: 2, velocity: 90}
                    ]}
            ],
            rootPitch: 62,
            scaleType: 'minor',
            lengthSteps: 32
        });
        expect(analysis.hasHarmony).toBe(false);
        const brief = formatSongBrief(analysis, {rootPitch: 62, scaleType: 'minor'});
        expect(brief).toContain('No existing harmony yet');
        expect(brief).toContain('Dm'); // tonic of D minor
        expect(brief).not.toContain('steps 0-');
    });

    test('empty song does not throw', () => {
        expect(() => analyzeSong({
            tracks: [], rootPitch: 60, scaleType: 'major', lengthSteps: 32
        })).not.toThrow();
    });
});

describe('analyzeSong structure + register', () => {
    test('marks a resting bar and reports each track register', () => {
        const analysis = analyzeSong({
            tracks: [
                {kind: 'instrument',
                    instrument: 1,
                    notes: [
                    // plays only in bar 1 (steps 0-15), rests in bar 2
                        {step: 0, durationSteps: 4, pitch: 72, velocity: 90},
                        {step: 8, durationSteps: 4, pitch: 76, velocity: 90}
                    ]},
                {kind: 'instrument',
                    instrument: 8,
                    notes: [
                    // bass plays in both bars
                        {step: 0, durationSteps: 8, pitch: 41, velocity: 80},
                        {step: 16, durationSteps: 8, pitch: 43, velocity: 80}
                    ]}
            ],
            rootPitch: 65,
            scaleType: 'major',
            lengthSteps: 32
        });
        expect(analysis.structure.bars).toBe(2);
        expect(analysis.structure.grid[0].cells).toEqual([true, false]); // rests in bar 2
        expect(analysis.structure.grid[1].cells).toEqual([true, true]);
        const lead = analysis.registers[0];
        expect(lead.min).toBe(72);
        expect(lead.max).toBe(76);
        const bass = analysis.registers[1];
        expect(bass.role).toBe('bass');
    });
});

describe('analyzeSong robustness', () => {
    test('fractional MIDI-import steps do not throw and still infer harmony', () => {
        const analysis = analyzeSong({
            tracks: [
                {kind: 'instrument',
                    instrument: 1,
                    notes: [
                        {step: 0.5, durationSteps: 2.5, pitch: 60, velocity: 80},
                        {step: 4.5, durationSteps: 2.5, pitch: 64, velocity: 80},
                        {step: 0.5, durationSteps: 7.5, pitch: 67, velocity: 70}
                    ]}
            ],
            rootPitch: 60,
            scaleType: 'major',
            lengthSteps: 16
        });
        expect(analysis.hasHarmony).toBe(true);
        expect(analysis.harmony.length).toBeGreaterThan(0);
    });
});
