const test = require('tap').test;
const {PopupScene, getPopupState} = require('../../src/extensions/scratch3_popup/scene.js');

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
