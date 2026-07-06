const test = require('tap').test;
const {PopupScene, getPopupState} = require('../../src/extensions/scratch3_popup/scene.js');
const THREE = require('three');

// A minimal stand-in for a RenderedTarget that records 2D drawable visibility changes.
const makeTarget = (props = {}) => Object.assign({
    id: props.id || 'id',
    isStage: false,
    isOriginal: true,
    visible: true,
    drawableID: 0,
    x: 0,
    y: 0,
    size: 100,
    direction: 90,
    rotationStyle: 'all around',
    _state: {},
    getCustomState (key) {
        return this._state[key];
    },
    setCustomState (key, value) {
        this._state[key] = value;
    }
}, props);

// A renderer that just logs which drawables were shown/hidden.
const makeRenderer = log => ({
    updateDrawableVisible: (id, visible) => log.push([id, visible])
});

// A mutable stand-in for the VM mouse io-device. Flip _down / _x / _y between
// _handlePointer calls to simulate a press/move/release.
const makeMouse = () => ({
    _down: false,
    _x: 0,
    _y: 0,
    getIsDown () {
        return this._down;
    },
    getScratchX () {
        return this._x;
    },
    getScratchY () {
        return this._y;
    }
});

test('PopupScene._hideSprites hides every non-stage drawable, including clones', t => {
    const log = [];
    const stage = makeTarget({id: 'stage', isStage: true, drawableID: 5});
    const sprite = makeTarget({id: 'sprite', drawableID: 1, visible: true});
    const clone = makeTarget({id: 'clone', isOriginal: false, drawableID: 2, visible: true});
    const runtime = {renderer: makeRenderer(log), targets: [stage, sprite, clone], on: () => {}};
    const scene = new PopupScene(runtime);

    scene._hideSprites(true);

    // Both sprite and clone get hidden; the stage backdrop is left untouched.
    t.same(log.filter(e => e[0] === 1), [[1, false]], 'sprite 2D drawable hidden');
    t.same(log.filter(e => e[0] === 2), [[2, false]], 'clone 2D drawable hidden');
    t.same(log.filter(e => e[0] === 5), [], 'stage drawable untouched');

    // Restoring honours each target's own visibility flag.
    log.length = 0;
    sprite.visible = false;
    scene._hideSprites(false);
    t.same(log.filter(e => e[0] === 1), [[1, false]], 'hidden sprite stays hidden on restore');
    t.same(log.filter(e => e[0] === 2), [[2, true]], 'visible clone restored on restore');

    t.end();
});

test('PopupScene.forwardVector points the way the card faces (depth axis at rest)', t => {
    const runtime = {renderer: null, targets: [], on: () => {}};
    const scene = new PopupScene(runtime);
    const near = (a, b) => Math.abs(a - b) < 1e-9;

    // At rest (no spin/tilt) the heading is the face normal +z: out of the page,
    // toward the camera and away from the backdrop.
    let f = scene.forwardVector(makeTarget({direction: 90}));
    t.ok(near(f.x, 0) && near(f.y, 0) && near(f.z, 1), 'rest heads +z (toward the camera)');

    // `direction` rotates the card within its own plane, so the heading is unchanged.
    f = scene.forwardVector(makeTarget({direction: 0}));
    t.ok(near(f.x, 0) && near(f.y, 0) && near(f.z, 1), 'direction spins in-plane; heading stays +z');

    // Spin (yaw about y) steers the heading sideways: spin 90 -> +x (right).
    const spun = makeTarget({direction: 90});
    getPopupState(spun).spin = 90;
    f = scene.forwardVector(spun);
    t.ok(near(f.x, 1) && near(f.y, 0) && near(f.z, 0), 'spin 90 steers the heading to +x (right)');

    // Tilt (pitch about x) tips the heading vertically: tilt 90 dives straight down.
    const tilted = makeTarget({direction: 90});
    getPopupState(tilted).tilt = 90;
    f = scene.forwardVector(tilted);
    t.ok(near(f.x, 0) && near(f.y, -1) && near(f.z, 0), 'tilt 90 pitches the heading straight down');

    // A left-right flip (facing left) turns the card around: heading -z (into the page).
    f = scene.forwardVector(makeTarget({rotationStyle: 'left-right', direction: -90}));
    t.ok(near(f.x, 0) && near(f.y, 0) && near(f.z, -1), 'left-right flip heads -z (into the page)');

    t.end();
});

test('PopupScene.forwardVector honours the per-sprite move axis (set 3D move axis)', t => {
    const runtime = {renderer: null, targets: [], on: () => {}};
    const scene = new PopupScene(runtime);
    const near = (a, b) => Math.abs(a - b) < 1e-9;

    // Old saved state without a moveAxis backfills to the default 'z'.
    const legacy = makeTarget({direction: 90});
    legacy._state['Scratch.popup'] = {thickness: 20, depth: 0, tilt: 0, spin: 0};
    t.equal(getPopupState(legacy).moveAxis, 'z', 'missing moveAxis backfills to z');

    // Axis 'x' travels along the card's own right: at rest that is world +x, and
    // `direction` steers it in the wall plane the way the 2D move block does.
    const alongX = makeTarget({direction: 90});
    getPopupState(alongX).moveAxis = 'x';
    let f = scene.forwardVector(alongX);
    t.ok(near(f.x, 1) && near(f.y, 0) && near(f.z, 0), 'axis x at rest heads +x (right)');
    alongX.direction = 0;
    f = scene.forwardVector(alongX);
    t.ok(near(f.x, 0) && near(f.y, 1) && near(f.z, 0), 'axis x with direction 0 heads +y (up), like 2D move');

    // Axis 'x' still follows spin (yaw): spin 90 turns the right edge into the page.
    getPopupState(alongX).spin = 90;
    alongX.direction = 90;
    f = scene.forwardVector(alongX);
    t.ok(near(f.x, 0) && near(f.y, 0) && near(f.z, -1), 'axis x with spin 90 heads -z (into the page)');

    // Axis 'y' travels along the card's own top: at rest that is world +y.
    const alongY = makeTarget({direction: 90});
    getPopupState(alongY).moveAxis = 'y';
    f = scene.forwardVector(alongY);
    t.ok(near(f.x, 0) && near(f.y, 1) && near(f.z, 0), 'axis y at rest heads +y (up)');

    t.end();
});

test('PopupScene._handlePointer grabs any sprite on press, not just draggable ones (2D-editor parity)', t => {
    const mouse = makeMouse();
    const runtime = {renderer: null, targets: [], on: () => {}, ioDevices: {mouse}};
    const scene = new PopupScene(runtime);

    // Stub the three.js-dependent halves so the gesture decision can be tested headless.
    const dragged = [];
    scene._beginSpriteDrag = target => dragged.push(target);
    let orbitCalls = 0;
    scene._orbitBy = () => {
        orbitCalls++;
    };

    // A non-draggable sprite sits under the pointer.
    const sprite = makeTarget({id: 's1', draggable: false});
    scene._raycastTarget = () => ({target: sprite, point: null});

    mouse._down = true;
    mouse._x = 12;
    mouse._y = -8;
    scene._handlePointer();

    t.same(dragged, [sprite], 'pressing a non-draggable sprite still begins a sprite drag');
    t.equal(orbitCalls, 0, 'no camera orbit happens while a sprite is grabbed');
    t.end();
});

test('PopupScene._handlePointer orbits on empty space (drag mode) and fires the clicked hat on a tap', t => {
    const mouse = makeMouse();
    const hats = [];
    const runtime = {
        renderer: null,
        targets: [],
        on: () => {},
        ioDevices: {mouse},
        startHats: (...args) => hats.push(args)
    };
    const scene = new PopupScene(runtime);
    scene._mode = 'drag';

    // Empty space: pressing then dragging orbits the camera.
    scene._raycastTarget = () => null;
    let orbitCalls = 0;
    scene._orbitBy = () => {
        orbitCalls++;
    };

    mouse._down = true;
    mouse._x = 0;
    mouse._y = 0;
    scene._handlePointer(); // press edge -> camera gesture
    mouse._x = 30;
    scene._handlePointer(); // held -> orbit
    t.equal(scene._gesture, 'camera', 'pressing empty space in drag mode starts a camera orbit');
    t.ok(orbitCalls >= 1, 'holding and moving orbits the camera');

    mouse._down = false;
    scene._handlePointer(); // release
    t.equal(hats.length, 0, 'no clicked hat fires when the press missed every sprite');

    // A tap on a sprite (press + release without moving) fires its clicked hat.
    scene._beginSpriteDrag = () => {}; // skip the three.js drag setup
    const sprite = makeTarget({id: 's1'});
    scene._raycastTarget = () => ({target: sprite, point: null});
    mouse._down = true;
    mouse._x = 5;
    mouse._y = 5;
    scene._handlePointer(); // press
    mouse._down = false; // release at the same spot
    scene._handlePointer();
    t.same(hats, [['event_whenthisspriteclicked', null, sprite]], 'a tap on a sprite fires its clicked hat');
    t.end();
});

test('PopupScene._focusPoint tracks the followed sprite, else the stage centre', t => {
    const ball = makeTarget({id: 'ball', x: 100, y: 50});
    const runtime = {
        renderer: null,
        targets: [ball],
        on: () => {},
        getSpriteTargetByName: name => (name === 'Ball' ? ball : null)
    };
    const scene = new PopupScene(runtime);

    // Not following -> the stage centre.
    t.same(scene._focusPoint(), {x: 0, y: 0, z: 0}, 'non-follow modes focus the stage centre');

    // Following, before any mesh is built -> the sprite's 2D coords and -depth.
    getPopupState(ball).depth = 30;
    scene._mode = 'follow';
    scene._followName = 'Ball';
    t.same(scene._focusPoint(), {x: 100, y: 50, z: -30}, 'follow mode focuses the sprite (x, y, -depth)');

    // Once a mesh group exists, its position wins (matches the rendered sprite).
    scene._meshes.set('ball', {group: new THREE.Group()});
    scene._meshes.get('ball').group.position.set(12, 34, -56);
    t.same(scene._focusPoint(), {x: 12, y: 34, z: -56}, 'follow mode uses the built mesh position');

    // Following a missing sprite -> back to the centre.
    scene._followName = 'Ghost';
    t.same(scene._focusPoint(), {x: 0, y: 0, z: 0}, 'following a missing sprite falls back to the centre');
    t.end();
});

test('PopupScene._updateCamera eases the focus toward the followed sprite (smooth, not a snap)', t => {
    const ball = makeTarget({id: 'ball', x: 200, y: 0});
    const runtime = {
        renderer: null,
        targets: [ball],
        on: () => {},
        getSpriteTargetByName: name => (name === 'Ball' ? ball : null)
    };
    const scene = new PopupScene(runtime);
    // _init() (which builds these) needs a renderer/DOM, so stand them in for a headless test.
    scene._camera = new THREE.PerspectiveCamera(45, 4 / 3, 1, 5000);
    scene._clock = null; // null -> deterministic dt = 1/60 per frame
    scene._mode = 'follow';
    scene._followName = 'Ball';

    // One frame moves the focus only part-way toward the sprite at x=200, never instantly.
    scene._updateCamera();
    t.ok(scene._focus.x > 0 && scene._focus.x < 200, 'one frame eases the focus partway, not all the way');
    const afterOne = scene._focus.x;

    // Successive frames keep approaching and converge close to the target.
    for (let i = 0; i < 240; i++) scene._updateCamera();
    t.ok(scene._focus.x > afterOne, 'the focus keeps approaching the sprite across frames');
    t.ok(Math.abs(scene._focus.x - 200) < 1, 'the focus converges onto the sprite over time');
    t.end();
});

test('PopupScene shoulder camera turns to look along the sprite heading', t => {
    const hero = makeTarget({id: 'hero', x: 0, y: 0});
    const runtime = {
        renderer: null,
        targets: [hero],
        on: () => {},
        getSpriteTargetByName: name => (name === 'Hero' ? hero : null)
    };
    const scene = new PopupScene(runtime);
    scene._camera = new THREE.PerspectiveCamera(45, 4 / 3, 1, 5000);
    scene._clock = null; // null -> deterministic dt = 1/60 per frame

    scene.shoulderSprite('Hero');
    t.equal(scene._mode, 'shoulder', 'shoulderSprite enters shoulder mode');
    t.equal(scene._followName, 'Hero', 'shoulderSprite tracks the named sprite');

    // Angles are eased without wrapping, so compare them modulo 2*PI.
    const tau = 2 * Math.PI;
    const angDist = (a, b) => Math.abs((((((a - b) + Math.PI) % tau) + tau) % tau) - Math.PI);

    // At rest the heading is +z (toward the camera): the shoulder camera settles
    // behind the sprite on -z (the backdrop side) looking +z, i.e. yaw PI, and sees
    // the card's back face full on.
    t.ok(angDist(scene._shoulderYaw(), Math.PI) < 1e-9, 'rest heading (+z) puts the camera yaw at PI');
    for (let i = 0; i < 300; i++) scene._updateCamera();
    t.ok(angDist(scene._angle, Math.PI) < 0.01, 'the yaw converges onto the heading');
    t.ok(scene._camera.position.z < -100, 'the camera sits behind the sprite (on -z)');

    // Turn right (spin 90 -> heading +x): the yaw eases toward -PI/2, smoothly.
    getPopupState(hero).spin = 90;
    const before = scene._angle;
    scene._updateCamera();
    const step = angDist(scene._angle, before);
    t.ok(step > 0 && step < Math.PI / 2, 'one frame turns the yaw only part-way (no snap)');
    for (let i = 0; i < 300; i++) scene._updateCamera();
    t.ok(angDist(scene._angle, -Math.PI / 2) < 0.01, 'the yaw converges onto the new heading');

    // A vertical heading (tilt 90 -> straight down) has no ground-plane component:
    // keep the current yaw.
    getPopupState(hero).spin = 0;
    getPopupState(hero).tilt = 90;
    t.equal(scene._shoulderYaw(), null, 'a vertical heading reports no yaw (keep the current one)');
    t.end();
});

test('PopupScene._handlePointer orbits empty space in follow mode too', t => {
    const mouse = makeMouse();
    const runtime = {renderer: null, targets: [], on: () => {}, ioDevices: {mouse}};
    const scene = new PopupScene(runtime);
    scene._mode = 'follow';
    scene._raycastTarget = () => null;

    mouse._down = true;
    mouse._x = 0;
    mouse._y = 0;
    scene._handlePointer();
    t.equal(scene._gesture, 'camera', 'pressing empty space while following orbits the camera around the sprite');
    t.end();
});

test('Pop-Up extension defaults fencing off; the block and stop control it', t => {
    const Runtime = require('../../src/engine/runtime');
    const Scratch3PopupBlocks = require('../../src/extensions/scratch3_popup/index.js');

    const runtime = new Runtime();
    t.equal(runtime.fencingEnabled, true, 'a bare runtime starts with fencing on');

    const ext = new Scratch3PopupBlocks(runtime);
    t.equal(runtime.fencingEnabled, false, 'loading the extension switches fencing off');

    ext.setFencing({FENCING: 'on'});
    t.equal(runtime.fencingEnabled, true, 'the block can switch fencing back on');
    ext.setFencing({FENCING: 'off'});
    t.equal(runtime.fencingEnabled, false, 'the block can switch fencing off again');

    // The stop button (and each green flag) returns to the extension default: off.
    ext.setFencing({FENCING: 'on'});
    runtime.emit('PROJECT_STOP_ALL');
    t.equal(runtime.fencingEnabled, false, 'stop resets fencing to the extension default (off)');
    t.end();
});

test('PopupScene.bubbleBounds projects the mesh box into stage coordinates', t => {
    const hero = makeTarget({id: 'hero'});
    const runtime = {renderer: null, targets: [hero], on: () => {}};
    const scene = new PopupScene(runtime);

    // Inactive scene: no bounds (the looks blocks fall back to 2D behaviour).
    t.equal(scene.bubbleBounds(hero), null, 'inactive scene reports no bounds');

    // Stand in for _init (browser-only) with a camera in front of the origin and a
    // simple box mesh for the target.
    scene.active = true;
    scene.inited = true;
    scene._camera = new THREE.PerspectiveCamera(45, 4 / 3, 1, 5000);
    scene._camera.position.set(0, 0, 300);
    scene._camera.lookAt(0, 0, 0);
    scene._camera.updateMatrixWorld();
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(60, 60, 20)));
    scene._meshes.set('hero', {group});

    // A box at the origin projects to a patch centred on the stage centre, with the
    // bubble anchor sitting on its crown (a thin top slice, like getBoundsForBubble).
    const bounds = scene.bubbleBounds(hero);
    t.ok(bounds, 'an on-screen mesh reports bounds');
    t.ok(Math.abs((bounds.left + bounds.right) / 2) < 1e-6, 'the projection is centred horizontally');
    t.ok(bounds.top > 10 && bounds.top < 180, 'the crown projects above the stage centre');
    t.equal(bounds.bottom, bounds.top - 8, 'the anchor is a thin slice below the crown');

    // Moving the mesh left moves the projected anchor left.
    group.position.set(-120, 0, 0);
    const leftBounds = scene.bubbleBounds(hero);
    t.ok(leftBounds.right < bounds.left + 1e-6, 'a mesh to the left projects to the left');

    // Behind the camera there is no meaningful projection.
    group.position.set(0, 0, 600);
    t.equal(scene.bubbleBounds(hero), null, 'a mesh behind the camera reports no bounds');

    // A hidden mesh reports no bounds either.
    group.position.set(0, 0, 0);
    group.visible = false;
    t.equal(scene.bubbleBounds(hero), null, 'a hidden mesh reports no bounds');
    t.end();
});

test('PopupScene.pivotOffset puts the costume rotation centre at the group origin', t => {
    const scene = new PopupScene({renderer: null, targets: [], on: () => {}});

    // A centred rotation centre (all the classic art): no offset.
    t.same(scene.pivotOffset({rotationCenterX: 50, rotationCenterY: 40}, 1, 100, 80), {x: 0, y: 0},
        'centred rotation centre needs no offset');

    // A shoulder pivot at the top-middle of a hanging arm: the content hangs below.
    t.same(scene.pivotOffset({rotationCenterX: 11, rotationCenterY: 9}, 1, 22, 78), {x: 0, y: -30},
        'a top pivot shifts the content down');

    // A neck pivot at the bottom-middle of a head: the content sits above.
    t.same(scene.pivotOffset({rotationCenterX: 30, rotationCenterY: 56}, 1, 60, 58), {x: 0, y: 27},
        'a bottom pivot shifts the content up');

    // bitmapResolution divides costume-pixel coordinates.
    t.same(scene.pivotOffset({rotationCenterX: 100, rotationCenterY: 80}, 2, 100, 80), {x: 0, y: 0},
        'bitmap resolution is applied to the rotation centre');

    // No rotation centre recorded: assume centred.
    t.same(scene.pivotOffset(null, 1, 100, 80), {x: 0, y: 0}, 'a missing costume assumes centred');
    t.end();
});
