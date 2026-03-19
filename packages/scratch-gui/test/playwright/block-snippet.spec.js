const {test, expect} = require('@playwright/test');
const {
    addExtension,
    openTeachableMachineModal,
    injectTrainingData,
    getWizardStep
} = require('./helpers/scratch-helpers');

test.describe('Example block snippet renders real scratch-blocks', () => {

    test('wizard try-it step shows real scratch-blocks SVG', async ({page}) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.goto('/');
        await addExtension(page, 'Teachable Machine');

        // Inject 2 labels: Background with enough data, Hand with not enough
        // This triggers wizard mode at step 5 (try-it step)
        await injectTrainingData(page, 'Background', 10);
        await injectTrainingData(page, 'Hand', 3);
        await openTeachableMachineModal(page);

        const step = await getWizardStep(page);
        expect(step).toBe(5);

        // The blocks preview container should exist
        const blocksPreview = page.locator('[class*="blocks-preview"]');
        await expect(blocksPreview).toBeVisible();

        // Real scratch-blocks injects an SVG with class "blocklySvg"
        const blocklySvg = blocksPreview.locator(':scope .blocklySvg');
        await expect(blocklySvg).toBeVisible({timeout: 10000});

        // In read-only mode, blocks render with blocklyBlockBackground paths
        const blockPaths = blocklySvg.locator('.blocklyBlockBackground');
        await expect(blockPaths.first()).toBeVisible();

        // Should have block text labels rendered
        const blockText = blocklySvg.locator('.blocklyText');
        await expect(blockText.first()).toBeVisible();

        // Verify no JS errors from the block rendering
        const realErrors = errors.filter(e => !e.includes('non-passive event'));
        expect(realErrors).toHaveLength(0);
    });

    test('block snippet tip text is visible', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');
        await injectTrainingData(page, 'Background', 10);
        await injectTrainingData(page, 'Hand', 3);
        await openTeachableMachineModal(page);

        await expect(page.locator('[class*="block-snippet-tip"]')).toContainText('guess');
    });

    test('block snippet workspace is read-only', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');
        await injectTrainingData(page, 'Background', 10);
        await injectTrainingData(page, 'Hand', 3);
        await openTeachableMachineModal(page);

        const blocksPreview = page.locator('[class*="blocks-preview"]');
        await expect(blocksPreview).toBeVisible();

        // In read-only mode there should be no blocklyDraggable elements
        const draggable = blocksPreview.locator('.blocklyDraggable');
        await expect(draggable).toHaveCount(0);

        // Right-click on the SVG should not open a context menu
        const svg = blocksPreview.locator('.blocklySvg');
        await svg.click({button: 'right'});
        await expect(page.locator('.blocklyContextMenu')).not.toBeVisible({timeout: 2000});
    });
});
