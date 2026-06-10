// Entry point bundled by launch.cjs. Dispatches subcommands. Kept small; real
// work lives in commands/*.
//
//   node launch.cjs <command> [flags]
//     fetch-checkpoints      pre-download model checkpoints into checkpoints/
//     seeds [--force]        generate partially-filled seed songs via Opus
//     goldens [--force]      generate golden reference outputs via Opus
//     run [--baseline]       run Magenta over all cases, score, report
//                            [--judge] [--samples N] [--only <id>] [--category <id>]

// Coconet's coconet_utils reads navigator.userAgent at import; Node has no
// navigator, so provide a stub before any magenta-extra module loads.
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = {userAgent: 'node'};
}

// --- Quiet tfjs's noisy-but-harmless startup chatter (webgl kernel re-reg,
// the "running in Node" banner) before anything imports it. ---
const NOISE = [
    'already registered',
    'Hi, looks like you are running TensorFlow.js in Node.js',
    'visit https://github.com/tensorflow/tfjs-node',
    '============================'
];
/* eslint-disable no-console */
const origWarn = console.warn.bind(console);
const origLog = console.log.bind(console);
const isNoise = args => args.length > 0 && typeof args[0] === 'string' &&
    NOISE.some(n => args[0].includes(n));
console.warn = (...a) => { if (!isNoise(a)) origWarn(...a); };
console.log = (...a) => { if (!isNoise(a)) origLog(...a); };
// song-ai's in-browser diagnostics (logAiResponse) early-return when
// console.group isn't a function — disable it so the CLI stays readable.
console.group = undefined;
console.groupCollapsed = undefined;
console.groupEnd = () => {};
console.table = () => {};
/* eslint-enable no-console */

const parseFlags = argv => {
    const flags = {_: []};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const key = a.slice(2);
            const next = argv[i + 1];
            if (next === undefined || next.startsWith('--')) {
                flags[key] = true;
            } else {
                flags[key] = next;
                i++;
            }
        } else {
            flags._.push(a);
        }
    }
    return flags;
};

const main = async () => {
    const [, , command, ...rest] = process.argv;
    const flags = parseFlags(rest);

    switch (command) {
    case 'fetch-checkpoints': {
        const {fetchCheckpoints} = await import('./commands/fetch-checkpoints.mjs');
        await fetchCheckpoints(flags);
        break;
    }
    case 'seeds': {
        const {generateSeeds} = await import('./commands/generate-seeds.mjs');
        await generateSeeds(flags);
        break;
    }
    case 'goldens': {
        const {generateGoldens} = await import('./commands/generate-goldens.mjs');
        await generateGoldens(flags);
        break;
    }
    case 'run': {
        const {runEval} = await import('./commands/run.mjs');
        await runEval(flags);
        break;
    }
    case 'run-browser': {
        const {runBrowserEval} = await import('./commands/run-browser.mjs');
        await runBrowserEval(flags);
        break;
    }
    case 'help':
    case undefined:
        process.stdout.write(
            'Song-Maker eval harness\n\n' +
            '  fetch-checkpoints           pre-download model checkpoints\n' +
            '  seeds [--force]             generate seed songs via Opus\n' +
            '  goldens [--force]           generate golden outputs via Opus\n' +
            '  run [--baseline] [--judge] [--samples N] [--only <id>] [--category <id>]\n' +
            '  run-browser                 run on-device Gemma 4 via a real Chrome (CDP)\n' +
            '      [--smoke]                 warm up + print one raw generated song\n' +
            '      [--baseline] [--judge] [--samples N] [--only <id>] [--category <id>]\n' +
            '      [--resume <runId>] [--cdp <url>] [--page <url>] [--verbose]\n' +
            '      prereq: launch Chrome with --remote-debugging-port=9222 and run `npm start`\n'
        );
        break;
    default:
        process.stderr.write(`Unknown command: ${command}\n`);
        process.exit(1);
    }
};

main().catch(err => {
    process.stderr.write(`\n[eval] FAILED: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
});
