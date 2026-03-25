// @ts-check
const {test, expect} = require('@playwright/test');
const path = require('path');

const uri = `file://${path.resolve(__dirname, '../../build/index.html')}`;

// ─── Helpers ───────────────────────────────────────────────────────────

async function waitForEditor (page) {
    // Dismiss WebGL modal if it appears (headless Chrome may lack WebGL)
    const backButton = page.locator('[class*="webgl-modal"] button, [class*="back-button"]');
    try {
        await backButton.click({timeout: 3000});
    } catch (_) {
        // Modal didn't appear — fine
    }

    await page.locator('[class*="green-flag_green-flag-button"]').waitFor({state: 'visible', timeout: 30000});
    await page.waitForTimeout(500);
}

async function openProcessView (page) {
    await page.locator('span:has-text("Process")').first().click();
    await page.locator('[class*="process-view-panel"]').waitFor({state: 'visible', timeout: 10000});
    await page.waitForTimeout(600);
}

async function switchToCodeTab (page) {
    await page.locator('span:has-text("Code")').first().click();
    await page.waitForTimeout(200);
}

async function expandAll (page) {
    await page.locator('button:has-text("Expand All")').click();
    await page.waitForTimeout(300);
}

async function getEventTexts (page) {
    return page.locator('[class*="event-label"]').allTextContents();
}

async function getBadgeTexts (page) {
    return page.locator('[class*="classification-badge"]').allTextContents();
}

async function getHeaderStats (page) {
    return page.locator('[class*="header-stats"]').textContent();
}

async function clickGreenFlag (page) {
    await page.locator('[class*="green-flag_green-flag-button"]').click();
    await page.waitForTimeout(300);
}

async function clickStop (page) {
    await page.locator('[class*="stop-all_stop-all-button"]').click();
    await page.waitForTimeout(300);
}

/** Paint a blank sprite via the sprite action menu. */
async function addBlankSprite (page) {
    await switchToCodeTab(page);

    const btn = page.locator('button[aria-label="Choose a Sprite"]').first();
    await btn.hover();
    await page.waitForTimeout(500);

    await page.locator('button[aria-label="Paint"]').first().click({force: true});
    await page.waitForTimeout(1000);

    // Adding a sprite switches to Costumes tab — go back to Code
    await switchToCodeTab(page);
}

/** Paint a blank costume on the current sprite. */
async function addPaintedCostume (page) {
    await page.locator('span:has-text("Costumes")').first().click();
    await page.waitForTimeout(500);
    const btn = page.locator('button[aria-label="Choose a Costume"]').first();
    await btn.hover();
    await page.waitForTimeout(500);
    await page.locator('button[aria-label="Paint"]').first().click({force: true});
    await page.waitForTimeout(1000);
}

// ─── Tests ───────────────────────────────────────────────────────────

test.describe('Process View — Tab UI', () => {

    test('Process tab exists and toggles panel visibility', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        // Tab should be visible
        const processTab = page.locator('span:has-text("Process")').first();
        await expect(processTab).toBeVisible();

        // Clicking it shows the panel
        await processTab.click();
        await expect(page.locator('[class*="process-view-panel"]')).toBeVisible({timeout: 10000});

        // Switching to Code hides it
        await switchToCodeTab(page);
        await expect(page.locator('[class*="process-view-panel"]')).not.toBeVisible();
    });

    test('Header shows session and chunk counts', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);
        await openProcessView(page);

        const stats = await getHeaderStats(page);
        expect(stats).toMatch(/\d+\s+session/);
        expect(stats).toMatch(/\d+\s+chunk/);
    });

    test('All six filter pills are visible', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);
        await openProcessView(page);

        for (const label of ['Coding', 'Drawing', 'Sound', 'Testing', 'Debugging', 'Exploring']) {
            await expect(page.locator(`button:has-text("${label}")`).first()).toBeVisible();
        }
    });

    test('Data persists when switching tabs', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        await addBlankSprite(page);

        await openProcessView(page);
        const stats1 = await getHeaderStats(page);

        // Switch away and back
        await switchToCodeTab(page);
        await page.waitForTimeout(500);
        await openProcessView(page);
        const stats2 = await getHeaderStats(page);

        expect(stats2).toBe(stats1);
    });
});

test.describe('Process View — Editor Actions Appear', () => {

    test('Adding a sprite shows up in the process view', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        await addBlankSprite(page);

        await openProcessView(page);
        await expandAll(page);

        const events = await getEventTexts(page);
        const spriteEvents = events.filter(e => /added sprite/i.test(e));
        expect(spriteEvents.length).toBeGreaterThan(0);
    });

    test('Adding a costume shows up in the process view', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        await addPaintedCostume(page);

        await openProcessView(page);
        await expandAll(page);

        const events = await getEventTexts(page);
        expect(events.some(e => /added costume/i.test(e))).toBe(true);
    });

    test('Running and stopping the project shows up in the process view', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        await clickGreenFlag(page);
        await page.waitForTimeout(1000);
        await clickStop(page);
        await page.waitForTimeout(500);

        await openProcessView(page);
        await expandAll(page);

        const events = await getEventTexts(page);
        const execEvents = events.filter(e =>
            /started running/i.test(e) || /stopped/i.test(e) || /green flag/i.test(e)
        );
        expect(execEvents.length).toBeGreaterThan(0);
    });

    test('Multiple actions create chunks with correct classifications', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        // Do a variety of actions
        await addBlankSprite(page);
        await addPaintedCostume(page);
        await switchToCodeTab(page);
        await clickGreenFlag(page);
        await page.waitForTimeout(500);
        await clickStop(page);
        await page.waitForTimeout(500);

        await openProcessView(page);

        const stats = await getHeaderStats(page);
        const chunkMatch = stats.match(/(\d+)\s+chunk/);
        expect(chunkMatch).not.toBeNull();
        expect(parseInt(chunkMatch[1])).toBeGreaterThan(0);

        await expandAll(page);

        const badges = await getBadgeTexts(page);
        expect(badges.length).toBeGreaterThan(0);
        const validClassifications = ['coding', 'drawing', 'sound', 'testing', 'debugging', 'exploring'];
        for (const badge of badges) {
            expect(validClassifications).toContain(badge.toLowerCase().trim());
        }
    });

    test('Expand/collapse all works', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        await clickGreenFlag(page);
        await page.waitForTimeout(500);
        await clickStop(page);
        await page.waitForTimeout(500);

        await openProcessView(page);

        // Expand
        await expandAll(page);
        const chunks = page.locator('[class*="chunk-card"]');
        expect(await chunks.count()).toBeGreaterThan(0);

        // Collapse
        await page.locator('button:has-text("Collapse All")').click();
        await page.waitForTimeout(300);
        await expect(page.locator('[class*="chunk-body"]')).toHaveCount(0);
    });
});

test.describe('Process View — Filtering', () => {

    test('Toggling a filter hides matching chunks', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        await addBlankSprite(page);
        await clickGreenFlag(page);
        await page.waitForTimeout(500);
        await clickStop(page);
        await page.waitForTimeout(500);

        await openProcessView(page);
        await expandAll(page);

        const badgesBefore = await getBadgeTexts(page);
        if (badgesBefore.length > 0) {
            const firstBadge = badgesBefore[0].trim();
            const filterName = firstBadge.charAt(0).toUpperCase() + firstBadge.slice(1).toLowerCase();
            await page.locator(`button:has-text("${filterName}")`).first().click();
            await page.waitForTimeout(300);

            const badgesAfter = await getBadgeTexts(page);
            const matchingAfter = badgesAfter.filter(
                b => b.toLowerCase().trim() === firstBadge.toLowerCase()
            );
            expect(matchingAfter.length).toBe(0);
        }
    });
});

test.describe('Process View — Delete', () => {

    test('Clear all history button with confirm removes all sessions', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        // Create some activity
        await addBlankSprite(page);
        await clickGreenFlag(page);
        await page.waitForTimeout(500);
        await clickStop(page);
        await page.waitForTimeout(500);

        await openProcessView(page);

        // Verify we have data
        const statsBefore = await getHeaderStats(page);
        expect(statsBefore).toMatch(/[1-9]\d*\s+session/);

        // Accept the confirm dialog when it appears
        page.on('dialog', dialog => dialog.accept());

        // Click the trash button in the header
        await page.locator('[class*="header-trash-button"]').click();
        await page.waitForTimeout(500);

        // Verify empty
        const statsAfter = await getHeaderStats(page);
        expect(statsAfter).toMatch(/0\s+session/);
        expect(statsAfter).toMatch(/0\s+chunk/);
        await expect(page.locator('[class*="empty-state"]')).toBeVisible();
    });

    test('Dismissing the confirm dialog does not clear history', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        await addBlankSprite(page);

        await openProcessView(page);

        const statsBefore = await getHeaderStats(page);
        expect(statsBefore).toMatch(/[1-9]\d*\s+session/);

        // Dismiss the confirm dialog
        page.on('dialog', dialog => dialog.dismiss());

        await page.locator('[class*="header-trash-button"]').click();
        await page.waitForTimeout(500);

        // Data should still be there
        const statsAfter = await getHeaderStats(page);
        expect(statsAfter).toBe(statsBefore);
    });

    test('Deleting a single session removes it from the list', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        await addBlankSprite(page);

        await openProcessView(page);

        // Count session headers (one per session card)
        const sessionCountBefore = await page.locator('[class*="session-header"]').count();
        expect(sessionCountBefore).toBeGreaterThan(0);

        // Hover to reveal the delete button, then click it
        const firstSession = page.locator('[class*="session-header"]').first();
        await firstSession.hover();
        await page.locator('[class*="session-delete-button"]').first().click();
        await page.waitForTimeout(500);

        const sessionCountAfter = await page.locator('[class*="session-header"]').count();
        expect(sessionCountAfter).toBe(sessionCountBefore - 1);
    });

    test('Empty sessions (no chunks) are not displayed', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        // Just opening the editor creates a session, but if no meaningful
        // actions happen there may be no chunks. Wait briefly then check.
        await page.waitForTimeout(1000);

        await openProcessView(page);

        // Every visible session should have at least 1 chunk
        const sessionStats = await page.locator('[class*="session-stats"]').allTextContents();
        for (const stat of sessionStats) {
            const chunkMatch = stat.match(/(\d+)\s+chunk/);
            if (chunkMatch) {
                expect(parseInt(chunkMatch[1])).toBeGreaterThan(0);
            }
        }
    });
});
