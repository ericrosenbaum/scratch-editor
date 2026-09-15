import {ensureLoaded} from './ai-model-manager';

/**
 * Capture the current stage frame and generate a short description using Gemma.
 * @param {object} vm - Scratch VM instance
 * @returns {Promise<string>} A short, child-friendly description of the stage
 */
const describeStage = async vm => {
    const ext = await ensureLoaded(vm); // throws if user cancels
    const image = ext.captureStageImage();
    if (!image) throw new Error('No stage canvas found');
    return ext.generate({
        text: 'Describe what you see on this Scratch stage in one or two short, friendly sentences for a child.',
        image,
        maxNewTokens: 96
    });
};

export {describeStage};
