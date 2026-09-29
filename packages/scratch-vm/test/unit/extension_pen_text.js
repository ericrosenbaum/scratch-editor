const test = require('tap').test;
const PenText = require('../../src/extensions/scratch3_pen_text/index.js');
const font = require('../../src/extensions/scratch3_pen_text/font.js');
const {layoutText, measureText, headingVectors, LINE_LEADING} =
    require('../../src/extensions/scratch3_pen_text/text-writer.js');

const makeTarget = () => {
    const state = {};
    const target = {
        x: 0,
        y: 0,
        direction: 90,
        isStage: false,
        getCustomState: key => state[key],
        setCustomState: (key, value) => {
            state[key] = value;
        },
        setXY: (x, y) => {
            target.x = x;
            target.y = y;
        }
    };
    return target;
};

const makeFixture = () => {
    const calls = [];
    const renderer = {
        createPenSkin: () => 7,
        createDrawable: () => 3,
        updateDrawableSkinId: () => {},
        penLine: (...args) => calls.push(['penLine', ...args]),
        penClear: (...args) => calls.push(['penClear', ...args])
    };
    const runtime = {
        renderer,
        on: () => {},
        requestRedraw: () => calls.push(['requestRedraw'])
    };
    return {calls, runtime, blocks: new PenText(runtime)};
};

test('font data covers printable ASCII with expected metrics', t => {
    for (let code = 32; code <= 126; code++) {
        t.ok(font.glyphs[String.fromCharCode(code)], `glyph for code ${code}`);
    }
    t.equal(font.capHeight, 21);
    t.equal(font.glyphs[' '].strokes.length, 0);
    t.end();
});

test('font data covers Latin accents, Greek, Cyrillic and Japanese kana', t => {
    for (const ch of 'àéîõüçñßÿ¿¡ÀÉÎÕÜÇÑ') {
        t.ok(font.glyphs[ch], `Latin accent glyph for ${ch}`);
    }
    for (const ch of 'ΑΒΓΔΩαβγδωάόώςϊϋ') {
        t.ok(font.glyphs[ch], `Greek glyph for ${ch}`);
    }
    for (let code = 0x410; code <= 0x44F; code++) {
        t.ok(font.glyphs[String.fromCharCode(code)],
            `Cyrillic glyph for U+${code.toString(16)}`);
    }
    t.ok(font.glyphs['Ё'], 'glyph for Yo');
    t.ok(font.glyphs['ё'], 'glyph for yo');
    for (const ch of 'あいうえおんがぱっゃアイウエオンガパッャー。、日') {
        t.ok(font.glyphs[ch], `Japanese glyph for ${ch}`);
    }
    // Small kana are scaled-down copies of the full-size kana.
    t.ok(font.glyphs['っ'].advance < font.glyphs['つ'].advance);
    t.end();
});

test('layoutText produces exact segments for a known glyph at scale 1', t => {
    // At size 21 the scale is 1, so segments equal the raw font coordinates.
    const {segments} = layoutText('A', 0, 0, 21);
    t.same(segments, [
        [9, 21, 1, 0],
        [9, 21, 17, 0],
        [4, 7, 14, 7]
    ]);
    t.end();
});

test('layoutText applies anchor offset, scale and advances', t => {
    // 'AA' at size 42 (scale 2): second glyph starts advance*2 to the right.
    const {segments} = layoutText('AA', 10, -20, 42);
    t.same(segments[0], [28, 22, 12, -20]);
    const secondGlyphX = 10 + (font.glyphs.A.advance * 2);
    t.same(segments[3], [secondGlyphX + 18, 22, secondGlyphX + 2, -20]);
    t.end();
});

test('layoutText handles newlines', t => {
    const size = 21;
    const oneLine = layoutText('A', 0, 0, size).segments;
    const twoLines = layoutText('A\nA', 0, 0, size).segments;
    t.equal(twoLines.length, oneLine.length * 2);
    // Second line starts back at x=0, one leading below the first baseline.
    t.same(twoLines[3], [9, 21 - (LINE_LEADING * size), 1, 0 - (LINE_LEADING * size)]);
    t.end();
});

test('layoutText draws a fallback box for unknown characters', t => {
    const known = layoutText('AB', 0, 0, 21).segments;
    // U+2603 SNOWMAN has no glyph: expect A's segments, a 4-segment box,
    // then B shifted right by the fallback advance.
    const withUnknown = layoutText('A☃B', 0, 0, 21).segments;
    t.equal(withUnknown.length, known.length + 4, 'unknown char draws a box');
    t.equal(withUnknown[7][0], known[3][0] + 16, 'B shifts by the fallback advance');
    t.end();
});

test('layoutText advances silently for glyphless whitespace', t => {
    // No-break space has no glyph but must not draw a fallback box.
    const segments = layoutText('A B', 0, 0, 21).segments;
    const known = layoutText('AB', 0, 0, 21).segments;
    t.equal(segments.length, known.length, 'no box for whitespace');
    t.equal(segments[3][0], known[3][0] + font.glyphs[' '].advance);
    t.end();
});

test('layoutText normalizes decomposed accents to NFC', t => {
    const precomposed = layoutText('é', 0, 0, 21).segments;
    const decomposed = layoutText('é', 0, 0, 21).segments;
    t.same(decomposed, precomposed, 'e + combining acute matches é');
    t.end();
});

test('layoutText reports the pen position after the last glyph', t => {
    // At size 21 (scale 1) the end sits one advance past the origin.
    const {endX, endY} = layoutText('A', 5, -3, 21);
    t.equal(endX, 5 + font.glyphs.A.advance);
    t.equal(endY, -3);
    t.end();
});

test('layoutText rotates along the heading', t => {
    // Direction 0 points up: forward = (0, 1), so the baseline runs upward and
    // the end sits one advance above the origin.
    const {segments, endX, endY} = layoutText('A', 0, 0, 21, 0);
    t.same(segments[0], [-21, 9, 0, 1], 'first segment is rotated 90 degrees CCW');
    t.equal(endX, 0);
    t.equal(endY, font.glyphs.A.advance);
    t.end();
});

test('layoutText at direction 90 matches unrotated layout', t => {
    t.same(layoutText('Ag!', 3, 7, 30, 90), layoutText('Ag!', 3, 7, 30));
    t.end();
});

test('measureText returns the widest line', t => {
    const size = 21;
    t.equal(measureText('A', size), font.glyphs.A.advance);
    t.equal(measureText('AA\nA', size), font.glyphs.A.advance * 2);
    t.equal(measureText('Aé', size), font.glyphs.A.advance + font.glyphs['é'].advance);
    t.end();
});

test('write draws every glyph segment with state color and derived diameter', t => {
    const {calls, blocks} = makeFixture();
    const target = makeTarget();
    blocks.write({TEXT: 'A'}, {target});

    const penLines = calls.filter(call => call[0] === 'penLine');
    t.equal(penLines.length, font.glyphs.A.strokes.length, 'one penLine per segment of A');
    const [, skinId, attributes] = penLines[0];
    t.equal(skinId, 7);
    t.same(attributes.color4f, [0, 0, 1, 1], 'default color is blue');
    t.equal(attributes.diameter, 2, 'size 24 draws with diameter 2');
    t.end();
});

test('write and erase do not request a redraw', t => {
    // The renderer draws every frame anyway; requesting a redraw would end the
    // frame's thread stepping, limiting a script to one update per frame.
    const {calls, blocks} = makeFixture();
    blocks.write({TEXT: 'A'}, {target: makeTarget()});
    blocks.clear();
    t.notOk(calls.some(call => call[0] === 'requestRedraw'));
    t.end();
});

test('write uses the target position', t => {
    const {calls, blocks} = makeFixture();
    const target = makeTarget();
    target.x = 50;
    target.y = -60;
    blocks.write({TEXT: 'A'}, {target});

    const penLines = calls.filter(call => call[0] === 'penLine');
    const {segments} = layoutText('A', 50, -60, 24);
    t.same(penLines.map(call => call.slice(3)), segments);
    t.end();
});

test('write moves the sprite to the end of the text', t => {
    const {blocks} = makeFixture();
    const target = makeTarget();
    target.x = 50;
    target.y = -60;
    blocks.write({TEXT: 'Hi'}, {target});

    const {endX, endY} = layoutText('Hi', 50, -60, 24);
    t.equal(target.x, endX, 'sprite x advanced to the end of the text');
    t.equal(target.y, endY, 'sprite y unchanged for upright text');
    t.end();
});

test('write follows the sprite heading', t => {
    const {calls, blocks} = makeFixture();
    const target = makeTarget();
    target.direction = 0; // pointing up
    blocks.write({TEXT: 'A'}, {target});

    const penLines = calls.filter(call => call[0] === 'penLine');
    const {segments, endX, endY} = layoutText('A', 0, 0, 24, 0);
    t.same(penLines.map(call => call.slice(3)), segments, 'glyph rotated along heading');
    t.equal(target.x, endX);
    t.equal(target.y, endY, 'sprite moved upward along its heading');
    t.end();
});

test('newLine returns to the left margin and drops one line', t => {
    const {blocks} = makeFixture();
    const target = makeTarget();
    target.x = 30;
    target.y = 40;
    blocks.setSize({SIZE: 20}, {target});
    blocks.write({TEXT: 'Hello'}, {target});
    // The sprite is now at the end of "Hello"; a new line returns to x=30 and
    // drops one leading below the line's baseline.
    blocks.newLine({}, {target});
    t.equal(target.x, 30, 'x returns to the line start');
    t.equal(target.y, 40 - (LINE_LEADING * 20), 'y drops one leading');
    t.end();
});

test('newLine drops along the sprite heading', t => {
    const {blocks} = makeFixture();
    const target = makeTarget();
    target.direction = 0; // pointing up: "down" a line means moving left in x
    blocks.setSize({SIZE: 20}, {target});
    blocks.write({TEXT: 'Hello'}, {target});
    blocks.newLine({}, {target});
    const {ux, uy} = headingVectors(0);
    t.equal(target.x, 0 - (ux * LINE_LEADING * 20));
    t.equal(target.y, 0 - (uy * LINE_LEADING * 20));
    t.end();
});

test('setSize clamps to the allowed range', t => {
    const {blocks} = makeFixture();
    const target = makeTarget();
    const util = {target};

    blocks.setSize({SIZE: 100000}, util);
    t.equal(blocks._getTextState(target).size, PenText.SIZE_RANGE.max);

    blocks.setSize({SIZE: -5}, util);
    t.equal(blocks._getTextState(target).size, PenText.SIZE_RANGE.min);

    blocks.setSize({SIZE: 48}, util);
    t.equal(blocks._getTextState(target).size, 48);
    t.end();
});

test('setColor converts hex colors to color4f', t => {
    const {blocks} = makeFixture();
    const target = makeTarget();
    blocks.setColor({COLOR: '#ff0000'}, {target});
    t.same(blocks._getTextState(target).color4f, [1, 0, 0, 1]);
    t.end();
});

test('clones receive a deep copy of the text state', t => {
    const {blocks} = makeFixture();
    const source = makeTarget();
    const clone = makeTarget();

    blocks.setSize({SIZE: 60}, {target: source});
    blocks._onTargetCreated(clone, source);
    blocks.setSize({SIZE: 8}, {target: source});

    t.equal(blocks._getTextState(clone).size, 60, 'clone keeps the state from creation time');
    t.equal(blocks._getTextState(source).size, 8);
    t.end();
});

test('clear clears the extension\'s own pen skin', t => {
    const {calls, blocks} = makeFixture();
    blocks.clear();
    t.same(calls.filter(call => call[0] === 'penClear'), [['penClear', 7]]);
    t.end();
});
