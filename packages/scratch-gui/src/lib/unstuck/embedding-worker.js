/**
 * ES Module Web Worker for sentence embedding inference.
 * This file is copied to build output via CopyWebpackPlugin (not bundled by webpack).
 * Loads @huggingface/transformers from CDN via dynamic import().
 *
 * Must be loaded as a module worker: new Worker(url, {type: 'module'})
 */

let embedder = null;
const tipEmbeddings = new Map();

const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity (a, b) {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

self.onmessage = async function (event) {
    const {type} = event.data;

    if (type === 'init') {
        try {
            console.log('[Embedding Worker] Loading transformers.js from CDN...');
            const {pipeline, env} = await import(
                /* webpackIgnore: true */
                TRANSFORMERS_CDN + '/dist/transformers.min.js'
            );

            env.allowLocalModels = false;

            console.log('[Embedding Worker] Creating feature-extraction pipeline...');
            embedder = await pipeline(
                'feature-extraction',
                'Xenova/all-MiniLM-L6-v2',
                {
                    dtype: 'q8',
                    device: 'wasm',
                    progress_callback: function (progressInfo) {
                        if (progressInfo.status === 'progress') {
                            console.log(
                                '[Embedding Worker] Download: ' + progressInfo.file +
                                ' ' + Math.round(progressInfo.progress) + '%'
                            );
                            self.postMessage({
                                type: 'progress',
                                progress: progressInfo.progress,
                                file: progressInfo.file
                            });
                        }
                    }
                }
            );

            console.log('[Embedding Worker] Model ready');
            self.postMessage({type: 'ready'});
        } catch (error) {
            console.error('[Embedding Worker] Init failed: ' + error.message);
            self.postMessage({
                type: 'error',
                message: 'Failed to load embedding model: ' + error.message
            });
        }
    } else if (type === 'embed-tips') {
        if (!embedder) {
            self.postMessage({type: 'error', message: 'Model not loaded yet'});
            return;
        }

        try {
            const tips = event.data.tips;
            console.log('[Embedding Worker] Embedding ' + tips.length + ' tips...');

            for (let i = 0; i < tips.length; i++) {
                const output = await embedder(tips[i].text, {pooling: 'mean', normalize: true});
                tipEmbeddings.set(tips[i].id, new Float32Array(output.data));
            }

            console.log('[Embedding Worker] All ' + tips.length + ' tips embedded');
            self.postMessage({type: 'tips-ready'});
        } catch (error) {
            console.error('[Embedding Worker] Tip embedding failed: ' + error.message);
            self.postMessage({
                type: 'error',
                message: 'Tip embedding failed: ' + error.message
            });
        }
    } else if (type === 'embed-query') {
        if (!embedder) {
            self.postMessage({type: 'error', message: 'Model not loaded yet'});
            return;
        }

        try {
            const query = event.data.query;
            const contextScores = event.data.contextScores;
            const queryId = event.data.queryId;

            const output = await embedder(query, {pooling: 'mean', normalize: true});
            const queryEmbedding = new Float32Array(output.data);

            const results = [];
            tipEmbeddings.forEach(function (tipEmbedding, tipId) {
                const similarity = cosineSimilarity(queryEmbedding, tipEmbedding);
                const embeddingScore = similarity * 10;
                const contextScore = contextScores[tipId] || 0;
                const finalScore = embeddingScore + contextScore;
                results.push({tipId: tipId, score: finalScore});
            });

            results.sort(function (a, b) { return b.score - a.score; });
            self.postMessage({
                type: 'results',
                results: results.slice(0, 5),
                queryId: queryId
            });
        } catch (error) {
            console.error('[Embedding Worker] Query embedding failed: ' + error.message);
            self.postMessage({
                type: 'error',
                message: 'Query embedding failed: ' + error.message
            });
        }
    }
};
