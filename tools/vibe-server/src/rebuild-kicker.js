import {spawn} from 'node:child_process';
import path from 'node:path';
import {repoRoot} from './safety.js';

const PACKAGE_REBUILD_MAP = [
    {prefix: 'packages/scratch-vm/src', workspace: 'packages/scratch-vm'},
    {prefix: 'packages/scratch-render/src', workspace: 'packages/scratch-render'},
    {prefix: 'packages/scratch-svg-renderer/src', workspace: 'packages/scratch-svg-renderer'}
    // scratch-gui is served live by webpack-dev-server; no rebuild needed.
];

const DEBOUNCE_MS = 500;

export class RebuildKicker {
    constructor({log, onStatus}) {
        this.log = log;
        this.onStatus = onStatus || (() => {});
        this.timers = new Map();      // workspace -> timeout
        this.running = new Map();      // workspace -> Promise
    }

    /**
     * Inspect a list of file paths just edited and schedule rebuilds for any
     * affected non-GUI packages. Returns immediately; actual builds run async.
     */
    schedule(editedRelPaths) {
        const workspaces = new Set();
        for (const rel of editedRelPaths) {
            for (const {prefix, workspace} of PACKAGE_REBUILD_MAP) {
                if (rel.startsWith(prefix + path.sep) || rel.startsWith(prefix + '/')) {
                    workspaces.add(workspace);
                }
            }
        }
        for (const ws of workspaces) {
            const existing = this.timers.get(ws);
            if (existing) clearTimeout(existing);
            const timer = setTimeout(() => this.#kick(ws), DEBOUNCE_MS);
            this.timers.set(ws, timer);
        }
        return [...workspaces];
    }

    #kick(workspace) {
        if (this.running.has(workspace)) return; // a build is already in flight
        this.onStatus({workspace, phase: 'start'});
        const p = new Promise((resolve, reject) => {
            const child = spawn(
                'npm',
                ['run', 'build', '--workspace', workspace],
                {cwd: repoRoot(), env: process.env, stdio: ['ignore', 'pipe', 'pipe']}
            );
            const chunks = [];
            child.stdout.on('data', d => chunks.push(d));
            child.stderr.on('data', d => chunks.push(d));
            child.on('close', code => {
                this.running.delete(workspace);
                const output = Buffer.concat(chunks).toString('utf8');
                if (code === 0) {
                    this.onStatus({workspace, phase: 'done', code});
                    resolve({code, output});
                } else {
                    this.onStatus({workspace, phase: 'failed', code, output});
                    this.log.warn({workspace, code}, 'rebuild failed');
                    resolve({code, output});
                }
            });
            child.on('error', err => {
                this.running.delete(workspace);
                this.onStatus({workspace, phase: 'failed', error: err.message});
                reject(err);
            });
        });
        this.running.set(workspace, p);
    }

    async waitForIdle() {
        const inflight = [...this.running.values()];
        await Promise.all(inflight);
    }
}
