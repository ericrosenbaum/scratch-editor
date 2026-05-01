import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import {repoRoot} from './safety.js';

const PROMPTS_DIR = path.resolve(new URL('../prompts', import.meta.url).pathname);

async function readPrompt(name) {
    return fs.readFile(path.join(PROMPTS_DIR, name), 'utf8');
}

async function buildRepoIndex() {
    const root = repoRoot();
    const patterns = [
        'packages/scratch-gui/src/components/**/*.{jsx,tsx,js,css}',
        'packages/scratch-gui/src/containers/**/*.{jsx,tsx,js}',
        'packages/scratch-gui/src/reducers/**/*.{js,ts}',
        'packages/scratch-gui/src/lib/**/*.{js,jsx,ts,tsx}',
        'packages/scratch-vm/src/**/*.js',
        'packages/scratch-render/src/**/*.js',
        'packages/scratch-svg-renderer/src/**/*.js'
    ];
    const files = await fg(patterns, {
        cwd: root,
        ignore: ['**/node_modules/**', '**/test/**', '**/__tests__/**'],
        onlyFiles: true,
        followSymbolicLinks: false
    });

    const lines = ['# Repository file index', '', `Total: ${files.length} files`, ''];
    const grouped = new Map();
    for (const f of files.sort()) {
        const dir = path.dirname(f);
        if (!grouped.has(dir)) grouped.set(dir, []);
        grouped.get(dir).push(path.basename(f));
    }
    for (const [dir, names] of grouped) {
        lines.push(`## ${dir}`);
        for (const n of names) lines.push(`- ${dir}/${n}`);
        lines.push('');
    }
    return lines.join('\n');
}

export async function buildSystemBlocks() {
    const system = await readPrompt('system.md');
    const index = await buildRepoIndex();

    return [
        {
            type: 'text',
            text: system,
            cache_control: {type: 'ephemeral'}
        },
        {
            type: 'text',
            text: index,
            cache_control: {type: 'ephemeral'}
        }
    ];
}
