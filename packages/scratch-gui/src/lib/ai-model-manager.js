/**
 * Thin facade over the On-Device AI extension's model engine.
 *
 * The extension (scratch-vm/src/extensions/scratch3_ConstrainedAI) owns the
 * Gemma 4 model — transformers.js on WebGPU, a ~3.4 GB download that the
 * browser caches.  GUI features reuse that single instance instead of loading
 * a second copy: they ask the VM to load the extension if needed, wait for the
 * model (the extension shows its own progress modal / toast) and then generate.
 */
const EXTENSION_ID = 'AIBlocks';

const getExtension = vm => (vm && vm.runtime && vm.runtime._AIBlocksExtension) || null;

/**
 * @param {object} vm - Scratch VM instance
 * @returns {boolean} true when the extension is loaded and its model is ready
 */
const isLoaded = vm => {
    const ext = getExtension(vm);
    return Boolean(ext && ext.modelLoaded);
};

/**
 * Load the extension (if needed) and wait for its model.  Rejects if the user
 * dismisses the download modal or the model fails to load.
 * @param {object} vm - Scratch VM instance
 * @returns {Promise<object>} the extension instance
 */
const ensureLoaded = async vm => {
    let ext = getExtension(vm);
    if (!ext) {
        await vm.extensionManager.loadExtensionURL(EXTENSION_ID);
        ext = getExtension(vm);
    }
    if (!ext) throw new Error('The On-Device AI extension is not available');
    await ext.ensureModelLoaded();
    return ext;
};

/**
 * Generate text (optionally grounded in an image and/or audio clip).
 * @param {object} vm - Scratch VM instance
 * @param {object} request - see the extension's generate(): {text, image, audio, maxNewTokens}
 * @returns {Promise<string>} the model's reply
 */
const generate = async (vm, request) => {
    const ext = await ensureLoaded(vm);
    return ext.generate(request);
};

export {isLoaded, ensureLoaded, generate};
