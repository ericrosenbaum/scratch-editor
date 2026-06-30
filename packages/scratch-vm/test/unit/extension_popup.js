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

test('PopupScene.forwardVector points along the heading (2D-compatible) across all axes', t => {
    const runtime = {renderer: null, targets: [], on: () => {}};
    const scene = new PopupScene(runtime);
    const near = (a, b) => Math.abs(a - b) < 1e-9;

    // At rest (direction 90, no spin/tilt) the heading is +x (right), like 2D `move`.
    let f = scene.forwardVector(makeTarget({direction: 90}));
    t.ok(near(f.x, 1) && near(f.y, 0) && near(f.z, 0), 'rest (dir 90) heads +x (right), like 2D move');

    // `direction` steers the heading in the wall plane exactly like 2D: dir 0 -> up (+y).
    f = scene.forwardVector(makeTarget({direction: 0}));
    t.ok(near(f.x, 0) && near(f.y, 1) && near(f.z, 0), 'direction 0 heads +y (up), like 2D move');

    // Spin (yaw about y) angles the heading into the page: spin 90 -> -z.
    const spun = makeTarget({direction: 90});
    getPopupState(spun).spin = 90;
    f = scene.forwardVector(spun);
    t.ok(near(f.x, 0) && near(f.y, 0) && near(f.z, -1), 'spin 90 angles the heading into the page (-z)');

    // Tilt about the heading axis is a roll: a straight-ahead (+x) heading is unchanged.
    const tilted = makeTarget({direction: 90});
    getPopupState(tilted).tilt = 90;
    f = scene.forwardVector(tilted);
    t.ok(near(f.x, 1) && near(f.y, 0) && near(f.z, 0), 'tilt 90 rolls the card; +x heading unchanged');

    // A left-right flip (facing left) reverses the heading to -x (left).
    f = scene.forwardVector(makeTarget({rotationStyle: 'left-right', direction: -90}));
    t.ok(near(f.x, -1) && near(f.y, 0) && near(f.z, 0), 'left-right flip heads -x (left)');

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
