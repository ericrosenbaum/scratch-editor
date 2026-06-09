import {INSTRUMENT_NAMES, DEFAULT_SYNTH} from '../song-defaults.js';
import {
    DEFAULT_ROOT_PITCH,
    DEFAULT_SCALE_TYPE_LEGACY,
    snapNotesToScale
} from '../scale-utils.js';

import {SongAiError} from './errors.js';
import {
    SCALE_TYPE_NAMES,
    SONG_TOOL,
    EDIT_TRACK_TOOL,
    GENERATE_TRACK_TOOL,
    buildSystemPrompt,
    buildEditSystemPrompt,
    buildGenerateTrackSystemPrompt
} from './prompts.js';
import {
    sanitizeTrack,
    sanitizeSong,
    stripIdsFromSong
} from './sanitize.js';
import {anthropicProvider, anthropicOpusProvider, LOCAL_STORAGE_KEY} from './providers/anthropic.js';
import {geminiNanoProvider} from './providers/gemini-nano.js';
import {
    gemma4Provider,
    subscribeGemma4LoadStatus,
    getGemma4LoadStatus
} from './providers/gemma4.js';
import {magentaProvider} from './providers/magenta.js';

const PROVIDERS = [
    anthropicProvider,
    anthropicOpusProvider,
    geminiNanoProvider,
    gemma4Provider,
    magentaProvider
];
const DEFAULT_PROVIDER_ID = 'anthropic';

const getProvider = id => {
    const provider = PROVIDERS.find(p => p.id === id);
    return provider || PROVIDERS.find(p => p.id === DEFAULT_PROVIDER_ID);
};

const listProviders = () => PROVIDERS.map(p => ({id: p.id, label: p.label}));

// Allow callers to await readiness of every provider at once and filter out
// the ones that don't apply to this browser / lack credentials.
const listAvailableProviders = async () => {
    const results = await Promise.all(PROVIDERS.map(async p => {
        let available = false;
        try {
            available = await p.isAvailable();
        } catch (e) {
            available = false;
        }
        return {id: p.id, label: p.label, available};
    }));
    return results;
};

const generateSongFromPrompt = async ({prompt, signal, fallbackName = 'AI Song', providerId} = {}) => {
    const text = (prompt || '').trim();
    if (!text) {
        throw new SongAiError('Prompt is empty.', 'EMPTY_PROMPT');
    }

    const provider = getProvider(providerId);
    let result;
    try {
        result = await provider.callTool({
            systemPrompt: buildSystemPrompt(),
            userMessage: text,
            tool: SONG_TOOL,
            signal,
            context: {operation: 'generateSong', prompt: text, fallbackName}
        });
    } catch (err) {
        if (err instanceof SongAiError) throw err;
        if (err?.name === 'AbortError') throw err;
        throw new SongAiError(err.message || 'Provider call failed.', 'PROVIDER');
    }

    const {toolInput, stopReason, raw} = result;
    if (!toolInput) {
        logAiResponse({prompt: text, payload: raw, toolInput: null, sanitized: null, providerId: provider.id});
        if (stopReason === 'max_tokens') {
            throw new SongAiError(
                'The model hit its output token limit before finishing the song. ' +
                    'Try a shorter prompt or ask for a simpler arrangement.',
                'MAX_TOKENS'
            );
        }
        throw new SongAiError('Model did not return a song.', 'NO_TOOL_USE');
    }

    const sanitized = sanitizeSong(toolInput, fallbackName);
    logAiResponse({prompt: text, payload: raw, toolInput, sanitized, providerId: provider.id});

    if (stopReason === 'max_tokens') {
        throw new SongAiError(
            'The model hit its output token limit before finishing the song. ' +
                'Try a shorter prompt or ask for a simpler arrangement.',
            'MAX_TOKENS'
        );
    }
    return sanitized;
};

const editTrackWithPrompt = async ({prompt, editParams, song, trackIndex, signal, providerId} = {}) => {
    const text = (prompt || '').trim();
    if (!song || !Array.isArray(song.tracks) || song.tracks.length === 0) {
        throw new SongAiError('No song to edit.', 'NO_SONG');
    }
    if (typeof trackIndex !== 'number' || trackIndex < 0 || trackIndex >= song.tracks.length) {
        throw new SongAiError('Invalid track index.', 'BAD_TRACK_INDEX');
    }

    const provider = getProvider(providerId);
    // Magenta edits are driven by structured editParams (dropdowns in the
    // modal) rather than a prose prompt. Every other provider still requires
    // text — the prompt textarea is the load-bearing input for LLMs.
    const usingStructured = provider.id === 'magenta' && editParams;
    if (!usingStructured && !text) {
        throw new SongAiError('Prompt is empty.', 'EMPTY_PROMPT');
    }

    const originalTrack = song.tracks[trackIndex];
    const cleanSong = stripIdsFromSong(song);
    let lockedFields;
    if (originalTrack.kind === 'instrument') {
        lockedFields = `instrument index: ${originalTrack.instrument} ` +
            `(${INSTRUMENT_NAMES[(originalTrack.instrument || 1) - 1]})`;
    } else if (originalTrack.kind === 'synth') {
        const presetName = (originalTrack.synth && originalTrack.synth.preset) || DEFAULT_SYNTH.preset;
        lockedFields = `synth preset: "${presetName}"`;
    } else {
        lockedFields = `drum kit lanes: ${JSON.stringify(
            Array.isArray(originalTrack.drumLanes) && originalTrack.drumLanes.length > 0 ?
                originalTrack.drumLanes :
                [originalTrack.drum || 1]
        )}`;
    }
    const userMessage = [
        `trackIndex to edit: ${trackIndex}`,
        `original track kind: ${originalTrack.kind} (DO NOT CHANGE)`,
        `${lockedFields} (DO NOT CHANGE)`,
        '',
        'Full song JSON:',
        '```json',
        JSON.stringify(cleanSong, null, 2),
        '```',
        '',
        'Edit request:',
        text
    ].join('\n');

    let result;
    try {
        result = await provider.callTool({
            systemPrompt: buildEditSystemPrompt(),
            userMessage,
            tool: EDIT_TRACK_TOOL,
            signal,
            context: {operation: 'editTrack', prompt: text, editParams, song, trackIndex, originalTrack}
        });
    } catch (err) {
        if (err instanceof SongAiError) throw err;
        if (err?.name === 'AbortError') throw err;
        throw new SongAiError(err.message || 'Provider call failed.', 'PROVIDER');
    }

    const {toolInput, stopReason, raw} = result;
    if (!toolInput) {
        logAiEditResponse({prompt: text, payload: raw, toolInput: null, sanitized: null, providerId: provider.id});
        if (stopReason === 'max_tokens') {
            throw new SongAiError(
                'The model hit its output token limit before finishing the edit. ' +
                    'Try a simpler change.',
                'MAX_TOKENS'
            );
        }
        throw new SongAiError('Model did not return an edited track.', 'NO_TOOL_USE');
    }

    // Force the edited track to keep its original kind.
    if (toolInput && toolInput.kind && toolInput.kind !== originalTrack.kind) {
        toolInput.kind = originalTrack.kind;
    }
    const sanitized = sanitizeTrack(toolInput, song.lengthSteps, originalTrack.effects);
    // Lock the instrument / synth preset / drum kit so AI edits can't quietly
    // swap the sound out from under the user.
    if (originalTrack.kind === 'instrument') {
        sanitized.instrument = originalTrack.instrument;
    } else if (originalTrack.kind === 'synth') {
        sanitized.synth = originalTrack.synth ?
            {...originalTrack.synth} :
            {...DEFAULT_SYNTH};
    } else {
        const origLanes = Array.isArray(originalTrack.drumLanes) && originalTrack.drumLanes.length > 0 ?
            originalTrack.drumLanes.slice() :
            [originalTrack.drum || 1];
        sanitized.drumLanes = origLanes;
        sanitized.notes = (sanitized.notes || []).map(n => {
            if (typeof n.drum === 'number' && origLanes.indexOf(n.drum) >= 0) return n;
            return {...n, drum: origLanes[0]};
        });
        // For synthDrum, also keep the user's edited voice params — the AI
        // chooses the pattern, not the sound. (sanitizeTrack re-seeds these
        // from preset defaults; restore the originals here.)
        if (originalTrack.kind === 'synthDrum' && originalTrack.drumVoices) {
            sanitized.drumVoices = {...originalTrack.drumVoices};
        }
    }
    sanitized.trackId = originalTrack.trackId;
    sanitized.muted = !!originalTrack.muted;
    const editRoot = (typeof song.rootPitch === 'number') ?
        song.rootPitch :
        DEFAULT_ROOT_PITCH;
    const editScale = SCALE_TYPE_NAMES.indexOf(song.scaleType) >= 0 ?
        song.scaleType :
        DEFAULT_SCALE_TYPE_LEGACY;
    sanitized.notes = snapNotesToScale([sanitized], editRoot, editScale)[0].notes;
    logAiEditResponse({prompt: text, payload: raw, toolInput, sanitized, providerId: provider.id});

    if (stopReason === 'max_tokens') {
        throw new SongAiError(
            'The model hit its output token limit before finishing the edit. ' +
                'Try a simpler change.',
            'MAX_TOKENS'
        );
    }
    return sanitized;
};

const generateTrackWithPrompt = async ({prompt, song, kind, signal, providerId} = {}) => {
    const text = (prompt || '').trim();
    if (!text) {
        throw new SongAiError('Prompt is empty.', 'EMPTY_PROMPT');
    }
    if (!song || !Array.isArray(song.tracks)) {
        throw new SongAiError('No song to add to.', 'NO_SONG');
    }
    if (kind !== 'instrument' && kind !== 'drum' && kind !== 'synth') {
        throw new SongAiError('Invalid track kind.', 'BAD_KIND');
    }

    const cleanSong = stripIdsFromSong(song);
    const userMessage = [
        `kind of new track to add: ${kind}`,
        '',
        'Existing song JSON:',
        '```json',
        JSON.stringify(cleanSong, null, 2),
        '```',
        '',
        'Description of the new track:',
        text
    ].join('\n');

    const provider = getProvider(providerId);
    let result;
    try {
        result = await provider.callTool({
            systemPrompt: buildGenerateTrackSystemPrompt(kind),
            userMessage,
            tool: GENERATE_TRACK_TOOL,
            signal,
            context: {operation: 'generateTrack', prompt: text, song, kind}
        });
    } catch (err) {
        if (err instanceof SongAiError) throw err;
        if (err?.name === 'AbortError') throw err;
        throw new SongAiError(err.message || 'Provider call failed.', 'PROVIDER');
    }

    const {toolInput, stopReason, raw} = result;
    if (!toolInput) {
        logAiEditResponse({prompt: text, payload: raw, toolInput: null, sanitized: null, providerId: provider.id});
        if (stopReason === 'max_tokens') {
            throw new SongAiError(
                'The model hit its output token limit before finishing the track. ' +
                    'Try a simpler description.',
                'MAX_TOKENS'
            );
        }
        throw new SongAiError('Model did not return a track.', 'NO_TOOL_USE');
    }

    if (toolInput.kind !== kind) {
        toolInput.kind = kind;
    }
    const sanitized = sanitizeTrack(toolInput, song.lengthSteps);
    const genRoot = (typeof song.rootPitch === 'number') ?
        song.rootPitch :
        DEFAULT_ROOT_PITCH;
    const genScale = SCALE_TYPE_NAMES.indexOf(song.scaleType) >= 0 ?
        song.scaleType :
        DEFAULT_SCALE_TYPE_LEGACY;
    sanitized.notes = snapNotesToScale([sanitized], genRoot, genScale)[0].notes;
    logAiEditResponse({prompt: text, payload: raw, toolInput, sanitized, providerId: provider.id});

    if (stopReason === 'max_tokens') {
        throw new SongAiError(
            'The model hit its output token limit before finishing the track. ' +
                'Try a simpler description.',
            'MAX_TOKENS'
        );
    }
    return sanitized;
};

/* eslint-disable no-console */
const logAiResponse = ({prompt, payload, toolInput, sanitized, providerId}) => {
    if (typeof console === 'undefined' || typeof console.group !== 'function') return;
    try {
        console.groupCollapsed(
            `%c[song-ai${providerId ? `:${providerId}` : ''}] response${sanitized ? '' : ' (no tool_use)'}`,
            'color: #4C97FF; font-weight: bold;'
        );
        console.log('prompt:', prompt);
        if (payload && typeof payload === 'object') {
            console.log('stop_reason:', payload.stop_reason);
            console.log('usage:', payload.usage);
            if (Array.isArray(payload.content)) {
                for (const block of payload.content) {
                    if (block && block.type === 'text' && block.text) {
                        console.log('model text:', block.text);
                    }
                }
            }
        }
        console.log('raw payload:', payload);
        console.log('raw tool_use input:', toolInput);
        if (toolInput && Array.isArray(toolInput.tracks)) {
            const summary = toolInput.tracks.map((t, i) => ({
                idx: i,
                kind: t && t.kind,
                instrument: t && t.instrument,
                drum: t && t.drum,
                noteCount: t && Array.isArray(t.notes) ? t.notes.length : 0
            }));
            console.table(summary);
            const empties = summary.filter(s => s.noteCount === 0);
            if (empties.length > 0) {
                console.warn('Empty tracks from model:', empties);
            }
        }
        if (sanitized) {
            console.log('sanitized song:', sanitized);
            const sanSummary = (sanitized.tracks || []).map((t, i) => ({
                idx: i,
                kind: t.kind,
                noteCount: (t.notes || []).length
            }));
            console.table(sanSummary);
            const droppedNotes = (toolInput.tracks || []).map((rt, i) => {
                const before = rt && Array.isArray(rt.notes) ? rt.notes.length : 0;
                const after = sanitized.tracks[i] ? (sanitized.tracks[i].notes || []).length : 0;
                return {idx: i, before, after, dropped: before - after};
            }).filter(d => d.dropped > 0);
            if (droppedNotes.length > 0) {
                console.warn('Notes dropped by sanitizer:', droppedNotes);
            }
        }
    } catch (e) {
        // Logging must never throw.
    } finally {
        try {
            console.groupEnd();
        } catch (e) { /* noop */ }
    }
};

const logAiEditResponse = ({prompt, payload, toolInput, sanitized, providerId}) => {
    if (typeof console === 'undefined' || typeof console.group !== 'function') return;
    try {
        console.groupCollapsed(
            `%c[song-ai${providerId ? `:${providerId}` : ''}] edit response${sanitized ? '' : ' (no tool_use)'}`,
            'color: #4C97FF; font-weight: bold;'
        );
        console.log('prompt:', prompt);
        if (payload && typeof payload === 'object') {
            console.log('stop_reason:', payload.stop_reason);
            console.log('usage:', payload.usage);
            if (Array.isArray(payload.content)) {
                for (const block of payload.content) {
                    if (block && block.type === 'text' && block.text) {
                        console.log('model text:', block.text);
                    }
                }
            }
        }
        console.log('raw tool_use input:', toolInput);
        if (toolInput) {
            console.log('raw note count:', Array.isArray(toolInput.notes) ? toolInput.notes.length : 0);
        }
        if (sanitized) {
            console.log('sanitized track:', sanitized);
            console.log('sanitized note count:', (sanitized.notes || []).length);
            if (toolInput && Array.isArray(toolInput.notes)) {
                const before = toolInput.notes.length;
                const after = sanitized.notes.length;
                if (before !== after) {
                    console.warn(`Sanitizer dropped ${before - after} note(s).`);
                }
            }
        }
    } catch (e) { /* logging must never throw */
    } finally {
        try {
            console.groupEnd();
        } catch (e) { /* noop */ }
    }
};
/* eslint-enable no-console */

export {
    generateSongFromPrompt,
    editTrackWithPrompt,
    generateTrackWithPrompt,
    sanitizeSong,
    sanitizeTrack,
    SongAiError,
    LOCAL_STORAGE_KEY,
    getProvider,
    listProviders,
    listAvailableProviders,
    subscribeGemma4LoadStatus,
    getGemma4LoadStatus
};
