const Interpreter = require('js-interpreter');
const ApiBridge = require('./api-bridge');

/**
 * @file Builds the SAME `Scratch` global the sandbox sees, but as a plain JS
 * object — no js-interpreter pseudo-realm. Used by the experimental "direct
 * execution" mode (see native-js-block-runner), which trades the interpreter's
 * sandbox + instruction budget for raw speed.
 *
 * Rather than re-implement the whole API surface, we reuse the existing
 * installers (ApiBridge.install and everything it calls) verbatim and hand them a
 * SHIM standing in for the interpreter. Every interpreter primitive the installers
 * touch has a trivial no-marshal native equivalent:
 *   - nativeToPseudo / pseudoToNative   -> identity (values are already native)
 *   - createNativeFunction / createAsyncFunction -> the function itself
 *   - setProperty(obj, name, value)     -> obj[name] = value
 *   - setProperty(obj, name, VALUE_IN_DESCRIPTOR, {get}) -> a real getter
 * So there is ONE source of truth for the API; this file only adapts how it is
 * installed. The interpreter path is left completely untouched.
 */

const nativeInterpShim = {
    nativeToPseudo: x => x,
    pseudoToNative: x => x,
    createNativeFunction: fn => fn,
    createAsyncFunction: fn => fn,
    /**
     * Mirror Interpreter#setProperty for the two shapes the installers use: a plain
     * assignment, or a live getter expressed via VALUE_IN_DESCRIPTOR.
     * @param {object} obj - target object.
     * @param {string} name - property name.
     * @param {*} value - the value, or the VALUE_IN_DESCRIPTOR sentinel.
     * @param {object} [descriptor] - present when value is the sentinel: {get}.
     */
    setProperty (obj, name, value, descriptor) {
        if (value === Interpreter.VALUE_IN_DESCRIPTOR && descriptor && typeof descriptor.get === 'function') {
            // descriptor.get is a createNativeFunction result == the raw getter fn.
            Object.defineProperty(obj, name, {get: descriptor.get, enumerable: true, configurable: true});
        } else {
            obj[name] = value;
        }
    }
};

/**
 * Build a plain-JS `Scratch` global for one direct-mode block call.
 * @param {object} ctx - {runtime, library, util, args, runner}.
 * @returns {object} the `Scratch` object (real functions and live getters).
 */
const buildNativeScratch = ctx => {
    const scope = {};
    ApiBridge.install(nativeInterpShim, scope, ctx);
    return scope.Scratch;
};

module.exports = {buildNativeScratch, nativeInterpShim};
