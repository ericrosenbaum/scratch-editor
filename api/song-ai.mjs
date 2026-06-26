// Serverless proxy for the Song Maker's Claude (Anthropic) calls.
//
// Why this exists: the Song Maker is a static front-end. Calling api.anthropic.com
// directly from the browser would require shipping the API key in the JS bundle,
// where anyone could extract it. This proxy keeps the key server-side and gates
// access for a class/workshop:
//   - a shared ACCESS_CODE (constant-time compare)
//   - a hard global daily request cap + a per-IP rate limit (via KV)
//   - a server-side model + max_tokens allow-list (bounds per-call cost)
//   - CORS locked to the deployed site origin
//
// Deploy target: Vercel (auto-maps api/*.js -> /api/song-ai). The matching
// front-end change is src/lib/song-ai/providers/anthropic.js (proxy mode).
//
// Required runtime env (set as Project env vars on Vercel):
//   SONG_AI_ANTHROPIC_KEY  the real Anthropic key (server-side only).
//       NOTE: deliberately NOT named ANTHROPIC_API_KEY. Vercel exposes project
//       env vars to the BUILD too, and webpack's DefinePlugin bakes
//       process.env.ANTHROPIC_API_KEY into the client bundle if present — that
//       would leak the key. This name is never referenced by the build, so the
//       key stays server-side. Do NOT set ANTHROPIC_API_KEY on Vercel.
//   ACCESS_CODE         the shared workshop code testers enter once.
// Recommended runtime env:
//   ALLOWED_ORIGIN      only needed if the site is hosted on a DIFFERENT origin
//                       than this function. With the front-end built to call the
//                       relative path /api/song-ai (same origin), CORS is moot
//                       and this can be left unset. Comma-separated list allowed.
//   DAILY_REQUEST_CAP   hard ceiling on successful requests per day (default 500)
//   PER_IP_PER_MIN      per-IP requests per minute (default 10)
//   KV_REST_API_URL / KV_REST_API_TOKEN  auto-injected when you attach Vercel KV.
//
// Cost ceiling = DAILY_REQUEST_CAP × MAX_TOKENS output × (model output price).
// With Haiku forced on the client and a 500/day cap that worst case is small;
// pick DAILY_REQUEST_CAP from your dollar budget.

import crypto from 'node:crypto';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOKENS = 8192; // mirrors the client (anthropic.js)
const ALLOWED_MODELS = new Set(['claude-haiku-4-5', 'claude-opus-4-7']);

const num = (val, fallback) => {
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Length-safe constant-time string compare.
const safeEqual = (a, b) => {
    const ab = Buffer.from(String(a || ''));
    const bb = Buffer.from(String(b || ''));
    if (ab.length !== bb.length) {
        // Compare against self to keep timing roughly constant, then fail.
        crypto.timingSafeEqual(ab, ab);
        return false;
    }
    return crypto.timingSafeEqual(ab, bb);
};

const clientIp = req => {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
};

// Today's date as YYYY-MM-DD in UTC, for the daily counter key.
const utcDay = () => new Date().toISOString().slice(0, 10);

const kvConfigured = () =>
    Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

// Run a single Upstash/Vercel-KV REST pipeline (array of command arrays).
// Returns the array of {result} objects.
const kvPipeline = async commands => {
    const resp = await fetch(`${process.env.KV_REST_API_URL}/pipeline`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
            'content-type': 'application/json'
        },
        body: JSON.stringify(commands)
    });
    if (!resp.ok) throw new Error(`KV ${resp.status}`);
    return resp.json();
};

// INCR a counter and (re)set a TTL. Returns the post-increment count.
const bumpCounter = async (key, ttlSeconds) => {
    const out = await kvPipeline([['INCR', key], ['EXPIRE', key, String(ttlSeconds)]]);
    return Number(out[0]?.result);
};

const setCors = (req, res) => {
    const allowList = (process.env.ALLOWED_ORIGIN || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    const origin = req.headers.origin;
    if (origin && allowList.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    // If ALLOWED_ORIGIN is unset we emit no ACAO header: same-origin requests
    // (the common case — site + function share a Vercel domain) still work,
    // cross-origin browser requests are blocked. That's the safe default.
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-access-code');
};

const sendJson = (res, status, obj) => {
    res.status(status);
    res.setHeader('content-type', 'application/json');
    res.send(JSON.stringify(obj));
};

export default async function handler (req, res) {
    setCors(req, res);

    if (req.method === 'OPTIONS') {
        res.status(204);
        res.end();
        return;
    }
    if (req.method !== 'POST') {
        sendJson(res, 405, {error: 'Method not allowed'});
        return;
    }

    const expectedCode = process.env.ACCESS_CODE;
    const apiKey = process.env.SONG_AI_ANTHROPIC_KEY;
    if (!expectedCode || !apiKey) {
        // Misconfiguration — never silently fall through to Anthropic.
        sendJson(res, 500, {error: 'Server is not configured.'});
        return;
    }

    // 1. Access code (constant-time).
    if (!safeEqual(req.headers['x-access-code'], expectedCode)) {
        sendJson(res, 401, {error: 'Invalid or missing access code.'});
        return;
    }

    // 2. Validate + allow-list the request body.
    let body = req.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch (e) {
            sendJson(res, 400, {error: 'Invalid JSON body.'});
            return;
        }
    }
    if (!body || typeof body !== 'object') {
        sendJson(res, 400, {error: 'Missing request body.'});
        return;
    }
    if (!ALLOWED_MODELS.has(body.model)) {
        sendJson(res, 400, {error: 'Unsupported model.'});
        return;
    }
    const forwardBody = {
        model: body.model,
        max_tokens: Math.min(num(body.max_tokens, MAX_TOKENS), MAX_TOKENS),
        system: body.system,
        tools: body.tools,
        tool_choice: body.tool_choice,
        messages: body.messages
    };

    // 3. Rate limit + hard daily spend cap (KV). Checked BEFORE forwarding.
    if (kvConfigured()) {
        const dailyCap = num(process.env.DAILY_REQUEST_CAP, 500);
        const perIpPerMin = num(process.env.PER_IP_PER_MIN, 10);
        const minuteBucket = Math.floor(Date.now() / 60000);

        // Per-IP limiter: fail OPEN (availability) if KV errors.
        try {
            const ipCount = await bumpCounter(`songai:ip:${clientIp(req)}:${minuteBucket}`, 120);
            if (ipCount > perIpPerMin) {
                sendJson(res, 429, {error: 'Too many requests, slow down a moment.', code: 'RATE'});
                return;
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('song-ai proxy: per-IP KV check failed, allowing:', e.message);
        }

        // Global daily cap: fail CLOSED (cost protection) if KV errors.
        try {
            const dayCount = await bumpCounter(`songai:count:${utcDay()}`, 172800);
            if (dayCount > dailyCap) {
                sendJson(res, 429, {error: 'Daily usage limit reached. Try again later.', code: 'CAP'});
                return;
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('song-ai proxy: daily-cap KV check failed, blocking:', e.message);
            sendJson(res, 429, {error: 'Usage limit check unavailable. Try again later.', code: 'CAP'});
            return;
        }
    } else {
        // eslint-disable-next-line no-console
        console.warn('song-ai proxy: KV not configured — NO spend cap is active. ' +
            'Attach Vercel KV and set DAILY_REQUEST_CAP before a real workshop.');
    }

    // 4. Forward to Anthropic with the server-held key.
    let upstream;
    try {
        upstream = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(forwardBody)
        });
    } catch (e) {
        sendJson(res, 502, {error: 'Upstream request failed.'});
        return;
    }

    // 5. Relay status + raw JSON back unchanged (client parses Anthropic's shape).
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
    res.send(text);
}
