/**
 * Embedding-based tip provider using a sentence embedding model in a Web Worker.
 *
 * Tip embeddings are pre-computed at build time (see scripts/generate-tip-embeddings.mjs)
 * and loaded from a checked-in cache file. The worker only needs to embed user queries
 * at runtime. If the cache is missing or stale, the worker computes embeddings at runtime.
 *
 * Queries submitted before the model is ready are queued and processed once it is.
 * `provider.ready` is a Promise that resolves when the model is loaded and tips are
 * embedded, or rejects if initialization fails.
 */
import embeddingCache from '../libraries/tips/embeddings-cache.json';
import {createHash} from './embedding-hash.js';
import {buildTipDocument} from './tip-document.js';

class EmbeddingTipProvider {
    constructor (tips) {
        this.tips = tips;
        this._ready = false;
        this._pendingQueries = new Map(); // id -> {resolve, reject}
        this._queryId = 0;

        this._readyPromise = new Promise((resolve, reject) => {
            this._readyResolve = resolve;
            this._readyReject = reject;
        });
        // Avoid noisy unhandled-rejection warnings if no consumer attaches a handler.
        this._readyPromise.catch(() => {});

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

    /**
     * Promise that resolves once the model is loaded and tip embeddings are
     * ready, or rejects if initialization fails.
     */
    get ready () {
        return this._readyPromise;
    }

    _initWorker () {
        try {
            // Load the standalone worker file (copied to build output, not bundled by webpack).
            // Must be type: 'module' so the worker can use dynamic import() for the CDN library.
            // Resolve against document.baseURI so the path works under non-root deployments
            // (e.g. gh-pages serves under /scratch-editor/tips/scratch-gui/).
            const workerUrl = new URL('static/embedding-worker.js', document.baseURI);
            this._worker = new Worker(workerUrl, {type: 'module'});
        } catch (e) {
            console.error('[EmbeddingTipProvider] Worker creation failed', e);
            this._readyReject(e);
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
                console.log('[EmbeddingTipProvider] Tips embedded, ready for queries');
                this._ready = true;
                this._readyResolve();
            } else if (type === 'results') {
                const pending = this._pendingQueries.get(event.data.queryId);
                if (pending) {
                    this._pendingQueries.delete(event.data.queryId);
                    pending.resolve(event.data.results);
                }
            } else if (type === 'error') {
                const message = event.data.message;
                console.error(`[EmbeddingTipProvider] Worker error: ${message}`);
                if (!this._ready) {
                    this._readyReject(new Error(message));
                }
                for (const [id, pending] of this._pendingQueries) {
                    this._pendingQueries.delete(id);
                    pending.reject(new Error(message));
                }
            }
        };

        this._worker.onerror = error => {
            const message = error.message || 'Worker failed to load';
            console.error('[EmbeddingTipProvider] Worker onerror:', message);
            if (!this._ready) {
                this._readyReject(new Error(message));
            }
        };

        this._worker.postMessage({type: 'init'});
    }

    /**
     * Get matching tips for a query. Awaits model readiness before submitting.
     * @param {object} _context - Project context (unused; reserved for future use)
     * @param {string} query - The user's question
     * @returns {Promise<Array<{tipId: string, score: number}>>} Ranked results
     */
    async getTips (_context, query) {
        await this._readyPromise;

        const queryId = this._queryId++;
        return new Promise((resolve, reject) => {
            this._pendingQueries.set(queryId, {resolve, reject});
            this._worker.postMessage({
                type: 'embed-query',
                query,
                queryId
            });
        });
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
