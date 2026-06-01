import {SongAiError} from '../errors.js';

// Lazy import — @mediapipe/tasks-genai is ~few-MB JS + a runtime-fetched WASM
// payload and a 2 GB model. Keep it out of the main bundle until this provider
// is actually invoked. Mirrors the magenta provider's chunk-splitting pattern.
let mediapipePromise = null;
const loadMediapipe = () => {
    if (!mediapipePromise) {
        mediapipePromise = import(/* webpackChunkName: "gemma4" */ '@mediapipe/tasks-genai')
            .then(m => ({FilesetResolver: m.FilesetResolver, LlmInference: m.LlmInference}));
    }
    return mediapipePromise;
};

const MODEL_URL =
    'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.task';
const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.27/wasm';
// Distinct filename from the gemma4 branch's code-gen feature so the two
// features don't collide if both ever ship.
const OPFS_FILENAME = 'gemma-4-e2b-song-ai.bin';
// Gemma 4 E2B LiteRT supports up to 8192 tokens of context (input + output
// combined). The song JSON output can run 1-2k tokens for a full song, so
// leaving ~6k for the prompt is comfortable.
const MAX_TOKENS = 8192;

// ---------- Load status / subscribe API ----------
// callTool resolves only after generation is done, so we can't surface
// download progress through its return value. A module-scope subscribe API
// lets modal components show progress without changing the provider contract.

let currentStatus = {phase: 'idle', received: 0, total: 0};
const listeners = new Set();

const emit = status => {
    currentStatus = status;
    for (const l of listeners) {
        try {
            l(currentStatus);
        } catch (e) { /* listeners must not break the loader */ }
    }
};

const subscribeGemma4LoadStatus = listener => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const getGemma4LoadStatus = () => currentStatus;

// ---------- WebGPU detection ----------
let webGpuCheckPromise = null;
const checkWebGPU = () => {
    if (webGpuCheckPromise) return webGpuCheckPromise;
    webGpuCheckPromise = (async () => {
        if (typeof navigator === 'undefined' || !navigator.gpu) {
            return {available: false, reason: 'WebGPU not supported in this browser'};
        }
        try {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) return {available: false, reason: 'No WebGPU adapter available'};
            const info = adapter.requestAdapterInfo ? adapter.requestAdapterInfo() : adapter.info;
            if (info && typeof info.description === 'string' && info.description.includes('SwiftShader')) {
                return {available: false, reason: 'SwiftShader (software GPU) — too slow for LLM inference'};
            }
            return {available: true};
        } catch (err) {
            return {available: false, reason: `WebGPU check failed: ${err.message}`};
        }
    })();
    return webGpuCheckPromise;
};

// ---------- OPFS cache ----------
const checkOpfsCache = async () => {
    try {
        const root = await navigator.storage.getDirectory();
        const fh = await root.getFileHandle(OPFS_FILENAME);
        const file = await fh.getFile();
        if (file.size === 0) return null;
        return URL.createObjectURL(file);
    } catch {
        return null;
    }
};

const downloadModelToOpfs = async (url, onProgress, signal) => {
    const response = await fetch(url, {signal});
    if (!response.ok) throw new Error(`HTTP ${response.status} — ${response.statusText}`);
    const total = parseInt(response.headers.get('content-length') || '0', 10);

    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle(OPFS_FILENAME, {create: true});
    const writable = await fh.createWritable();
    const reader = response.body.getReader();

    let received = 0;
    try {
        while (true) {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            const {done, value} = await reader.read();
            if (done) break;
            await writable.write(value);
            received += value.length;
            onProgress(received, total);
        }
    } catch (err) {
        try {
            await writable.abort();
        } catch (e) { /* ignore */ }
        throw err;
    }
    await writable.close();

    const cached = await (await root.getFileHandle(OPFS_FILENAME)).getFile();
    return URL.createObjectURL(cached);
};

// ---------- Single-flight model load ----------
let modelPromise = null;
const ensureLoaded = async signal => {
    if (modelPromise) return modelPromise;
    modelPromise = (async () => {
        const {FilesetResolver, LlmInference} = await loadMediapipe();

        let modelUrl = await checkOpfsCache();
        if (modelUrl) {
            emit({phase: 'loading', received: 1, total: 1});
        } else {
            emit({phase: 'downloading', received: 0, total: 0});
            modelUrl = await downloadModelToOpfs(MODEL_URL, (received, total) => {
                emit({phase: 'downloading', received, total});
            }, signal);
            emit({phase: 'loading', received: 1, total: 1});
        }
        const fileset = await FilesetResolver.forGenAiTasks(WASM_CDN);
        const inf = await LlmInference.createFromOptions(fileset, {
            baseOptions: {modelAssetPath: modelUrl},
            maxTokens: MAX_TOKENS
        });
        emit({phase: 'ready', received: 1, total: 1});
        return inf;
    })().catch(err => {
        modelPromise = null;
        emit({phase: 'error', error: err.message || String(err)});
        throw err;
    });
    return modelPromise;
};

// ---------- Gemma 4 prompt formatting ----------
// Few-shot examples per tool, modelled on what the create_song / edit_track /
// generate_track tool schemas accept. Per the on-device prompting notes:
// concrete few-shots that match the EXACT shape are more effective than just
// listing the schema, because the model otherwise drops or abbreviates fields.
const FEW_SHOTS = {
    create_song: {
        user: 'a chill piano melody with light drums in F major',
        model: JSON.stringify({
            name: 'Chill F Piano',
            tempo: 92,
            lengthSteps: 32,
            key: 'F',
            octave: 4,
            scale: 'major',
            tracks: [
                {
                    kind: 'instrument',
                    instrument: 1,
                    volume: 78,
                    effects: {reverb: 25},
                    notes: [
                        {step: 0, durationSteps: 4, pitch: 65, velocity: 85},
                        {step: 4, durationSteps: 4, pitch: 69, velocity: 80},
                        {step: 8, durationSteps: 4, pitch: 72, velocity: 88},
                        {step: 12, durationSteps: 4, pitch: 69, velocity: 78},
                        {step: 16, durationSteps: 8, pitch: 74, velocity: 90},
                        {step: 24, durationSteps: 8, pitch: 72, velocity: 82}
                    ]
                },
                {
                    kind: 'drum',
                    drumLanes: [2, 1, 6],
                    volume: 70,
                    notes: [
                        {step: 0, durationSteps: 1, drum: 2, velocity: 95},
                        {step: 4, durationSteps: 1, drum: 1, velocity: 90},
                        {step: 8, durationSteps: 1, drum: 2, velocity: 95},
                        {step: 12, durationSteps: 1, drum: 1, velocity: 90},
                        {step: 16, durationSteps: 1, drum: 2, velocity: 95},
                        {step: 20, durationSteps: 1, drum: 1, velocity: 90},
                        {step: 24, durationSteps: 1, drum: 2, velocity: 95},
                        {step: 28, durationSteps: 1, drum: 1, velocity: 90}
                    ]
                }
            ]
        })
    },
    edit_track: {
        user: 'make the melody more sparse — keep the contour but add rests',
        model: JSON.stringify({
            kind: 'instrument',
            instrument: 1,
            volume: 78,
            notes: [
                {step: 0, durationSteps: 4, pitch: 65, velocity: 85},
                {step: 4, durationSteps: 4, rest: true},
                {step: 8, durationSteps: 4, pitch: 72, velocity: 88},
                {step: 12, durationSteps: 4, rest: true},
                {step: 16, durationSteps: 8, pitch: 74, velocity: 90},
                {step: 24, durationSteps: 8, rest: true}
            ]
        })
    },
    generate_track: {
        user: 'add a simple bass line that follows the melody root motion',
        model: JSON.stringify({
            kind: 'instrument',
            instrument: 6,
            volume: 75,
            notes: [
                {step: 0, durationSteps: 4, pitch: 41, velocity: 90},
                {step: 4, durationSteps: 4, pitch: 45, velocity: 88},
                {step: 8, durationSteps: 4, pitch: 48, velocity: 90},
                {step: 12, durationSteps: 4, pitch: 45, velocity: 86},
                {step: 16, durationSteps: 8, pitch: 50, velocity: 92},
                {step: 24, durationSteps: 8, pitch: 48, velocity: 88}
            ]
        })
    }
};

const buildGemmaPrompt = (systemPrompt, userMessage, tool) => {
    // We do NOT inline tool.input_schema — its verbose descriptions push the
    // prompt well past Gemma 4's context window. The few-shot example below
    // teaches the exact shape, which works better for small models anyway.
    const jsonOnly =
        `You MUST respond with a SINGLE JSON object matching the "${tool.name}" ` +
        'shape shown in the example below. No prose, no markdown fences, no ' +
        `commentary. JSON only.\n\n${systemPrompt}`;
    let p = `<|turn>system\n${jsonOnly}<turn|>\n`;
    const shot = FEW_SHOTS[tool.name];
    if (shot) {
        p += `<|turn>user\n${shot.user}<turn|>\n<|turn>model\n${shot.model}<turn|>\n`;
    }
    p += `<|turn>user\n${userMessage}<turn|>\n<|turn>model\n`;
    return p;
};

// ---------- JSON parse + repair ----------
// Adapted from gemini-nano provider, plus an extra pass that closes unmatched
// brackets/braces (Gemma 4 sometimes drops the last `]` or `}` on long outputs).
const parseJsonWithRepair = text => {
    const trimmed = (text || '').trim();
    const candidates = [trimmed];
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) candidates.push(fenceMatch[1].trim());
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
    }
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch (e) { /* try next */ }
        try {
            return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1'));
        } catch (e) { /* try next */ }
        // Bracket balancing: walk the string tracking nesting depth and
        // append the right closers in reverse stack order. Skip chars inside
        // strings (with escape handling). Only attempt repair when the
        // imbalance is small (<=8 total) — bigger gaps usually mean a deeper
        // structural error than bracket-balancing can recover from.
        const stack = [];
        let inString = false;
        let escape = false;
        for (const ch of candidate) {
            if (escape) {
                escape = false;
                continue;
            }
            if (inString) {
                if (ch === '\\') escape = true;
                else if (ch === '"') inString = false;
                continue;
            }
            if (ch === '"') inString = true;
            else if (ch === '{' || ch === '[') stack.push(ch);
            else if (ch === '}' || ch === ']') stack.pop();
        }
        if (stack.length > 0 && stack.length <= 8) {
            let tail = candidate.replace(/,\s*$/, '');
            if (inString) tail += '"';
            for (let i = stack.length - 1; i >= 0; i--) {
                tail += stack[i] === '{' ? '}' : ']';
            }
            try {
                return JSON.parse(tail);
            } catch (e) { /* try next */ }
        }
    }
    return null;
};

const gemma4Provider = {
    id: 'gemma4',
    label: 'Gemma 4 (on-device)',
    async isAvailable () {
        if (typeof navigator === 'undefined' || !navigator.gpu) return false;
        const gpu = await checkWebGPU();
        return gpu.available;
    },
    async callTool ({systemPrompt, userMessage, tool, signal}) {
        let inf;
        try {
            inf = await ensureLoaded(signal);
        } catch (err) {
            if (err?.name === 'AbortError') throw err;
            throw new SongAiError(`Could not load Gemma 4: ${err.message}`, 'NO_PROVIDER');
        }
        const prompt = buildGemmaPrompt(systemPrompt, userMessage, tool);
        let responseText;
        try {
            // Note: MediaPipe's generateResponse does NOT honor AbortSignal
            // mid-generation. The signal works during the download phase
            // (above) but the user can't cancel an in-flight LLM call.
            responseText = await inf.generateResponse(prompt);
        } catch (err) {
            if (err?.name === 'AbortError') throw err;
            throw new SongAiError(`Gemma 4 error: ${err.message}`, 'HTTP');
        }
        const toolInput = parseJsonWithRepair(responseText);
        return {toolInput, stopReason: 'end_turn', raw: responseText};
    }
};

const __testables = {parseJsonWithRepair, buildGemmaPrompt, checkWebGPU};

export {
    gemma4Provider,
    subscribeGemma4LoadStatus,
    getGemma4LoadStatus,
    __testables
};
