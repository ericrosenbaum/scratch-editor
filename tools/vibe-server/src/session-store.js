import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {repoRoot} from './safety.js';

const SESSIONS_DIR = path.join(repoRoot(), '.vibe', 'sessions');

async function ensureDir() {
    await fs.mkdir(SESSIONS_DIR, {recursive: true});
}

function sessionPath(sessionId) {
    if (!/^[a-zA-Z0-9-]+$/.test(sessionId)) {
        throw new Error(`invalid session id: ${sessionId}`);
    }
    return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

export function newSessionId() {
    return crypto.randomUUID();
}

export async function loadSession(sessionId) {
    await ensureDir();
    try {
        const raw = await fs.readFile(sessionPath(sessionId), 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        if (err.code === 'ENOENT') {
            return {sessionId, turns: [], createdAt: Date.now()};
        }
        throw err;
    }
}

export async function saveSession(session) {
    await ensureDir();
    await fs.writeFile(sessionPath(session.sessionId), JSON.stringify(session, null, 2));
}

export async function appendTurn(sessionId, turn) {
    const session = await loadSession(sessionId);
    session.turns.push(turn);
    await saveSession(session);
    return session;
}

export async function updateTurn(sessionId, turnId, patch) {
    const session = await loadSession(sessionId);
    const turn = session.turns.find(t => t.turnId === turnId);
    if (!turn) throw new Error(`turn not found: ${turnId}`);
    Object.assign(turn, patch);
    await saveSession(session);
    return turn;
}
