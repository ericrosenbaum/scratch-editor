const {test, expect} = require('@playwright/test');

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

const openUnstuck = async page => {
    await page.waitForFunction(() => window.__scratchStore, null, {timeout: 10000});
    await page.evaluate(() => {
        window.__scratchStore.dispatch({type: 'scratch-gui/unstuck/OPEN_UNSTUCK'});
    });
    await page.waitForSelector(
        '[class*="unstuck-container"], [class*="unstuckContainer"]',
        {timeout: 5000}
    );
};

const getUnstuckState = page => page.evaluate(() => {
    const s = window.__scratchStore.getState().scratchGui.unstuck;
    return {
        pickMode: s.pickMode,
        query: s.query,
        loading: s.loading,
        searchResults: s.searchResults,
        activeTipId: s.activeTipId
    };
});

test.describe('Tips Block Picker', () => {

    test('clicking pick button enters pick mode and adds body class', async ({page}) => {
        await waitForEditor(page);
        await openUnstuck(page);

        const pickButton = page.locator(
            'button[class*="pick-button"], button[class*="pickButton"]'
        ).first();
        await expect(pickButton).toBeVisible({timeout: 5000});
        await pickButton.click();

        const state = await getUnstuckState(page);
        expect(state.pickMode).toBe(true);

        const hasBodyClass = await page.evaluate(() =>
            document.body.classList.contains('tip-pick-mode')
        );
        expect(hasBodyClass).toBe(true);

        const banner = page.locator(
            '[class*="pick-hint-banner"], [class*="pickHintBanner"]'
        );
        await expect(banner).toBeVisible();
    });

    test('pressing Escape exits pick mode and removes body class', async ({page}) => {
        await waitForEditor(page);
        await openUnstuck(page);

        const pickButton = page.locator(
            'button[class*="pick-button"], button[class*="pickButton"]'
        ).first();
        await pickButton.click();
        expect((await getUnstuckState(page)).pickMode).toBe(true);
        // Wait for componentDidUpdate to have attached the document listeners
        // (body class is set immediately after attaching).
        await page.waitForFunction(() => document.body.classList.contains('tip-pick-mode'));
        await page.waitForTimeout(300);

        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);

        expect((await getUnstuckState(page)).pickMode).toBe(false);
        const hasBodyClass = await page.evaluate(() =>
            document.body.classList.contains('tip-pick-mode')
        );
        expect(hasBodyClass).toBe(false);
    });

    test('clicking a flyout block sets query and kicks off search', async ({page}) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await waitForEditor(page);
        await openUnstuck(page);

        // Activate the picker
        const pickButton = page.locator(
            'button[class*="pick-button"], button[class*="pickButton"]'
        ).first();
        await pickButton.click();
        expect((await getUnstuckState(page)).pickMode).toBe(true);
        // Wait for componentDidUpdate to have attached the document listeners
        // (body class is set immediately after attaching).
        await page.waitForFunction(() => document.body.classList.contains('tip-pick-mode'));

        // Dispatch a mousedown directly on a visible flyout block's path element.
        // This is more reliable than page.mouse.click(x, y) for SVG hit-testing
        // in Blockly, where the cursor coordinates can land on overlay widgets.
        const dispatched = await page.evaluate(() => {
            const vh = window.innerHeight;
            const candidates = Array.from(document.querySelectorAll('.blocklyFlyout .blocklyDraggable'));
            const block = candidates.find(b => {
                const r = b.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= vh;
            });
            if (!block) return null;
            const r = block.getBoundingClientRect();
            const inner = block.querySelector('path.blocklyPath') || block;
            const ev = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: r.left + (r.width / 2),
                clientY: r.top + (r.height / 2),
                button: 0
            });
            inner.dispatchEvent(ev);
            return {classes: block.getAttribute('class'), dataId: block.getAttribute('data-id')};
        });
        expect(dispatched, 'No visible flyout block found').toBeTruthy();

        await page.waitForFunction(() => {
            const s = window.__scratchStore.getState().scratchGui.unstuck;
            return s.pickMode === false && /How do I use the .+ block\?/.test(s.query);
        }, null, {timeout: 5000});

        const state = await getUnstuckState(page);
        expect(state.pickMode).toBe(false);
        expect(state.query).toMatch(/How do I use the .+ block\?/);

        expect(errors, 'Unexpected page errors').toEqual([]);
    });

    test('clicking a workspace block sets query and kicks off search', async ({page}) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await waitForEditor(page);
        await openUnstuck(page);

        // Add a `move 10 steps` block to the workspace via the VM API.
        // Pick a workspace position that maps to viewport coordinates well inside
        // the visible workspace pane.
        await page.evaluate(() => {
            const store = window.__scratchStore;
            const vm = store.getState().scratchGui.vm;
            const blocks = [{
                opcode: 'motion_movesteps',
                id: 'pickerTestBlock',
                fields: {},
                inputs: {
                    STEPS: {
                        name: 'STEPS',
                        block: 'pickerTestShadow',
                        shadow: 'pickerTestShadow'
                    }
                },
                next: null,
                topLevel: true,
                x: 50,
                y: 50
            }, {
                opcode: 'math_number',
                id: 'pickerTestShadow',
                fields: {NUM: {name: 'NUM', value: '10'}},
                shadow: true,
                topLevel: false,
                parent: 'pickerTestBlock'
            }];
            return vm.shareBlocksToTarget(blocks, vm.editingTarget.id)
                .then(() => vm.refreshWorkspace());
        });
        await page.waitForTimeout(800);

        // Activate the picker
        const pickButton = page.locator(
            'button[class*="pick-button"], button[class*="pickButton"]'
        ).first();
        await pickButton.click();
        expect((await getUnstuckState(page)).pickMode).toBe(true);
        // Wait for componentDidUpdate to have attached the document listeners
        // (body class is set immediately after attaching).
        await page.waitForFunction(() => document.body.classList.contains('tip-pick-mode'));
        await page.waitForTimeout(300);

        // Dispatch a mousedown directly on the workspace move_steps block.
        const dispatched = await page.evaluate(() => {
            const vh = window.innerHeight;
            const candidates = Array.from(
                document.querySelectorAll('.blocklyBlockCanvas .blocklyDraggable.motion_movesteps')
            );
            const block = candidates.find(b => {
                const r = b.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= vh;
            });
            if (!block) return null;
            const r = block.getBoundingClientRect();
            const inner = block.querySelector('path.blocklyPath') || block;
            const ev = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: r.left + (r.width / 2),
                clientY: r.top + (r.height / 2),
                button: 0
            });
            inner.dispatchEvent(ev);
            return true;
        });
        expect(dispatched, 'Workspace move_steps block not found in viewport').toBe(true);

        await page.waitForFunction(() => {
            const s = window.__scratchStore.getState().scratchGui.unstuck;
            return s.pickMode === false && /How do I use the .+ block\?/.test(s.query);
        }, null, {timeout: 5000});

        const state = await getUnstuckState(page);
        expect(state.pickMode).toBe(false);
        expect(state.query).toMatch(/How do I use the .+ block\?/);
        // Confirm the query mentions "move" or "steps" — proves the human-text
        // extraction ran on the actual workspace block (vs falling back to opcode).
        expect(state.query.toLowerCase()).toMatch(/move|steps/);

        expect(errors).toEqual([]);
    });

    test('clicking on a non-block (stage) cancels pick mode silently', async ({page}) => {
        await waitForEditor(page);
        await openUnstuck(page);

        const pickButton = page.locator(
            'button[class*="pick-button"], button[class*="pickButton"]'
        ).first();
        await pickButton.click();
        expect((await getUnstuckState(page)).pickMode).toBe(true);
        // Wait for componentDidUpdate to have attached the document listeners
        // (body class is set immediately after attaching).
        await page.waitForFunction(() => document.body.classList.contains('tip-pick-mode'));
        await page.waitForTimeout(300);

        // Click the green flag button (not a block)
        const flagInfo = await page.evaluate(() => {
            const el = document.querySelector('button[class*="green-flag"]');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {x: r.left + (r.width / 2), y: r.top + (r.height / 2)};
        });
        expect(flagInfo).toBeTruthy();

        await page.mouse.click(flagInfo.x, flagInfo.y);
        await page.waitForTimeout(300);

        const state = await getUnstuckState(page);
        expect(state.pickMode).toBe(false);
        expect(state.searchResults).toEqual([]);
    });

    test('real mouse click on a flyout block sets query (locator-based)', async ({page}) => {
        // This test uses Playwright's locator API which performs auto-waiting,
        // scroll-into-view, and real CDP mouse input — closer to real user input.
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await waitForEditor(page);
        await openUnstuck(page);

        const pickButton = page.locator(
            'button[class*="pick-button"], button[class*="pickButton"]'
        ).first();
        await pickButton.click();
        await page.waitForFunction(() => document.body.classList.contains('tip-pick-mode'));

        // Find the center of a flyout block that is in-viewport, then mouse.click it.
        // Click toward the LEFT edge of the block — that's the colored path, not
        // any inline edit input that may overlay a number field.
        const clickPoint = await page.evaluate(() => {
            const vh = window.innerHeight;
            const candidates = Array.from(document.querySelectorAll('.blocklyFlyout .blocklyDraggable'));
            const block = candidates.find(b => {
                const r = b.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= vh;
            });
            if (!block) return null;
            const r = block.getBoundingClientRect();
            // Aim ~15px from the left edge so we hit the colored path of the
            // block, not any inline-edit widget that may sit over a field.
            return {x: r.left + 15, y: r.top + (r.height / 2)};
        });
        expect(clickPoint, 'No visible flyout block').toBeTruthy();

        await page.mouse.click(clickPoint.x, clickPoint.y);

        await page.waitForFunction(() => {
            const s = window.__scratchStore.getState().scratchGui.unstuck;
            return s.pickMode === false && /How do I use the .+ block\?/.test(s.query);
        }, null, {timeout: 5000});

        const state = await getUnstuckState(page);
        expect(state.pickMode).toBe(false);
        expect(state.query).toMatch(/How do I use the .+ block\?/);

        expect(errors, 'Unexpected page errors').toEqual([]);
    });

    // Picking a specific opcode should rank tips that explicitly reference
    // that block (in title, code example, pointer, description, or category)
    // above tips with only generic embedding similarity.
    // Pre-computed tip → property table for asserting on the chosen top result
    // without needing a dynamic import (which the dev server's webpack pipeline
    // doesn't reliably serve).
    const pickFixtures = [
        {
            opcode: 'motion_movesteps',
            label: 'motion_movesteps (Motion category open by default)',
            // Tips known to reference move/steps by title, code, or pointer.
            expectedTopIds: new Set([
                'move-sprite', 'move-with-keys', 'nothing-happens',
                'change-xy-position', 'reset-at-start',
                'too-fast', 'spinning', 'bouncing-around', 'forever-loop',
                'repeat-loop', 'make-platformer', 'follow-mouse', 'mouse-pointer',
                'detect-collision', 'repeat-until'
            ])
        }
    ];

    for (const fixture of pickFixtures) {
        test(`picking ${fixture.label} ranks a block-relevant tip on top`, async ({page}) => {
            await waitForEditor(page);
            await openUnstuck(page);

            const pickButton = page.locator(
                'button[class*="pick-button"], button[class*="pickButton"]'
            ).first();
            await pickButton.click();
            await page.waitForFunction(
                () => document.body.classList.contains('tip-pick-mode')
            );

            // Dispatch mousedown on the specific opcode in the flyout.
            const dispatched = await page.evaluate(opcode => {
                const block = document.querySelector(
                    `.blocklyFlyout .${opcode}.blocklyDraggable`
                );
                if (!block) return null;
                const r = block.getBoundingClientRect();
                const inner = block.querySelector('path.blocklyPath') || block;
                inner.dispatchEvent(new MouseEvent('mousedown', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: r.left + (r.width / 2),
                    clientY: r.top + (r.height / 2),
                    button: 0
                }));
                return true;
            }, fixture.opcode);
            expect(dispatched, `${fixture.opcode} not in flyout`).toBe(true);

            // Wait for the embedding-backed search to finish. Long timeout
            // accommodates first-time model download in a fresh test context.
            await page.waitForFunction(() => {
                const s = window.__scratchStore.getState().scratchGui.unstuck;
                return s.searchResults && s.searchResults.length > 0 && !s.loading;
            }, null, {timeout: 60000});

            const topTipId = await page.evaluate(() =>
                window.__scratchStore.getState().scratchGui.unstuck.searchResults[0].tipId
            );

            expect(
                fixture.expectedTopIds.has(topTipId),
                `Top tip "${topTipId}" should be a ${fixture.opcode}-relevant tip`
            ).toBe(true);
        });
    }

    // Extension blocks should pull in tutorials/starters that describe the
    // extension by name (e.g. "Text to Speech"), not just blocks that share
    // a literal word with the picked block.
    test('picking text2speech_speakAndWait surfaces TTS tutorials/starters', async ({page}) => {
        await waitForEditor(page);

        // Load the Text to Speech extension and wait for its category to
        // appear in the toolbox flyout.
        await page.evaluate(() => new Promise(resolve => {
            const vm = window.__scratchStore.getState().scratchGui.vm;
            Promise.resolve(vm.extensionManager.loadExtensionURL('text2speech'))
                .then(resolve, resolve);
        }));
        await page.waitForFunction(
            () => !!document.querySelector('.blocklyFlyout .text2speech_speakAndWait.blocklyDraggable'),
            null, {timeout: 15000}
        );

        await openUnstuck(page);
        const pickButton = page.locator(
            'button[class*="pick-button"], button[class*="pickButton"]'
        ).first();
        await pickButton.click();
        await page.waitForFunction(() => document.body.classList.contains('tip-pick-mode'));

        const dispatched = await page.evaluate(() => {
            const block = document.querySelector(
                '.blocklyFlyout .text2speech_speakAndWait.blocklyDraggable'
            );
            if (!block) return false;
            const r = block.getBoundingClientRect();
            const inner = block.querySelector('path.blocklyPath') || block;
            inner.dispatchEvent(new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: r.left + (r.width / 2),
                clientY: r.top + (r.height / 2),
                button: 0
            }));
            return true;
        });
        expect(dispatched).toBe(true);

        await page.waitForFunction(() => {
            const s = window.__scratchStore.getState().scratchGui.unstuck;
            return s.searchResults && s.searchResults.length > 0 && !s.loading;
        }, null, {timeout: 60000});

        const state = await page.evaluate(() => {
            const s = window.__scratchStore.getState().scratchGui.unstuck;
            return {
                query: s.query,
                tipIds: s.searchResults.map(r => r.tipId)
            };
        });

        // Query was augmented with the extension display name.
        expect(state.query).toContain('(Text to Speech)');

        // Bucket 1: the captured-block tip is first.
        expect(state.tipIds[0]).toBe('text-to-speech-extension');

        // Bucket 2: at least one TTS-themed tutorial or starter is present.
        const ttsExtras = ['tutorial-say-it-out-loud', 'tip-sounds-tts', 'starter-text-speech'];
        const found = ttsExtras.filter(id => state.tipIds.includes(id));
        expect(
            found.length,
            `expected at least one of ${ttsExtras.join(', ')}; got ${state.tipIds.join(', ')}`
        ).toBeGreaterThan(0);
    });

    test('clicks on the Tips card itself do not exit pick mode', async ({page}) => {
        await waitForEditor(page);
        await openUnstuck(page);

        const pickButton = page.locator(
            'button[class*="pick-button"], button[class*="pickButton"]'
        ).first();
        await pickButton.click();
        expect((await getUnstuckState(page)).pickMode).toBe(true);
        // Wait for componentDidUpdate to have attached the document listeners
        // (body class is set immediately after attaching).
        await page.waitForFunction(() => document.body.classList.contains('tip-pick-mode'));
        await page.waitForTimeout(300);

        // Click on the hint banner inside the card
        const banner = page.locator(
            '[class*="pick-hint-banner"], [class*="pickHintBanner"]'
        );
        await banner.click();
        await page.waitForTimeout(200);

        expect((await getUnstuckState(page)).pickMode).toBe(true);
    });
});
