// Convert a runOperation result (internal song, or single internal track) into
// the canonical WIRE shape used for committed goldens. Reuses the production
// stripIdsFromSong so goldens are byte-identical to what a UI save would emit.
import {stripIdsFromSong} from '../../../src/lib/song-ai/sanitize.js';

export const toWire = (unit, result, ctx) => {
    if (unit === 'song') {
        return stripIdsFromSong(result);
    }
    // Single track: wrap in a throwaway song using the case's musical context,
    // strip, and pull the one track back out.
    const wrapped = stripIdsFromSong({
        tempo: ctx.tempo,
        lengthSteps: ctx.lengthSteps,
        stepsPerBeat: 4,
        rootPitch: ctx.rootPitch,
        scaleType: ctx.scaleType,
        tracks: [result]
    });
    return wrapped.tracks[0];
};
