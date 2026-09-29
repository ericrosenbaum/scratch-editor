const test = require('tap').test;
const Stretch = require('../../src/extensions/scratch3_stretch/index.js');
const RenderedTarget = require('../../src/sprites/rendered-target');
const Sprite = require('../../src/sprites/sprite');
const Runtime = require('../../src/engine/runtime');
const FakeRenderer = require('../fixtures/fake-renderer');

const makeTarget = () => {
    const runtime = new Runtime();
    const target = new RenderedTarget(new Sprite(null, runtime), runtime);
    target.renderer = new FakeRenderer();
    return {runtime, target, util: {target}, blocks: new Stretch(runtime)};
};

test('stretch and squish change one axis by a percentage', t => {
    const {target, util, blocks} = makeTarget();
    blocks.stretch({AXIS: 'width', AMOUNT: 50}, util);
    t.same(target.stretch, [150, 100]);
    blocks.squish({AXIS: 'height', AMOUNT: 25}, util);
    t.same(target.stretch, [150, 75]);
    t.end();
});

test('set and reset stretch', t => {
    const {target, util, blocks} = makeTarget();
    blocks.setStretch({AXIS: 'height', PERCENT: 200}, util);
    t.same(target.stretch, [100, 200]);
    blocks.resetStretch({}, util);
    t.same(target.stretch, [100, 100]);
    t.end();
});

test('stretch is applied on top of size and left-right flipping', t => {
    const {target, util, blocks} = makeTarget();
    target.size = 50;
    blocks.setStretch({AXIS: 'width', PERCENT: 200}, util);
    t.same(target._getRenderedDirectionAndScale().scale, [100, 50]);
    target.rotationStyle = RenderedTarget.ROTATION_STYLE_LEFT_RIGHT;
    target.direction = -90;
    t.same(target._getRenderedDirectionAndScale().scale, [-100, 50]);
    t.end();
});

test('clones copy stretch without sharing it', t => {
    const {runtime, target, util, blocks} = makeTarget();
    runtime.addTarget(target);
    blocks.setStretch({AXIS: 'width', PERCENT: 150}, util);
    const clone = target.makeClone();
    t.same(clone.stretch, [150, 100]);
    blocks.setStretch({AXIS: 'width', PERCENT: 80}, {target: clone});
    t.same(target.stretch, [150, 100]);
    t.end();
});

test('non-numeric stretch is ignored', t => {
    const {target} = makeTarget();
    target.setStretch(NaN, 100);
    t.same(target.stretch, [100, 100]);
    t.end();
});
