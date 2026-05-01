import path from 'node:path';
import fs from 'node:fs';

const REPO_ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);

const ALLOWED_ROOTS = [
    'packages/scratch-gui/src',
    'packages/scratch-vm/src',
    'packages/scratch-render/src',
    'packages/scratch-svg-renderer/src'
].map(p => path.join(REPO_ROOT, p) + path.sep);

const FORBIDDEN_SEGMENTS = ['node_modules', '.git', 'dist', 'build', '.vibe'];
const FORBIDDEN_BASENAMES = new Set([
    'package.json',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml'
]);

export class PathScopeError extends Error {
    constructor(message, requested) {
        super(message);
        this.name = 'PathScopeError';
        this.requestedPath = requested;
    }
}

export function repoRoot() {
    return REPO_ROOT;
}

export function resolveSafe(inputPath) {
    if (typeof inputPath !== 'string' || inputPath.length === 0) {
        throw new PathScopeError('path must be a non-empty string', inputPath);
    }

    const absolute = path.isAbsolute(inputPath)
        ? path.resolve(inputPath)
        : path.resolve(REPO_ROOT, inputPath);

    const inAllowed = ALLOWED_ROOTS.some(root => absolute.startsWith(root));
    if (!inAllowed) {
        throw new PathScopeError(
            `path is outside the allowed roots: ${inputPath}`,
            inputPath
        );
    }

    const segments = path.relative(REPO_ROOT, absolute).split(path.sep);
    if (segments.some(s => FORBIDDEN_SEGMENTS.includes(s))) {
        throw new PathScopeError(
            `path contains a forbidden segment: ${inputPath}`,
            inputPath
        );
    }

    if (FORBIDDEN_BASENAMES.has(path.basename(absolute))) {
        throw new PathScopeError(
            `path basename is not editable: ${inputPath}`,
            inputPath
        );
    }

    if (path.basename(absolute).startsWith('.env')) {
        throw new PathScopeError(`env files are not editable: ${inputPath}`, inputPath);
    }

    try {
        const stat = fs.lstatSync(absolute);
        if (stat.isSymbolicLink()) {
            throw new PathScopeError(`symlinks are not allowed: ${inputPath}`, inputPath);
        }
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        // Non-existent path is fine for create_file; caller decides.
    }

    return absolute;
}

export function relativeToRepo(absolute) {
    return path.relative(REPO_ROOT, absolute);
}

export const LIMITS = Object.freeze({
    MAX_FILE_BYTES: 200 * 1024,
    MAX_READ_BYTES: 500 * 1024,
    MAX_EDITS_PER_TURN: 20,
    MAX_TOOL_CALLS_PER_TURN: 30
});
