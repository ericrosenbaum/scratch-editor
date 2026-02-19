import {openCodeExplanation, setCodeExplanationResult} from '../reducers/code-explanation';
import {isLoaded, getLlmInference, generate, showLoadModal} from './ai-model-manager';

/**
 * Build context info string for the prompt.
 * @param {string} targetName
 * @param {boolean} isStage
 * @param {object} targets - Redux targets state
 * @returns {string}
 */
const buildContextInfo = function (targetName, isStage, targets) {
    if (isStage) {
        const stage = targets.stage;
        const backdropNames = stage && stage.costumes
            ? stage.costumes.map(c => `"${c.name}"`).join(', ')
            : '(none)';
        return `Backdrops: ${backdropNames}`;
    }
    const spriteId = Object.keys(targets.sprites || {}).find(
        id => targets.sprites[id].name === targetName
    );
    const sprite = spriteId ? targets.sprites[spriteId] : null;
    const costumeNames = sprite && sprite.costumes
        ? sprite.costumes.map(c => `"${c.name}"`).join(', ')
        : '(none)';
    const soundNames = sprite && sprite.sounds
        ? sprite.sounds.map(s => `"${s.name}"`).join(', ')
        : '(none)';
    return `Costumes: ${costumeNames}\nSounds: ${soundNames}`;
};

const buildPrompt = function (targetName, isStage, contextInfo, blocksText) {
    const entityType = isStage ? 'Stage' : `sprite "${targetName}"`;
    return (
        `You are explaining a Scratch project to a beginner. ` +
        `Explain what the code does in clear, friendly language. ` +
        `Be very brief: typically one sentence, no more than three sentences. ` +
        `Focus on behavior, not syntax.\n\n` +
        `${isStage ? 'Stage' : `Sprite: "${targetName}"`}\n` +
        `${contextInfo}\n` +
        `Blocks:\n${blocksText}\n\n` +
        `Explain what this ${entityType} does:`
    );
};

/**
 * Resolve which generate function to use, loading the model if needed.
 * Prefers the extension's already-loaded model; falls back to the manager.
 * Shows the load modal if no model is available yet.
 *
 * @param {object} aiExt - vm.runtime._AIBlocksExtension (may be null)
 * @returns {Promise<Function|null>} async generate function, or null if user cancelled
 */
const resolveGenerateFn = async aiExt => {
    // 1. Extension has the model ready — use its generate (includes thinking spinner)
    if (aiExt && aiExt.modelLoaded) {
        return prompt => aiExt.generateWithSpinner(prompt);
    }

    // 2. Manager already loaded the model independently
    if (isLoaded()) {
        return prompt => generate(prompt);
    }

    // 3. No model loaded anywhere — show the load modal and wait
    try {
        await showLoadModal();
    } catch (e) {
        return null; // user cancelled
    }

    // Sync newly loaded model to the extension so AI blocks also work
    if (aiExt && !aiExt.modelLoaded) {
        aiExt.llmInference = getLlmInference();
        aiExt.modelLoaded = true;
        aiExt.isLoading = false;
    }

    return prompt => generate(prompt);
};

/**
 * Explain the code for a sprite or stage using the on-device AI.
 * Works with or without the On-Device AI extension loaded.
 *
 * @param {object} vm - Scratch VM instance
 * @param {string} targetName - sprite name or 'Stage'
 * @param {boolean} isStage
 * @param {object} targets - Redux targets state ({ sprites, stage })
 * @param {Function} dispatch - Redux dispatch
 */
const explainCode = async function (vm, targetName, isStage, targets, dispatch) {
    const aiExt = vm.runtime._AIBlocksExtension;

    const generateFn = await resolveGenerateFn(aiExt);
    if (!generateFn) return; // user cancelled the load modal

    dispatch(openCodeExplanation(targetName));

    try {
        const json = JSON.parse(vm.toJSON());
        const {Project} = require('sb-edit');
        const p = await Project.fromSb3JSON(json, {getAsset: () => null});
        const allBlocks = p.toScratchblocks();
        const blocksText = allBlocks[targetName] || '(no scripts)';

        const contextInfo = buildContextInfo(targetName, isStage, targets);
        const prompt = buildPrompt(targetName, isStage, contextInfo, blocksText);
        // eslint-disable-next-line no-console
        console.log('[explain-code] prompt:\n', prompt);

        const result = await generateFn(prompt);
        dispatch(setCodeExplanationResult('done', result.trim()));
    } catch (err) {
        dispatch(setCodeExplanationResult('error', `Error: ${err.message}`));
    }
};

export {explainCode};
