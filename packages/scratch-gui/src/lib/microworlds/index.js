/**
 * @file Registry of available Microworlds plus selector helpers used by the
 * reducer, containers, and the wizard UI to read the current step's config.
 */

import intro from './intro';

const microworlds = {
    intro
};

/**
 * @param {?string} id microworld id
 * @returns {?object} the microworld definition, or null
 */
const getMicroworld = id => microworlds[id] || null;

/**
 * @param {object} mwState the `scratchGui.microworlds` redux slice
 * @returns {?object} the current step definition, or null when inactive
 */
const getCurrentStep = mwState => {
    if (!mwState || !mwState.active) return null;
    const world = getMicroworld(mwState.worldId);
    if (!world) return null;
    return world.steps[mwState.step] || null;
};

/**
 * @param {object} mwState the `scratchGui.microworlds` redux slice
 * @returns {object} the current step's reveal flags (empty when inactive)
 */
const getReveal = mwState => {
    const step = getCurrentStep(mwState);
    return (step && step.reveal) || {};
};

/**
 * @param {object} mwState the `scratchGui.microworlds` redux slice
 * @returns {?Array<string>} allowed block opcodes, or null for the full palette
 */
const getPalette = mwState => {
    const step = getCurrentStep(mwState);
    return step ? (step.palette || null) : null;
};

/**
 * @param {object} mwState the `scratchGui.microworlds` redux slice
 * @returns {number} total number of steps in the active microworld
 */
const getStepCount = mwState => {
    const world = getMicroworld(mwState && mwState.worldId);
    return world ? world.steps.length : 0;
};

export {
    microworlds as default,
    getMicroworld,
    getCurrentStep,
    getReveal,
    getPalette,
    getStepCount
};
