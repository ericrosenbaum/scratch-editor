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

test('PopupScene.forwardVector matches the rendered orientation across all three axes', t => {
    const runtime = {renderer: null, targets: [], on: () => {}};
    const scene = new PopupScene(runtime);
    const near = (a, b) => Math.abs(a - b) < 1e-9;

    // At rest the card faces the camera (+z), regardless of direction (a pure roll).
    const rest = makeTarget({direction: 0});
    let f = scene.forwardVector(rest);
    t.ok(near(f.x, 0) && near(f.y, 0) && near(f.z, 1), 'rest faces +z (toward camera)');

    // Direction (roll about the forward axis) must not change the heading.
    const rolled = makeTarget({direction: 0});
    const f2 = scene.forwardVector(rolled);
    t.ok(near(f2.x, 0) && near(f2.y, 0) && near(f2.z, 1), 'direction alone does not change heading');

    // Spin 90deg (yaw about y) turns the heading to +x.
    const spun = makeTarget();
    getPopupState(spun).spin = 90;
    f = scene.forwardVector(spun);
    t.ok(near(f.x, 1) && near(f.y, 0) && near(f.z, 0), 'spin 90 faces +x');

    // Tilt 90deg (pitch about x) tips the heading down to -y.
    const tilted = makeTarget();
    getPopupState(tilted).tilt = 90;
    f = scene.forwardVector(tilted);
    t.ok(near(f.x, 0) && near(f.y, -1) && near(f.z, 0), 'tilt 90 faces -y (down)');

    // left-right flip (facing left) flips the heading to -z (into the page).
    const flipped = makeTarget({rotationStyle: 'left-right', direction: -90});
    f = scene.forwardVector(flipped);
    t.ok(near(f.x, 0) && near(f.y, 0) && near(f.z, -1), 'left-right flip faces -z');

    t.end();
});
