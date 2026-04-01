/**
 * Persistence layer for tip edits.
 * Stores overrides in localStorage on top of the static tips data.
 */
import staticTips from '../libraries/tips/index.js';

const STORAGE_KEY = 'scratch-tip-overrides';
const BLOCK_TEMPLATES_KEY = 'scratch-tip-block-templates';

/**
 * Read raw overrides from localStorage.
 */
const getRawOverrides = function () {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        return {};
    }
};

/**
 * Read custom block templates from localStorage.
 */
const getCustomBlockTemplates = function () {
    try {
        const stored = localStorage.getItem(BLOCK_TEMPLATES_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        return {};
    }
};

/**
 * Get all tips merged: static data overridden by localStorage edits.
 */
const loadMergedTips = function () {
    const overrides = getRawOverrides();
    const merged = {};
    for (const [id, tip] of Object.entries(staticTips)) {
        if (overrides[id] && overrides[id]._deleted) continue;
        merged[id] = overrides[id] ? {...tip, ...overrides[id]} : tip;
    }
    // Include any entirely new tips from overrides (skip deleted)
    for (const [id, tip] of Object.entries(overrides)) {
        if (tip._deleted) continue;
        if (!merged[id]) {
            merged[id] = tip;
        }
    }
    return merged;
};

/**
 * Save an override for a single tip.
 */
const saveOverride = function (tipId, tipData) {
    const overrides = getRawOverrides();
    overrides[tipId] = tipData;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
};

/**
 * Save a custom block template.
 */
const saveBlockTemplate = function (name, blocks) {
    const templates = getCustomBlockTemplates();
    templates[name] = blocks;
    localStorage.setItem(BLOCK_TEMPLATES_KEY, JSON.stringify(templates));
};

/**
 * Check if a tip has local overrides.
 */
const hasOverride = function (tipId) {
    const overrides = getRawOverrides();
    return !!overrides[tipId];
};

/**
 * Delete a tip and clean up follow-up references from all other tips.
 */
const deleteOverride = function (tipId) {
    const overrides = getRawOverrides();
    overrides[tipId] = {_deleted: true};

    // Remove tipId from followUps in all other tips
    const allTips = {};
    for (const [id, tip] of Object.entries(staticTips)) {
        allTips[id] = overrides[id] && !overrides[id]._deleted ? {...tip, ...overrides[id]} : tip;
    }
    for (const [id, tip] of Object.entries(overrides)) {
        if (!allTips[id] && !tip._deleted) {
            allTips[id] = tip;
        }
    }

    for (const [id, tip] of Object.entries(allTips)) {
        if (id === tipId) continue;
        if (tip.followUps && tip.followUps.includes(tipId)) {
            const cleaned = {...tip, followUps: tip.followUps.filter(fid => fid !== tipId)};
            overrides[id] = cleaned;
        }
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
};

/**
 * Revert a tip to its static version.
 */
const clearOverride = function (tipId) {
    const overrides = getRawOverrides();
    delete overrides[tipId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
};

/**
 * Export all tips (merged) plus custom block templates as a JSON string.
 */
const exportAllTips = function () {
    return JSON.stringify({
        tips: loadMergedTips(),
        blockTemplates: getCustomBlockTemplates()
    }, null, 2);
};

/**
 * Import tips and block templates from a JSON string.
 * Only stores the diffs from static data as overrides.
 */
const importTips = function (jsonString) {
    const data = JSON.parse(jsonString);
    if (data.tips) {
        const overrides = {};
        for (const [id, tip] of Object.entries(data.tips)) {
            // Store all imported tips as overrides
            overrides[id] = tip;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    }
    if (data.blockTemplates) {
        localStorage.setItem(BLOCK_TEMPLATES_KEY, JSON.stringify(data.blockTemplates));
    }
};

/**
 * Clear all overrides and custom templates.
 */
const clearAllOverrides = function () {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(BLOCK_TEMPLATES_KEY);
};

export {
    loadMergedTips,
    saveOverride,
    deleteOverride,
    saveBlockTemplate,
    hasOverride,
    clearOverride,
    exportAllTips,
    importTips,
    clearAllOverrides,
    getCustomBlockTemplates
};
