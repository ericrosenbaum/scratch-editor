// Regression: confirms the keyword-search fallback path renders the
// "Basic search" badge and still returns results when the embedding model
// CDN is blocked (corporate/school networks, offline, FF ESR <114, etc.).
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

test('fallback badge appears when CDN is blocked', async ({page}) => {
    // Block the embedding CDN before any page load so the worker can't import it.
    await page.route('**/cdn.jsdelivr.net/**', route => route.abort('blockedbyclient'));
    // Also block huggingface model weights in case the import somehow succeeded.
    await page.route('**/huggingface.co/**', route => route.abort('blockedbyclient'));
    await page.route('**/huggingface.co/**/*', route => route.abort('blockedbyclient'));

    await waitForEditor(page);
    await openUnstuck(page);

    // The worker rejection can take a few seconds — wait for the fallback badge.
    const badge = page.locator('[class*="fallback-badge"], [class*="fallbackBadge"]');
    await expect(badge).toBeVisible({timeout: 15000});
    await expect(badge).toHaveText('Basic search');

    // Submit a keyword query and confirm results come back from the keyword provider.
    const input = page.locator('[class*="query-input"], [class*="queryInput"]');
    await input.fill('move');
    await input.press('Enter');
    await page.waitForSelector(
        '[class*="result-card"], [class*="resultCard"]',
        {timeout: 5000}
    );
});
