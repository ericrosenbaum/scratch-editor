const {test, expect} = require('@playwright/test');

const waitForEditor = async page => {
    await page.goto('/');
    await page.waitForSelector('[class*="blocks_blocks"]', {timeout: 30000});
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
        const wdsOverlay = document.getElementById('webpack-dev-server-client-overlay');
        if (wdsOverlay) wdsOverlay.remove();
    });
};

test.describe('Block checkbox pointer', () => {
    test('Motion flyout renders checkbox bubbles for reporter blocks', async ({page}) => {
        await waitForEditor(page);

        // Motion is the default open category, so motion_xposition's checkbox
        // bubble should already be in the bubble canvas.
        const checkboxes = await page.locator('.blocklyFlyout .blocklyFlyoutCheckbox').count();
        expect(checkboxes).toBeGreaterThanOrEqual(3); // x, y, direction

        const blockLocator = page.locator('.blocklyFlyout .motion_xposition.blocklyDraggable')
            .first();
        const motionBlockBox = await blockLocator.boundingBox();
        expect(motionBlockBox).not.toBeNull();

        // At least one of the checkbox bubbles should sit to the left of the
        // motion_xposition block at roughly the same vertical center — this is
        // how findFlyoutCheckboxElement will identify the right one in prod.
        const candidate = await page.evaluate(rect => {
            const checks = Array.from(document.querySelectorAll(
                '.blocklyFlyout .blocklyFlyoutCheckbox'
            ));
            const targetY = rect.y + (rect.height / 2);
            const aligned = checks.find(c => {
                const r = c.getBoundingClientRect();
                return Math.abs((r.y + (r.height / 2)) - targetY) < 6 &&
                    r.right <= rect.x + 2;
            });
            return aligned ? aligned.getBoundingClientRect() : null;
        }, motionBlockBox);
        expect(candidate).not.toBeNull();
    });

    test('Checkbox bubbles are aligned next to their reporter blocks', async ({page}) => {
        await waitForEditor(page);

        // Each checkbox in the flyout should be aligned with exactly one
        // reporter block at the same vertical center. This is the property
        // findFlyoutCheckboxElement relies on indirectly (it locates the
        // bubble via Blockly's block.getIcon('checkbox') API).
        const checks = await page.evaluate(() => {
            const reporters = ['motion_xposition', 'motion_yposition', 'motion_direction'];
            return reporters.map(opcode => {
                const block = document.querySelector(`.blocklyFlyout .${opcode}.blocklyDraggable`);
                if (!block) return {opcode, ok: false, reason: 'no block'};
                const blockRect = block.getBoundingClientRect();
                const targetY = blockRect.y + (blockRect.height / 2);
                const checkbox = Array.from(document.querySelectorAll(
                    '.blocklyFlyout .blocklyFlyoutCheckbox'
                )).find(c => {
                    const r = c.getBoundingClientRect();
                    return Math.abs((r.y + (r.height / 2)) - targetY) < 8 &&
                        r.right <= blockRect.x + 2;
                });
                return {opcode, ok: !!checkbox};
            });
        });

        for (const c of checks) {
            expect(c.ok, `${c.opcode} has aligned checkbox`).toBe(true);
        }
    });
});
