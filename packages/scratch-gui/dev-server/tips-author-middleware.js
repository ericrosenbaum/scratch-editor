/**
 * Dev-server-only middleware that lets the tips authoring tool write
 * tips.json directly to disk.
 *
 * Only wired up in webpack.config.js when NODE_ENV is not production.
 * Refuses any request that isn't localhost and any write target outside
 * the fixed path.
 */
const fs = require('fs');
const path = require('path');

const TIPS_JSON_PATH = path.resolve(
    __dirname, '..', 'src', 'lib', 'libraries', 'tips', 'tips.json'
);

const isLocalhost = function (req) {
    const addr = req.socket && (req.socket.remoteAddress || '');
    return (
        addr === '127.0.0.1' ||
        addr === '::1' ||
        addr === '::ffff:127.0.0.1'
    );
};

const readJsonBody = function (req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', chunk => {
            raw += chunk;
            if (raw.length > 20 * 1024 * 1024) {
                reject(new Error('Request body too large'));
                req.destroy();
            }
        });
        req.on('end', () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
};

const writeJsonAtomic = function (absPath, value) {
    const tmpPath = `${absPath}.tips-author.tmp`;
    const serialized = `${JSON.stringify(value, null, 4)}\n`;
    fs.writeFileSync(tmpPath, serialized, 'utf8');
    fs.renameSync(tmpPath, absPath);
};

const sendJson = function (res, status, payload) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
};

const handleSave = async function (req, res) {
    if (!isLocalhost(req)) {
        sendJson(res, 403, {error: 'Forbidden: non-local request'});
        return;
    }
    let body;
    try {
        body = await readJsonBody(req);
    } catch (e) {
        sendJson(res, 400, {error: `Invalid JSON body: ${e.message}`});
        return;
    }
    if (!body.tips) {
        sendJson(res, 400, {error: 'No tips in payload'});
        return;
    }
    if (!body.tips.tips || typeof body.tips.tips !== 'object') {
        sendJson(res, 400, {error: 'tips payload must have a .tips object'});
        return;
    }
    try {
        writeJsonAtomic(TIPS_JSON_PATH, body.tips);
        sendJson(res, 200, {ok: true, written: ['tips.json']});
    } catch (e) {
        sendJson(res, 500, {error: `Write failed: ${e.message}`});
    }
};

const handleRead = function (req, res) {
    if (!isLocalhost(req)) {
        sendJson(res, 403, {error: 'Forbidden: non-local request'});
        return;
    }
    try {
        const tipsRaw = fs.readFileSync(TIPS_JSON_PATH, 'utf8');
        sendJson(res, 200, {tips: JSON.parse(tipsRaw)});
    } catch (e) {
        sendJson(res, 500, {error: `Read failed: ${e.message}`});
    }
};

const tipsAuthorMiddleware = function (req, res, next) {
    if (!req.url || !req.url.startsWith('/__tips-author/')) {
        return next();
    }
    if (req.url === '/__tips-author/save' && req.method === 'POST') {
        handleSave(req, res);
        return;
    }
    if (req.url === '/__tips-author/read' && req.method === 'GET') {
        handleRead(req, res);
        return;
    }
    sendJson(res, 404, {error: 'Unknown tips-author endpoint'});
};

module.exports = tipsAuthorMiddleware;
module.exports.TIPS_JSON_PATH = TIPS_JSON_PATH;
