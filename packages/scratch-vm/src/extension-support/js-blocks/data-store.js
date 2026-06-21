const Cast = require('../../util/cast');

/**
 * @file The `Scratch.data.*` API: an encapsulated, per-library key/value store
 * with helpers for named lists, maps, and grids. It operates ONLY on the
 * library's private store (runtime._jsBlockStores[libId]) — never on real Scratch
 * variables/lists — and is cleared on green flag / stop. The store is a plain dict
 * of named values; each named value may be a scalar, an array (list / grid), or an
 * object (map).
 */

/**
 * Convert a 1-based index to a 0-based index, or -1 if out of range.
 * @param {*} rawIndex - the (possibly non-numeric) index.
 * @param {number} length - the list length.
 * @returns {number} 0-based index, or -1 when out of range.
 */
const oneBasedToZero = (rawIndex, length) => {
    const idx = Math.round(Cast.toNumber(rawIndex));
    return (idx >= 1 && idx <= length) ? idx - 1 : -1;
};

/**
 * Install the `Scratch.data` namespace onto the `Scratch` global.
 * @param {Interpreter} interp - the interpreter.
 * @param {object} Scratch - the pseudo `Scratch` object.
 * @param {object} ctx - {runtime, library, ...}.
 */
const install = (interp, Scratch, ctx) => {
    const store = ctx.runtime.getJsBlockStore(ctx.library.id);
    const toNative = v => interp.pseudoToNative(v);
    const toPseudo = v => ((v !== null && typeof v === 'object') ? interp.nativeToPseudo(v) : v);
    const key = v => Cast.toString(toNative(v));

    const data = interp.nativeToPseudo({});
    interp.setProperty(Scratch, 'data', data);
    const def = (name, impl) => interp.setProperty(data, name, interp.createNativeFunction(impl));

    /**
     * Get the array stored under a name, creating an empty one if absent.
     * @param {string} name - the store key.
     * @returns {Array} the named array.
     */
    const getList = name => {
        if (!Array.isArray(store[name])) store[name] = [];
        return store[name];
    };

    /**
     * Get the map (plain object) stored under a name, creating one if absent.
     * @param {string} name - the store key.
     * @returns {object} the named map.
     */
    const getMap = name => {
        const existing = store[name];
        if (existing === null || typeof existing !== 'object' || Array.isArray(existing)) {
            store[name] = {};
        }
        return store[name];
    };

    // --- key / value -----------------------------------------------------
    def('set', (k, v) => {
        store[key(k)] = toNative(v);
    });
    def('get', k => {
        const v = store[key(k)];
        return toPseudo(typeof v === 'undefined' ? '' : v);
    });
    def('has', k => Object.prototype.hasOwnProperty.call(store, key(k)));
    def('delete', k => {
        delete store[key(k)];
    });
    def('keys', () => interp.nativeToPseudo(Object.keys(store)));
    def('clear', () => {
        for (const k of Object.keys(store)) delete store[k];
    });

    // --- named lists -----------------------------------------------------
    def('push', (name, v) => {
        getList(key(name)).push(toNative(v));
    });
    def('itemAt', (name, i) => {
        const list = getList(key(name));
        const idx = oneBasedToZero(toNative(i), list.length);
        return idx === -1 ? '' : toPseudo(list[idx]);
    });
    def('setItem', (name, i, v) => {
        const list = getList(key(name));
        const idx = oneBasedToZero(toNative(i), list.length);
        if (idx !== -1) list[idx] = toNative(v);
    });
    def('insertAt', (name, i, v) => {
        const list = getList(key(name));
        const idx = oneBasedToZero(toNative(i), list.length + 1);
        if (idx !== -1) list.splice(idx, 0, toNative(v));
    });
    def('removeAt', (name, i) => {
        const list = getList(key(name));
        const idx = oneBasedToZero(toNative(i), list.length);
        if (idx !== -1) list.splice(idx, 1);
    });
    def('length', name => getList(key(name)).length);
    def('contains', (name, v) => getList(key(name)).indexOf(toNative(v)) !== -1);

    // --- maps ------------------------------------------------------------
    def('newMap', name => {
        store[key(name)] = {};
    });
    def('mapSet', (name, k, v) => {
        getMap(key(name))[key(k)] = toNative(v);
    });
    def('mapGet', (name, k) => {
        const v = getMap(key(name))[key(k)];
        return toPseudo(typeof v === 'undefined' ? '' : v);
    });
    def('mapHas', (name, k) => Object.prototype.hasOwnProperty.call(getMap(key(name)), key(k)));
    def('mapDelete', (name, k) => {
        delete getMap(key(name))[key(k)];
    });
    def('mapKeys', name => interp.nativeToPseudo(Object.keys(getMap(key(name)))));

    // --- grids (named 2D arrays) ----------------------------------------
    def('new2DArray', (name, rows, cols, fill) => {
        const r = Math.max(0, Math.round(Cast.toNumber(toNative(rows))));
        const c = Math.max(0, Math.round(Cast.toNumber(toNative(cols))));
        const fillValue = toNative(fill);
        const grid = [];
        for (let i = 0; i < r; i++) {
            const row = [];
            for (let j = 0; j < c; j++) row.push(fillValue);
            grid.push(row);
        }
        store[key(name)] = grid;
    });
    def('cell', (name, r, c) => {
        const grid = store[key(name)];
        if (!Array.isArray(grid)) return '';
        const ri = oneBasedToZero(toNative(r), grid.length);
        if (ri === -1 || !Array.isArray(grid[ri])) return '';
        const ci = oneBasedToZero(toNative(c), grid[ri].length);
        return ci === -1 ? '' : toPseudo(grid[ri][ci]);
    });
    def('setCell', (name, r, c, v) => {
        const grid = store[key(name)];
        if (!Array.isArray(grid)) return;
        const ri = oneBasedToZero(toNative(r), grid.length);
        if (ri === -1 || !Array.isArray(grid[ri])) return;
        const ci = oneBasedToZero(toNative(c), grid[ri].length);
        if (ci !== -1) grid[ri][ci] = toNative(v);
    });
};

module.exports = {install, oneBasedToZero};
