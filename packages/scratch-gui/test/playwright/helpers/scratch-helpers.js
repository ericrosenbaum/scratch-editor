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

module.exports = {openExtensionLibrary, addExtension, getTeachableClassifierState, setPredictedLabel};
