const JsBlockRunner = require('./js-block-runner');

/**
 * Block types that re-enter the same block across yields (the thread does not
 * advance). Their runner must persist in the thread's stack frame.
 * @param {string} type - the block type.
 * @returns {boolean} true if the block is re-entrant.
 */
const isReentrant = type =>
    type === 'command' || type === 'c-loop' || type === 'c-if';

/**
 * Build the `(args, util) => value` primitive function for a JS-powered block.
 * This is the single bridge between the VM's `_primitives[opcode]` dispatch and
 * the sandboxed interpreter.
 *
 * - Re-entrant blocks (command / C-block) stash their runner in
 *   `util.stackFrame.executionContext` so it survives `util.yield()` and resumes
 *   next tick. The framework nulls `executionContext` when the block advances, so
 *   no manual cleanup is needed.
 * - Reporters / booleans / hats build a fresh runner each call and never touch the
 *   stack frame (sibling reporters share it). They finish synchronously or, for a
 *   reporter that needs more time, return a Promise.
 * @param {object} libBlock - the block definition.
 * @param {object} library - the owning library.
 * @param {Runtime} runtime - the VM runtime.
 * @returns {Function} a `(args, util) => value` primitive.
 */
const makeJsBlockPrimitive = (libBlock, library, runtime) => {
    const reentrant = isReentrant(libBlock.type);
    const warp = Boolean(libBlock.warp);
    // Non-reentrant blocks (reporters/booleans/hats) build a fresh runner per call,
    // which is hot in loops. Reuse their interpreters from this per-block pool rather
    // than constructing one each time (see JsBlockRunner reuse). Re-entrant blocks keep
    // their single runner in the stack frame, so they don't need (or use) the pool.
    const pool = reentrant ? null : [];
    return function jsBlockPrimitive (argValues, util) {
        // A block declared `warp: true` ("run without screen refresh") sets warp on
        // its own stack frame; child branch frames inherit it (Thread#pushStack), so a
        // C-block's substack runs to completion in one frame instead of yielding once
        // per iteration. This is what lets a 100+ cell grid render in real time.
        if (warp && util.thread && util.thread.peekStackFrame()) {
            util.thread.peekStackFrame().warpMode = true;
        }
        let runner;
        if (reentrant) {
            runner = util.stackFrame.jsBlock;
            if (!runner) {
                runner = util.stackFrame.jsBlock =
                    new JsBlockRunner(libBlock, library, runtime, util, argValues, null);
            }
        } else {
            runner = new JsBlockRunner(libBlock, library, runtime, util, argValues, pool);
        }
        return runner.runSlice(util);
    };
};

module.exports = makeJsBlockPrimitive;
