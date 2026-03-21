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
};

const openUnstuck = async page => {
    const unstuckLabel = page.locator('[class*="unstuck-label"], [class*="unstuckLabel"]');
    if (await unstuckLabel.isVisible({timeout: 3000}).catch(() => false)) {
        await unstuckLabel.click();
    } else {
        const helpItem = page.locator('[class*="menu-bar-item"][class*="hoverable"]').last();
        await helpItem.click();
    }
    await page.waitForSelector(
        '[class*="unstuck-container"], [class*="unstuckContainer"]',
        {timeout: 5000}
    );
};

const typeQuery = async (page, query) => {
    const input = page.locator('[class*="query-input"], [class*="queryInput"]');
    await input.fill(query);
    await input.press('Enter');
    await page.waitForSelector('[class*="tip-text"], [class*="tipText"]', {timeout: 5000});
};

test.describe('Block-Level Pointers', () => {

    test('show-me highlights a specific block in the flyout', async ({page}) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await waitForEditor(page);
        await openUnstuck(page);
        await typeQuery(page, 'nothing happens');

        // Click show me
        const showMe = page.locator('[class*="show-me"], [class*="showMe"]').first();
        await expect(showMe).toBeVisible({timeout: 3000});
        await showMe.click();

        // Wait for highlight (tab switch 300ms + category scroll 200ms + render)
        await page.waitForTimeout(1000);

        // Verify driver.js overlay and popover appeared
        const overlay = page.locator('.driver-overlay');
        await expect(overlay).toBeVisible({timeout: 3000});

        const popoverTitle = page.locator('.driver-popover-title');
        await expect(popoverTitle).toBeVisible();
        const title = await popoverTitle.textContent();
        expect(title).toContain('when green flag clicked');

        // No JS errors
        const relevantErrors = errors.filter(e => !e.includes('defaultProps'));
        expect(relevantErrors).toEqual([]);
    });

    test('block opcode CSS selectors find flyout blocks', async ({page}) => {
        await waitForEditor(page);

        // motion_movesteps should be visible in the default (Motion) category
        const motionBlock = await page.evaluate(() => {
            const block = document.querySelector(
                '.blocklyFlyout .motion_movesteps.blocklyDraggable'
            );
            return block ? {found: true, text: block.textContent} : {found: false};
        });
        expect(motionBlock.found).toBe(true);

        // Click Events category, then find event_whenflagclicked
        await page.click('.blocklyToolboxCategory#events');
        await page.waitForTimeout(300);

        const eventBlock = await page.evaluate(() => {
            const block = document.querySelector(
                '.blocklyFlyout .event_whenflagclicked.blocklyDraggable'
            );
            return block ? {found: true, text: block.textContent} : {found: false};
        });
        expect(eventBlock.found).toBe(true);
    });
});
