/**
 * Builds a concise natural-language query string from project context and
 * scratchblocks text, suitable for embedding-based tip search.
 *
 * @param {object} context - Output of extractProjectContext
 * @param {Object<string, string>} scratchblocksMap - Output of getProjectText (target name → text)
 * @returns {string} A compact query string (~150 words max)
 */

const MAX_WORDS = 150;

/**
 * Strip scratchblocks syntax to extract just the meaningful words.
 * Removes brackets, parens, angle brackets, "v", "end", "?", etc.
 */
const cleanScratchblocksText = function (text) {
    return text
        .replace(/[<>()[\]{}?]/g, ' ')
        .replace(/\b(end|v)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Deduplicate words while preserving order.
 */
const dedupeWords = function (words) {
    const seen = new Set();
    return words.filter(w => {
        const lower = w.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
    });
};

const buildContextQuery = function (context, scratchblocksMap) {
    if (!context) return '';

    const parts = [];
    const editingTarget = context.editingTarget;

    // Build per-sprite summaries, prioritizing the editing target
    const spriteEntries = [];
    for (const name in scratchblocksMap) {
        const text = scratchblocksMap[name];
        if (!text || !text.trim()) continue;
        spriteEntries.push({name, text});
    }

    // Sort: editing target first
    spriteEntries.sort((a, b) => {
        if (a.name === editingTarget) return -1;
        if (b.name === editingTarget) return 1;
        if (a.name === 'Stage') return 1;
        if (b.name === 'Stage') return -1;
        return 0;
    });

    for (const {name, text} of spriteEntries) {
        const cleaned = cleanScratchblocksText(text);
        const words = dedupeWords(cleaned.split(' ').filter(w => w.length > 1));
        // Give the editing target more detail
        const limit = name === editingTarget ? 40 : 20;
        const summary = words.slice(0, limit).join(' ');
        if (summary) {
            parts.push(`${name}: ${summary}.`);
        }
    }

    // Add metadata not captured in block text
    if (context.globalVariables && context.globalVariables.length > 0) {
        const varNames = context.globalVariables.map(v => v.name).join(', ');
        parts.push(`Variables: ${varNames}.`);
    }

    if (context.globalLists && context.globalLists.length > 0) {
        const listNames = context.globalLists.map(l => l.name).join(', ');
        parts.push(`Lists: ${listNames}.`);
    }

    if (context.extensions && context.extensions.length > 0) {
        parts.push(`Extensions: ${context.extensions.join(', ')}.`);
    }

    parts.push(`Editing ${editingTarget || 'unknown'} on ${context.activeTab || 'code'} tab.`);

    // Join and truncate to word limit
    const fullText = parts.join(' ');
    const allWords = fullText.split(/\s+/);
    if (allWords.length > MAX_WORDS) {
        return allWords.slice(0, MAX_WORDS).join(' ');
    }
    return fullText;
};

export default buildContextQuery;
