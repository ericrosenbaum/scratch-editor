// Verifies the CC0 human-authored MIDI sections bundled in song-tracks.json
// survive the library import path (sanitizeSong) losslessly: every track is
// kept, tempo/length are preserved, and every pitch lands unchanged in range.
// The conversion deliberately tags these songs scale:"chromatic" so the
// importer's scale-snapping is a no-op and the original MIDI pitches are kept.
import songTracks from '../../../src/lib/libraries/song-tracks.json';
import {sanitizeSong} from '../../../src/lib/song-ai/sanitize.js';
import {MIN_PITCH, MAX_PITCH} from '../../../src/lib/scale-utils.js';

const midiItems = songTracks.filter(item => item.source === 'cc0-midi');

// Count of notes that survive sanitize: snapNotesToScale dedupes notes that
// collapse onto the same (pitch, step), so the lossless expectation is the
// number of *distinct* (pitch, step) pairs, not the raw note count.
const distinctPitchSteps = track => {
    const seen = new Set();
    for (const n of track.notes) {
        if (typeof n.pitch === 'number') seen.add(`${n.pitch}_${n.step}`);
    }
    return seen.size;
};

describe('CC0 MIDI song-library sections', () => {
    test('there is a meaningful number of imported MIDI sections', () => {
        expect(midiItems.length).toBeGreaterThanOrEqual(10);
    });

    midiItems.forEach(item => {
        describe(item.name, () => {
            const payload = item.payload;
            const song = sanitizeSong(payload, item.name);

            test('metadata is consistent and within Song Maker limits', () => {
                expect(item.itemType).toBe('song');
                expect(payload.scale).toBe('chromatic');
                expect(payload.stepsPerBeat).toBe(4);
                expect(payload.lengthSteps).toBeGreaterThanOrEqual(4);
                expect(payload.lengthSteps).toBeLessThanOrEqual(128);
                expect(payload.tracks.length).toBe(item.trackCount);
                expect(payload.tracks.length).toBeLessThanOrEqual(4);
            });

            test('sanitizeSong preserves tempo, length and every track', () => {
                expect(song.tempo).toBe(payload.tempo);
                expect(song.lengthSteps).toBe(payload.lengthSteps);
                expect(song.stepsPerBeat).toBe(4);
                expect(song.tracks.length).toBe(payload.tracks.length);
                song.tracks.forEach((t, i) => {
                    expect(t.kind).toBe(payload.tracks[i].kind);
                });
            });

            test('pitched notes import in range with pitches unchanged', () => {
                song.tracks.forEach((t, i) => {
                    const src = payload.tracks[i];
                    if (t.kind !== 'instrument' && t.kind !== 'synth') return;
                    // chromatic + already-in-range => no note is moved or lost
                    // beyond exact (pitch, step) de-duplication.
                    expect(t.notes.length).toBe(distinctPitchSteps(src));
                    for (const n of t.notes) {
                        expect(n.pitch).toBeGreaterThanOrEqual(MIN_PITCH);
                        expect(n.pitch).toBeLessThanOrEqual(MAX_PITCH);
                        expect(n.step).toBeLessThan(song.lengthSteps);
                        expect(n.step + n.durationSteps).toBeLessThanOrEqual(song.lengthSteps);
                    }
                    // the multiset of imported pitches is a subset of the source
                    const srcPitches = new Set(src.notes.map(n => `${n.pitch}_${n.step}`));
                    for (const n of t.notes) {
                        expect(srcPitches.has(`${n.pitch}_${n.step}`)).toBe(true);
                    }
                });
            });

            test('drum notes import on valid lanes', () => {
                song.tracks.forEach(t => {
                    if (t.kind !== 'drum') return;
                    expect(t.drumLanes.length).toBeGreaterThan(0);
                    for (const n of t.notes) {
                        expect(t.drumLanes).toContain(n.drum);
                        expect(n.step).toBeLessThan(song.lengthSteps);
                    }
                });
            });
        });
    });
});
