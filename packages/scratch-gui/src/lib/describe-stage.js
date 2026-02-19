import {isLoaded, getLlmInference, showLoadModal} from './ai-model-manager';

/**
 * Capture the current stage frame and generate a short description using Gemma.
 * @param {object} vm - Scratch VM instance
 * @returns {Promise<string>} A short, child-friendly description of the stage
 */
const describeStage = async vm => {
    if (!isLoaded()) {
        await showLoadModal(); // throws if user cancels
    }
    const renderer = vm && vm.runtime && vm.runtime.renderer;
    const canvas = renderer && renderer.canvas;
    if (!canvas) throw new Error('No stage canvas found');
    // Force a fresh WebGL frame into the buffer before reading pixels
    renderer.draw();
    const llm = getLlmInference();
    const prompt = 'Describe what you see on this Scratch stage in one or two short, friendly sentences for a child.';
    const response = await llm.generateResponse([prompt, {imageSource: canvas}]);
    return (typeof response === 'string' ? response : String(response)).trim();
};

export {describeStage};
