const Interpreter = require('js-interpreter');
const Cast = require('../../util/cast');
const ApiBridge = require('./api-bridge');

/**
 * Tuning constants for sandboxed execution.
 *
 * The Scratch sequencer gives all threads a shared per-tick budget
 * (`WORK_TIME` = 75% of the step). A single JS block must not consume that whole
 * budget, so we self-limit each "slice" to a fixed number of interpreter steps
 * and then yield (commands) or continue on a later macrotask (reporters).
 * @enum {number}
 */
const Budget = {
    /** Interpreter steps per slice in normal mode. */
    NORMAL_SLICE: 4000,
    /** Interpreter steps per slice in warp ("run without screen refresh") mode. */
    WARP_SLICE: 50000,
    /** Total steps a single block invocation may take before it is force-stopped. */
    HARD_CAP: 5000000,
    /** Steps per macrotask chunk when a reporter must finish asynchronously. */
    REPORTER_CHUNK: 20000,
    /** Steps a hat predicate may take (hats run every tick and may not yield). */
    HAT_CAP: 200000
};

const isReentrant = type =>
    type === 'command' || type === 'c-loop' || type === 'c-if';

/**
 * How many times one interpreter may be reused before it is discarded and rebuilt.
 * Constructing a js-interpreter is expensive (~2ms: it builds the whole standard
 * global environment), but reuse appends the body to the interpreter's program, so
 * we cap reuse to keep that program (and its variable scan) small. Amortizes the
 * build cost across many calls — the difference between ~2.5ms and ~0.1ms per call
 * for reporters/booleans invoked in tight loops.
 * @type {number}
 */
const MAX_REUSES = 100;

/**
 * Wrap an author's (already transpiled to ES5) block body so that its `return`
 * value is captured. The body becomes the inside of an IIFE; whatever it returns
 * is handed to the injected `__scratchReport__` reporter.
 * @param {string} compiledBody - ES5 JavaScript body.
 * @returns {string} a complete program for the interpreter.
 */
const wrapSource = compiledBody =>
    `__scratchReport__((function () {\n${compiledBody}\n})());\n`;

/**
 * Stringify a value, returning null if it cannot be represented (e.g. a cyclic
 * structure) rather than throwing.
 * @param {object} value - the value to stringify.
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
 * Drives a single invocation of a JS-powered block in a sandboxed interpreter.
 *
 * One runner == one block call. Its interpreter holds all per-call state; for
 * re-entrant blocks (commands / C-blocks) the runner is stashed in the thread's
 * `stackFrame.executionContext` so it survives yields and resumes next tick.
 * Reporters never touch the stack frame (sibling reporters share it) — they
 * either finish synchronously or return a Promise that holds the runner alive.
 */
class JsBlockRunner {
    /**
     * @param {object} libBlock - the block definition (opcode, type, signature, jsCompiled…).
     * @param {object} library - the owning library (id, name…).
     * @param {Runtime} runtime - the VM runtime.
     * @param {BlockUtility} util - the block utility for this call.
     * @param {object} argValues - raw argument values keyed by input name.
     * @param {?Array} pool - a per-block pool of idle interpreter sessions to reuse
     *   (non-reentrant blocks only); null disables reuse.
     */
    constructor (libBlock, library, runtime, util, argValues, pool) {
        this.libBlock = libBlock;
        this.library = library;
        this.runtime = runtime;
        this.totalSteps = 0;
        this.finished = false;
        this.errored = false;
        // Left implicitly undefined until the body's IIFE result is reported.
        this.returnValue = void 0;
        // C-block branch coordination (see requestBranch / runSlice).
        this.awaitingBranch = false;
        this.branchResume = null;
        this.currentUtil = util;
        // onStop coordination (see registerStopHandler / runStopHandler).
        this.globalScope = null;
        this.stopHandler = null;
        // Interpreter reuse (see _recycle): the borrowed session, if any.
        this.pool = pool || null;
        this.session = null;

        const program = wrapSource(libBlock.jsCompiled || '');
        const args = ApiBridge.coerceArgs(libBlock, argValues);

        if (this.pool && this.pool.length > 0) {
            // Reuse a finished interpreter: refresh the Scratch bridge for this
            // call's target/args, then append the body to run again.
            this.session = this.pool.pop();
            this.interpreter = this.session.interpreter;
            this.globalScope = this.session.scope;
            this._install(this.interpreter, this.globalScope, util, args);
            this.interpreter.appendCode(program);
        } else {
            this.interpreter = new Interpreter(program, (interp, scope) => {
                this._install(interp, scope, util, args);
            });
            if (this.pool) {
                this.session = {interpreter: this.interpreter, scope: this.globalScope, uses: 0};
            }
        }
    }

    /**
     * Install the report hook and the `Scratch` bridge into an interpreter's global
     * scope. Run once at construction and again on each reuse (it overwrites the
     * `Scratch` global, refreshing every closure with this call's target/args).
     * @param {Interpreter} interp - the interpreter.
     * @param {object} scope - its global scope.
     * @param {BlockUtility} util - the block utility for this call.
     * @param {object} args - coerced argument values.
     * @private
     */
    _install (interp, scope, util, args) {
        this.globalScope = scope;
        interp.setProperty(scope, '__scratchReport__', interp.createNativeFunction(value => {
            this.returnValue = interp.pseudoToNative(value);
        }));
        ApiBridge.install(interp, scope, {
            runtime: this.runtime,
            library: this.library,
            util,
            runner: this,
            args
        });
    }

    /**
     * Return this call's interpreter to its pool for reuse, unless it errored or is
     * holding an onStop handler (both need the interpreter kept as-is). Bounded by
     * MAX_REUSES so the reused program — which grows by one statement per reuse —
     * stays small.
     * @private
     */
    _recycle () {
        const session = this.session;
        if (!session || !this.pool || this.errored || this.stopHandler) return;
        this.session = null;
        session.uses += 1;
        if (session.uses < MAX_REUSES) this.pool.push(session);
    }

    /**
     * Called from the sandbox when authored JS invokes `Scratch.onStop(fn)`.
     * Keeps this runner (and its interpreter) alive so the cleanup runs on stop.
     * @param {*} handlerFn - the interpreter pseudo-function to call on stop.
     */
    registerStopHandler (handlerFn) {
        this.stopHandler = handlerFn;
        this.runtime.registerJsStopHandler(this.library, this.libBlock, this);
    }

    /**
     * Run the registered onStop cleanup once, bounded, when the project stops.
     * Uses appendCode to invoke the stored pseudo-function after the body finished.
     */
    runStopHandler () {
        if (!this.stopHandler || !this.globalScope) return;
        const fn = this.stopHandler;
        this.stopHandler = null;
        try {
            this.interpreter.setProperty(this.globalScope, '__scratchStopHandler__', fn);
            this.interpreter.appendCode('__scratchStopHandler__();');
            let steps = 0;
            while (this.interpreter.step()) {
                if (++steps >= Budget.HAT_CAP) break;
            }
        } catch (e) {
            this._abort(e);
        }
    }

    /**
     * Called from the sandbox when authored JS invokes `Scratch.runBranch()`.
     * Starts the C-block's wrapped substack and parks the interpreter; the runner
     * resumes it (via the stored callback) after the substack returns. Always uses
     * isLoop=true so the sequencer re-enters this block, letting the JS body's own
     * control flow decide whether to loop.
     * @param {Function} resume - the interpreter's async-resume callback.
     */
    requestBranch (resume) {
        this.branchResume = resume;
        this.awaitingBranch = true;
        if (this.currentUtil) {
            this.currentUtil.startBranch(1, true);
        }
    }

    /**
     * Run one slice. Returns the block's value (reporter/boolean), a Promise
     * (reporter that needs more time), or undefined (command, finished or yielded).
     * @param {BlockUtility} util - the block utility for this call.
     * @returns {*} value, Promise, or undefined.
     */
    runSlice (util) {
        const type = this.libBlock.type;
        const warp = Boolean(util.thread.peekStackFrame().warpMode);
        const sliceCap = type === 'hat' ?
            Budget.HAT_CAP :
            (warp ? Budget.WARP_SLICE : Budget.NORMAL_SLICE);

        this.currentUtil = util;
        // If we're resuming after a C-block's wrapped substack ran, unblock the
        // interpreter so it continues past the Scratch.runBranch() call.
        if (this.branchResume) {
            const resume = this.branchResume;
            this.branchResume = null;
            resume();
        }

        let stepsThisSlice = 0;
        try {
            while (this.interpreter.step()) {
                // A Scratch.runBranch() call parked the interpreter; return so the
                // sequencer runs the wrapped substack, then re-enters this block.
                if (this.awaitingBranch) {
                    this.awaitingBranch = false;
                    return;
                }
                this.totalSteps += 1;
                if (this.totalSteps >= Budget.HARD_CAP) {
                    this._abort('exceeded the instruction limit (possible infinite loop)');
                    return this._finalValue();
                }
                if (++stepsThisSlice >= sliceCap) {
                    return this._suspend(util, type);
                }
            }
        } catch (e) {
            this._abort(e);
            return this._finalValue();
        }
        this.finished = true;
        const value = this._finalValue();
        this._recycle();
        return value;
    }

    /**
     * The block did not finish within its slice. Suspend appropriately for its type.
     * @param {BlockUtility} util - the block utility.
     * @param {string} type - the block type.
     * @returns {*} undefined (yield) or a Promise (async reporter).
     * @private
     */
    _suspend (util, type) {
        if (isReentrant(type)) {
            // Re-entrant: yield and resume the same interpreter next tick. The
            // runner persists in stackFrame.executionContext (see makeJsBlockPrimitive).
            util.yield();
            return;
        }
        if (type === 'hat') {
            // Hats run every tick and may not yield — give up and report false.
            this._abort('hat block did not finish in time');
            return this._finalValue();
        }
        // Reporter / boolean: util.yield() does not suspend an input reporter
        // (execute.js continues the ops chain), so finish on the Promise path.
        return this._finishAsync();
    }

    /**
     * Step the interpreter to completion across macrotasks, resolving with the value.
     * Used only for reporters/booleans that exceed a single slice.
     * @returns {Promise} resolves to the reporter value.
     * @private
     */
    _finishAsync () {
        return new Promise(resolve => {
            const chunk = () => {
                let n = 0;
                try {
                    while (this.interpreter.step()) {
                        this.totalSteps += 1;
                        if (this.totalSteps >= Budget.HARD_CAP) {
                            this._abort('exceeded the instruction limit (possible infinite loop)');
                            return resolve(this._finalValue());
                        }
                        if (++n >= Budget.REPORTER_CHUNK) {
                            return setTimeout(chunk, 0);
                        }
                    }
                } catch (e) {
                    this._abort(e);
                    return resolve(this._finalValue());
                }
                this.finished = true;
                const value = this._finalValue();
                this._recycle();
                return resolve(value);
            };
            chunk();
        });
    }

    /**
     * Mark the run as errored and surface the problem without throwing into the sequencer.
     * @param {Error|string} error - the failure.
     * @private
     */
    _abort (error) {
        this.finished = true;
        this.errored = true;
        if (this.runtime && typeof this.runtime.emitJsBlockError === 'function') {
            this.runtime.emitJsBlockError(this.library, this.libBlock, error);
        }
    }

    /**
     * Coerce the captured return value to the shape the VM expects for this block type.
     * @returns {*} value for a reporter/boolean, or undefined for a command.
     * @private
     */
    _finalValue () {
        const type = this.libBlock.type;
        if (isReentrant(type)) return;
        const value = this.returnValue;
        if (type === 'boolean' || type === 'hat') return Cast.toBoolean(value);
        // Reporter: VM values are primitives — stringify structured returns.
        if (value !== null && typeof value === 'object') {
            const json = safeStringify(value);
            return json === null ? '' : json;
        }
        return typeof value === 'undefined' ? '' : value;
    }
}

JsBlockRunner.Budget = Budget;

module.exports = JsBlockRunner;
