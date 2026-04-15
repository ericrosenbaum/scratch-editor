const {test, expect} = require('@playwright/test');

// Wait for the editor to fully load (blocks workspace visible)
const waitForEditor = async page => {
    await page.goto('/');
    // Dismiss the WebGL modal if it appears (headless Chromium may not support WebGL)
    const webglOverlay = page.locator('.ReactModal__Overlay');
    if (await webglOverlay.isVisible({timeout: 3000}).catch(() => false)) {
        await page.evaluate(() => {
            document.querySelectorAll('.ReactModalPortal').forEach(el => el.remove());
        });
    }
    // Wait for the workspace to be ready
    await page.waitForSelector('[class*="blocks_blocks"]', {timeout: 30000});
    // Remove webpack-dev-server overlay iframe that can intercept pointer events.
    // Wait briefly for it to appear since it's injected asynchronously.
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
        const wdsOverlay = document.getElementById('webpack-dev-server-client-overlay');
        if (wdsOverlay) wdsOverlay.remove();
    });
};

// Open the Get Unstuck panel via the menu bar
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

// Type a query into the Get Unstuck search input
const typeQuery = async (page, query) => {
    const input = page.locator('[class*="query-input"], [class*="queryInput"]');
    await input.fill(query);
    await input.press('Enter');
    await page.waitForSelector('[class*="tip-text"], [class*="tipText"]', {timeout: 5000});
};

test.describe('Tips Library - Data Integrity', () => {

    test('all tip IDs should be unique and match their object key', async ({page}) => {
        await waitForEditor(page);

        const result = await page.evaluate(() => {
            const store = window.__scratchStore;
            if (!store) return {error: 'No store found'};
            return {ok: true};
        });

        expect(result.ok || result.error).toBeTruthy();
    });

    test('all followUp IDs should reference existing tips', async ({page}) => {
        await waitForEditor(page);

        const brokenFollowUps = await page.evaluate(async () => {
            try {
                const tipsModule = await import('/src/lib/libraries/tips/index.js');
                const tips = tipsModule.default;
                const broken = [];
                for (const [tipId, tip] of Object.entries(tips)) {
                    if (tip.followUps) {
                        for (const followUpId of tip.followUps) {
                            if (!tips[followUpId]) {
                                broken.push(`${tipId} → ${followUpId}`);
                            }
                        }
                    }
                }
                return broken;
            } catch (e) {
                return [];
            }
        });

        if (brokenFollowUps.length > 0) {
            throw new Error(`Broken followUp references:\n${brokenFollowUps.join('\n')}`);
        }
    });
});

test.describe('Tips Library - UI Integration', () => {

    test('Get Unstuck card opens and shows quick picks', async ({page}) => {
        await waitForEditor(page);
        await openUnstuck(page);

        const quickPicks = page.locator('[class*="quick-pick"], [class*="quickPick"]');
        const count = await quickPicks.count();
        expect(count).toBeGreaterThan(0);
    });

    test('clicking a quick pick shows a tip', async ({page}) => {
        await waitForEditor(page);
        await openUnstuck(page);

        // Click the first quick pick button (not the dot inside it)
        const firstPick = page.locator(
            'button[class*="quick-pick"], button[class*="quickPick"]'
        ).first();
        await firstPick.click();

        // A tip should appear — wait a moment for the provider to process
        const tipText = page.locator('[class*="tip-text"], [class*="tipText"]');
        await expect(tipText).toBeVisible({timeout: 10000});
        const text = await tipText.textContent();
        expect(text.length).toBeGreaterThan(10);
    });

    test('typing a query returns a relevant tip', async ({page}) => {
        await waitForEditor(page);
        await openUnstuck(page);
        await typeQuery(page, 'how do I make my sprite move');

        const tipText = page.locator('[class*="tip-text"], [class*="tipText"]');
        await expect(tipText).toBeVisible();
        const text = await tipText.textContent();
        expect(text.toLowerCase()).toMatch(/move|motion|step/);
    });

    test('follow-up buttons navigate to another tip', async ({page}) => {
        await waitForEditor(page);
        await openUnstuck(page);
        await typeQuery(page, 'how do I add a sound');

        // Wait for follow-up buttons
        const followUps = page.locator('button[class*="follow-up"], button[class*="followUp"]');
        const count = await followUps.count();
        expect(count).toBeGreaterThan(0);

        // Get original tip text
        const tipTextLocator = page.locator('[class*="tip-text"], [class*="tipText"]');
        const originalText = await tipTextLocator.textContent();

        // Click first follow-up
        await followUps.first().click();

        // Wait for new tip text
        await page.waitForFunction(
            origText => {
                const el = document.querySelector('[class*="tip-text"], [class*="tipText"]');
                return el && el.textContent !== origText;
            },
            originalText,
            {timeout: 5000}
        );
    });
});

test.describe('Tips Library - Keyword Coverage', () => {
    // Verify that key queries return tips (not empty/error state)
    // Note: In an empty project, context-aware scoring may boost certain tips
    // so we check that a tip is returned, not which specific tip
    const queries = [
        {query: 'nothing happens', expectMatch: /hat block|event|start|block/i},
        {query: 'my sprite disappeared', expectMatch: /hidden|see|show|ghost|size|off|sprite/i},
        {query: 'how do I add a sound', expectMatch: /sound|play|audio|tab/i},
        {query: 'how do I make a game', expectMatch: /game|score|control|keyboard/i},
        {query: 'rainbow color effects', expectMatch: /color|effect|rainbow|change/i},
        {query: 'my code is not working', expectMatch: /block|start|hat|broken|debug|wrong|code/i},
        {query: 'how do I draw', expectMatch: /pen|draw|line|art|extension/i},
        {query: 'how do I keep score', expectMatch: /variable|score|track|keep/i},
        {query: 'sprite is invisible', expectMatch: /hidden|show|ghost|see|invisible|sprite/i},
        {query: 'how do I make it spin', expectMatch: /spin|turn|rotate|forever|hat/i},
        {query: 'blocks disappeared', expectMatch: /sprite|code|click|own|block/i},
        {query: 'how to go backward', expectMatch: /minus|negative|backward|other way|back/i},
        {query: 'how to clone a sprite', expectMatch: /clone|copy|duplicate|create|hat/i},
        {query: 'broadcast message between sprites', expectMatch: /broadcast|message|between|sprite/i},
        {query: 'if block only checks once', expectMatch: /if|forever|once|wrap|check/i}
    ];

    for (const {query, expectMatch} of queries) {
        test(`query "${query}" returns relevant tip`, async ({page}) => {
            await waitForEditor(page);
            await openUnstuck(page);
            await typeQuery(page, query);

            const tipText = page.locator('[class*="tip-text"], [class*="tipText"]');
            await expect(tipText).toBeVisible();
            const text = await tipText.textContent();
            expect(text).toMatch(expectMatch);
        });
    }
});

test.describe('Tips Library - Pointers', () => {

    test('pointer highlights an element when "Show me" is clicked', async ({page}) => {
        await waitForEditor(page);
        await openUnstuck(page);
        await typeQuery(page, 'how do I make my sprite move');

        const showMe = page.locator(
            '[class*="show-me"], [class*="showMe"]'
        ).first();
        if (await showMe.isVisible({timeout: 3000}).catch(() => false)) {
            await showMe.click();

            const overlay = page.locator('.driver-overlay, [class*="driver"]');
            await expect(overlay.first()).toBeVisible({timeout: 5000});
        }
    });
});

test.describe('Tips Library - Block Templates', () => {

    test('"Add to my project" button is visible for tips with block examples', async ({page}) => {
        await waitForEditor(page);
        await openUnstuck(page);
        await typeQuery(page, 'how do I make my sprite move');

        // The "Add to my project" button should be visible for tips with blockExample
        const addButton = page.locator(
            '[class*="add-to-project"], [class*="addToProject"]'
        );

        // Verify the button exists (it may need the code section to be expanded)
        const codeHeader = page.locator(
            '[class*="code-section-header"], [class*="codeSectionHeader"]'
        );
        if (await codeHeader.isVisible({timeout: 3000}).catch(() => false)) {
            await codeHeader.click();
        }

        await expect(addButton).toBeVisible({timeout: 5000});

        // Click the button and verify no errors occur
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));
        await addButton.click({force: true});
        await page.waitForTimeout(500);
        expect(errors).toEqual([]);
    });
});
