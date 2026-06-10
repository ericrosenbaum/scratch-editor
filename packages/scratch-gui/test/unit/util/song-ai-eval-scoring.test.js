// Smoke test for the Song-Maker eval harness scorer. Pure logic only — no
// tfjs, no network — so it runs in CI and keeps the metrics from rotting.
import {
    scaleConformance,
    constraintAdherence,
    trackCountKindMatch,
    noteDensityRatio
} from '../../../eval/song-ai/scoring/metrics.mjs';
import {scoreSample, aggregateSamples} from '../../../eval/song-ai/scoring/score.mjs';

const weights = {
    scaleConformance: 0.3,
    constraintAdherence: 0.3,
    trackCountKindMatch: 0.2,
    noteDensityRatio: 0.2
};

const view = (overrides = {}) => ({
    tempo: 120,
    lengthSteps: 16,
    rootPitch: 60, // C4
    scaleType: 'major',
    tracks: [{kind: 'instrument', notes: []}],
    ...overrides
});

const notes = pitches => pitches.map((pitch, i) => ({
    step: i, durationSteps: 1, velocity: 90, pitch
}));

describe('eval scorer metrics', () => {
    test('scaleConformance: all in-key → 1, out-of-key lowers it', () => {
        const inKey = view({tracks: [{kind: 'instrument', notes: notes([60, 62, 64, 65, 67])}]});
        expect(scaleConformance(inKey)).toBe(1);
        const oneOff = view({tracks: [{kind: 'instrument', notes: notes([60, 62, 64, 65, 61])}]});
        expect(scaleConformance(oneOff)).toBeCloseTo(0.8, 5);
    });

    test('scaleConformance: no pitched notes → null (not applicable)', () => {
        expect(scaleConformance(view())).toBeNull();
    });

    test('constraintAdherence: rewards matching requested tempo/key/scale', () => {
        const ctx = {
            unit: 'song',
            case: {intent: {requireKey: 'C', requireScale: 'major', requireTempo: 120}}
        };
        expect(constraintAdherence(view(), null, ctx)).toBeCloseTo(1, 5);
        const wrong = {
            unit: 'song',
            case: {intent: {requireKey: 'D', requireScale: 'minor', requireTempo: 120}}
        };
        // key + scale wrong (0,0), tempo right (1) → 1/3
        expect(constraintAdherence(view(), null, wrong)).toBeCloseTo(1 / 3, 5);
    });

    test('trackCountKindMatch: exact kind multiset → 1', () => {
        const out = view({tracks: [{kind: 'instrument', notes: []}, {kind: 'drum', notes: []}]});
        const ctx = {unit: 'song', setting: {expectedTrackKinds: ['instrument', 'drum']}};
        expect(trackCountKindMatch(out, out, ctx)).toBe(1);
    });

    test('noteDensityRatio: identical density → 1', () => {
        const a = view({tracks: [{kind: 'instrument', notes: notes([60, 62, 64])}]});
        expect(noteDensityRatio(a, a)).toBe(1);
    });

    test('scoreSample returns a bounded aggregate with per-metric breakdown', () => {
        const out = view({tracks: [{kind: 'instrument', notes: notes([60, 62, 64, 65])}]});
        const ctx = {
            unit: 'song',
            case: {intent: {requireTempo: 120}, category: 'multitrack-song'},
            setting: {expectedTrackKinds: ['instrument'], chordProgressionOffsets: [0, 7, 9, 5]}
        };
        const {aggregate, perMetric} = scoreSample(out, out, ctx, weights);
        expect(aggregate).toBeGreaterThanOrEqual(0);
        expect(aggregate).toBeLessThanOrEqual(1);
        expect(perMetric).toHaveProperty('scaleConformance', 1);
    });

    test('aggregateSamples computes mean/best/std and weakest metric', () => {
        const samples = [
            {aggregate: 0.8, perMetric: {scaleConformance: 1, registerMatch: 0.5}},
            {aggregate: 0.6, perMetric: {scaleConformance: 0.9, registerMatch: 0.3}}
        ];
        const roll = aggregateSamples(samples);
        expect(roll.mean).toBeCloseTo(0.7, 5);
        expect(roll.best).toBe(0.8);
        expect(roll.std).toBeGreaterThan(0);
        expect(roll.weakest.name).toBe('registerMatch');
    });
});
