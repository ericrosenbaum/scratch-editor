/* eslint-disable dot-notation */
/* global console, process */
/**
 * @file Micro-benchmark for JS-powered blocks: js-interpreter (sandboxed) vs the
 * experimental "direct execution" mode (runtime.jsBlocksDirectExecution). Measures
 * the per-call cost of representative compute-heavy blocks in both modes.
 *
 * Run:  node packages/scratch-vm/perf/js-blocks-benchmark.js
 *
 * To compare RAW execution cost we raise the interpreter's per-tick step budget so
 * every call finishes synchronously in one slice (the real VM intentionally spreads
 * heavy work across ticks; that cooperative scheduling is a separate concern from
 * "how expensive is one interpreter step vs native"). This is NOT a tap test and is
 * excluded from the test globs.
 */

const Runtime = require('../src/engine/runtime');
const JsBlockRunner = require('../src/extension-support/js-blocks/js-block-runner');

// Let heavy blocks finish synchronously so timing reflects execution, not the
// macrotask scheduling the interpreter uses to stay responsive on a real tick.
JsBlockRunner.Budget.NORMAL_SLICE = 1e12;
JsBlockRunner.Budget.WARP_SLICE = 1e12;
JsBlockRunner.Budget.HARD_CAP = 1e15;
JsBlockRunner.Budget.REPORTER_CHUNK = 1e12;
JsBlockRunner.Budget.HAT_CAP = 1e12;

const makeTarget = () => ({
    x: 0,
    y: 0,
    direction: 90,
    size: 100,
    visible: true,
    isStage: false,
    isOriginal: true,
    currentCostume: 0,
    volume: 100,
    effects: {color: 0, fisheye: 0, whirl: 0, pixelate: 0, mosaic: 0, brightness: 0, ghost: 0},
    sprite: {costumes: [{name: 'c1', dataFormat: 'svg'}], sounds: [], clones: []},
    id: 'sprite1',
    getName () {
        return 'sprite1';
    },
    setXY (x, y) {
        this.x = x; this.y = y;
    }
});

const makeUtil = (runtime, target) => ({
    runtime,
    target,
    stackFrame: {},
    thread: {peekStackFrame: () => ({warpMode: true})},
    yield () {}
});

// Compute-heavy blocks modeled on the built-in example libraries (Life, Text,
// numeric reporters). Bodies are plain ES5 (what static-analysis emits).
const N = 40; // grid is N x N
const LIB = {
    id: 'jslib_bench',
    name: 'Bench',
    color1: '#0FBD8C',
    blocks: [
        {opcode: 'lifeNew',
            type: 'command',
            signature: {text: 'new', arguments: {}},
            jsCompiled:
                `Scratch.data.set("cols", ${N}); Scratch.data.set("rows", ${N});` +
                `Scratch.data.new2DArray("cells", ${N}, ${N}, 0);` +
                `for (var r = 1; r <= ${N}; r++) { for (var c = 1; c <= ${N}; c++) {` +
                `Scratch.data.setCell("cells", r, c, ((r * 7 + c * 13) % 3 === 0) ? 1 : 0); } }`},
        // Conway step over the whole grid via the Scratch.data 2D-array API — this is
        // the hot path in the "Game of Life" example (many cross-cell store reads).
        {opcode: 'lifeStep',
            type: 'command',
            warp: true,
            signature: {text: 'step', arguments: {}},
            jsCompiled:
                'var cols = Number(Scratch.data.get("cols"));' +
                'var rows = Number(Scratch.data.get("rows"));' +
                'Scratch.data.new2DArray("next", rows, cols, 0);' +
                'for (var r = 1; r <= rows; r++) { for (var c = 1; c <= cols; c++) {' +
                '  var live = 0;' +
                '  for (var dr = -1; dr <= 1; dr++) { for (var dc = -1; dc <= 1; dc++) {' +
                '    if (dr === 0 && dc === 0) continue;' +
                '    var rr = r + dr, cc = c + dc;' +
                '    if (rr >= 1 && rr <= rows && cc >= 1 && cc <= cols &&' +
                '        Number(Scratch.data.cell("cells", rr, cc)) === 1) live++;' +
                '  } }' +
                '  var alive = Number(Scratch.data.cell("cells", r, c)) === 1;' +
                '  var born = (alive && (live === 2 || live === 3)) || (!alive && live === 3);' +
                '  Scratch.data.setCell("next", r, c, born ? 1 : 0);' +
                '} }' +
                'for (var r2 = 1; r2 <= rows; r2++) { for (var c2 = 1; c2 <= cols; c2++) {' +
                '  Scratch.data.setCell("cells", r2, c2, Scratch.data.cell("next", r2, c2)); } }'},
        // Pure-arithmetic reporter (no API calls) — isolates raw interpreter step cost.
        {opcode: 'sumTo',
            type: 'reporter',
            signature: {text: 'sum [n]', arguments: {n: {type: 'number', defaultValue: 0}}},
            jsCompiled: 'var s = 0; for (var i = 0; i < Scratch.args.n; i++) { s += (i * 3) % 7; } return s;'},
        // String manipulation reporter (Caesar cipher) — like the Text example.
        {opcode: 'caesar',
            type: 'reporter',
            signature: {text: 'shift [s] [n]',
                arguments: {
                    s: {type: 'text', defaultValue: ''}, n: {type: 'number', defaultValue: 3}}},
            jsCompiled:
                'var s = Scratch.args.s; var n = ((Scratch.args.n % 26) + 26) % 26; var out = "";' +
                'for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i);' +
                '  if (c >= 97 && c <= 122) out += String.fromCharCode(((c - 97 + n) % 26) + 97);' +
                '  else out += s.charAt(i); } return out;'},
        // Numeric escape-time reporter (Mandelbrot point) — tight Math loop.
        {opcode: 'mandel',
            type: 'reporter',
            signature: {text: 'mandel [x] [y]',
                arguments: {
                    x: {type: 'number', defaultValue: 0}, y: {type: 'number', defaultValue: 0}}},
            jsCompiled:
                'var cx = Scratch.args.x, cy = Scratch.args.y, zx = 0, zy = 0, i = 0;' +
                'while (i < 1000 && (zx * zx + zy * zy) < 4) {' +
                '  var t = zx * zx - zy * zy + cx; zy = 2 * zx * zy + cy; zx = t; i++; } return i;'}
    ]
};

/**
 * Time `iters` calls of a primitive in nanoseconds-per-call.
 * @param {Function} fn - the registered primitive.
 * @param {object} args - argument values.
 * @param {object} util - a block utility.
 * @param {number} iters - number of calls.
 * @returns {number} mean milliseconds per call.
 */
const timeCalls = (fn, args, util, iters) => {
    const start = process.hrtime.bigint();
    for (let i = 0; i < iters; i++) {
        // The real sequencer hands a fresh execution context each time it (re-)enters
        // a block that finished; a reentrant interpreter command stashes its runner in
        // stackFrame.jsBlock, so clear it or every call after the first is a no-op.
        delete util.stackFrame.jsBlock;
        fn(args, util);
    }
    const end = process.hrtime.bigint();
    return Number(end - start) / 1e6 / iters;
};

/**
 * Run one benchmark case in both modes and print the comparison.
 * @param {string} label - human label.
 * @param {string} opcode - opcode (without the lib prefix).
 * @param {object} args - argument values.
 * @param {number} iters - calls per measurement.
 * @param {Function} [seed] - optional per-run setup (e.g. seed the grid), called
 *   with (prim, util) before timing.
 */
const bench = (label, opcode, args, iters, seed) => {
    const results = {};
    for (const direct of [false, true]) {
        const runtime = new Runtime();
        runtime.jsBlocksDirectExecution = direct;
        runtime.installCustomLibrary(LIB);
        const target = makeTarget();
        const util = makeUtil(runtime, target);
        const prim = runtime._primitives;
        const fn = prim[`jslib_bench_${opcode}`];
        if (seed) seed(prim, util);
        // Warm up (build interpreter / compile Function, JIT).
        timeCalls(fn, args, util, Math.max(2, Math.floor(iters / 10)));
        results[direct ? 'direct' : 'interp'] = timeCalls(fn, args, util, iters);
    }
    const speedup = results.interp / results.direct;
    console.log(
        `${label.padEnd(34)} interp ${results.interp.toFixed(4).padStart(10)} ms/call   ` +
        `direct ${results.direct.toFixed(4).padStart(10)} ms/call   ` +
        `${speedup.toFixed(1).padStart(6)}x faster`
    );
};

console.log(`\nJS-powered blocks: interpreter vs direct execution  (Node ${process.version})\n`);
console.log('-'.repeat(104));

bench(`Life step (${N}x${N} grid, data API)`, 'lifeStep', {}, 200, (prim, util) => {
    // Seed the grid once before timing the steps (same runtime -> same data store).
    prim['jslib_bench_lifeNew']({}, util);
});

bench('sumTo(2000) reporter (arithmetic)', 'sumTo', {n: 2000}, 2000);
bench('caesar cipher reporter (strings)', 'caesar',
    {s: 'the quick brown fox jumps over', n: 5}, 5000);
bench('mandel point reporter (Math loop)', 'mandel', {x: -0.743, y: 0.131}, 5000);

console.log('-'.repeat(104));
console.log('\nNotes: direct mode bypasses the js-interpreter sandbox AND its instruction-limit guard.');
console.log('       C-blocks (c-loop/c-if) always use the interpreter regardless of the flag.\n');
