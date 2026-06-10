// Thin uniform wrapper over the *real* song-ai orchestration in index.js, so
// goldens (providerId='anthropic-opus') and the system under test
// (providerId='magenta') travel the identical sanitize + scale-snap pipeline.
import {
    generateSongFromPrompt,
    generateTrackWithPrompt,
    editTrackWithPrompt
} from '../../../src/lib/song-ai/index.js';

// Returns {unit: 'song'|'track', result} where result is the sanitized INTERNAL
// shape that index.js produces (internal song, or a single internal track).
export const runOperation = async ({testCase, seed, providerId, signal}) => {
    const c = testCase;
    switch (c.operation) {
    case 'generateSong': {
        const result = await generateSongFromPrompt({
            prompt: c.prompt,
            providerId,
            fallbackName: c.id,
            signal
        });
        return {unit: 'song', result};
    }
    case 'generateTrack': {
        const result = await generateTrackWithPrompt({
            prompt: c.prompt,
            song: seed,
            kind: c.kind,
            providerId,
            signal
        });
        return {unit: 'track', result};
    }
    case 'editTrack': {
        const result = await editTrackWithPrompt({
            prompt: c.prompt,
            editParams: c.editParams || null,
            song: seed,
            trackIndex: c.trackIndex,
            providerId,
            signal
        });
        return {unit: 'track', result};
    }
    default:
        throw new Error(`Unknown operation: ${c.operation}`);
    }
};
