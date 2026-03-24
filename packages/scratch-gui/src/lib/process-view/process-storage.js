/**
 * ProcessStorage — IndexedDB wrapper for process view data.
 *
 * Stores sessions, events, and chunks for creative-history recording.
 * Uses raw IndexedDB API (no external dependency).
 */

const DB_VERSION = 1;

const openDB = (projectId) => new Promise((resolve, reject) => {
    const dbName = `scratch-process-${projectId || 'local'}`;
    const request = indexedDB.open(dbName, DB_VERSION);

    request.onupgradeneeded = e => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains('sessions')) {
            db.createObjectStore('sessions', {keyPath: 'id'});
        }

        if (!db.objectStoreNames.contains('events')) {
            const eventStore = db.createObjectStore('events', {keyPath: 'id'});
            eventStore.createIndex('sessionId', 'sessionId', {unique: false});
            eventStore.createIndex('timestamp', 'timestamp', {unique: false});
            eventStore.createIndex('type', 'type', {unique: false});
            eventStore.createIndex('sessionId_timestamp', ['sessionId', 'timestamp'], {unique: false});
        }

        if (!db.objectStoreNames.contains('chunks')) {
            const chunkStore = db.createObjectStore('chunks', {keyPath: 'id'});
            chunkStore.createIndex('sessionId', 'sessionId', {unique: false});
        }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const txPromise = (store, method, ...args) => new Promise((resolve, reject) => {
    const request = store[method](...args);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const getAllFromIndex = (store, indexName, value) => new Promise((resolve, reject) => {
    const index = store.index(indexName);
    const request = index.getAll(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

class ProcessStorage {
    constructor (projectId) {
        this.projectId = projectId || 'local';
        this._db = null;
    }

    async _getDB () {
        if (!this._db) {
            this._db = await openDB(this.projectId);
        }
        return this._db;
    }

    // Sessions

    async createSession (session) {
        const db = await this._getDB();
        const tx = db.transaction('sessions', 'readwrite');
        await txPromise(tx.objectStore('sessions'), 'put', session);
    }

    async updateSession (id, updates) {
        const db = await this._getDB();
        const tx = db.transaction('sessions', 'readwrite');
        const store = tx.objectStore('sessions');
        const existing = await txPromise(store, 'get', id);
        if (existing) {
            const updated = Object.assign({}, existing, updates);
            await txPromise(store, 'put', updated);
        }
    }

    async getSessions () {
        const db = await this._getDB();
        const tx = db.transaction('sessions', 'readonly');
        const sessions = await txPromise(tx.objectStore('sessions'), 'getAll');
        return sessions.sort((a, b) => a.startTime - b.startTime);
    }

    async getSession (id) {
        const db = await this._getDB();
        const tx = db.transaction('sessions', 'readonly');
        return txPromise(tx.objectStore('sessions'), 'get', id);
    }

    // Events

    async addEvent (event) {
        const db = await this._getDB();
        const tx = db.transaction('events', 'readwrite');
        await txPromise(tx.objectStore('events'), 'put', event);
    }

    async addEvents (events) {
        const db = await this._getDB();
        const tx = db.transaction('events', 'readwrite');
        const store = tx.objectStore('events');
        for (const event of events) {
            store.put(event);
        }
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getEventsForSession (sessionId) {
        const db = await this._getDB();
        const tx = db.transaction('events', 'readonly');
        const events = await getAllFromIndex(tx.objectStore('events'), 'sessionId', sessionId);
        return events.sort((a, b) => a.timestamp - b.timestamp);
    }

    async getEventsByType (type) {
        const db = await this._getDB();
        const tx = db.transaction('events', 'readonly');
        return getAllFromIndex(tx.objectStore('events'), 'type', type);
    }

    // Chunks

    async saveChunks (chunks) {
        const db = await this._getDB();
        const tx = db.transaction('chunks', 'readwrite');
        const store = tx.objectStore('chunks');
        for (const chunk of chunks) {
            store.put(chunk);
        }
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getChunksForSession (sessionId) {
        const db = await this._getDB();
        const tx = db.transaction('chunks', 'readonly');
        const chunks = await getAllFromIndex(tx.objectStore('chunks'), 'sessionId', sessionId);
        return chunks.sort((a, b) => a.startTime - b.startTime);
    }

    // Snapshots (convenience — just events with type "project_snapshot")

    async getProjectSnapshots (sessionId) {
        const db = await this._getDB();
        const tx = db.transaction('events', 'readonly');
        let events;
        if (sessionId) {
            events = await getAllFromIndex(tx.objectStore('events'), 'sessionId', sessionId);
            events = events.filter(e => e.type === 'project_snapshot');
        } else {
            events = await getAllFromIndex(tx.objectStore('events'), 'type', 'project_snapshot');
        }
        return events.sort((a, b) => a.timestamp - b.timestamp);
    }

    async getClosestSnapshot (timestamp) {
        const snapshots = await this.getProjectSnapshots();
        if (snapshots.length === 0) return null;

        let closest = snapshots[0];
        let minDiff = Math.abs(timestamp - closest.timestamp);
        for (let i = 1; i < snapshots.length; i++) {
            const diff = Math.abs(timestamp - snapshots[i].timestamp);
            if (diff < minDiff) {
                closest = snapshots[i];
                minDiff = diff;
            }
        }
        return closest;
    }

    // Cleanup

    async deleteSession (id) {
        const db = await this._getDB();

        // Delete events for this session
        const eventTx = db.transaction('events', 'readwrite');
        const eventStore = eventTx.objectStore('events');
        const events = await getAllFromIndex(eventStore, 'sessionId', id);
        for (const event of events) {
            eventStore.delete(event.id);
        }

        // Delete chunks for this session
        const chunkTx = db.transaction('chunks', 'readwrite');
        const chunkStore = chunkTx.objectStore('chunks');
        const chunks = await getAllFromIndex(chunkStore, 'sessionId', id);
        for (const chunk of chunks) {
            chunkStore.delete(chunk.id);
        }

        // Delete the session
        const sessionTx = db.transaction('sessions', 'readwrite');
        await txPromise(sessionTx.objectStore('sessions'), 'delete', id);
    }

    async getStorageSize () {
        // Approximate: count all records and estimate sizes
        const db = await this._getDB();
        let totalRecords = 0;
        for (const storeName of ['sessions', 'events', 'chunks']) {
            const tx = db.transaction(storeName, 'readonly');
            const count = await txPromise(tx.objectStore(storeName), 'count');
            totalRecords += count;
        }
        return totalRecords; // Returns count; true byte estimation requires reading all data
    }

    close () {
        if (this._db) {
            this._db.close();
            this._db = null;
        }
    }
}

export default ProcessStorage;
