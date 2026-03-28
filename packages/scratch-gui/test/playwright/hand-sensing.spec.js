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
        // The extension library uses library items with the extension name
        const handSensingItem = page.locator('[class*="library-item"]', {
            has: page.locator('text=Hand Sensing')
        });
        await handSensingItem.first().click();

        // Wait for the modal to close and blocks to load
        await page.waitForSelector('[class*="modal_modal-overlay"]', {state: 'hidden'});

        // Verify the blocks category is visible in the toolbox
        // The category name should appear in the block palette
        await page.waitForSelector('[class*="scratchCategoryMenu"]');

        // Check that hand sensing blocks are visible
        // The toolbox should show the Hand Sensing category
        const category = page.locator('[class*="scratchCategoryId-handSensing"]');
        await expect(category).toBeVisible({timeout: 10000});
    });

    test('does not produce console errors on load', async ({page}) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.click('[class*="extension-button-container"]');
        await page.waitForSelector('[class*="modal_modal-overlay"]');

        // The extension library should load without errors
        // (ignore errors that are not related to hand sensing)
        const handSensingErrors = errors.filter(e =>
            e.toLowerCase().includes('hand') ||
            e.toLowerCase().includes('handsensing')
        );
        expect(handSensingErrors).toHaveLength(0);
    });
});
