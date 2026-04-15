/**
 * Embedding-based tip provider using a sentence embedding model.
 * Delegates all worker/model management to the shared EmbeddingService
 * singleton so the tips feature and the Q+A extension share one worker
 * and one model load. Falls back to KeywordTipProvider when the model
 * isn't ready or errors out.
 *
 * Tip embeddings are pre-computed at build time (see scripts/generate-tip-embeddings.mjs)
 * and loaded from a checked-in cache file. The worker only needs to embed user queries
 * at runtime. If the cache is missing or stale, falls back to computing embeddings
 * in the worker.
 */
import embeddingCache from '../libraries/tips/embeddings-cache.json';
import {createHash} from './embedding-hash.js';
import {buildTipDocument} from './tip-document.js';
import sharedEmbeddingService from '../embedding/embedding-service.js';

class EmbeddingTipProvider {
    constructor (tips, keywordProvider, embeddingService) {
        this.tips = tips;
        this._keywordProvider = keywordProvider;
        this._service = embeddingService || sharedEmbeddingService;
        this._ready = false;

        // One embedding document per tip — same shape used by the build script,
        // including the `id` field expected by createHash.
        this._tipDocs = [];
        for (const tipId of Object.keys(tips)) {
            this._tipDocs.push({
                id: tipId,
                tipId,
                text: buildTipDocument(tips[tipId])
            });
        }

        // Check if the build-time cache is still valid
        let cachedEmbeddings = null;
        if (embeddingCache && embeddingCache.docs && embeddingCache.embeddings) {
            const currentHash = createHash(
                embeddingCache.modelName,
                embeddingCache.modelDtype,
                this._tipDocs
            );
            if (currentHash === embeddingCache.contentHash) {
                cachedEmbeddings = embeddingCache.embeddings;
            } else {
                console.warn(
                    '[EmbeddingTipProvider] Cache content hash mismatch — will compute embeddings at runtime'
                );
            }
        }

        this._service.warmUp()
            .then(() => {
                if (cachedEmbeddings) {
                    console.log('[EmbeddingTipProvider] Model loaded, using cached tip embeddings');
                    return this._service.loadTipCorpus(this._tipDocs, cachedEmbeddings);
                }
                console.log('[EmbeddingTipProvider] Model loaded, computing tip embeddings at runtime...');
                return this._service.loadTipCorpus(this._tipDocs, null);
            })
            .then(() => {
                console.log('[EmbeddingTipProvider] Tips embedded, switching to semantic matching');
                this._ready = true;
            })
            .catch(err => {
                console.warn('[EmbeddingTipProvider] Failed to load embedding model:', err);
                this._ready = false;
            });
    }

    /**
     * Get matching tips for a query.
     * Falls back to keyword matching if the embedding model isn't ready.
     * @param {object} context - Project context from extractProjectContext
     * @param {string} query - The user's question
     * @returns {Promise<Array<{tipId: string, score: number}>>} Ranked results
     */
    getTips (context, query) {
        if (!this._ready) {
            return this._keywordProvider.getTips(context, query);
        }

        return this._service.queryTips(query)
            .catch(() =>
                // On any worker error, fall back to keyword matching
                this._keywordProvider.getTips(context, query)
            );
    }
}

export default EmbeddingTipProvider;
