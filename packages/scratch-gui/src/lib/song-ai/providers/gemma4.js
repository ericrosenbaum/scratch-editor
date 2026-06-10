import {INSTRUMENT_NAMES, DRUM_NAMES, SYNTH_PRESETS} from '../../song-defaults.js';

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

// Sampling. MediaPipe defaults are tuned for chatty variety; for structured JSON
// we want a low temperature (stays in-scale/in-format, fewer parse failures) with
// a fixed seed so a single sample is representative. Per the LlmInference docs,
// generation is greedy unless topK>1 && temperature>0.
const GEN_TEMPERATURE = 0.3;
const GEN_TOP_K = 40;
const GEN_RANDOM_SEED = 42;

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
            maxTokens: MAX_TOKENS,
            temperature: GEN_TEMPERATURE,
            topK: GEN_TOP_K,
            randomSeed: GEN_RANDOM_SEED
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
// Few-shots are the dominant signal for a small model, so each one models exactly
// what the eval rewards: a full song = ~4 tracks (lead + bass + chord pad + drum)
// built on a 4-chord progression (one chord per quarter), with chord tones (root,
// 3rd, 5th) on the strong beats, correct registers (bass <=48, lead 60-84, pad
// 48-72), and a realistic note density. The example below is in F major and walks
// F -> C -> Dm -> Bb (offsets 0,7,9,5 from the tonic), with every pitch diatonic.
// Compact JSON (no whitespace) is what we want the model to emit.
const FEW_SHOTS = {
    create_song: {
        user: 'an upbeat song with a melody, bass, chords and drums in F major',
        model: JSON.stringify({
            name: 'Sunset Groove',
            tempo: 100,
            lengthSteps: 32,
            key: 'F',
            octave: 4,
            scale: 'major',
            tracks: [
                {
                    kind: 'instrument',
                    instrument: 1,
                    volume: 80,
                    notes: [
                        {step: 0, durationSteps: 2, pitch: 72, velocity: 95},
                        {step: 2, durationSteps: 2, pitch: 69, velocity: 82},
                        {step: 4, durationSteps: 2, pitch: 65, velocity: 80},
                        {step: 6, durationSteps: 2, pitch: 69, velocity: 78},
                        {step: 8, durationSteps: 2, pitch: 67, velocity: 90},
                        {step: 10, durationSteps: 2, pitch: 64, velocity: 80},
                        {step: 12, durationSteps: 2, pitch: 72, velocity: 82},
                        {step: 14, durationSteps: 2, pitch: 67, velocity: 78},
                        {step: 16, durationSteps: 2, pitch: 69, velocity: 88},
                        {step: 18, durationSteps: 2, pitch: 65, velocity: 80},
                        {step: 20, durationSteps: 2, pitch: 74, velocity: 82},
                        {step: 22, durationSteps: 2, pitch: 69, velocity: 78},
                        {step: 24, durationSteps: 2, pitch: 70, velocity: 88},
                        {step: 26, durationSteps: 2, pitch: 65, velocity: 78},
                        {step: 28, durationSteps: 4, pitch: 65, velocity: 85}
                    ]
                },
                {
                    kind: 'instrument',
                    instrument: 6,
                    volume: 78,
                    notes: [
                        {step: 0, durationSteps: 4, pitch: 41, velocity: 95},
                        {step: 4, durationSteps: 4, pitch: 41, velocity: 85},
                        {step: 8, durationSteps: 4, pitch: 36, velocity: 92},
                        {step: 12, durationSteps: 4, pitch: 36, velocity: 82},
                        {step: 16, durationSteps: 4, pitch: 38, velocity: 90},
                        {step: 20, durationSteps: 4, pitch: 38, velocity: 80},
                        {step: 24, durationSteps: 4, pitch: 34, velocity: 92},
                        {step: 28, durationSteps: 4, pitch: 34, velocity: 82}
                    ]
                },
                {
                    kind: 'instrument',
                    instrument: 21,
                    volume: 65,
                    notes: [
                        {step: 0, durationSteps: 8, pitch: 53, velocity: 70},
                        {step: 0, durationSteps: 8, pitch: 57, velocity: 66},
                        {step: 0, durationSteps: 8, pitch: 60, velocity: 64},
                        {step: 8, durationSteps: 8, pitch: 55, velocity: 70},
                        {step: 8, durationSteps: 8, pitch: 60, velocity: 66},
                        {step: 8, durationSteps: 8, pitch: 64, velocity: 64},
                        {step: 16, durationSteps: 8, pitch: 53, velocity: 70},
                        {step: 16, durationSteps: 8, pitch: 57, velocity: 66},
                        {step: 16, durationSteps: 8, pitch: 62, velocity: 64},
                        {step: 24, durationSteps: 8, pitch: 58, velocity: 70},
                        {step: 24, durationSteps: 8, pitch: 62, velocity: 66},
                        {step: 24, durationSteps: 8, pitch: 65, velocity: 64}
                    ]
                },
                {
                    kind: 'drum',
                    drumLanes: [2, 1, 6],
                    volume: 75,
                    notes: [
                        {step: 0, durationSteps: 1, drum: 2, velocity: 100},
                        {step: 2, durationSteps: 1, drum: 6, velocity: 70},
                        {step: 4, durationSteps: 1, drum: 1, velocity: 95},
                        {step: 6, durationSteps: 1, drum: 6, velocity: 70},
                        {step: 8, durationSteps: 1, drum: 2, velocity: 98},
                        {step: 10, durationSteps: 1, drum: 6, velocity: 70},
                        {step: 12, durationSteps: 1, drum: 1, velocity: 92},
                        {step: 14, durationSteps: 1, drum: 6, velocity: 70},
                        {step: 16, durationSteps: 1, drum: 2, velocity: 100},
                        {step: 18, durationSteps: 1, drum: 6, velocity: 70},
                        {step: 20, durationSteps: 1, drum: 1, velocity: 95},
                        {step: 22, durationSteps: 1, drum: 6, velocity: 70},
                        {step: 24, durationSteps: 1, drum: 2, velocity: 98},
                        {step: 26, durationSteps: 1, drum: 6, velocity: 70},
                        {step: 28, durationSteps: 1, drum: 1, velocity: 92},
                        {step: 30, durationSteps: 1, drum: 6, velocity: 70}
                    ]
                }
            ]
        })
    },
    edit_track: {
        // Edits cover vary / continue / harmonize / infill — operation-specific
        // intent lives in the shared edit system prompt + the user message, so we
        // keep the original rests-aware example here rather than a generic rewrite.
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
        user: 'add a bass line that follows the chord roots',
        model: JSON.stringify({
            kind: 'instrument',
            instrument: 6,
            volume: 78,
            notes: [
                {step: 0, durationSteps: 4, pitch: 41, velocity: 92},
                {step: 4, durationSteps: 4, pitch: 41, velocity: 84},
                {step: 8, durationSteps: 4, pitch: 36, velocity: 90},
                {step: 12, durationSteps: 4, pitch: 36, velocity: 82},
                {step: 16, durationSteps: 4, pitch: 38, velocity: 90},
                {step: 20, durationSteps: 4, pitch: 38, velocity: 82},
                {step: 24, durationSteps: 4, pitch: 34, velocity: 90},
                {step: 28, durationSteps: 4, pitch: 34, velocity: 82}
            ]
        })
    }
};

// Compact index legends (the full prompts.js prose is far too long for an 8k
// context, and a small model imitates the few-shot anyway — but it still needs
// the index->name maps to pick valid instruments/drums/presets).
const INSTRUMENT_LEGEND = INSTRUMENT_NAMES.map((n, i) => `${i + 1}=${n}`).join(', ');
const DRUM_LEGEND = DRUM_NAMES.map((n, i) => `${i + 1}=${n}`).join(', ');
const SYNTH_LEGEND = SYNTH_PRESETS.map((p, i) => `${i + 1}=${p.name}`).join(', ');

const NOTE_SHAPE =
    'Each note is {step, durationSteps, pitch (use drum instead of pitch on drum ' +
    'tracks), velocity}. Match the example shape exactly.';

// Tight, Gemma-specific system prompts. Far shorter than the shared Anthropic
// prose (frees output budget so full songs don't truncate) and focused on what
// the eval scores: in-scale + chord-tone notes, correct registers, the right
// track count/kinds, and the exact key/scale/tempo from the request.
const GEMMA_SYSTEM_PROMPTS = {
    create_song: [
        'You write a short song as JSON for a step sequencer (4 steps = 1 beat). ' +
            'Output ONLY one complete, compact JSON object — every bracket closed, ' +
            'no prose, no markdown.',
        'Copy the EXACT key, scale and tempo named in the request into the fields. ' +
            'If no length is stated use lengthSteps 32 and octave 4.',
        'Every pitched note pitch-class MUST belong to the chosen scale.',
        'For a "song"/"beat"/"groove" or any multi-instrument request, include ~4 ' +
            'tracks: a lead melody (instrument), a bass (instrument), a chord pad ' +
            '(instrument), and a drum track. For a single-instrument request, emit ' +
            'one track.',
        'Registers (MIDI): bass 28-48 (keep it genuinely low), lead 60-84, chord ' +
            'pad 48-72.',
        'Harmony: pick a 4-chord progression and play one chord per quarter of the ' +
            'song. Put chord tones (root, 3rd, 5th) on strong beats; stack 2-3 chord ' +
            'tones in the pad. Give each track ~12-20 notes with varied durations. ' +
            'Do NOT write rest entries — gaps between notes are already silence.',
        `Instrument index (1-${INSTRUMENT_NAMES.length}): ${INSTRUMENT_LEGEND}.`,
        `Drum index: ${DRUM_LEGEND}.`,
        `Synth presets (for kind=synth): ${SYNTH_LEGEND}.`,
        NOTE_SHAPE
    ].join('\n'),
    generate_track: [
        'You add ONE new track as JSON to the song given below. Output ONLY one ' +
            'complete, compact JSON object — every bracket closed, no prose.',
        'Set kind to the requested kind. Keep the new track in the song\'s key, ' +
            'scale and tempo, and have it fill a role the existing tracks lack ' +
            '(e.g. add a bass under a lead).',
        'Registers (MIDI): bass 28-48 (keep it low), lead 60-84, chord pad 48-72. ' +
            'Put chord tones on strong beats. Give it ~8-20 notes with varied ' +
            'durations; do NOT write rest entries.',
        `Instrument index (1-${INSTRUMENT_NAMES.length}): ${INSTRUMENT_LEGEND}.`,
        `Drum index: ${DRUM_LEGEND}.`,
        `Synth presets (for kind=synth): ${SYNTH_LEGEND}.`,
        NOTE_SHAPE
    ].join('\n')
    // No edit_track entry: edits (vary/continue/harmonize/infill) carry their
    // operation-specific intent in the shared edit system prompt, so buildGemmaPrompt
    // falls back to that. A generic "rewrite this track" prompt broke infill
    // (gap left unfilled) and harmonize, so we keep the full prompt for edits.
};

const buildGemmaPrompt = (systemPrompt, userMessage, tool) => {
    // Use the tight Gemma-specific prompt; fall back to the passed-in (shared)
    // prompt only for an unknown tool.
    const sys = GEMMA_SYSTEM_PROMPTS[tool.name] || systemPrompt;
    let p = `<|turn>system\n${sys}<turn|>\n`;
    const shot = FEW_SHOTS[tool.name];
    if (shot) {
        p += `<|turn>user\n${shot.user}<turn|>\n<|turn>model\n${shot.model}<turn|>\n`;
    }
    p += `<|turn>user\n${userMessage}<turn|>\n<|turn>model\n`;
    return p;
};

// ---------- JSON parse + repair ----------
// Recover a hard-truncated object (cut off mid-note, where simply closing
// brackets would leave a dangling key/value) by rewinding to the last position
// where a NESTED element finished — a `}` or `]` that closed while an outer
// container was still open — then closing whatever stayed open. Yields a smaller
// but valid song/track (e.g. a full song missing its last few notes) instead of
// a total loss.
const repairTruncated = candidate => {
    let lastClose = -1;
    const stack = [];
    let inString = false;
    let escape = false;
    for (let i = 0; i < candidate.length; i++) {
        const ch = candidate[i];
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
        else if (ch === '}' || ch === ']') {
            stack.pop();
            if (stack.length >= 1) lastClose = i;
        }
    }
    if (lastClose < 0) return null;
    const head = candidate.slice(0, lastClose + 1);
    const open = [];
    inString = false;
    escape = false;
    for (let i = 0; i < head.length; i++) {
        const ch = head[i];
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
        else if (ch === '{' || ch === '[') open.push(ch);
        else if (ch === '}' || ch === ']') open.pop();
    }
    let out = head;
    for (let i = open.length - 1; i >= 0; i--) {
        out += open[i] === '{' ? '}' : ']';
    }
    try {
        return JSON.parse(out);
    } catch (e) {
        return null;
    }
};

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
        // imbalance is modest (<=16 total) — bigger gaps usually mean a deeper
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
        if (stack.length > 0 && stack.length <= 16) {
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
    // Hard-truncation fallback: rewind to the last complete nested element.
    for (const candidate of candidates) {
        const recovered = repairTruncated(candidate);
        if (recovered) return recovered;
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
