import {openCodeExplanation, setCodeExplanationResult} from '../reducers/code-explanation';
import {ensureLoaded} from './ai-model-manager';

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
    let ext;
    try {
        ext = await ensureLoaded(vm);
    } catch (e) {
        return; // user cancelled the load modal
    }

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

        const result = await ext.generate({text: prompt, maxNewTokens: 200});
        dispatch(setCodeExplanationResult('done', result));
    } catch (err) {
        dispatch(setCodeExplanationResult('error', `Error: ${err.message}`));
    }
};

export {explainCode};
