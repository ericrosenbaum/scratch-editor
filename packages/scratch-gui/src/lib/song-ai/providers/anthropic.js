import {SongAiError} from '../errors.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOKENS = 8192;
const LOCAL_STORAGE_KEY = 'scratchAnthropicApiKey';
const ACCESS_CODE_KEY = 'scratchSongAiAccessCode';

// When set at build time (webpack DefinePlugin reads SONG_AI_PROXY_URL), every
// Anthropic call is routed through this server-side proxy instead of hitting
// api.anthropic.com directly. The proxy holds the real API key and enforces an
// access code + spend cap, so the shipped browser bundle never contains a key.
// See api/song-ai.mjs. When unset (local dev) calls go direct with a local key.
const PROXY_URL = (typeof process !== 'undefined' && process.env && process.env.SONG_AI_PROXY_URL) || null;

const resolveApiKey = () => {
    if (typeof localStorage !== 'undefined') {
        try {
            const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (stored) return stored;
        } catch (e) {
            // ignore localStorage access errors (e.g. disabled in private mode)
        }
    }
    if (typeof process !== 'undefined' && process.env && process.env.ANTHROPIC_API_KEY) {
        return process.env.ANTHROPIC_API_KEY;
    }
    return null;
};

// The shared workshop access code, entered once by the user and stored in
// localStorage (see provider-picker.jsx). Sent to the proxy on every call.
const resolveAccessCode = () => {
    if (typeof localStorage !== 'undefined') {
        try {
            const stored = localStorage.getItem(ACCESS_CODE_KEY);
            if (stored) return stored;
        } catch (e) {
            // ignore localStorage access errors (e.g. disabled in private mode)
        }
    }
    return null;
};

const extractToolInput = (anthropicResponse, toolName) => {
    const content = anthropicResponse?.content;
    if (!Array.isArray(content)) return null;
    const toolUse = content.find(c => c?.type === 'tool_use' && c?.name === toolName);
    return toolUse?.input || null;
};

const makeAnthropicProvider = ({id, label, model}) => ({
    id,
    label,
    isAvailable () {
        // In proxy mode the server holds the key, so the provider is always
        // offered; the access code is validated per-call, not here.
        return Promise.resolve(PROXY_URL ? true : (resolveApiKey() !== null));
    },
    async callTool ({systemPrompt, userMessage, tool, signal}) {
        const body = JSON.stringify({
            model,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            tools: [tool],
            tool_choice: {type: 'tool', name: tool.name},
            messages: [{role: 'user', content: userMessage}]
        });

        let url;
        let headers;
        if (PROXY_URL) {
            // Proxy mode: no API key in the browser. Send only the workshop
            // access code; the proxy injects the real key server-side.
            url = PROXY_URL;
            headers = {
                'content-type': 'application/json',
                'x-access-code': resolveAccessCode() || ''
            };
        } else {
            const apiKey = resolveApiKey();
            if (!apiKey) {
                throw new SongAiError(
                    'No Anthropic API key found. Set ANTHROPIC_API_KEY in .env (and rebuild), or run ' +
                        `localStorage.setItem('${LOCAL_STORAGE_KEY}', 'sk-ant-...') in the browser console.`,
                    'NO_API_KEY'
                );
            }
            url = ANTHROPIC_API_URL;
            headers = {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            };
        }

        let response;
        try {
            response = await fetch(url, {method: 'POST', signal, headers, body});
        } catch (err) {
            if (err?.name === 'AbortError') throw err;
            throw new SongAiError(`Network error: ${err.message}`, 'NETWORK');
        }

        if (!response.ok) {
            // Surface the two proxy gate failures as friendly, actionable errors
            // so the modal can prompt the user (see provider-picker.jsx).
            if (PROXY_URL && response.status === 401) {
                throw new SongAiError(
                    'This needs a workshop access code. Enter the code you were ' +
                        'given and try again.',
                    'ACCESS_CODE'
                );
            }
            if (PROXY_URL && response.status === 429) {
                throw new SongAiError(
                    'The workshop has hit its usage limit for now. Please try again later.',
                    'CAP'
                );
            }
            let detail = '';
            try {
                const errBody = await response.text();
                detail = errBody ? `: ${errBody.slice(0, 200)}` : '';
            } catch (e) { /* ignore */ }
            throw new SongAiError(`Anthropic API error ${response.status}${detail}`, 'HTTP');
        }

        let payload;
        try {
            payload = await response.json();
        } catch (e) {
            throw new SongAiError('Could not parse Anthropic response.', 'PARSE');
        }

        const toolInput = extractToolInput(payload, tool.name);
        return {
            toolInput,
            stopReason: payload && payload.stop_reason,
            raw: payload
        };
    }
});

// Keep `id: 'anthropic'` for the Haiku provider so existing localStorage
// values still resolve to it.
const anthropicProvider = makeAnthropicProvider({
    id: 'anthropic',
    label: 'Claude Haiku (Anthropic API)',
    model: 'claude-haiku-4-5'
});

const anthropicOpusProvider = makeAnthropicProvider({
    id: 'anthropic-opus',
    label: 'Claude Opus (Anthropic API)',
    model: 'claude-opus-4-7'
});

export {anthropicProvider, anthropicOpusProvider, LOCAL_STORAGE_KEY, ACCESS_CODE_KEY, PROXY_URL};
