import {writeMidi} from 'midi-file';

import {parseMidiToSong} from '../../../src/lib/song-library/midi-to-song.js';

const PPQ = 480; // ticks per beat -> stepTicks = 120 (a 16th note)
const STEP = PPQ / 4;

// Turn a list of absolute-tick events into a midi-file track (relative
// deltaTimes + a trailing endOfTrack). Stable sort keeps note-off before a
// same-tick note-on in insertion order.
const toTrack = absEvents => {
    const sorted = [...absEvents].sort((a, b) => a.tick - b.tick);
    let prev = 0;
    const out = sorted.map(e => {
        const {tick, ...rest} = e;
        const ev = {deltaTime: tick - prev, ...rest};
        prev = tick;
        return ev;
    });
    out.push({deltaTime: 0, meta: true, type: 'endOfTrack'});
    return out;
};

// A note as an on/off pair at absolute ticks (start in steps, duration in steps).
const note = (channel, noteNumber, velocity, startStep, durSteps) => ([
    {tick: startStep * STEP, type: 'noteOn', channel, noteNumber, velocity},
    {tick: (startStep + durSteps) * STEP, type: 'noteOff', channel, noteNumber, velocity: 0}
]);

// A note whose start/length are given in raw ticks (for testing sub-step timing).
const noteAtTick = (channel, noteNumber, velocity, startTick, durTicks) => ([
    {tick: startTick, type: 'noteOn', channel, noteNumber, velocity},
    {tick: startTick + durTicks, type: 'noteOff', channel, noteNumber, velocity: 0}
]);

// A one-instrument file (tempo track + a single named channel-0 track).
const singleTrackMidi = (name, events) => ({
    header: {format: 1, numTracks: 2, ticksPerBeat: PPQ},
    tracks: [
        tempoTrack(500000),
        toTrack([{tick: 0, meta: true, type: 'trackName', text: name}, ...events])
    ]
});

const tempoTrack = usPerBeat => toTrack([{tick: 0, meta: true, type: 'setTempo', microsecondsPerBeat: usPerBeat}]);

const bytesOf = midi => new Uint8Array(writeMidi(midi));

const findByInstrument = (song, instrument) => song.tracks.find(t => t.kind === 'instrument' && t.instrument === instrument);
const drumTrack = song => song.tracks.find(t => t.kind === 'drum');

describe('parseMidiToSong', () => {
    test('channel-distributed file: maps GM programs and drums', () => {
        const midi = {
            header: {format: 1, numTracks: 4, ticksPerBeat: PPQ},
            tracks: [
                tempoTrack(500000), // 120 bpm
                toTrack([ // ch0 = Acoustic Guitar (GM program 24 -> instrument 4)
                    {tick: 0, type: 'programChange', channel: 0, programNumber: 24},
                    ...note(0, 60, 100, 0, 4),
                    ...note(0, 64, 90, 4, 2)
                ]),
                toTrack([ // ch1 = Electric Bass (GM program 33 -> instrument 6)
                    {tick: 0, type: 'programChange', channel: 1, programNumber: 33},
                    ...note(1, 40, 110, 0, 8)
                ]),
                toTrack([ // ch9 = percussion: kick (36) x2, snare (38) x1
                    ...note(9, 36, 120, 0, 1),
                    ...note(9, 38, 100, 2, 1),
                    ...note(9, 36, 118, 4, 1)
                ])
            ]
        };

        const song = parseMidiToSong(bytesOf(midi), 'Test Song');

        expect(song.tempo).toBe(120);
        expect(song.stepsPerBeat).toBe(4);
        expect(song.scaleType).toBe('chromatic'); // lossless
        // maxStep = 4 -> rounded up to a whole 16-step bar.
        expect(song.lengthSteps).toBe(16);
        expect(song.tracks).toHaveLength(3);

        const guitar = findByInstrument(song, 4);
        expect(guitar).toBeTruthy();
        expect(guitar.notes).toContainEqual({step: 0, durationSteps: 4, velocity: 100, pitch: 60});
        expect(guitar.notes).toContainEqual({step: 4, durationSteps: 2, velocity: 90, pitch: 64});

        const bass = findByInstrument(song, 6);
        expect(bass).toBeTruthy();
        expect(bass.notes).toContainEqual({step: 0, durationSteps: 8, velocity: 110, pitch: 40});

        const drums = drumTrack(song);
        expect(drums).toBeTruthy();
        expect(new Set(drums.drumLanes)).toEqual(new Set([1, 2])); // snare lane 1, kick lane 2
        expect(drums.notes).toHaveLength(3);
        expect(drums.notes.every(n => n.drum === 1 || n.drum === 2)).toBe(true);
        expect(drums.notes.filter(n => n.drum === 2)).toHaveLength(2); // two kicks
    });

    test('drums sort to the end of the track list', () => {
        const midi = {
            header: {format: 1, numTracks: 3, ticksPerBeat: PPQ},
            tracks: [
                tempoTrack(500000),
                toTrack([...note(9, 36, 120, 0, 1)]),
                toTrack([
                    {tick: 0, type: 'programChange', channel: 0, programNumber: 0},
                    ...note(0, 60, 100, 0, 4)
                ])
            ]
        };
        const song = parseMidiToSong(bytesOf(midi), 'Order');
        expect(song.tracks[song.tracks.length - 1].kind).toBe('drum');
    });

    test('track-distributed file: reads the instrument from the track name', () => {
        const midi = {
            header: {format: 1, numTracks: 3, ticksPerBeat: PPQ},
            tracks: [
                tempoTrack(500000),
                toTrack([ // named "Bass", channel 0, no program change -> instrument 6
                    {tick: 0, meta: true, type: 'trackName', text: 'Bass'},
                    ...note(0, 36, 100, 0, 4)
                ]),
                toTrack([ // named "Piano Lead", channel 0 -> instrument 1 (Piano)
                    {tick: 0, meta: true, type: 'trackName', text: 'Piano Lead'},
                    ...note(0, 60, 90, 0, 2),
                    ...note(0, 62, 90, 2, 2)
                ])
            ]
        };

        const song = parseMidiToSong(bytesOf(midi), 'Named');
        expect(song.tracks).toHaveLength(2);
        expect(findByInstrument(song, 6)).toBeTruthy(); // Bass
        expect(findByInstrument(song, 1)).toBeTruthy(); // Piano
    });

    test('trims leading silence so the first note lands at step 0', () => {
        // First note two bars in; nothing before it.
        const song = parseMidiToSong(bytesOf(singleTrackMidi('Piano', [
            ...note(0, 60, 100, 32, 2),
            ...note(0, 64, 100, 36, 2)
        ])), 'Silent Intro');
        const piano = findByInstrument(song, 1);
        expect(piano.notes.some(n => n.step === 0)).toBe(true); // shifted to the top
        expect(piano.notes.some(n => n.step === 4)).toBe(true); // 36 - 32
        expect(song.lengthSteps).toBe(16);
    });

    test('keeps only the first 16 bars and drops later notes', () => {
        const withinStep = 100;
        const beyondStep = 300; // past 16 bars (256 steps)
        const song = parseMidiToSong(bytesOf(singleTrackMidi('Piano', [
            ...note(0, 60, 100, 0, 2),
            ...note(0, 62, 100, withinStep, 2),
            ...note(0, 67, 100, beyondStep, 2)
        ])), 'Long');
        const piano = findByInstrument(song, 1);
        expect(song.lengthSteps).toBeLessThanOrEqual(256);
        expect(piano.notes.some(n => n.step === beyondStep)).toBe(false); // dropped
        expect(piano.notes.some(n => n.step === withinStep)).toBe(true); // kept
    });

    test('does not quantize timing — sub-step onsets and durations survive', () => {
        // Second note starts half a step (60 ticks) late and lasts 0.75 steps.
        const song = parseMidiToSong(bytesOf(singleTrackMidi('Piano', [
            ...noteAtTick(0, 60, 100, 0, 2 * STEP),
            ...noteAtTick(0, 64, 100, STEP / 2, (STEP * 3) / 4)
        ])), 'Groovy');
        const piano = findByInstrument(song, 1);
        const offbeat = piano.notes.find(n => n.pitch === 64);
        expect(offbeat.step).toBeCloseTo(0.5, 5); // NOT rounded to 0 or 1
        expect(offbeat.durationSteps).toBeCloseTo(0.75, 5);
    });

    test('caps per-track polyphony', () => {
        // 12 pitches all sounding at once for a full bar.
        const stacked = [];
        for (let i = 0; i < 12; i++) stacked.push(...note(0, 60 + i, 100, 0, 16));
        const song = parseMidiToSong(bytesOf(singleTrackMidi('Piano', stacked)), 'Cluster');
        const piano = findByInstrument(song, 1);
        // Bounded to MAX_VOICES_PER_TRACK (8) — fewer than the 12 supplied.
        expect(piano.notes.length).toBe(8);
    });

    test('respects the 4-track cap', () => {
        const tracks = [tempoTrack(500000)];
        // six distinct melodic channels
        for (let ch = 0; ch < 6; ch++) {
            tracks.push(toTrack([
                {tick: 0, type: 'programChange', channel: ch, programNumber: ch * 4},
                ...note(ch, 60 + ch, 100, ch, 2)
            ]));
        }
        const midi = {header: {format: 1, numTracks: tracks.length, ticksPerBeat: PPQ}, tracks};
        const song = parseMidiToSong(bytesOf(midi), 'Many');
        expect(song.tracks.length).toBeLessThanOrEqual(4);
    });

    test('throws on a file with no playable notes', () => {
        const midi = {
            header: {format: 1, numTracks: 1, ticksPerBeat: PPQ},
            tracks: [tempoTrack(500000)]
        };
        expect(() => parseMidiToSong(bytesOf(midi), 'Empty')).toThrow(/no playable notes/i);
    });

    test('throws on data that is not a MIDI file', () => {
        expect(() => parseMidiToSong(new Uint8Array([1, 2, 3, 4]), 'Bogus')).toThrow();
    });
});
