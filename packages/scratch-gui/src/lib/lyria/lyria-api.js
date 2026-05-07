// HTTP client for the Gemini API's lyria-3-clip-preview music generation
// model. No Redux or VM imports — keep this layer pure so it's easy to mock
// in tests.
//
// Docs: https://ai.google.dev/gemini-api/docs/music-generation
//
// Auth note: The Gemini API supports the `x-goog-api-key` header directly.
// Shipping a key in client-side JS is still a security risk for production
// deployments — set LYRIA_ENDPOINT to a same-origin proxy that injects the
// key server-side instead.

const DEFAULT_LYRIA_ENDPOINT =
    'https://generativelanguage.googleapis.com/v1beta/models/lyria-3-clip-preview:generateContent';

const getEndpoint = () => process.env.LYRIA_ENDPOINT || DEFAULT_LYRIA_ENDPOINT;

class LyriaError extends Error {
    constructor (code, message, details) {
        super(message);
        this.code = code;
        this.name = 'LyriaError';
        this.details = details || null;
    }
}

const base64ToUint8Array = b64 => {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
};

const getCandidate = json => json &&
    json.candidates &&
    json.candidates[0];

const getParts = json => {
    const c = getCandidate(json);
    return (c && c.content && Array.isArray(c.content.parts)) ?
        c.content.parts : [];
};

const findAudioPart = json => {
    for (const part of getParts(json)) {
        const inline = part && part.inlineData;
        if (inline && inline.data && inline.mimeType &&
            inline.mimeType.startsWith('audio/')) {
            return inline;
        }
    }
    return null;
};

const formatBlockedRatings = ratings => {
    if (!Array.isArray(ratings)) return '';
    const blocked = ratings
        .filter(r => r && (r.blocked || r.probability === 'HIGH'))
        .map(r => `${r.category || 'unknown'} (${r.probability || 'n/a'})`);
    return blocked.length ? ` Safety: ${blocked.join(', ')}.` : '';
};

const buildBlockedMessage = json => {
    const pf = json && json.promptFeedback;
    if (pf && pf.blockReason) {
        return `Prompt was blocked: ${pf.blockReason}.${
            pf.blockReasonMessage ? ` ${pf.blockReasonMessage}` : ''
        }${formatBlockedRatings(pf.safetyRatings)}`;
    }
    const c = getCandidate(json);
    if (c && c.finishReason && c.finishReason !== 'STOP') {
        return `Generation stopped: ${c.finishReason}.${
            formatBlockedRatings(c.safetyRatings)
        }`;
    }
    return null;
};

/**
 * Generate ~30s of instrumental music from a text prompt.
 * @param {string} prompt
 * @param {string} apiKey  Google API key (process.env.GOOGLE_API_KEY)
 * @param {AbortSignal} [signal]
 * @returns {Promise<{audioBytes: Uint8Array, mimeType: string}>}
 */
const generateMusic = async (prompt, apiKey, signal) => {
    if (!apiKey) {
        throw new LyriaError(
            'missing-key',
            'GOOGLE_API_KEY is not set. Set it before building scratch-gui.'
        );
    }
    if (!prompt || !prompt.trim()) {
        throw new LyriaError('empty-prompt', 'Prompt is empty.');
    }

    // Force instrumental output. The model otherwise sometimes adds vocals.
    const fullPrompt = `${prompt.trim()} Instrumental only, no vocals.`;

    const body = {
        contents: [{
            parts: [{text: fullPrompt}]
        }]
    };

    let res;
    try {
        res = await fetch(getEndpoint(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify(body),
            signal
        });
    } catch (err) {
        throw new LyriaError('network', `Network error: ${err.message}`);
    }

    if (!res.ok) {
        let detail = '';
        let errJson = null;
        try {
            errJson = await res.json();
            detail = (errJson && errJson.error && errJson.error.message) ||
                JSON.stringify(errJson);
        } catch (e) {
            try {
                detail = await res.text();
            } catch (e2) {
                // surface status only
            }
        }
        throw new LyriaError(
            'http',
            `Lyria API error ${res.status} ${res.statusText || ''}: ${detail}`.trim(),
            errJson
        );
    }

    const json = await res.json();
    const audioPart = findAudioPart(json);
    if (!audioPart) {
        const blockedMsg = buildBlockedMessage(json);
        if (blockedMsg) {
            throw new LyriaError('blocked', blockedMsg, json);
        }
        throw new LyriaError(
            'shape',
            `Unexpected response from Lyria (no audio inlineData part). ` +
                `Raw: ${JSON.stringify(json).slice(0, 600)}`,
            json
        );
    }
    return {
        audioBytes: base64ToUint8Array(audioPart.data),
        mimeType: audioPart.mimeType
    };
};

export {
    generateMusic,
    LyriaError,
    DEFAULT_LYRIA_ENDPOINT
};
