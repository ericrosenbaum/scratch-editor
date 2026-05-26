const test = require('tap').test;
const Camera = require('../../src/extensions/scratch3_camera');
const Runtime = require('../../src/engine/runtime');
const Sprite = require('../../src/sprites/sprite');
const RenderedTarget = require('../../src/sprites/rendered-target');
const FakeRenderer = require('../fixtures/fake-renderer');

const makeRendererStub = () => {
    const calls = [];
    let cam = {x: 0, y: 0, zoom: 1};
    const stub = Object.assign(new FakeRenderer(), {
        setCamera (view) {
            cam = {x: view.x, y: view.y, zoom: view.zoom};
            calls.push(['setCamera', JSON.stringify(view)]);
        },
        getCamera () {
            return Object.assign({}, cam);
        },
        setDrawableIgnoreCamera (id, flag) {
            calls.push(['setDrawableIgnoreCamera', id, flag]);
        }
    });
    return {stub, calls, getCam: () => cam};
};

test('camera extension constructor disables fencing and registers blocks', t => {
    const runtime = new Runtime();
    const {stub} = makeRendererStub();
    runtime.renderer = stub;

    t.equal(runtime.disableFencing, undefined, 'fencing is not disabled by default');

    const cam = new Camera(runtime);
    const info = cam.getInfo();

    t.equal(runtime.disableFencing, true, 'extension construction disables fencing');
    t.equal(info.id, 'camera', 'extension id is camera');
    const blockCount = info.blocks.filter(b => typeof b === 'object').length;
    t.ok(blockCount >= 10, 'extension exposes at least 10 blocks');
    t.end();
});

test('camera position and zoom blocks round-trip through renderer state', t => {
    const runtime = new Runtime();
    const {stub, getCam} = makeRendererStub();
    runtime.renderer = stub;
    const cam = new Camera(runtime);

    cam.setCameraPosition({X: 100, Y: -50});
    t.same(getCam(), {x: 100, y: -50, zoom: 1}, 'position is set');
    t.equal(cam.cameraX(), 100, 'cameraX reporter');
    t.equal(cam.cameraY(), -50, 'cameraY reporter');

    cam.changeCameraX({N: 25});
    cam.changeCameraY({N: -25});
    t.same(getCam(), {x: 125, y: -75, zoom: 1}, 'change-by blocks accumulate');

    cam.setCameraZoom({Z: 250});
    t.equal(getCam().zoom, 2.5, 'zoom converts from percent to fraction');
    t.equal(cam.cameraZoom(), 250, 'zoom reporter returns percent');

    cam.changeCameraZoom({N: -50});
    t.equal(cam.cameraZoom(), 200, 'change camera zoom by N accumulates in percent');

    cam.resetCamera();
    t.same(getCam(), {x: 0, y: 0, zoom: 1}, 'reset returns to identity');
    t.end();
});

test('zoom is clamped to a minimum positive value', t => {
    const runtime = new Runtime();
    const {stub, getCam} = makeRendererStub();
    runtime.renderer = stub;
    const cam = new Camera(runtime);

    cam.setCameraZoom({Z: 0});
    t.equal(getCam().zoom, 0.01, 'zoom percent 0 clamps to 1%');

    cam.setCameraZoom({Z: -100});
    t.equal(getCam().zoom, 0.01, 'negative zoom percent clamps to 1%');
    t.end();
});

test('HUD blocks toggle a per-target flag and push it to the renderer', t => {
    const runtime = new Runtime();
    const {stub, calls} = makeRendererStub();
    runtime.renderer = stub;
    const cam = new Camera(runtime);

    const sprite = new Sprite(null, runtime);
    const target = new RenderedTarget(sprite, runtime);
    target.renderer = stub;
    target.drawableID = 7;

    t.notOk(cam.isHud({}, {target}), 'isHud is false by default');

    cam.makeHud({}, {target});
    t.ok(cam.isHud({}, {target}), 'isHud is true after makeHud');
    t.ok(
        calls.some(c => c[0] === 'setDrawableIgnoreCamera' && c[1] === 7 && c[2] === true),
        'renderer was notified with drawableID and true'
    );

    cam.makeWorld({}, {target});
    t.notOk(cam.isHud({}, {target}), 'isHud is false after makeWorld');
    t.ok(
        calls.some(c => c[0] === 'setDrawableIgnoreCamera' && c[1] === 7 && c[2] === false),
        'renderer was notified with drawableID and false'
    );
    t.end();
});

test('setXY honors runtime.disableFencing', t => {
    const runtime = new Runtime();
    const sprite = new Sprite(null, runtime);
    const target = new RenderedTarget(sprite, runtime);
    let fenceCalls = 0;
    target.renderer = Object.assign(new FakeRenderer(), {
        getFencedPositionOfDrawable (id, pos) {
            fenceCalls += 1;
            // Pretend we clamp to ±240.
            return [Math.max(-240, Math.min(240, pos[0])), pos[1]];
        }
    });

    target.setXY(1000, 0, true);
    t.equal(fenceCalls, 1, 'fencing is consulted when disableFencing is unset');
    t.equal(target.x, 240, 'fenced position is applied');

    runtime.disableFencing = true;
    target.setXY(1000, 50, true);
    t.equal(fenceCalls, 1, 'fencing is bypassed when disableFencing is true');
    t.equal(target.x, 1000, 'raw x is applied');
    t.equal(target.y, 50, 'raw y is applied');
    t.end();
});
