// @ts-check
/*
 * Dark-theme visual verification spec.
 *
 * Dark mode is the default color mode. This spec:
 *   1. Confirms the root document advertises data-colormode="dark" on fresh load.
 *   2. For each UI surface (menu bar, workspace, stage wrapper, tabs, sound
 *      editor, costume editor, extension library modal, sprite selector),
 *      asserts the computed background is dark (low luminance).
 *   3. Samples text color and confirms AA contrast against the dark bg.
 *   4. Confirms block fills remain in bright brand hues (not dark) so
 *      category semantics stay legible.
 *   5. Toggles to Default (mint) in the color-mode menu and confirms the
 *      palette flips back.
 */
const path = require('path');
const fs = require('fs');
const {test, expect} = require('@playwright/test');

const SCREENSHOT_DIR = path.resolve(__dirname, '../../test-results/dark-theme');
fs.mkdirSync(SCREENSHOT_DIR, {recursive: true});

// --- color helpers ------------------------------------------------------

function parseRgb (str) {
    if (!str) return null;
    const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (!m) return null;
    return {r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4]};
}

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

function describeColor (rgb) {
    if (!rgb) return 'null';
    const {h, s, l} = rgbToHsl(rgb);
    return `${rgbToHex(rgb)} hsl(${Math.round(h)},${Math.round(s * 100)}%,${Math.round(l * 100)}%)`;
}

/** Dark means: relative luminance <= 0.18 (Y in sRGB). */
function isDark (rgb) {
    if (!rgb || rgb.a === 0) return false;
    return relLuminance(rgb) <= 0.18;
}

function expectDark (rgb, label) {
    if (!isDark(rgb)) {
        throw new Error(`[${label}] expected dark (Y≤0.18), got ${describeColor(rgb)} Y=${relLuminance(rgb).toFixed(3)}`);
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

async function getBgByModulePrefix (page, prefix) {
    return await page.evaluate(p => {
        const el = document.querySelector(`[class*="${p}"]`);
        if (!el) return null;
        return getComputedStyle(el).backgroundColor;
    }, prefix);
}

async function takeShot (page, name) {
    await page.screenshot({path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: false});
}

async function clearThemeCookie (page) {
    await page.context().addCookies([
        {name: 'scratchtheme', value: '', url: page.url().startsWith('http') ? page.url() : 'http://localhost:8601/', expires: 0}
    ]).catch(() => {});
    await page.evaluate(() => {
        document.cookie = 'scratchtheme=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT';
    });
}

// --- the spec -----------------------------------------------------------

test.describe('dark-theme verification', () => {
    test.beforeEach(async ({page}) => {
        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.stack || String(err)));
        await page.goto('index.html');
        await clearThemeCookie(page);
        await page.reload();
        await expect(page.getByText('Backpack', {exact: true})).toBeVisible({timeout: 20000});
        await page.waitForTimeout(500);
        // @ts-ignore attach for later
        page._darkErrors = pageErrors;
    });

    test('documentElement has data-colormode="dark" by default', async ({page}) => {
        const mode = await page.evaluate(() => document.documentElement.getAttribute('data-colormode'));
        expect(mode).toBe('dark');
    });

    test('Redux settings.colorMode is "dark" on fresh load', async ({page}) => {
        const mode = await page.evaluate(() => {
            // @ts-ignore injected by dev server
            const store = window.__scratchStore;
            if (!store) return null;
            return store.getState().scratchGui.settings.colorMode;
        });
        expect(mode).toBe('dark');
    });

    test('menu bar is dark with AA contrast on bold text', async ({page}) => {
        await takeShot(page, 'menu-bar');
        const bg = parseRgb(await getBgByModulePrefix(page, 'menu-bar_menu-bar_'));
        expect(bg, 'menu bar element missing').not.toBeNull();
        expectDark(bg, 'menu bar bg');

        const itemInfo = await page.evaluate(() => {
            const el = document.querySelector('[class*="menu-bar_menu-bar-item_"]');
            if (!el) return null;
            const cs = getComputedStyle(el);
            return {color: cs.color};
        });
        expect(itemInfo, 'menu bar item missing').not.toBeNull();
        const fg = parseRgb(itemInfo.color);
        expectContrast(fg, bg, 3.0, 'menu-bar text on bg (bold/large)');
    });

    test('page wrapper and body wrapper are dark', async ({page}) => {
        const pageBg = parseRgb(await getBgByModulePrefix(page, 'gui_page-wrapper_'));
        if (pageBg) expectDark(pageBg, 'page wrapper bg');

        const bodyBg = parseRgb(await getBgByModulePrefix(page, 'gui_body-wrapper_'));
        expect(bodyBg, 'body wrapper missing').not.toBeNull();
        expectDark(bodyBg, 'body wrapper bg');
    });

    test('stage wrapper area is dark', async ({page}) => {
        await takeShot(page, 'stage-wrapper');
        const bg = parseRgb(await getBgByModulePrefix(page, 'stage-wrapper_stage-wrapper_'));
        if (bg) expectDark(bg, 'stage wrapper bg');
    });

    test('sprite selector + target pane are dark', async ({page}) => {
        const spriteBg = parseRgb(await getBgByModulePrefix(page, 'sprite-selector_sprite-selector_'));
        if (spriteBg) expectDark(spriteBg, 'sprite selector bg');

        const targetBg = parseRgb(await getBgByModulePrefix(page, 'target-pane_target-pane_'));
        if (targetBg) expectDark(targetBg, 'target pane bg');
    });

    test('blocks flyout is dark', async ({page}) => {
        await takeShot(page, 'blocks-workspace');
        const flyoutFill = await page.evaluate(() => {
            const el = document.querySelector('.blocklyFlyoutBackground');
            if (!el) return null;
            return el.getAttribute('fill') || getComputedStyle(el).fill;
        });
        if (flyoutFill) {
            const rgb = flyoutFill.startsWith('#') ? parseHex(flyoutFill) : parseRgb(flyoutFill);
            if (rgb) expectDark(rgb, 'flyout fill');
        }
    });

    test('block fills stay bright (category colors preserved)', async ({page}) => {
        await page.waitForTimeout(500);
        const blockFills = await page.evaluate(() => {
            const out = [];
            document.querySelectorAll('.blocklyBlockBackground, .blocklyPath').forEach(el => {
                const f = el.getAttribute('fill') || getComputedStyle(el).fill;
                if (f) out.push(f);
            });
            return out;
        });

        const bright = blockFills
            .map(f => (f.startsWith('#') ? parseHex(f) : parseRgb(f)))
            .filter(Boolean)
            .filter(rgb => {
                const {s, l} = rgbToHsl(rgb);
                return s > 0.3 && l > 0.3 && l < 0.85;
            });

        expect(bright.length, 'no bright (brand-color) block fills found in dark mode!')
            .toBeGreaterThan(0);
    });

    test('extensions library modal has dark surfaces', async ({page}) => {
        // Click "Add Extension" (bottom-left of blocks area).
        const extBtn = page.locator('[class*="extension-button-container"]').first();
        if (await extBtn.count() > 0) {
            await extBtn.click();
            await page.waitForTimeout(800);
            await takeShot(page, 'extension-library');

            const modalBg = parseRgb(await getBgByModulePrefix(page, 'modal_modal-content_'));
            if (modalBg) expectDark(modalBg, 'extension library modal bg');

            const libBg = parseRgb(await getBgByModulePrefix(page, 'library_library-scroll-grid_'));
            if (libBg) expectDark(libBg, 'library scroll grid bg');

            // Close the modal
            const close = page.locator('[class*="modal_close-button"]').first();
            if (await close.count() > 0) await close.click();
        }
    });

    test('sound editor is dark-tinted', async ({page}) => {
        await page.getByRole('tab', {name: /Sounds/i}).click();
        await page.waitForTimeout(800);
        await takeShot(page, 'sound-editor');

        const editorBg = parseRgb(await getBgByModulePrefix(page, 'sound-editor_editor-container_'));
        if (editorBg) expectDark(editorBg, 'sound editor bg');
    });

    test('paint editor toolbar is dark', async ({page}) => {
        await page.getByRole('tab', {name: /Costumes/i}).click();
        await page.waitForTimeout(1500);
        await takeShot(page, 'paint-editor');

        const editorBg = parseRgb(await getBgByModulePrefix(page, 'paint-editor_editor-container_'));
        if (editorBg) expectDark(editorBg, 'paint editor bg');

        const controlsBg = parseRgb(await getBgByModulePrefix(page, 'paint-editor_controls-container_'));
        if (controlsBg) expectDark(controlsBg, 'paint editor controls bg');
    });

    test('toggling to Original restores mint palette', async ({page}) => {
        // Settings button is in the menu bar with the gear icon.
        await page.locator('[class*="menu-bar_color-mode-menu"]').first().click();
        await page.waitForTimeout(300);
        // "Color Mode" submenu
        await page.getByText(/Color Mode/i).first().click();
        await page.waitForTimeout(300);
        // Pick "Original"
        await page.getByText(/^Original$/i).first().click();
        await page.waitForTimeout(500);

        const mode = await page.evaluate(() => document.documentElement.getAttribute('data-colormode'));
        expect(mode).toBe('default');

        const menuBg = parseRgb(await getBgByModulePrefix(page, 'menu-bar_menu-bar_'));
        expect(menuBg, 'menu bar element missing after toggle').not.toBeNull();
        // Menu bar in mint/default mode should not be dark.
        if (isDark(menuBg)) {
            throw new Error(`menu bar still dark after toggle to Original: ${describeColor(menuBg)}`);
        }
    });

    test('full editor screenshot for manual review', async ({page}) => {
        await page.screenshot({path: path.join(SCREENSHOT_DIR, 'full-editor.png'), fullPage: true});
        // @ts-ignore
        expect(page._darkErrors, 'uncaught page errors').toEqual([]);
    });
});
