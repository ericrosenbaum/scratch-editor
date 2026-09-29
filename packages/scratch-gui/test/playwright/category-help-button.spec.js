const {test, expect} = require('@playwright/test');
const path = require('path');

const uri = `file://${path.resolve(__dirname, '../../build/index.html')}`;

// Each extension with a help modal: its library name, and a line of text from its modal.
const extensions = [
    {id: 'handSensing', name: 'Hand Sensing', text: 'Make a sprite follow your finger'},
    {id: 'penText', name: 'Pen Text', text: 'Show a timer on the stage'},
    {id: 'soundRemix', name: 'Sound Remix', text: 'Make a sound stutter'},
    {id: 'stretch', name: 'Stretch', text: 'Make a sprite squish and spring back'}
];

const addExtension = async (page, name) => {
    await page.getByRole('button', {name: 'Add Extension'}).click();
    await page.getByText(name, {exact: true}).first()
        .click();
};

const overlayOf = page => page.locator('[class*="modal_modal-overlay"]');

const closeModal = async page => {
    const overlay = overlayOf(page);
    await overlay.getByRole('button', {name: 'Close'}).click();
    await expect(overlay).toBeHidden();
};

test.describe('Extension help modals', () => {
    test.beforeEach(async ({page, browserName}) => {
        if (browserName === 'chromium') {
            // Avoid the camera permission prompt from handSensing. Firefox
            // does not support granting 'camera' via Playwright.
            await page.context().grantPermissions(['camera']);
        }
        await page.goto(uri);
        await page.waitForSelector('[class*="sprite-selector"]');
    });

    for (const {id, name, text} of extensions) {
        test(`adding ${name} opens its help modal, and its help button reopens it`, async ({page}) => {
            await addExtension(page, name);
            const overlay = overlayOf(page);
            await expect(overlay.getByText(text)).toBeVisible();
            await closeModal(page);

            const helpButton = page.locator(`rect.categoryHelpButton[data-extension-id="${id}"]`);
            await expect(helpButton).toBeVisible();
            await helpButton.click();
            await expect(overlay.getByText(text)).toBeVisible();
        });
    }

    test('the modal draws its example script as blocks', async ({page}) => {
        await addExtension(page, 'Hand Sensing');

        // A forever loop around "go to left index finger".
        const overlay = overlayOf(page);
        const example = overlay.locator('.blocklyBlockCanvas').first();
        for (const text of ['forever', 'go to', 'left', 'index finger']) {
            await expect(example.getByText(text, {exact: true})).toBeVisible();
        }

        // The drawing is sized to the blocks once they have rendered, so
        // the stack lies inside it with nothing clipped away.
        await expect(async () => {
            const room = await overlay.locator('[class*="example-blocks_example-blocks"]').first()
                .boundingBox();
            const box = await example.locator('> g[data-id]').boundingBox();
            expect(room).not.toBeNull();
            expect(box).not.toBeNull();
            expect(box.x).toBeGreaterThanOrEqual(room.x - 1);
            expect(box.y).toBeGreaterThanOrEqual(room.y - 1);
            expect(box.x + box.width).toBeLessThanOrEqual(room.x + room.width + 1);
            expect(box.y + box.height).toBeLessThanOrEqual(room.y + room.height + 1);
        }).toPass();
    });

    test('the editor still takes blocks after the modal has drawn its example', async ({page}) => {
        await addExtension(page, 'Hand Sensing');
        const overlay = overlayOf(page);
        await expect(overlay.locator('.blocklyBlockCanvas > g[data-id]')).toHaveCount(1);
        await closeModal(page);

        // Dragging a block out of the flyout still lands it in the editor's
        // workspace: drawing the example must not leave it as Blockly's
        // main workspace.
        const flyoutBlock = await page.evaluate(() => {
            for (const block of document.querySelectorAll('.blocklyFlyout .blocklyDraggable')) {
                const rect = block.getBoundingClientRect();
                if (rect.y > 80 && rect.y < window.innerHeight && rect.height > 20 && rect.width > 50) {
                    return {x: rect.x + (rect.width / 2), y: rect.y + (rect.height / 2)};
                }
            }
            return null;
        });
        expect(flyoutBlock).not.toBeNull();
        const workspace = page.locator('.blocklyWorkspace > .blocklyBlockCanvas').first();
        const before = await workspace.locator('> g[data-id]').count();
        await page.mouse.move(flyoutBlock.x, flyoutBlock.y);
        await page.mouse.down();
        await page.mouse.move(flyoutBlock.x + 300, flyoutBlock.y + 100, {steps: 10});
        await page.mouse.up();
        await expect(workspace.locator('> g[data-id]')).toHaveCount(before + 1);
    });

    test('categories without help have no help button', async ({page}) => {
        await addExtension(page, 'Pen');
        await expect(overlayOf(page)).toBeHidden();
        await expect(page.locator('rect.categoryHelpButton')).toHaveCount(0);
    });
});
