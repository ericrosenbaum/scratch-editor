import {SongAiError} from '../errors.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOKENS = 8192;
const LOCAL_STORAGE_KEY = 'scratchAnthropicApiKey';

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
        return Promise.resolve(resolveApiKey() !== null);
    },
    async callTool ({systemPrompt, userMessage, tool, signal}) {
        const apiKey = resolveApiKey();
        if (!apiKey) {
            throw new SongAiError(
                'No Anthropic API key found. Set ANTHROPIC_API_KEY in .env (and rebuild), or run ' +
                    `localStorage.setItem('${LOCAL_STORAGE_KEY}', 'sk-ant-...') in the browser console.`,
                'NO_API_KEY'
            );
        }

        let response;
        try {
            response = await fetch(ANTHROPIC_API_URL, {
                method: 'POST',
                signal,
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model,
                    max_tokens: MAX_TOKENS,
                    system: systemPrompt,
                    tools: [tool],
                    tool_choice: {type: 'tool', name: tool.name},
                    messages: [{role: 'user', content: userMessage}]
                })
            });
        } catch (err) {
            if (err?.name === 'AbortError') throw err;
            throw new SongAiError(`Network error: ${err.message}`, 'NETWORK');
        }

        if (!response.ok) {
            let detail = '';
            try {
                const body = await response.text();
                detail = body ? `: ${body.slice(0, 200)}` : '';
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

export {anthropicProvider, anthropicOpusProvider, LOCAL_STORAGE_KEY};
