/**
 * Simple content hash for validating tip embedding cache freshness.
 * Must produce the same output as the build script (scripts/generate-tip-embeddings.mjs).
 */

/**
 * djb2-based hash — fast, deterministic, good enough for cache invalidation.
 * NOT cryptographic; only used to detect when tips or model config changed.
 * @param {string} str - input string to hash
 * @returns {string} hex hash string
 */
const simpleHash = (str) => {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16);
};

/**
 * Compute a content hash from model name, dtype, and tip texts.
 * @param {string} modelName - e.g. 'Xenova/all-MiniLM-L6-v2'
 * @param {string} modelDtype - e.g. 'q8'
 * @param {Array<{id: string, text: string}>} tipTexts - combined tip texts
 * @returns {string} hex hash string
 */
const createHash = (modelName, modelDtype, tipTexts) => {
    let combined = `${modelName}\0${modelDtype}`;
    for (const t of tipTexts) {
        combined += `\0${t.id}\0${t.text}`;
    }
    return simpleHash(combined);
};

export {createHash};
