// Deterministic music-theory metrics. Each returns a number in [0,1] or null
// (not applicable -> excluded from the weighted aggregate). All operate on the
// common scoring view (see lib/scoring-view.mjs); most pool notes across the
// view's tracks so the same code serves song and single-track units.
import {isInScale, PITCH_CLASS_NAMES} from '../../../src/lib/scale-utils.js';

const EPS = 1e-9;
const mod12 = n => ((n % 12) + 12) % 12;
const clamp01 = x => Math.max(0, Math.min(1, x));

const pooledPitched = view => view.tracks.flatMap(t => (t.notes || []).filter(n => typeof n.pitch === 'number'));
const pooledAll = view => view.tracks.flatMap(t => t.notes || []);
const onsetSteps = notes => notes.map(n => n.step || 0);

const cosine = (a, b) => {
    let dot = 0; let na = 0; let nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    if (na === 0 || nb === 0) return null;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

const thirdFor = scaleType =>
    (scaleType === 'minor' || scaleType === 'pentatonicMinor') ? 3 : 4;

const chordTonePcs = (view, setting, step) => {
    const prog = (setting && setting.chordProgressionOffsets) || [0];
    const n = prog.length;
    const per = Math.max(1, view.lengthSteps / n);
    const idx = Math.min(n - 1, Math.floor(step / per));
    const chordRoot = view.rootPitch + prog[idx];
    const third = thirdFor(view.scaleType);
    const tones = [chordRoot, chordRoot + third, chordRoot + 7];
    if (view.scaleType === 'chromatic') tones.push(chordRoot + 3, chordRoot + 4);
    return new Set(tones.map(mod12));
};

// --- metrics ---

export const scaleConformance = out => {
    const pitched = pooledPitched(out);
    if (pitched.length === 0) return null;
    const inScale = pitched.filter(n => isInScale(n.pitch, out.rootPitch, out.scaleType)).length;
    return inScale / pitched.length;
};

export const harmonicAlignment = (out, _golden, ctx) => {
    const pitched = pooledPitched(out);
    if (pitched.length === 0) return null;
    let hit = 0;
    for (const n of pitched) {
        const tones = chordTonePcs(out, ctx.setting, n.step || 0);
        if (tones.has(mod12(n.pitch))) hit++;
    }
    return hit / pitched.length;
};

export const noteDensityRatio = (out, golden) => {
    const denom = Math.max(1, out.lengthSteps) * Math.max(1, out.tracks.length);
    const a = pooledAll(out).length / denom;
    const gdenom = Math.max(1, golden.lengthSteps) * Math.max(1, golden.tracks.length);
    const b = pooledAll(golden).length / gdenom;
    if (a === 0 && b === 0) return 1;
    return clamp01(1 - (Math.abs(a - b) / (Math.max(a, b) + EPS)));
};

export const registerMatch = (out, golden) => {
    const po = pooledPitched(out);
    const pg = pooledPitched(golden);
    if (po.length === 0 || pg.length === 0) return null;
    const stat = ns => {
        const ps = ns.map(n => n.pitch);
        return {min: Math.min(...ps), max: Math.max(...ps), mean: ps.reduce((s, p) => s + p, 0) / ps.length};
    };
    const o = stat(po); const g = stat(pg);
    const meanScore = clamp01(1 - (Math.abs(o.mean - g.mean) / 12));
    const lo = Math.max(o.min, g.min); const hi = Math.min(o.max, g.max);
    const inter = Math.max(0, hi - lo);
    const union = Math.max(o.max, g.max) - Math.min(o.min, g.min);
    const spanScore = union <= 0 ? 1 : clamp01(inter / union);
    return (0.6 * meanScore) + (0.4 * spanScore);
};

export const rhythmGridAlignment = (out, golden) => {
    const histPhase = notes => {
        const h = [0, 0, 0, 0];
        for (const n of notes) h[mod12(n.step || 0) % 4]++;
        return h;
    };
    const ao = onsetSteps(pooledAll(out));
    const ag = onsetSteps(pooledAll(golden));
    if (ao.length === 0 || ag.length === 0) return null;
    const c = cosine(histPhase(pooledAll(out)), histPhase(pooledAll(golden)));
    return c === null ? null : clamp01(c);
};

export const trackCountKindMatch = (out, golden, ctx) => {
    if (ctx.unit === 'track') {
        const want = ctx.case.intent && ctx.case.intent.expectKind;
        const got = out.tracks[0] && out.tracks[0].kind;
        if (!want) return got === (golden.tracks[0] && golden.tracks[0].kind) ? 1 : 0;
        return got === want ? 1 : 0;
    }
    const expected = (ctx.setting && ctx.setting.expectedTrackKinds) ||
        golden.tracks.map(t => t.kind);
    const countKinds = kinds => kinds.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
    const eo = countKinds(out.tracks.map(t => t.kind));
    const ee = countKinds(expected);
    let inter = 0;
    for (const [k, v] of ee) inter += Math.min(v, eo.get(k) || 0);
    const denom = Math.max(expected.length, out.tracks.length, 1);
    return inter / denom;
};

export const constraintAdherence = (out, _golden, ctx) => {
    if (ctx.unit !== 'song') return null; // track ops inherit key/tempo from the seed
    const intent = ctx.case.intent || {};
    const checks = [];
    if (intent.requireKey) {
        checks.push(PITCH_CLASS_NAMES[mod12(out.rootPitch)] === intent.requireKey ? 1 : 0);
    }
    if (intent.requireScale) {
        checks.push(out.scaleType === intent.requireScale ? 1 : 0);
    }
    if (typeof intent.requireTempo === 'number') {
        checks.push(clamp01(1 - (Math.abs(out.tempo - intent.requireTempo) / 20)));
    }
    if (typeof intent.requireLengthSteps === 'number') {
        checks.push(out.lengthSteps === intent.requireLengthSteps ? 1 : 0);
    }
    if (checks.length === 0) return null;
    return checks.reduce((s, c) => s + c, 0) / checks.length;
};

export const goldenSimilarity = (out, golden) => {
    const po = pooledPitched(out); const pg = pooledPitched(golden);
    const pcHist = ns => {
        const h = new Array(12).fill(0);
        for (const n of ns) h[mod12(n.pitch)]++;
        return h;
    };
    let pcCos = null;
    if (po.length && pg.length) pcCos = cosine(pcHist(po), pcHist(pg));
    const so = new Set(onsetSteps(pooledAll(out)));
    const sg = new Set(onsetSteps(pooledAll(golden)));
    let onsetIoU = null;
    if (so.size || sg.size) {
        let inter = 0;
        for (const s of so) if (sg.has(s)) inter++;
        const union = new Set([...so, ...sg]).size;
        onsetIoU = union ? inter / union : 1;
    }
    const parts = [pcCos, onsetIoU].filter(v => v !== null);
    if (parts.length === 0) return null;
    return clamp01(parts.reduce((s, v) => s + v, 0) / parts.length);
};

// Infill only: did the model fill the gap and connect smoothly across edges?
export const infillBoundaryContinuity = (out, _golden, ctx) => {
    const ep = ctx.case.editParams || {};
    if (ctx.case.category !== 'infill' || typeof ep.maskFromStep !== 'number') return null;
    const pitched = pooledPitched(out).slice().sort((a, b) => a.step - b.step);
    if (pitched.length === 0) return 0;
    const inGap = pitched.filter(n => n.step >= ep.maskFromStep && n.step < ep.maskToStep);
    if (inGap.length === 0) return 0; // gap left empty
    const smooth = (a, b) => {
        if (!a || !b) return 0.5;
        return clamp01(1 - (Math.abs(a.pitch - b.pitch) / 12));
    };
    const before = pitched.filter(n => n.step < ep.maskFromStep).pop();
    const after = pitched.find(n => n.step >= ep.maskToStep);
    const left = smooth(before, inGap[0]);
    const right = smooth(inGap[inGap.length - 1], after);
    const filled = clamp01(inGap.length / Math.max(1, (ep.maskToStep - ep.maskFromStep) / 4));
    return clamp01((0.5 * filled) + (0.25 * left) + (0.25 * right));
};

export const METRICS = {
    scaleConformance,
    harmonicAlignment,
    constraintAdherence,
    trackCountKindMatch,
    noteDensityRatio,
    registerMatch,
    rhythmGridAlignment,
    infillBoundaryContinuity,
    goldenSimilarity
};
