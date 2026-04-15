/**
 * Embedding-based tip provider using a sentence embedding model in a Web Worker.
 * Falls back to KeywordTipProvider when the model isn't ready.
 *
 * Tip embeddings are pre-computed at build time (see scripts/generate-tip-embeddings.mjs)
 * and loaded from a checked-in cache file. The worker only needs to embed user queries
 * at runtime. If the cache is missing or stale, falls back to computing embeddings
 * in the worker.
 */
import embeddingCache from '../libraries/tips/embeddings-cache.json';
import {createHash} from './embedding-hash.js';
import {buildTipDocument} from './tip-document.js';

class EmbeddingTipProvider {
    constructor (tips, keywordProvider) {
        this.tips = tips;
        this._keywordProvider = keywordProvider;
        this._ready = false;
        this._pendingQueries = new Map(); // id -> {resolve, reject}
        this._queryId = 0;

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
        this._cachedDocs = null;
        this._cachedEmbeddings = null;
        if (embeddingCache && embeddingCache.docs && embeddingCache.embeddings) {
            const currentHash = createHash(
                embeddingCache.modelName,
                embeddingCache.modelDtype,
                this._tipDocs
            );
            if (currentHash === embeddingCache.contentHash) {
                this._cachedDocs = embeddingCache.docs;
                this._cachedEmbeddings = embeddingCache.embeddings;
            } else {
                console.warn(
                    '[EmbeddingTipProvider] Cache content hash mismatch — will compute embeddings at runtime'
                );
            }
        }

        this._initWorker();
    }

    _initWorker () {
        try {
            // Load the standalone worker file (copied to build output, not bundled by webpack).
            // Must be type: 'module' so the worker can use dynamic import() for the CDN library.
            this._worker = new Worker('/static/embedding-worker.js', {type: 'module'});
        } catch (e) {
            console.warn('[EmbeddingTipProvider] Worker creation failed, using keyword fallback', e);
            return;
        }

        this._worker.onmessage = event => {
            const {type} = event.data;

            if (type === 'ready') {
                if (this._cachedDocs && this._cachedEmbeddings) {
                    console.log('[EmbeddingTipProvider] Model loaded, using cached tip embeddings');
                    this._worker.postMessage({
                        type: 'load-cached-embeddings',
                        docs: this._cachedDocs,
                        embeddings: this._cachedEmbeddings
                    });
                } else {
                    console.log('[EmbeddingTipProvider] Model loaded, computing tip embeddings at runtime...');
                    this._worker.postMessage({
                        type: 'embed-tips',
                        docs: this._tipDocs
                    });
                }
            } else if (type === 'tips-ready') {
                console.log('[EmbeddingTipProvider] Tips embedded, switching to semantic matching');
                this._ready = true;
            } else if (type === 'results') {
                const pending = this._pendingQueries.get(event.data.queryId);
                if (pending) {
                    this._pendingQueries.delete(event.data.queryId);
                    pending.resolve(event.data.results);
                }
            } else if (type === 'error') {
                console.warn(`[EmbeddingTipProvider] Worker error: ${event.data.message}`);
                // Resolve any pending queries via fallback
                for (const [id, pending] of this._pendingQueries) {
                    this._pendingQueries.delete(id);
                    pending.reject(new Error(event.data.message));
                }
            }
        };

        this._worker.onerror = error => {
            console.warn('[EmbeddingTipProvider] Worker onerror:', error.message || error);
            this._ready = false;
        };

        this._worker.postMessage({type: 'init'});
    }

    /**
     * Get matching tips for a query.
     * Falls back to keyword matching if the embedding model isn't ready.
     * @param {object} context - Project context from extractProjectContext
     * @param {string} query - The user's question
     * @returns {Promise<Array<{tipId: string, score: number}>>} Ranked results
     */
    getTips (context, query) {
        if (!this._ready || !this._worker) {
            return this._keywordProvider.getTips(context, query);
        }

        const queryId = this._queryId++;

        return new Promise((resolve, reject) => {
            this._pendingQueries.set(queryId, {resolve, reject});

            this._worker.postMessage({
                type: 'embed-query',
                query,
                queryId
            });
        }).catch(() =>
            // On any worker error, fall back to keyword matching
            this._keywordProvider.getTips(context, query)
        );
    }

    dispose () {
        if (this._worker) {
            this._worker.terminate();
            this._worker = null;
        }
        this._ready = false;
    }
}

export default EmbeddingTipProvider;
