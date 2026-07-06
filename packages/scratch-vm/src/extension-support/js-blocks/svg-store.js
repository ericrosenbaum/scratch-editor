const Cast = require('../../util/cast');

/**
 * @file The `Scratch.svg` API: reach into the sprite's CURRENT vector costume and
 * change what it shows — text, colors, part positions/rotations, visibility —
 * for DISPLAY ONLY. The costume's stored asset is never touched, so nothing here
 * is ever saved with the project: we parse the asset's SVG source once, edit the
 * parsed document, and re-upload it to the costume's existing render skin
 * (renderer.updateSVGSkin). The original source is kept so the skin can be put
 * back exactly as it was — on `Scratch.svg.reset()`, and automatically on green
 * flag / stop.
 *
 * Unlike `Scratch.canvas` (which is private to a library+sprite), an SVG edit
 * targets the costume's one shared skin: every clone wearing the costume — and
 * any other library editing it — sees the same live document. Uploads are
 * batched: edits mark the record dirty and the new SVG text is sent to the
 * renderer at most once per frame (see flushDirty), mirroring the canvas store.
 *
 * DOM parsing/serialization only exist in the browser; headless (tests, server)
 * the whole API degrades to harmless no-ops unless a DOM implementation is
 * injected into the manager.
 */

/**
 * Is this attribute safe for authored code to write? The document is only ever
 * rasterized into the costume skin (no live DOM insertion), so the guard just
 * refuses the classic active bits: event handlers and hyperlink/resource refs.
 * @param {string} name - the attribute name.
 * @returns {boolean} true when the attribute may be written.
 */
const isSafeAttribute = name => {
    const lower = String(name).toLowerCase()
        .trim();
    if (lower.length === 0) return false;
    if (lower.startsWith('on')) return false;
    if (lower.includes('href')) return false;
    return true;
};

/**
 * Parse an element's `data-pivot="x y"` (or "x,y") authoring hint — the point a
 * part naturally turns around (a shoulder, an eyebrow's inner end).
 * @param {Element} element - the SVG element.
 * @returns {Array.<number>} [x, y], or [0, 0] when absent/unparseable.
 */
const parsePivot = element => {
    const raw = element.getAttribute && element.getAttribute('data-pivot');
    if (!raw) return [0, 0];
    const parts = String(raw).split(/[\s,]+/)
        .filter(s => s.length > 0);
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    return [isNaN(x) ? 0 : x, isNaN(y) ? 0 : y];
};

/**
 * Owns every temporarily-edited costume document for one runtime. One instance
 * lives on the runtime (see Runtime#getJsSvgManager).
 */
class JsSvgManager {
    /**
     * @param {Runtime} runtime - the VM runtime.
     * @param {object} [domGlobals] - injectable {DOMParser, XMLSerializer}
     *   constructors; defaults to the host globals (absent headless).
     */
    constructor (runtime, domGlobals) {
        this.runtime = runtime;
        /**
         * Edit records keyed by the costume object itself (costumes are shared
         * by a sprite and all its clones, so keying by object keys by skin).
         * Record: {costume, originalSvg, doc, elements, transforms, dirty}.
         * @type {Map.<object, object>}
         */
        this.records = new Map();
        this._dom = domGlobals || {
            DOMParser: typeof DOMParser === 'undefined' ? null : DOMParser,
            XMLSerializer: typeof XMLSerializer === 'undefined' ? null : XMLSerializer
        };
    }

    /**
     * @returns {boolean} whether a DOM implementation is available to edit with.
     */
    available () {
        return Boolean(this._dom.DOMParser && this._dom.XMLSerializer);
    }

    /**
     * The target's current costume, if it is a vector costume with an asset.
     * @param {Target} target - the rendered target.
     * @returns {?object} the costume, or null.
     */
    currentVectorCostume (target) {
        const costumes = (target && target.sprite && target.sprite.costumes) || [];
        const costume = costumes[target && target.currentCostume ? target.currentCostume : 0];
        if (!costume || !costume.asset) return null;
        if (String(costume.dataFormat).toLowerCase() !== 'svg') return null;
        return costume;
    }

    /**
     * Get (or lazily create, by parsing the costume asset's SVG source) the edit
     * record for the target's current costume.
     * @param {Target} target - the rendered target.
     * @returns {?object} the record, or null (not a vector costume / no DOM / bad parse).
     */
    ensure (target) {
        if (!this.available()) return null;
        const costume = this.currentVectorCostume(target);
        if (!costume) return null;
        let record = this.records.get(costume);
        if (record) return record;

        let source;
        try {
            source = costume.asset.decodeText();
        } catch (e) {
            return null;
        }
        const doc = new this._dom.DOMParser().parseFromString(source, 'image/svg+xml');
        const root = doc && doc.documentElement;
        // DOMParser reports XML errors as a <parsererror> document instead of throwing.
        if (!root || String(root.nodeName).toLowerCase() === 'parsererror') return null;

        record = {
            costume,
            originalSvg: source,
            doc,
            /** Lookup cache: element id -> element (the tree never gains/loses nodes). */
            elements: new Map(),
            /** Per-element transform slots: id -> {base, translate, rotate, scale}. */
            transforms: new Map(),
            dirty: false
        };
        this.records.set(costume, record);
        return record;
    }

    /**
     * Find an element by its id attribute (cached walk — works on any DOM).
     * @param {object} record - the edit record.
     * @param {string} id - the element id.
     * @returns {?Element} the element, or null.
     */
    findById (record, id) {
        if (record.elements.has(id)) return record.elements.get(id);
        let found = null;
        const walk = element => {
            if (found) return;
            if (element.getAttribute && element.getAttribute('id') === id) {
                found = element;
                return;
            }
            const children = element.children || [];
            for (let i = 0; i < children.length; i++) walk(children[i]);
        };
        walk(record.doc.documentElement);
        if (found) record.elements.set(id, found);
        return found;
    }

    /**
     * List every element id in the target's current costume document.
     * @param {Target} target - the rendered target.
     * @returns {Array.<string>} the ids, in document order.
     */
    listIds (target) {
        const record = this.ensure(target);
        if (!record) return [];
        const ids = [];
        const walk = element => {
            const id = element.getAttribute && element.getAttribute('id');
            if (id) ids.push(id);
            const children = element.children || [];
            for (let i = 0; i < children.length; i++) walk(children[i]);
        };
        walk(record.doc.documentElement);
        return ids;
    }

    /**
     * Replace an element's text content (e.g. a <text> or <tspan>).
     * @param {Target} target - the rendered target.
     * @param {string} id - the element id.
     * @param {string} text - the new text.
     */
    setText (target, id, text) {
        const record = this.ensure(target);
        const element = record && this.findById(record, id);
        if (!element) return;
        element.textContent = text;
        record.dirty = true;
    }

    /**
     * Set an attribute on an element (guarded — see isSafeAttribute).
     * @param {Target} target - the rendered target.
     * @param {string} id - the element id.
     * @param {string} name - the attribute name.
     * @param {string} value - the attribute value.
     */
    setAttribute (target, id, name, value) {
        if (!isSafeAttribute(name)) return;
        const record = this.ensure(target);
        const element = record && this.findById(record, id);
        if (!element) return;
        element.setAttribute(name, value);
        record.dirty = true;
    }

    /**
     * Read an attribute from an element.
     * @param {Target} target - the rendered target.
     * @param {string} id - the element id.
     * @param {string} name - the attribute name.
     * @returns {string} the value, or '' when absent.
     */
    getAttribute (target, id, name) {
        const record = this.ensure(target);
        const element = record && this.findById(record, id);
        if (!element) return '';
        const value = element.getAttribute(name);
        return value === null || typeof value === 'undefined' ? '' : String(value);
    }

    /**
     * Update one of an element's transform "slots" and rewrite its transform
     * attribute as: <authored transform> translate(...) rotate(...) scale(...).
     * The authored transform is captured on first touch so it is always kept.
     * Slots have SET semantics (calling again replaces, not accumulates), which
     * makes "turn the arm to (30 * sin of timer)" naturally animatable.
     * @param {Target} target - the rendered target.
     * @param {string} id - the element id.
     * @param {string} slot - 'translate' | 'rotate' | 'scale'.
     * @param {?Array.<number>} value - slot payload, or null to clear the slot.
     */
    setTransformSlot (target, id, slot, value) {
        const record = this.ensure(target);
        const element = record && this.findById(record, id);
        if (!element) return;
        let slots = record.transforms.get(id);
        if (!slots) {
            slots = {base: element.getAttribute('transform') || ''};
            record.transforms.set(id, slots);
        }
        slots[slot] = value;

        let out = slots.base;
        if (slots.translate) {
            out += ` translate(${slots.translate[0]} ${slots.translate[1]})`;
        }
        if (slots.rotate) {
            out += ` rotate(${slots.rotate[0]} ${slots.rotate[1]} ${slots.rotate[2]})`;
        }
        if (slots.scale) {
            // Scale about the pivot: shift the pivot to the origin and back.
            const [s, cx, cy] = slots.scale;
            out += ` translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`;
        }
        out = out.trim();
        if (out.length > 0) {
            element.setAttribute('transform', out);
        } else if (element.removeAttribute) {
            element.removeAttribute('transform');
        }
        record.dirty = true;
    }

    /**
     * Rotate an element to an absolute angle (degrees, clockwise) around a pivot.
     * @param {Target} target - the rendered target.
     * @param {string} id - the element id.
     * @param {number} degrees - the angle.
     * @param {?number} cx - pivot x, or null to use the element's data-pivot.
     * @param {?number} cy - pivot y, or null to use the element's data-pivot.
     */
    setRotate (target, id, degrees, cx, cy) {
        const record = this.ensure(target);
        const element = record && this.findById(record, id);
        if (!element) return;
        let pivotX = cx;
        let pivotY = cy;
        if (pivotX === null || typeof pivotX === 'undefined' ||
            pivotY === null || typeof pivotY === 'undefined') {
            [pivotX, pivotY] = parsePivot(element);
        }
        this.setTransformSlot(target, id, 'rotate', [degrees, pivotX, pivotY]);
    }

    /**
     * Offset an element from its authored position. dy is in Scratch orientation
     * (positive = up), so it is negated for SVG's y-down coordinates.
     * @param {Target} target - the rendered target.
     * @param {string} id - the element id.
     * @param {number} dx - horizontal offset (SVG units, positive = right).
     * @param {number} dy - vertical offset (positive = up).
     */
    setTranslate (target, id, dx, dy) {
        this.setTransformSlot(target, id, 'translate', [dx, -dy]);
    }

    /**
     * Scale an element about a pivot (data-pivot / origin when none given).
     * @param {Target} target - the rendered target.
     * @param {string} id - the element id.
     * @param {number} factor - the scale factor (1 = authored size).
     * @param {?number} cx - pivot x, or null to use the element's data-pivot.
     * @param {?number} cy - pivot y, or null to use the element's data-pivot.
     */
    setScale (target, id, factor, cx, cy) {
        const record = this.ensure(target);
        const element = record && this.findById(record, id);
        if (!element) return;
        let pivotX = cx;
        let pivotY = cy;
        if (pivotX === null || typeof pivotX === 'undefined' ||
            pivotY === null || typeof pivotY === 'undefined') {
            [pivotX, pivotY] = parsePivot(element);
        }
        this.setTransformSlot(target, id, 'scale', [factor, pivotX, pivotY]);
    }

    /**
     * Serialize a record's edited document to SVG text.
     * @param {object} record - the edit record.
     * @returns {string} the SVG source.
     */
    serialize (record) {
        return new this._dom.XMLSerializer().serializeToString(record.doc);
    }

    /**
     * Push SVG text to the costume's existing skin. Display only: the costume
     * asset and rotation center are untouched, so save/serialize never see this.
     * @param {object} record - the edit record.
     * @param {string} svgText - the SVG source to show.
     * @private
     */
    _upload (record, svgText) {
        const renderer = this.runtime.renderer;
        const costume = record.costume;
        if (!renderer || typeof costume.skinId !== 'number') return;
        try {
            renderer.updateSVGSkin(costume.skinId, svgText,
                [costume.rotationCenterX, costume.rotationCenterY]);
        } catch (e) {
            // Best effort: the skin may have been destroyed (costume/sprite deleted).
        }
    }

    /**
     * Upload every edited document that changed since the last frame. Called
     * once per step, just before the renderer draws.
     */
    flushDirty () {
        if (!this.runtime.renderer || this.records.size === 0) return;
        let drew = false;
        for (const record of this.records.values()) {
            if (!record.dirty) continue;
            this._upload(record, this.serialize(record));
            record.dirty = false;
            drew = true;
        }
        if (drew && this.runtime.requestRedraw) this.runtime.requestRedraw();
    }

    /**
     * Restore a record's skin to the costume's stored source and drop the record.
     * @param {object} record - the edit record.
     * @private
     */
    _restore (record) {
        this._upload(record, record.originalSvg);
        this.records.delete(record.costume);
    }

    /**
     * Put the target's current costume back exactly as stored.
     * @param {Target} target - the rendered target.
     */
    resetFor (target) {
        const costume = this.currentVectorCostume(target);
        const record = costume && this.records.get(costume);
        if (record) this._restore(record);
    }

    /**
     * Restore every edited costume (green flag / stop).
     */
    disposeAll () {
        for (const record of Array.from(this.records.values())) {
            this._restore(record);
        }
    }

    /**
     * Drop records for a disposed target's costumes WITHOUT restoring — the
     * sprite's skins are being destroyed with it. Clones share the original's
     * costumes, so only an original sprite's disposal drops anything.
     * @param {Target} target - the target being disposed.
     */
    disposeForTarget (target) {
        if (!target || !target.isOriginal || !target.sprite) return;
        for (const costume of target.sprite.costumes || []) {
            this.records.delete(costume);
        }
    }
}

/**
 * Install the `Scratch.svg` namespace onto the `Scratch` global. Every method
 * operates on the sprite's CURRENT costume and is a safe no-op when that costume
 * is not a vector (bitmap costumes have no SVG to edit).
 * @param {Interpreter} interp - the interpreter.
 * @param {object} Scratch - the pseudo `Scratch` object.
 * @param {object} ctx - {runtime, util, ...}.
 */
const install = (interp, Scratch, ctx) => {
    const manager = ctx.runtime.getJsSvgManager();
    const target = ctx.util.target;
    const native = v => interp.pseudoToNative(v);
    const str = v => Cast.toString(native(v));
    const num = v => Cast.toNumber(native(v));
    const optNum = v => {
        const value = native(v);
        return (value === null || typeof value === 'undefined') ? null : Cast.toNumber(value);
    };

    const svgObj = interp.nativeToPseudo({});
    interp.setProperty(Scratch, 'svg', svgObj);
    const def = (name, impl) => interp.setProperty(svgObj, name, interp.createNativeFunction(impl));

    def('isVector', () => Boolean(manager.currentVectorCostume(target)));
    def('ids', () => interp.nativeToPseudo(manager.listIds(target)));
    def('setText', (id, text) => manager.setText(target, str(id), str(text)));
    def('set', (id, name, value) => manager.setAttribute(target, str(id), str(name), str(value)));
    def('get', (id, name) => manager.getAttribute(target, str(id), str(name)));
    def('setFill', (id, color) => manager.setAttribute(target, str(id), 'fill', str(color)));
    def('setStroke', (id, color) => manager.setAttribute(target, str(id), 'stroke', str(color)));
    def('show', id => manager.setAttribute(target, str(id), 'display', 'inline'));
    def('hide', id => manager.setAttribute(target, str(id), 'display', 'none'));
    def('move', (id, dx, dy) => manager.setTranslate(target, str(id), num(dx), num(dy)));
    def('rotate', (id, degrees, cx, cy) =>
        manager.setRotate(target, str(id), num(degrees), optNum(cx), optNum(cy)));
    def('scale', (id, factor, cx, cy) =>
        manager.setScale(target, str(id), num(factor), optNum(cx), optNum(cy)));
    def('reset', () => manager.resetFor(target));
    def('update', () => manager.flushDirty());
};

module.exports = {
    JsSvgManager,
    install,
    isSafeAttribute
};
