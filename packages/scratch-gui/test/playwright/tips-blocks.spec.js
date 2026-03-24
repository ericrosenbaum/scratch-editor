const {test, expect} = require('@playwright/test');

/**
 * All tip→blockTemplate mappings to test systematically.
 */
const tipsWithBlocks = [
    {tipId: 'nothing-happens', template: 'whenFlagMove'},
    {tipId: 'move-sprite', template: 'whenFlagMove'},
    {tipId: 'move-with-keys', template: 'whenKeyMoveRight'},
    {tipId: 'change-xy-position', template: 'whenKeyMoveRight'},
    {tipId: 'go-to-position', template: 'goToCenter'},
    {tipId: 'glide-to-position', template: 'glideTo'},
    {tipId: 'add-sound', template: 'playSound'},
    {tipId: 'say-think', template: 'saySomething'},
    {tipId: 'animate-costume', template: 'foreverNextCostume'},
    {tipId: 'forever-loop', template: 'foreverMove'},
    {tipId: 'repeat-loop', template: 'repeatTurn'},
    {tipId: 'detect-collision', template: 'foreverIfTouching'},
    {tipId: 'broadcast-message', template: 'broadcastAndReceive'},
    {tipId: 'clone-sprite', template: 'cloneCreateAndBehave'},
    {tipId: 'if-not-forever', template: 'foreverIfCheck'},
    {tipId: 'insert-reporter', template: 'moveRandomSteps'},
    {tipId: 'ask-and-answer', template: 'askAndSay'},
    {tipId: 'mouse-pointer', template: 'followMouse'},
    {tipId: 'reset-at-start', template: 'whenFlagGoToReset'},
    {tipId: 'repeat-until', template: 'repeatUntilEdge'},
    {tipId: 'make-platformer', template: 'gravityFall'},
    {tipId: 'make-clicker', template: 'whenClickedChangeScore'},
    {tipId: 'color-changing', template: 'foreverColorChange'},
    {tipId: 'spinning', template: 'foreverSpin'},
    {tipId: 'bouncing-around', template: 'foreverBounce'},
    // New block templates
    {tipId: 'change-size', template: 'changeSizeBy'},
    {tipId: 'sprite-ghost-effect', template: 'setGhostZero'},
    {tipId: 'sprite-too-small', template: 'setSizeTo100'},
    {tipId: 'growing-shrinking', template: 'foreverChangeSizePulse'},
    {tipId: 'graphic-effects', template: 'setColorEffect'},
    {tipId: 'clone-basics', template: 'cloneBasicsPair'},
    {tipId: 'clone-delete', template: 'deleteClone'},
    {tipId: 'too-fast', template: 'waitBlock'},
    {tipId: 'two-stacks-same-time', template: 'twoFlagStacks'},
    {tipId: 'broadcast-for-levels', template: 'broadcastLevels'}
];

// Wait for the editor to fully load
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

// Open the unstuck panel and navigate directly to a specific tip via Redux,
// then expand the code section via UI click
const goToTipWithCode = async (page, tipId) => {
    await page.waitForFunction(() => window.__scratchStore, null, {timeout: 10000});
    await page.evaluate(id => {
        const store = window.__scratchStore;
        store.dispatch({type: 'scratch-gui/unstuck/OPEN_UNSTUCK'});
        store.dispatch({type: 'scratch-gui/unstuck/SET_TIP', tipId: id});
    }, tipId);

    // Wait for the unstuck card to render
    await page.waitForSelector(
        '[class*="unstuck-container"], [class*="unstuckContainer"]',
        {timeout: 5000}
    );

    // Click "Try this code" to expand the code section
    const codeHeader = page.locator(
        '[class*="code-section-header"], [class*="codeSectionHeader"]'
    );
    await expect(codeHeader).toBeVisible({timeout: 5000});
    await codeHeader.click();

    // Wait for the expansion animation
    await page.waitForTimeout(400);
};

test.describe('Tips Blocks - Preview Rendering', () => {
    for (const {tipId, template} of tipsWithBlocks) {
        test(`block preview renders for "${tipId}" (${template})`, async ({page}) => {
            await waitForEditor(page);
            await goToTipWithCode(page, tipId);

            // Wait for the block preview workspace container to be visible
            const previewContainer = page.locator('[class*="workspace-container"], [class*="workspaceContainer"]');
            await expect(previewContainer).toBeVisible({timeout: 5000});

            // Wait a moment for Blockly to render blocks
            await page.waitForTimeout(500);

            // Check that Blockly actually rendered blocks (not an empty workspace)
            const blockCount = await page.evaluate(() => {
                const container = document.querySelector(
                    '[class*="workspace-container"], [class*="workspaceContainer"]'
                );
                if (!container) return 0;
                const canvas = container.querySelector('.blocklyBlockCanvas');
                if (!canvas) return 0;
                return canvas.querySelectorAll(':scope > g').length;
            });

            expect(blockCount, `Expected rendered blocks for template "${template}"`).toBeGreaterThan(0);
        });
    }
});

test.describe('Tips Blocks - Add to Project', () => {
    for (const {tipId, template} of tipsWithBlocks) {
        test(`add to project works for "${tipId}" (${template})`, async ({page}) => {
            const errors = [];
            page.on('pageerror', err => errors.push(err.message));

            await waitForEditor(page);
            await goToTipWithCode(page, tipId);

            // Get block count before adding
            const beforeCount = await page.evaluate(() => {
                const store = window.__scratchStore;
                const vm = store.getState().scratchGui.vm;
                return Object.keys(vm.editingTarget.blocks._blocks).length;
            });

            // Click "Add to my project"
            const addButton = page.locator(
                'button[class*="add-button"], button[class*="addButton"], ' +
                'button[class*="add-to-project"], button[class*="addToProject"]'
            );
            await expect(addButton).toBeVisible({timeout: 5000});
            await addButton.click();

            // Wait for the async shareBlocksToTarget to complete
            await page.waitForTimeout(2000);

            // Assert no page errors from adding
            expect(errors, `Page errors when adding "${template}"`).toEqual([]);

            // Assert blocks were added
            const afterCount = await page.evaluate(() => {
                const store = window.__scratchStore;
                const vm = store.getState().scratchGui.vm;
                return Object.keys(vm.editingTarget.blocks._blocks).length;
            });

            expect(
                afterCount,
                `Block count should increase after adding "${template}" (before: ${beforeCount})`
            ).toBeGreaterThan(beforeCount);

            // Press the green flag via VM and run for a bit to check for runtime crashes
            await page.evaluate(() => {
                const store = window.__scratchStore;
                const vm = store.getState().scratchGui.vm;
                vm.greenFlag();
            });
            await page.waitForTimeout(3000);
            await page.evaluate(() => {
                const store = window.__scratchStore;
                const vm = store.getState().scratchGui.vm;
                vm.stopAll();
            });
            await page.waitForTimeout(500);

            // Assert no page errors after running
            expect(errors, `Page errors after running green flag with "${template}"`).toEqual([]);
        });
    }
});
