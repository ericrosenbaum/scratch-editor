const SCHEMA_VERSION = 1;
const FLUSH_BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 5000;
const SESSION_STORAGE_KEY = 'scratch-tips-analytics-session';
const OPT_OUT_KEY = 'scratch-tips-analytics-optout';

const ENDPOINT = (typeof process !== 'undefined' && process.env && process.env.TIPS_ANALYTICS_ENDPOINT) || null;
const SECRET = (typeof process !== 'undefined' && process.env && process.env.TIPS_ANALYTICS_SECRET) || null;
const BEACON_URL = ENDPOINT && SECRET ?
    `${ENDPOINT}${ENDPOINT.includes('?') ? '&' : '?'}s=${encodeURIComponent(SECRET)}` :
    ENDPOINT;

const queue = [];
let flushTimer = null;
let installed = false;
let cachedSessionId = null;

const generateSessionId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `sess-${Date.now().toString(36)}-${Math.random().toString(36)
        .slice(2, 10)}`;
};

const getSessionId = () => {
    if (cachedSessionId) return cachedSessionId;
    if (typeof window === 'undefined' || !window.sessionStorage) {
        cachedSessionId = generateSessionId();
        return cachedSessionId;
    }
    let id = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!id) {
        id = generateSessionId();
        try {
            window.sessionStorage.setItem(SESSION_STORAGE_KEY, id);
        } catch (_e) { /* ignore quota / private mode */ }
    }
    cachedSessionId = id;
    return id;
};

const isOptedOut = () => {
    try {
        return window.localStorage && window.localStorage.getItem(OPT_OUT_KEY) === '1';
    } catch (_e) {
        return false;
    }
};

const buildHeaders = () => {
    const headers = {'Content-Type': 'application/json'};
    if (SECRET) headers['X-Tips-Secret'] = SECRET;
    return headers;
};

const send = (events, useBeacon) => {
    if (!ENDPOINT || events.length === 0) return Promise.resolve();
    const body = JSON.stringify({sessionId: getSessionId(), events});
    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
        try {
            const blob = new Blob([body], {type: 'application/json'});
            navigator.sendBeacon(BEACON_URL, blob);
        } catch (_e) { /* swallow */ }
        return Promise.resolve();
    }
    return fetch(ENDPOINT, {
        method: 'POST',
        headers: buildHeaders(),
        body,
        keepalive: true
    }).catch(() => new Promise(resolve => setTimeout(resolve, 500))
        .then(() => fetch(ENDPOINT, {
            method: 'POST',
            headers: buildHeaders(),
            body,
            keepalive: true
        }))
        .catch(() => null));
};

const flush = useBeacon => {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    if (queue.length === 0) return;
    const batch = queue.splice(0, queue.length);
    send(batch, useBeacon);
};

const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        flush(false);
    }, FLUSH_INTERVAL_MS);
};

const install = () => {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush(true);
    });
    window.addEventListener('pagehide', () => flush(true));
    window.addEventListener('beforeunload', () => flush(true));
};

const track = (event, props) => {
    install();
    if (isOptedOut()) return;
    const payload = {
        schemaVersion: SCHEMA_VERSION,
        ts: Date.now(),
        event,
        props: props || {}
    };
    // eslint-disable-next-line no-console
    console.debug('[tips-analytics]', event, payload.props);
    if (!ENDPOINT) return;
    queue.push(payload);
    if (queue.length >= FLUSH_BATCH_SIZE) {
        flush(false);
    } else {
        scheduleFlush();
    }
    // TODO: hook to telemetry-modal opt-out
};

export {track, flush, getSessionId};
export default {track, flush, getSessionId};
