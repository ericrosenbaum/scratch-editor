import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import {resolveSafe, relativeToRepo, repoRoot, LIMITS, PathScopeError} from './safety.js';
import {recordPreEdit} from './snapshots.js';

export const TOOL_DEFS = [
    {
        name: 'list_files',
        description:
            'List files matching a glob (relative to repo root). Allowed roots: ' +
            'packages/scratch-gui/src, packages/scratch-vm/src, packages/scratch-render/src, ' +
            'packages/scratch-svg-renderer/src.',
        input_schema: {
            type: 'object',
            properties: {
                pattern: {
                    type: 'string',
                    description: 'Glob pattern relative to repo root, e.g. "packages/scratch-gui/src/components/**/*.css"'
                }
            },
            required: ['pattern']
        }
    },
    {
        name: 'read_file',
        description: 'Read a UTF-8 text file from one of the allowed roots.',
        input_schema: {
            type: 'object',
            properties: {
                path: {type: 'string', description: 'Path relative to repo root'}
            },
            required: ['path']
        }
    },
    {
        name: 'edit_file',
        description:
            'Replace exactly one occurrence of `old_str` with `new_str` in the file. Fails if old_str ' +
            'is missing or appears more than once. Use enough surrounding context to make old_str unique.',
        input_schema: {
            type: 'object',
            properties: {
                path: {type: 'string'},
                old_str: {type: 'string'},
                new_str: {type: 'string'}
            },
            required: ['path', 'old_str', 'new_str']
        }
    },
    {
        name: 'create_file',
        description: 'Create a new file with the given content. Fails if the file already exists.',
        input_schema: {
            type: 'object',
            properties: {
                path: {type: 'string'},
                content: {type: 'string'}
            },
            required: ['path', 'content']
        }
    },
    {
        name: 'delete_file',
        description: 'Delete a file. Fails if the file does not exist.',
        input_schema: {
            type: 'object',
            properties: {
                path: {type: 'string'}
            },
            required: ['path']
        }
    }
];

export class ToolError extends Error {
    constructor(message, {recoverable = true} = {}) {
        super(message);
        this.name = 'ToolError';
        this.recoverable = recoverable;
    }
}

class TurnBudget {
    constructor() {
        this.toolCalls = 0;
        this.edits = 0;
        this.touchedFiles = new Set();
    }
    bumpToolCall() {
        this.toolCalls += 1;
        if (this.toolCalls > LIMITS.MAX_TOOL_CALLS_PER_TURN) {
            throw new ToolError(
                `tool-call budget exceeded (${LIMITS.MAX_TOOL_CALLS_PER_TURN}); turn aborted`,
                {recoverable: false}
            );
        }
    }
    bumpEdit(absPath) {
        this.touchedFiles.add(absPath);
        this.edits += 1;
        if (this.edits > LIMITS.MAX_EDITS_PER_TURN) {
            throw new ToolError(
                `per-turn edit budget exceeded (${LIMITS.MAX_EDITS_PER_TURN}); turn aborted`,
                {recoverable: false}
            );
        }
    }
}

export function createTurnBudget() {
    return new TurnBudget();
}

async function listFiles({pattern}) {
    if (typeof pattern !== 'string') throw new ToolError('pattern must be a string');
    const root = repoRoot();
    const matches = await fg(pattern, {
        cwd: root,
        dot: false,
        onlyFiles: true,
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
        followSymbolicLinks: false
    });
    const results = [];
    for (const entry of matches) {
        try {
            resolveSafe(entry);
            results.push(entry);
            if (results.length >= 500) break;
        } catch (err) {
            if (!(err instanceof PathScopeError)) throw err;
        }
    }
    return results.sort();
}

async function readFile({path: relPath}) {
    const abs = resolveSafe(relPath);
    const stat = await fs.stat(abs).catch(err => {
        if (err.code === 'ENOENT') throw new ToolError(`file not found: ${relPath}`);
        throw err;
    });
    if (stat.size > LIMITS.MAX_READ_BYTES) {
        throw new ToolError(
            `file is ${stat.size} bytes, exceeds read limit ${LIMITS.MAX_READ_BYTES}`
        );
    }
    return await fs.readFile(abs, 'utf8');
}

async function editFile({path: relPath, old_str, new_str}, {turnId, budget}) {
    if (typeof old_str !== 'string' || typeof new_str !== 'string') {
        throw new ToolError('old_str and new_str must be strings');
    }
    const abs = resolveSafe(relPath);
    let original;
    try {
        original = await fs.readFile(abs, 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') throw new ToolError(`file not found: ${relPath}`);
        throw err;
    }
    const occurrences = original.split(old_str).length - 1;
    if (occurrences === 0) {
        throw new ToolError(
            `old_str not found in ${relPath}. Re-read the file and use a unique substring.`
        );
    }
    if (occurrences > 1) {
        throw new ToolError(
            `old_str matches ${occurrences} places in ${relPath}; include more surrounding context to make it unique.`
        );
    }
    const updated = original.replace(old_str, new_str);
    if (Buffer.byteLength(updated, 'utf8') > LIMITS.MAX_FILE_BYTES) {
        throw new ToolError(`resulting file would exceed ${LIMITS.MAX_FILE_BYTES} bytes`);
    }
    await recordPreEdit(turnId, abs);
    await fs.writeFile(abs, updated);
    budget.bumpEdit(abs);
    return `ok: edited ${relativeToRepo(abs)}`;
}

async function createFile({path: relPath, content}, {turnId, budget}) {
    if (typeof content !== 'string') throw new ToolError('content must be a string');
    const abs = resolveSafe(relPath);
    if (Buffer.byteLength(content, 'utf8') > LIMITS.MAX_FILE_BYTES) {
        throw new ToolError(`content exceeds ${LIMITS.MAX_FILE_BYTES} bytes`);
    }
    try {
        await fs.access(abs);
        throw new ToolError(`file already exists: ${relPath}; use edit_file instead`);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
    await recordPreEdit(turnId, abs);
    await fs.mkdir(path.dirname(abs), {recursive: true});
    await fs.writeFile(abs, content);
    budget.bumpEdit(abs);
    return `ok: created ${relativeToRepo(abs)}`;
}

async function deleteFile({path: relPath}, {turnId, budget}) {
    const abs = resolveSafe(relPath);
    try {
        await fs.access(abs);
    } catch (err) {
        if (err.code === 'ENOENT') throw new ToolError(`file not found: ${relPath}`);
        throw err;
    }
    await recordPreEdit(turnId, abs);
    await fs.unlink(abs);
    budget.bumpEdit(abs);
    return `ok: deleted ${relativeToRepo(abs)}`;
}

const HANDLERS = {
    list_files: listFiles,
    read_file: readFile,
    edit_file: editFile,
    create_file: createFile,
    delete_file: deleteFile
};

export async function dispatchTool({name, input}, ctx) {
    ctx.budget.bumpToolCall();
    const handler = HANDLERS[name];
    if (!handler) throw new ToolError(`unknown tool: ${name}`);
    try {
        const result = await handler(input, ctx);
        return {ok: true, content: typeof result === 'string' ? result : JSON.stringify(result)};
    } catch (err) {
        if (err instanceof ToolError || err instanceof PathScopeError) {
            return {ok: false, content: `error: ${err.message}`, recoverable: err.recoverable !== false};
        }
        throw err;
    }
}
