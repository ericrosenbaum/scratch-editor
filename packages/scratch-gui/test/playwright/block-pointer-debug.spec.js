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
    // Remove webpack-dev-server overlay iframe that can intercept pointer events.
    // Wait briefly for it to appear since it's injected asynchronously.
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
        const overlay = document.getElementById('webpack-dev-server-client-overlay');
        if (overlay) overlay.remove();
    });
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

    test('show-me highlights a block in the flyout', async ({page}) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await waitForEditor(page);
        await openUnstuck(page);
        await typeQuery(page, 'nothing happens');

        const showMe = page.locator('[class*="show-me"], [class*="showMe"]').first();
        await expect(showMe).toBeVisible({timeout: 3000});
        await showMe.click();

        await page.waitForTimeout(1000);

        const overlay = page.locator('.driver-overlay');
        await expect(overlay).toBeVisible({timeout: 3000});

        const popoverTitle = page.locator('.driver-popover-title');
        await expect(popoverTitle).toBeVisible();
        const title = await popoverTitle.textContent();
        expect(title).toContain('when green flag clicked');

        const relevantErrors = errors.filter(e =>
            !e.includes('defaultProps') && !e.includes('importScripts'));
        expect(relevantErrors).toEqual([]);
    });

    test('show-me switches category and highlights block from a different category', async ({page}) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await waitForEditor(page);

        // Select events category so motion blocks are scrolled off
        await page.click('.blocklyToolboxCategory#events');
        await page.waitForTimeout(300);

        // Verify motion block is NOT visible
        const motionBefore = await page.evaluate(() => {
            const flyout = document.querySelector('.blocklyFlyout');
            const flyoutRect = flyout.getBoundingClientRect();
            const block = document.querySelector(
                '.blocklyFlyout .motion_movesteps.blocklyDraggable'
            );
            if (!block) return {found: false};
            const blockRect = block.getBoundingClientRect();
            return {
                found: true,
                visible: blockRect.top >= flyoutRect.top && blockRect.bottom <= flyoutRect.bottom
            };
        });
        expect(motionBefore.visible).toBe(false);

        // Open unstuck and ask about motion
        await openUnstuck(page);
        await typeQuery(page, 'how do I make my sprite move');

        const showMe = page.locator('[class*="show-me"], [class*="showMe"]').first();
        await expect(showMe).toBeVisible({timeout: 3000});
        await showMe.click();

        await page.waitForTimeout(1000);

        // Verify highlight appeared
        const overlay = page.locator('.driver-overlay');
        await expect(overlay).toBeVisible({timeout: 3000});

        // Verify the block is now visible in the flyout
        const motionAfter = await page.evaluate(() => {
            const flyout = document.querySelector('.blocklyFlyout');
            const flyoutRect = flyout.getBoundingClientRect();
            const block = document.querySelector(
                '.blocklyFlyout .motion_movesteps.blocklyDraggable'
            );
            if (!block) return {found: false};
            const blockRect = block.getBoundingClientRect();
            return {
                found: true,
                visible: blockRect.top >= flyoutRect.top && blockRect.bottom <= flyoutRect.bottom,
                selectedCategory: document.querySelector('.blocklyToolboxSelected')?.id
            };
        });
        expect(motionAfter.visible).toBe(true);
        expect(motionAfter.selectedCategory).toBe('motion');

        const relevantErrors = errors.filter(e =>
            !e.includes('defaultProps') && !e.includes('importScripts'));
        expect(relevantErrors).toEqual([]);
    });
});
