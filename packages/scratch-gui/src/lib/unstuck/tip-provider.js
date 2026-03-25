/**
 * TipProvider interface and keyword-matching implementation.
 *
 * The TipProvider abstraction allows swapping between different matching
 * strategies (keyword, embeddings, LLM) without changing the UI layer.
 */

/**
 * Get all opcodes used in the project from context.
 */
const getAllOpcodes = function (context) {
    const opcodes = new Set();
    if (context.stage && context.stage.hatOpcodes) {
        context.stage.hatOpcodes.forEach(o => opcodes.add(o));
    }
    for (const sprite of context.sprites) {
        if (sprite.hatOpcodes) {
            sprite.hatOpcodes.forEach(o => opcodes.add(o));
        }
    }
    return opcodes;
};

/**
 * Get all block categories used in the project.
 */
const getAllCategories = function (context) {
    const categories = new Set();
    if (context.stage) {
        context.stage.blockCategories.forEach(c => categories.add(c));
    }
    for (const sprite of context.sprites) {
        sprite.blockCategories.forEach(c => categories.add(c));
    }
    return categories;
};

/**
 * Score a tip based on project context signals only.
 * @param {object} tip - A tip object from the tips library
 * @param {object} context - Project context from extractProjectContext
 * @returns {number} Context relevance score
 */
const scoreContext = function (tip, context) {
    let score = 0;
    if (context && tip.relevance) {
        const {projectSignals} = tip.relevance;
        if (projectSignals) {
            if (projectSignals.missing) {
                const allOpcodes = getAllOpcodes(context);
                for (const opcode of projectSignals.missing) {
                    if (!allOpcodes.has(opcode)) {
                        score += 2;
                    }
                }
            }
            if (projectSignals.hasCategories) {
                const allCategories = getAllCategories(context);
                for (const cat of projectSignals.hasCategories) {
                    if (allCategories.has(cat)) {
                        score += 1;
                    }
                }
            }
        }
    }
    return score;
};

/**
 * Score a tip against a query using keyword matching.
 * Returns a relevance score (higher = better match).
 * @param {object} tip - A tip object from the tips library
 * @param {string} query - The user's search query
 * @param {object} context - Project context from extractProjectContext
 * @returns {number} Relevance score
 */
const scoreTip = function (tip, query, context) {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    let score = 0;

    // Match against tip keywords
    if (tip.relevance && tip.relevance.keywords) {
        for (const keyword of tip.relevance.keywords) {
            if (queryLower.includes(keyword.toLowerCase())) {
                score += 3;
            }
        }
    }

    // Match against tip tags
    if (tip.tags) {
        for (const tag of tip.tags) {
            if (queryLower.includes(tag.toLowerCase())) {
                score += 2;
            }
        }
    }

    // Match query words against tip text
    const tipTextLower = tip.text.toLowerCase();
    for (const word of queryWords) {
        if (tipTextLower.includes(word)) {
            score += 1;
        }
    }

    score += scoreContext(tip, context);

    return score;
};

/**
 * Keyword-based tip provider.
 * Scores all tips against the query and context, returns the best matches.
 */
class KeywordTipProvider {
    constructor (tips) {
        this.tips = tips;
    }

    /**
     * Get matching tips for a query.
     * @param {object} context - Project context from extractProjectContext
     * @param {string} query - The user's question
     * @returns {Promise<Array<{tipId: string, score: number}>>} Ranked results
     */
    getTips (context, query) {
        const results = [];
        for (const tipId in this.tips) {
            const tip = this.tips[tipId];
            const score = scoreTip(tip, query, context);
            if (score > 0) {
                results.push({tipId, score});
            }
        }
        results.sort((a, b) => b.score - a.score);
        return Promise.resolve(results.slice(0, 10));
    }
}

export {KeywordTipProvider, scoreContext};
export default KeywordTipProvider;
