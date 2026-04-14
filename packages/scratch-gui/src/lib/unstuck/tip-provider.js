/**
 * TipProvider interface and keyword-matching implementation.
 *
 * The TipProvider abstraction allows swapping between different matching
 * strategies (keyword, embeddings, LLM) without changing the UI layer.
 */

const STOPWORDS = new Set([
    'the', 'and', 'for', 'with', 'this', 'that', 'you', 'your',
    'are', 'but', 'not', 'have', 'has', 'was', 'were', 'from', 'they',
    'them', 'how', 'why', 'what', 'when', 'where', 'can', 'will', 'just',
    'into', 'out', 'about', 'like'
]);

const tokenize = function (phrase) {
    return phrase
        .toLowerCase()
        .split(/[^a-z0-9']+/)
        .filter(w => w.length > 2 && !STOPWORDS.has(w));
};

/**
 * Build (and cache on the tip) the set of keyword tokens derived from
 * `tip.queries`. Queries are full natural-language phrases; we tokenize
 * them so the scorer can match individual words from the user's query.
 */
const getKeywordSet = function (tip) {
    if (tip.__keywordSet) return tip.__keywordSet;
    const set = new Set();
    if (Array.isArray(tip.queries)) {
        for (const phrase of tip.queries) {
            for (const tok of tokenize(String(phrase))) {
                set.add(tok);
            }
        }
    }
    Object.defineProperty(tip, '__keywordSet', {value: set, enumerable: false});
    return set;
};

/**
 * Score a tip based on project context signals only.
 * Kept as an API surface for EmbeddingTipProvider; contextual suggestion
 * logic now lives in context-suggestion-scorer.js.
 * @returns {number}
 */
const scoreContext = function () {
    return 0;
};

/**
 * Score a tip against a query using keyword matching.
 * Returns a relevance score (higher = better match).
 * @param {object} tip - A tip object from the tips library
 * @param {string} query - The user's search query
 * @returns {number} Relevance score
 */
const scoreTip = function (tip, query) {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    let score = 0;

    const keywordSet = getKeywordSet(tip);
    for (const word of queryWords) {
        if (keywordSet.has(word)) {
            score += 3;
        }
    }

    if (tip.tags) {
        for (const tag of tip.tags) {
            if (queryLower.includes(tag.toLowerCase())) {
                score += 2;
            }
        }
    }

    const tipTextLower = tip.text.toLowerCase();
    for (const word of queryWords) {
        if (tipTextLower.includes(word)) {
            score += 1;
        }
    }

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
            const score = scoreTip(tip, query);
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
