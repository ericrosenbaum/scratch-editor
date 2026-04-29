const log = require('../../util/log');

const SEND_INTERVAL_MS = 100;
const MAX_RECONNECT_BACKOFF_STEPS = 5;

class LocalNetworkProvider {
    constructor (host, room, peerName, hooks) {
        this.host = host;
        this.room = room;
        this.peerName = peerName;
        this.hooks = hooks || {};

        this.connection = null;
        this._connectionAttempts = 0;
        this._closed = false;
        this._queued = [];
        this._lastSendAt = 0;
        this._sendTimer = null;
        this._reconnectTimer = null;

        this.openConnection();
    }

    openConnection () {
        this._connectionAttempts += 1;
        try {
            const protocol = (typeof location !== 'undefined' && location.protocol === 'http:') ? 'ws://' : 'wss://';
            this.connection = new WebSocket(`${protocol}${this.host}`);
        } catch (e) {
            log.warn('LocalNetwork: WebSocket not available', e);
            this.connection = null;
            return;
        }
        this.connection.onerror = this._onError.bind(this);
        this.connection.onopen = this._onOpen.bind(this);
        this.connection.onmessage = this._onMessage.bind(this);
        this.connection.onclose = this._onClose.bind(this);
    }

    _onError (event) {
        log.error(`LocalNetwork: websocket error: ${JSON.stringify(event && event.message)}`);
    }

    _onOpen () {
        this._connectionAttempts = 1;
        this._writeNow({method: 'join', room: this.room, peer: this.peerName});
        // Drain anything queued while we were connecting.
        const drain = this._queued;
        this._queued = [];
        drain.forEach(line => this._writeNow(line));
        log.info('LocalNetwork: joined room', this.room, 'as', this.peerName);
    }

    _onClose () {
        if (this._closed) return;
        const delay = this._reconnectDelay();
        log.info(`LocalNetwork: reconnecting in ${(delay / 1000).toFixed(1)}s`);
        this._reconnectTimer = setTimeout(this.openConnection.bind(this), delay);
    }

    _reconnectDelay () {
        const steps = Math.min(this._connectionAttempts, MAX_RECONNECT_BACKOFF_STEPS);
        return Math.random() * (Math.pow(2, steps) - 1) * 1000;
    }

    _onMessage (event) {
        const text = event.data;
        if (!text) return;
        text.split('\n').forEach(line => {
            if (!line) return;
            let msg;
            try {
                msg = JSON.parse(line);
            } catch {
                log.warn('LocalNetwork: bad message', line);
                return;
            }
            switch (msg.method) {
            case 'broadcast':
                if (this.hooks.onBroadcast) this.hooks.onBroadcast(msg);
                break;
            case 'setvar':
                if (this.hooks.onSetVar) this.hooks.onSetVar(msg);
                break;
            case 'snapshot':
                if (this.hooks.onSnapshot) this.hooks.onSnapshot(msg);
                break;
            default:
                break;
            }
        });
    }

    sendBroadcast (name) {
        this._enqueue({method: 'broadcast', name});
    }

    setSharedVar (name, value) {
        this._enqueue({method: 'setvar', name, value});
    }

    isOpen () {
        return !!(this.connection && this.connection.readyState === WebSocket.OPEN);
    }

    requestCloseConnection () {
        this._closed = true;
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this._sendTimer) {
            clearTimeout(this._sendTimer);
            this._sendTimer = null;
        }
        if (this.connection &&
            this.connection.readyState !== WebSocket.CLOSING &&
            this.connection.readyState !== WebSocket.CLOSED) {
            this.connection.onclose = () => {};
            this.connection.onerror = () => {};
            this.connection.close();
        }
        this.connection = null;
        this._queued = [];
    }

    _enqueue (msg) {
        this._queued.push(msg);
        this._scheduleFlush();
    }

    _scheduleFlush () {
        if (this._sendTimer) return;
        const since = Date.now() - this._lastSendAt;
        const delay = Math.max(0, SEND_INTERVAL_MS - since);
        this._sendTimer = setTimeout(() => {
            this._sendTimer = null;
            this._flush();
        }, delay);
    }

    _flush () {
        if (!this.isOpen()) {
            // Can't send yet; will be drained when the socket opens.
            return;
        }
        const next = this._queued.shift();
        if (!next) return;
        this._writeNow(next);
        this._lastSendAt = Date.now();
        if (this._queued.length > 0) this._scheduleFlush();
    }

    _writeNow (msg) {
        if (!this.connection || this.connection.readyState !== WebSocket.OPEN) {
            this._queued.unshift(msg);
            return;
        }
        try {
            this.connection.send(`${JSON.stringify(msg)}\n`);
        } catch (e) {
            log.warn('LocalNetwork: send failed', e);
        }
    }
}

module.exports = LocalNetworkProvider;
