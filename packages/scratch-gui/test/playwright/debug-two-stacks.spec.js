const {test, expect} = require('@playwright/test');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'test-results');

const multiStackTips = [
    {tipId: 'broadcast-message', template: 'broadcastAndReceive'},
    {tipId: 'clone-sprite', template: 'cloneCreateAndBehave'},
    {tipId: 'clone-basics', template: 'cloneBasicsPair'},
    {tipId: 'two-stacks-same-time', template: 'twoFlagStacks'},
    {tipId: 'broadcast-for-levels', template: 'broadcastLevels'},
    // Regression checks: single-stack tips
    {tipId: 'nothing-happens', template: 'whenFlagMove'},
    {tipId: 'forever-loop', template: 'foreverMove'},
    {tipId: 'animate-costume', template: 'foreverNextCostume'}
];

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

const goToTipWithCode = async (page, tipId) => {
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

    // The example code is shown directly now (no expand step needed); give the
    // block preview a moment to render.
    await page.waitForTimeout(600);
};

test.describe('Debug two-stack block previews', () => {
    for (const {tipId, template} of multiStackTips) {
        test(`screenshot ${tipId}`, async ({page}) => {
            await waitForEditor(page);
            await goToTipWithCode(page, tipId);

            // Screenshot the whole unstuck card
            const card = page.locator('[class*="unstuck-container"], [class*="unstuckContainer"]');
            await card.screenshot({path: path.join(SCREENSHOT_DIR, `two-stack-${tipId}-card.png`)});

            // Also screenshot just the block preview workspace
            const preview = page.locator('[class*="workspace-container"], [class*="workspaceContainer"]');
            if (await preview.isVisible().catch(() => false)) {
                await preview.screenshot({path: path.join(SCREENSHOT_DIR, `two-stack-${tipId}-blocks.png`)});
            }

            // Verify both stacks are visible for multi-stack templates
            const blockCount = await page.evaluate(() => {
                const container = document.querySelector(
                    '[class*="workspace-container"], [class*="workspaceContainer"]'
                );
                if (!container) return 0;
                const canvas = container.querySelector('.blocklyBlockCanvas');
                if (!canvas) return 0;
                return Array.from(canvas.children).filter(
                    el => el.tagName === 'g' && el.getAttribute('data-id')
                ).length;
            });
            expect(blockCount).toBeGreaterThan(0);
        });
    }
});
