const Cast = require('../../util/cast');
const MathUtil = require('../../util/math-util');
const VmDataApi = require('./vm-data-api');
const DataStore = require('./data-store');

/**
 * Builds the sandboxed `Scratch` global that authored JS sees. The interpreter's
 * scope contains ONLY what we inject here, so the capability boundary is "what we
 * grant", never "what we forbid": there is no reference to the host realm, the DOM,
 * the network, or the real VM to escape through.
 *
 * Layout of the `Scratch` global:
 *   Scratch.args           - the block's coerced input values (this module)
 *   Scratch.sprite/effects/clone/stage/mouse/timer/costumes/... - read accessors (vm-data-api)
 *   Scratch.data.*         - the encapsulated per-library store (data-store)
 *   Scratch.setX/say/... - whitelisted effect setters for command blocks (this module)
 *   Scratch.text.*         - pure string helpers (this module)
 */

const EFFECT_NAMES = ['color', 'fisheye', 'whirl', 'pixelate', 'mosaic', 'brightness', 'ghost'];

/**
 * Coerce raw VM argument values into plain JS values keyed by input name, per the
 * block's declared argument types. Never throws on bad input (cast/clamp).
 * @param {object} libBlock - the block definition.
 * @param {object} argValues - raw argument values from the VM, keyed by input name.
 * @returns {object} coerced values keyed by input name.
 */
const coerceArgs = (libBlock, argValues) => {
    const out = {};
    const argsSpec = (libBlock.signature && libBlock.signature.arguments) || {};
    for (const name in argsSpec) {
        if (!Object.prototype.hasOwnProperty.call(argsSpec, name)) continue;
        const type = argsSpec[name].type;
        let raw;
        if (argValues) {
            raw = argValues[name];
        }
        if (type === 'number') {
            out[name] = Cast.toNumber(raw);
        } else if (type === 'boolean') {
            out[name] = Cast.toBoolean(raw);
        } else {
            out[name] = Cast.toString(raw);
        }
    }
    return out;
};

/**
 * Resolve a 1-based index or a costume name to a 0-based costume index.
 * @param {Target} target - the rendered target.
 * @param {number|string} indexOrName - 1-based index or name.
 * @returns {number} 0-based index, or -1 if not found.
 */
const resolveCostumeIndex = (target, indexOrName) => {
    const costumes = (target.sprite && target.sprite.costumes) || [];
    if (typeof indexOrName === 'number' || /^\d+$/.test(String(indexOrName))) {
        const idx = Math.round(Number(indexOrName)) - 1;
        return idx >= 0 && idx < costumes.length ? idx : -1;
    }
    return costumes.findIndex(c => c.name === indexOrName);
};

/**
 * Install whitelisted effect setters (for command blocks). Each delegates to the
 * same RenderedTarget methods native blocks use, so fencing / redraw / monitor
 * updates stay correct. No raw property assignment is ever exposed.
 * @param {Interpreter} interp - the interpreter.
 * @param {object} Scratch - the pseudo `Scratch` object.
 * @param {object} ctx - {util, ...}.
 */
const installEffectSetters = (interp, Scratch, ctx) => {
    const target = ctx.util.target;
    const movable = target && !target.isStage;
    const num = v => Cast.toNumber(interp.pseudoToNative(v));
    const fn = (name, impl) => interp.setProperty(Scratch, name, interp.createNativeFunction(impl));

    fn('setX', v => {
        if (movable) target.setXY(num(v), target.y);
    });
    fn('changeX', v => {
        if (movable) target.setXY(target.x + num(v), target.y);
    });
    fn('setY', v => {
        if (movable) target.setXY(target.x, num(v));
    });
    fn('changeY', v => {
        if (movable) target.setXY(target.x, target.y + num(v));
    });
    fn('goToXY', (x, y) => {
        if (movable) target.setXY(num(x), num(y));
    });
    fn('move', steps => {
        if (!movable) return;
        const radians = MathUtil.degToRad(90 - target.direction);
        const dist = num(steps);
        target.setXY(target.x + (dist * Math.cos(radians)), target.y + (dist * Math.sin(radians)));
    });

    fn('setDirection', v => {
        if (movable) target.setDirection(num(v));
    });
    fn('turnRight', v => {
        if (movable) target.setDirection(target.direction + num(v));
    });
    fn('turnLeft', v => {
        if (movable) target.setDirection(target.direction - num(v));
    });

    fn('setSize', v => {
        if (target && target.setSize) target.setSize(num(v));
    });
    fn('changeSize', v => {
        if (target && target.setSize) target.setSize(target.size + num(v));
    });

    fn('show', () => {
        if (target && target.setVisible) target.setVisible(true);
    });
    fn('hide', () => {
        if (target && target.setVisible) target.setVisible(false);
    });

    fn('setEffect', (name, value) => {
        const effect = Cast.toString(interp.pseudoToNative(name)).toLowerCase();
        if (target && target.setEffect && EFFECT_NAMES.indexOf(effect) !== -1) {
            target.setEffect(effect, num(value));
        }
    });
    fn('changeEffect', (name, value) => {
        const effect = Cast.toString(interp.pseudoToNative(name)).toLowerCase();
        if (target && target.setEffect && EFFECT_NAMES.indexOf(effect) !== -1) {
            target.setEffect(effect, (target.effects[effect] || 0) + num(value));
        }
    });
    fn('clearEffects', () => {
        if (target && target.clearEffects) target.clearEffects();
    });

    fn('setCostume', indexOrName => {
        if (!target || !target.setCostume) return;
        const resolved = resolveCostumeIndex(target, interp.pseudoToNative(indexOrName));
        if (resolved !== -1) target.setCostume(resolved);
    });
    fn('nextCostume', () => {
        if (!target || !target.setCostume) return;
        const count = (target.sprite && target.sprite.costumes && target.sprite.costumes.length) || 1;
        target.setCostume((target.currentCostume + 1) % count);
    });

    fn('setVolume', v => {
        if (target) target.volume = Math.max(0, Math.min(100, num(v)));
    });
    fn('changeVolume', v => {
        if (target) target.volume = Math.max(0, Math.min(100, (target.volume || 0) + num(v)));
    });
};

/**
 * Install pure string helpers under `Scratch.text`.
 * @param {Interpreter} interp - the interpreter.
 * @param {object} Scratch - the pseudo `Scratch` object.
 */
const installTextHelpers = (interp, Scratch) => {
    const str = v => Cast.toString(interp.pseudoToNative(v));
    const text = interp.nativeToPseudo({});
    interp.setProperty(Scratch, 'text', text);
    const def = (name, impl) => interp.setProperty(text, name, interp.createNativeFunction(impl));

    def('split', (s, sep) => interp.nativeToPseudo(str(s).split(str(sep))));
    def('join', (list, sep) => {
        const arr = interp.pseudoToNative(list);
        return Cast.toString(Array.isArray(arr) ? arr.join(str(sep)) : arr);
    });
    def('replaceAll', (s, find, repl) => {
        const parts = str(s).split(str(find));
        return parts.join(str(repl));
    });
    def('upper', s => str(s).toUpperCase());
    def('lower', s => str(s).toLowerCase());
    def('reverse', s => {
        const chars = str(s).split('');
        chars.reverse();
        return chars.join('');
    });
    def('contains', (s, sub) => str(s).indexOf(str(sub)) !== -1);
    def('trim', s => str(s).trim());
    def('repeat', (s, n) => {
        const count = Math.max(0, Math.round(Cast.toNumber(interp.pseudoToNative(n))));
        let out = '';
        for (let i = 0; i < count; i++) out += str(s);
        return out;
    });
};

/**
 * Install the full `Scratch` global into an interpreter scope.
 * @param {Interpreter} interp - the JS-Interpreter instance.
 * @param {object} scope - the interpreter's global scope object.
 * @param {object} ctx - {runtime, library, util, args}.
 */
const install = (interp, scope, ctx) => {
    const Scratch = interp.nativeToPseudo({});
    interp.setProperty(scope, 'Scratch', Scratch);

    interp.setProperty(Scratch, 'args', interp.nativeToPseudo(ctx.args || {}));
    VmDataApi.install(interp, Scratch, ctx);
    DataStore.install(interp, Scratch, ctx);
    installEffectSetters(interp, Scratch, ctx);
    installTextHelpers(interp, Scratch);

    // C-block control: run the wrapped substack once, then resume. This parks the
    // interpreter (async) until the runner re-enters after the substack completes.
    if (ctx.runner) {
        interp.setProperty(Scratch, 'runBranch', interp.createAsyncFunction(resume => {
            ctx.runner.requestBranch(resume);
        }));
    }
};

module.exports = {
    install,
    coerceArgs
};
