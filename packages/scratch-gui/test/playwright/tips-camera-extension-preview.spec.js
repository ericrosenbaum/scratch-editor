const {test, expect} = require('@playwright/test');

// Verifies the fix for the bug where opening a tip whose block preview
// references a webcam-using extension (videoSensing, faceSensing) would
// turn the camera on as a side effect of loading the extension.
//
// The video-sensing-extension tip's `_capturedBlocks` contain both
// `videoSensing_whenMotionGreaterThan` and `faceSensing_goToPart`. After
// opening it:
//   - Both blocks should render with the extension green styling and icons.
//   - Neither extension should be marked as loaded (so a later user-initiated
//     add via the extension library still runs the full real load and turns
//     the camera on).
//   - Neither extension should appear in the editor's `_blockInfo` toolbox
//     palette.

const waitForEditor = async page => {
    await page.goto('/');
    const webglOverlay = page.locator('.ReactModal__Overlay');
    if (await webglOverlay.isVisible({timeout: 3000}).catch(() => false)) {
        await page.evaluate(() => {
            document.querySelectorAll('.ReactModalPortal').forEach(el => el.remove());
        });
    }
    await page.waitForSelector('[class*="blocks_blocks"]', {timeout: 30000});
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
        const wdsOverlay = document.getElementById('webpack-dev-server-client-overlay');
        if (wdsOverlay) wdsOverlay.remove();
    });
};

const openTip = async (page, tipId) => {
    await page.waitForFunction(() => window.__scratchStore, null, {timeout: 10000});
    await page.evaluate(id => {
        const store = window.__scratchStore;
        store.dispatch({type: 'scratch-gui/unstuck/OPEN_UNSTUCK'});
        store.dispatch({type: 'scratch-gui/unstuck/SET_TIP', tipId: id});
    }, tipId);
    await page.waitForSelector(
        '[class*="unstuck-container"], [class*="unstuckContainer"]',
        {timeout: 5000}
    );
    const codeHeader = page.locator(
        '[class*="code-section-header"], [class*="codeSectionHeader"]'
    );
    await expect(codeHeader).toBeVisible({timeout: 5000});
    await codeHeader.click();
    await page.waitForTimeout(400);
};

test.describe('Tip preview with camera-using extensions', () => {
    test('renders videoSensing/faceSensing blocks without loading the extensions', async ({page}) => {
        const consoleErrors = [];
        const pageErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('pageerror', err => pageErrors.push(err.message));

        await waitForEditor(page);
        await openTip(page, 'video-sensing-extension');

        // Block preview workspace renders something.
        const blockSummary = await page.evaluate(() => {
            const container = document.querySelector(
                '[class*="workspace-container"], [class*="workspaceContainer"]'
            );
            if (!container) return {count: 0, fills: []};
            const canvas = container.querySelector('.blocklyBlockCanvas');
            if (!canvas) return {count: 0, fills: []};
            const groups = canvas.querySelectorAll(':scope > g[data-id]');
            const fills = Array.from(groups)
                .map(g => g.querySelector('path.blocklyPath'))
                .filter(Boolean)
                .map(p => (p.getAttribute('fill') || '').toLowerCase());
            return {count: groups.length, fills};
        });
        expect(blockSummary.count, 'block preview should render at least one block').toBeGreaterThan(0);
        // Extension blocks must render with the extension green, not the
        // default black fill that appears when the workspace theme has not
        // yet been refreshed for the just-registered block style.
        expect(blockSummary.fills, 'no extension block should render as black').not.toContain('#000000');

        // Neither camera extension was actually loaded.
        const loadedStatus = await page.evaluate(() => {
            const store = window.__scratchStore;
            const vm = store.getState().scratchGui.vm;
            return {
                videoSensing: vm.extensionManager.isExtensionLoaded('videoSensing'),
                faceSensing: vm.extensionManager.isExtensionLoaded('faceSensing')
            };
        });
        expect(loadedStatus.videoSensing, 'videoSensing must not be fully loaded').toBe(false);
        expect(loadedStatus.faceSensing, 'faceSensing must not be fully loaded').toBe(false);

        // Neither category appears in the editor's toolbox/blocks palette.
        const toolboxIds = await page.evaluate(() => {
            const store = window.__scratchStore;
            const vm = store.getState().scratchGui.vm;
            return vm.runtime._blockInfo.map(c => c.id);
        });
        expect(toolboxIds).not.toContain('videoSensing');
        expect(toolboxIds).not.toContain('faceSensing');

        // No console errors / page errors during the preview load.
        expect(pageErrors, 'no page errors').toEqual([]);
        expect(
            consoleErrors.filter(t => /RangeError|Maximum call stack/i.test(t)),
            'no stack-overflow errors'
        ).toEqual([]);
    });

    test('user can fully load videoSensing via library after a preview', async ({page}) => {
        const consoleErrors = [];
        const pageErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('pageerror', err => pageErrors.push(err.message));

        await waitForEditor(page);
        await openTip(page, 'video-sensing-extension');

        // Preview load happened. Now do the full load that would normally
        // happen when the user clicks the extension in the library.
        await page.evaluate(() => new Promise(resolve => {
            const store = window.__scratchStore;
            const vm = store.getState().scratchGui.vm;
            Promise.resolve(vm.extensionManager.loadExtensionURL('videoSensing'))
                .then(resolve, resolve);
        }));

        const status = await page.evaluate(() => {
            const store = window.__scratchStore;
            const vm = store.getState().scratchGui.vm;
            return {
                isLoaded: vm.extensionManager.isExtensionLoaded('videoSensing'),
                blockInfoIds: vm.runtime._blockInfo.map(c => c.id)
            };
        });
        expect(status.isLoaded, 'full load should mark videoSensing loaded').toBe(true);
        expect(status.blockInfoIds).toContain('videoSensing');

        expect(pageErrors).toEqual([]);
        expect(
            consoleErrors.filter(t => /RangeError|Maximum call stack/i.test(t)),
            'no stack-overflow errors after full load'
        ).toEqual([]);
    });
});
