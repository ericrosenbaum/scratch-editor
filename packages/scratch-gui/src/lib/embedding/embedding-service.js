/**
 * Singleton wrapper around the shared EmbeddingGemma Web Worker.
 *
 * Owns exactly one Worker instance for the whole editor. Both the tips
 * "unstuck" feature and the Q+A extension go through this service so the
 * model is loaded once.
 *
 * Public API:
 *   warmUp()                            - idempotent, kicks off model load
 *   findMostSimilar(query, candidates)  - generic similarity search
 *   loadTipCorpus(docs, cachedEmbeds)   - tips-specific (used by provider)
 *   queryTips(query)                    - tips-specific (used by provider)
 *   isReady()                           - true once the model is loaded
 */

class EmbeddingService {
    constructor () {
        this._worker = null;
        this._ready = false;
        this._warmUpPromise = null;

        this._tipsReady = false;
        this._tipsReadyResolvers = [];

        this._pendingTipQueries = new Map();
        this._tipQueryId = 0;

        this._pendingMatchRequests = new Map();
        this._matchRequestId = 0;
    }

    warmUp () {
        if (this._warmUpPromise) return this._warmUpPromise;

        this._warmUpPromise = new Promise((resolve, reject) => {
            try {
                this._worker = new Worker('/static/embedding-worker.js', {type: 'module'});
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn('[EmbeddingService] Worker creation failed', e);
                reject(e);
                return;
            }

            this._worker.onmessage = event => {
                this._handleMessage(event, resolve, reject);
            };
            this._worker.onerror = error => {
                // eslint-disable-next-line no-console
                console.warn('[EmbeddingService] Worker onerror:', error.message || error);
            };

            this._worker.postMessage({type: 'init'});
        });

        return this._warmUpPromise;
    }

    _handleMessage (event, initResolve, initReject) {
        const {type} = event.data;

        if (type === 'ready') {
            this._ready = true;
            if (initResolve) initResolve();
        } else if (type === 'tips-ready') {
            this._tipsReady = true;
            const resolvers = this._tipsReadyResolvers.slice();
            this._tipsReadyResolvers.length = 0;
            for (const r of resolvers) r();
        } else if (type === 'results') {
            const pending = this._pendingTipQueries.get(event.data.queryId);
            if (pending) {
                this._pendingTipQueries.delete(event.data.queryId);
                pending.resolve(event.data.results);
            }
        } else if (type === 'match-result') {
            const pending = this._pendingMatchRequests.get(event.data.requestId);
            if (pending) {
                this._pendingMatchRequests.delete(event.data.requestId);
                pending.resolve(event.data.match);
            }
        } else if (type === 'match-error') {
            const pending = this._pendingMatchRequests.get(event.data.requestId);
            if (pending) {
                this._pendingMatchRequests.delete(event.data.requestId);
                pending.reject(new Error(event.data.message));
            }
        } else if (type === 'error') {
            // eslint-disable-next-line no-console
            console.warn(`[EmbeddingService] Worker error: ${event.data.message}`);
            if (initReject && !this._ready) initReject(new Error(event.data.message));
            for (const [id, pending] of this._pendingTipQueries) {
                this._pendingTipQueries.delete(id);
                pending.reject(new Error(event.data.message));
            }
        }
    }

    isReady () {
        return this._ready;
    }

    /**
     * Generic similarity search. Embeds the query plus each candidate and
     * returns the candidate string with the highest cosine similarity.
     * @param {string} query
     * @param {string[]} candidates
     * @returns {Promise<string|null>}
     */
    findMostSimilar (query, candidates) {
        if (!this._worker) {
            return Promise.reject(new Error('Embedding worker not initialized'));
        }
        if (!Array.isArray(candidates) || candidates.length === 0) {
            return Promise.resolve(null);
        }

        const requestId = this._matchRequestId++;
        return this.warmUp().then(() => new Promise((resolve, reject) => {
            this._pendingMatchRequests.set(requestId, {resolve, reject});
            this._worker.postMessage({
                type: 'embed-and-match',
                requestId,
                query,
                candidates
            });
        }));
    }

    /**
     * Load a pre-embedded or to-be-embedded tip corpus into the worker.
     * Used only by EmbeddingTipProvider.
     * @param {Array<{id:string, tipId:string, text:string}>} docs
     * @param {Array<Array<number>>|null} cachedEmbeddings
     * @returns {Promise<void>} resolves when the corpus is loaded in the worker
     */
    loadTipCorpus (docs, cachedEmbeddings) {
        return this.warmUp().then(() => new Promise(resolve => {
            if (this._tipsReady) {
                resolve();
                return;
            }
            this._tipsReadyResolvers.push(resolve);

            if (cachedEmbeddings) {
                this._worker.postMessage({
                    type: 'load-cached-embeddings',
                    docs,
                    embeddings: cachedEmbeddings
                });
            } else {
                this._worker.postMessage({
                    type: 'embed-tips',
                    docs
                });
            }
        }));
    }

    /**
     * Query the loaded tip corpus. Must be called after loadTipCorpus resolves.
     * @param {string} query
     * @returns {Promise<Array<{tipId:string, score:number}>>}
     */
    queryTips (query) {
        if (!this._worker || !this._tipsReady) {
            return Promise.reject(new Error('Tip corpus not loaded'));
        }
        const queryId = this._tipQueryId++;
        return new Promise((resolve, reject) => {
            this._pendingTipQueries.set(queryId, {resolve, reject});
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
        this._tipsReady = false;
        this._warmUpPromise = null;
    }
}

const embeddingService = new EmbeddingService();
export default embeddingService;
