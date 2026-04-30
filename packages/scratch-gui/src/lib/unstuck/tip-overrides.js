/**
 * Persistence layer for tip edits.
 * Stores overrides in localStorage on top of the static tips data.
 */
import staticTips from '../libraries/tips/index.js';

const STORAGE_KEY = 'scratch-tip-overrides';
const REVIEWED_KEY = 'scratch-tip-reviewed';

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
 * Export tips as JSON matching the tips.json format (tips + quickPicks).
 */
const exportTipsJson = function (quickPicks) {
    return JSON.stringify({
        tips: loadMergedTips(),
        quickPicks: quickPicks || []
    }, null, 2);
};

/**
 * Import tips from a JSON string. Stores all imported tips as overrides.
 */
const importTips = function (jsonString) {
    const data = JSON.parse(jsonString);
    if (data.tips) {
        const overrides = {};
        for (const [id, tip] of Object.entries(data.tips)) {
            overrides[id] = tip;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    }
};

/**
 * Clear all tip overrides.
 */
const clearAllOverrides = function () {
    localStorage.removeItem(STORAGE_KEY);
};

/**
 * POST the current merged tips to the dev-server middleware so they land
 * in tips.json on disk. Only works when running under `npm start` (dev
 * server). Callers should clear overrides on success so subsequent reads
 * come from the freshly written source file.
 */
const persistToSource = async function ({tips: tipsPayload, quickPicks} = {}) {
    const body = {};
    if (tipsPayload) {
        body.tips = {
            tips: tipsPayload,
            quickPicks: quickPicks || []
        };
    }
    const response = await fetch('/__tips-author/save', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        let detail = '';
        try {
            const payload = await response.json();
            detail = payload && payload.error ? `: ${payload.error}` : '';
        } catch (e) { /* ignore */ }
        throw new Error(`Tips authoring save failed (${response.status})${detail}`);
    }
    return response.json();
};

/**
 * Drop the localStorage override for a tip without reverting the in-memory
 * merged view. Used after a successful persistToSource so the next page load
 * reads straight from disk.
 */
const forgetOverride = function (tipId) {
    const overrides = getRawOverrides();
    if (overrides[tipId]) {
        delete overrides[tipId];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    }
};

/**
 * Get the set of reviewed tip IDs from localStorage.
 */
const getReviewedSet = function () {
    try {
        const stored = localStorage.getItem(REVIEWED_KEY);
        return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch (e) {
        return new Set();
    }
};

/**
 * Check if a tip is marked as reviewed.
 */
const isReviewed = function (tipId) {
    return getReviewedSet().has(tipId);
};

/**
 * Mark a tip as reviewed or unreviewed.
 */
const setReviewed = function (tipId, reviewed) {
    const set = getReviewedSet();
    if (reviewed) {
        set.add(tipId);
    } else {
        set.delete(tipId);
    }
    localStorage.setItem(REVIEWED_KEY, JSON.stringify([...set]));
};

export {
    loadMergedTips,
    saveOverride,
    deleteOverride,
    hasOverride,
    clearOverride,
    exportTipsJson,
    importTips,
    clearAllOverrides,
    persistToSource,
    forgetOverride,
    getReviewedSet,
    isReviewed,
    setReviewed
};
