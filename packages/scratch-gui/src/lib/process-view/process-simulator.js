/**
 * ProcessSimulator — dev tool that drives the real VM to generate realistic
 * process data. The ProcessRecorder captures events naturally, so this tests
 * the full capture pipeline.
 *
 * Usage (from browser console):
 *   window.__processSimulator.run('pong')
 *   window.__processSimulator.recapture('pong')  // clear + re-run
 */

import {generateId} from './snapshot-utils';

/**
 * Helper: wait for a specified number of milliseconds.
 */
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper: create a sprite JSON object in the format vm.addSprite expects.
 */
const makeSpriteJSON = (name, x = 0, y = 0) => JSON.stringify({
    objName: name,
    sounds: [{
        soundName: 'pop',
        soundID: -1,
        md5: '83a9787d4cb6f3b7632b4ddfebf74367.wav',
        sampleCount: 258,
        rate: 11025,
        format: ''
    }],
    costumes: [{
        costumeName: 'costume1',
        baseLayerID: -1,
        baseLayerMD5: 'cd21514d0531fdffb22204e0ec5ed84a.svg',
        bitmapResolution: 1,
        rotationCenterX: 0,
        rotationCenterY: 0
    }],
    currentCostumeIndex: 0,
    scratchX: x,
    scratchY: y,
    scale: 1,
    direction: 90,
    rotationStyle: 'normal',
    isDraggable: false,
    visible: true,
    spriteInfo: {}
});

/**
 * Helper: find a target by name.
 */
const findTarget = (vm, name) =>
    vm.runtime.targets.find(t => t.getName() === name && !t.isStage);

/**
 * Helper: get the stage target.
 */
const getStage = vm =>
    vm.runtime.targets.find(t => t.isStage);

/**
 * Helper: create a block object for target.blocks.createBlock().
 */
const makeBlock = (id, opcode, opts = {}) => ({
    id,
    opcode,
    next: opts.next || null,
    parent: opts.parent || null,
    shadow: opts.shadow || false,
    topLevel: Object.prototype.hasOwnProperty.call(opts, 'topLevel') ? opts.topLevel : true,
    fields: opts.fields || {},
    inputs: opts.inputs || {},
    mutation: opts.mutation || null,
    x: opts.x || 0,
    y: opts.y || 0
});

/**
 * Pong Game scenario — simulates building a simple pong game.
 * Exercises: sprite add, block editing, variable creation, rename,
 * test-debug cycles, costume editing, sound, sprite deletion.
 */
const pongScenario = async (vm, log) => {
    log('Starting Pong scenario...');

    // Phase 1: Add Paddle sprite
    log('Adding Paddle sprite...');
    await vm.addSprite(makeSpriteJSON('Paddle', -150, -120));
    await wait(500);

    const paddle = findTarget(vm, 'Paddle');
    if (!paddle) throw new Error('Paddle sprite not found');

    // Phase 2: Add blocks to Paddle — event handler + movement
    log('Adding blocks to Paddle...');
    vm.setEditingTarget(paddle.id);
    await wait(300);

    const paddleBlockIds = [];

    // "when green flag clicked" hat
    const flagBlock = makeBlock(generateId(), 'event_whenflagclicked', {topLevel: true, x: 50, y: 50});
    paddle.blocks.createBlock(flagBlock);
    paddleBlockIds.push(flagBlock.id);
    await wait(200);

    // "forever" loop
    const foreverBlock = makeBlock(generateId(), 'control_forever', {
        parent: flagBlock.id,
        topLevel: false
    });
    flagBlock.next = foreverBlock.id;
    paddle.blocks.createBlock(foreverBlock);
    const flagB = paddle.blocks.getBlock(flagBlock.id);
    if (flagB) flagB.next = foreverBlock.id;
    paddleBlockIds.push(foreverBlock.id);
    await wait(200);

    // "if key right arrow pressed" inside forever
    const ifBlock = makeBlock(generateId(), 'control_if', {
        parent: foreverBlock.id,
        topLevel: false
    });
    paddle.blocks.createBlock(ifBlock);
    paddleBlockIds.push(ifBlock.id);
    await wait(200);

    // "change x by 10"
    const changeXBlock = makeBlock(generateId(), 'motion_changexby', {
        parent: ifBlock.id,
        topLevel: false,
        fields: {},
        inputs: {
            DX: {
                name: 'DX',
                block: generateId(),
                shadow: generateId()
            }
        }
    });
    paddle.blocks.createBlock(changeXBlock);
    paddleBlockIds.push(changeXBlock.id);

    vm.emitWorkspaceUpdate();
    await wait(1000);
    log(`Added ${paddleBlockIds.length} blocks to Paddle`);

    // Phase 3: Add Ball sprite
    log('Adding Ball sprite...');
    await vm.addSprite(makeSpriteJSON('Ball', 0, 0));
    await wait(500);

    const ball = findTarget(vm, 'Ball');
    if (!ball) throw new Error('Ball sprite not found');

    // Phase 4: Add blocks to Ball
    log('Adding blocks to Ball...');
    vm.setEditingTarget(ball.id);
    await wait(300);

    const ballBlockIds = [];

    // "when green flag clicked"
    const ballFlag = makeBlock(generateId(), 'event_whenflagclicked', {topLevel: true, x: 50, y: 50});
    ball.blocks.createBlock(ballFlag);
    ballBlockIds.push(ballFlag.id);
    await wait(200);

    // "forever"
    const ballForever = makeBlock(generateId(), 'control_forever', {
        parent: ballFlag.id,
        topLevel: false
    });
    ball.blocks.createBlock(ballForever);
    const ballFlagB = ball.blocks.getBlock(ballFlag.id);
    if (ballFlagB) ballFlagB.next = ballForever.id;
    ballBlockIds.push(ballForever.id);
    await wait(200);

    // "move 10 steps"
    const moveBlock = makeBlock(generateId(), 'motion_movesteps', {
        parent: ballForever.id,
        topLevel: false
    });
    ball.blocks.createBlock(moveBlock);
    ballBlockIds.push(moveBlock.id);
    await wait(200);

    // "if on edge, bounce"
    const bounceBlock = makeBlock(generateId(), 'motion_ifonedgebounce', {
        parent: moveBlock.id,
        topLevel: false
    });
    ball.blocks.createBlock(bounceBlock);
    const moveB = ball.blocks.getBlock(moveBlock.id);
    if (moveB) moveB.next = bounceBlock.id;
    ballBlockIds.push(bounceBlock.id);

    vm.emitWorkspaceUpdate();
    await wait(1000);
    log(`Added ${ballBlockIds.length} blocks to Ball`);

    // Phase 5: Create score variable on stage
    log('Creating score variable...');
    const stage = getStage(vm);
    if (stage) {
        const varId = generateId();
        stage.createVariable(varId, 'score', '', false);
        vm.emitWorkspaceUpdate();
        await wait(500);
    }

    // Phase 6: First test run
    log('Test run #1...');
    vm.greenFlag();
    await wait(2000);
    vm.stopAll();
    await wait(500);

    // Phase 7: Debug — delete a block and add a replacement
    log('Debugging — modifying Ball blocks...');
    vm.setEditingTarget(ball.id);
    await wait(300);

    // Add "point in direction" block
    const pointBlock = makeBlock(generateId(), 'motion_pointindirection', {
        topLevel: true,
        x: 200,
        y: 50
    });
    ball.blocks.createBlock(pointBlock);
    vm.emitWorkspaceUpdate();
    await wait(500);

    // Phase 8: Second test run
    log('Test run #2...');
    vm.greenFlag();
    await wait(1500);
    vm.stopAll();
    await wait(500);

    // Phase 9: Rename Paddle sprite
    log('Renaming Paddle...');
    vm.renameSprite(paddle.id, 'Player');
    await wait(500);

    // Phase 10: Add a costume to Ball (triggers costume_added via diffing)
    log('Adding costume to Ball...');
    try {
        await vm.addCostume(
            'cd21514d0531fdffb22204e0ec5ed84a.svg',
            {
                name: 'ball-costume2',
                dataFormat: 'svg',
                md5: 'cd21514d0531fdffb22204e0ec5ed84a.svg',
                rotationCenterX: 0,
                rotationCenterY: 0,
                bitmapResolution: 1,
                skinId: null
            },
            ball.id
        );
    } catch (e) {
        log(`Note: addCostume had an issue: ${e.message} (continuing)`);
    }
    await wait(500);

    // Phase 11: Third test run + stop
    log('Test run #3 (final)...');
    vm.greenFlag();
    await wait(2500);
    vm.stopAll();
    await wait(500);

    // Phase 12: Add more blocks to show iteration
    log('Adding more blocks to Player...');
    const player = findTarget(vm, 'Player');
    if (player) {
        vm.setEditingTarget(player.id);
        await wait(300);

        const glideBlock = makeBlock(generateId(), 'motion_glidesecstoxy', {
            topLevel: true,
            x: 200,
            y: 200
        });
        player.blocks.createBlock(glideBlock);

        const sayBlock = makeBlock(generateId(), 'looks_sayforsecs', {
            topLevel: true,
            x: 200,
            y: 300
        });
        player.blocks.createBlock(sayBlock);
        vm.emitWorkspaceUpdate();
        await wait(500);
    }

    log('Pong scenario complete!');
};

/**
 * Run a simulation scenario.
 * @param {VM} vm - the Scratch VM instance
 * @param {string} scenarioName - which scenario to run
 * @param {object} opts - options
 * @param {Function} opts.onLog - logging callback (defaults to console.log)
 * @returns {Promise}
 */
/* eslint-disable no-console */
const runScenario = async (vm, scenarioName, opts = {}) => {
    const log = opts.onLog ||
        ((...args) => console.log('[ProcessSimulator]', ...args));

    const scenarios = {
        pong: pongScenario
    };

    const scenario = scenarios[scenarioName];
    if (!scenario) {
        throw new Error(`Unknown scenario: "${scenarioName}". Available: ${Object.keys(scenarios).join(', ')}`);
    }

    log(`Running scenario: ${scenarioName}`);
    const startTime = Date.now();

    try {
        await scenario(vm, log);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        log(`Scenario "${scenarioName}" completed in ${elapsed}s`);
    } catch (e) {
        log(`Scenario "${scenarioName}" failed: ${e.message}`);
        throw e;
    }
};

/**
 * Clear all process data and re-run a scenario.
 * @param {VM} vm
 * @param {ProcessStorage} storage
 * @param {string} scenarioName
 * @returns {Promise}
 */
const recaptureScenario = async (vm, storage, scenarioName, opts = {}) => {
    const log = opts.onLog ||
        ((...args) => console.log('[ProcessSimulator]', ...args));

    // Stop the active recorder so it doesn't write to a stale session
    const recorder = vm.processRecorder;
    if (recorder) {
        await recorder.stop();
    }

    log('Clearing existing process data...');
    const sessions = await storage.getSessions();
    for (const session of sessions) {
        await storage.deleteSession(session.id);
    }
    log(`Cleared ${sessions.length} sessions`);

    // Restart the recorder so it creates a fresh session
    if (recorder) {
        await recorder.start();
    }

    await runScenario(vm, scenarioName, {onLog: log});
};

/**
 * Install the simulator on window for console access.
 * @param {VM} vm
 * @param {ProcessStorage} storage
 */
const installSimulator = (vm, storage) => {
    window.__processSimulator = {
        run: (scenarioName = 'pong') => runScenario(vm, scenarioName),
        recapture: (scenarioName = 'pong') => recaptureScenario(vm, storage, scenarioName),
        scenarios: ['pong']
    };
    console.log('[ProcessSimulator] Installed. Use __processSimulator.run("pong")');
};

export {
    runScenario,
    recaptureScenario,
    installSimulator
};
