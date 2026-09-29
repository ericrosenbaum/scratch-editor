const font = require('./font');

/**
 * Line height as a multiple of the text size.
 * @constant {number}
 */
const LINE_LEADING = 1.4;

/**
 * Advance, in font units, of the fallback box drawn for characters that have
 * no glyph.
 * @constant {number}
 */
const FALLBACK_ADVANCE = 16;

/**
 * Strokes of the fallback box (an empty rectangle spanning the x-height),
 * in font units.
 * @constant {Array.<Array.<Array.<number>>>}
 */
const FALLBACK_STROKES = [[[3, 0], [3, 14], [13, 14], [13, 0], [3, 0]]];

/**
 * Measure the width, in stage units, of the widest line of `text` when
 * rendered at the given size.
 * @param {string} text - the text to measure. May contain '\n'.
 * @param {number} size - text size (capital letter height) in stage units.
 * @returns {number} the width of the widest line in stage units.
 */
const measureText = (text, size) => {
    const scale = size / font.capHeight;
    let widest = 0;
    let lineWidth = 0;
    for (const ch of text.normalize('NFC')) {
        if (ch === '\n') {
            widest = Math.max(widest, lineWidth);
            lineWidth = 0;
            continue;
        }
        const glyph = font.glyphs[ch] ||
            (/\s/.test(ch) ? font.glyphs[' '] : null);
        lineWidth += (glyph ? glyph.advance : FALLBACK_ADVANCE) * scale;
    }
    return Math.max(widest, lineWidth);
};

/**
 * Unit vectors for laying out text along a Scratch heading. `forward` is the
 * direction the baseline advances; `up` is the glyphs' upward direction
 * (perpendicular, rotated 90° counter-clockwise from forward). At the default
 * direction of 90 (pointing right) these are forward = (1, 0) and up = (0, 1),
 * i.e. ordinary upright left-to-right text. Components are rounded to remove
 * floating-point noise so the cardinal directions are exact (e.g. cos(90°)
 * becomes 0, keeping direction 90 identical to unrotated layout).
 * @param {number} direction - Scratch heading in degrees (90 = right, 0 = up).
 * @returns {{fx: number, fy: number, ux: number, uy: number}} the forward
 *   (fx, fy) and up (ux, uy) unit vectors.
 */
const headingVectors = direction => {
    const rad = direction * Math.PI / 180;
    const round = v => Math.round(v * 1e10) / 1e10;
    const fx = round(Math.sin(rad));
    const fy = round(Math.cos(rad));
    return {fx, fy, ux: -fy, uy: fx};
};

/**
 * Lay out `text` as line segments ready to be drawn with the renderer's
 * `penLine`. The anchor (x, y) is the baseline of the first line at the left
 * edge of the first glyph; descenders extend "below" (opposite the heading's
 * up vector). Text is laid out along the given heading: at direction 90 it is
 * ordinary upright left-to-right text, and other directions rotate it.
 * Text is normalized to NFC first so decomposed accents match the font's
 * precomposed glyphs. Characters without a glyph draw a small empty box so
 * missing coverage is visible rather than silent. '\n' starts a new line
 * LINE_LEADING * size further along the heading's down direction. Single-point
 * strokes become zero-length segments, which penLine renders as dots thanks to
 * its round caps.
 * @param {string} text - the text to lay out.
 * @param {number} x - x coordinate of the anchor in stage units.
 * @param {number} y - y coordinate of the anchor (baseline) in stage units.
 * @param {number} size - text size (capital letter height) in stage units.
 * @param {number} [direction] - Scratch heading in degrees; defaults to 90
 *   (upright, left-to-right).
 * @returns {{segments: Array.<Array.<number>>, endX: number, endY: number}}
 *   the [x0, y0, x1, y1] segments, and the pen position after the last glyph
 *   (the baseline-left of where the next glyph would be drawn).
 */
const layoutText = (text, x, y, size, direction = 90) => {
    const scale = size / font.capHeight;
    const {fx, fy, ux, uy} = headingVectors(direction);
    // Map a font-local point (gx, gy), relative to origin (ox, oy), to world
    // space along the heading. Defined once and given the origin explicitly so
    // it never closes over the loop's mutable origin.
    const wx = (gx, gy, ox) => ox + (scale * ((gx * fx) + (gy * ux)));
    const wy = (gx, gy, oy) => oy + (scale * ((gx * fy) + (gy * uy)));
    const segments = [];
    // World position of the current glyph's baseline-left origin.
    let originX = x;
    let originY = y;
    let lineIndex = 0;
    for (const ch of text.normalize('NFC')) {
        if (ch === '\n') {
            lineIndex++;
            // Each new line drops one leading along the "down" direction (-up).
            originX = x - (ux * LINE_LEADING * size * lineIndex);
            originY = y - (uy * LINE_LEADING * size * lineIndex);
            continue;
        }
        const glyph = font.glyphs[ch] ||
            (/\s/.test(ch) ? font.glyphs[' '] : null);
        const strokes = glyph ? glyph.strokes : FALLBACK_STROKES;
        for (const stroke of strokes) {
            if (stroke.length === 1) {
                const px = wx(stroke[0][0], stroke[0][1], originX);
                const py = wy(stroke[0][0], stroke[0][1], originY);
                segments.push([px, py, px, py]);
                continue;
            }
            for (let i = 1; i < stroke.length; i++) {
                segments.push([
                    wx(stroke[i - 1][0], stroke[i - 1][1], originX),
                    wy(stroke[i - 1][0], stroke[i - 1][1], originY),
                    wx(stroke[i][0], stroke[i][1], originX),
                    wy(stroke[i][0], stroke[i][1], originY)
                ]);
            }
        }
        const advance = (glyph ? glyph.advance : FALLBACK_ADVANCE) * scale;
        originX += advance * fx;
        originY += advance * fy;
    }
    return {segments, endX: originX, endY: originY};
};

module.exports = {layoutText, measureText, headingVectors, LINE_LEADING};
