import {SongAiError} from '../errors.js';

const getLanguageModel = () => {
    if (typeof self !== 'undefined' && self.LanguageModel) return self.LanguageModel;
    if (typeof window !== 'undefined') {
        if (window.LanguageModel) return window.LanguageModel;
        if (window.ai && window.ai.languageModel) return window.ai.languageModel;
    }
    return null;
};

// Cache one session per unique system prompt so repeated calls don't re-pay
// the session-creation cost. Sessions are tied to the system prompt because
// the Prompt API treats `initialPrompts` as the priming context.
const sessionCache = new Map();

const getSession = systemPrompt => {
    if (sessionCache.has(systemPrompt)) return sessionCache.get(systemPrompt);
    const LanguageModel = getLanguageModel();
    if (!LanguageModel) {
        throw new SongAiError('Gemini Nano (window.LanguageModel) is not available.', 'NO_PROVIDER');
    }
    const opts = {};
    if (systemPrompt) {
        opts.initialPrompts = [{role: 'system', content: systemPrompt}];
    }
    // `LanguageModel.create` returns the session once any pending download
    // completes. We don't surface download progress yet — the on-disk model
    // is shipped with Chrome on supported builds, so first use is usually
    // instant. (TODO: wire a `monitor` callback through if/when the model
    // is treated as a separately-downloadable component on some channels.)
    const promise = LanguageModel.create(opts);
    sessionCache.set(systemPrompt, promise);
    promise.catch(() => sessionCache.delete(systemPrompt));
    return promise;
};

// The model occasionally wraps JSON in ```json fences or appends a trailing
// comma. Try a few mild repairs before giving up.
const parseJsonWithRepair = text => {
    const trimmed = (text || '').trim();
    const candidates = [trimmed];
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) candidates.push(fenceMatch[1].trim());
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
    }
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch (e) { /* try next */ }
        // Strip trailing commas inside arrays/objects and retry once.
        try {
            return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1'));
        } catch (e) { /* try next */ }
    }
    return null;
};

const geminiNanoProvider = {
    id: 'gemini-nano',
    label: 'Gemini Nano (Chrome)',
    async isAvailable () {
        const LanguageModel = getLanguageModel();
        if (!LanguageModel) return false;
        if (typeof LanguageModel.availability === 'function') {
            try {
                const status = await LanguageModel.availability();
                // Spec values: 'unavailable' | 'downloadable' | 'downloading' | 'available'
                return status !== 'unavailable';
            } catch (e) {
                return false;
            }
        }
        return true;
    },
    async callTool ({systemPrompt, userMessage, tool, signal}) {
        let session;
        try {
            session = await getSession(systemPrompt);
        } catch (err) {
            if (err instanceof SongAiError) throw err;
            throw new SongAiError(`Could not start Gemini Nano session: ${err.message}`, 'NO_PROVIDER');
        }

        // The Prompt API doesn't support tool/function-calling. Tell the model
        // (in the user message) what shape to produce, and use the API's JSON-
        // Schema-constrained output where it's supported.
        const instructed = [
            userMessage,
            '',
            `Respond with a SINGLE JSON object conforming to the "${tool.name}" schema. ` +
                'No prose, no markdown fences, no commentary — JSON only.'
        ].join('\n');

        let responseText;
        try {
            responseText = await session.prompt(instructed, {
                responseConstraint: tool.input_schema,
                signal
            });
        } catch (err) {
            if (err?.name === 'AbortError') throw err;
            // Older Chrome builds reject unknown options like responseConstraint;
            // retry without it and let the JSON repairer catch what comes back.
            try {
                responseText = await session.prompt(instructed, {signal});
            } catch (err2) {
                if (err2?.name === 'AbortError') throw err2;
                throw new SongAiError(`Gemini Nano error: ${err2.message}`, 'HTTP');
            }
        }

        const toolInput = parseJsonWithRepair(responseText);
        return {
            toolInput,
            stopReason: 'end_turn',
            raw: responseText
        };
    }
};

export {geminiNanoProvider};
