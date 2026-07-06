// Opcodes are namespaced strings (`<libId>_<opcode>`); bracket access reads clearer.
/* eslint-disable dot-notation */
const tap = require('tap');
const Runtime = require('../../src/engine/runtime');
const {JsSvgManager, isSafeAttribute} = require('../../src/extension-support/js-blocks/svg-store');

const test = tap.test;

/**
 * A tiny DOM stand-in: just the element surface svg-store touches
 * (getAttribute/setAttribute/removeAttribute, textContent, children).
 */
class FakeElement {
    constructor (tag, attrs, children) {
        this.nodeName = tag;
        this.attrs = Object.assign({}, attrs);
        this.children = children || [];
        this._text = '';
    }
    getAttribute (name) {
        return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    }
    setAttribute (name, value) {
        this.attrs[name] = String(value);
    }
    removeAttribute (name) {
        delete this.attrs[name];
    }
    get textContent () {
        return this._text;
    }
    set textContent (value) {
        this._text = String(value);
    }
    toString () {
        const attrs = Object.keys(this.attrs)
            .map(name => ` ${name}="${this.attrs[name]}"`)
            .join('');
        const inner = this._text + this.children.map(c => c.toString()).join('');
        return `<${this.nodeName}${attrs}>${inner}</${this.nodeName}>`;
    }
}

/**
 * Build the canned "costume document" every fake parse returns:
 *   svg > text#label("HELLO"), g#arm[transform, data-pivot], circle#dot[fill].
 * @returns {FakeElement} the root element.
 */
const makeTree = () => {
    const label = new FakeElement('text', {id: 'label'});
    label.textContent = 'HELLO';
    const arm = new FakeElement('g', {'id': 'arm', 'transform': 'translate(2 3)', 'data-pivot': '10 20'});
    const dot = new FakeElement('circle', {id: 'dot', fill: '#ff0000'});
    return new FakeElement('svg', {xmlns: 'http://www.w3.org/2000/svg'}, [label, arm, dot]);
};

class FakeDOMParser {
    parseFromString (source) {
        if (String(source).indexOf('<svg') === -1) {
            return {documentElement: new FakeElement('parsererror', {})};
        }
        return {documentElement: makeTree()};
    }
}

class FakeXMLSerializer {
    serializeToString (doc) {
        return doc.documentElement.toString();
    }
}

const FAKE_DOM = {DOMParser: FakeDOMParser, XMLSerializer: FakeXMLSerializer};

const SVG_SOURCE = '<svg xmlns="http://www.w3.org/2000/svg"><text id="label">HELLO</text></svg>';

/**
 * A renderer stub recording updateSVGSkin calls.
 * @returns {object} the fake renderer.
 */
const makeRenderer = () => ({
    updates: [],
    updateSVGSkin (skinId, svgText, rotationCenter) {
        this.updates.push({skinId, svgText, rotationCenter});
    }
});

/**
 * A fake target wearing one vector costume (skinId 7, center [50, 60]).
 * @param {object} [costumeOverrides] - properties to override on the costume.
 * @returns {object} the fake target.
 */
const makeTarget = costumeOverrides => {
    const costume = Object.assign({
        name: 'face',
        dataFormat: 'svg',
        skinId: 7,
        rotationCenterX: 50,
        rotationCenterY: 60,
        asset: {decodeText: () => SVG_SOURCE}
    }, costumeOverrides);
    return {
        currentCostume: 0,
        isOriginal: true,
        sprite: {costumes: [costume]},
        costume
    };
};

/**
 * A runtime with a recording renderer and a fake-DOM svg manager installed.
 * @returns {object} {runtime, manager, renderer}.
 */
const makeRig = () => {
    const runtime = new Runtime();
    const renderer = makeRenderer();
    runtime.renderer = renderer;
    const manager = new JsSvgManager(runtime, FAKE_DOM);
    runtime._jsSvgSkins = manager;
    return {runtime, manager, renderer};
};

test('setText edits the document and flushDirty uploads it once', t => {
    const {runtime, manager, renderer} = makeRig();
    const target = makeTarget();

    manager.setText(target, 'label', 'HI THERE');
    t.equal(renderer.updates.length, 0, 'no upload before flush');

    let redraws = 0;
    runtime.requestRedraw = () => redraws++;
    manager.flushDirty();
    t.equal(renderer.updates.length, 1, 'one upload after flush');
    t.equal(renderer.updates[0].skinId, 7, 'uploads to the costume skin');
    t.same(renderer.updates[0].rotationCenter, [50, 60], 'keeps the costume rotation center');
    t.match(renderer.updates[0].svgText, /HI THERE/, 'serialized SVG contains the new text');
    t.equal(redraws, 1, 'requests a redraw');

    manager.flushDirty();
    t.equal(renderer.updates.length, 1, 'clean records are not re-uploaded');
    t.end();
});

test('attribute writes are guarded; reads work', t => {
    const {manager} = makeRig();
    const target = makeTarget();

    t.notOk(isSafeAttribute('onclick'), 'event handler attributes are unsafe');
    t.notOk(isSafeAttribute('href'), 'href is unsafe');
    t.notOk(isSafeAttribute('xlink:href'), 'xlink:href is unsafe');
    t.ok(isSafeAttribute('fill'), 'fill is safe');

    manager.setAttribute(target, 'dot', 'onclick', 'alert(1)');
    manager.setAttribute(target, 'dot', 'href', 'http://example.com');
    t.equal(manager.getAttribute(target, 'dot', 'onclick'), '', 'onclick was not written');
    t.equal(manager.getAttribute(target, 'dot', 'href'), '', 'href was not written');

    manager.setAttribute(target, 'dot', 'fill', '#00ff00');
    t.equal(manager.getAttribute(target, 'dot', 'fill'), '#00ff00', 'fill was written');
    t.equal(manager.getAttribute(target, 'dot', 'missing'), '', 'absent attribute reads as empty');
    t.end();
});

test('transforms compose in slots and keep the authored transform', t => {
    const {manager} = makeRig();
    const target = makeTarget();

    manager.setRotate(target, 'arm', 45, null, null);
    t.equal(manager.getAttribute(target, 'arm', 'transform'),
        'translate(2 3) rotate(45 10 20)',
        'rotate uses the data-pivot and keeps the authored transform');

    manager.setTranslate(target, 'arm', 5, 8);
    t.equal(manager.getAttribute(target, 'arm', 'transform'),
        'translate(2 3) translate(5 -8) rotate(45 10 20)',
        'move composes with rotate; dy is Scratch-up (negated for SVG)');

    manager.setRotate(target, 'arm', -10, 0, 0);
    t.equal(manager.getAttribute(target, 'arm', 'transform'),
        'translate(2 3) translate(5 -8) rotate(-10 0 0)',
        'rotate slot has SET semantics and an explicit pivot wins');

    manager.setScale(target, 'dot', 2, null, null);
    t.equal(manager.getAttribute(target, 'dot', 'transform'),
        'translate(0 0) scale(2) translate(0 0)',
        'scale pivots about the origin when no pivot is given or authored');
    t.end();
});

test('listIds walks the document; show/hide toggle display', t => {
    const {manager} = makeRig();
    const target = makeTarget();

    t.same(manager.listIds(target), ['label', 'arm', 'dot'], 'ids in document order');

    manager.setAttribute(target, 'arm', 'display', 'none');
    t.equal(manager.getAttribute(target, 'arm', 'display'), 'none', 'hidden');
    manager.setAttribute(target, 'arm', 'display', 'inline');
    t.equal(manager.getAttribute(target, 'arm', 'display'), 'inline', 'shown');
    t.end();
});

test('resetFor and disposeAll restore the stored SVG source exactly', t => {
    const {manager, renderer} = makeRig();
    const target = makeTarget();

    manager.setText(target, 'label', 'CHANGED');
    manager.flushDirty();
    manager.resetFor(target);
    t.equal(renderer.updates.length, 2, 'reset uploads immediately');
    t.equal(renderer.updates[1].svgText, SVG_SOURCE, 'reset restores the asset source verbatim');
    t.equal(manager.records.size, 0, 'record dropped after reset');

    manager.setText(target, 'label', 'CHANGED AGAIN');
    manager.disposeAll();
    t.equal(renderer.updates[renderer.updates.length - 1].svgText, SVG_SOURCE,
        'disposeAll restores the asset source');
    t.equal(manager.records.size, 0, 'all records dropped');
    t.end();
});

test('disposeForTarget drops records without restoring; clones are ignored', t => {
    const {manager, renderer} = makeRig();
    const target = makeTarget();

    manager.setText(target, 'label', 'X');
    const clone = Object.assign({}, target, {isOriginal: false});
    manager.disposeForTarget(clone);
    t.equal(manager.records.size, 1, 'clone disposal keeps the shared costume record');

    manager.disposeForTarget(target);
    t.equal(manager.records.size, 0, 'original disposal drops the record');
    t.equal(renderer.updates.length, 0, 'no restore upload for a dying skin');
    t.end();
});

test('non-vector costumes and broken SVG are safe no-ops', t => {
    const {manager} = makeRig();

    const bitmapTarget = makeTarget({dataFormat: 'png'});
    manager.setText(bitmapTarget, 'label', 'X');
    t.same(manager.listIds(bitmapTarget), [], 'bitmap costume lists no ids');
    t.equal(manager.records.size, 0, 'no record for a bitmap costume');

    const brokenTarget = makeTarget({asset: {decodeText: () => 'not markup'}});
    manager.setText(brokenTarget, 'label', 'X');
    t.equal(manager.records.size, 0, 'no record when parsing fails');

    const throwingTarget = makeTarget({asset: {decodeText: () => {
        throw new Error('nope');
    }}});
    manager.setText(throwingTarget, 'label', 'X');
    t.equal(manager.records.size, 0, 'no record when the asset cannot be decoded');
    t.end();
});

test('headless (no DOM implementation) degrades to no-ops', t => {
    const runtime = new Runtime();
    const manager = new JsSvgManager(runtime, {DOMParser: null, XMLSerializer: null});
    const target = makeTarget();

    t.notOk(manager.available(), 'no DOM available');
    manager.setText(target, 'label', 'X');
    manager.setRotate(target, 'arm', 45, null, null);
    manager.flushDirty();
    manager.disposeAll();
    t.same(manager.listIds(target), [], 'listIds returns empty');
    t.equal(manager.getAttribute(target, 'dot', 'fill'), '', 'getAttribute returns empty');
    t.end();
});

test('Scratch.svg is reachable from an authored block body', t => {
    const {runtime, manager, renderer} = makeRig();
    const target = makeTarget();
    target.getName = () => 'sprite1';
    target.effects = {};

    runtime.installCustomLibrary({
        id: 'jslib_svg',
        name: 'Svg Lib',
        color1: '#59C059',
        color2: '#46B946',
        color3: '#389438',
        blocks: [
            {
                opcode: 'writeLabel',
                type: 'command',
                signature: {
                    text: 'write [t]',
                    arguments: {t: {type: 'text', defaultValue: 'hi'}}
                },
                jsCompiled: 'Scratch.svg.setText("label", Scratch.args.t);'
            },
            {
                opcode: 'partIds',
                type: 'reporter',
                signature: {text: 'part ids', arguments: {}},
                jsCompiled: 'return Scratch.svg.ids().join(",");'
            }
        ]
    });

    const util = {
        runtime,
        target,
        stackFrame: {},
        thread: {peekStackFrame: () => ({warpMode: false})},
        yield: () => {}
    };
    runtime._primitives['jslib_svg_writeLabel']({t: 'FROM BLOCK'}, util);
    manager.flushDirty();
    t.match(renderer.updates[0].svgText, /FROM BLOCK/, 'block edit reached the skin');

    const util2 = {
        runtime,
        target,
        stackFrame: {},
        thread: {peekStackFrame: () => ({warpMode: false})},
        yield: () => {}
    };
    const ids = runtime._primitives['jslib_svg_partIds']({}, util2);
    t.equal(ids, 'label,arm,dot', 'ids reporter reads the document');
    t.end();
});
