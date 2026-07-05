const test = require('tap').test;
const Looks = require('../../src/blocks/scratch3_looks');
const Runtime = require('../../src/engine/runtime');
const Sprite = require('../../src/sprites/sprite.js');
const RenderedTarget = require('../../src/sprites/rendered-target.js');
const util = {
    target: {
        currentCostume: 0, // Internally, current costume is 0 indexed
        getCostumes: function () {
            return this.sprite.costumes;
        },
        sprite: {
            costumes: [
                {name: 'first name'},
                {name: 'second name'},
                {name: 'third name'}
            ]
        },
        _customState: {},
        getCustomState: () => util.target._customState
    }
};

const fakeRuntime = {
    getTargetForStage: () => util.target, // Just return the dummy target above.
    on: () => {} // Stub out listener methods used in constructor.
};
const blocks = new Looks(fakeRuntime);

/**
 * Test which costume index the `switch costume`
 * block will jump to given an argument and array
 * of costume names. Works for backdrops if isStage is set.
 * @param {string[]} costumes List of costume names as strings
 * @param {string|number|boolean} arg The argument to provide to the block.
 * @param {number} [currentCostume] The 1-indexed default costume for the sprite to start at.
 * @param {boolean} [isStage] Whether the sprite is the stage
 * @returns {number} The 1-indexed costume index on which the sprite lands.
 */
const testCostume = (costumes, arg, currentCostume = 1, isStage = false) => {
    const rt = new Runtime();
    const looks = new Looks(rt);

    const sprite = new Sprite(null, rt);
    const target = new RenderedTarget(sprite, rt);

    sprite.costumes = costumes.map(name => ({name: name}));
    target.currentCostume = currentCostume - 1; // Convert to 0-indexed.

    if (isStage) {
        target.isStage = true;
        rt.addTarget(target);
        looks.switchBackdrop({BACKDROP: arg}, {target});
    } else {
        looks.switchCostume({COSTUME: arg}, {target});
    }

    return target.currentCostume + 1; // Convert to 1-indexed.
};


/**
 * Test which backdrop index the `switch backdrop`
 * block will jump to given an argument and array
 * of backdrop names.
 * @param {string[]} backdrops List of backdrop names as strings
 * @param {string|number|boolean} arg The argument to provide to the block.
 * @param {number} [currentCostume] The 1-indexed default backdrop for the stage to start at.
 * @returns {number} The 1-indexed backdrop index on which the stage lands.
 */
const testBackdrop = (backdrops, arg, currentCostume = 1) => testCostume(backdrops, arg, currentCostume, true);

test('switch costume block runs correctly', t => {
    // Non-existant costumes do nothing
    t.equal(testCostume(['a', 'b', 'c', 'd'], 'e', 3), 3);

    // Numeric arguments are always the costume index
    // String arguments are treated as costume names, and coerced to
    // a costume index as a fallback
    t.equal(testCostume(['a', 'b', 'c', '2'], 2), 2);
    t.equal(testCostume(['a', 'b', 'c', '2'], '2'), 4);
    t.equal(testCostume(['a', 'b', 'c'], '2'), 2);

    // 'previous costume' and 'next costume' increment/decrement
    t.equal(testCostume(['a', 'b', 'c', 'd'], 'previous costume', 3), 2);
    t.equal(testCostume(['a', 'b', 'c', 'd'], 'next costume', 2), 3);

    // 'previous costume' and 'next costume' can be overriden
    t.equal(testCostume(['a', 'previous costume', 'c', 'd'], 'previous costume'), 2);
    t.equal(testCostume(['next costume', 'b', 'c', 'd'], 'next costume'), 1);

    // NaN, Infinity, and true are the first costume
    t.equal(testCostume(['a', 'b', 'c', 'd'], NaN, 2), 1);
    t.equal(testCostume(['a', 'b', 'c', 'd'], true, 2), 1);
    t.equal(testCostume(['a', 'b', 'c', 'd'], Infinity, 2), 1);
    t.equal(testCostume(['a', 'b', 'c', 'd'], -Infinity, 2), 1);

    // 'previous backdrop' and 'next backdrop' have no effect
    t.equal(testCostume(['a', 'b', 'c', 'd'], 'previous backdrop', 3), 3);
    t.equal(testCostume(['a', 'b', 'c', 'd'], 'next backdrop', 3), 3);

    // Strings with no digits are not numeric
    t.equal(testCostume(['a', 'b', 'c', 'd'], '    ', 2), 2);

    // False is 0 (the last costume)
    t.equal(testCostume(['a', 'b', 'c', 'd'], false), 4);

    // Booleans are costume names where possible.
    t.equal(testCostume(['a', 'true', 'false', 'd'], false), 3);
    t.equal(testCostume(['a', 'true', 'false', 'd'], true), 2);

    // Costume indices should wrap around.
    t.equal(testCostume(['a', 'b', 'c', 'd'], -1), 3);
    t.equal(testCostume(['a', 'b', 'c', 'd'], -4), 4);
    t.equal(testCostume(['a', 'b', 'c', 'd'], 10), 2);

    t.end();
});

test('switch backdrop block runs correctly', t => {
    // Non-existant backdrops do nothing
    t.equal(testBackdrop(['a', 'b', 'c', 'd'], 'e', 3), 3);

    // Difference between string and numeric arguments
    t.equal(testBackdrop(['a', 'b', 'c', '2'], 2), 2);
    t.equal(testBackdrop(['a', 'b', 'c', '2'], '2'), 4);

    // 'previous backdrop' and 'next backdrop' increment/decrement
    t.equal(testBackdrop(['a', 'b', 'c', 'd'], 'previous backdrop', 3), 2);
    t.equal(testBackdrop(['a', 'b', 'c', 'd'], 'next backdrop', 2), 3);

    // 'previous backdrop', 'previous backdrop', 'random backdrop' can be overriden
    // Test is deterministic since 'random backdrop' will not pick the same backdrop as currently selected
    t.equal(testBackdrop(['a', 'previous backdrop', 'c', 'd'], 'previous backdrop', 4), 2);
    t.equal(testBackdrop(['next backdrop', 'b', 'c', 'd'], 'next backdrop', 3), 1);
    t.equal(testBackdrop(['random backdrop', 'b', 'c', 'd'], 'random backdrop'), 1);

    // NaN, Infinity, and true are the first costume
    t.equal(testBackdrop(['a', 'b', 'c', 'd'], NaN, 2), 1);
    t.equal(testBackdrop(['a', 'b', 'c', 'd'], true, 2), 1);
    t.equal(testBackdrop(['a', 'b', 'c', 'd'], Infinity, 2), 1);
    t.equal(testBackdrop(['a', 'b', 'c', 'd'], -Infinity, 2), 1);

    // 'previous costume' and 'next costume' have no effect
    t.equal(testBackdrop(['a', 'b', 'c', 'd'], 'previous costume', 3), 3);
    t.equal(testBackdrop(['a', 'b', 'c', 'd'], 'next costume', 3), 3);

    // Strings with no digits are not numeric
    t.equal(testBackdrop(['a', 'b', 'c', 'd'], '    ', 2), 2);

    // False is 0 (the last costume)
    t.equal(testBackdrop(['a', 'b', 'c', 'd'], false), 4);

    // Booleans are backdrop names where possible.
    t.equal(testBackdrop(['a', 'true', 'false', 'd'], false), 3);
    t.equal(testBackdrop(['a', 'true', 'false', 'd'], true), 2);

    // Backdrop indices should wrap around.
    t.equal(testBackdrop(['a', 'b', 'c', 'd'], -1), 3);
    t.equal(testBackdrop(['a', 'b', 'c', 'd'], -4), 4);
    t.equal(testBackdrop(['a', 'b', 'c', 'd'], 10), 2);

    t.end();
});

test('getCostumeNumberName returns 1-indexed costume number', t => {
    util.target.currentCostume = 0; // This is 0-indexed.
    const args = {NUMBER_NAME: 'number'};
    const number = blocks.getCostumeNumberName(args, util);
    t.equal(number, 1);
    t.end();
});

test('getCostumeNumberName can return costume name', t => {
    util.target.currentCostume = 0; // This is 0-indexed.
    const args = {NUMBER_NAME: 'name'};
    const name = blocks.getCostumeNumberName(args, util);
    t.equal(name, 'first name');
    t.end();
});

test('getBackdropNumberName returns 1-indexed costume number', t => {
    util.target.currentCostume = 2; // This is 0-indexed.
    const args = {NUMBER_NAME: 'number'};
    const number = blocks.getBackdropNumberName(args, util);
    t.equal(number, 3);
    t.end();
});

test('getBackdropNumberName can return costume name', t => {
    util.target.currentCostume = 2; // This is 0-indexed.
    const args = {NUMBER_NAME: 'name'};
    const number = blocks.getBackdropNumberName(args, util);
    t.equal(number, 'third name');
    t.end();
});

test('numbers should be rounded properly in say/think', t => {
    const rt = new Runtime();
    const looks = new Looks(rt);

    let expectedSayString;

    rt.addListener('SAY', () => {
        const bubbleState = util.target.getCustomState(Looks.STATE_KEY);
        t.equal(bubbleState.text, expectedSayString);
    });

    expectedSayString = '3.14';
    looks.say({MESSAGE: 3.14159}, util, 'say bubble should round to 2 decimal places');
    looks.think({MESSAGE: 3.14159}, util, 'think bubble should round to 2 decimal places');

    expectedSayString = '3';
    looks.say({MESSAGE: 3}, util, 'say bubble should not add decimal places to integers');
    looks.think({MESSAGE: 3}, util, 'think bubble should not add decimal places to integers');

    expectedSayString = '3.10';
    looks.say({MESSAGE: 3.1}, util, 'say bubble should round to 2 decimal places, even if only 1 is needed');
    looks.think({MESSAGE: 3.1}, util, 'think bubble should round to 2 decimal places, even if only 1 is needed');

    expectedSayString = '0.00125';
    looks.say({MESSAGE: 0.00125}, util, 'say bubble should not round if it would display small numbers as 0');
    looks.think({MESSAGE: 0.00125}, util, 'think bubble should not round if it would display small numbers as 0');

    expectedSayString = '1.99999';
    looks.say({MESSAGE: '1.99999'}, util, 'say bubble should not round strings');
    looks.think({MESSAGE: '1.99999'}, util, 'think bubble should not round strings');

    t.end();
});

test('clamp graphic effects', t => {
    const rt = new Runtime();
    const looks = new Looks(rt);
    const expectedValues = {
        brightness: {high: 100, low: -100},
        ghost: {high: 100, low: 0},
        color: {high: 500, low: -500},
        fisheye: {high: 500, low: -500},
        whirl: {high: 500, low: -500},
        pixelate: {high: 500, low: -500},
        mosaic: {high: 500, low: -500}
    };
    const args = [
        {EFFECT: 'brightness', VALUE: 500, CLAMP: 'high'},
        {EFFECT: 'brightness', VALUE: -500, CLAMP: 'low'},
        {EFFECT: 'ghost', VALUE: 500, CLAMP: 'high'},
        {EFFECT: 'ghost', VALUE: -500, CLAMP: 'low'},
        {EFFECT: 'color', VALUE: 500, CLAMP: 'high'},
        {EFFECT: 'color', VALUE: -500, CLAMP: 'low'},
        {EFFECT: 'fisheye', VALUE: 500, CLAMP: 'high'},
        {EFFECT: 'fisheye', VALUE: -500, CLAMP: 'low'},
        {EFFECT: 'whirl', VALUE: 500, CLAMP: 'high'},
        {EFFECT: 'whirl', VALUE: -500, CLAMP: 'low'},
        {EFFECT: 'pixelate', VALUE: 500, CLAMP: 'high'},
        {EFFECT: 'pixelate', VALUE: -500, CLAMP: 'low'},
        {EFFECT: 'mosaic', VALUE: 500, CLAMP: 'high'},
        {EFFECT: 'mosaic', VALUE: -500, CLAMP: 'low'}
    ];

    util.target.setEffect = function (effectName, actualValue) {
        const clamp = actualValue > 0 ? 'high' : 'low';
        rt.emit(effectName + clamp, effectName, actualValue);
    };

    for (const arg of args) {
        rt.addListener(arg.EFFECT + arg.CLAMP, (effectName, actualValue) => {
            const expected = expectedValues[arg.EFFECT][arg.CLAMP];
            t.equal(actualValue, expected);
        });

        looks.setEffect(arg, util);
    }
    t.end();
});

test('say bubbles anchor to the runtime bubble position provider when one is set', t => {
    const rt = new Runtime();
    const looks = new Looks(rt);

    const positions = [];
    rt.renderer = {
        createDrawable: () => 99,
        createTextSkin: () => 100,
        updateDrawableSkinId: () => {},
        updateTextSkin: () => {},
        destroyDrawable: () => {},
        destroySkin: () => {},
        getCurrentSkinSize: () => [60, 20],
        getNativeSize: () => [480, 360],
        updateDrawablePosition: (id, position) => positions.push(position)
    };

    const sprite = new Sprite(null, rt);
    const target = new RenderedTarget(sprite, rt);
    target.getBoundsForBubble = () => ({left: -10, right: 10, top: 40, bottom: 32});

    // With a provider (e.g. the 3D Pop-Up scene), its bounds win over the 2D ones.
    rt.setBubblePositionProvider(() => ({left: 90, right: 110, top: 60, bottom: 52}));
    looks._updateBubble(target, 'say', 'hello');
    t.same(positions.pop(), [110, 72], 'the bubble anchors to the provider bounds');

    // A provider returning null falls back to the target 2D bounds.
    rt.setBubblePositionProvider(() => null);
    looks._positionBubble(target);
    t.same(positions.pop(), [10, 52], 'a null provider result falls back to the 2D bounds');

    // No provider at all: same 2D fallback.
    rt.setBubblePositionProvider(null);
    looks._positionBubble(target);
    t.same(positions.pop(), [10, 52], 'without a provider the 2D bounds are used');

    looks._onTargetWillExit(target);
    t.end();
});
