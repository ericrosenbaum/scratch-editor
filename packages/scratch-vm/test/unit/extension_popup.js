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
