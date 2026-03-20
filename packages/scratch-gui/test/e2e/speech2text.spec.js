const {test, expect} = require('@playwright/test');

const dismissOverlays = async page => {
    // Remove webpack-dev-server error overlay iframe if present
    await page.evaluate(() => {
        const overlay = document.getElementById('webpack-dev-server-client-overlay');
        if (overlay) overlay.remove();
    });

    // Dismiss the "Your Browser Does Not Support WebGL" modal if present
    const backButton = page.getByRole('button', {name: 'Back'});
    if (await backButton.isVisible({timeout: 2000}).catch(() => false)) {
        await backButton.click();
    }

    // Close any "what's new" or welcome modal
    const closeButton = page.locator('div[class*="modal_header-item-close"]');
    if (await closeButton.isVisible({timeout: 2000}).catch(() => false)) {
        await closeButton.click();
    }
};

const openExtensionLibrary = async page => {
    await page.locator('[aria-label="Add Extension"]').click();
    await page.locator('div[class*="library_library-scroll-grid"]').waitFor({state: 'visible'});
};

test.describe('Speech to Text Extension', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await dismissOverlays(page);
    });

    test('speech2text tile appears in the extension library', async ({page}) => {
        await openExtensionLibrary(page);
        const tile = page.locator('span[class*="library-item_library-item-name"]', {hasText: 'Speech to Text'});
        await expect(tile).toBeVisible();
    });

    test('clicking speech2text tile loads the extension and adds blocks', async ({page}) => {
        await openExtensionLibrary(page);

        // Click the Speech to Text tile by its extension id
        await page.locator('button#speech2text').click();

        // The extension library should close
        await expect(page.locator('div[class*="library_library-scroll-grid"]')).not.toBeVisible();

        // The blocks category should appear in the toolbox sidebar
        // Scratch uses a custom category menu with spans containing the category name
        const category = page.locator('text="Speech to Text"').first();
        await expect(category).toBeVisible({timeout: 15000});
    });

    test('speech2text blocks are available after loading', async ({page}) => {
        await openExtensionLibrary(page);
        await page.locator('button#speech2text').click();

        // Wait for the extension blocks to appear in the blocks area
        // The blocks appear immediately even while the model is still loading
        await expect(page.locator('text="listen and wait"').first()).toBeVisible({timeout: 15000});
        await expect(page.locator('text="when I hear"').first()).toBeVisible({timeout: 5000});
        await expect(page.locator('text="speech"').first()).toBeVisible({timeout: 5000});
    });
});
