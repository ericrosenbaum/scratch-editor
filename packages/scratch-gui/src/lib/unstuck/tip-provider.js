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
 * Build (and cache on the tip) the set of keyword tokens derived from the
 * tip's title + text. Mirrors what the embedder sees so semantic and
 * keyword paths return consistent results. Tags are deliberately excluded
 * — they're organizational metadata, not retrieval signal.
 * @param tip
 */
const getKeywordSet = function (tip) {
    if (tip.__keywordSet) return tip.__keywordSet;
    const set = new Set();
    const source = `${tip.text || ''} ${tip.title || ''}`;
    for (const tok of tokenize(source)) {
        set.add(tok);
    }
    Object.defineProperty(tip, '__keywordSet', {value: set, enumerable: false});
    return set;
};

/**
 * Score a tip against a query using keyword matching.
 * Returns a relevance score (higher = better match).
 * @param {object} tip - A tip object from the tips library
 * @param {string} query - The user's search query
 * @returns {number} Relevance score
 */
const scoreTip = function (tip, query) {
    const queryWords = query.toLowerCase().split(/\s+/)
        .filter(w => w.length > 2);
    let score = 0;

    const keywordSet = getKeywordSet(tip);
    for (const word of queryWords) {
        if (keywordSet.has(word)) {
            score += 3;
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
     * The `context` parameter is part of the TipProvider interface but unused
     * here; the keyword scorer relies only on the query text.
     * @param {object} _context - Project context (unused)
     * @param {string} query - The user's question
     * @returns {Promise<Array<{tipId: string, score: number}>>} Ranked results
     */
    getTips (_context, query) {
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

export {KeywordTipProvider};
export default KeywordTipProvider;
