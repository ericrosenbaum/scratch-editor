const THREE = require('three');
const Clone = require('../../util/clone');
const StageLayering = require('../../engine/stage-layering');

/**
 * Key under which a target's Pop-Up state is stored.
 * @type {string}
 */
const STATE_KEY = 'Scratch.popup';

/**
 * Default per-target Pop-Up state.
 *   thickness - how far the drawing is extruded (in stage units).
 *   depth     - where along the in/out axis the object sits (stage units; + = into the page).
 * @type {object}
 */
const DEFAULT_STATE = {
    thickness: 20,
    depth: 0
};

/**
 * Get (creating if needed) the Pop-Up state for a target.
 * @param {Target} target - the target to read state from.
 * @returns {object} the mutable Pop-Up state.
 */
const getPopupState = target => {
    let state = target.getCustomState(STATE_KEY);
    if (!state) {
        state = Clone.simple(DEFAULT_STATE);
        target.setCustomState(STATE_KEY, state);
    }
    return state;
};

// The 3D scene is rendered to an offscreen canvas at twice the stage resolution
// (the stage is 480x360 in Scratch units), so it stays crisp when composited back
// onto the stage as a bitmap skin with bitmapResolution 2.
const CANVAS_W = 960;
const CANVAS_H = 720;
const BITMAP_RES = 2;
// Fallback edge colour (only used by the box fallback for degenerate costumes).
const EDGE_COLOR = 0x9966cc;
// Silhouette edges are tinted from the costume and darkened by this factor.
const EDGE_SHADE = 0.78;
// The Scratch stage size, in stage units.
const STAGE_W = 480;
const STAGE_H = 360;
// How far behind the sprites the backdrop "back wall" sits, in stage units.
const WALL_Z = -160;
// Camera orbit: distance, default height, and the (gentle) auto-spin speed.
const CAM_RADIUS = 520;
const CAM_HEIGHT = 150;
const AUTO_SPIN = 0.006;
// Drag sensitivity: radians per stage-x unit, and height per stage-y unit.
const DRAG_ROT = 0.008;
const DRAG_HEIGHT = 0.6;
const DRAG_HEIGHT_RANGE = {min: -40, max: 340};
// Costumes are rasterized to an alpha mask (capped to this size) to extract the
// silhouette outline. This works identically for bitmap and vector costumes.
const MASK_MAX = 160;
const ALPHA_THRESHOLD = 16;
// Maximum number of persistent 3D stamps; the oldest is dropped past this.
const MAX_STAMPS = 300;

/**
 * Sky presets: vertical gradient colour stops (top -> bottom). Values are part of
 * the saved project format via the menu, so add new ones but never rename these.
 * @type {Object<string, Array<string>>}
 */
const SKY = {
    day: ['#7ec8ff', '#cdeeff', '#ffffff'],
    sunset: ['#3a1d62', '#ff7e5f', '#ffd194'],
    night: ['#00010a', '#0b1230', '#243b6b'],
    space: ['#000000', '#06010f', '#140a2e'],
    underwater: ['#013a5e', '#0277a8', '#79d6e6'],
    cave: ['#070707', '#1b1b22', '#3a3742'],
    dream: ['#ffd1f5', '#ddc6ff', '#c2e7ff'],
    storybook: ['#f7e8c4', '#f1d6a2', '#e6bd84']
};

/**
 * Manages a self-contained three.js scene that turns the current sprites into
 * extruded "pop-up" objects and orbits a perspective camera around them. The
 * backdrop becomes a back wall and an optional sky sits behind it. The rendered
 * frame is pushed back onto the Scratch stage as a bitmap skin on a drawable that
 * sits on top of the (hidden) 2D sprites, so no changes to scratch-render are
 * required.
 *
 * All browser-only work (three.js, canvases, requestAnimationFrame) is guarded so
 * the extension is safe to load in a headless VM (e.g. unit tests), where it
 * simply does nothing.
 */
class PopupScene {
    constructor (runtime) {
        this.runtime = runtime;
        this.inited = false;
        this.active = false;

        this._raf = null;

        // Camera state: 'front' (flat 2D), 'orbit' (auto-spin), or 'drag' (drag to spin).
        this._mode = 'front';
        this._angle = 0;
        this._camHeight = CAM_HEIGHT;
        this._dragging = false;
        this._lastDragX = 0;
        this._lastDragY = 0;

        // targetId -> {group, materials, texture, costumeId, thickness, loadToken}
        this._meshes = new Map();

        this._wall = null;
        this._wallCostumeId = null;

        // Persistent stamps: [{group, meshes, materials, textures}].
        this._stamps = [];

        this._skyPreset = null;

        this._skinId = -1;
        this._drawableId = -1;

        this._frame = this._frame.bind(this);
    }

    get _renderer () {
        return this.runtime.renderer;
    }

    /**
     * @returns {boolean} true if the browser APIs needed for 3D are available.
     */
    _canUse () {
        return Boolean(
            this._renderer &&
            typeof document !== 'undefined' &&
            typeof requestAnimationFrame !== 'undefined'
        );
    }

    /**
     * Lazily create the three.js renderer, scene, camera and the Scratch-side
     * drawable/skin used to composite the result. Mirrors how the pen extension
     * lazily creates its skin on first use.
     */
    _init () {
        if (this.inited || !this._canUse()) return;

        this._glCanvas = document.createElement('canvas');
        this._glCanvas.width = CANVAS_W;
        this._glCanvas.height = CANVAS_H;

        this._three = new THREE.WebGLRenderer({
            canvas: this._glCanvas,
            alpha: true,
            antialias: true
        });
        this._three.setSize(CANVAS_W, CANVAS_H, false);
        this._three.setClearColor(0x000000, 0);

        this._scene = new THREE.Scene();
        this._camera = new THREE.PerspectiveCamera(45, CANVAS_W / CANVAS_H, 1, 5000);

        this._texLoader = new THREE.TextureLoader();

        // scratch-render's bitmap skins read pixels via a 2D context, which a WebGL
        // canvas can't provide, so we blit the three.js output onto this 2D canvas.
        this._copyCanvas = document.createElement('canvas');
        this._copyCanvas.width = CANVAS_W;
        this._copyCanvas.height = CANVAS_H;
        this._copyCtx = this._copyCanvas.getContext('2d', {willReadFrequently: true});

        // The bitmap is full-stage; omit the rotation center so the skin defaults to
        // a centred anchor (in stage units), which fills the stage exactly.
        const renderer = this._renderer;
        this._skinId = renderer.createBitmapSkin(this._copyCanvas, BITMAP_RES);
        this._drawableId = renderer.createDrawable(StageLayering.SPRITE_LAYER);
        renderer.updateDrawableSkinId(this._drawableId, this._skinId);
        renderer.setDrawableOrder(this._drawableId, Infinity, StageLayering.SPRITE_LAYER);
        renderer.updateDrawableVisible(this._drawableId, false);

        this.inited = true;

        if (this._skyPreset) this._applySky(this._skyPreset);
    }

    /**
     * Set the camera mode.
     * @param {string} mode - 'front' (flat 2D), 'orbit' (auto-spin), or 'drag'
     *   (drag the stage to spin). Anything that isn't 'front'/'orbit' is treated
     *   as 'drag', the default.
     */
    setMode (mode) {
        if (mode === 'front') {
            this._mode = 'front';
            this.stop();
            return;
        }
        this._mode = mode === 'orbit' ? 'orbit' : 'drag';
        this.start();
    }

    /**
     * Enter 3D: hide the flat sprites, show the 3D layer and start animating.
     */
    start () {
        this._init();
        if (!this.inited) return;
        this.active = true;
        this._dragging = false;
        this._hideSprites(true);
        this._renderer.updateDrawableVisible(this._drawableId, true);
        if (this._raf === null) {
            this._raf = requestAnimationFrame(this._frame);
        }
    }

    /**
     * Return to the flat 2D view: stop animating, hide the 3D layer, restore sprites.
     */
    stop () {
        this.active = false;
        if (this._raf !== null) {
            cancelAnimationFrame(this._raf);
            this._raf = null;
        }
        if (this.inited) {
            this._renderer.updateDrawableVisible(this._drawableId, false);
        }
        this._hideSprites(false);
        if (this._renderer) this.runtime.requestRedraw();
    }

    /**
     * Choose the sky behind the scene.
     * @param {string} preset - one of the SKY keys.
     */
    setSky (preset) {
        this._skyPreset = preset;
        this._init();
        if (this.inited) this._applySky(preset);
    }

    /**
     * Build the sky gradient and use it as the scene background.
     * @param {string} preset - one of the SKY keys.
     * @private
     */
    _applySky (preset) {
        const stops = SKY[preset] || SKY.day;
        const c = document.createElement('canvas');
        c.width = 8;
        c.height = 256;
        const ctx = c.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        for (let i = 0; i < stops.length; i++) {
            grad.addColorStop(i / (stops.length - 1), stops[i]);
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 8, 256);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        if (this._scene.background && this._scene.background.dispose) {
            this._scene.background.dispose();
        }
        this._scene.background = tex;
        this.runtime.requestRedraw();
    }

    /**
     * Hide or restore the 2D drawables of every (non-stage) sprite. The stage
     * backdrop is left alone so the flat view is untouched when we return to it.
     * @param {boolean} hide - true to hide sprites, false to restore them.
     */
    _hideSprites (hide) {
        for (const target of this.runtime.targets) {
            if (target.isStage) continue;
            const id = target.drawableID;
            if (typeof id === 'number' && id >= 0) {
                this._renderer.updateDrawableVisible(id, hide ? false : target.visible);
            }
        }
    }

    /**
     * The per-frame animation step.
     */
    _frame () {
        this._raf = null;
        if (!this.active || !this.inited) return;

        this._ensureBackWall();
        this._syncMeshes();
        this._updateCamera();
        this._three.render(this._scene, this._camera);

        this._copyCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        this._copyCtx.drawImage(this._glCanvas, 0, 0);
        this._renderer.updateBitmapSkin(this._skinId, this._copyCanvas, BITMAP_RES);
        this.runtime.requestRedraw();

        this._raf = requestAnimationFrame(this._frame);
    }

    /**
     * Position the camera: auto-spin in 'orbit' mode, or follow stage drags in
     * 'drag' mode. Always looks at the centre of the stage.
     */
    _updateCamera () {
        if (this._mode === 'orbit') {
            this._angle += AUTO_SPIN;
        } else if (this._mode === 'drag') {
            this._applyDrag();
        }
        this._camera.position.set(
            Math.sin(this._angle) * CAM_RADIUS,
            this._camHeight,
            Math.cos(this._angle) * CAM_RADIUS
        );
        this._camera.lookAt(0, 0, 0);
    }

    /**
     * In drag mode, orbit the camera by how far the pointer is dragged across the
     * stage (read from the VM's mouse device, so no DOM access is needed).
     * @private
     */
    _applyDrag () {
        const mouse = this.runtime.ioDevices && this.runtime.ioDevices.mouse;
        if (!mouse) return;
        if (mouse.getIsDown()) {
            const x = mouse.getScratchX();
            const y = mouse.getScratchY();
            if (this._dragging) {
                this._angle -= (x - this._lastDragX) * DRAG_ROT;
                this._camHeight = Math.max(
                    DRAG_HEIGHT_RANGE.min,
                    Math.min(DRAG_HEIGHT_RANGE.max, this._camHeight + ((y - this._lastDragY) * DRAG_HEIGHT))
                );
            }
            this._dragging = true;
            this._lastDragX = x;
            this._lastDragY = y;
        } else {
            this._dragging = false;
        }
    }

    /**
     * Create or refresh the back wall from the stage's current backdrop.
     * @private
     */
    _ensureBackWall () {
        const stage = this.runtime.getTargetForStage ?
            this.runtime.getTargetForStage() :
            this.runtime.targets.find(t => t.isStage);
        if (!stage) return;

        const costume = stage.getCostumes()[stage.currentCostume];
        const id = costume && costume.assetId;
        if (this._wallCostumeId === id) return;
        this._wallCostumeId = id;

        if (this._wall) {
            this._scene.remove(this._wall);
            this._wall.geometry.dispose();
            if (this._wall.material.map) this._wall.material.map.dispose();
            this._wall.material.dispose();
            this._wall = null;
        }
        if (!costume || !costume.asset) return;

        let uri;
        try {
            uri = costume.asset.encodeDataURI();
        } catch {
            return;
        }
        this._texLoader.load(uri, tex => {
            if (this._wallCostumeId !== id || !this.inited) {
                tex.dispose();
                return;
            }
            tex.colorSpace = THREE.SRGBColorSpace;
            // Backdrops fill the stage, so the wall is always stage-sized. Double-sided
            // so it stays visible (doesn't vanish) when the camera orbits behind it.
            const wall = new THREE.Mesh(
                new THREE.PlaneGeometry(STAGE_W, STAGE_H),
                new THREE.MeshBasicMaterial({map: tex, transparent: true, side: THREE.DoubleSide})
            );
            wall.position.z = WALL_Z;
            this._wall = wall;
            this._scene.add(wall);
            this.runtime.requestRedraw();
        });
    }

    /**
     * Reconcile the three.js meshes with the current set of sprites: create meshes
     * for new targets, update their transforms, and remove meshes for gone targets.
     */
    _syncMeshes () {
        const seen = new Set();
        for (const target of this.runtime.targets) {
            if (target.isStage) continue;
            seen.add(target.id);
            this._ensureMesh(target);
        }
        for (const [id, entry] of this._meshes) {
            if (!seen.has(id)) {
                this._disposeEntry(entry);
                this._meshes.delete(id);
            }
        }
    }

    /**
     * Ensure a mesh exists for the target and matches its current costume, thickness,
     * position, depth, size and visibility.
     * @param {Target} target - the sprite to represent.
     */
    _ensureMesh (target) {
        const state = getPopupState(target);
        let entry = this._meshes.get(target.id);
        if (!entry) {
            entry = {
                group: new THREE.Group(),
                materials: [],
                textures: [],
                costumeId: null,
                thickness: -1,
                loadToken: 0
            };
            this._scene.add(entry.group);
            this._meshes.set(target.id, entry);
        }

        const costume = target.getCostumes()[target.currentCostume];
        const costumeId = costume && costume.assetId;
        if (entry.costumeId !== costumeId || entry.thickness !== state.thickness) {
            entry.costumeId = costumeId;
            entry.thickness = state.thickness;
            this._buildMeshContent(entry, target, costume, state.thickness);
        }

        const scale = (Number.isFinite(target.size) ? target.size : 100) / 100;
        // +depth means "into the page" (away from the camera, which sits at +z).
        entry.group.position.set(target.x || 0, target.y || 0, -(state.depth || 0));
        entry.group.scale.set(scale, scale, 1);

        // Apply the sprite's direction, honouring its rotation style. "all around"
        // rotates in the wall plane (about z); "left-right" flips to face the other
        // way (about y); "don't rotate" stays upright.
        const dir = Number.isFinite(target.direction) ? target.direction : 90;
        const style = target.rotationStyle;
        let rotY = 0;
        let rotZ = 0;
        if (style === 'left-right') {
            if (Math.sin(dir * (Math.PI / 180)) < 0) rotY = Math.PI;
        } else if (style !== "don't rotate") {
            rotZ = (90 - dir) * (Math.PI / 180);
        }
        entry.group.rotation.set(0, rotY, rotZ);

        entry.group.visible = target.visible !== false;
    }

    /**
     * (Re)build a target's extruded geometry from its costume.
     * @param {object} entry - the mesh bookkeeping entry.
     * @param {Target} target - the sprite.
     * @param {object} costume - the current costume.
     * @param {number} thickness - extrusion depth in stage units.
     */
    _buildMeshContent (entry, target, costume, thickness) {
        this._clearGroup(entry);
        if (!costume || !costume.asset) return;

        let dataURI;
        try {
            dataURI = costume.asset.encodeDataURI();
        } catch {
            return;
        }

        const token = ++entry.loadToken;
        this._texLoader.load(dataURI, tex => {
            // A newer rebuild (or a disposed target) may have superseded this load.
            if (entry.loadToken !== token || !this._meshes.has(target.id)) {
                tex.dispose();
                return;
            }
            tex.colorSpace = THREE.SRGBColorSpace;
            const res = costume.bitmapResolution || 1;
            const w = ((tex.image && tex.image.width) || 100) / res;
            const h = ((tex.image && tex.image.height) || 100) / res;

            let built = false;
            try {
                built = this._applySilhouette(entry, tex, thickness, w, h);
            } catch {
                built = false;
            }
            if (!built) this._applyBox(entry, w, h, thickness, tex);
            this.runtime.requestRedraw();
        });
    }

    /**
     * Build a silhouette extrusion by rasterizing the costume to an alpha mask and
     * extruding the outline of all non-transparent areas. The drawing is textured
     * onto two faces (front & back); the side walls follow the alpha boundary and
     * get a coloured edge. Works the same for bitmap and vector costumes.
     * @param {object} entry - the mesh bookkeeping entry.
     * @param {THREE.Texture} tex - the costume texture (its image is rasterized).
     * @param {number} thickness - extrusion depth.
     * @param {number} w - display width in stage units.
     * @param {number} h - display height in stage units.
     * @returns {boolean} true if the silhouette was built.
     * @private
     */
    _applySilhouette (entry, tex, thickness, w, h) {
        const built = this._buildExtrudedMeshes(tex, thickness, w, h);
        if (!built) return false;
        for (const mesh of built.meshes) entry.group.add(mesh);
        entry.materials = built.materials;
        entry.textures = built.textures;
        return true;
    }

    /**
     * Build the meshes for a silhouette extrusion (side walls + front/back faces)
     * from a costume texture. Reused for both live sprites and stamps.
     * @param {THREE.Texture} tex - the costume texture (its image is rasterized).
     * @param {number} thickness - extrusion depth.
     * @param {number} w - display width in stage units.
     * @param {number} h - display height in stage units.
     * @returns {?{meshes: THREE.Mesh[], materials: THREE.Material[], textures: THREE.Texture[]}}
     *   the built resources, or null if the costume has no opaque pixels.
     * @private
     */
    _buildExtrudedMeshes (tex, thickness, w, h) {
        const img = tex.image;
        if (!img || !img.width || !img.height) return null;

        // Rasterize the costume into an alpha mask.
        const scale = Math.min(1, MASK_MAX / Math.max(img.width, img.height));
        const mw = Math.max(1, Math.round(img.width * scale));
        const mh = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement('canvas');
        c.width = mw;
        c.height = mh;
        const ctx = c.getContext('2d', {willReadFrequently: true});
        ctx.drawImage(img, 0, 0, mw, mh);

        let pixels;
        try {
            pixels = ctx.getImageData(0, 0, mw, mh).data;
        } catch {
            return null;
        }
        const mask = new Uint8Array(mw * mh);
        let any = false;
        for (let i = 0; i < mw * mh; i++) {
            if (pixels[(i * 4) + 3] > ALPHA_THRESHOLD) {
                mask[i] = 1;
                any = true;
            }
        }
        if (!any) return null;

        const th = Math.max(thickness, 0.01);

        // Side walls along the alpha boundary, coloured from the costume's own pixels.
        const edgeMat = new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.DoubleSide});
        const sideMesh = new THREE.Mesh(this._buildSideGeometry(mask, pixels, mw, mh, w, h, th), edgeMat);

        // Front face: the drawing, masked to its own silhouette via alphaTest.
        const faceMat = new THREE.MeshBasicMaterial({map: tex, transparent: true, alphaTest: 0.05});
        const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat);
        front.position.z = th / 2;

        // Back face: same drawing, but mirrored horizontally so that (combined with
        // facing the other way) it reads the right way round from behind.
        const backTex = tex.clone();
        backTex.colorSpace = THREE.SRGBColorSpace;
        backTex.wrapS = THREE.RepeatWrapping;
        backTex.repeat.x = -1;
        backTex.offset.x = 1;
        backTex.needsUpdate = true;
        const backMat = new THREE.MeshBasicMaterial({map: backTex, transparent: true, alphaTest: 0.05});
        const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), backMat);
        back.position.z = -th / 2;
        back.rotation.y = Math.PI;

        return {
            meshes: [sideMesh, front, back],
            materials: [edgeMat, faceMat, backMat],
            textures: [tex, backTex]
        };
    }

    /**
     * Build the side-wall geometry by emitting a quad on every exposed edge of the
     * alpha mask (an opaque pixel next to a transparent one), spanning the thickness.
     * Each quad is tinted with the costume's colour at that pixel (slightly darkened),
     * so the extruded edge matches the drawing rather than a fixed colour.
     * @param {Uint8Array} mask - 1 = opaque, 0 = transparent.
     * @param {Uint8ClampedArray} pixels - RGBA pixel data of the rasterized costume.
     * @param {number} mw - mask width in pixels.
     * @param {number} mh - mask height in pixels.
     * @param {number} w - display width in stage units.
     * @param {number} h - display height in stage units.
     * @param {number} th - extrusion depth.
     * @returns {THREE.BufferGeometry} the side-wall geometry.
     * @private
     */
    _buildSideGeometry (mask, pixels, mw, mh, w, h, th) {
        const pos = [];
        const col = [];
        const halfT = th / 2;
        const sx = w / mw;
        const sy = h / mh;
        const xAt = mx => (mx * sx) - (w / 2);
        const yAt = my => (h / 2) - (my * sy);
        const opaque = (x, y) => x >= 0 && y >= 0 && x < mw && y < mh && mask[(y * mw) + x] === 1;
        const tmp = new THREE.Color();
        let cr = 0;
        let cg = 0;
        let cb = 0;
        const wall = (ax, ay, bx, by) => {
            pos.push(ax, ay, -halfT, bx, by, -halfT, bx, by, halfT);
            pos.push(ax, ay, -halfT, bx, by, halfT, ax, ay, halfT);
            for (let k = 0; k < 6; k++) col.push(cr, cg, cb);
        };
        for (let my = 0; my < mh; my++) {
            for (let mx = 0; mx < mw; mx++) {
                const idx = (my * mw) + mx;
                if (mask[idx] !== 1) continue;
                // Convert the costume's sRGB pixel to linear and darken it a touch so
                // the edge reads as a shaded side.
                tmp.setRGB(pixels[idx * 4] / 255, pixels[(idx * 4) + 1] / 255, pixels[(idx * 4) + 2] / 255,
                    THREE.SRGBColorSpace);
                cr = tmp.r * EDGE_SHADE;
                cg = tmp.g * EDGE_SHADE;
                cb = tmp.b * EDGE_SHADE;
                if (!opaque(mx - 1, my)) wall(xAt(mx), yAt(my), xAt(mx), yAt(my + 1));
                if (!opaque(mx + 1, my)) wall(xAt(mx + 1), yAt(my), xAt(mx + 1), yAt(my + 1));
                if (!opaque(mx, my - 1)) wall(xAt(mx), yAt(my), xAt(mx + 1), yAt(my));
                if (!opaque(mx, my + 1)) wall(xAt(mx), yAt(my + 1), xAt(mx + 1), yAt(my + 1));
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        return geo;
    }

    /**
     * Fallback for bitmap costumes (or if extrusion fails): a thin textured slab.
     * @param {object} entry - the mesh bookkeeping entry.
     * @param {number} w - native costume width in stage units.
     * @param {number} h - native costume height in stage units.
     * @param {number} thickness - extrusion depth.
     * @param {THREE.Texture} tex - the loaded costume texture.
     * @private
     */
    _applyBox (entry, w, h, thickness, tex) {
        const depth = Math.max(thickness, 0.01);
        const geo = new THREE.BoxGeometry(w, h, depth);
        const face = new THREE.MeshBasicMaterial({map: tex, transparent: true, alphaTest: 0.05});
        const edge = new THREE.MeshBasicMaterial({color: EDGE_COLOR});
        entry.materials = [face, edge];
        entry.textures = [tex];

        // BoxGeometry material group order: +x, -x, +y, -y, +z (front), -z (back).
        const mesh = new THREE.Mesh(geo, [edge, edge, edge, edge, face, face]);
        entry.group.add(mesh);
    }

    /**
     * Drop a persistent, independent copy of a sprite's extruded shape into the
     * scene at the sprite's current position, depth, size and thickness (the pen
     * "stamp" model). Stamps don't move with the sprite and survive until cleared.
     * @param {Target} target - the sprite to stamp.
     */
    stampThreeD (target) {
        this._init();
        if (!this.inited) return;

        const costume = target.getCostumes()[target.currentCostume];
        if (!costume || !costume.asset) return;

        let uri;
        try {
            uri = costume.asset.encodeDataURI();
        } catch {
            return;
        }

        // Freeze the sprite's current transform at stamp time.
        const state = getPopupState(target);
        const px = target.x || 0;
        const py = target.y || 0;
        const pz = -(state.depth || 0);
        const scale = (Number.isFinite(target.size) ? target.size : 100) / 100;
        const thickness = state.thickness;
        const res = costume.bitmapResolution || 1;

        this._texLoader.load(uri, tex => {
            if (!this.inited) {
                tex.dispose();
                return;
            }
            tex.colorSpace = THREE.SRGBColorSpace;
            const w = ((tex.image && tex.image.width) || 100) / res;
            const h = ((tex.image && tex.image.height) || 100) / res;
            const built = this._buildExtrudedMeshes(tex, thickness, w, h);
            if (!built) {
                tex.dispose();
                return;
            }
            const group = new THREE.Group();
            for (const mesh of built.meshes) group.add(mesh);
            group.position.set(px, py, pz);
            group.scale.set(scale, scale, 1);
            this._scene.add(group);

            this._stamps.push({group, meshes: built.meshes, materials: built.materials, textures: built.textures});
            while (this._stamps.length > MAX_STAMPS) {
                this._disposeStamp(this._stamps.shift());
            }
            this.runtime.requestRedraw();
        });
    }

    /**
     * Remove every stamp from the scene (pairs with stampThreeD, like pen's clear).
     */
    clearStamps () {
        for (const stamp of this._stamps) {
            this._disposeStamp(stamp);
        }
        this._stamps = [];
        if (this._renderer) this.runtime.requestRedraw();
    }

    /**
     * Dispose of one stamp's resources.
     * @param {object} stamp - a stamp bookkeeping entry.
     * @private
     */
    _disposeStamp (stamp) {
        if (this._scene) this._scene.remove(stamp.group);
        for (const mesh of stamp.meshes) {
            if (mesh.geometry) mesh.geometry.dispose();
        }
        for (const mat of stamp.materials) {
            if (mat && mat.dispose) mat.dispose();
        }
        for (const tex of stamp.textures) {
            if (tex && tex.dispose) tex.dispose();
        }
    }

    /**
     * Dispose of a mesh entry's GPU resources (geometry, materials, texture).
     * @param {object} entry - the mesh bookkeeping entry.
     */
    _clearGroup (entry) {
        for (let i = entry.group.children.length - 1; i >= 0; i--) {
            const child = entry.group.children[i];
            entry.group.remove(child);
            if (child.geometry) child.geometry.dispose();
        }
        for (const mat of entry.materials) {
            if (mat && mat.dispose) mat.dispose();
        }
        entry.materials = [];
        for (const tex of entry.textures) {
            if (tex && tex.dispose) tex.dispose();
        }
        entry.textures = [];
    }

    /**
     * Fully dispose of a target's group.
     * @param {object} entry - the mesh bookkeeping entry.
     */
    _disposeEntry (entry) {
        this._clearGroup(entry);
        if (entry.group) this._scene.remove(entry.group);
    }

    /**
     * Tear everything down (called when the runtime is disposed).
     */
    dispose () {
        this.stop();
        this.clearStamps();
        for (const entry of this._meshes.values()) {
            this._disposeEntry(entry);
        }
        this._meshes.clear();
        if (this._wall) {
            this._scene.remove(this._wall);
            this._wall.geometry.dispose();
            if (this._wall.material.map) this._wall.material.map.dispose();
            this._wall.material.dispose();
            this._wall = null;
        }
        this._wallCostumeId = null;
        if (this.inited) {
            if (this._drawableId >= 0) this._renderer.destroyDrawable(this._drawableId, StageLayering.SPRITE_LAYER);
            if (this._skinId >= 0) this._renderer.destroySkin(this._skinId);
            if (this._scene && this._scene.background && this._scene.background.dispose) {
                this._scene.background.dispose();
            }
            if (this._three) this._three.dispose();
        }
        this._drawableId = -1;
        this._skinId = -1;
        this.inited = false;
    }
}

module.exports = {
    PopupScene,
    getPopupState,
    STATE_KEY,
    DEFAULT_STATE,
    SKY
};
