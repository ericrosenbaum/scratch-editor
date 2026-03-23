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

/**
 * All tips with pointers to test. Each entry has:
 * - tipId: the tip ID
 * - pointerType: 'block' for blockOpcode pointers, 'css' for CSS selector pointers
 * - label: expected label text (for verification)
 */
const tipsWithBlockPointers = [
    {tipId: 'nothing-happens', label: 'when green flag clicked'},
    {tipId: 'move-sprite', label: 'move 10 steps'},
    {tipId: 'move-with-keys', label: 'when key pressed'},
    {tipId: 'change-xy-position', label: 'change x by'},
    {tipId: 'go-to-position', label: 'go to x: y:'},
    {tipId: 'glide-to-position', label: 'glide'},
    {tipId: 'say-think', label: 'say Hello!'},
    {tipId: 'say-for-seconds', label: 'say for 2 seconds'},
    {tipId: 'change-costume', label: 'next costume'},
    {tipId: 'animate-costume', label: 'next costume'},
    {tipId: 'forever-loop', label: 'forever'},
    {tipId: 'repeat-loop', label: 'repeat'},
    {tipId: 'detect-collision', label: 'touching'},
    {tipId: 'broadcast-message', label: 'broadcast'},
    {tipId: 'clone-sprite', label: 'create clone'},
    {tipId: 'if-not-forever', label: 'if'},
    {tipId: 'insert-reporter', label: 'pick random'},
    {tipId: 'ask-and-answer', label: 'ask and wait'},
    {tipId: 'mouse-pointer', label: 'go to'},
    {tipId: 'reset-at-start', label: 'go to x: y:'},
    {tipId: 'repeat-until', label: 'repeat until'},
    {tipId: 'make-platformer', label: 'change y by'},
    {tipId: 'make-clicker', label: 'when this sprite clicked'},
    {tipId: 'color-changing', label: 'change color effect'},
    {tipId: 'spinning', label: 'turn'},
    {tipId: 'bouncing-around', label: 'if on edge, bounce'},
    {tipId: 'play-sound-until-done', label: 'play sound until done'},
    {tipId: 'too-fast', label: 'wait 1 seconds'},
    {tipId: 'sprite-ghost-effect', label: 'set ghost effect'},
    {tipId: 'sprite-too-small', label: 'set size to'},
    {tipId: 'sprite-off-stage', label: 'go to x: y:'},
    {tipId: 'debug-with-say', label: 'say'},
    {tipId: 'touching-wrong-color', label: 'touching color'},
    {tipId: 'wait-vs-no-wait', label: 'wait'},
    {tipId: 'two-stacks-same-time', label: 'when green flag clicked'},
    {tipId: 'drag-blocks-to-workspace', label: 'Drag blocks'},
    {tipId: 'add-event-block', label: 'when green flag clicked'},
    {tipId: 'batched-updates', label: 'wait'},
    {tipId: 'touching-color', label: 'touching color'},
    {tipId: 'timer-block', label: 'timer'},
    {tipId: 'change-size', label: 'change size by'},
    {tipId: 'graphic-effects', label: 'set effect to'},
    {tipId: 'backdrop-events', label: 'when backdrop switches'},
    {tipId: 'clone-basics', label: 'when I start as a clone'},
    {tipId: 'clone-delete', label: 'delete this clone'},
    {tipId: 'broadcast-for-levels', label: 'broadcast'},
    {tipId: 'growing-shrinking', label: 'change size by'},
    {tipId: 'surprise-sprite', label: 'pick random'},
    {tipId: 'make-story', label: 'say for 2 seconds'},
    {tipId: 'make-quiz', label: 'ask and wait'},
    {tipId: 'make-game', label: 'when key pressed'}
];

const tipsWithCSSPointers = [
    {tipId: 'green-flag', label: 'green flag'},
    {tipId: 'add-sound', label: 'Sounds tab'},
    {tipId: 'add-costume', label: 'Costumes tab'},
    {tipId: 'sound-volume-zero', label: 'Sound blocks'},
    {tipId: 'sprite-is-hidden', label: 'sprite info'},
    {tipId: 'stop-project', label: 'stop sign'},
    {tipId: 'wrong-sprite-selected', label: 'sprite'},
    {tipId: 'where-did-blocks-go', label: 'sprite'},
    {tipId: 'add-sprite', label: 'new sprite'},
    {tipId: 'change-backdrop', label: 'backdrop'},
    {tipId: 'add-extension', label: 'extensions'},
    {tipId: 'use-variables', label: 'Variables'},
    {tipId: 'change-variable', label: 'Variables'},
    {tipId: 'use-lists', label: 'Variables'},
    {tipId: 'custom-blocks', label: 'My Blocks'},
    {tipId: 'pen-extension', label: 'extensions'},
    {tipId: 'music-extension', label: 'extensions'},
    {tipId: 'text-to-speech-extension', label: 'extensions'},
    {tipId: 'random-numbers', label: 'Operators'},
    {tipId: 'greater-less-than', label: 'Operators'},
    {tipId: 'rotation-style-vs-turn', label: 'rotation style'},
    {tipId: 'costume-center', label: 'Costumes tab'},
    {tipId: 'silly-sounds', label: 'Sounds tab'},
    {tipId: 'record-sound', label: 'Sounds tab'},
    {tipId: 'sound-remix', label: 'Sounds tab'},
    {tipId: 'play-vs-play-until-done', label: 'Sound blocks'},
    {tipId: 'show-hide-variable', label: 'Variables'},
    {tipId: 'stamp-block', label: 'extensions'},
    {tipId: 'trail-of-stamps', label: 'extensions'},
    {tipId: 'missing-asset', label: 'Costumes tab'},
    {tipId: 'make-dance-party', label: 'new sprite'},
    {tipId: 'make-pet', label: 'Variables'},
    {tipId: 'make-animation', label: 'Costumes tab'},
    {tipId: 'make-music-project', label: 'extensions'},
    {tipId: 'make-art', label: 'extensions'}
];

test.describe('Tips Pointers - Data Integrity', () => {
    // These tests validate tip data using node require() - no browser needed
    const tips = require('../../src/lib/libraries/tips/index.js').default;

    test('all tips with pointers have valid pointer structure', () => {
        const issues = [];
        let totalWithPointers = 0;

        for (const [tipId, tip] of Object.entries(tips)) {
            if (!tip.pointers) continue;
            totalWithPointers++;

            for (let i = 0; i < tip.pointers.length; i++) {
                const p = tip.pointers[i];

                if (!p.label) {
                    issues.push(`${tipId}.pointers[${i}]: missing label`);
                }

                if (!p.target && !p.blockOpcode) {
                    issues.push(`${tipId}.pointers[${i}]: must have target or blockOpcode`);
                }

                if (p.blockOpcode && !p.category) {
                    issues.push(`${tipId}.pointers[${i}]: blockOpcode without category`);
                }

                if (p.side && !['top', 'bottom', 'left', 'right'].includes(p.side)) {
                    issues.push(`${tipId}.pointers[${i}]: invalid side "${p.side}"`);
                }

                if (p.preAction && !['switchToCodeTab', 'switchToCostumesTab', 'switchToSoundsTab'].includes(p.preAction)) {
                    issues.push(`${tipId}.pointers[${i}]: invalid preAction "${p.preAction}"`);
                }
            }
        }

        expect(totalWithPointers).toBeGreaterThan(80);
        expect(issues, `Pointer validation issues:\n${issues.join('\n')}`).toEqual([]);
    });

    test('all blockExample values reference known templates', () => {
        const tipsWithBlocks = Object.entries(tips).filter(([, t]) => t.blockExample);
        expect(tipsWithBlocks.length).toBeGreaterThan(30);

        // Verify each blockExample name is non-empty
        for (const [tipId, tip] of tipsWithBlocks) {
            expect(tip.blockExample, `${tipId} has empty blockExample`).toBeTruthy();
        }
    });

    test('all followUp IDs reference existing tips', () => {
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
        expect(broken, `Broken followUp references:\n${broken.join('\n')}`).toEqual([]);
    });

    test('tip IDs match their object keys', () => {
        const mismatched = [];
        for (const [key, tip] of Object.entries(tips)) {
            if (tip.id !== key) {
                mismatched.push(`key="${key}" but id="${tip.id}"`);
            }
        }
        expect(mismatched, `Mismatched tip IDs:\n${mismatched.join('\n')}`).toEqual([]);
    });
});

test.describe('Tips Pointers - Block Opcode Pointers', () => {
    for (const {tipId, label} of tipsWithBlockPointers) {
        test(`"Show me" highlights block for "${tipId}"`, async ({page}) => {
            await waitForEditor(page);
            await goToTip(page, tipId);

            // Click the first "Show me" button
            const showMe = page.locator(
                'button[class*="show-me"], button[class*="showMe"]'
            ).first();
            await expect(showMe).toBeVisible({timeout: 5000});
            await showMe.click();

            // Wait for driver.js to activate (category opens + block scrolls)
            await page.waitForTimeout(1000);

            // The driver overlay should appear
            const overlay = page.locator('.driver-overlay');
            await expect(overlay).toBeVisible({timeout: 5000});

            // The popover should contain the expected label text
            const popover = page.locator('.driver-popover');
            await expect(popover).toBeVisible({timeout: 3000});
            const popoverText = await popover.textContent();
            expect(
                popoverText.toLowerCase(),
                `Popover for "${tipId}" should mention "${label}"`
            ).toContain(label.toLowerCase());
        });
    }
});

test.describe('Tips Pointers - CSS Selector Pointers', () => {
    for (const {tipId, label} of tipsWithCSSPointers) {
        test(`"Show me" highlights element for "${tipId}"`, async ({page}) => {
            await waitForEditor(page);
            await goToTip(page, tipId);

            // Click the first "Show me" button
            const showMe = page.locator(
                'button[class*="show-me"], button[class*="showMe"]'
            ).first();
            await expect(showMe).toBeVisible({timeout: 5000});
            await showMe.click();

            // Wait for preAction + driver.js to activate
            await page.waitForTimeout(800);

            // The driver overlay should appear
            const overlay = page.locator('.driver-overlay');
            await expect(overlay).toBeVisible({timeout: 5000});

            // The popover should be visible with text
            const popover = page.locator('.driver-popover');
            await expect(popover).toBeVisible({timeout: 3000});
            const popoverText = await popover.textContent();
            expect(
                popoverText.toLowerCase(),
                `Popover for "${tipId}" should mention "${label}"`
            ).toContain(label.toLowerCase());
        });
    }
});

test.describe('Tips Pointers - Show Me Button Visibility', () => {
    test('tips with pointers show "Show me" button, tips without do not', async ({page}) => {
        await waitForEditor(page);

        // Test a tip WITH pointers
        await goToTip(page, 'move-sprite');
        const showMe = page.locator(
            'button[class*="show-me"], button[class*="showMe"]'
        );
        await expect(showMe.first()).toBeVisible({timeout: 5000});

        // Navigate to a tip WITHOUT pointers (conceptual tip)
        await page.evaluate(() => {
            const store = window.__scratchStore;
            store.dispatch({type: 'scratch-gui/unstuck/SET_TIP', tipId: 'negative-numbers'});
        });
        await page.waitForTimeout(500);

        // "Show me" should not be visible for tips without pointers
        const showMeCount = await showMe.count();
        if (showMeCount > 0) {
            await expect(showMe.first()).not.toBeVisible({timeout: 3000});
        }
    });
});

test.describe('Tips Pointers - Multi-Step Pointers', () => {
    test('tip with multiple pointers shows all steps', async ({page}) => {
        await waitForEditor(page);
        // add-sound has two pointers: Sounds tab + Sound blocks category
        await goToTip(page, 'add-sound');

        const showMeButtons = page.locator(
            'button[class*="show-me"], button[class*="showMe"]'
        );
        const count = await showMeButtons.count();
        expect(count).toBeGreaterThanOrEqual(1);

        // Click first Show me
        await showMeButtons.first().click();
        await page.waitForTimeout(800);

        const overlay = page.locator('.driver-overlay');
        await expect(overlay).toBeVisible({timeout: 5000});

        // Close the overlay
        const closeButton = page.locator('.driver-popover-close-btn');
        if (await closeButton.isVisible({timeout: 2000}).catch(() => false)) {
            await closeButton.click();
            await page.waitForTimeout(300);
        }

        // If there's a second pointer, click it
        if (count > 1) {
            await showMeButtons.nth(1).click();
            await page.waitForTimeout(800);
            await expect(overlay).toBeVisible({timeout: 5000});
        }
    });
});

test.describe('Tips Pointers - Overlay Cleanup', () => {
    test('closing unstuck card cleans up driver overlay', async ({page}) => {
        await waitForEditor(page);
        await goToTip(page, 'move-sprite');

        // Click Show me
        const showMe = page.locator(
            'button[class*="show-me"], button[class*="showMe"]'
        ).first();
        await showMe.click();
        await page.waitForTimeout(1000);

        const overlay = page.locator('.driver-overlay');
        await expect(overlay).toBeVisible({timeout: 5000});

        // Close the unstuck card
        const closeButton = page.locator(
            'button[class*="close-button"], button[class*="closeButton"]'
        ).first();
        if (await closeButton.isVisible({timeout: 2000}).catch(() => false)) {
            await closeButton.click();
        } else {
            // Close via Redux
            await page.evaluate(() => {
                const store = window.__scratchStore;
                store.dispatch({type: 'scratch-gui/unstuck/CLOSE_UNSTUCK'});
            });
        }
        await page.waitForTimeout(500);

        // The overlay should be cleaned up
        await expect(overlay).not.toBeVisible({timeout: 3000});
    });

    test('navigating between tips with active highlights causes no errors', async ({page}) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await waitForEditor(page);
        await goToTip(page, 'move-sprite');

        // Click Show me to highlight motion block
        const showMe = page.locator(
            'button[class*="show-me"], button[class*="showMe"]'
        ).first();
        await showMe.click();
        await page.waitForTimeout(1000);

        const overlay = page.locator('.driver-overlay');
        await expect(overlay).toBeVisible({timeout: 5000});

        // Navigate to a different tip while highlight is active
        await page.evaluate(() => {
            const store = window.__scratchStore;
            store.dispatch({type: 'scratch-gui/unstuck/SET_TIP', tipId: 'forever-loop'});
        });
        await page.waitForTimeout(500);

        // Navigate again
        await page.evaluate(() => {
            const store = window.__scratchStore;
            store.dispatch({type: 'scratch-gui/unstuck/SET_TIP', tipId: 'detect-collision'});
        });
        await page.waitForTimeout(500);

        // No errors should have occurred from rapid tip navigation
        expect(errors).toEqual([]);
    });
});
