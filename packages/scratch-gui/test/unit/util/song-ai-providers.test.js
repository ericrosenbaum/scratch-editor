import {
    getProvider,
    listProviders,
    listAvailableProviders,
    generateSongFromPrompt,
    generateTrackWithPrompt,
    editTrackWithPrompt,
    SongAiError
} from '../../../src/lib/song-ai.js';
import {createBlankSong, createBlankTrack} from '../../../src/lib/song-defaults.js';
import {MAX_LENGTH_STEPS} from '../../../src/lib/scale-utils.js';

describe('song-ai provider registry', () => {
    test('listProviders returns anthropic, anthropic-opus, gemini-nano, gemma4, magenta', () => {
        const ids = listProviders().map(p => p.id);
        expect(ids).toContain('anthropic');
        expect(ids).toContain('anthropic-opus');
        expect(ids).toContain('gemini-nano');
        expect(ids).toContain('gemma4');
        expect(ids).toContain('magenta');
    });

    test('getProvider returns the requested provider', () => {
        expect(getProvider('anthropic').id).toBe('anthropic');
        expect(getProvider('anthropic-opus').id).toBe('anthropic-opus');
        expect(getProvider('gemini-nano').id).toBe('gemini-nano');
        expect(getProvider('gemma4').id).toBe('gemma4');
    });

    test('getProvider falls back to anthropic for unknown ids', () => {
        expect(getProvider('not-a-provider').id).toBe('anthropic');
        expect(getProvider().id).toBe('anthropic');
    });

    test('anthropic provider isAvailable reflects API-key presence', async () => {
        const provider = getProvider('anthropic');
        // In the jsdom test env, no API key is set anywhere.
        delete process.env.ANTHROPIC_API_KEY;
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.removeItem('scratchAnthropicApiKey');
            } catch (e) { /* ignore */ }
        }
        await expect(provider.isAvailable()).resolves.toBe(false);
        process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
        await expect(provider.isAvailable()).resolves.toBe(true);
        delete process.env.ANTHROPIC_API_KEY;
    });

    test('gemini-nano provider isAvailable returns false when LanguageModel is absent', async () => {
        const provider = getProvider('gemini-nano');
        // No LanguageModel global in the jsdom test env.
        await expect(provider.isAvailable()).resolves.toBe(false);
    });

    test('gemma4 provider isAvailable returns false without WebGPU', async () => {
        const provider = getProvider('gemma4');
        // jsdom has no navigator.gpu.
        await expect(provider.isAvailable()).resolves.toBe(false);
    });

    test('gemma4 parseJsonWithRepair handles truncated brackets', () => {
        // eslint-disable-next-line global-require
        const {__testables} = require('../../../src/lib/song-ai/providers/gemma4.js');
        // Drop the closing array + object brackets, like Gemma 4 sometimes does on long outputs.
        const truncated = '{"name":"t","tempo":120,"tracks":[{"kind":"instrument","volume":80,"notes":[{"step":0,"durationSteps":1,"pitch":60,"velocity":90}';
        const out = __testables.parseJsonWithRepair(truncated);
        expect(out).toBeTruthy();
        expect(out.name).toBe('t');
        expect(Array.isArray(out.tracks)).toBe(true);
    });

    test('gemma4 parseJsonWithRepair strips ```json fences', () => {
        // eslint-disable-next-line global-require
        const {__testables} = require('../../../src/lib/song-ai/providers/gemma4.js');
        const fenced = '```json\n{"hello":"world"}\n```';
        const out = __testables.parseJsonWithRepair(fenced);
        expect(out).toEqual({hello: 'world'});
    });

    test('listAvailableProviders annotates each entry with available flag', async () => {
        delete process.env.ANTHROPIC_API_KEY;
        const entries = await listAvailableProviders();
        const byId = Object.fromEntries(entries.map(e => [e.id, e]));
        expect(byId.anthropic.available).toBe(false);
        expect(byId['gemini-nano'].available).toBe(false);
        expect(byId.gemma4.available).toBe(false);
        process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
        const entries2 = await listAvailableProviders();
        const byId2 = Object.fromEntries(entries2.map(e => [e.id, e]));
        expect(byId2.anthropic.available).toBe(true);
        delete process.env.ANTHROPIC_API_KEY;
    });
});

describe('song-ai orchestration via a stub provider', () => {
    // Inject a stub by mutating the same provider slot the registry returns —
    // this exercises the orchestration path without hitting any network.
    const stubProvider = (id, toolInput) => {
        const provider = getProvider(id);
        const original = provider.callTool;
        provider.callTool = () => Promise.resolve({
            toolInput,
            stopReason: 'end_turn',
            raw: {stub: true}
        });
        return () => {
            provider.callTool = original;
        };
    };

    test('generateSongFromPrompt sanitizes the provider output', async () => {
        const restore = stubProvider('anthropic', {
            name: 'Stub Song',
            tempo: 9999,
            lengthSteps: 9999,
            key: 'C',
            octave: 4,
            scale: 'major',
            tracks: [{
                kind: 'instrument',
                instrument: 1,
                volume: 80,
                notes: [{step: 0, durationSteps: 1, pitch: 60, velocity: 80}]
            }]
        });
        try {
            const song = await generateSongFromPrompt({
                prompt: 'anything',
                providerId: 'anthropic',
                fallbackName: 'Fallback'
            });
            expect(song.tempo).toBeLessThanOrEqual(500);
            expect(song.lengthSteps).toBeLessThanOrEqual(MAX_LENGTH_STEPS);
            expect(song.tracks).toHaveLength(1);
            expect(song.tracks[0].notes).toHaveLength(1);
        } finally {
            restore();
        }
    });

    test('generateSongFromPrompt rejects empty prompts before calling provider', async () => {
        await expect(generateSongFromPrompt({
            prompt: '   ',
            providerId: 'anthropic'
        })).rejects.toBeInstanceOf(SongAiError);
    });

    test('generateTrackWithPrompt forces the requested track kind', async () => {
        const song = createBlankSong('s');
        const restore = stubProvider('anthropic', {
            // Model returns the wrong kind; orchestrator should override.
            kind: 'instrument',
            instrument: 1,
            volume: 80,
            notes: [{step: 0, durationSteps: 1, pitch: 60, velocity: 80}]
        });
        try {
            const track = await generateTrackWithPrompt({
                prompt: 'a drum groove',
                song,
                kind: 'drum',
                providerId: 'anthropic'
            });
            expect(track.kind).toBe('drum');
        } finally {
            restore();
        }
    });

    test('editTrackWithPrompt preserves the original instrument and trackId', async () => {
        const song = createBlankSong('s');
        song.tracks = [createBlankTrack('instrument')];
        song.tracks[0].instrument = 5;
        const originalTrackId = song.tracks[0].trackId;
        const restore = stubProvider('anthropic', {
            // Model tries to swap kind and instrument; orchestrator should
            // force them back to the original values.
            kind: 'drum',
            instrument: 21,
            volume: 80,
            notes: [{step: 0, durationSteps: 1, pitch: 60, velocity: 80}]
        });
        try {
            const track = await editTrackWithPrompt({
                prompt: 'change it',
                song,
                trackIndex: 0,
                providerId: 'anthropic'
            });
            expect(track.kind).toBe('instrument');
            expect(track.instrument).toBe(5);
            expect(track.trackId).toBe(originalTrackId);
        } finally {
            restore();
        }
    });

    test('orchestrator surfaces NO_TOOL_USE when provider returns null', async () => {
        const restore = stubProvider('anthropic', null);
        try {
            await expect(generateSongFromPrompt({
                prompt: 'anything',
                providerId: 'anthropic'
            })).rejects.toMatchObject({code: 'NO_TOOL_USE'});
        } finally {
            restore();
        }
    });
});
