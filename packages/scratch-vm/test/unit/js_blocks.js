// Opcodes are namespaced strings (`<libId>_<opcode>`); bracket access reads clearer.
/* eslint-disable dot-notation */
const tap = require('tap');
const Runtime = require('../../src/engine/runtime');
const JsBlockRunner = require('../../src/extension-support/js-blocks/js-block-runner');

const test = tap.test;

/**
 * Build a minimal fake target supporting the read accessors / effect setters
 * the Phase 1 API bridge touches.
 * @returns {object} a fake rendered target.
 */
const makeTarget = () => ({
    x: 0,
    y: 0,
    direction: 90,
    size: 100,
    visible: true,
    draggable: false,
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

/**
 * Build a minimal fake BlockUtility good enough for JsBlockRunner.
 * @param {Runtime} runtime - a real runtime (for the data store + error events).
 * @param {object} target - a fake target.
 * @param {object} stackFrame - a persistent object standing in for executionContext.
 * @param {boolean} warp - warp mode flag.
 * @returns {object} a fake util.
 */
const makeUtil = (runtime, target, stackFrame, warp) => {
    const util = {
        runtime,
        target,
        stackFrame,
        thread: {peekStackFrame: () => ({warpMode: Boolean(warp)})},
        _yielded: false
    };
    util.yield = () => {
        util._yielded = true;
    };
    return util;
};

/**
 * Run a re-entrant (command) primitive to completion, simulating the sequencer
 * re-entering a yielded block. Returns the number of slices it took.
 * @param {Function} primitive - the registered primitive.
 * @param {object} args - argument values.
 * @param {object} util - a fake util (with a stable stackFrame).
 * @param {number} maxSlices - safety bound.
 * @returns {number} slices run.
 */
const runToCompletion = (primitive, args, util, maxSlices) => {
    for (let slice = 1; slice <= maxSlices; slice++) {
        util._yielded = false;
        primitive(args, util);
        const runner = util.stackFrame.jsBlock;
        if (!runner || runner.finished) return slice;
        if (!util._yielded) return slice; // finished without yielding
    }
    return maxSlices;
};

const TEST_LIBRARY = {
    id: 'jslib_test',
    name: 'Test Lib',
    color1: '#FF6680',
    color2: '#FF4D6A',
    color3: '#FF3355',
    blocks: [
        {
            opcode: 'addNumbers',
            type: 'reporter',
            signature: {
                text: '[a] plus [b]',
                arguments: {a: {type: 'number', defaultValue: 3}, b: {type: 'number', defaultValue: 4}}
            },
            jsCompiled: 'return Scratch.args.a + Scratch.args.b;'
        },
        {
            opcode: 'isBig',
            type: 'boolean',
            signature: {
                text: 'is [n] big?',
                arguments: {n: {type: 'number', defaultValue: 0}}
            },
            jsCompiled: 'return Scratch.args.n > 5;'
        },
        {
            opcode: 'slideX',
            type: 'command',
            signature: {
                text: 'slide x by [n]',
                arguments: {n: {type: 'number', defaultValue: 10}}
            },
            jsCompiled: 'Scratch.changeX(Scratch.args.n);'
        },
        {
            opcode: 'remember',
            type: 'command',
            signature: {
                text: 'remember [k] as [v]',
                arguments: {k: {type: 'text', defaultValue: 'score'}, v: {type: 'text', defaultValue: '0'}}
            },
            jsCompiled: 'Scratch.data.set(Scratch.args.k, Scratch.args.v);'
        },
        {
            opcode: 'recall',
            type: 'reporter',
            signature: {
                text: 'recall [k]',
                arguments: {k: {type: 'text', defaultValue: 'score'}}
            },
            jsCompiled: 'return Scratch.data.get(Scratch.args.k);'
        },
        {
            opcode: 'spin',
            type: 'command',
            signature: {text: 'spin forever', arguments: {}},
            jsCompiled: 'while (true) {}'
        }
    ]
};

test('installCustomLibrary registers primitives and a palette category', t => {
    const runtime = new Runtime();
    runtime.installCustomLibrary(TEST_LIBRARY);

    t.type(runtime._primitives['jslib_test_addNumbers'], 'function', 'reporter primitive registered');
    t.type(runtime._primitives['jslib_test_slideX'], 'function', 'command primitive registered');
    t.type(runtime._primitives['jslib_test_isBig'], 'function', 'boolean primitive registered');
    t.equal(runtime.getCustomLibraries().length, 1, 'library tracked');

    const category = runtime._blockInfo.find(c => c.id === 'jslib_test');
    t.ok(category, 'palette category created');
    t.equal(category.color1, '#FF6680', 'category color applied');
    t.equal(category.blocks.length, TEST_LIBRARY.blocks.length, 'all blocks converted');

    t.end();
});

test('reporter computes a value from coerced args', t => {
    const runtime = new Runtime();
    runtime.installCustomLibrary(TEST_LIBRARY);
    const target = makeTarget();
    const util = makeUtil(runtime, target, {});

    const result = runtime._primitives['jslib_test_addNumbers']({a: 3, b: 4}, util);
    t.equal(result, 7, '3 plus 4 is 7');

    // Args are coerced: string "10" with number type still adds numerically.
    const util2 = makeUtil(runtime, target, {});
    t.equal(runtime._primitives['jslib_test_addNumbers']({a: '10', b: 5}, util2), 15, 'string arg coerced to number');
    t.end();
});

test('boolean casts the returned value', t => {
    const runtime = new Runtime();
    runtime.installCustomLibrary(TEST_LIBRARY);
    const target = makeTarget();

    t.equal(runtime._primitives['jslib_test_isBig']({n: 10}, makeUtil(runtime, target, {})), true, '10 is big');
    t.equal(runtime._primitives['jslib_test_isBig']({n: 2}, makeUtil(runtime, target, {})), false, '2 is not big');
    t.end();
});

test('command causes a sprite effect through a whitelisted setter', t => {
    const runtime = new Runtime();
    runtime.installCustomLibrary(TEST_LIBRARY);
    const target = makeTarget();
    const util = makeUtil(runtime, target, {});

    runtime._primitives['jslib_test_slideX']({n: 25}, util);
    t.equal(target.x, 25, 'x moved by 25');
    t.notOk(util._yielded, 'fast command finished without yielding');
    t.end();
});

test('data store persists across blocks and clears on stop/green flag', t => {
    const runtime = new Runtime();
    runtime.installCustomLibrary(TEST_LIBRARY);
    const target = makeTarget();

    runtime._primitives['jslib_test_remember']({k: 'score', v: 42}, makeUtil(runtime, target, {}));
    const recalled = runtime._primitives['jslib_test_recall']({k: 'score'}, makeUtil(runtime, target, {}));
    t.equal(Number(recalled), 42, 'a later block reads what an earlier block stored');

    // The real variable system is untouched.
    t.equal(typeof target.variables, 'undefined', 'no Scratch variables were created');

    runtime.stopAll(); // clears stores (also the green-flag path)
    const afterStop = runtime._primitives['jslib_test_recall']({k: 'score'}, makeUtil(runtime, target, {}));
    t.equal(afterStop, '', 'store cleared on stop');
    t.end();
});

const API_LIBRARY = {
    id: 'jslib_api',
    name: 'API Lib',
    color1: '#9966FF',
    blocks: [
        {opcode: 'liveX', type: 'reporter', signature: {text: 'live x', arguments: {}},
            jsCompiled: 'Scratch.changeX(5); return Scratch.sprite.x;'},
        {opcode: 'ghostAmt', type: 'reporter', signature: {text: 'ghost', arguments: {}},
            jsCompiled: 'return Scratch.effects.ghost;'},
        {opcode: 'costName', type: 'reporter', signature: {text: 'costume name', arguments: {}},
            jsCompiled: 'return Scratch.sprite.costumeName;'},
        {opcode: 'firstIsVector', type: 'boolean', signature: {text: 'costume 1 is vector?', arguments: {}},
            jsCompiled: 'return Scratch.costumes[0].isVector;'},
        {opcode: 'pushItem', type: 'command',
            signature: {text: 'push [v]', arguments: {v: {type: 'text', defaultValue: 'a'}}},
            jsCompiled: 'Scratch.data.push("q", Scratch.args.v);'},
        {opcode: 'listLen', type: 'reporter', signature: {text: 'list length', arguments: {}},
            jsCompiled: 'return Scratch.data.length("q");'},
        {opcode: 'itemAt', type: 'reporter',
            signature: {text: 'item [i]', arguments: {i: {type: 'number', defaultValue: 1}}},
            jsCompiled: 'return Scratch.data.itemAt("q", Scratch.args.i);'},
        {opcode: 'makeGrid', type: 'command', signature: {text: 'make grid', arguments: {}},
            jsCompiled: 'Scratch.data.new2DArray("g", 3, 3, 0);'},
        {opcode: 'setCell', type: 'command',
            signature: {text: 'set [r] [c] [v]', arguments: {
                r: {type: 'number', defaultValue: 1}, c: {type: 'number', defaultValue: 1},
                v: {type: 'number', defaultValue: 0}}},
            jsCompiled: 'Scratch.data.setCell("g", Scratch.args.r, Scratch.args.c, Scratch.args.v);'},
        {opcode: 'getCell', type: 'reporter',
            signature: {text: 'cell [r] [c]', arguments: {
                r: {type: 'number', defaultValue: 1}, c: {type: 'number', defaultValue: 1}}},
            jsCompiled: 'return Scratch.data.cell("g", Scratch.args.r, Scratch.args.c);'},
        {opcode: 'mapPut', type: 'command',
            signature: {text: 'map [k] [v]', arguments: {
                k: {type: 'text', defaultValue: 'a'}, v: {type: 'text', defaultValue: '1'}}},
            jsCompiled: 'Scratch.data.mapSet("m", Scratch.args.k, Scratch.args.v);'},
        {opcode: 'mapGet', type: 'reporter',
            signature: {text: 'map get [k]', arguments: {k: {type: 'text', defaultValue: 'a'}}},
            jsCompiled: 'return Scratch.data.mapGet("m", Scratch.args.k);'},
        {opcode: 'rev', type: 'reporter',
            signature: {text: 'reverse [s]', arguments: {s: {type: 'text', defaultValue: 'hi'}}},
            jsCompiled: 'return Scratch.text.reverse(Scratch.args.s);'},
        {opcode: 'setGhost', type: 'command',
            signature: {text: 'set ghost [v]', arguments: {v: {type: 'number', defaultValue: 50}}},
            jsCompiled: 'Scratch.setEffect("ghost", Scratch.args.v);'},
        {opcode: 'turn', type: 'command',
            signature: {text: 'turn [n]', arguments: {n: {type: 'number', defaultValue: 15}}},
            jsCompiled: 'Scratch.turnRight(Scratch.args.n);'}
    ]
};

test('read accessors are live and snapshot current VM state', t => {
    const runtime = new Runtime();
    runtime.installCustomLibrary(API_LIBRARY);
    const target = makeTarget();
    const prim = runtime._primitives;

    // The getter re-evaluates: changeX(5) inside the block is visible via Scratch.sprite.x.
    t.equal(prim['jslib_api_liveX']({}, makeUtil(runtime, target, {})), 5, 'sprite.x is live, not a stale snapshot');
    t.equal(target.x, 5, 'the change actually moved the target');

    t.equal(prim['jslib_api_costName']({}, makeUtil(runtime, target, {})), 'costume1', 'reads current costume name');
    t.equal(prim['jslib_api_firstIsVector']({}, makeUtil(runtime, target, {})), true, 'costume metadata array is readable');
    t.end();
});

test('effect setters change VM state and read accessors reflect it', t => {
    const runtime = new Runtime();
    runtime.installCustomLibrary(API_LIBRARY);
    const target = makeTarget();
    const prim = runtime._primitives;

    prim['jslib_api_setGhost']({v: 40}, makeUtil(runtime, target, {}));
    t.equal(target.effects.ghost, 40, 'setEffect applied');
    t.equal(prim['jslib_api_ghostAmt']({}, makeUtil(runtime, target, {})), 40, 'effect reporter reads it back');

    prim['jslib_api_turn']({n: 30}, makeUtil(runtime, target, {}));
    t.equal(target.direction, 120, 'turnRight rotated the sprite');
    t.end();
});

test('data store: named lists, grids, and maps', t => {
    const runtime = new Runtime();
    runtime.installCustomLibrary(API_LIBRARY);
    const target = makeTarget();
    const prim = runtime._primitives;
    const util = () => makeUtil(runtime, target, {});

    prim['jslib_api_pushItem']({v: 'apple'}, util());
    prim['jslib_api_pushItem']({v: 'pear'}, util());
    t.equal(prim['jslib_api_listLen']({}, util()), 2, 'list grew across two command calls');
    t.equal(prim['jslib_api_itemAt']({i: 2}, util()), 'pear', '1-based itemAt');
    t.equal(prim['jslib_api_itemAt']({i: 99}, util()), '', 'out-of-range itemAt returns empty (never throws)');

    prim['jslib_api_makeGrid']({}, util());
    prim['jslib_api_setCell']({r: 2, c: 3, v: 7}, util());
    t.equal(prim['jslib_api_getCell']({r: 2, c: 3}, util()), 7, '2D grid cell round-trips');
    t.equal(prim['jslib_api_getCell']({r: 1, c: 1}, util()), 0, 'unset cell keeps its fill');

    prim['jslib_api_mapPut']({k: 'alice', v: 100}, util());
    t.equal(Number(prim['jslib_api_mapGet']({k: 'alice'}, util())), 100, 'map set/get');
    t.equal(prim['jslib_api_mapGet']({k: 'nobody'}, util()), '', 'missing map key returns empty');
    t.end();
});

test('text helpers', t => {
    const runtime = new Runtime();
    runtime.installCustomLibrary(API_LIBRARY);
    const target = makeTarget();
    t.equal(runtime._primitives['jslib_api_rev']({s: 'scratch'}, makeUtil(runtime, target, {})), 'hctarcs', 'reverse');
    t.end();
});

test('infinite loop yields and is force-stopped — the page cannot freeze', t => {
    // Shrink the hard cap so the test is fast and deterministic.
    const savedCap = JsBlockRunner.Budget.HARD_CAP;
    JsBlockRunner.Budget.HARD_CAP = 40000; // 10 slices of 4000 steps

    const runtime = new Runtime();
    let lastError = null;
    runtime.on('JS_BLOCK_ERROR', e => {
        lastError = e;
    });
    runtime.installCustomLibrary(TEST_LIBRARY);
    const target = makeTarget();
    const util = makeUtil(runtime, target, {});

    // First slice: the loop cannot finish, so it must yield (not block).
    runtime._primitives['jslib_test_spin']({}, util);
    t.ok(util._yielded, 'first slice yields instead of blocking');
    t.notOk(util.stackFrame.jsBlock.finished, 'runner persists across the yield');

    // Driving it like the sequencer would: it stops at the hard cap.
    const slices = runToCompletion(runtime._primitives['jslib_test_spin'], {}, util, 1000);
    t.ok(util.stackFrame.jsBlock.finished, 'runner eventually force-stops');
    t.ok(util.stackFrame.jsBlock.errored, 'force-stop is recorded as an error');
    t.ok(lastError, 'a JS_BLOCK_ERROR was emitted');
    t.ok(slices <= 12, `bounded slices (took ${slices})`);

    JsBlockRunner.Budget.HARD_CAP = savedCap;
    t.end();
});
