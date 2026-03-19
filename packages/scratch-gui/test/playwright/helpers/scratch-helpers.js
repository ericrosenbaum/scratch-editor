/**
 * Helper utilities for Playwright integration tests of the Scratch editor.
 */

/**
 * Open the extension library modal by clicking the "Add Extension" button.
 * @param {import('@playwright/test').Page} page
 */
const openExtensionLibrary = async page => {
    // The extension button is in the blocks panel footer
    await page.click('[class*="extension-button"]');
    await page.waitForSelector('[class*="library-item"]', {timeout: 10000});
};

/**
 * Open the extension library and click the tile matching the given name.
 * @param {import('@playwright/test').Page} page
 * @param {string} extensionName
 */
const addExtension = async (page, extensionName) => {
    await openExtensionLibrary(page);
    // Use button selector to avoid strict-mode violation from child elements sharing the class
    await page.click(`button[class*="library-item"]:has-text("${extensionName}")`);
    // Wait for the library to close and blocks to appear
    await page.waitForSelector('[class*="library-item"]', {state: 'hidden', timeout: 10000});
};

/**
 * Access the Teachable Classifier extension instance state via the Redux store.
 * Requires __scratchStore to be set (only in non-production builds).
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{predictedLabel: string, predictedConfidence: number}|null>}
 */
const getTeachableClassifierState = async page => page.evaluate(() => {
    const store = window.__scratchStore;
    if (!store) return null;
    const vm = store.getState().scratchGui && store.getState().scratchGui.vm;
    if (!vm) return null;
    const ext = vm.runtime.ext_teachableClassifier;
    if (!ext) return null;
    return {
        predictedLabel: ext.predictedLabel,
        predictedConfidence: ext.predictedConfidence
    };
});

/**
 * Inject a predicted label into the extension for testing hat blocks.
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 */
const setPredictedLabel = async (page, label) => page.evaluate(l => {
    const store = window.__scratchStore;
    if (!store) return;
    const vm = store.getState().scratchGui && store.getState().scratchGui.vm;
    if (!vm) return;
    const ext = vm.runtime.ext_teachableClassifier;
    if (!ext) return;
    ext.predictedLabel = l;
    ext.predictedConfidence = 0.95;
}, label);

/**
 * Open the Teachable Machine modal via the Edit Model button in the toolbox.
 * Assumes the Teachable Machine extension has already been added.
 * @param {import('@playwright/test').Page} page
 */
const openTeachableMachineModal = async page => {
    await page.locator('.scratchCategoryMenuItem:has-text("Teachable Machine")').click();
    await page.click('[class*="blocklyFlyout"] [class*="blocklyFlyoutButton"]:has-text("Edit Model")');
    await page.waitForSelector('[class*="modal-content"]', {timeout: 5000});
};

/**
 * Get the current wizard step from the DOM data attribute.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number|null>}
 */
const getWizardStep = async page => {
    const el = await page.$('[data-wizard-step]');
    if (!el) return null;
    const step = await el.getAttribute('data-wizard-step');
    return step ? parseInt(step, 10) : null;
};

/**
 * Get label data from the extension.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object|null>} - { labelName: { imageCount, classifierCount } }
 */
const getTeachableLabels = async page => page.evaluate(() => {
    const store = window.__scratchStore;
    if (!store) return null;
    const vm = store.getState().scratchGui && store.getState().scratchGui.vm;
    if (!vm) return null;
    const ext = vm.runtime.ext_teachableClassifier;
    if (!ext) return null;
    const result = {};
    const labels = Object.keys(ext._classifierData || {});
    labels.forEach(label => {
        result[label] = {
            imageCount: (ext._imageData[label] || []).length,
            classifierCount: (ext._classifierData[label] || []).length
        };
    });
    return result;
});

/**
 * Click the Capture 10 button and wait for the burst to complete.
 * @param {import('@playwright/test').Page} page
 */
const captureBurstExamples = async page => {
    await page.click('button:has-text("Capture 10")');
    // Wait for countdown (3s) + capture (~2s) + small buffer
    await page.waitForFunction(
        () => !document.querySelector('button:disabled'),
        {timeout: 15000}
    );
    // Additional wait for state to settle
    await page.waitForTimeout(500);
};

/**
 * Check if the model has enough data (2+ labels with 5+ examples each).
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<boolean>}
 */
const isModelReady = async page => page.evaluate(() => {
    const store = window.__scratchStore;
    if (!store) return false;
    const vm = store.getState().scratchGui && store.getState().scratchGui.vm;
    if (!vm) return false;
    const ext = vm.runtime.ext_teachableClassifier;
    if (!ext) return false;
    const labels = Object.keys(ext._classifierData || {});
    if (labels.length < 2) return false;
    return labels.every(l => (ext._classifierData[l] || []).length >= 5);
});

/**
 * Wait for the MobileNet model to be loaded in the teachable classifier extension.
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeout=30000]
 */
/**
 * Inject fake training data directly into the extension for a label.
 * This bypasses MobileNet (which doesn't load in headless Chromium)
 * by writing directly to the extension's data structures.
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @param {number} [count=10]
 */
const injectTrainingData = async (page, label, count = 10) => {
    await page.evaluate(({l, n}) => {
        const store = window.__scratchStore;
        if (!store) return;
        const vm = store.getState().scratchGui && store.getState().scratchGui.vm;
        if (!vm) return;
        const ext = vm.runtime.ext_teachableClassifier;
        if (!ext) return;

        // Initialize data structures for this label
        if (!ext._classifierData[l]) {
            ext._classifierData[l] = [];
            ext._imageData[l] = [];
        }
        if (ext.labelListEmpty) {
            ext.labelList.splice(ext.labelList.indexOf(''), 1);
            ext.labelListEmpty = false;
        }
        if (!ext.labelList.includes(l)) {
            ext.labelList.push(l);
        }

        // Add fake classifier data (arrays of numbers) and image data
        for (let i = 0; i < n; i++) {
            // Fake MobileNet activation vector (normalized random values)
            const fakeActivation = new Array(1280).fill(0).map(() => Math.random());
            ext._classifierData[l].push(fakeActivation);
            // Fake ImageData (1x1 pixel for minimal memory)
            ext._imageData[l].push(new ImageData(1, 1));
        }
    }, {l: label, n: count});
};

module.exports = {
    openExtensionLibrary,
    addExtension,
    getTeachableClassifierState,
    setPredictedLabel,
    openTeachableMachineModal,
    getWizardStep,
    getTeachableLabels,
    captureBurstExamples,
    isModelReady,
    injectTrainingData
};
