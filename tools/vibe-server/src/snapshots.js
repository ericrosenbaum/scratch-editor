import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {repoRoot, resolveSafe, relativeToRepo} from './safety.js';

const SNAPSHOT_ROOT = path.join(repoRoot(), '.vibe', 'snapshots');

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const encodePath = relPath => Buffer.from(relPath).toString('base64url');

async function ensureDir(dir) {
    await fs.mkdir(dir, {recursive: true});
}

export async function turnDir(turnId) {
    const dir = path.join(SNAPSHOT_ROOT, turnId);
    await ensureDir(dir);
    return dir;
}

async function manifestPath(turnId) {
    return path.join(await turnDir(turnId), 'manifest.json');
}

async function readManifest(turnId) {
    try {
        const raw = await fs.readFile(await manifestPath(turnId), 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        if (err.code === 'ENOENT') return {files: {}};
        throw err;
    }
}

async function writeManifest(turnId, manifest) {
    await fs.writeFile(await manifestPath(turnId), JSON.stringify(manifest, null, 2));
}

/**
 * Record the pre-edit state of a file for a given turn.
 * Idempotent per (turnId, path) — only the first call within a turn captures the original.
 */
export async function recordPreEdit(turnId, absPath) {
    resolveSafe(absPath);
    const relPath = relativeToRepo(absPath);
    const manifest = await readManifest(turnId);

    if (manifest.files[relPath]) return;

    const dir = await turnDir(turnId);
    const slot = path.join(dir, encodePath(relPath));

    let existed = true;
    let preHash = null;
    try {
        const original = await fs.readFile(absPath);
        await fs.writeFile(slot, original);
        preHash = sha256(original);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        existed = false;
    }

    manifest.files[relPath] = {
        existed,
        preHash,
        postHash: null,
        slot: encodePath(relPath)
    };
    await writeManifest(turnId, manifest);
}

/**
 * After all edits in a turn are flushed, record post-edit hashes so revert can
 * detect divergence (user edited the file between turn-end and revert-click).
 */
export async function recordPostEdit(turnId) {
    const manifest = await readManifest(turnId);
    for (const relPath of Object.keys(manifest.files)) {
        const absPath = path.join(repoRoot(), relPath);
        try {
            const buf = await fs.readFile(absPath);
            manifest.files[relPath].postHash = sha256(buf);
            manifest.files[relPath].existedAfter = true;
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
            manifest.files[relPath].existedAfter = false;
        }
    }
    await writeManifest(turnId, manifest);
}

/**
 * Revert a turn. Returns {restored, diverged} listing files.
 * If a file's current hash doesn't match its post-edit hash, it's diverged
 * and skipped (unless force === true).
 */
export async function revertTurn(turnId, {force = false} = {}) {
    const manifest = await readManifest(turnId);
    const restored = [];
    const diverged = [];

    for (const [relPath, entry] of Object.entries(manifest.files)) {
        const absPath = path.join(repoRoot(), relPath);
        let currentHash = null;
        try {
            currentHash = sha256(await fs.readFile(absPath));
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
        }

        if (!force && entry.postHash && currentHash !== entry.postHash) {
            diverged.push(relPath);
            continue;
        }

        if (entry.existed) {
            const slot = path.join(await turnDir(turnId), entry.slot);
            const original = await fs.readFile(slot);
            await fs.mkdir(path.dirname(absPath), {recursive: true});
            await fs.writeFile(absPath, original);
        } else {
            try {
                await fs.unlink(absPath);
            } catch (err) {
                if (err.code !== 'ENOENT') throw err;
            }
        }
        restored.push(relPath);
    }

    return {restored, diverged};
}

export async function listTurnFiles(turnId) {
    const manifest = await readManifest(turnId);
    return Object.keys(manifest.files);
}

export async function purgeOlderThan(maxAgeMs) {
    try {
        const entries = await fs.readdir(SNAPSHOT_ROOT, {withFileTypes: true});
        const cutoff = Date.now() - maxAgeMs;
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const dir = path.join(SNAPSHOT_ROOT, entry.name);
            const stat = await fs.stat(dir);
            if (stat.mtimeMs < cutoff) {
                await fs.rm(dir, {recursive: true, force: true});
            }
        }
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
}
