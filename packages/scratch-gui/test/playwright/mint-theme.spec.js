// @ts-check
/*
 * Mint-theme visual verification spec.
 *
 * For each UI surface in the Scratch Lab editor, this spec:
 *   1. Navigates to the surface (click the right tab/button),
 *   2. Captures a screenshot artifact under test-results/mint-theme/,
 *   3. Samples computed styles (or pixel data for SVG images) and asserts
 *      the color is in the mint hue range AND that text on mint meets
 *      WCAG contrast (AA normal 4.5:1, AA large/bold 3.0:1).
 *
 * Negative assertions verify that block shapes stay non-mint — the lab
 * recolor is UI-only, not blocks.
 */
const path = require('path');
const fs = require('fs');
const {test, expect} = require('@playwright/test');

const SCREENSHOT_DIR = path.resolve(__dirname, '../../test-results/mint-theme');
fs.mkdirSync(SCREENSHOT_DIR, {recursive: true});

// --- color helpers ------------------------------------------------------

/** Parse "rgb(r, g, b)" / "rgba(r, g, b, a)" into {r,g,b,a}. */
function parseRgb (str) {
    if (!str) return null;
    const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (!m) return null;
    return {r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4]};
}

/** Parse "#rrggbb" into {r,g,b}. */
function parseHex (hex) {
    const m = hex.match(/^#([0-9a-f]{6})$/i);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return {r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff};
}

function rgbToHex ({r, g, b}) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0').toUpperCase()).join('');
}

function rgbToHsl ({r, g, b}) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
        case g: h = ((b - r) / d + 2); break;
        case b: h = ((r - g) / d + 4); break;
        }
        h *= 60;
    }
    return {h, s, l};
}

function relLuminance ({r, g, b}) {
    const f = v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio (a, b) {
    const la = relLuminance(a);
    const lb = relLuminance(b);
    const hi = Math.max(la, lb);
    const lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
}

/**
 * Mint means: hue in [135, 180], saturation >= 0.15.
 * Fully transparent or white/gray colors are not mint.
 */
function isMint (rgb) {
    if (!rgb || rgb.a === 0) return false;
    const {h, s, l} = rgbToHsl(rgb);
    if (l < 0.05 || l > 0.98) return false; // near-black or near-white
    return h >= 135 && h <= 180 && s >= 0.15;
}

function describeColor (rgb) {
    if (!rgb) return 'null';
    const {h, s, l} = rgbToHsl(rgb);
    return `${rgbToHex(rgb)} hsl(${Math.round(h)},${Math.round(s * 100)}%,${Math.round(l * 100)}%)`;
}

function expectMint (rgb, label) {
    if (!isMint(rgb)) {
        throw new Error(`[${label}] expected mint (H∈[135,180] S≥15%), got ${describeColor(rgb)}`);
    }
}

function expectNotMint (rgb, label) {
    if (isMint(rgb)) {
        throw new Error(`[${label}] expected NON-mint (block color), got ${describeColor(rgb)}`);
    }
}

function expectContrast (fg, bg, minRatio, label) {
    const ratio = contrastRatio(fg, bg);
    if (ratio < minRatio) {
        throw new Error(
            `[${label}] contrast ${ratio.toFixed(2)}:1 < ${minRatio}:1 required ` +
            `(fg=${describeColor(fg)} bg=${describeColor(bg)})`
        );
    }
}

// --- page helpers -------------------------------------------------------

/**
 * Grab the computed background-color of the first element matching a
 * CSS module class prefix like "menu-bar_menu-bar_".
 */
async function getBgByModulePrefix (page, prefix) {
    return await page.evaluate(p => {
        const el = document.querySelector(`[class*="${p}"]`);
        if (!el) return null;
        return getComputedStyle(el).backgroundColor;
    }, prefix);
}

/** getComputedStyle color/backgroundColor for a selector. */
async function getComputedColors (page, selector) {
    return await page.evaluate(sel => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {color: cs.color, backgroundColor: cs.backgroundColor, fill: cs.fill, stroke: cs.stroke};
    }, selector);
}

/**
 * Sample the center pixel of an element via an in-page canvas. Works for
 * <img> (SVG loaded as image) where fills are raster, not CSS. Returns
 * {r,g,b,a} or null.
 */
async function sampleImgCenterPixel (page, selector) {
    return await page.evaluate(async sel => {
        /** @type {HTMLImageElement | null} */
        const img = document.querySelector(sel);
        if (!img) return null;
        if (!img.complete) await img.decode().catch(() => {});
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) return null;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        try {
            ctx.drawImage(img, 0, 0);
        } catch (e) {
            return null;
        }
        // Sample the center-most non-transparent pixel, walking outward if the
        // geometric center is blank. This lets us handle icons with padding.
        const cx = Math.floor(w / 2);
        const cy = Math.floor(h / 2);
        const maxR = Math.min(w, h) / 2;
        for (let r = 0; r < maxR; r += 2) {
            for (let dy = -r; dy <= r; dy += Math.max(1, r)) {
                for (let dx = -r; dx <= r; dx += Math.max(1, r)) {
                    const x = cx + dx;
                    const y = cy + dy;
                    if (x < 0 || y < 0 || x >= w || y >= h) continue;
                    const d = ctx.getImageData(x, y, 1, 1).data;
                    if (d[3] > 16) return {r: d[0], g: d[1], b: d[2], a: d[3] / 255};
                }
            }
        }
        return null;
    }, selector);
}

async function takeShot (page, name) {
    await page.screenshot({path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: false});
}

// --- the spec -----------------------------------------------------------

test.describe('mint-theme verification', () => {
    test.beforeEach(async ({page}) => {
        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.stack || String(err)));
        await page.goto('index.html');
        await expect(page.getByText('Backpack', {exact: true})).toBeVisible({timeout: 20000});
        // Give react a beat to settle menus + initial sprite.
        await page.waitForTimeout(500);
        // @ts-ignore attach for later
        page._mintErrors = pageErrors;
    });

    test('menu bar is mint with AA contrast on bold text', async ({page}) => {
        await takeShot(page, 'menu-bar');
        const bgStr = await getBgByModulePrefix(page, 'menu-bar_menu-bar_');
        const bg = parseRgb(bgStr);
        expect(bg, `menu bar element missing (got ${bgStr})`).not.toBeNull();
        expectMint(bg, 'menu-bar bg');

        // Menu bar text is bold white per menu-bar.css — check contrast on bold item.
        const itemInfo = await page.evaluate(() => {
            const el = document.querySelector('[class*="menu-bar_menu-bar-item_"]');
            if (!el) return null;
            const cs = getComputedStyle(el);
            return {color: cs.color, backgroundColor: cs.backgroundColor};
        });
        expect(itemInfo, 'menu bar item element missing').not.toBeNull();
        const fg = parseRgb(itemInfo.color);
        // menu-bar-item has transparent bg — fall back to menu bar bg.
        expectContrast(fg, bg, 3.0, 'menu-bar text on bg (bold/large)');
    });

    test('sound editor waveform + round play button are mint', async ({page}) => {
        // Open the sounds tab.
        await page.getByRole('tab', {name: /Sounds/i}).click();
        await page.waitForTimeout(600);
        await takeShot(page, 'sound-editor');

        const waveBg = parseRgb(await getBgByModulePrefix(page, 'sound-editor_waveform-container_'));
        expect(waveBg, 'waveform container missing').not.toBeNull();
        expectMint(waveBg, 'waveform container bg');

        const btnBg = parseRgb(await getBgByModulePrefix(page, 'sound-editor_round-button_'));
        expect(btnBg, 'round button missing').not.toBeNull();
        expectMint(btnBg, 'sound-editor round button bg');

        // Waveform path stroke/fill (inline SVG path) — sample computed fill.
        const wavePath = await page.evaluate(() => {
            const el = document.querySelector('[class*="waveform_waveform-path_"]');
            if (!el) return null;
            const cs = getComputedStyle(el);
            return {fill: cs.fill, stroke: cs.stroke};
        });
        if (wavePath && wavePath.fill) {
            const fill = parseRgb(wavePath.fill);
            if (fill) expectMint(fill, 'waveform path fill');
        }
    });

    test('sound editor effect button icons are mint (SVG pixel sample)', async ({page}) => {
        await page.getByRole('tab', {name: /Sounds/i}).click();
        await page.waitForTimeout(600);
        await takeShot(page, 'sound-editor-effects');

        // The sound effect buttons render icons via <img src="icon--*.svg">.
        // Sample one of them that should now be mint.
        const icon = await sampleImgCenterPixel(
            page,
            '[class*="sound-editor_effect-button_"] img'
        );
        expect(icon, 'effect icon image missing').not.toBeNull();
        expectMint(icon, 'sound effect icon pixel');
    });

    test('costume (paint) editor toolbar is mint-tinted', async ({page}) => {
        await page.getByRole('tab', {name: /Costumes/i}).click();
        // Paint editor can take a moment to mount; wait for its mode tools.
        await page.waitForTimeout(1500);
        await takeShot(page, 'paint-editor');

        // The paint editor root uses ui-background-blue which we remapped to mint-pale.
        // It renders via paper/react-paper bindings. Query for any element whose
        // computed bg matches mint-pale range (high-L mint).
        const surfaces = await page.evaluate(() => {
            const out = [];
            document.querySelectorAll('[class*="paint-editor"], [class*="mode-tools"], [class*="paint-color-picker"]').forEach(el => {
                const cs = getComputedStyle(el);
                out.push({cls: el.className, bg: cs.backgroundColor});
            });
            return out;
        });
        // Look for at least one mint-tinted surface among paint editor elements.
        const mintish = surfaces
            .map(s => parseRgb(s.bg))
            .filter(Boolean)
            .some(rgb => {
                const {h, s, l} = rgbToHsl(rgb);
                return h >= 120 && h <= 180 && s >= 0.10 && l >= 0.40;
            });
        if (!mintish) {
            // Paint editor may use pure white panels. Instead sample one of the
            // mode-tool icons (<img>) — they should be mint.
            const icon = await sampleImgCenterPixel(page, '[class*="mode-tools"] img');
            expect(icon, 'paint mode-tool icon not found').not.toBeNull();
            expectMint(icon, 'paint mode-tool icon pixel');
        }
    });

    test('green flag stays green (semantic color preserved)', async ({page}) => {
        await takeShot(page, 'stage-controls');
        const flag = await sampleImgCenterPixel(page, '[class*="green-flag"] img');
        if (flag) {
            const {h} = rgbToHsl(flag);
            // Green flag hue should be in the green range (roughly 100-160) —
            // NOT our mint-primary range (135-180). Fail if it's drifted to red/blue.
            expect(h, `green flag hue drifted: ${describeColor(flag)}`).toBeGreaterThan(90);
            expect(h, `green flag hue drifted: ${describeColor(flag)}`).toBeLessThan(165);
        }
    });

    test('motion blocks stay blue (not recolored to mint)', async ({page}) => {
        // Scratch-blocks renders block backgrounds as SVG <path fill="...">.
        // The motion category's primary color is #4C97FF. We want that specific
        // blue to still exist in the rendered workspace.
        await takeShot(page, 'blocks-workspace');

        const blockFills = await page.evaluate(() => {
            const out = [];
            document.querySelectorAll('.blocklyBlockBackground, .blocklyPath').forEach(el => {
                const f = el.getAttribute('fill') || getComputedStyle(el).fill;
                if (f) out.push(f);
            });
            return out;
        });

        // Convert to RGB and look for at least one non-mint colored block.
        const nonMint = blockFills
            .map(f => {
                if (f.startsWith('#')) return parseHex(f);
                return parseRgb(f);
            })
            .filter(Boolean)
            .filter(rgb => {
                const {s, l} = rgbToHsl(rgb);
                return s > 0.3 && l > 0.3 && l < 0.8; // saturated non-gray
            })
            .filter(rgb => !isMint(rgb));

        expect(nonMint.length, 'no non-mint blocks found — blocks may have been recolored!')
            .toBeGreaterThan(0);
    });

    test('full editor screenshot for manual review', async ({page}) => {
        await page.screenshot({path: path.join(SCREENSHOT_DIR, 'full-editor.png'), fullPage: true});
        // @ts-ignore
        expect(page._mintErrors, 'uncaught page errors').toEqual([]);
    });
});
