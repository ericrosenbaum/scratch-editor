#!/usr/bin/env node
/* eslint-disable */
/**
 * Launcher for the Song-Maker eval harness.
 *
 * The harness code (and the song-ai source it exercises) is authored as ESM
 * `.js`/`.mjs` and pulls in `@magenta/music`'s narrow `esm/*` entry points,
 * none of which Node can import directly (see memory: magenta_headless_node).
 * So we bundle `cli.mjs` into a single Node-runnable CJS file with esbuild —
 * the same esbuild that ships inside `tsx` (no extra install) — then run it.
 *
 * Usage:  node packages/scratch-gui/eval/song-ai/launch.cjs <command> [...args]
 *   commands: fetch-checkpoints | seeds | goldens | run | help
 */
const path = require('path');
const fs = require('fs');

const HERE = __dirname;
// eval/song-ai -> eval -> scratch-gui -> packages -> repo root
const REPO_ROOT = path.resolve(HERE, '../../../..');

const resolveEsbuild = () => {
    const candidates = [
        path.join(REPO_ROOT, 'node_modules/esbuild'),
        path.join(REPO_ROOT, 'node_modules/tsx/node_modules/esbuild')
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return require(c);
    }
    throw new Error(
        'Could not find esbuild. Expected it at node_modules/esbuild or ' +
        'node_modules/tsx/node_modules/esbuild.'
    );
};

const main = () => {
    const esbuild = resolveEsbuild();
    const buildDir = path.join(HERE, '.build');
    fs.mkdirSync(buildDir, {recursive: true});
    const outfile = path.join(buildDir, 'cli.cjs');

    esbuild.buildSync({
        entryPoints: [path.join(HERE, 'cli.mjs')],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node18',
        outfile,
        logLevel: 'error',
        external: [
            // Reached only via a dynamic import inside an uncalled provider path.
            '@mediapipe/tasks-genai',
            // run-browser drives Gemma 4 in a real Chrome; Playwright is a Node
            // lib with its own binaries, so require it at runtime, don't bundle.
            'playwright-core',
            'playwright'
        ]
    });

    // The bundle loses import.meta.url, so hand it the source dir explicitly.
    process.env.EVAL_ROOT = HERE;
    // Hand argv (minus our launcher) to the bundled CLI.
    process.argv = [process.argv[0], outfile, ...process.argv.slice(2)];
    require(outfile);
};

main();
