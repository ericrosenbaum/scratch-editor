const test = require('tap').test;
const VirtualMachine = require('../../src/index');
const Sprite = require('../../src/sprites/sprite');
const FakeRenderer = require('../fixtures/fake-renderer');
const Matter = require('matter-js');

/**
 * Create a VM with the physics extension loaded, a fake renderer,
 * and a sprite target. Returns {vm, ext, target}.
 */
const setupVM = async () => {
    const vm = new VirtualMachine();
    vm.emitTargetsUpdate = () => {};

    // Attach a fake renderer with extra methods the physics extension needs.
    const renderer = new FakeRenderer();
    renderer._allDrawables = {};
    renderer._gl = null;
    renderer.draw = function () {};

    const drawableBounds = {};
    renderer.getBounds = function (drawableID) {
        return drawableBounds[drawableID] || {
            left: -25, right: 25, top: 25, bottom: -25
        };
    };

    renderer.setDrawableBounds = function (drawableID, left, right, top, bottom) {
        drawableBounds[drawableID] = {left, right, top, bottom};
    };

    vm.attachRenderer(renderer);

    // Create a stage target
    const stageSpr = new Sprite(null, vm.runtime);
    stageSpr.name = 'Stage';
    const stage = stageSpr.createClone();
    stage.isStage = true;

    // Create a sprite target
    const spr = new Sprite(null, vm.runtime);
    spr.name = 'Sprite1';
    const target = spr.createClone();

    vm.runtime.targets = [stage, target];

    // Load the physics extension
    await vm.extensionManager.loadExtensionURL('physics');
    const ext = vm.runtime.ext_physics;

    return {vm, ext, target, renderer};
};

/**
 * Helper to create a mock util object for block calls.
 */
const makeUtil = target => ({target});

/**
 * Step the physics simulation manually (setTimeout-based loop doesn't run in tests).
 */
const stepPhysics = (ext, ms) => {
    if (ext._engine) {
        Matter.Engine.update(ext._engine, ms);
        ext._syncBodiesToSprites();
    }
};

const stepPhysicsFrames = (ext, frames, dt = 16.67) => {
    for (let i = 0; i < frames; i++) {
        stepPhysics(ext, dt);
    }
};

// ---- Test: Extension loads and has correct info ----

test('physics extension loads and provides block info', async t => {
    const {ext} = await setupVM();

    const info = ext.getInfo();
    t.equal(info.id, 'physics', 'extension id is physics');
    t.ok(info.blocks.length > 0, 'has blocks defined');

    const opcodes = info.blocks
        .filter(b => typeof b === 'object')
        .map(b => b.opcode);
    t.ok(opcodes.includes('enablePhysics'), 'has enablePhysics block');
    t.ok(opcodes.includes('disablePhysics'), 'has disablePhysics block');
    t.ok(opcodes.includes('push'), 'has push block');
    t.ok(opcodes.includes('setVelocity'), 'has setVelocity block');
    t.ok(opcodes.includes('setGravity'), 'has setGravity block');
    t.ok(opcodes.includes('getSpeed'), 'has getSpeed block');
    t.ok(opcodes.includes('isTouchingPhysics'), 'has isTouchingPhysics block');
    t.ok(opcodes.includes('setDebugDraw'), 'has setDebugDraw block');

    t.end();
});

// ---- Test: Sprite falls under gravity ----

test('sprite falls under gravity when physics is enabled', async t => {
    const {vm, ext, target} = await setupVM();

    target.setXY(0, 100, true);
    const startY = target.y;
    t.equal(startY, 100, 'sprite starts at y=100');

    ext.enablePhysics({}, makeUtil(target));
    t.ok(ext._engine, 'engine was created');
    t.ok(ext._bodies[target.id], 'body was created for target');

    ext._stopLoop();
    stepPhysicsFrames(ext, 60);

    const endY = target.y;
    t.ok(endY < startY, `sprite fell: startY=${startY}, endY=${endY}`);

    vm.quit();
    t.end();
});

// ---- Test: Static body does not fall ----

test('static sprite does not fall under gravity', async t => {
    const {vm, ext, target} = await setupVM();

    target.setXY(0, 0, true);
    const startY = target.y;

    ext.enablePhysics({}, makeUtil(target));
    ext.setPhysicsMode({MODE: 'static'}, makeUtil(target));
    ext._stopLoop();

    stepPhysicsFrames(ext, 60);

    const endY = target.y;
    t.equal(endY, startY, `static sprite did not move: y=${endY}`);

    vm.quit();
    t.end();
});

// ---- Test: Dynamic sprite collides with a static body ----

test('dynamic sprite lands on static floor body', async t => {
    const {vm, ext, target} = await setupVM();

    target.setXY(0, 100, true);

    ext.enablePhysics({}, makeUtil(target));
    ext._stopLoop();

    // Add a static floor body at y=-100 in scratch coords
    // matter y = 180 - (-100) = 280
    const floorBody = Matter.Bodies.rectangle(240, 280, 480, 20, {
        isStatic: true
    });
    floorBody.scratch_targetId = '__floor__';
    Matter.Composite.add(ext._engine.world, floorBody);

    stepPhysicsFrames(ext, 180, 16.67);

    const endY = target.y;
    t.ok(endY < 100, `sprite fell from 100: endY=${endY}`);
    // Sprite should have stopped around the floor level (-100 ± some tolerance)
    t.ok(endY > -150, `sprite stopped on floor: endY=${endY}`);

    vm.quit();
    t.end();
});

// ---- Test: Gravity can be changed ----

test('changing gravity affects sprite motion', async t => {
    const {vm, ext, target} = await setupVM();

    target.setXY(0, 0, true);

    ext.setGravity({X: 10, Y: 0});
    ext.enablePhysics({}, makeUtil(target));
    ext._stopLoop();

    stepPhysicsFrames(ext, 60);

    t.ok(target.x > 0, `sprite moved right under x-gravity: x=${target.x}`);

    vm.quit();
    t.end();
});

// ---- Test: Zero gravity means no falling ----

test('zero gravity prevents falling', async t => {
    const {vm, ext, target} = await setupVM();

    target.setXY(0, 50, true);
    const startY = target.y;

    ext.setGravity({X: 0, Y: 0});
    ext.enablePhysics({}, makeUtil(target));
    ext._stopLoop();

    stepPhysicsFrames(ext, 60);

    const endY = target.y;
    t.ok(Math.abs(endY - startY) < 1,
        `sprite stayed in place without gravity: startY=${startY}, endY=${endY}`);

    vm.quit();
    t.end();
});

// ---- Test: Push applies force ----

test('push block applies force to sprite', async t => {
    const {vm, ext, target} = await setupVM();

    target.setXY(0, 0, true);

    ext.setGravity({X: 0, Y: 0});
    ext.enablePhysics({}, makeUtil(target));
    ext._stopLoop();

    // Push right (direction 90 in Scratch = right)
    ext.push({FORCE: 50, DIR: 90}, makeUtil(target));
    stepPhysicsFrames(ext, 30);

    t.ok(target.x > 0, `sprite moved right after push: x=${target.x}`);

    vm.quit();
    t.end();
});

// ---- Test: Set velocity directly ----

test('setVelocity changes sprite velocity', async t => {
    const {vm, ext, target} = await setupVM();

    target.setXY(0, 0, true);

    ext.setGravity({X: 0, Y: 0});
    ext.enablePhysics({}, makeUtil(target));
    ext._stopLoop();

    ext.setVelocity({VX: 5, VY: 0}, makeUtil(target));
    stepPhysicsFrames(ext, 30);

    t.ok(target.x > 0, `sprite moved right with positive VX: x=${target.x}`);

    vm.quit();
    t.end();
});

// ---- Test: Velocity reporters work ----

test('velocity reporters return correct values', async t => {
    const {vm, ext, target} = await setupVM();

    target.setXY(0, 0, true);

    ext.setGravity({X: 0, Y: 0});
    ext.enablePhysics({}, makeUtil(target));
    ext._stopLoop();

    ext.setVelocity({VX: 3, VY: 4}, makeUtil(target));

    const vx = ext.getVelocityX({}, makeUtil(target));
    const vy = ext.getVelocityY({}, makeUtil(target));
    const speed = ext.getSpeed({}, makeUtil(target));

    t.equal(vx, 3, `x velocity is 3: got ${vx}`);
    t.equal(vy, 4, `y velocity is 4: got ${vy}`);
    t.equal(speed, 5, `speed is 5 (3-4-5 triangle): got ${speed}`);

    vm.quit();
    t.end();
});

// ---- Test: Bounce (restitution) setting ----

test('setBounce changes restitution on body', async t => {
    const {vm, ext, target} = await setupVM();

    ext.enablePhysics({}, makeUtil(target));
    ext._stopLoop();

    ext.setBounce({BOUNCE: 0.8}, makeUtil(target));

    const body = ext._bodies[target.id];
    t.equal(body.restitution, 0.8, 'body restitution set to 0.8');

    ext.setBounce({BOUNCE: 2}, makeUtil(target));
    t.equal(body.restitution, 1, 'restitution clamped to 1');

    ext.setBounce({BOUNCE: -1}, makeUtil(target));
    t.equal(body.restitution, 0, 'restitution clamped to 0');

    vm.quit();
    t.end();
});

// ---- Test: Friction setting ----

test('setFriction changes friction on body', async t => {
    const {vm, ext, target} = await setupVM();

    ext.enablePhysics({}, makeUtil(target));
    ext._stopLoop();

    ext.setFriction({FRICTION: 0.2}, makeUtil(target));

    const body = ext._bodies[target.id];
    t.equal(body.friction, 0.2, 'body friction set to 0.2');

    vm.quit();
    t.end();
});

// ---- Test: Disable physics removes body ----

test('disablePhysics removes body from simulation', async t => {
    const {vm, ext, target} = await setupVM();

    target.setXY(0, 100, true);

    ext.enablePhysics({}, makeUtil(target));
    ext._stopLoop();
    t.ok(ext._bodies[target.id], 'body exists after enable');

    ext.disablePhysics({}, makeUtil(target));
    t.notOk(ext._bodies[target.id], 'body removed after disable');

    const yBefore = target.y;
    stepPhysicsFrames(ext, 30);
    t.equal(target.y, yBefore, 'sprite no longer affected by physics');

    vm.quit();
    t.end();
});

// ---- Test: External move teleports body ----

test('external move (motion block) teleports physics body', async t => {
    const {vm, ext, target} = await setupVM();

    target.setXY(0, 100, true);

    ext.setGravity({X: 0, Y: 0});
    ext.enablePhysics({}, makeUtil(target));
    ext._stopLoop();

    // Simulate an external move (like a "go to x: 50 y: 50" block)
    target.setXY(50, 50, true);

    const body = ext._bodies[target.id];
    const bodyX = body.position.x - 240; // matter to scratch
    const bodyY = 180 - body.position.y;

    t.ok(Math.abs(bodyX - 50) < 1, `body x teleported to ~50: got ${bodyX}`);
    t.ok(Math.abs(bodyY - 50) < 1, `body y teleported to ~50: got ${bodyY}`);

    t.ok(Math.abs(body.velocity.x) < 0.01, 'velocity x zeroed after teleport');
    t.ok(Math.abs(body.velocity.y) < 0.01, 'velocity y zeroed after teleport');

    vm.quit();
    t.end();
});

// ---- Test: Physics mode toggle (dynamic ↔ static) ----

test('setPhysicsMode toggles between dynamic and static', async t => {
    const {vm, ext, target} = await setupVM();

    target.setXY(0, 100, true);

    ext.enablePhysics({}, makeUtil(target));
    ext._stopLoop();

    const body = ext._bodies[target.id];
    t.equal(body.isStatic, false, 'body starts as dynamic');

    ext.setPhysicsMode({MODE: 'static'}, makeUtil(target));
    t.equal(body.isStatic, true, 'body is now static');

    const startY = target.y;
    stepPhysicsFrames(ext, 30);
    t.equal(target.y, startY, 'static body does not fall');

    ext.setPhysicsMode({MODE: 'dynamic'}, makeUtil(target));
    t.equal(body.isStatic, false, 'body is dynamic again');

    stepPhysicsFrames(ext, 30);
    t.ok(target.y < startY, 'dynamic body falls again');

    vm.quit();
    t.end();
});

// ---- Test: Torque spins the sprite ----

test('applyTorque changes sprite direction', async t => {
    const {vm, ext, target} = await setupVM();

    target.setXY(0, 0, true);
    const startDir = target.direction;

    ext.setGravity({X: 0, Y: 0});
    ext.enablePhysics({}, makeUtil(target));
    ext._stopLoop();

    ext.applyTorque({TORQUE: 5}, makeUtil(target));
    stepPhysicsFrames(ext, 60);

    t.not(target.direction, startDir,
        `direction changed: start=${startDir}, end=${target.direction}`);

    vm.quit();
    t.end();
});

// ---- Test: Stage boundary walls ----

test('stage boundary walls prevent sprite from escaping', async t => {
    const {vm, ext, target} = await setupVM();

    target.setXY(0, 0, true);

    ext.enablePhysics({}, makeUtil(target));
    ext._stopLoop();

    stepPhysicsFrames(ext, 300);

    // Sprite should be caught by the floor wall (at y=360+30 in matter = y ~ -210 scratch)
    // But the actual constraint depends on body size + wall placement
    t.ok(target.y >= -220, `sprite stayed within stage bounds: y=${target.y}`);

    vm.quit();
    t.end();
});

// ---- Test: Enable/disable cleanup ----

test('enabling and disabling physics cleans up properly', async t => {
    const {vm, ext, target} = await setupVM();

    ext.enablePhysics({}, makeUtil(target));
    ext._stopLoop();
    const bodyCount1 = Matter.Composite.allBodies(ext._engine.world).length;
    t.ok(bodyCount1 > 0, 'bodies exist in world after enable');

    ext.disablePhysics({}, makeUtil(target));
    const bodyCount2 = Matter.Composite.allBodies(ext._engine.world).length;
    t.ok(bodyCount2 < bodyCount1, 'body removed from world after disable');

    vm.quit();
    t.end();
});

// ---- Test: isTouchingPhysics basic ----

test('isTouchingPhysics returns boolean', async t => {
    const {vm, ext, target} = await setupVM();

    target.setXY(0, 50, true);

    ext.setGravity({X: 0, Y: -10});
    ext.enablePhysics({}, makeUtil(target));
    ext._stopLoop();

    const touching = ext.isTouchingPhysics(
        {SPRITE: 'nonexistent'},
        makeUtil(target)
    );
    t.equal(touching, false, 'not touching nonexistent sprite');

    vm.quit();
    t.end();
});

// ---- Test: Speed reporter increases during fall ----

test('speed reporter increases during free fall', async t => {
    const {vm, ext, target} = await setupVM();

    target.setXY(0, 100, true);

    ext.enablePhysics({}, makeUtil(target));
    ext._stopLoop();

    const speedBefore = ext.getSpeed({}, makeUtil(target));

    stepPhysicsFrames(ext, 30);

    const speedAfter = ext.getSpeed({}, makeUtil(target));
    t.ok(speedAfter > speedBefore,
        `speed increased during fall: before=${speedBefore}, after=${speedAfter}`);

    vm.quit();
    t.end();
});

// ---- Test: Re-enable physics replaces body ----

test('re-enabling physics replaces the body', async t => {
    const {vm, ext, target} = await setupVM();

    ext.enablePhysics({}, makeUtil(target));
    ext._stopLoop();

    const body1 = ext._bodies[target.id];
    t.ok(body1, 'first body created');

    ext.enablePhysics({}, makeUtil(target));
    const body2 = ext._bodies[target.id];
    t.ok(body2, 'body replaced after re-enable');
    t.not(body1, body2, 'new body is different object');

    vm.quit();
    t.end();
});

// ---- Test: Cleanup on dispose ----

test('dispose cleans up engine and bodies', async t => {
    const {vm, ext, target} = await setupVM();

    ext.enablePhysics({}, makeUtil(target));
    ext._stopLoop();

    t.ok(ext._engine, 'engine exists before dispose');
    t.ok(Object.keys(ext._bodies).length > 0, 'bodies exist before dispose');

    ext._dispose();

    t.notOk(ext._engine, 'engine cleared after dispose');
    t.equal(Object.keys(ext._bodies).length, 0, 'bodies cleared after dispose');

    vm.quit();
    t.end();
});
