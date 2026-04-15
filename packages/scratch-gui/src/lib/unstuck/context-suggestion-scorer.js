/**
 * Rule-based scorer that generates contextual tip suggestions
 * based on the current project state. Runs synchronously — no
 * embeddings, no query, no async.
 * @param {object} context  – from extractProjectContext()
 * @param {object} tips     – the full tips dictionary (keyed by tipId)
 * @returns {Array<{tipId: string, score: number, reason: string}>}
 */
const getContextualSuggestions = function (context, tips) {
    // Map tipId → {score, reason} (highest-score reason wins)
    const scores = {};

    const boost = function (tipId, amount, reason) {
        if (!tips[tipId]) return;
        if (!scores[tipId] || scores[tipId].score < amount) {
            scores[tipId] = {score: amount, reason};
        } else if (scores[tipId]) {
            scores[tipId].score += amount;
        }
    };

    const boostByTag = function (tag, amount, reason) {
        for (const tipId in tips) {
            const tip = tips[tipId];
            if (tip.tags && tip.tags.includes(tag)) {
                boost(tipId, amount, reason);
            }
        }
    };

    // Collect all block categories and hat opcodes across all targets
    const allCategories = new Set();
    const allHatOpcodes = new Set();
    if (context.stage) {
        context.stage.blockCategories.forEach(c => allCategories.add(c));
        context.stage.hatOpcodes.forEach(o => allHatOpcodes.add(o));
    }
    for (const sprite of context.sprites) {
        sprite.blockCategories.forEach(c => allCategories.add(c));
        sprite.hatOpcodes.forEach(o => allHatOpcodes.add(o));
    }

    // --- Rule 1: Empty project ---
    if (context.totalBlockCount === 0) {
        boost('nothing-happens', 20, 'empty-project');
        boost('move-sprite', 18, 'empty-project');
        boost('add-sound', 16, 'empty-project');
        boostByTag('beginner', 5, 'empty-project');
    }

    // --- Rule 2: Has blocks but no hat blocks ---
    if (context.totalBlockCount > 0 && allHatOpcodes.size === 0) {
        boost('nothing-happens', 15, 'no-hat-blocks');
        boostByTag('events', 8, 'no-hat-blocks');
    }

    // --- Rule 3: Active tab ---
    if (context.activeTab === 'costumes') {
        boostByTag('costumes', 10, 'costumes-tab');
        boostByTag('animation', 10, 'costumes-tab');
        boostByTag('looks', 6, 'costumes-tab');
    } else if (context.activeTab === 'sounds') {
        boostByTag('sound', 10, 'sounds-tab');
        boostByTag('music', 10, 'sounds-tab');
    }

    // --- Rule 4: Category gaps (suggest complementary categories) ---
    const gapRules = [
        {has: 'motion', missing: 'looks', tag: 'looks', score: 6},
        {has: 'motion', missing: 'control', tag: 'control', score: 6},
        {has: 'looks', missing: 'sound', tag: 'sound', score: 5},
        {has: 'control', missing: 'sensing', tag: 'sensing', score: 4},
        {has: 'motion', missing: 'operators', tag: 'operators', score: 3}
    ];
    for (const rule of gapRules) {
        if (allCategories.has(rule.has) && !allCategories.has(rule.missing)) {
            boostByTag(rule.tag, rule.score, `gap-${rule.missing}`);
        }
    }

    // --- Rule 5: Extension loaded but unused ---
    const extensionTagMap = {
        pen: 'pen',
        music: 'music',
        videoSensing: 'sensing',
        text2speech: 'sound'
    };
    for (const ext of context.extensions) {
        const tag = extensionTagMap[ext];
        if (tag && !allCategories.has(ext)) {
            boostByTag(tag, 12, `unused-extension-${ext}`);
        }
    }

    // --- Rule 6: Multiple sprites but no broadcast ---
    if (context.sprites.length > 1) {
        const hasBroadcast = allHatOpcodes.has('event_whenbroadcastreceived');
        if (!hasBroadcast) {
            boostByTag('events', 8, 'no-broadcast');
        }
    }

    // --- Rule 7: No variables in a non-trivial project ---
    if (context.totalBlockCount > 10 && !context.hasVariables) {
        boostByTag('variables', 5, 'no-variables');
    }

    // Convert to sorted array
    const results = Object.keys(scores).map(tipId => ({
        tipId,
        score: scores[tipId].score,
        reason: scores[tipId].reason
    }));
    results.sort((a, b) => b.score - a.score);

    // --- Diversity penalty: avoid top results all sharing a tag ---
    if (results.length >= 2) {
        const primaryTag = tagId => {
            const tip = tips[tagId];
            return (tip && tip.tags && tip.tags[0]) || '';
        };
        const topTag = primaryTag(results[0].tipId);
        for (let i = 1; i < Math.min(results.length, 5); i++) {
            if (primaryTag(results[i].tipId) === topTag) {
                results[i] = Object.assign({}, results[i], {
                    score: results[i].score - 3
                });
            }
        }
        results.sort((a, b) => b.score - a.score);
    }

    return results.slice(0, 5);
};

export default getContextualSuggestions;
