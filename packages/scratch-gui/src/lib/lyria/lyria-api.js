// HTTP client for Google Lyria 3 music generation. No Redux or VM imports —
// keep this layer pure so it's easy to mock in tests.
//
// Auth note: Lyria-003 on Vertex AI is officially OAuth-only. Sending
// `x-goog-api-key` here works only if the user's GCP project has API Keys
// configured to allow Lyria, or if LYRIA_ENDPOINT is overridden to point at
// a same-origin proxy that injects a real bearer token. Shipping a Google
// API key in client-side JS is a security risk; for production deployments
// prefer the proxy route.

const DEFAULT_LYRIA_ENDPOINT =
    'https://us-central1-aiplatform.googleapis.com/v1/projects/{projectId}/locations/us-central1/publishers/google/models/lyria-003:predict';

const getEndpoint = () => process.env.LYRIA_ENDPOINT || DEFAULT_LYRIA_ENDPOINT;

class LyriaError extends Error {
    constructor (code, message) {
        super(message);
        this.code = code;
        this.name = 'LyriaError';
    }
}

const base64ToUint8Array = b64 => {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
};

/**
 * Generate ~30s of instrumental music from a text prompt.
 * @param {string} prompt
 * @param {string} apiKey  Google API key (process.env.GOOGLE_API_KEY)
 * @param {AbortSignal} [signal]
 * @returns {Promise<{wavBytes: Uint8Array}>}
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

    const body = {
        instances: [{prompt: prompt.trim()}],
        parameters: {sample_count: 1}
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
        try {
            const errJson = await res.json();
            detail = (errJson && errJson.error && errJson.error.message) ||
                JSON.stringify(errJson);
        } catch (e) {
            // ignore — surface status only
        }
        throw new LyriaError('http', `Lyria API error ${res.status}: ${detail}`);
    }

    const json = await res.json();
    const b64 = json && json.predictions && json.predictions[0] &&
        json.predictions[0].bytesBase64Encoded;
    if (!b64) {
        throw new LyriaError(
            'shape',
            'Unexpected response from Lyria (no predictions[0].bytesBase64Encoded).'
        );
    }
    return {wavBytes: base64ToUint8Array(b64)};
};

export {
    generateMusic,
    LyriaError,
    DEFAULT_LYRIA_ENDPOINT
};
