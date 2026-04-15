/**
 * Build the embedding document for a single tip.
 *
 * Format matches EmbeddingGemma's training prompt: "title: ... | text: ...".
 * Both the build-time embedding script and the runtime fallback path call this
 * so the indexed text is identical in both cases.
 * @param tip
 */
const buildTipDocument = function (tip) {
    const title = tip.title || '';
    return `title: ${title} | text: ${tip.text}`;
};

export {buildTipDocument};
export default buildTipDocument;
