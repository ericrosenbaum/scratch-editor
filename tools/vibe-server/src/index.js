import 'dotenv/config';
import Fastify from 'fastify';
import path from 'node:path';
import crypto from 'node:crypto';
import {repoRoot} from './safety.js';
import {newSessionId, loadSession, saveSession, appendTurn, updateTurn} from './session-store.js';
import {buildSystemBlocks} from './system-prompt.js';
import {runAgentTurn} from './agent-loop.js';
import {revertTurn, purgeOlderThan} from './snapshots.js';
import {RebuildKicker} from './rebuild-kicker.js';

const PORT = Number(process.env.VIBE_PORT || 3001);
const HOST = process.env.VIBE_HOST || '127.0.0.1';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const fastify = Fastify({logger: {level: process.env.LOG_LEVEL || 'info'}});
const log = fastify.log;

if (!ANTHROPIC_KEY) {
    log.warn(
        'ANTHROPIC_API_KEY is not set. /api/vibe/prompt will return 500 until you add it to .env'
    );
}

await purgeOlderThan(7 * 24 * 60 * 60 * 1000); // 7 days

let cachedSystemBlocks = null;
async function getSystemBlocks() {
    if (!cachedSystemBlocks) cachedSystemBlocks = await buildSystemBlocks();
    return cachedSystemBlocks;
}

const inFlightSessions = new Set();
const eventClients = new Map(); // sessionId -> Set<reply>

function fanout(sessionId, event, data) {
    const clients = eventClients.get(sessionId);
    if (!clients) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const reply of clients) {
        try {
            reply.raw.write(payload);
        } catch (err) {
            log.warn({err}, 'sse fanout write failed');
        }
    }
}

const rebuildKicker = new RebuildKicker({
    log,
    onStatus: ({workspace, phase, code, error}) => {
        for (const sessionId of inFlightSessions) {
            fanout(sessionId, 'rebuild', {workspace, phase, code, error});
        }
    }
});

fastify.get('/api/vibe/health', async () => ({
    ok: true,
    repoRoot: repoRoot(),
    hasApiKey: Boolean(ANTHROPIC_KEY),
    inFlight: inFlightSessions.size
}));

fastify.get('/api/vibe/history', async (request, reply) => {
    const sessionId = request.query.sessionId;
    if (!sessionId) return reply.code(400).send({error: 'sessionId required'});
    const session = await loadSession(sessionId);
    return session;
});

fastify.get('/api/vibe/events', (request, reply) => {
    const sessionId = request.query.sessionId;
    if (!sessionId) return reply.code(400).send({error: 'sessionId required'});

    reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    reply.raw.write(': connected\n\n');

    if (!eventClients.has(sessionId)) eventClients.set(sessionId, new Set());
    eventClients.get(sessionId).add(reply);

    request.raw.on('close', () => {
        eventClients.get(sessionId)?.delete(reply);
    });
});

fastify.post('/api/vibe/revert', async (request, reply) => {
    const {sessionId, turnId, force} = request.body || {};
    if (!sessionId || !turnId) {
        return reply.code(400).send({error: 'sessionId and turnId required'});
    }
    const result = await revertTurn(turnId, {force: Boolean(force)});
    await updateTurn(sessionId, turnId, {
        revertedAt: result.diverged.length === 0 || force ? Date.now() : null,
        divergedFiles: result.diverged
    }).catch(() => {/* turn may not exist server-side; ignore */});
    fanout(sessionId, 'reverted', {turnId, ...result});
    return result;
});

fastify.post('/api/vibe/prompt', async (request, reply) => {
    if (!ANTHROPIC_KEY) {
        return reply.code(500).send({error: 'ANTHROPIC_API_KEY not configured'});
    }
    const {sessionId: incomingSessionId, prompt} = request.body || {};
    if (!prompt || typeof prompt !== 'string') {
        return reply.code(400).send({error: 'prompt required'});
    }
    const sessionId = incomingSessionId || newSessionId();

    if (inFlightSessions.has(sessionId)) {
        return reply.code(409).send({error: 'a turn is already in flight for this session'});
    }
    inFlightSessions.add(sessionId);

    reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const emit = (event, data) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        reply.raw.write(payload);
        fanout(sessionId, event, data);
    };

    emit('session', {sessionId});

    const turnId = crypto.randomUUID();
    emit('turn-start', {turnId, prompt});

    let session = await loadSession(sessionId);

    // Reconstruct prior message history from saved turns (alternating user/assistant).
    // For simplicity in MVP we only feed prior user prompts + final assistant text,
    // not the full tool-use chain.
    const priorMessages = [];
    for (const t of session.turns) {
        priorMessages.push({role: 'user', content: t.prompt});
        if (t.assistantText) {
            priorMessages.push({role: 'assistant', content: t.assistantText});
        }
    }

    await appendTurn(sessionId, {turnId, prompt, createdAt: Date.now(), status: 'in-flight'});

    try {
        const systemBlocks = await getSystemBlocks();
        const result = await runAgentTurn({
            apiKey: ANTHROPIC_KEY,
            systemBlocks,
            priorMessages,
            userPrompt: prompt,
            turnId,
            log,
            rebuildKicker,
            emit
        });

        await updateTurn(sessionId, turnId, {
            status: 'done',
            assistantText: result.assistantText,
            editedFiles: result.editedFiles,
            stopReason: result.stopReason,
            completedAt: Date.now()
        });
    } catch (err) {
        log.error({err}, 'turn failed');
        emit('error', {turnId, message: err.message});
        await updateTurn(sessionId, turnId, {
            status: 'failed',
            error: err.message,
            completedAt: Date.now()
        }).catch(() => {});
    } finally {
        inFlightSessions.delete(sessionId);
        reply.raw.end();
    }
});

try {
    await fastify.listen({port: PORT, host: HOST});
    log.info(`vibe-server listening on http://${HOST}:${PORT}`);
} catch (err) {
    log.error({err}, 'failed to start vibe-server');
    process.exit(1);
}
