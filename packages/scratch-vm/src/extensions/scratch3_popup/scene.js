const THREE = require('three');
const Clone = require('../../util/clone');
const StageLayering = require('../../engine/stage-layering');

// Shared +z axis, used as the normal of the (backdrop-parallel) sprite-drag plane.
const VEC_Z = new THREE.Vector3(0, 0, 1);

// Degrees -> radians.
const DEG = Math.PI / 180;

// Monotonic id used to give every effect-patched material a unique program cache key.
// three.js's default cache key is `onBeforeCompile.toString()`, which is identical for
// all of our patched materials; without a unique key they would share one compiled
// program (and so one set of effect uniforms), making every sprite show the same effect.
let effectMaterialSeq = 0;

/**
 * Key under which a target's Pop-Up state is stored.
 * @type {string}
 */
const STATE_KEY = 'Scratch.popup';

/**
 * Default per-target Pop-Up state.
 *   thickness - how far the drawing is extruded (in stage units).
 *   depth     - where along the in/out axis the object sits (stage units; + = into the page).
 *   tilt      - rotation about the X axis (degrees), tipping the card forward/back.
 *   spin      - rotation about the Y axis (degrees), turning the card left/right.
 * @type {object}
 */
const DEFAULT_STATE = {
    thickness: 20,
    depth: 0,
    tilt: 0,
    spin: 0
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
    // Backfill keys added after a project may have been saved with older state.
    if (!Number.isFinite(state.tilt)) state.tilt = 0;
    if (!Number.isFinite(state.spin)) state.spin = 0;
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
// Over-the-shoulder camera: sits closer and lower than the orbit camera, behind the
// sprite, and turns to look along the sprite's heading with its own (slower) ease so
// a snap turn (e.g. `spin to 180`) swings the view around smoothly. The heading is
// the card's face normal, so from directly behind the camera sees the card's (whole)
// back face — the character stays readable while the view looks down its line of
// travel.
const SHOULDER_RADIUS = 300;
const SHOULDER_HEIGHT = 90;
const SHOULDER_TURN_HALFLIFE = 0.3;
// Follow-camera smoothing: the half-life (in seconds) of the exponential ease applied to
// the camera's focus point. A sprite that teleports/jumps is then tracked with a smooth
// glide rather than a snap. Frame-rate independent (see _updateCamera); lower = snappier.
const CAM_SMOOTH_HALFLIFE = 0.12;
// Drag sensitivity: radians per stage-x unit, and height per stage-y unit.
const DRAG_ROT = 0.008;
const DRAG_HEIGHT = 0.6;
const DRAG_HEIGHT_RANGE = {min: -40, max: 340};
// A press-and-release that moves less than this (in stage units) counts as a click
// (fires the sprite's "when this sprite clicked" hat) rather than a drag.
const CLICK_THRESHOLD = 6;
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

// GLSL injected into the costume materials to reproduce Scratch's graphic effects in
// 3D. Declarations + helper functions go at the top of the fragment shader; the body
// runs just after the colour-space conversion (so it operates in gamma space, like
// scratch-render). Only ghost, brightness and colour are supported; the helper
// functions are ported verbatim from scratch-render's sprite.frag.
const EFFECT_SHADER_HEADER = `
uniform float u_ghost;
uniform float u_brightness;
uniform float u_color;
const float popupEps = 1e-3;
vec3 popupRGB2HSV (vec3 rgb) {
    const vec4 hueOffsets = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 temp1 = rgb.b > rgb.g ? vec4(rgb.bg, hueOffsets.wz) : vec4(rgb.gb, hueOffsets.xy);
    vec4 temp2 = rgb.r > temp1.x ? vec4(rgb.r, temp1.yzx) : vec4(temp1.xyw, rgb.r);
    float m = min(temp2.y, temp2.w);
    float c = temp2.x - m;
    return vec3(abs(temp2.z + (temp2.w - temp2.y) / (6.0 * c + popupEps)), c / (temp2.x + popupEps), temp2.x);
}
vec3 popupHue2RGB (float hue) {
    float r = abs(hue * 6.0 - 3.0) - 1.0;
    float g = 2.0 - abs(hue * 6.0 - 2.0);
    float b = 2.0 - abs(hue * 6.0 - 4.0);
    return clamp(vec3(r, g, b), 0.0, 1.0);
}
vec3 popupHSV2RGB (vec3 hsv) {
    vec3 rgb = popupHue2RGB(hsv.x);
    float c = hsv.z * hsv.y;
    return (rgb * c) + hsv.z - c;
}
`;
const EFFECT_SHADER_BODY = `
{
#ifdef POPUP_COLOR_BRIGHT
    if (u_color != 0.0) {
        vec3 hsv = popupRGB2HSV(gl_FragColor.rgb);
        const float minLightness = 0.11 / 2.0;
        const float minSaturation = 0.09;
        if (hsv.z < minLightness) hsv = vec3(0.0, 1.0, minLightness);
        else if (hsv.y < minSaturation) hsv = vec3(0.0, minSaturation, hsv.z);
        hsv.x = mod(hsv.x + u_color, 1.0);
        if (hsv.x < 0.0) hsv.x += 1.0;
        gl_FragColor.rgb = popupHSV2RGB(hsv);
    }
    gl_FragColor.rgb = clamp(gl_FragColor.rgb + vec3(u_brightness), vec3(0.0), vec3(1.0));
#endif
    gl_FragColor.a *= u_ghost;
}
`;

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

        // Camera state: 'front' (flat 2D), 'orbit' (auto-spin), 'drag' (drag to spin),
        // 'follow' (orbit a chosen sprite and translate with it; see _followName), or
        // 'shoulder' (stay behind the chosen sprite, looking along its spin heading).
        this._mode = 'front';
        this._followName = null; // sprite name the 'follow'/'shoulder' camera tracks
        this._angle = 0;
        this._camHeight = CAM_HEIGHT;
        this._lastDragX = 0;
        this._lastDragY = 0;
        // Smoothed focus point the camera orbits and looks at, eased toward _focusPoint()
        // each frame (starts at the stage centre). _clock supplies frame-rate-independent
        // dt for that ease; it's created with the renderer in _init (browser only).
        this._focus = new THREE.Vector3(0, 0, 0);
        this._clock = null;

        // Pointer interaction: a raycaster for hit-testing sprites, reusable scratch
        // objects, and the per-gesture state machine driven by _handlePointer.
        this._raycaster = new THREE.Raycaster();
        this._ndc = new THREE.Vector2();
        this._dragPlane = new THREE.Plane();
        this._dragHit = new THREE.Vector3();
        this._dragOffset = new THREE.Vector2();
        this._pointerDown = false; // previous frame's mouse-down state (edge detection)
        this._gesture = null; // null | 'camera' | 'sprite'
        this._dragTarget = null; // Target currently being sprite-dragged
        this._pressTarget = null; // Target the press landed on (for click detection)
        this._pressX = 0;
        this._pressY = 0;

        // targetId -> {group, materials, texture, costumeId, thickness, loadToken}
        this._meshes = new Map();

        this._wall = null;
        this._wallCostumeId = null;
        // Whether the backdrop is shown as a 3D back wall. When false the sky shows
        // through behind the sprites instead.
        this._wallVisible = true;

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
        this._clock = new THREE.Clock();

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
     * Enter 'follow' camera mode: the camera keeps the named sprite centred, orbiting
     * around it (drag empty space to spin) and translating with it as it moves, so the
     * sprite stays framed wherever it goes. Falls back to the stage centre whenever the
     * sprite is missing.
     * @param {string} name - the sprite to follow.
     */
    followSprite (name) {
        this._followName = name;
        this._mode = 'follow';
        this.start();
    }

    /**
     * Enter 'shoulder' (over-the-shoulder) camera mode: the camera stays behind the
     * named sprite and looks the way the sprite faces, so turning the sprite (its spin
     * heading) turns the view to look along the axis it is about to move on. The
     * camera translates with the sprite like the 'follow' camera; unlike 'follow',
     * its orbit angle is driven by the sprite's heading rather than by dragging.
     * @param {string} name - the sprite to sit behind.
     */
    shoulderSprite (name) {
        this._followName = name;
        this._mode = 'shoulder';
        this.start();
    }

    /**
     * Enter 3D: hide the flat sprites, show the 3D layer and start animating.
     */
    start () {
        this._init();
        if (!this.inited) return;
        this.active = true;
        this._pointerDown = false;
        this._endGesture();
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
        // Release any in-progress sprite drag and reset the pointer state machine.
        this._endGesture();
        this._pointerDown = false;
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
     * Show or hide the backdrop "back wall". When hidden, the sky (or transparency)
     * shows through behind the sprites instead of the stage backdrop.
     * @param {boolean} visible - true to show the wall, false to hide it.
     */
    setWallVisible (visible) {
        this._wallVisible = visible !== false;
        if (this._wall) this._wall.visible = this._wallVisible;
        if (this._renderer) this.runtime.requestRedraw();
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

        // Re-hide every sprite's flat 2D drawable each frame so the 2D and 3D views are
        // never shown at once. start() only hides the sprites present when we entered 3D;
        // doing it per-frame also covers sprites shown via `show`, and clones created,
        // while already in 3D (both make their 2D drawable visible again).
        this._hideSprites(true);
        this._ensureBackWall();
        this._syncMeshes();
        this._handlePointer();
        this._updateCamera();
        this._refreshBubbles();
        this._three.render(this._scene, this._camera);

        this._copyCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        this._copyCtx.drawImage(this._glCanvas, 0, 0);
        this._renderer.updateBitmapSkin(this._skinId, this._copyCanvas, BITMAP_RES);
        this.runtime.requestRedraw();

        this._raf = requestAnimationFrame(this._frame);
    }

    /**
     * Position the camera: auto-spin in 'orbit' mode. The 'drag'/'follow' orbit is driven
     * by _handlePointer (so it can yield to sprite dragging). The camera orbits and looks
     * at a smoothed focus point — easing toward the followed sprite in 'follow' mode, else
     * the stage centre — so in 'follow' it stays a fixed offset from the sprite and tracks
     * it as it moves.
     *
     * The focus is eased with frame-rate-independent exponential smoothing (half-life form:
     * t = 1 - 2^(-dt / halfLife)), the standard way to damp a follow camera so a sprite that
     * teleports or is flung is tracked with a glide instead of a snap (cf. Freya Holmer,
     * "Lerp smoothing is broken"). Only the focus is smoothed; the orbit angle/height stay
     * direct so dragging the view remains crisp. dt is clamped so a long pause (e.g. a
     * backgrounded tab) can't produce one giant jump.
     */
    _updateCamera () {
        if (this._mode === 'orbit') {
            this._angle += AUTO_SPIN;
        }
        const dt = this._clock ? Math.min(this._clock.getDelta(), 0.1) : 1 / 60;
        if (this._mode === 'shoulder') {
            // Turn the orbit angle toward the sprite's heading yaw (shortest way
            // around), with its own ease so snap turns swing the view smoothly.
            const yaw = this._shoulderYaw();
            if (yaw !== null) {
                const turn = 1 - Math.pow(2, -dt / SHOULDER_TURN_HALFLIFE);
                const tau = 2 * Math.PI;
                const delta = (((((yaw - this._angle) + Math.PI) % tau) + tau) % tau) - Math.PI;
                this._angle += delta * turn;
            }
        }
        const t = 1 - Math.pow(2, -dt / CAM_SMOOTH_HALFLIFE);
        const target = this._focusPoint();
        this._focus.x += (target.x - this._focus.x) * t;
        this._focus.y += (target.y - this._focus.y) * t;
        this._focus.z += (target.z - this._focus.z) * t;
        const shoulder = this._mode === 'shoulder';
        const radius = shoulder ? SHOULDER_RADIUS : CAM_RADIUS;
        const height = shoulder ? SHOULDER_HEIGHT : this._camHeight;
        this._camera.position.set(
            this._focus.x + (Math.sin(this._angle) * radius),
            this._focus.y + height,
            this._focus.z + (Math.cos(this._angle) * radius)
        );
        this._camera.lookAt(this._focus.x, this._focus.y, this._focus.z);
    }

    /**
     * The orbit angle that puts the camera directly behind the followed sprite,
     * looking along its heading (the ground-plane component of its forward vector).
     * The camera's position offset from the focus is (sin(angle), cos(angle)) * r,
     * so "behind" means the offset opposes the heading: angle = atan2(-f.x, -f.z).
     * @returns {?number} the target yaw in radians, or null when there is no sprite
     *   to follow or its heading points straight up/down (keep the current yaw).
     * @private
     */
    _shoulderYaw () {
        if (!this._followName) return null;
        const target = this.runtime.getSpriteTargetByName(this._followName);
        if (!target) return null;
        const f = this.forwardVector(target);
        if (Math.hypot(f.x, f.z) < 1e-6) return null;
        return Math.atan2(-f.x, -f.z);
    }

    /**
     * The point the camera orbits and looks at: the followed sprite's 3D position in
     * 'follow'/'shoulder' mode, or the stage centre otherwise. Prefers the built mesh
     * group's position, falling back to the sprite's 2D coords + depth before its mesh
     * exists (e.g. the first frame after entering 3D), and to the centre if the sprite
     * is gone. Safe to call headless.
     * @returns {{x: number, y: number, z: number}} the focus point in world space.
     * @private
     */
    _focusPoint () {
        if ((this._mode === 'follow' || this._mode === 'shoulder') && this._followName) {
            const target = this.runtime.getSpriteTargetByName(this._followName);
            if (target) {
                const entry = this._meshes.get(target.id);
                if (entry) {
                    const p = entry.group.position;
                    return {x: p.x, y: p.y, z: p.z};
                }
                return {x: target.x || 0, y: target.y || 0, z: -(getPopupState(target).depth || 0)};
            }
        }
        return {x: 0, y: 0, z: 0};
    }

    /**
     * Per-frame pointer state machine, read from the VM's mouse device (no DOM).
     * A press on a sprite grabs it (drag it in a plane parallel to the backdrop), just
     * like dragging a sprite on the 2D stage in the editor; a press on empty space in
     * 'drag'/'follow' mode orbits the camera instead. A press-and-release that barely moves fires
     * the sprite's "when this sprite clicked" hat. Sprite drag and camera orbit are
     * mutually exclusive within one gesture, so orbiting still works whenever the press
     * misses every sprite. Sprite click/drag work in both 'orbit' and 'drag'.
     *
     * Dragging is allowed for any sprite, not just `draggable` ones: this extension runs
     * in the editor, whose 2D stage (useEditorDragStyle) likewise lets you drag any
     * sprite regardless of its drag mode. The `draggable` flag only gates dragging in the
     * fullscreen player, which the VM can't distinguish here.
     * @private
     */
    _handlePointer () {
        const mouse = this.runtime.ioDevices && this.runtime.ioDevices.mouse;
        if (!mouse) return;
        const down = mouse.getIsDown();
        const sx = mouse.getScratchX();
        const sy = mouse.getScratchY();

        if (down && !this._pointerDown) {
            // Press edge: decide the gesture.
            const hit = this._raycastTarget(sx, sy);
            this._pressTarget = hit ? hit.target : null;
            this._pressX = sx;
            this._pressY = sy;
            if (hit) {
                this._beginSpriteDrag(hit.target, sx, sy);
            } else if (this._mode === 'drag' || this._mode === 'follow') {
                this._gesture = 'camera';
                this._lastDragX = sx;
                this._lastDragY = sy;
            } else {
                this._gesture = null;
            }
        } else if (down && this._pointerDown) {
            // Held: advance the active gesture.
            if (this._gesture === 'sprite' && this._dragTarget) {
                this._dragSpriteTo(sx, sy);
            } else if (this._gesture === 'camera') {
                this._orbitBy(sx, sy);
            }
        } else if (!down && this._pointerDown) {
            // Release edge: a barely-moved press on a sprite counts as a click.
            const moved = Math.hypot(sx - this._pressX, sy - this._pressY);
            if (this._pressTarget && moved < CLICK_THRESHOLD) {
                this.runtime.startHats('event_whenthisspriteclicked', null, this._pressTarget);
            }
            this._endGesture();
        }

        this._pointerDown = down;
    }

    /**
     * Cast a ray from the stage-space pointer through the camera and return the nearest
     * visible sprite hit (mapped back to its Target), or null.
     * @param {number} sx - pointer x in Scratch units (-240..240).
     * @param {number} sy - pointer y in Scratch units (-180..180, up positive).
     * @returns {?{target: Target, point: THREE.Vector3}} the nearest hit, or null.
     * @private
     */
    _raycastTarget (sx, sy) {
        // Scratch coords map straight to NDC; the camera's 4:3 aspect matches the stage.
        this._ndc.set(sx / 240, sy / 180);
        this._raycaster.setFromCamera(this._ndc, this._camera);
        const groups = [];
        for (const entry of this._meshes.values()) {
            if (entry.group.visible) groups.push(entry.group);
        }
        const hits = this._raycaster.intersectObjects(groups, true);
        for (const h of hits) {
            let obj = h.object;
            while (obj && typeof obj.userData.targetId === 'undefined') obj = obj.parent;
            if (!obj) continue;
            const target = this.runtime.targets.find(t => t.id === obj.userData.targetId);
            if (target) return {target, point: h.point};
        }
        return null;
    }

    /**
     * Begin dragging a sprite. The drag is constrained to a plane parallel to the
     * backdrop through the sprite's current depth, so depth stays fixed.
     * @param {Target} target - the sprite being grabbed.
     * @param {number} sx - pointer x in Scratch units.
     * @param {number} sy - pointer y in Scratch units.
     * @private
     */
    _beginSpriteDrag (target, sx, sy) {
        this._gesture = 'sprite';
        this._dragTarget = target;
        const entry = this._meshes.get(target.id);
        const z = entry ? entry.group.position.z : 0; // = -(depth)
        // Plane with normal +z through world-z = z: normal·p + constant = 0 => constant = -z.
        this._dragPlane.set(VEC_Z, -z);
        this._ndc.set(sx / 240, sy / 180);
        this._raycaster.setFromCamera(this._ndc, this._camera);
        if (this._raycaster.ray.intersectPlane(this._dragPlane, this._dragHit)) {
            this._dragOffset.set(target.x - this._dragHit.x, target.y - this._dragHit.y);
        } else {
            this._dragOffset.set(0, 0);
        }
        target.startDrag();
    }

    /**
     * Move the dragged sprite to follow the pointer within its drag plane.
     * @param {number} sx - pointer x in Scratch units.
     * @param {number} sy - pointer y in Scratch units.
     * @private
     */
    _dragSpriteTo (sx, sy) {
        this._ndc.set(sx / 240, sy / 180);
        this._raycaster.setFromCamera(this._ndc, this._camera);
        if (this._raycaster.ray.intersectPlane(this._dragPlane, this._dragHit)) {
            // force=true so the move bypasses the dragging guard in setXY.
            this._dragTarget.setXY(
                this._dragHit.x + this._dragOffset.x,
                this._dragHit.y + this._dragOffset.y,
                true
            );
        }
    }

    /**
     * Orbit the camera by how far the pointer moved since the last frame (the same
     * sensitivity as before; just gated by the 'camera' gesture now).
     * @param {number} sx - pointer x in Scratch units.
     * @param {number} sy - pointer y in Scratch units.
     * @private
     */
    _orbitBy (sx, sy) {
        this._angle -= (sx - this._lastDragX) * DRAG_ROT;
        this._camHeight = Math.max(
            DRAG_HEIGHT_RANGE.min,
            Math.min(DRAG_HEIGHT_RANGE.max, this._camHeight + ((sy - this._lastDragY) * DRAG_HEIGHT))
        );
        this._lastDragX = sx;
        this._lastDragY = sy;
    }

    /**
     * End the current pointer gesture, releasing any dragged sprite.
     * @private
     */
    _endGesture () {
        if (this._dragTarget) this._dragTarget.stopDrag();
        this._dragTarget = null;
        this._pressTarget = null;
        this._gesture = null;
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
            wall.visible = this._wallVisible;
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
                effectUniforms: null,
                costumeId: null,
                thickness: -1,
                loadToken: 0
            };
            // Tag the group so a raycast hit can be mapped back to its target.
            entry.group.userData.targetId = target.id;
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

        // Orient the card from the sprite's direction + rotation style and the Pop-Up
        // tilt/spin (see _orientation). Shared with forwardVector so "move in 3D" always
        // travels the way the card faces (its front-face normal).
        const o = this._orientation(target, state);
        entry.group.rotation.set(o.x, o.y, o.z);

        entry.group.visible = target.visible !== false;

        this._applyEffects(entry, target);
    }

    /**
     * Compute the card's 3D orientation as Euler angles (radians, in three.js 'XYZ'
     * order). The sprite's `direction` is honoured per its rotation style: "all around"
     * rotates in the wall plane (about z); "left-right" flips to face the other way
     * (about y); "don't rotate" stays upright. On top of that the Pop-Up tilt (about x)
     * and spin (about y) rotate the card in 3D. This is the single source of truth for
     * both the rendered mesh (_ensureMesh) and the movement heading (forwardVector).
     * @param {Target} target - the sprite.
     * @param {object} state - the sprite's Pop-Up state.
     * @returns {{x: number, y: number, z: number}} Euler angles in radians.
     * @private
     */
    _orientation (target, state) {
        const dir = Number.isFinite(target.direction) ? target.direction : 90;
        const style = target.rotationStyle;
        let flipY = 0;
        let rotZ = 0;
        if (style === 'left-right') {
            if (Math.sin(dir * DEG) < 0) flipY = Math.PI;
        } else if (style !== "don't rotate") {
            rotZ = (90 - dir) * DEG;
        }
        return {
            x: (state.tilt || 0) * DEG, // about x (tilt)
            y: flipY + ((state.spin || 0) * DEG), // about y (left-right flip + spin)
            z: rotZ // about z (direction, "all around")
        };
    }

    /**
     * The unit vector the card FACES in world space — its local +z (the front-face
     * normal), rotated by the card's full 3D orientation. At rest (no spin/tilt) this
     * is +z: out of the page, toward the camera and away from the backdrop, so `move
     * ... steps in 3D` carries the sprite forward along the depth axis. Spin (yaw)
     * steers the heading left/right, tilt pitches it up/down, and a left-right flip
     * turns it around; `direction` (rotation within the card's own plane) leaves the
     * heading unchanged. Built from the same orientation as the rendered mesh, so
     * movement always goes the way the card faces. Safe to call headless.
     * @param {Target} target - the sprite to read orientation from.
     * @returns {THREE.Vector3} the world-space heading direction (unit length).
     */
    forwardVector (target) {
        const o = this._orientation(target, getPopupState(target));
        return new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(o.x, o.y, o.z, 'XYZ'));
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
        entry.effectUniforms = built.effectUniforms;
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

        // Graphic effects: full colour/brightness/ghost on the textured faces, ghost
        // only on the (vertex-coloured) side walls.
        const edgeFx = this._patchEffectMaterial(edgeMat, false);
        const faceFx = this._patchEffectMaterial(faceMat, true);
        const backFx = this._patchEffectMaterial(backMat, true);

        return {
            meshes: [sideMesh, front, back],
            materials: [edgeMat, faceMat, backMat],
            textures: [tex, backTex],
            effectUniforms: [edgeFx, faceFx, backFx]
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
     * Give a material live ghost/brightness/color uniforms by injecting GLSL via
     * onBeforeCompile, and return the shared uniforms object (also stashed on the
     * material). Updating a uniform's `.value` later takes effect immediately.
     * @param {THREE.Material} material - the material to patch.
     * @param {boolean} withColorBright - true for textured faces (color + brightness +
     *   ghost); false for the side walls (ghost only).
     * @returns {object} the {u_ghost, u_brightness, u_color} uniforms object.
     * @private
     */
    _patchEffectMaterial (material, withColorBright) {
        const uniforms = {
            u_ghost: {value: 1},
            u_brightness: {value: 0},
            u_color: {value: 0}
        };
        material.transparent = true; // ghost fades via alpha
        material.userData.popupUniforms = uniforms;
        material.onBeforeCompile = shader => {
            shader.uniforms.u_ghost = uniforms.u_ghost;
            shader.uniforms.u_brightness = uniforms.u_brightness;
            shader.uniforms.u_color = uniforms.u_color;
            const define = withColorBright ? '#define POPUP_COLOR_BRIGHT\n' : '';
            const body = `#include <colorspace_fragment>${EFFECT_SHADER_BODY}`;
            const patched = shader.fragmentShader.replace('#include <colorspace_fragment>', body);
            shader.fragmentShader = `${define}${EFFECT_SHADER_HEADER}${patched}`;
        };
        // A unique cache key per material so each compiles its own program and keeps its
        // own effect uniforms (see effectMaterialSeq above).
        const cacheKey = `popup${effectMaterialSeq++}`;
        material.customProgramCacheKey = () => cacheKey;
        material.needsUpdate = true;
        return uniforms;
    }

    /**
     * Convert a target's Scratch effect values to the shader uniform values (matching
     * scratch-render's ShaderManager conversions). Only ghost, brightness and colour
     * are used.
     * @param {object} effects - a target's effects object (may be undefined).
     * @returns {{ghost: number, brightness: number, color: number}} uniform values.
     * @private
     */
    _effectValues (effects) {
        const fx = effects || {};
        const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
        return {
            ghost: 1 - (clamp(fx.ghost || 0, 0, 100) / 100),
            brightness: clamp(fx.brightness || 0, -100, 100) / 100,
            color: ((((fx.color || 0) / 200) % 1) + 1) % 1
        };
    }

    /**
     * Push a target's current graphic effects into its patched materials.
     * @param {object} entry - the mesh bookkeeping entry.
     * @param {Target} target - the sprite whose effects to read.
     * @private
     */
    _applyEffects (entry, target) {
        if (!entry.effectUniforms) return;
        const v = this._effectValues(target.effects);
        for (const u of entry.effectUniforms) {
            if (!u) continue;
            u.u_ghost.value = v.ghost;
            u.u_brightness.value = v.brightness;
            u.u_color.value = v.color;
        }
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
        const faceFx = this._patchEffectMaterial(face, true);
        const edgeFx = this._patchEffectMaterial(edge, false);
        entry.effectUniforms = [faceFx, edgeFx];

        // BoxGeometry material group order: +x, -x, +y, -y, +z (front), -z (back).
        const mesh = new THREE.Mesh(geo, [edge, edge, edge, edge, face, face]);
        entry.group.add(mesh);
    }

    /**
     * Drop a persistent, independent copy of a sprite's extruded shape into the
     * scene at the sprite's current position, depth, size, thickness and 3D orientation
     * (the pen "stamp" model). Stamps don't move with the sprite and survive until
     * cleared.
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
        const orient = this._orientation(target, state);

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
            // Freeze the sprite's current graphic effects onto the stamp.
            const fx = this._effectValues(target.effects);
            for (const u of built.effectUniforms) {
                if (!u) continue;
                u.u_ghost.value = fx.ghost;
                u.u_brightness.value = fx.brightness;
                u.u_color.value = fx.color;
            }
            const group = new THREE.Group();
            for (const mesh of built.meshes) group.add(mesh);
            group.position.set(px, py, pz);
            group.scale.set(scale, scale, 1);
            group.rotation.set(orient.x, orient.y, orient.z);
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
     * Speech-bubble anchor bounds for a target: its 3D mesh's bounding box projected
     * through the 3D camera into stage coordinates. Mirrors the 2D renderer's
     * getBoundsForBubble, whose bounds cover just the top slice of the sprite (the
     * bubble hangs above it): left/right span the whole projected box, top is its
     * projected crown, and bottom sits a small slice below. Returns null while the
     * 3D view is inactive, when the target has no mesh yet, or when it is behind
     * the camera — the caller then falls back to the target's 2D bounds.
     * @param {Target} target - the target that wants to show a bubble.
     * @returns {?{left: number, right: number, top: number, bottom: number}}
     *   anchor bounds in stage coordinates, or null.
     */
    bubbleBounds (target) {
        if (!this.active || !this.inited || !this._camera) return null;
        const entry = this._meshes.get(target.id);
        if (!entry || !entry.group.visible) return null;
        const box = new THREE.Box3().setFromObject(entry.group);
        if (box.isEmpty()) return null;

        this._camera.updateMatrixWorld();
        // Behind the camera the projection flips and is meaningless: bail out.
        const centre = box.getCenter(new THREE.Vector3());
        if (centre.applyMatrix4(this._camera.matrixWorldInverse).z >= 0) return null;

        let left = Infinity;
        let right = -Infinity;
        let top = -Infinity;
        const v = new THREE.Vector3();
        for (let i = 0; i < 8; i++) {
            v.set(
                (i & 1) === 0 ? box.min.x : box.max.x,
                (i & 2) === 0 ? box.min.y : box.max.y,
                (i & 4) === 0 ? box.min.z : box.max.z
            );
            v.project(this._camera);
            left = Math.min(left, v.x * (STAGE_W / 2));
            right = Math.max(right, v.x * (STAGE_W / 2));
            top = Math.max(top, v.y * (STAGE_H / 2));
        }
        return {left, right, top, bottom: top - 8};
    }

    /**
     * Reposition the speech bubble of every target that has one: the 3D camera (and
     * so each target's projected anchor) can move every frame, not just when the
     * target itself does. Emitting the target's visual-change event makes the looks
     * blocks re-run their bubble positioning, which reads bubbleBounds via the
     * runtime's bubblePositionProvider.
     * @private
     */
    _refreshBubbles () {
        for (const target of this.runtime.targets) {
            const looksState = target.getCustomState && target.getCustomState('Scratch.looks');
            if (looksState && typeof looksState.drawableId === 'number') {
                // The constant lives on RenderedTarget.EVENT_TARGET_VISUAL_CHANGE; use the
                // literal to avoid pulling the whole class in here.
                target.emit('EVENT_TARGET_VISUAL_CHANGE', target);
            }
        }
    }

    /**
     * Test whether the asking sprite's 3D shape overlaps any visible, non-self,
     * non-dragged clone of the named sprite, using world-space axis-aligned bounding
     * boxes. Only meaningful while the 3D view is active.
     * @param {Target} asking - the sprite running the block.
     * @param {string} spriteName - the other sprite's name.
     * @returns {boolean} true if their bounding boxes overlap in 3D.
     */
    isTouching3D (asking, spriteName) {
        const askEntry = this._meshes.get(asking.id);
        if (!askEntry || !askEntry.group.visible) return false;
        const other = this.runtime.getSpriteTargetByName(spriteName);
        if (!other || !other.sprite) return false;

        const a = new THREE.Box3().setFromObject(askEntry.group);
        if (a.isEmpty()) return false;
        const b = new THREE.Box3();
        for (const clone of other.sprite.clones) {
            if (clone === asking || clone.dragging) continue;
            const entry = this._meshes.get(clone.id);
            if (!entry || !entry.group.visible) continue;
            b.setFromObject(entry.group);
            if (!b.isEmpty() && a.intersectsBox(b)) return true;
        }
        return false;
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
        entry.effectUniforms = null;
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
