import {sanitizeSong} from '../../../src/lib/song-ai.js';
import {INSTRUMENT_NAMES, DRUM_NAMES} from '../../../src/lib/song-defaults.js';
import {MAX_LENGTH_STEPS} from '../../../src/lib/scale-utils.js';

describe('song-ai sanitizeSong', () => {
    test('clamps tempo and lengthSteps out of range', () => {
        const song = sanitizeSong({
            name: 'Test',
            tempo: 9999,
            lengthSteps: 9999,
            tracks: [{kind: 'instrument', instrument: 1, volume: 80, notes: []}]
        }, 'Fallback');
        expect(song.tempo).toBeLessThanOrEqual(500);
        expect(song.lengthSteps).toBe(MAX_LENGTH_STEPS);
    });

    test('drops notes whose step is >= lengthSteps', () => {
        const song = sanitizeSong({
            name: 'T',
            tempo: 120,
            lengthSteps: 16,
            tracks: [{
                kind: 'instrument',
                instrument: 1,
                volume: 80,
                notes: [
                    {step: 0, durationSteps: 1, pitch: 60},
                    {step: 15, durationSteps: 1, pitch: 60},
                    {step: 16, durationSteps: 1, pitch: 60}, // out of range
                    {step: 99, durationSteps: 1, pitch: 60} // out of range
                ]
            }]
        }, 'F');
        expect(song.tracks[0].notes).toHaveLength(2);
        expect(song.tracks[0].notes.every(n => n.step < 16)).toBe(true);
    });

    test('clamps instrument and drum indices', () => {
        const song = sanitizeSong({
            name: 'T',
            tempo: 120,
            lengthSteps: 16,
            tracks: [
                {kind: 'instrument', instrument: 999, volume: 80, notes: []},
                {kind: 'drum', drum: 999, volume: 80, notes: []}
            ]
        }, 'F');
        expect(song.tracks[0].instrument).toBe(INSTRUMENT_NAMES.length);
        expect(song.tracks[0].drum).toBeUndefined();
        expect(song.tracks[1].drum).toBe(DRUM_NAMES.length);
        expect(song.tracks[1].instrument).toBeUndefined();
    });

    test('skips instrument notes without pitch but keeps drum notes without pitch', () => {
        const song = sanitizeSong({
            name: 'T',
            tempo: 120,
            lengthSteps: 16,
            tracks: [
                {
                    kind: 'instrument',
                    instrument: 1,
                    volume: 80,
                    notes: [
                        {step: 0, durationSteps: 1, pitch: 60},
                        {step: 1, durationSteps: 1} // missing pitch
                    ]
                },
                {
                    kind: 'drum',
                    drum: 1,
                    volume: 80,
                    notes: [{step: 0, durationSteps: 1}]
                }
            ]
        }, 'F');
        expect(song.tracks[0].notes).toHaveLength(1);
        expect(song.tracks[0].notes[0]).toEqual({step: 0, durationSteps: 1, pitch: 60});
        expect(song.tracks[1].notes).toHaveLength(1);
        expect(song.tracks[1].notes[0]).toEqual({step: 0, durationSteps: 1});
    });

    test('clamps invalid durationSteps to a small positive minimum', () => {
        // The floor is a small fraction (not 1) so un-quantized MIDI imports can
        // keep sub-step note lengths; zero/negative durations still clamp up.
        const song = sanitizeSong({
            name: 'T',
            tempo: 120,
            lengthSteps: 16,
            tracks: [{
                kind: 'drum',
                drum: 1,
                volume: 80,
                notes: [
                    {step: 0, durationSteps: 0},
                    {step: 4, durationSteps: -5}
                ]
            }]
        }, 'F');
        expect(song.tracks[0].notes.map(n => n.durationSteps)).toEqual([0.25, 0.25]);
    });

    test('regenerates songId and trackId regardless of model output', () => {
        const song = sanitizeSong({
            name: 'T',
            tempo: 120,
            lengthSteps: 16,
            songId: 'malicious-fixed-id',
            tracks: [{
                trackId: 'malicious-fixed-id',
                kind: 'instrument',
                instrument: 1,
                volume: 80,
                notes: []
            }]
        }, 'F');
        expect(song.songId).not.toBe('malicious-fixed-id');
        expect(song.tracks[0].trackId).not.toBe('malicious-fixed-id');
        expect(song.songId).toMatch(/^song-/);
        expect(song.tracks[0].trackId).toMatch(/^track-/);
    });

    test('falls back to a single blank instrument track when tracks are missing/empty', () => {
        const song = sanitizeSong({
            name: 'T',
            tempo: 120,
            lengthSteps: 16,
            tracks: []
        }, 'Fallback');
        expect(song.tracks).toHaveLength(1);
        expect(song.tracks[0].kind).toBe('instrument');
    });

    test('uses fallbackName when name is missing or blank', () => {
        const song = sanitizeSong({
            tempo: 120,
            lengthSteps: 16,
            tracks: [{kind: 'instrument', instrument: 1, volume: 80, notes: []}]
        }, 'Fallback Name');
        expect(song.name).toBe('Fallback Name');
    });

    test('truncates overly long names', () => {
        const longName = 'a'.repeat(200);
        const song = sanitizeSong({
            name: longName,
            tempo: 120,
            lengthSteps: 16,
            tracks: [{kind: 'instrument', instrument: 1, volume: 80, notes: []}]
        }, 'F');
        expect(song.name.length).toBeLessThanOrEqual(40);
    });

    test('caps tracks at 4', () => {
        const tracks = [];
        for (let i = 0; i < 10; i++) {
            tracks.push({kind: 'instrument', instrument: 1, volume: 80, notes: []});
        }
        const song = sanitizeSong({
            name: 'T',
            tempo: 120,
            lengthSteps: 16,
            tracks
        }, 'F');
        expect(song.tracks.length).toBeLessThanOrEqual(4);
    });
});
