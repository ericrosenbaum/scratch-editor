/**
 * Browser-side client for the vibe-server (proxied at /api/vibe).
 * Uses fetch + ReadableStream for SSE on POST /api/vibe/prompt.
 */

const API_BASE = '/api/vibe';

export async function postPrompt({sessionId, prompt}, handlers) {
    const res = await fetch(`${API_BASE}/prompt`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({sessionId, prompt})
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`vibe-server error ${res.status}: ${text}`);
    }
    await consumeSSE(res.body, handlers);
}

export async function revertTurn({sessionId, turnId, force = false}) {
    const res = await fetch(`${API_BASE}/revert`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({sessionId, turnId, force})
    });
    if (!res.ok) throw new Error(`revert failed: ${res.status}`);
    return res.json();
}

export async function getHistory(sessionId) {
    const res = await fetch(`${API_BASE}/history?sessionId=${encodeURIComponent(sessionId)}`);
    if (!res.ok) throw new Error(`history fetch failed: ${res.status}`);
    return res.json();
}

export function openEventStream(sessionId, handlers) {
    const url = `${API_BASE}/events?sessionId=${encodeURIComponent(sessionId)}`;
    const es = new EventSource(url);
    for (const [event, fn] of Object.entries(handlers)) {
        es.addEventListener(event, evt => {
            try {
                fn(JSON.parse(evt.data));
            } catch {
                fn(evt.data);
            }
        });
    }
    return es;
}

async function consumeSSE(stream, handlers) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const chunk = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const event = parseSSEChunk(chunk);
            if (event && handlers[event.type]) {
                handlers[event.type](event.data);
            }
        }
    }
}

function parseSSEChunk(chunk) {
    let type = 'message';
    let data = '';
    for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) type = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!data) return null;
    try {
        return {type, data: JSON.parse(data)};
    } catch {
        return {type, data};
    }
}
