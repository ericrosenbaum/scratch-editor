const {test, expect} = require('@playwright/test');

/**
 * Access the Redux store via the React fiber tree, then get the VM.
 */
const exposeVM = async page => {
    await page.waitForFunction(() => {
        const guiEl = document.querySelector('[class*="gui_body-wrapper"]');
        if (!guiEl) return false;
        const fiberKey = Object.keys(guiEl).find(k => k.startsWith('__reactFiber'));
        if (!fiberKey) return false;
        let fiber = guiEl[fiberKey];
        while (fiber) {
            if (fiber.memoizedProps && fiber.memoizedProps.store) {
                const store = fiber.memoizedProps.store;
                const state = store.getState();
                if (state && state.scratchGui && state.scratchGui.vm) {
                    window.vm = state.scratchGui.vm;
                    return true;
                }
            }
            fiber = fiber.return;
        }
        return false;
    }, {timeout: 30000});
};

const waitForVM = async page => {
    await exposeVM(page);
    await page.waitForFunction(() => {
        const vm = window.vm;
        return vm && vm.runtime && vm.runtime.targets && vm.runtime.targets.length > 0;
    }, {timeout: 30000});
};

const loadAudioClassifierExtension = async page => {
    await page.locator('[class*="extension-button_extension-button_"]').click();
    await expect(page.locator('[class*="library_library-scroll-grid"]')).toBeVisible({timeout: 10000});
    const extensionItem = page.locator('[class*="library-item_library-item_"]')
        .filter({hasText: 'Audio Classifier'});
    await expect(extensionItem).toBeVisible();
    await extensionItem.click();
    await expect(page.locator('[class*="library_library-scroll-grid"]')).not.toBeVisible({timeout: 10000});
    await page.waitForFunction(() => {
        const vm = window.vm;
        return vm && vm.extensionManager.isExtensionLoaded('audioClassification');
    }, {timeout: 10000});
};

const openModal = async page => {
    // Open the modal by dispatching the Redux action through the store
    await page.evaluate(() => {
        const guiEl = document.querySelector('[class*="gui_body-wrapper"]');
        const fiberKey = Object.keys(guiEl).find(k => k.startsWith('__reactFiber'));
        let fiber = guiEl[fiberKey];
        while (fiber) {
            if (fiber.memoizedProps && fiber.memoizedProps.store) {
                const store = fiber.memoizedProps.store;
                store.dispatch({type: 'scratch-gui/modals/OPEN_MODAL', modal: 'audioClassifierModal'});
                return;
            }
            fiber = fiber.return;
        }
        throw new Error('Could not find Redux store');
    });
    const modal = page.locator('[class*="audio-classifier-modal_modal"]');
    await expect(modal).toBeVisible({timeout: 10000});
    return modal;
};

test.describe('Audio Classifier Spectrogram', () => {
    let consoleLogs;

    test.beforeEach(async ({page}) => {
        consoleLogs = [];
        page.on('console', msg => {
            consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
        });

        await page.addInitScript(() => {
            const observer = new MutationObserver(() => {
                const overlay = document.getElementById('webpack-dev-server-client-overlay');
                if (overlay) overlay.remove();
            });
            if (document.body) {
                observer.observe(document.body, {childList: true, subtree: true});
            } else {
                document.addEventListener('DOMContentLoaded', () => {
                    observer.observe(document.body, {childList: true, subtree: true});
                });
            }
        });
        await page.goto('/');
        await waitForVM(page);
    });

    test('live spectrogram canvas renders in modal', async ({page}) => {
        await loadAudioClassifierExtension(page);
        const modal = await openModal(page);

        // Wait for the spectrogram canvas to appear
        const canvas = modal.locator('[class*="spectrogram_spectrogram"]');
        await expect(canvas).toBeVisible({timeout: 10000});

        // Log canvas dimensions
        const dims = await canvas.evaluate(el => ({
            width: el.width,
            height: el.height,
            cssWidth: el.offsetWidth,
            cssHeight: el.offsetHeight
        }));
        console.log('Spectrogram canvas dimensions:', JSON.stringify(dims));
        expect(dims.width).toBe(468);
        expect(dims.height).toBe(32);

        // Wait a bit for the spectrogram to populate with data from the fake mic
        await page.waitForTimeout(2000);

        // Check that the canvas has non-default pixel data (not all dark background)
        const hasData = await canvas.evaluate(el => {
            const ctx = el.getContext('2d');
            const imageData = ctx.getImageData(0, 0, el.width, el.height);
            const data = imageData.data;
            // Check if any pixel differs from the background color (20, 5, 25)
            for (let i = 0; i < data.length; i += 4) {
                if (data[i] !== 20 || data[i + 1] !== 5 || data[i + 2] !== 25) {
                    return true;
                }
            }
            return false;
        });
        console.log('Spectrogram has non-background pixel data:', hasData);
        expect(hasData).toBe(true);

        // Screenshot: live spectrogram
        await modal.screenshot({path: 'test-results/spectrogram-01-live.png'});
    });

    test('example spectrogram thumbnails appear after recording', async ({page}) => {
        test.setTimeout(120000);

        await loadAudioClassifierExtension(page);
        const modal = await openModal(page);

        // Screenshot: initial state (no examples)
        await modal.screenshot({path: 'test-results/spectrogram-02-initial.png'});

        // Record background noise examples
        const bgRecordButton = modal.locator('[class*="background-row"] [class*="record-button"]');
        await bgRecordButton.click();

        // Wait for background recording to finish (8 examples, each ~1s)
        await expect(bgRecordButton).not.toBeDisabled({timeout: 30000});

        // Check for background spectrogram thumbnails
        const bgSection = modal.locator('[class*="background-section"]');
        const bgThumbnails = bgSection.locator('[class*="spectrogram_example-spectrogram"]');
        const bgCount = await bgThumbnails.count();
        console.log('Background spectrogram thumbnail count:', bgCount);
        expect(bgCount).toBeGreaterThan(0);

        // Screenshot: after background recording
        await modal.screenshot({path: 'test-results/spectrogram-03-background-recorded.png'});

        // Record examples for Class 1
        const classRecordButtons = modal.locator('[class*="class-section"] [class*="record-button"]');
        await classRecordButtons.first().click();

        // Wait for recording to finish
        await expect(classRecordButtons.first()).not.toBeDisabled({timeout: 30000});

        // Check for class spectrogram thumbnails
        const classSections = modal.locator('[class*="class-section"]');
        const classThumbnails = classSections.first().locator('[class*="spectrogram_example-spectrogram"]');
        const classCount = await classThumbnails.count();
        console.log('Class 1 spectrogram thumbnail count:', classCount);
        expect(classCount).toBeGreaterThan(0);

        // Verify thumbnail canvas has actual data
        const thumbnailHasData = await classThumbnails.first().evaluate(el => {
            const ctx = el.getContext('2d');
            const imageData = ctx.getImageData(0, 0, el.width, el.height);
            const data = imageData.data;
            // Check for any non-zero pixel
            for (let i = 0; i < data.length; i += 4) {
                if (data[i] > 0 || data[i + 1] > 0 || data[i + 2] > 0) {
                    return true;
                }
            }
            return false;
        });
        console.log('Thumbnail has pixel data:', thumbnailHasData);
        expect(thumbnailHasData).toBe(true);

        // Screenshot: after class recording with thumbnails
        await modal.screenshot({path: 'test-results/spectrogram-04-class-recorded.png'});
    });

    test('clearing examples removes spectrogram thumbnails', async ({page}) => {
        test.setTimeout(120000);

        await loadAudioClassifierExtension(page);
        const modal = await openModal(page);

        // Record examples for Class 1
        const classRecordButtons = modal.locator('[class*="class-section"] [class*="record-button"]');
        await classRecordButtons.first().click();
        await expect(classRecordButtons.first()).not.toBeDisabled({timeout: 30000});

        // Verify thumbnails exist
        const classSections = modal.locator('[class*="class-section"]');
        let thumbnails = classSections.first().locator('[class*="spectrogram_example-spectrogram"]');
        const countBefore = await thumbnails.count();
        console.log('Thumbnails before clear:', countBefore);
        expect(countBefore).toBeGreaterThan(0);

        // Screenshot: before clear
        await modal.screenshot({path: 'test-results/spectrogram-05-before-clear.png'});

        // Click clear button for Class 1
        const clearButton = classSections.first().locator('[class*="clear-button"]');
        await clearButton.click();

        // Verify thumbnails are gone
        thumbnails = classSections.first().locator('[class*="spectrogram_example-spectrogram"]');
        const countAfter = await thumbnails.count();
        console.log('Thumbnails after clear:', countAfter);
        expect(countAfter).toBe(0);

        // Screenshot: after clear
        await modal.screenshot({path: 'test-results/spectrogram-06-after-clear.png'});
    });

    test('full modal with multiple classes and spectrograms', async ({page}) => {
        test.setTimeout(180000);

        await loadAudioClassifierExtension(page);
        const modal = await openModal(page);

        // Record background
        const bgRecordButton = modal.locator('[class*="background-row"] [class*="record-button"]');
        await bgRecordButton.click();
        await expect(bgRecordButton).not.toBeDisabled({timeout: 30000});

        // Record Class 1
        const classRecordButtons = modal.locator('[class*="class-section"] [class*="record-button"]');
        await classRecordButtons.nth(0).click();
        await expect(classRecordButtons.nth(0)).not.toBeDisabled({timeout: 30000});

        // Add a class and record it
        await modal.getByText('+ Add Class').click();

        // Record the new class (now at index 1)
        const updatedRecordButtons = modal.locator('[class*="class-section"] [class*="record-button"]');
        await updatedRecordButtons.nth(1).click();
        await expect(updatedRecordButtons.nth(1)).not.toBeDisabled({timeout: 30000});

        // Screenshot: full modal with multiple classes, live spectrogram, and example thumbnails
        await modal.screenshot({path: 'test-results/spectrogram-07-full-modal.png'});

        // Log final state summary
        const state = await page.evaluate(() => {
            const ext = window.vm.runtime.ext_audioClassification;
            return {
                classes: ext._classes,
                exampleCounts: ext.getExampleCounts()
            };
        });
        console.log('Final extension state:', JSON.stringify(state));
    });
});
