const {test, expect} = require('@playwright/test');

/**
 * Access the Redux store via the React fiber tree, then get the VM.
 * Exposes window.vm for convenience.
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

/**
 * Wait for the Scratch VM to be initialized and ready.
 */
const waitForVM = async page => {
    await exposeVM(page);
    await page.waitForFunction(() => {
        const vm = window.vm;
        return vm && vm.runtime && vm.runtime.targets && vm.runtime.targets.length > 0;
    }, {timeout: 30000});
};

/**
 * Load the audio classification extension by opening the extension library
 * and clicking the Audio Classifier entry.
 */
const loadAudioClassifierExtension = async page => {
    // Click the extensions button (bottom-left)
    await page.locator('[class*="extension-button_extension-button_"]').click();

    // Wait for the extension library modal
    await expect(page.locator('[class*="library_library-scroll-grid"]')).toBeVisible({timeout: 10000});

    // Find and click the Audio Classifier extension
    const extensionItem = page.locator('[class*="library-item_library-item_"]')
        .filter({hasText: 'Audio Classifier'});
    await expect(extensionItem).toBeVisible();
    await extensionItem.click();

    // Wait for the extension library to close
    await expect(page.locator('[class*="library_library-scroll-grid"]')).not.toBeVisible({timeout: 10000});

    // Wait for blocks to appear — verify the extension category is present
    await page.waitForFunction(() => {
        const vm = window.vm;
        return vm && vm.extensionManager.isExtensionLoaded('audioClassification');
    }, {timeout: 10000});
};

test.describe('Audio Classifier Extension', () => {

    test.beforeEach(async ({page}) => {
        // Intercept page creation to block webpack dev server overlay
        await page.addInitScript(() => {
            // Continuously remove the webpack overlay iframe that intercepts clicks
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

    test('extension loads from library', async ({page}) => {
        await loadAudioClassifierExtension(page);

        // Verify the extension is registered on the runtime
        const isLoaded = await page.evaluate(() =>
            !!window.vm.runtime.ext_audioClassification
        );
        expect(isLoaded).toBe(true);
    });

    test('modal opens via openTrainer block', async ({page}) => {
        await loadAudioClassifierExtension(page);

        // Trigger the modal via the extension's openTrainer method
        await page.evaluate(() => {
            window.vm.runtime.ext_audioClassification.openTrainer();
        });

        // Verify the modal is visible
        const modal = page.locator('[class*="audio-classifier-modal_modal"]');
        await expect(modal).toBeVisible({timeout: 10000});

        // Verify the modal title (scoped to modal to avoid matching block labels)
        await expect(modal.locator('span').filter({hasText: 'Audio Classifier'})).toBeVisible();
    });

    test('modal has correct initial UI elements', async ({page}) => {
        await loadAudioClassifierExtension(page);

        // Open modal
        await page.evaluate(() => {
            window.vm.runtime.ext_audioClassification.openTrainer();
        });
        const modal = page.locator('[class*="audio-classifier-modal_modal"]');
        await expect(modal).toBeVisible({timeout: 10000});

        // Should have 2 default classes
        const classInputs = modal.locator('[class*="class-name-input"]');
        await expect(classInputs).toHaveCount(2);

        // Check default class names
        await expect(classInputs.nth(0)).toHaveValue('Class 1');
        await expect(classInputs.nth(1)).toHaveValue('Class 2');

        // Should have Record buttons
        const recordButtons = modal.locator('[class*="record-button"]');
        await expect(recordButtons).toHaveCount(2);

        // Should have Add Class button
        await expect(modal.getByText('+ Add Class')).toBeVisible();

        // Should have Train button
        await expect(modal.getByText('Train')).toBeVisible();
    });

    test('can add and remove classes', async ({page}) => {
        await loadAudioClassifierExtension(page);

        // Open modal
        await page.evaluate(() => {
            window.vm.runtime.ext_audioClassification.openTrainer();
        });
        const modal = page.locator('[class*="audio-classifier-modal_modal"]');
        await expect(modal).toBeVisible({timeout: 10000});

        // Add a new class
        await modal.getByText('+ Add Class').click();
        const classInputs = modal.locator('[class*="class-name-input"]');
        await expect(classInputs).toHaveCount(3);
        await expect(classInputs.nth(2)).toHaveValue('Class 3');

        // Now we have 3 classes, delete buttons should appear
        const deleteButtons = modal.locator('[class*="delete-button"]');
        await expect(deleteButtons.first()).toBeVisible();

        // Remove the third class
        await deleteButtons.last().click();
        await expect(classInputs).toHaveCount(2);
    });

    test('can rename classes', async ({page}) => {
        await loadAudioClassifierExtension(page);

        // Open modal
        await page.evaluate(() => {
            window.vm.runtime.ext_audioClassification.openTrainer();
        });
        const modal = page.locator('[class*="audio-classifier-modal_modal"]');
        await expect(modal).toBeVisible({timeout: 10000});

        // Rename first class
        const firstInput = modal.locator('[class*="class-name-input"]').first();
        await firstInput.fill('Dog Bark');

        // Verify the extension state is synced — close and check
        // Use the modal close button
        await modal.locator('[class*="close-button_close-button_"]').click();

        // Check extension state
        const classes = await page.evaluate(() =>
            window.vm.runtime.ext_audioClassification._classes
        );
        expect(classes).toContain('Dog Bark');
    });

    test('record button triggers recording state', async ({page}) => {
        await loadAudioClassifierExtension(page);

        // Open modal
        await page.evaluate(() => {
            window.vm.runtime.ext_audioClassification.openTrainer();
        });
        const modal = page.locator('[class*="audio-classifier-modal_modal"]');
        await expect(modal).toBeVisible({timeout: 10000});

        // Verify initial state — 0 examples
        const exampleText = modal.locator('[class*="example-count"]').first();
        await expect(exampleText).toContainText('0 examples');

        // Click record — this starts loading the model + recording
        // The button should show "Recording..." while active
        const firstRecordButton = modal.locator('[class*="record-button"]').first();
        await firstRecordButton.click();

        // The button should become disabled during recording
        await expect(firstRecordButton).toBeDisabled({timeout: 5000});
    });

    test('modal closes and reopens with persisted state', async ({page}) => {
        await loadAudioClassifierExtension(page);

        // Open modal
        await page.evaluate(() => {
            window.vm.runtime.ext_audioClassification.openTrainer();
        });
        const modal = page.locator('[class*="audio-classifier-modal_modal"]');
        await expect(modal).toBeVisible({timeout: 10000});

        // Add a class
        await modal.getByText('+ Add Class').click();
        await expect(modal.locator('[class*="class-name-input"]')).toHaveCount(3);

        // Close modal via the close button
        await modal.locator('[class*="close-button_close-button_"]').click();
        await expect(modal).not.toBeVisible();

        // Reopen modal
        await page.evaluate(() => {
            window.vm.runtime.ext_audioClassification.openTrainer();
        });
        await expect(modal).toBeVisible({timeout: 10000});

        // Should still have 3 classes
        await expect(modal.locator('[class*="class-name-input"]')).toHaveCount(3);
    });

    test('train button is disabled without enough examples', async ({page}) => {
        await loadAudioClassifierExtension(page);

        // Open modal
        await page.evaluate(() => {
            window.vm.runtime.ext_audioClassification.openTrainer();
        });
        const modal = page.locator('[class*="audio-classifier-modal_modal"]');
        await expect(modal).toBeVisible({timeout: 10000});

        // Train button should be disabled (no examples yet)
        const trainButton = modal.getByText('Train');
        await expect(trainButton).toBeDisabled();
    });

    test('blocks are available after loading extension', async ({page}) => {
        await loadAudioClassifierExtension(page);

        // Check that blocks are registered
        const blockOpcodes = await page.evaluate(() => {
            const ext = window.vm.runtime.ext_audioClassification;
            const info = ext.getInfo();
            return info.blocks
                .filter(b => typeof b === 'object')
                .map(b => b.opcode);
        });

        expect(blockOpcodes).toContain('openTrainer');
        expect(blockOpcodes).toContain('startListening');
        expect(blockOpcodes).toContain('stopListening');
        expect(blockOpcodes).toContain('whenAudioSoundsLike');
        expect(blockOpcodes).toContain('audioClass');
        expect(blockOpcodes).toContain('audioConfidence');
    });

    test('reporter blocks return default values before training', async ({page}) => {
        await loadAudioClassifierExtension(page);

        const audioClass = await page.evaluate(() =>
            window.vm.runtime.ext_audioClassification.audioClass()
        );
        expect(audioClass).toBe('');

        const confidence = await page.evaluate(() =>
            window.vm.runtime.ext_audioClassification.audioConfidence()
        );
        expect(confidence).toBe(0);
    });
});
