const {test, expect} = require('@playwright/test');
const path = require('path');

const uri = `file://${path.resolve(__dirname, '../../build/index.html')}`;

test.describe('Hand Sensing Extension', () => {
    test.beforeEach(async ({page}) => {
        await page.goto(uri);
        // Wait for the editor to load
        await page.waitForSelector('[class*="sprite-selector"]');
    });

    test('appears in extensions library', async ({page}) => {
        // Click the "Add Extension" button
        await page.click('[class*="extension-button-container"]');

        // Wait for extension library modal to appear
        await page.waitForSelector('[class*="modal_modal-overlay"]');

        // Verify Hand Sensing extension is visible
        const handSensing = page.locator('text=Hand Sensing');
        await expect(handSensing.first()).toBeVisible();
    });

    test('shows correct description in library', async ({page}) => {
        await page.click('[class*="extension-button-container"]');
        await page.waitForSelector('[class*="modal_modal-overlay"]');

        const description = page.locator('text=Sense hands with the camera.');
        await expect(description.first()).toBeVisible();
    });

    test('loads blocks into toolbox when clicked', async ({page}) => {
        // Grant camera permissions to avoid permission dialog blocking
        await page.context().grantPermissions(['camera']);

        await page.click('[class*="extension-button-container"]');
        await page.waitForSelector('[class*="modal_modal-overlay"]');

        // Find and click the Hand Sensing extension
        const handSensingItem = page.locator('[class*="library-item"]', {
            has: page.locator('text=Hand Sensing')
        });
        await handSensingItem.first().click();

        // Wait for the modal to close and blocks to load
        await page.waitForSelector('[class*="modal_modal-overlay"]', {state: 'hidden'});

        // Verify the blocks category is visible in the toolbox
        await page.waitForSelector('[class*="scratchCategoryMenu"]');

        // Check that hand sensing blocks are visible
        const category = page.locator('[class*="scratchCategoryId-handSensing"]');
        await expect(category).toBeVisible({timeout: 10000});
    });

    test('has gesture hat blocks', async ({page}) => {
        await page.context().grantPermissions(['camera']);

        await page.click('[class*="extension-button-container"]');
        await page.waitForSelector('[class*="modal_modal-overlay"]');

        const handSensingItem = page.locator('[class*="library-item"]', {
            has: page.locator('text=Hand Sensing')
        });
        await handSensingItem.first().click();
        await page.waitForSelector('[class*="modal_modal-overlay"]', {state: 'hidden'});

        // Click on the Hand Sensing category to show its blocks
        const category = page.locator('[class*="scratchCategoryId-handSensing"]');
        await category.click();

        // Verify gesture-related blocks exist in the workspace area
        // The blocks use scratch-blocks which renders as SVG text elements
        const blockArea = page.locator('[class*="blocks_blocks"]');
        await expect(blockArea).toBeVisible({timeout: 10000});

        // Check for the gesture hat block text - "when" and "detected" should appear
        // as part of "when [GESTURE] detected"
        const whenText = blockArea.locator('text=when');
        await expect(whenText.first()).toBeVisible({timeout: 5000});
    });

    test('has hand menu in blocks', async ({page}) => {
        await page.context().grantPermissions(['camera']);

        await page.click('[class*="extension-button-container"]');
        await page.waitForSelector('[class*="modal_modal-overlay"]');

        const handSensingItem = page.locator('[class*="library-item"]', {
            has: page.locator('text=Hand Sensing')
        });
        await handSensingItem.first().click();
        await page.waitForSelector('[class*="modal_modal-overlay"]', {state: 'hidden'});

        const category = page.locator('[class*="scratchCategoryId-handSensing"]');
        await category.click();

        // The block text "hand" should appear in blocks that use the HAND menu
        // e.g., "go to [PART] of [HAND] hand", "fingers up on [HAND] hand"
        const blockArea = page.locator('[class*="blocks_blocks"]');
        const handText = blockArea.locator('text=hand');
        await expect(handText.first()).toBeVisible({timeout: 5000});
    });

    test('has pinch percent reporter', async ({page}) => {
        await page.context().grantPermissions(['camera']);

        await page.click('[class*="extension-button-container"]');
        await page.waitForSelector('[class*="modal_modal-overlay"]');

        const handSensingItem = page.locator('[class*="library-item"]', {
            has: page.locator('text=Hand Sensing')
        });
        await handSensingItem.first().click();
        await page.waitForSelector('[class*="modal_modal-overlay"]', {state: 'hidden'});

        const category = page.locator('[class*="scratchCategoryId-handSensing"]');
        await category.click();

        // Check for the pinch % reporter block
        const blockArea = page.locator('[class*="blocks_blocks"]');
        const pinchText = blockArea.locator('text=pinch');
        await expect(pinchText.first()).toBeVisible({timeout: 5000});
    });

    test('does not produce console errors on load', async ({page}) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.click('[class*="extension-button-container"]');
        await page.waitForSelector('[class*="modal_modal-overlay"]');

        // The extension library should load without errors
        const handSensingErrors = errors.filter(e =>
            e.toLowerCase().includes('hand') ||
            e.toLowerCase().includes('handsensing')
        );
        expect(handSensingErrors).toHaveLength(0);
    });
});
