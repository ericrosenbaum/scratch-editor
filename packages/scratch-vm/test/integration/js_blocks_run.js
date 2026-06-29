const test = require('tap').test;
const Runtime = require('../../src/engine/runtime');
const Sequencer = require('../../src/engine/sequencer');
const Thread = require('../../src/engine/thread');
const Sprite = require('../../src/sprites/sprite');
const RenderedTarget = require('../../src/sprites/rendered-target');
const JsBlockRunner = require('../../src/extension-support/js-blocks/js-block-runner');

/**
 * @file Drive JS-powered blocks through the REAL sequencer/execute path (not a
 * mock util), validating: argument flow from a shadow input, command
 * yield/re-entry applying an effect exactly once across slices, and a heavy
 * reporter finishing on the Promise path with its value flowing into a command.
 */

const LIBRARY = {
    id: 'jslib_run',
    name: 'Run Lib',
    color1: '#9966FF',
    blocks: [
        {
            opcode: 'slideX',
            type: 'command',
            signature: {text: 'slide x by [n]', arguments: {n: {type: 'number', defaultValue: 10}}},
            jsCompiled: 'Scratch.changeX(Scratch.args.n);'
        },
        {
            // Three bumps; with a tiny slice cap it yields between them but the
            // interpreter CONTINUES (does not re-run), so x ends at exactly 30.
            opcode: 'bumpThrice',
            type: 'command',
            signature: {text: 'bump thrice', arguments: {}},
            jsCompiled: 'for (var i = 0; i < 3; i++) { Scratch.changeX(10); }'
        },
        {
            // Heavy reporter that must exceed one slice -> Promise path.
            opcode: 'sumTo',
            type: 'reporter',
            signature: {text: 'sum to [n]', arguments: {n: {type: 'number', defaultValue: 100}}},
            jsCompiled: 'var s = 0; for (var i = 0; i < Scratch.args.n; i++) { s += i; } return s;'
        },
        {
            // Stores its input into the library data store so we can read it back.
            opcode: 'stash',
            type: 'command',
            signature: {text: 'stash [v]', arguments: {v: {type: 'number', defaultValue: 0}}},
            jsCompiled: 'Scratch.data.set("out", Scratch.args.v);'
        },
        {
            // C-block: runs its wrapped substack n times.
            opcode: 'repeatN',
            type: 'c-loop',
            signature: {text: 'repeat fancy [n]', arguments: {n: {type: 'number', defaultValue: 3}}},
            jsCompiled: 'for (var i = 0; i < Scratch.args.n; i++) { Scratch.runBranch(); }'
        }
    ]
};

const numberShadow = (id, value, parentId) => ({
    id,
    opcode: 'math_number',
    inputs: {},
    fields: {NUM: {name: 'NUM', value: String(value)}},
    next: null,
    parent: parentId,
    topLevel: false,
    shadow: true,
    x: 0,
    y: 0
});

const commandBlock = (id, opcode, inputs) => ({
    id,
    opcode,
    inputs: inputs || {},
    fields: {},
    next: null,
    parent: null,
    topLevel: true,
    shadow: false,
    x: 0,
    y: 0
});

const reporterBlock = (id, opcode, parentId, inputs) => ({
    id,
    opcode,
    inputs: inputs || {},
    fields: {},
    next: null,
    parent: parentId,
    topLevel: false,
    shadow: false,
    x: 0,
    y: 0
});

/**
 * Build a runtime with the library installed and a single sprite target.
 * @returns {{runtime: Runtime, sequencer: Sequencer, target: RenderedTarget}} harness.
 */
const makeHarness = () => {
    const runtime = new Runtime();
    runtime.installCustomLibrary(LIBRARY);
    const sprite = new Sprite(null, runtime);
    const target = new RenderedTarget(sprite, runtime);
    runtime.targets.push(target);
    const sequencer = new Sequencer(runtime);
    return {runtime, sequencer, target};
};

/**
 * Push a thread starting at the given top block.
 * @param {Runtime} runtime - the runtime.
 * @param {RenderedTarget} target - the target owning the blocks.
 * @param {string} topBlockId - the block to start at.
 * @returns {Thread} the pushed thread.
 */
const pushThread = (runtime, target, topBlockId) => {
    const thread = new Thread(topBlockId);
    thread.target = target;
    thread.blockContainer = target.blocks;
    thread.pushStack(topBlockId);
    runtime.threads.push(thread);
    return thread;
};

/**
 * Step a single thread to completion through the real sequencer, awaiting the
 * Promise-wait path when reporters finish asynchronously.
 * @param {Sequencer} sequencer - the sequencer.
 * @param {Thread} thread - the thread to run.
 * @param {number} maxSteps - safety bound.
 * @returns {Promise<number>} number of stepThread calls made.
 */
const runThread = async (sequencer, thread, maxSteps = 5000) => {
    let calls = 0;
    for (let i = 0; i < maxSteps && thread.status !== Thread.STATUS_DONE; i++) {
        if (thread.status === Thread.STATUS_YIELD) thread.status = Thread.STATUS_RUNNING;
        if (thread.status === Thread.STATUS_PROMISE_WAIT) {
            // Let the reporter's macrotask chunks run, then re-check.
            await new Promise(resolve => setTimeout(resolve, 0));
            continue;
        }
        sequencer.stepThread(thread);
        calls += 1;
    }
    return calls;
};

test('command receives a numeric input from a shadow and moves the sprite', async t => {
    const {runtime, sequencer, target} = makeHarness();
    target.blocks.createBlock(commandBlock('cmd', 'jslib_run_slideX', {
        n: {name: 'n', block: 'shadowN', shadow: 'shadowN'}
    }));
    target.blocks.createBlock(numberShadow('shadowN', 25, 'cmd'));

    const thread = pushThread(runtime, target, 'cmd');
    await runThread(sequencer, thread);

    t.equal(target.x, 25, 'sprite moved by the input value 25');
    t.equal(thread.status, Thread.STATUS_DONE, 'thread completed');
    t.end();
});

test('yielding command continues its interpreter (effect applied exactly once)', async t => {
    const saved = JsBlockRunner.Budget.NORMAL_SLICE;
    JsBlockRunner.Budget.NORMAL_SLICE = 20; // force yields between the three bumps

    const {runtime, sequencer, target} = makeHarness();
    target.blocks.createBlock(commandBlock('cmd', 'jslib_run_bumpThrice', {}));

    const thread = pushThread(runtime, target, 'cmd');
    const calls = await runThread(sequencer, thread);

    t.equal(target.x, 30, 'x is exactly 30 — the loop resumed, it did not restart');
    t.ok(calls > 1, `took multiple sequencer steps across yields (${calls})`);
    t.equal(thread.status, Thread.STATUS_DONE, 'thread completed');

    JsBlockRunner.Budget.NORMAL_SLICE = saved;
    t.end();
});

test('c-block runs its wrapped substack the right number of times', async t => {
    const {runtime, sequencer, target} = makeHarness();
    // repeat fancy 3 { slide x by 1 }
    target.blocks.createBlock(commandBlock('cmd', 'jslib_run_repeatN', {
        n: {name: 'n', block: 'shadowN', shadow: 'shadowN'},
        SUBSTACK: {name: 'SUBSTACK', block: 'sub', shadow: null}
    }));
    target.blocks.createBlock(numberShadow('shadowN', 3, 'cmd'));
    target.blocks.createBlock({
        id: 'sub',
        opcode: 'jslib_run_slideX',
        inputs: {n: {name: 'n', block: 'subShadow', shadow: 'subShadow'}},
        fields: {},
        next: null,
        parent: 'cmd',
        topLevel: false,
        shadow: false,
        x: 0,
        y: 0
    });
    target.blocks.createBlock(numberShadow('subShadow', 1, 'sub'));

    const thread = pushThread(runtime, target, 'cmd');
    await runThread(sequencer, thread);

    t.equal(target.x, 3, 'the wrapped substack ran 3 times (x += 1 each)');
    t.equal(thread.status, Thread.STATUS_DONE, 'thread completed');
    t.end();
});

test('c-block still runs its substack when direct execution is enabled (it stays on the interpreter)', async t => {
    const {runtime, sequencer, target} = makeHarness();
    runtime.jsBlocksDirectExecution = true; // direct mode on: C-blocks must ignore it
    target.blocks.createBlock(commandBlock('cmd', 'jslib_run_repeatN', {
        n: {name: 'n', block: 'shadowN', shadow: 'shadowN'},
        SUBSTACK: {name: 'SUBSTACK', block: 'sub', shadow: null}
    }));
    target.blocks.createBlock(numberShadow('shadowN', 3, 'cmd'));
    target.blocks.createBlock({
        id: 'sub',
        opcode: 'jslib_run_slideX', // a command — runs DIRECTLY under the flag
        inputs: {n: {name: 'n', block: 'subShadow', shadow: 'subShadow'}},
        fields: {},
        next: null,
        parent: 'cmd',
        topLevel: false,
        shadow: false,
        x: 0,
        y: 0
    });
    target.blocks.createBlock(numberShadow('subShadow', 1, 'sub'));

    const thread = pushThread(runtime, target, 'cmd');
    await runThread(sequencer, thread);

    t.equal(target.x, 3, 'C-block branch coordination still works (substack ran 3x) with direct mode on');
    t.equal(thread.status, Thread.STATUS_DONE, 'thread completed');
    t.end();
});

test('heavy reporter finishes on the Promise path; its value flows into a command', async t => {
    const saved = JsBlockRunner.Budget.NORMAL_SLICE;
    JsBlockRunner.Budget.NORMAL_SLICE = 40; // force the reporter onto the async path

    const {runtime, sequencer, target} = makeHarness();
    // stash( sumTo(100) )  -> store "out" should equal 0+1+...+99 = 4950
    target.blocks.createBlock(commandBlock('cmd', 'jslib_run_stash', {
        v: {name: 'v', block: 'rep', shadow: null}
    }));
    target.blocks.createBlock(reporterBlock('rep', 'jslib_run_sumTo', 'cmd', {
        n: {name: 'n', block: 'shadowN', shadow: 'shadowN'}
    }));
    target.blocks.createBlock(numberShadow('shadowN', 100, 'rep'));

    const thread = pushThread(runtime, target, 'cmd');
    await runThread(sequencer, thread);

    const store = runtime.getJsBlockStore('jslib_run');
    t.equal(Number(store.out), 4950, 'reporter resumed across macrotasks and its value reached the command');
    t.equal(thread.status, Thread.STATUS_DONE, 'thread completed');

    JsBlockRunner.Budget.NORMAL_SLICE = saved;
    t.end();
});
