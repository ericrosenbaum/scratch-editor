const {test, expect} = require('@playwright/test');

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

// Navigate to a specific tip via Redux
const goToTip = async (page, tipId) => {
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
};

// Click the first "Show me" button
const clickShowMe = async page => {
    const showMe = page.locator(
        'button[class*="show-me"], button[class*="showMe"]'
    ).first();
    await expect(showMe).toBeVisible({timeout: 5000});
    await showMe.click();
};

test.describe('Tab highlight overlay covers blocks area', () => {

    test('blockly overlay divs have lowered z-index during tab highlight', async ({page}) => {
        await waitForEditor(page);
        await goToTip(page, 'add-costume');
        await clickShowMe(page);
        await page.waitForTimeout(800);

        const overlay = page.locator('.driver-overlay');
        await expect(overlay).toBeVisible({timeout: 5000});

        // Blockly's high-z-index overlay divs should be lowered below driver overlay (10000)
        const zIndices = await page.evaluate(() =>
            Array.from(document.querySelectorAll(
                '.blocklyWidgetDiv, .blocklyTooltipDiv, .blocklyDropDownDiv'
            ))
                .filter(div => div.style.zIndex !== '')
                .map(div => parseInt(div.style.zIndex, 10))
        );
        expect(zIndices.length).toBeGreaterThanOrEqual(1);
        for (const z of zIndices) {
            expect(z).toBeLessThan(10000);
        }

        // injectionDiv should NOT be modified (workspace should remain visible)
        const injectionZIndices = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.injectionDiv'))
                .map(div => div.style.zIndex)
        );
        for (const z of injectionZIndices) {
            expect(z).not.toBe('-1');
        }
    });

    test('blockly overlay z-indices are restored after highlight close', async ({page}) => {
        await waitForEditor(page);

        // Record original z-indices of blockly overlay divs
        const originalZIndices = await page.evaluate(() =>
            Array.from(document.querySelectorAll(
                '.blocklyWidgetDiv, .blocklyTooltipDiv, .blocklyDropDownDiv'
            ))
                .map(div => div.style.zIndex)
        );

        await goToTip(page, 'add-costume');
        await page.waitForTimeout(500);
        await clickShowMe(page);
        await page.waitForTimeout(1000);

        const overlay = page.locator('.driver-overlay');
        await expect(overlay).toBeVisible({timeout: 5000});

        // Close the highlight
        const closeBtn = page.locator('.driver-popover-close-btn');
        if (await closeBtn.isVisible({timeout: 2000}).catch(() => false)) {
            await closeBtn.click();
        } else {
            await page.locator('.driver-overlay').click({position: {x: 10, y: 10}});
        }
        await page.waitForTimeout(500);

        // z-indices should be restored
        const restoredZIndices = await page.evaluate(() =>
            Array.from(document.querySelectorAll(
                '.blocklyWidgetDiv, .blocklyTooltipDiv, .blocklyDropDownDiv'
            ))
                .map(div => div.style.zIndex)
        );
        expect(restoredZIndices).toEqual(originalZIndices);
    });
});

test.describe('Block scrolled into view before highlight', () => {

    // Helper to verify a block is visible in the flyout after "show me"
    const expectBlockVisible = async (page, tipId, opcode) => {
        await waitForEditor(page);
        await goToTip(page, tipId);
        await clickShowMe(page);
        await page.waitForTimeout(2000);

        const overlay = page.locator('.driver-overlay');
        await expect(overlay).toBeVisible({timeout: 5000});

        const isVisible = await page.evaluate(op => {
            const flyout = document.querySelector('.blocklyFlyout');
            if (!flyout) return false;
            const flyoutRect = flyout.getBoundingClientRect();
            const block = document.querySelector(
                `.blocklyFlyout .${op}.blocklyDraggable`
            );
            if (!block) return false;
            const blockRect = block.getBoundingClientRect();
            return blockRect.top >= flyoutRect.top &&
                   blockRect.bottom <= flyoutRect.bottom;
        }, opcode);

        expect(isVisible).toBe(true);
    };

    test('clone-sprite block (low in control) is visible', async ({page}) => {
        await expectBlockVisible(page, 'clone-sprite', 'control_create_clone_of');
    });

    test('sprite-ghost-effect block (low in looks) is visible', async ({page}) => {
        await expectBlockVisible(page, 'sprite-ghost-effect', 'looks_seteffectto');
    });

    test('ask-and-answer block (mid sensing) is visible', async ({page}) => {
        await expectBlockVisible(page, 'ask-and-answer', 'sensing_askandwait');
    });

    test('move-sprite block (top of motion) is visible', async ({page}) => {
        await expectBlockVisible(page, 'move-sprite', 'motion_movesteps');
    });
});
