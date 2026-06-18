/**
 * Per-block "running" highlight used only inside the Microworlds intro wizard.
 *
 * The standard execution feedback is the yellow stack outline applied by
 * scratch-blocks' `glowStack` (an SVG filter on the block group). This adds a
 * second cue *on top of* that outline: while a block is actually executing, a
 * soft white band sweeps across it — the "Sweep shimmer" study from the
 * "Block Run Highlights" design (treatment 05). A new coder sees which block is
 * running right now, with a sense of forward motion.
 *
 * Implementation notes:
 * - We sample the VM's threads each animation frame and read the block each
 *   active thread is currently on (`thread.blockGlowInFrame`, the same field the
 *   VM uses to compute script glows; `peekStack` as a fallback).
 * - Blockly blocks are SVG, so the shimmer can't be a CSS gradient on a `<path>`
 *   fill. Instead we overlay a copy of the block's own `<path>` (same `d`, so it
 *   is clipped to the exact block shape) and fill it with a `<linearGradient>`
 *   whose translucent-white band we slide across once per second. The overlay
 *   sits above the block background but below its label, so text stays readable.
 * - A faint `brightness(1.06)` on the block body matches the design.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

// One full left-to-right sweep per second.
const SWEEP_PERIOD_MS = 1000;
// Half-width of the white band, as a fraction of the block width (~50% total).
const BAND_HALF = 0.25;
// The band centre travels from -0.2 to 1.2 across one sweep, so it eases on and
// off the edges rather than popping in at 0 and out at 1.
const SWEEP_START = -0.2;
const SWEEP_SPAN = 1.4;
const BODY_BRIGHTNESS = 'brightness(1.06)';

export default class RunHighlighter {
    /**
     * @param {object} vm The Scratch VM, used to read currently-executing blocks.
     * @param {function():object} getWorkspace Returns the live Blockly workspace
     *     (passed as a thunk because the workspace can be recreated).
     */
    constructor (vm, getWorkspace) {
        this.vm = vm;
        this.getWorkspace = getWorkspace;
        this.running = false;
        this.rafId = null;
        // Map of blockId -> shimmer state ({path, overlay, gradient, stops, start}).
        this.active = new Map();
        this.gradientSeq = 0;
        this._tick = this._tick.bind(this);
    }

    /** Begin sampling and highlighting executing blocks. */
    start () {
        if (this.running) return;
        this.running = true;
        this.rafId = requestAnimationFrame(this._tick);
    }

    /** Stop sampling and remove every active highlight. */
    stop () {
        this.running = false;
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.clear();
    }

    /** Tear down all in-flight shimmers. */
    clear () {
        this.active.forEach(entry => this._end(entry));
        this.active.clear();
    }

    /** @returns {Set<string>} ids of blocks executing on the current frame. */
    _currentBlockIds () {
        const ids = new Set();
        const runtime = this.vm && this.vm.runtime;
        const threads = (runtime && runtime.threads) || [];
        for (const thread of threads) {
            const id = thread.blockGlowInFrame ||
                (typeof thread.peekStack === 'function' ? thread.peekStack() : null);
            if (id) ids.add(id);
        }
        return ids;
    }

    /**
     * @param {string} id The block id to look up.
     * @returns {?SVGElement} the background path for the block, or null.
     */
    _pathFor (id) {
        const workspace = this.getWorkspace && this.getWorkspace();
        if (!workspace) return null;
        const block = workspace.getBlockById(id);
        if (!block || typeof block.getSvgRoot !== 'function') return null;
        if (block.pathObject && block.pathObject.svgPath) return block.pathObject.svgPath;
        return block.getSvgRoot().querySelector(':scope > path.blocklyPath');
    }

    /** @returns {?SVGDefsElement} a `<defs>` in the workspace SVG, or null. */
    _defs () {
        const workspace = this.getWorkspace && this.getWorkspace();
        if (!workspace || typeof workspace.getParentSvg !== 'function') return null;
        const svg = workspace.getParentSvg();
        if (!svg) return null;
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS(SVG_NS, 'defs');
            svg.insertBefore(defs, svg.firstChild);
        }
        return defs;
    }

    /**
     * Build the shimmer overlay + gradient for a block.
     * @param {string} id The block id.
     * @returns {?object} the shimmer state, or null if it couldn't be built.
     */
    _begin (id) {
        const path = this._pathFor(id);
        if (!path || !path.parentNode) return null;
        const defs = this._defs();
        if (!defs) return null;

        const gid = `mw-shimmer-${this.gradientSeq++}`;
        const gradient = document.createElementNS(SVG_NS, 'linearGradient');
        gradient.setAttribute('id', gid);
        gradient.setAttribute('x1', '0');
        gradient.setAttribute('y1', '0');
        gradient.setAttribute('x2', '1');
        gradient.setAttribute('y2', '0');
        // Five stops: two fixed transparent anchors at the edges, and a moving
        // transparent → white → transparent band in between.
        const stops = [];
        const stopSpec = [
            {offset: 0, opacity: 0},
            {offset: 0, opacity: 0},
            {offset: 0, opacity: 0.6},
            {offset: 0, opacity: 0},
            {offset: 1, opacity: 0}
        ];
        for (const spec of stopSpec) {
            const stop = document.createElementNS(SVG_NS, 'stop');
            stop.setAttribute('offset', String(spec.offset));
            stop.setAttribute('stop-color', '#ffffff');
            stop.setAttribute('stop-opacity', String(spec.opacity));
            gradient.appendChild(stop);
            stops.push(stop);
        }
        defs.appendChild(gradient);

        const overlay = document.createElementNS(SVG_NS, 'path');
        overlay.setAttribute('d', path.getAttribute('d') || '');
        const transform = path.getAttribute('transform');
        if (transform) overlay.setAttribute('transform', transform);
        overlay.setAttribute('fill', `url(#${gid})`);
        overlay.setAttribute('pointer-events', 'none');
        overlay.setAttribute('class', 'mw-shimmer-overlay');
        // Above the block background, below the label/fields and child blocks.
        path.parentNode.insertBefore(overlay, path.nextSibling);

        path.style.filter = BODY_BRIGHTNESS;

        return {path, overlay, gradient, stops, start: performance.now()};
    }

    /**
     * Slide the white band across one block for the current frame.
     * @param {object} entry The shimmer state from `_begin`.
     * @param {number} now `performance.now()` for this frame.
     */
    _update (entry, now) {
        // The overlay can be destroyed by a Blockly re-render; bail if so.
        if (!entry.overlay.isConnected) return;
        const sweep = ((now - entry.start) / SWEEP_PERIOD_MS) % 1;
        const centre = SWEEP_START + (sweep * SWEEP_SPAN);
        const clamp = v => Math.max(0, Math.min(1, v));
        const lead = clamp(centre - BAND_HALF);
        const mid = Math.max(lead, clamp(centre));
        const tail = Math.max(mid, clamp(centre + BAND_HALF));
        entry.stops[1].setAttribute('offset', String(lead));
        entry.stops[2].setAttribute('offset', String(mid));
        entry.stops[3].setAttribute('offset', String(tail));
    }

    /**
     * Remove a block's shimmer overlay and restore its body.
     * @param {object} entry The shimmer state from `_begin`.
     */
    _end (entry) {
        if (entry.overlay && entry.overlay.parentNode) entry.overlay.parentNode.removeChild(entry.overlay);
        if (entry.gradient && entry.gradient.parentNode) entry.gradient.parentNode.removeChild(entry.gradient);
        if (entry.path) entry.path.style.filter = '';
    }

    _tick () {
        if (!this.running) return;
        const ids = this._currentBlockIds();
        const now = performance.now();

        // Remove shimmers for blocks that are no longer executing.
        this.active.forEach((entry, id) => {
            if (!ids.has(id)) {
                this._end(entry);
                this.active.delete(id);
            }
        });

        // Add shimmers for newly executing blocks.
        ids.forEach(id => {
            if (this.active.has(id)) return;
            const entry = this._begin(id);
            if (entry) this.active.set(id, entry);
        });

        // Advance every active shimmer.
        this.active.forEach(entry => this._update(entry, now));

        this.rafId = requestAnimationFrame(this._tick);
    }
}
