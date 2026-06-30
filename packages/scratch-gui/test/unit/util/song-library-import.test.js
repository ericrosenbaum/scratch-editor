import {
    reconcileTrackForSong,
    songFromLibraryItem,
    previewSongForItem
} from '../../../src/lib/song-library/import.js';

const trackItem = (overrides = {}) => ({
    name: 'Test Track',
    itemType: 'track',
    kind: 'instrument',
    tags: ['lofi', 'melody'],
    tempo: 80,
    rootPitch: 60, // C4
    scaleType: 'major',
    lengthSteps: 32,
    stepsPerBeat: 4,
    instrumentName: 'Piano',
    payload: {
        kind: 'instrument',
        instrument: 1,
        volume: 80,
        effects: {reverb: 0, delay: 0, filter: 100, pan: 0},
        notes: [
            {step: 0, durationSteps: 1, velocity: 100, pitch: 60}, // C4 (root)
            {step: 4, durationSteps: 1, velocity: 100, pitch: 67} // G4 (5th)
        ]
    },
    ...overrides
});

const songItem = () => ({
    name: 'Test Section',
    itemType: 'song',
    tags: ['rock'],
    tempo: 160,
    rootPitch: 52,
    scaleType: 'pentatonicMinor',
    lengthSteps: 64,
    stepsPerBeat: 4,
    trackCount: 2,
    payload: {
        tempo: 160,
        lengthSteps: 64,
        stepsPerBeat: 4,
        key: 'E',
        octave: 3,
        scale: 'pentatonicMinor',
        tracks: [
            {kind: 'instrument', instrument: 5, volume: 85, effects: {}, notes: [{step: 0, durationSteps: 2, velocity: 100, pitch: 40}]},
            {kind: 'drum', drumLanes: [1, 2], volume: 90, effects: {}, notes: [{step: 0, durationSteps: 1, velocity: 110, drum: 2}]}
        ]
    }
});

describe('song-library import reconcileTrackForSong', () => {
    test('transposes a pitched track from the item key to the song key', () => {
        // Item in C major, song in D major (+2 semitones).
        const song = {lengthSteps: 32, rootPitch: 62, scaleType: 'major'};
        const track = reconcileTrackForSong(trackItem(), song);
        // C4 (60) -> D4 (62); G4 (67) -> A4 (69). Both in D major, so no snap drift.
        expect(track.notes.map(n => n.pitch).sort((a, b) => a - b)).toEqual([62, 69]);
    });

    test('snaps transposed notes into the song scale', () => {
        // Item in C major, song in C minor. E4 (64) is out of C minor; the
        // nearest in-scale pitch is chosen, ties broken upward, so E -> F (65).
        const item = trackItem({
            payload: {
                kind: 'instrument',
                instrument: 1,
                volume: 80,
                effects: {},
                notes: [{step: 0, durationSteps: 1, velocity: 100, pitch: 64}] // E4
            }
        });
        const song = {lengthSteps: 32, rootPitch: 60, scaleType: 'minor'};
        const track = reconcileTrackForSong(item, song);
        expect(track.notes[0].pitch).toBe(65); // F is the nearest C-minor pitch (tie -> up)
    });

    test('assigns a fresh trackId and is editable (sanitized) output', () => {
        const song = {lengthSteps: 32, rootPitch: 60, scaleType: 'major'};
        const track = reconcileTrackForSong(trackItem(), song);
        expect(typeof track.trackId).toBe('string');
        expect(track.kind).toBe('instrument');
        expect(track.instrument).toBe(1);
    });

    test('drops notes outside the host song length', () => {
        const item = trackItem({
            payload: {
                kind: 'instrument',
                instrument: 1,
                volume: 80,
                effects: {},
                notes: [
                    {step: 0, durationSteps: 1, velocity: 100, pitch: 60},
                    {step: 40, durationSteps: 1, velocity: 100, pitch: 60} // out of range for len 16
                ]
            }
        });
        const song = {lengthSteps: 16, rootPitch: 60, scaleType: 'major'};
        const track = reconcileTrackForSong(item, song);
        expect(track.notes).toHaveLength(1);
        expect(track.notes[0].step).toBe(0);
    });

    test('passes drum tracks through without transposition', () => {
        const item = trackItem({
            kind: 'drum',
            payload: {
                kind: 'drum',
                drumLanes: [1, 2],
                volume: 90,
                effects: {},
                notes: [{step: 0, durationSteps: 1, velocity: 110, drum: 2}]
            }
        });
        const song = {lengthSteps: 32, rootPitch: 67, scaleType: 'minor'};
        const track = reconcileTrackForSong(item, song);
        expect(track.kind).toBe('drum');
        expect(track.notes[0].drum).toBe(2);
        expect(track.notes[0].pitch).toBeUndefined();
    });
});

describe('song-library import previewSongForItem', () => {
    test('wraps a track item in a one-track song at its authored context', () => {
        const song = previewSongForItem(trackItem());
        expect(song.tracks).toHaveLength(1);
        expect(song.tempo).toBe(80);
        expect(song.rootPitch).toBe(60);
        expect(song.scaleType).toBe('major');
        expect(song.tracks[0].kind).toBe('instrument');
    });

    test('sanitizes a song item into a full multi-track song', () => {
        const song = previewSongForItem(songItem());
        expect(song.tracks).toHaveLength(2);
        expect(song.tempo).toBe(160);
        expect(typeof song.songId).toBe('string');
    });
});

describe('song-library import songFromLibraryItem', () => {
    test('returns a sanitized song adopting the item key/scale/tempo', () => {
        const song = songFromLibraryItem(songItem());
        expect(song.tempo).toBe(160);
        expect(song.scaleType).toBe('pentatonicMinor');
        expect(song.tracks).toHaveLength(2);
        expect(typeof song.songId).toBe('string');
        song.tracks.forEach(t => expect(typeof t.trackId).toBe('string'));
    });
});
