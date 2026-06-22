const Cast = require('../../util/cast');
const StageLayering = require('../../engine/stage-layering');

/**
 * @file The `Scratch.canvas` API: a writable RGBA pixel buffer that a JS-powered
 * block can draw into, rendered on the stage as its own drawable. It is a *new*
 * layer — the sprite's real costume is never read or mutated, so costume assets
 * round-trip through the project untouched.
 *
 * Ownership & lifecycle mirror `Scratch.data`: a canvas is private to its
 * (library, sprite) pair, lives in the runtime (never serialized), and is
 * disposed on green flag / stop, when its clone is deleted, or when its library
 * is removed. Writes only touch a CPU buffer; the buffer is uploaded to the GPU
 * at most once per frame (see flushDirty), so per-pixel writes never trigger a
 * per-pixel texture upload.
 */

/** Largest buffer dimension we will allocate, to bound memory and upload cost. */
const MAX_DIM = 512;
/** Default buffer size when a block draws before calling resize() — the stage. */
const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 360;

/**
 * Clamp a value to a byte (0–255 integer). Never throws.
 * @param {*} v - the (possibly non-numeric) value.
 * @returns {number} an integer 0–255.
 */
const toByte = v => {
    const n = Math.round(Cast.toNumber(v));
    return n < 0 ? 0 : (n > 255 ? 255 : n);
};

/**
 * Clamp a dimension to [1, MAX_DIM].
 * @param {*} v - the requested size.
 * @returns {number} an integer 1–MAX_DIM.
 */
const toDim = v => {
    const n = Math.round(Cast.toNumber(v));
    return n < 1 ? 1 : (n > MAX_DIM ? MAX_DIM : n);
};

/**
 * Parse an author-supplied color into [r, g, b, a] bytes. Accepts an
 * [r, g, b] / [r, g, b, a] array (0–255, alpha defaults to 255) or a hex string
 * ('#rgb' or '#rrggbb'). Returns null for anything unparseable.
 * @param {*} color - the color value (already converted from the sandbox).
 * @returns {?Array.<number>} [r, g, b, a] or null.
 */
const parseColor = color => {
    if (Array.isArray(color)) {
        if (color.length < 3) return null;
        return [toByte(color[0]), toByte(color[1]), toByte(color[2]),
            color.length > 3 ? toByte(color[3]) : 255];
    }
    if (typeof color === 'string') {
        let hex = color.trim();
        if (hex[0] === '#') hex = hex.slice(1);
        if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        if (hex.length === 6 && /^[0-9a-fA-F]{6}$/.test(hex)) {
            return [
                parseInt(hex.slice(0, 2), 16),
                parseInt(hex.slice(2, 4), 16),
                parseInt(hex.slice(4, 6), 16),
                255
            ];
        }
    }
    return null;
};

/**
 * Build bitmap data the renderer can upload. Uses a real ImageData in the browser
 * (what BitmapSkin expects); falls back to a plain {data, width, height} object
 * headless / under test, where there is no renderer to consume it anyway.
 * @param {Uint8ClampedArray} pixels - straight (non-premultiplied) RGBA bytes.
 * @param {number} width - buffer width.
 * @param {number} height - buffer height.
 * @returns {ImageData|object} bitmap data for createBitmapSkin / updateBitmapSkin.
 */
const makeImageData = (pixels, width, height) => {
    if (typeof ImageData !== 'undefined') {
        return new ImageData(pixels, width, height);
    }
    return {data: pixels, width, height};
};

/**
 * Owns every `Scratch.canvas` buffer for one runtime and brokers their renderer
 * resources. One instance lives on the runtime (see Runtime#getJsCanvasManager).
 */
class JsCanvasManager {
    /**
     * @param {Runtime} runtime - the VM runtime.
     */
    constructor (runtime) {
        this.runtime = runtime;
        /**
         * Canvas records keyed by "<libraryId>:<targetId>".
         * @type {Map.<string, object>}
         */
        this.canvases = new Map();
    }

    /**
     * @param {string} libraryId - the owning library id.
     * @param {Target} target - the sprite/clone that owns the canvas.
     * @returns {string} the composite map key.
     * @private
     */
    static _key (libraryId, target) {
        return `${libraryId}:${target && target.id}`;
    }

    /**
     * Get the canvas for a (library, target), creating a default-size, fully
     * transparent one if none exists yet. Buffer allocation needs no renderer.
     * @param {string} libraryId - the owning library id.
     * @param {Target} target - the owning target.
     * @returns {object} the canvas record.
     */
    ensure (libraryId, target) {
        const key = JsCanvasManager._key(libraryId, target);
        let canvas = this.canvases.get(key);
        if (!canvas) {
            canvas = {
                libraryId,
                targetId: target && target.id,
                width: DEFAULT_WIDTH,
                height: DEFAULT_HEIGHT,
                pixels: new Uint8ClampedArray(DEFAULT_WIDTH * DEFAULT_HEIGHT * 4),
                skinId: null,
                drawableID: null,
                dirty: true,
                visible: true,
                x: 0,
                y: 0
            };
            this.canvases.set(key, canvas);
        }
        return canvas;
    }

    /**
     * Resize (and clear) a canvas's buffer. A no-op for the renderer until the
     * next flush, which re-uploads at the new size.
     * @param {object} canvas - the canvas record.
     * @param {number} width - requested width.
     * @param {number} height - requested height.
     */
    resize (canvas, width, height) {
        const w = toDim(width);
        const h = toDim(height);
        if (w === canvas.width && h === canvas.height) {
            canvas.pixels.fill(0);
        } else {
            canvas.width = w;
            canvas.height = h;
            canvas.pixels = new Uint8ClampedArray(w * h * 4);
        }
        canvas.dirty = true;
    }

    /**
     * Upload one canvas's buffer to the renderer, creating its skin + drawable on
     * first flush. No-op when there is no renderer (headless / server-side).
     * @param {object} canvas - the canvas record.
     * @private
     */
    _flush (canvas) {
        const renderer = this.runtime.renderer;
        if (!renderer) return;
        const data = makeImageData(canvas.pixels, canvas.width, canvas.height);
        if (canvas.skinId === null) {
            // Resolution 1: one buffer pixel == one stage unit (the pen/video model).
            canvas.skinId = renderer.createBitmapSkin(data, 1);
            canvas.drawableID = renderer.createDrawable(StageLayering.SPRITE_LAYER);
            renderer.updateDrawableSkinId(canvas.drawableID, canvas.skinId);
            renderer.updateDrawablePosition(canvas.drawableID, [canvas.x, canvas.y]);
            renderer.updateDrawableVisible(canvas.drawableID, canvas.visible);
        } else {
            renderer.updateBitmapSkin(canvas.skinId, data, 1);
        }
        canvas.dirty = false;
    }

    /**
     * Upload every canvas whose buffer changed since the last frame. Called once
     * per step, just before the renderer draws.
     */
    flushDirty () {
        if (!this.runtime.renderer || this.canvases.size === 0) return;
        let drew = false;
        for (const canvas of this.canvases.values()) {
            if (canvas.dirty) {
                this._flush(canvas);
                drew = true;
            }
        }
        if (drew && this.runtime.requestRedraw) this.runtime.requestRedraw();
    }

    /**
     * Destroy a single canvas's renderer resources and drop the record.
     * @param {string} key - the map key.
     * @param {object} canvas - the canvas record.
     * @private
     */
    _dispose (key, canvas) {
        const renderer = this.runtime.renderer;
        if (renderer && canvas.drawableID !== null) {
            try {
                renderer.destroyDrawable(canvas.drawableID, StageLayering.SPRITE_LAYER);
                renderer.destroySkin(canvas.skinId);
            } catch (e) {
                // Best effort: the drawable/skin may already be gone.
            }
        }
        this.canvases.delete(key);
    }

    /**
     * Dispose every canvas (green flag / stop).
     */
    disposeAll () {
        for (const [key, canvas] of Array.from(this.canvases.entries())) {
            this._dispose(key, canvas);
        }
    }

    /**
     * Dispose the canvases belonging to one target (e.g. a deleted clone).
     * @param {string} targetId - the target's id.
     */
    disposeForTarget (targetId) {
        for (const [key, canvas] of Array.from(this.canvases.entries())) {
            if (canvas.targetId === targetId) this._dispose(key, canvas);
        }
    }

    /**
     * Dispose the canvases belonging to one library (e.g. on uninstall).
     * @param {string} libraryId - the library id.
     */
    disposeForLibrary (libraryId) {
        for (const [key, canvas] of Array.from(this.canvases.entries())) {
            if (canvas.libraryId === libraryId) this._dispose(key, canvas);
        }
    }
}

/**
 * Install the `Scratch.canvas` namespace onto the `Scratch` global. Every method
 * resolves this (library, sprite)'s own canvas; pixel coordinates are (0, 0) at
 * the top-left, matching image data.
 * @param {Interpreter} interp - the interpreter.
 * @param {object} Scratch - the pseudo `Scratch` object.
 * @param {object} ctx - {runtime, library, util, ...}.
 */
const install = (interp, Scratch, ctx) => {
    const manager = ctx.runtime.getJsCanvasManager();
    const libraryId = ctx.library.id;
    const target = ctx.util.target;
    const native = v => interp.pseudoToNative(v);
    const num = v => Cast.toNumber(native(v));

    const canvasObj = interp.nativeToPseudo({});
    interp.setProperty(Scratch, 'canvas', canvasObj);
    const def = (name, impl) => interp.setProperty(canvasObj, name, interp.createNativeFunction(impl));

    /**
     * Resolve this call's canvas record.
     * @returns {object} the canvas record.
     */
    const canvas = () => manager.ensure(libraryId, target);

    /**
     * Write one pixel into the buffer (no bounds error; out-of-range is ignored).
     * @param {object} c - the canvas record.
     * @param {number} x - column, 0-based from the left.
     * @param {number} y - row, 0-based from the top.
     * @param {Array.<number>} rgba - [r, g, b, a] bytes.
     */
    const putPixel = (c, x, y, rgba) => {
        if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
        const i = ((y * c.width) + x) * 4;
        c.pixels[i] = rgba[0];
        c.pixels[i + 1] = rgba[1];
        c.pixels[i + 2] = rgba[2];
        c.pixels[i + 3] = rgba[3];
    };

    def('resize', (w, h) => manager.resize(canvas(), num(w), num(h)));
    def('width', () => canvas().width);
    def('height', () => canvas().height);

    def('setPixel', (x, y, color) => {
        const rgba = parseColor(native(color));
        if (!rgba) return;
        const c = canvas();
        putPixel(c, Math.floor(num(x)), Math.floor(num(y)), rgba);
        c.dirty = true;
    });

    def('getPixel', (x, y) => {
        const c = canvas();
        const px = Math.floor(num(x));
        const py = Math.floor(num(y));
        if (px < 0 || py < 0 || px >= c.width || py >= c.height) {
            return interp.nativeToPseudo([0, 0, 0, 0]);
        }
        const i = ((py * c.width) + px) * 4;
        return interp.nativeToPseudo([c.pixels[i], c.pixels[i + 1], c.pixels[i + 2], c.pixels[i + 3]]);
    });

    def('fill', color => {
        const rgba = parseColor(native(color));
        if (!rgba) return;
        const c = canvas();
        const px = c.pixels;
        for (let i = 0; i < px.length; i += 4) {
            px[i] = rgba[0];
            px[i + 1] = rgba[1];
            px[i + 2] = rgba[2];
            px[i + 3] = rgba[3];
        }
        c.dirty = true;
    });

    def('clear', () => {
        const c = canvas();
        c.pixels.fill(0);
        c.dirty = true;
    });

    def('write', flat => {
        const arr = native(flat);
        if (!Array.isArray(arr)) return;
        const c = canvas();
        const px = c.pixels;
        const len = Math.min(arr.length, px.length);
        for (let i = 0; i < len; i++) px[i] = toByte(arr[i]);
        c.dirty = true;
    });

    def('update', () => {
        canvas().dirty = true;
        manager.flushDirty();
    });

    def('goToXY', (x, y) => {
        const c = canvas();
        c.x = num(x);
        c.y = num(y);
        const renderer = ctx.runtime.renderer;
        if (renderer && c.drawableID !== null) {
            renderer.updateDrawablePosition(c.drawableID, [c.x, c.y]);
        }
    });

    def('show', () => {
        const c = canvas();
        c.visible = true;
        const renderer = ctx.runtime.renderer;
        if (renderer && c.drawableID !== null) renderer.updateDrawableVisible(c.drawableID, true);
    });
    def('hide', () => {
        const c = canvas();
        c.visible = false;
        const renderer = ctx.runtime.renderer;
        if (renderer && c.drawableID !== null) renderer.updateDrawableVisible(c.drawableID, false);
    });

    def('goToFront', () => {
        const c = canvas();
        const renderer = ctx.runtime.renderer;
        if (renderer && c.drawableID !== null) {
            renderer.setDrawableOrder(c.drawableID, Infinity, StageLayering.SPRITE_LAYER);
        }
    });
    def('goToBack', () => {
        const c = canvas();
        const renderer = ctx.runtime.renderer;
        if (renderer && c.drawableID !== null) {
            renderer.setDrawableOrder(c.drawableID, -Infinity, StageLayering.SPRITE_LAYER, false);
        }
    });
};

module.exports = {
    JsCanvasManager,
    install,
    parseColor,
    MAX_DIM
};
