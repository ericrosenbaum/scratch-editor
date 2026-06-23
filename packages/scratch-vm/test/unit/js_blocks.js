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
        {opcode: 'liveX',
            type: 'reporter',
            signature: {text: 'live x', arguments: {}},
            jsCompiled: 'Scratch.changeX(5); return Scratch.sprite.x;'},
        {opcode: 'ghostAmt',
            type: 'reporter',
            signature: {text: 'ghost', arguments: {}},
            jsCompiled: 'return Scratch.effects.ghost;'},
        {opcode: 'costName',
            type: 'reporter',
            signature: {text: 'costume name', arguments: {}},
            jsCompiled: 'return Scratch.sprite.costumeName;'},
        {opcode: 'firstIsVector',
            type: 'boolean',
            signature: {text: 'costume 1 is vector?', arguments: {}},
            jsCompiled: 'return Scratch.costumes[0].isVector;'},
        {opcode: 'pushItem',
            type: 'command',
            signature: {text: 'push [v]', arguments: {v: {type: 'text', defaultValue: 'a'}}},
            jsCompiled: 'Scratch.data.push("q", Scratch.args.v);'},
        {opcode: 'listLen',
            type: 'reporter',
            signature: {text: 'list length', arguments: {}},
            jsCompiled: 'return Scratch.data.length("q");'},
        {opcode: 'itemAt',
            type: 'reporter',
            signature: {text: 'item [i]', arguments: {i: {type: 'number', defaultValue: 1}}},
            jsCompiled: 'return Scratch.data.itemAt("q", Scratch.args.i);'},
        {opcode: 'makeGrid',
            type: 'command',
            signature: {text: 'make grid', arguments: {}},
            jsCompiled: 'Scratch.data.new2DArray("g", 3, 3, 0);'},
        {opcode: 'setCell',
            type: 'command',
            signature: {text: 'set [r] [c] [v]',
                arguments: {
                    r: {type: 'number', defaultValue: 1},
                    c: {type: 'number', defaultValue: 1},
                    v: {type: 'number', defaultValue: 0}}},
            jsCompiled: 'Scratch.data.setCell("g", Scratch.args.r, Scratch.args.c, Scratch.args.v);'},
        {opcode: 'getCell',
            type: 'reporter',
            signature: {text: 'cell [r] [c]',
                arguments: {
                    r: {type: 'number', defaultValue: 1}, c: {type: 'number', defaultValue: 1}}},
            jsCompiled: 'return Scratch.data.cell("g", Scratch.args.r, Scratch.args.c);'},
        {opcode: 'mapPut',
            type: 'command',
            signature: {text: 'map [k] [v]',
                arguments: {
                    k: {type: 'text', defaultValue: 'a'}, v: {type: 'text', defaultValue: '1'}}},
            jsCompiled: 'Scratch.data.mapSet("m", Scratch.args.k, Scratch.args.v);'},
        {opcode: 'mapGet',
            type: 'reporter',
            signature: {text: 'map get [k]', arguments: {k: {type: 'text', defaultValue: 'a'}}},
            jsCompiled: 'return Scratch.data.mapGet("m", Scratch.args.k);'},
        {opcode: 'rev',
            type: 'reporter',
            signature: {text: 'reverse [s]', arguments: {s: {type: 'text', defaultValue: 'hi'}}},
            jsCompiled: 'return Scratch.text.reverse(Scratch.args.s);'},
        {opcode: 'setGhost',
            type: 'command',
            signature: {text: 'set ghost [v]', arguments: {v: {type: 'number', defaultValue: 50}}},
            jsCompiled: 'Scratch.setEffect("ghost", Scratch.args.v);'},
        {opcode: 'turn',
            type: 'command',
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
    t.equal(prim['jslib_api_firstIsVector']({}, makeUtil(runtime, target, {})), true, 'costume metadata readable');
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

const HARDWARE_LIBRARY = {
    id: 'jslib_hw',
    name: 'HW Lib',
    color1: '#4C97FF',
    blocks: [
        {opcode: 'armCleanup',
            type: 'command',
            signature: {text: 'arm cleanup', arguments: {}},
            jsCompiled: 'Scratch.onStop(function () { Scratch.changeX(100); });'},
        {opcode: 'pixel',
            type: 'reporter',
            signature: {text: 'pixel [x] [y]',
                arguments: {
                    x: {type: 'number', defaultValue: 0}, y: {type: 'number', defaultValue: 0}}},
            jsCompiled: 'return Scratch.pixelColor(Scratch.args.x, Scratch.args.y);'},
        {opcode: 'loud',
            type: 'reporter',
            signature: {text: 'loudness of [n]', arguments: {n: {type: 'number', defaultValue: 1}}},
            jsCompiled: 'return Scratch.soundLoudness(Scratch.args.n);'},
        {opcode: 'dur',
            type: 'reporter',
            signature: {text: 'duration of [n]', arguments: {n: {type: 'number', defaultValue: 1}}},
            jsCompiled: 'return Scratch.soundDuration(Scratch.args.n);'}
    ]
};

/**
 * A fake target with a renderer (1x1 red costume pixel) and one sound (constant
 * 0.5 amplitude) so pixel and audio reads can be exercised without a browser.
 * @returns {object} a fake target.
 */
const makeRichTarget = () => {
    const base = makeTarget();
    base.drawableID = 0;
    base.renderer = {
        extractDrawableScreenSpace: () => ({
            imageData: {width: 1, height: 1, data: [255, 0, 0, 255]}
        })
    };
    const channel = new Float32Array(1000);
    channel.fill(0.5);
    base.sprite.sounds = [{name: 'beep', soundId: 'snd1'}];
    base.sprite.soundBank = {
        getSoundPlayer: () => ({buffer: {getChannelData: () => channel, duration: 1.5, length: 1000}})
    };
    return base;
};

test('onStop runs the registered cleanup when the project stops', t => {
    const runtime = new Runtime();
    runtime.installCustomLibrary(HARDWARE_LIBRARY);
    const target = makeTarget();

    runtime._primitives['jslib_hw_armCleanup']({}, makeUtil(runtime, target, {}));
    t.equal(target.x, 0, 'cleanup has not run yet');

    runtime.stopAll();
    t.equal(target.x, 100, 'onStop cleanup ran on stop');

    // It only runs once — a second stop does nothing new.
    target.x = 5;
    runtime.stopAll();
    t.equal(target.x, 5, 'handler was cleared after firing');
    t.end();
});

test('pixelColor reads the sprite costume pixels', t => {
    const runtime = new Runtime();
    runtime.installCustomLibrary(HARDWARE_LIBRARY);
    const target = makeRichTarget();
    t.equal(runtime._primitives['jslib_hw_pixel']({x: 0, y: 0}, makeUtil(runtime, target, {})), '#ff0000',
        'top-left pixel is red');
    t.equal(runtime._primitives['jslib_hw_pixel']({x: 99, y: 99}, makeUtil(runtime, target, {})), '#000000',
        'out-of-range pixel is black, never throws');
    t.end();
});

test('soundLoudness and soundDuration read decoded audio', t => {
    const runtime = new Runtime();
    runtime.installCustomLibrary(HARDWARE_LIBRARY);
    const target = makeRichTarget();
    const loud = runtime._primitives['jslib_hw_loud']({n: 1}, makeUtil(runtime, target, {}));
    t.ok(Math.abs(loud - 50) < 1, `RMS of a 0.5 amplitude tone is ~50 (got ${loud})`);
    t.equal(runtime._primitives['jslib_hw_dur']({n: 1}, makeUtil(runtime, target, {})), 1.5, 'duration in seconds');
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

const CanvasStore = require('../../src/extension-support/js-blocks/canvas-store');

const CANVAS_LIBRARY = {
    id: 'jslib_canvas',
    name: 'Canvas Lib',
    color1: '#CF63CF',
    blocks: [
        {opcode: 'setup',
            type: 'command',
            signature: {text: 'setup [w] [h]',
                arguments: {w: {type: 'number', defaultValue: 480}, h: {type: 'number', defaultValue: 360}}},
            jsCompiled: 'Scratch.canvas.resize(Scratch.args.w, Scratch.args.h);'},
        {opcode: 'paint',
            type: 'command',
            signature: {text: 'paint [x] [y] [color]',
                arguments: {
                    x: {type: 'number', defaultValue: 0},
                    y: {type: 'number', defaultValue: 0},
                    color: {type: 'text', defaultValue: '#ff0000'}}},
            jsCompiled: 'Scratch.canvas.setPixel(Scratch.args.x, Scratch.args.y, Scratch.args.color);'},
        {opcode: 'readR',
            type: 'reporter',
            signature: {text: 'red at [x] [y]',
                arguments: {x: {type: 'number', defaultValue: 0}, y: {type: 'number', defaultValue: 0}}},
            jsCompiled: 'return Scratch.canvas.getPixel(Scratch.args.x, Scratch.args.y)[0];'},
        {opcode: 'readA',
            type: 'reporter',
            signature: {text: 'alpha at [x] [y]',
                arguments: {x: {type: 'number', defaultValue: 0}, y: {type: 'number', defaultValue: 0}}},
            jsCompiled: 'return Scratch.canvas.getPixel(Scratch.args.x, Scratch.args.y)[3];'},
        {opcode: 'fillGreen',
            type: 'command',
            signature: {text: 'fill green', arguments: {}},
            jsCompiled: 'Scratch.canvas.fill([0, 255, 0]);'},
        {opcode: 'wipe',
            type: 'command',
            signature: {text: 'wipe', arguments: {}},
            jsCompiled: 'Scratch.canvas.clear();'},
        {opcode: 'wide',
            type: 'reporter',
            signature: {text: 'width', arguments: {}},
            jsCompiled: 'return Scratch.canvas.width();'}
    ]
};

/**
 * A renderer test double that records the skin/drawable calls the canvas manager
 * makes, so we can assert it uploads and tears down without a real WebGL context.
 * @returns {object} a fake renderer.
 */
const makeFakeRenderer = () => ({
    calls: {createBitmapSkin: 0, createDrawable: 0, updateBitmapSkin: 0, destroyDrawable: 0, destroySkin: 0},
    lastData: null,
    _skin: 100,
    _drawable: 200,
    createBitmapSkin (data) {
        this.calls.createBitmapSkin++;
        this.lastData = data;
        return this._skin++;
    },
    createDrawable () {
        this.calls.createDrawable++;
        return this._drawable++;
    },
    updateDrawableSkinId () {},
    updateDrawablePosition () {},
    updateDrawableVisible () {},
    setDrawableOrder () {},
    updateBitmapSkin (skinId, data) {
        this.calls.updateBitmapSkin++;
        this.lastData = data;
    },
    destroyDrawable () {
        this.calls.destroyDrawable++;
    },
    destroySkin () {
        this.calls.destroySkin++;
    }
});

const canvasTarget = id => Object.assign(makeTarget(), {id});

test('parseColor accepts hex strings and rgb(a) arrays, rejects junk', t => {
    t.same(CanvasStore.parseColor('#ff8800'), [255, 136, 0, 255], 'six-digit hex');
    t.same(CanvasStore.parseColor('#f80'), [255, 136, 0, 255], 'three-digit hex expands');
    t.same(CanvasStore.parseColor([10, 20, 30]), [10, 20, 30, 255], 'rgb array defaults alpha');
    t.same(CanvasStore.parseColor([10, 20, 30, 40]), [10, 20, 30, 40], 'rgba array');
    t.same(CanvasStore.parseColor([300, -5, 10]), [255, 0, 10, 255], 'channels clamp to 0–255');
    t.equal(CanvasStore.parseColor('not a color'), null, 'garbage string is null');
    t.equal(CanvasStore.parseColor(42), null, 'number is null');
    t.end();
});

test('canvas writes a CPU buffer and reads it back without a renderer', t => {
    const runtime = new Runtime(); // no renderer attached
    runtime.installCustomLibrary(CANVAS_LIBRARY);
    const target = canvasTarget('spriteA');

    // Starts at the full stage, fully transparent.
    t.equal(runtime._primitives['jslib_canvas_wide']({}, makeUtil(runtime, target, {})), 480,
        'default width is the stage');
    t.equal(runtime._primitives['jslib_canvas_readA']({x: 5, y: 5}, makeUtil(runtime, target, {})), 0,
        'untouched pixel is transparent');

    runtime._primitives['jslib_canvas_paint']({x: 5, y: 5, color: '#ff0000'}, makeUtil(runtime, target, {}));
    t.equal(runtime._primitives['jslib_canvas_readR']({x: 5, y: 5}, makeUtil(runtime, target, {})), 255,
        'painted pixel reads back red');
    t.equal(runtime._primitives['jslib_canvas_readA']({x: 5, y: 5}, makeUtil(runtime, target, {})), 255,
        'painted pixel is opaque');

    // Out-of-range reads/writes never throw and report transparent black.
    t.equal(runtime._primitives['jslib_canvas_readR']({x: 9999, y: 9999}, makeUtil(runtime, target, {})), 0,
        'out-of-range pixel is 0, never throws');
    runtime._primitives['jslib_canvas_paint']({x: -1, y: -1, color: '#ffffff'}, makeUtil(runtime, target, {}));
    t.pass('painting out of range is a safe no-op');
    t.end();
});

test('canvas resize clamps to 1–512 and clears, fill and clear work', t => {
    const runtime = new Runtime();
    runtime.installCustomLibrary(CANVAS_LIBRARY);
    const target = canvasTarget('spriteA');

    runtime._primitives['jslib_canvas_setup']({w: 9999, h: 0}, makeUtil(runtime, target, {}));
    t.equal(runtime._primitives['jslib_canvas_wide']({}, makeUtil(runtime, target, {})), 512, 'width clamps to 512');

    runtime._primitives['jslib_canvas_fillGreen']({}, makeUtil(runtime, target, {}));
    t.equal(runtime._primitives['jslib_canvas_readR']({x: 0, y: 0}, makeUtil(runtime, target, {})), 0,
        'fill set red channel 0');
    t.equal(runtime._primitives['jslib_canvas_readA']({x: 0, y: 0}, makeUtil(runtime, target, {})), 255,
        'fill (rgb only) is opaque');

    runtime._primitives['jslib_canvas_wipe']({}, makeUtil(runtime, target, {}));
    t.equal(runtime._primitives['jslib_canvas_readA']({x: 0, y: 0}, makeUtil(runtime, target, {})), 0,
        'clear makes it transparent');
    t.end();
});

test('canvas uploads to the renderer and disposes on stop', t => {
    const runtime = new Runtime();
    runtime.renderer = makeFakeRenderer();
    runtime.installCustomLibrary(CANVAS_LIBRARY);
    const target = canvasTarget('spriteA');

    runtime._primitives['jslib_canvas_paint']({x: 1, y: 1, color: '#0000ff'}, makeUtil(runtime, target, {}));

    // First flush creates the skin + drawable; later flushes update in place.
    runtime._jsCanvases.flushDirty();
    t.equal(runtime.renderer.calls.createBitmapSkin, 1, 'skin created on first flush');
    t.equal(runtime.renderer.calls.createDrawable, 1, 'drawable created on first flush');
    t.equal(runtime.renderer.lastData.width, 480, 'uploaded buffer is stage-sized');

    runtime._primitives['jslib_canvas_paint']({x: 2, y: 2, color: '#0000ff'}, makeUtil(runtime, target, {}));
    runtime._jsCanvases.flushDirty();
    t.equal(runtime.renderer.calls.createBitmapSkin, 1, 'no second skin created');
    t.equal(runtime.renderer.calls.updateBitmapSkin, 1, 'buffer re-uploaded in place');

    // A clean flush (nothing drawn) uploads nothing.
    runtime._jsCanvases.flushDirty();
    t.equal(runtime.renderer.calls.updateBitmapSkin, 1, 'no upload when buffer is unchanged');

    runtime.stopAll();
    t.equal(runtime.renderer.calls.destroyDrawable, 1, 'drawable destroyed on stop');
    t.equal(runtime.renderer.calls.destroySkin, 1, 'skin destroyed on stop');
    t.equal(runtime._jsCanvases.canvases.size, 0, 'canvas records cleared on stop');
    t.end();
});

test('canvas layers are per-(library, sprite) and clean up per target/library', t => {
    const runtime = new Runtime();
    runtime.renderer = makeFakeRenderer();
    runtime.installCustomLibrary(CANVAS_LIBRARY);
    const spriteA = canvasTarget('spriteA');
    const spriteB = canvasTarget('spriteB');

    runtime._primitives['jslib_canvas_paint']({x: 0, y: 0, color: '#ff0000'}, makeUtil(runtime, spriteA, {}));
    runtime._primitives['jslib_canvas_paint']({x: 0, y: 0, color: '#00ff00'}, makeUtil(runtime, spriteB, {}));
    t.equal(runtime._jsCanvases.canvases.size, 2, 'each sprite gets its own canvas');

    // Deleting one sprite's clone tears down only its canvas.
    runtime.disposeTarget(spriteA);
    t.equal(runtime._jsCanvases.canvases.size, 1, 'only the disposed target’s canvas is gone');

    // Uninstalling the library tears down the rest.
    runtime.uninstallCustomLibrary('jslib_canvas');
    t.equal(runtime._jsCanvases.canvases.size, 0, 'library uninstall disposes its canvases');
    t.end();
});

const WARP_LIBRARY = {
    id: 'jslib_warp',
    name: 'Warp Lib',
    color1: '#FF8C1A',
    blocks: [
        {opcode: 'fast',
            type: 'command',
            warp: true,
            signature: {text: 'fast thing', arguments: {}},
            jsCompiled: 'Scratch.changeX(1);'},
        {opcode: 'slow',
            type: 'command',
            signature: {text: 'slow thing', arguments: {}},
            jsCompiled: 'Scratch.changeX(1);'}
    ]
};

/**
 * Build a util whose peekStackFrame returns a single stable frame, so a test can
 * observe a block flipping warpMode on it.
 * @param {Runtime} runtime - the runtime.
 * @param {object} target - a fake target.
 * @returns {object} {util, frame}.
 */
const makeWarpUtil = (runtime, target) => {
    const frame = {warpMode: false};
    const util = {
        runtime,
        target,
        stackFrame: frame,
        thread: {peekStackFrame: () => frame},
        yield: () => {}
    };
    return {util, frame};
};

test('a block declared warp:true enables warp on its stack frame; a normal block does not', t => {
    const runtime = new Runtime();
    runtime.installCustomLibrary(WARP_LIBRARY);
    const target = makeTarget();

    const warpRun = makeWarpUtil(runtime, target);
    runtime._primitives['jslib_warp_fast']({}, warpRun.util);
    t.equal(warpRun.frame.warpMode, true, 'warp block turns on warpMode (no per-iteration screen refresh)');

    const normalRun = makeWarpUtil(runtime, target);
    runtime._primitives['jslib_warp_slow']({}, normalRun.util);
    t.equal(normalRun.frame.warpMode, false, 'a normal block leaves warpMode untouched');
    t.end();
});
