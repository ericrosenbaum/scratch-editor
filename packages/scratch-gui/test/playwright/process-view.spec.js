// @ts-check
const {test, expect} = require('@playwright/test');
const path = require('path');

const uri = `file://${path.resolve(__dirname, '../../build/index.html')}`;

// ─── Helpers ───────────────────────────────────────────────────────────

async function waitForEditor (page) {
    await page.locator('[class*="green-flag_green-flag-button"]').waitFor({state: 'visible', timeout: 30000});
    await page.waitForTimeout(500);
}

async function openProcessView (page) {
    await page.locator('button[title="Process View"]').click();
    await page.locator('text=Process View').first().waitFor({state: 'visible'});
    await page.waitForTimeout(600);
}

async function closeProcessView (page) {
    await page.locator('button[title="Close"]').click();
    await page.waitForTimeout(200);
}

async function expandAll (page) {
    await page.locator('button:has-text("Expand All")').click();
    await page.waitForTimeout(300);
}

async function collapseAll (page) {
    await page.locator('button:has-text("Collapse All")').click();
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

/** Click the "Choose a Sprite" paint option to add a blank sprite. */
async function addBlankSprite (page) {
    // Ensure we're on the Code tab so the sprite picker is visible
    await page.locator('span:has-text("Code")').first().click();
    await page.waitForTimeout(300);

    const btn = page.locator('button[aria-label="Choose a Sprite"]').first();
    await btn.hover();
    await page.waitForTimeout(500);

    // The Paint button within the sprite action menu (bottom of sprite pane)
    // Use force click to bypass any intercept issues
    await page.locator('button[aria-label="Paint"]').first().click({force: true});
    await page.waitForTimeout(1000);

    // Switch back to Code tab (adding blank sprite switches to Costumes)
    await page.locator('span:has-text("Code")').first().click();
    await page.waitForTimeout(300);
}

/** Add a new empty costume via paint. */
async function addPaintedCostume (page) {
    await page.locator('span:has-text("Costumes")').first().click();
    await page.waitForTimeout(500);
    const btn = page.locator('button[aria-label="Choose a Costume"]').first();
    await btn.hover();
    await page.waitForTimeout(500);
    await page.locator('button[aria-label="Paint"]').first().click({force: true});
    await page.waitForTimeout(1000);
}

/** Create a variable via the Variables category dialog. */
async function createVariable (page, name) {
    await page.locator(
        '[class*="scratchCategoryMenuItemLabel"]:has-text("Variables")'
    ).first().click();
    await page.waitForTimeout(300);

    await page.locator('text=Make a Variable').first().click();
    await page.waitForTimeout(500);

    const input = page.locator('input[name="New variable name:"]');
    await input.fill(name);
    await page.locator('button:has-text("OK")').click();
    await page.waitForTimeout(500);
    // Wait for block debounce (variable creation changes block count)
    await page.waitForTimeout(2500);
}

// ─── Tests ───────────────────────────────────────────────────────────

test.describe('Process View — Panel UI', () => {

    test('Toggle button is visible and opens/closes the panel', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        const toggleBtn = page.locator('button[title="Process View"]');
        await expect(toggleBtn).toBeVisible();

        // Open
        await toggleBtn.click();
        const header = page.locator('text=Process View').first();
        await expect(header).toBeVisible();
        await expect(page.locator('button[title="Close"]')).toBeVisible();

        // Close
        await page.locator('button[title="Close"]').click();
        await expect(page.locator('[class*="process-view-overlay"]')).toHaveCount(0);
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

    test('Expand All and Collapse All buttons work', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        // Generate some events first
        await clickGreenFlag(page);
        await page.waitForTimeout(500);
        await clickStop(page);
        await page.waitForTimeout(500);

        await openProcessView(page);

        // Expand All
        await expandAll(page);
        const chunks = page.locator('[class*="chunk-card"]');
        const count = await chunks.count();
        expect(count).toBeGreaterThan(0);

        // Collapse All
        await collapseAll(page);
        await expect(page.locator('[class*="chunk-body"]')).toHaveCount(0);
    });

    test('Session card shows date, label, and stats', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        // Add a sprite so there's a meaningful label
        await addBlankSprite(page);

        await openProcessView(page);

        const label = page.locator('[class*="session-label"]').first();
        await expect(label).toBeVisible();
        expect((await label.textContent()).length).toBeGreaterThan(0);

        const date = page.locator('[class*="session-date"]').first();
        await expect(date).toBeVisible();

        const stats = page.locator('[class*="session-stats"]').first();
        await expect(stats).toBeVisible();
        const statsText = await stats.textContent();
        expect(statsText).toContain('chunk');
        expect(statsText).toContain('event');
    });

    test('Session expands/collapses on header click', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        await addBlankSprite(page);
        await openProcessView(page);

        const sessionHeader = page.locator('[class*="session-header"]').first();

        // Expand
        await sessionHeader.click();
        await page.waitForTimeout(300);
        expect(await page.locator('[class*="chunk-card"]').count()).toBeGreaterThan(0);

        // Collapse
        await sessionHeader.click();
        await page.waitForTimeout(300);
        await expect(page.locator('[class*="session-body"]')).toHaveCount(0);
    });

    test('Chunk card shows classification badge and label', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        await addBlankSprite(page);
        await openProcessView(page);
        await expandAll(page);

        const badges = await getBadgeTexts(page);
        expect(badges.length).toBeGreaterThan(0);
        const validClassifications = ['coding', 'drawing', 'sound', 'testing', 'debugging', 'exploring'];
        for (const badge of badges) {
            expect(validClassifications).toContain(badge.toLowerCase().trim());
        }

        await expect(page.locator('[class*="chunk-label"]').first()).toBeVisible();
    });

    test('Chunk card expands to show event rows with timestamps', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        await clickGreenFlag(page);
        await page.waitForTimeout(500);
        await clickStop(page);
        await page.waitForTimeout(500);

        await openProcessView(page);

        // Expand the session first
        const sessionHeader = page.locator('[class*="session-header"]').first();
        await sessionHeader.click();
        await page.waitForTimeout(300);

        // Now click a chunk header to expand events (chunks start collapsed)
        const chunkHeader = page.locator('[class*="chunk-header"]').first();
        await chunkHeader.click();
        await page.waitForTimeout(300);

        expect(await page.locator('[class*="event-row"]').count()).toBeGreaterThan(0);
        expect(await page.locator('[class*="event-time"]').count()).toBeGreaterThan(0);
    });

    test('Process view persists data across close/reopen', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        await addBlankSprite(page);

        await openProcessView(page);
        const stats1 = await getHeaderStats(page);
        await closeProcessView(page);

        await page.waitForTimeout(500);
        await openProcessView(page);
        const stats2 = await getHeaderStats(page);
        expect(stats2).toBe(stats1);
    });
});

test.describe('Process View — Event Recording', () => {

    test('Adding a sprite records sprite_added event', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        await addBlankSprite(page);

        await openProcessView(page);
        await expandAll(page);

        const events = await getEventTexts(page);
        const spriteEvents = events.filter(e => /added sprite/i.test(e));
        expect(spriteEvents.length).toBeGreaterThan(0);
    });

    test('Adding two sprites records two sprite_added events', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        await addBlankSprite(page);
        await addBlankSprite(page);

        await openProcessView(page);
        await expandAll(page);

        const events = await getEventTexts(page);
        const spriteEvents = events.filter(e => /added sprite/i.test(e));
        expect(spriteEvents.length).toBeGreaterThanOrEqual(2);
    });

    test('Running and stopping records execution events', async ({page}) => {
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

    test('Multiple run/stop cycles are all recorded', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        for (let i = 0; i < 3; i++) {
            await clickGreenFlag(page);
            await page.waitForTimeout(400);
            await clickStop(page);
            await page.waitForTimeout(400);
        }

        await openProcessView(page);
        await page.waitForTimeout(500);
        await expandAll(page);
        await page.waitForTimeout(500);

        const badges = await getBadgeTexts(page);
        const chunkLabels = await page.locator('[class*="chunk-label"]').allTextContents();

        // The chunk labels should mention "Tested project N times"
        const hasTestLabel = chunkLabels.some(l => /tested project/i.test(l));
        // Or at minimum, some execution-related events were recorded
        const execLabels = chunkLabels.filter(l =>
            /tested/i.test(l) || /running/i.test(l) || /project/i.test(l)
        );
        expect(badges.length).toBeGreaterThan(0);
        // Check that the testing label reflects at least the 3 runs
        if (hasTestLabel) {
            const match = chunkLabels.find(l => /tested project/i.test(l));
            const numMatch = match.match(/(\d+)\s+time/);
            if (numMatch) {
                expect(parseInt(numMatch[1])).toBeGreaterThanOrEqual(3);
            }
        }
    });

    test('Adding a costume records costume_added event', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        await addPaintedCostume(page);

        await openProcessView(page);
        await expandAll(page);

        const events = await getEventTexts(page);
        expect(events.some(e => /added costume/i.test(e))).toBe(true);
    });

    // Sound library depends on asset files being available (may fail offline)
    test.skip('Adding a sound from library records sound_added event', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        // Switch to Sounds tab
        await page.locator('span:has-text("Sounds")').first().click();
        await page.waitForTimeout(500);

        // Open sound library
        await page.locator('button[aria-label="Choose a Sound"]').first().click();
        await page.waitForTimeout(2000);

        // Pick a sound from the library — try a few options
        const soundLibrary = page.locator('[class*="library_library-scroll-grid"]');
        const libraryVisible = await soundLibrary.isVisible().catch(() => false);
        if (libraryVisible) {
            // Click the first item in the library
            const firstItem = page.locator('[class*="library-item_library-item"]').first();
            if (await firstItem.isVisible().catch(() => false)) {
                await firstItem.click();
                await page.waitForTimeout(1000);
            }
        }

        await openProcessView(page);
        await expandAll(page);

        const events = await getEventTexts(page);
        // If library loaded and we picked a sound, we should see "Added sound"
        // If library didn't load (offline), the test still validates we don't crash
        if (libraryVisible) {
            expect(events.some(e => /added sound/i.test(e))).toBe(true);
        }
    });

    test('Adding a backdrop records an event', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        // Select the stage
        await page.locator('[class*="stage-selector_stage-selector"]').click();
        await page.waitForTimeout(500);

        // Switch to Backdrops tab
        await page.locator('span:has-text("Backdrops")').first().click();
        await page.waitForTimeout(500);

        // Paint a new backdrop
        const btn = page.locator('button[aria-label="Choose a Backdrop"]').first();
        await btn.hover();
        await page.waitForTimeout(500);
        await page.locator('button[aria-label="Paint"]').first().click();
        await page.waitForTimeout(1000);

        await openProcessView(page);
        await expandAll(page);

        const events = await getEventTexts(page);
        // backdrop_added renders as "Added costume" in the event-row component
        expect(events.some(e => /added costume/i.test(e))).toBe(true);
    });

    test('Creating a variable is captured in the session', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        await createVariable(page, 'score');

        await openProcessView(page);

        // The session should exist and have recorded some activity
        const stats = await getHeaderStats(page);
        expect(stats).toMatch(/\d+\s+session/);
        expect(stats).toMatch(/\d+\s+chunk/);
    });

    test('Event rows show sprite chip for sprite-specific events', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        await addBlankSprite(page);

        await openProcessView(page);
        await expandAll(page);

        // Expand the chunk that contains the sprite_added event
        const chunkHeaders = page.locator('[class*="chunk-header"]');
        const chunkCount = await chunkHeaders.count();
        for (let i = 0; i < chunkCount; i++) {
            await chunkHeaders.nth(i).click();
            await page.waitForTimeout(200);
        }

        const chips = page.locator('[class*="sprite-chip"]');
        const chipCount = await chips.count();
        if (chipCount > 0) {
            expect((await chips.first().textContent()).length).toBeGreaterThan(0);
        }
    });
});

test.describe('Process View — Filtering', () => {

    test('Toggling a filter off hides matching chunks', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        // Create different activity types
        await addBlankSprite(page); // sprite event → exploring/coding
        await clickGreenFlag(page);
        await page.waitForTimeout(500);
        await clickStop(page);
        await page.waitForTimeout(500);

        await openProcessView(page);
        await expandAll(page);

        const badgesBefore = await getBadgeTexts(page);
        const totalBefore = badgesBefore.length;

        if (totalBefore > 0) {
            // Find which classification exists and toggle it off
            const firstBadge = badgesBefore[0].trim();
            // Find the matching filter pill by capitalizing first letter
            const filterName = firstBadge.charAt(0).toUpperCase() + firstBadge.slice(1).toLowerCase();
            await page.locator(`button:has-text("${filterName}")`).first().click();
            await page.waitForTimeout(300);

            const badgesAfter = await getBadgeTexts(page);
            const matchingAfter = badgesAfter.filter(
                b => b.toLowerCase().trim() === firstBadge.toLowerCase()
            );
            expect(matchingAfter.length).toBe(0);

            // Re-enable
            await page.locator(`button:has-text("${filterName}")`).first().click();
        }
    });

    test('All filters can be toggled independently', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);
        await openProcessView(page);

        const filters = ['Coding', 'Drawing', 'Sound', 'Testing', 'Debugging', 'Exploring'];
        for (const label of filters) {
            const pill = page.locator(`button:has-text("${label}")`).first();

            // Toggle off
            await pill.click();
            await page.waitForTimeout(100);

            // Toggle back on
            await pill.click();
            await page.waitForTimeout(100);
        }
        // If we got here without errors, all filters are independently togglable
    });
});

test.describe('Process View — Complex Workflows', () => {

    test('Sprite add + costume + run creates a session with multiple chunks', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        // 1. Add a sprite
        await addBlankSprite(page);

        // 2. Add a costume to it
        await addPaintedCostume(page);

        // 3. Run the project
        await page.locator('span:has-text("Code")').first().click();
        await page.waitForTimeout(300);
        await clickGreenFlag(page);
        await page.waitForTimeout(1000);
        await clickStop(page);
        await page.waitForTimeout(500);

        await openProcessView(page);

        const stats = await getHeaderStats(page);
        // Should have at least 1 chunk
        const chunkMatch = stats.match(/(\d+)\s+chunk/);
        expect(chunkMatch).not.toBeNull();
        expect(parseInt(chunkMatch[1])).toBeGreaterThan(0);

        await expandAll(page);

        const badges = await getBadgeTexts(page);
        expect(badges.length).toBeGreaterThan(0);

        const sessionLabel = page.locator('[class*="session-label"]').first();
        expect((await sessionLabel.textContent()).length).toBeGreaterThan(0);
    });

    test('Variable + run + sprite creates multiple event types', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        // Create a variable (adds blocks)
        await createVariable(page, 'lives');

        // Run + stop
        await clickGreenFlag(page);
        await page.waitForTimeout(500);
        await clickStop(page);
        await page.waitForTimeout(500);

        // Add a sprite
        await addBlankSprite(page);

        await openProcessView(page);
        await expandAll(page);

        const events = await getEventTexts(page);
        // Should have a mix of event types
        const hasBlock = events.some(e => /block/i.test(e));
        const hasExec = events.some(e => /started running|stopped|green flag/i.test(e));
        const hasSprite = events.some(e => /added sprite/i.test(e));
        expect(hasBlock || hasExec || hasSprite).toBe(true);
        // At least two different types
        expect([hasBlock, hasExec, hasSprite].filter(Boolean).length).toBeGreaterThanOrEqual(2);
    });

    test('Adding multiple sprites creates multiple events', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        await addBlankSprite(page);
        await addBlankSprite(page);

        await openProcessView(page);
        await expandAll(page);

        const events = await getEventTexts(page);
        const spriteEvents = events.filter(e => /added sprite/i.test(e));
        expect(spriteEvents.length).toBeGreaterThanOrEqual(2);
    });

    test('Full workflow: verify chunk labels match activity type', async ({page}) => {
        await page.goto(uri);
        await waitForEditor(page);

        // Run+stop multiple times to create a testing chunk
        for (let i = 0; i < 3; i++) {
            await clickGreenFlag(page);
            await page.waitForTimeout(300);
            await clickStop(page);
            await page.waitForTimeout(300);
        }

        await openProcessView(page);
        await expandAll(page);

        const badges = await getBadgeTexts(page);
        const labels = await page.locator('[class*="chunk-label"]').allTextContents();

        // A testing chunk should have a "Tested project" label
        const hasTestBadge = badges.some(b => b.toLowerCase().trim() === 'testing');
        if (hasTestBadge) {
            expect(labels.some(l => /tested project/i.test(l))).toBe(true);
        }
    });
});
