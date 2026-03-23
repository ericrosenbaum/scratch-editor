/**
 * Embedding-based tip provider using a sentence embedding model in a Web Worker.
 * Falls back to KeywordTipProvider when the model isn't ready.
 */
import {scoreContext} from './tip-provider.js';

class EmbeddingTipProvider {
    constructor (tips, keywordProvider) {
        this.tips = tips;
        this._keywordProvider = keywordProvider;
        this._ready = false;
        this._pendingQueries = new Map(); // id -> {resolve, reject}
        this._queryId = 0;

        // Prepare tip texts for embedding: combine text + keywords + tags
        this._tipTexts = Object.keys(tips).map(tipId => ({
            id: tipId,
            text: [
                tips[tipId].text,
                (tips[tipId].relevance && tips[tipId].relevance.keywords
                    ? tips[tipId].relevance.keywords.join(' ') : ''),
                (tips[tipId].tags ? tips[tipId].tags.join(' ') : '')
            ].join(' ')
        }));

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
                console.log('[EmbeddingTipProvider] Model loaded, embedding tips...');
                this._worker.postMessage({
                    type: 'embed-tips',
                    tips: this._tipTexts
                });
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

        // Compute context scores on the main thread
        // Set to false to disable context boosting and use pure embedding similarity
        const useContextScores = false;
        const contextScores = {};
        if (useContextScores) {
            for (const tipId in this.tips) {
                const score = scoreContext(this.tips[tipId], context);
                if (score > 0) {
                    contextScores[tipId] = score;
                }
            }
        }

        const queryId = this._queryId++;

        return new Promise((resolve, reject) => {
            this._pendingQueries.set(queryId, {resolve, reject});

            this._worker.postMessage({
                type: 'embed-query',
                query,
                contextScores,
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
