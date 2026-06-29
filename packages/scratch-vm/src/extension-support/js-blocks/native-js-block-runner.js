const Cast = require('../../util/cast');
const ApiBridge = require('./api-bridge');
const {buildNativeScratch} = require('./native-api-bridge');

/**
 * @file Experimental "direct execution" path for JS-powered blocks: run an
 * author's (already transpiled to ES5) block body as REAL JavaScript via the
 * Function constructor, with a plain-JS `Scratch` global, instead of stepping it
 * through js-interpreter.
 *
 * This trades the interpreter's two guarantees — a hard sandbox and a per-call
 * instruction budget — for speed. There is no capability boundary (the body runs
 * in the host realm) and no infinite-loop guard (a `while (true) {}` will freeze
 * the page). It exists only to measure the interpreter's overhead, gated behind a
 * runtime flag the user flips in the library manager. Every block type uses this
 * path EXCEPT C-blocks (c-loop / c-if), which keep the interpreter so
 * Scratch.runBranch() can coordinate with the sequencer. A command just runs to
 * completion in one synchronous call.
 */

/**
 * Stringify a value, returning null if it cannot be represented. Mirrors the
 * interpreter runner so reporter return values coerce identically.
 * @param {*} value - the value to stringify.
 * @returns {?string} JSON text, or null on failure.
 */
const safeStringify = value => {
    try {
        return JSON.stringify(value);
    } catch (e) {
        return null;
    }
};

/**
 * Coerce a body's return value to the shape the VM expects for the block type.
 * Identical rules to JsBlockRunner#_finalValue so the two paths agree.
 * @param {string} type - the block type.
 * @param {*} value - the raw return value.
 * @returns {*} value for a reporter/boolean/hat, or undefined for a command.
 */
const finalValue = (type, value) => {
    if (type === 'boolean' || type === 'hat') return Cast.toBoolean(value);
    if (type === 'command') return void 0;
    if (value !== null && typeof value === 'object') {
        const json = safeStringify(value);
        return json === null ? '' : json;
    }
    return typeof value === 'undefined' ? '' : value;
};

/**
 * A tiny stand-in for JsBlockRunner that only supports onStop in direct mode.
 * The runtime keeps a reference (via registerJsStopHandler) until the project
 * stops, then calls runStopHandler(). requestBranch is never reached because
 * direct mode handles only non-reentrant blocks.
 */
class DirectStopAdapter {
    /**
     * @param {Runtime} runtime - the VM runtime.
     * @param {object} library - the owning library.
     * @param {object} libBlock - the block definition.
     */
    constructor (runtime, library, libBlock) {
        this.runtime = runtime;
        this.library = library;
        this.libBlock = libBlock;
        this.handler = null;
    }
    /**
     * @param {Function} fn - the native onStop callback.
     */
    registerStopHandler (fn) {
        this.handler = fn;
        this.runtime.registerJsStopHandler(this.library, this.libBlock, this);
    }
    /** Unsupported in direct mode; C-blocks run on the interpreter instead. */
    requestBranch () {}
    /** Run the registered onStop callback once, when the project stops. */
    runStopHandler () {
        if (!this.handler) return;
        const fn = this.handler;
        this.handler = null;
        try {
            fn();
        } catch (e) {
            if (this.runtime && typeof this.runtime.emitJsBlockError === 'function') {
                this.runtime.emitJsBlockError(this.library, this.libBlock, e);
            }
        }
    }
}

/**
 * Build a reusable direct-execution runner for one block. The compiled body is
 * turned into a real Function once (lazily) and reused across calls; only the
 * `Scratch` global is rebuilt per call (it closes over this call's target/args).
 * @param {object} libBlock - the block definition (type, jsCompiled, signature…).
 * @param {object} library - the owning library.
 * @param {Runtime} runtime - the VM runtime.
 * @returns {{run: Function}} a runner whose run(util, argValues) returns the block value.
 */
const makeDirectRunner = (libBlock, library, runtime) => {
    let compiled = null;
    return {
        run (util, argValues) {
            if (compiled === null) {
                // The compiled body keeps its top-level `return` (static-analysis
                // parses with allowReturnOutsideFunction), so the Function's own
                // return value IS the block's value — no IIFE wrapper needed.
                compiled = new Function('Scratch', libBlock.jsCompiled || '');
            }
            const args = ApiBridge.coerceArgs(libBlock, argValues);
            const runner = new DirectStopAdapter(runtime, library, libBlock);
            const Scratch = buildNativeScratch({runtime, library, util, args, runner});
            let value;
            try {
                value = compiled(Scratch);
            } catch (e) {
                if (runtime && typeof runtime.emitJsBlockError === 'function') {
                    runtime.emitJsBlockError(library, libBlock, e);
                }
                value = void 0;
            }
            return finalValue(libBlock.type, value);
        }
    };
};

module.exports = {makeDirectRunner, finalValue, DirectStopAdapter};
