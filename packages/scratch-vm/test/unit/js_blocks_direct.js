// Opcodes are namespaced strings (`<libId>_<opcode>`); bracket access reads clearer.
/* eslint-disable dot-notation */
const tap = require('tap');
const Runtime = require('../../src/engine/runtime');

const test = tap.test;

/**
 * @file Parity + behavior tests for the experimental "direct execution" mode of
 * JS-powered blocks (runtime.jsBlocksDirectExecution). Every non-reentrant block
 * must produce the SAME result whether stepped through js-interpreter or run as
 * real JS, so the toggle is a pure performance lever. Also covers onStop and error
 * handling on the direct path.
 */

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
    sprite: {
        costumes: [
            {name: 'costume1', dataFormat: 'svg', bitmapResolution: 1, rotationCenterX: 0, rotationCenterY: 0},
            {name: 'costume2', dataFormat: 'png', bitmapResolution: 2, rotationCenterX: 0, rotationCenterY: 0}
        ],
        sounds: [],
        clones: []
    },
    id: 'sprite1',
    getName: () => 'sprite1',
    setXY (x, y) {
        this.x = x;
        this.y = y;
    },
    setDirection (dir) {
        this.direction = dir;
    },
    setSize (size) {
        this.size = size;
    },
    setVisible (visible) {
        this.visible = visible;
    },
    setEffect (name, value) {
        this.effects[name] = value;
    },
    clearEffects () {
        for (const k of Object.keys(this.effects)) this.effects[k] = 0;
    },
    setCostume (index) {
        this.currentCostume = index;
    }
});

const makeUtil = (runtime, target) => ({
    runtime,
    target,
    stackFrame: {},
    thread: {peekStackFrame: () => ({warpMode: false})},
    yield: () => {}
});

const LIB = {
    id: 'jslib_par',
    name: 'Parity Lib',
    color1: '#9966FF',
    blocks: [
        {opcode: 'add',
            type: 'reporter',
            signature: {text: '[a]+[b]',
                arguments: {
                    a: {type: 'number', defaultValue: 0}, b: {type: 'number', defaultValue: 0}}},
            jsCompiled: 'return Scratch.args.a + Scratch.args.b;'},
        {opcode: 'sumTo',
            type: 'reporter',
            signature: {text: 'sum to [n]', arguments: {n: {type: 'number', defaultValue: 100}}},
            jsCompiled: 'var s = 0; for (var i = 0; i < Scratch.args.n; i++) { s += i; } return s;'},
        {opcode: 'isBig',
            type: 'boolean',
            signature: {text: 'is [n] big?', arguments: {n: {type: 'number', defaultValue: 0}}},
            jsCompiled: 'return Scratch.args.n > 5;'},
        {opcode: 'slideX',
            type: 'command',
            signature: {text: 'slide x [n]', arguments: {n: {type: 'number', defaultValue: 10}}},
            jsCompiled: 'Scratch.changeX(Scratch.args.n);'},
        {opcode: 'liveX',
            type: 'reporter',
            signature: {text: 'live x', arguments: {}},
            jsCompiled: 'Scratch.changeX(5); return Scratch.sprite.x;'},
        {opcode: 'rev',
            type: 'reporter',
            signature: {text: 'reverse [s]', arguments: {s: {type: 'text', defaultValue: 'hi'}}},
            jsCompiled: 'return Scratch.text.reverse(Scratch.args.s);'},
        {opcode: 'objReturn',
            type: 'reporter',
            signature: {text: 'obj', arguments: {}},
            jsCompiled: 'return {a: 1, b: [2, 3]};'},
        {opcode: 'remember',
            type: 'command',
            signature: {text: 'remember [k] [v]',
                arguments: {
                    k: {type: 'text', defaultValue: 'k'}, v: {type: 'text', defaultValue: '0'}}},
            jsCompiled: 'Scratch.data.set(Scratch.args.k, Scratch.args.v);'},
        {opcode: 'recall',
            type: 'reporter',
            signature: {text: 'recall [k]', arguments: {k: {type: 'text', defaultValue: 'k'}}},
            jsCompiled: 'return Scratch.data.get(Scratch.args.k);'},
        {opcode: 'makeGrid',
            type: 'command',
            signature: {text: 'grid', arguments: {}},
            jsCompiled: 'Scratch.data.new2DArray("g", 3, 3, 0);'},
        {opcode: 'setCell',
            type: 'command',
            signature: {text: 'cell [r] [c] [v]',
                arguments: {
                    r: {type: 'number', defaultValue: 1},
                    c: {type: 'number', defaultValue: 1},
                    v: {type: 'number', defaultValue: 0}}},
            jsCompiled: 'Scratch.data.setCell("g", Scratch.args.r, Scratch.args.c, Scratch.args.v);'},
        {opcode: 'getCell',
            type: 'reporter',
            signature: {text: 'get [r] [c]',
                arguments: {
                    r: {type: 'number', defaultValue: 1}, c: {type: 'number', defaultValue: 1}}},
            jsCompiled: 'return Scratch.data.cell("g", Scratch.args.r, Scratch.args.c);'},
        {opcode: 'setGhost',
            type: 'command',
            signature: {text: 'ghost [v]', arguments: {v: {type: 'number', defaultValue: 0}}},
            jsCompiled: 'Scratch.setEffect("ghost", Scratch.args.v);'},
        {opcode: 'ghostAmt',
            type: 'reporter',
            signature: {text: 'ghost?', arguments: {}},
            jsCompiled: 'return Scratch.effects.ghost;'},
        {opcode: 'boom',
            type: 'reporter',
            signature: {text: 'boom', arguments: {}},
            jsCompiled: 'throw new Error("kaboom");'}
    ]
};

/**
 * Drive a scripted sequence of block calls against a runtime in a given execution
 * mode, returning the observable results (outputs + final target/effect state).
 *
 * Results are awaited: a heavy reporter in INTERPRETER mode exceeds the per-tick
 * step budget and returns a Promise that finishes across macrotasks (the sequencer
 * awaits it). Direct mode finishes synchronously. Awaiting normalizes both to the
 * same logical value (await on a non-Promise is a no-op).
 * @param {boolean} direct - whether to run blocks directly (no interpreter).
 * @returns {Promise<object>} a snapshot of every result we compare across modes.
 */
const runScenario = async direct => {
    const runtime = new Runtime();
    runtime.jsBlocksDirectExecution = direct;
    runtime.installCustomLibrary(LIB);
    const target = makeTarget();
    const prim = runtime._primitives;
    const call = async (op, args) => await prim[`jslib_par_${op}`](args || {}, makeUtil(runtime, target));

    const out = {};
    out.add = await call('add', {a: 3, b: 4});
    out.addCoerced = await call('add', {a: '10', b: 5});
    out.sumTo = await call('sumTo', {n: 1000});
    out.isBigTrue = await call('isBig', {n: 10});
    out.isBigFalse = await call('isBig', {n: 2});
    out.liveX = await call('liveX', {}); // changeX(5) then reads sprite.x -> 5 (live getter)
    out.rev = await call('rev', {s: 'scratch'});
    out.objReturn = await call('objReturn', {}); // structured -> JSON string
    await call('slideX', {n: 25});
    out.targetX = target.x; // 5 (from liveX) + 25
    await call('remember', {k: 'score', v: 42});
    out.recall = Number(await call('recall', {k: 'score'}));
    await call('makeGrid', {});
    await call('setCell', {r: 2, c: 3, v: 7});
    out.cell23 = await call('getCell', {r: 2, c: 3});
    out.cell11 = await call('getCell', {r: 1, c: 1});
    await call('setGhost', {v: 40});
    out.ghost = await call('ghostAmt', {});
    out.ghostEffect = target.effects.ghost;
    return out;
};

test('direct execution matches interpreter results across the API surface', async t => {
    const interp = await runScenario(false);
    const directRes = await runScenario(true);
    t.same(directRes, interp, 'every observable result is identical in both modes');
    // Spot-check a couple of absolute values so a shared bug can't make them "match".
    t.equal(interp.sumTo, 499500, 'sum 0..999 is correct');
    t.equal(interp.liveX, 5, 'live getter reflects an in-block change');
    t.equal(interp.objReturn, JSON.stringify({a: 1, b: [2, 3]}), 'structured return JSON-stringified');
    t.equal(interp.targetX, 30, 'commands mutate the target identically');
    t.end();
});

test('the toggle is read live — flipping it on one runtime switches modes per call', t => {
    const runtime = new Runtime();
    runtime.installCustomLibrary(LIB);
    const target = makeTarget();
    const add = (a, b) => runtime._primitives['jslib_par_add']({a, b}, makeUtil(runtime, target));

    runtime.jsBlocksDirectExecution = false;
    t.equal(add(2, 3), 5, 'interpreter path correct');
    runtime.jsBlocksDirectExecution = true;
    t.equal(add(2, 3), 5, 'direct path correct after flipping on');
    runtime.jsBlocksDirectExecution = false;
    t.equal(add(40, 2), 42, 'interpreter path correct after flipping back');
    t.end();
});

test('a throwing block in direct mode surfaces an error and returns empty (no crash)', t => {
    const runtime = new Runtime();
    runtime.jsBlocksDirectExecution = true;
    let lastError = null;
    runtime.on('JS_BLOCK_ERROR', e => {
        lastError = e;
    });
    runtime.installCustomLibrary(LIB);
    const target = makeTarget();

    const result = runtime._primitives['jslib_par_boom']({}, makeUtil(runtime, target));
    t.equal(result, '', 'reporter that throws returns empty string');
    t.ok(lastError, 'a JS_BLOCK_ERROR was emitted');
    t.match(lastError.message, /kaboom/, 'the original error message is surfaced');
    t.end();
});

const STOP_LIB = {
    id: 'jslib_stop',
    name: 'Stop Lib',
    color1: '#4C97FF',
    blocks: [
        {opcode: 'armCleanup',
            type: 'command',
            signature: {text: 'arm cleanup', arguments: {}},
            jsCompiled: 'Scratch.onStop(function () { Scratch.changeX(100); });'}
    ]
};

test('onStop works in direct mode: the cleanup runs once when the project stops', t => {
    const runtime = new Runtime();
    runtime.jsBlocksDirectExecution = true;
    runtime.installCustomLibrary(STOP_LIB);
    const target = makeTarget();

    runtime._primitives['jslib_stop_armCleanup']({}, makeUtil(runtime, target));
    t.equal(target.x, 0, 'cleanup has not run yet');

    runtime.stopAll();
    t.equal(target.x, 100, 'onStop cleanup ran on stop');

    target.x = 5;
    runtime.stopAll();
    t.equal(target.x, 5, 'handler was cleared after firing (runs only once)');
    t.end();
});
