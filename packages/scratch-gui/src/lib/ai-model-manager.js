/**
 * Stub AI model manager for the Gemma on-device model.
 *
 * This is a minimal version. The full implementation with OPFS caching,
 * auto-download, and model loading modal lives on the on-device-ai branch.
 * This stub provides the same API surface so the ai-code-suggestions
 * module compiles and can be tested with a mock.
 */

let _llmInference = null;
let _modelLoaded = false;

const isLoaded = () => _modelLoaded;

const getLlmInference = () => _llmInference;

const loadModel = async url => {
    try {
        const {FilesetResolver, LlmInference} = require('@mediapipe/tasks-genai');
        const filesetResolver = await FilesetResolver.forGenAiTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.26/wasm'
        );
        _llmInference = await LlmInference.createFromOptions(filesetResolver, {
            baseOptions: {modelAssetPath: url},
            maxTokens: 4096,
            maxNumImages: 1,
            supportAudio: true
        });
        _modelLoaded = true;
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load AI model:', err.message);
        throw err;
    }
};

const generate = async prompt => {
    if (!_llmInference) throw new Error('Model not loaded');
    return _llmInference.generateResponse(prompt);
};

/**
 * Show the model-loading modal.
 * In the stub, this simply rejects since there's no model to load.
 * The full implementation on the on-device-ai branch handles OPFS caching,
 * auto-download with progress bar, and file picker fallback.
 */
const showLoadModal = () => Promise.reject(new Error(
    'AI model not available. Please use the on-device-ai branch for full model support.'
));

export {isLoaded, getLlmInference, loadModel, generate, showLoadModal};
