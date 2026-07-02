// Deterministic harmony + structure analysis of an existing song, used to give
// the AI an explicit brief when it generates or edits a track. The model is
// otherwise handed only the raw note arrays and the global key/scale, and has to
// reverse-engineer the chord progression and phrase structure itself — which it
// does unreliably. Here we pre-chew that: infer an implied chord per region from
// the sounding notes, sketch which bars each part plays vs. rests, and report the
// register each part occupies, then format it as a short human-readable brief.
//
// Everything is advisory. The brief always states the (never-wrong) scale as a
// floor, and hedges chord labels it isn't confident about, so an ambiguous bar
// can't steer the model onto wrong notes.
import {SCALE_OFFSETS, PITCH_CLASS_NAMES, isInScale} from '../scale-utils.js';

// mod12 is private in scale-utils.js; re-derive it here (as the eval's
// metrics.mjs also does) rather than widen that module's export surface.
const mod12 = n => ((n % 12) + 12) % 12;

const STEPS_PER_BAR = 16;
// Default harmonic-rhythm granularity for chord inference. Half-bar (8 steps)
// matches how kids' loops (and the committed eval seeds) actually change chords;
// adjacent identical regions are merged for display, so slower harmony collapses
// to one line. Very long songs fall back to per-bar to keep the brief compact.
const REGION_STEPS = 8;
const MAX_REGIONS = 16;

const isPitchedTrack = t => t && t.kind !== 'drum' && t.kind !== 'synthDrum';

const isFiniteNum = n => typeof n === 'number' && isFinite(n);

// Pitch-class name only (chord tones are pitch classes, octave-independent).
const pcName = pc => PITCH_CLASS_NAMES[mod12(pc)];
// Full note name with octave (MIDI 60 -> C4).
const midiName = p => `${pcName(p)}${Math.floor(p / 12) - 1}`;

const scaleIsMinorish = scaleType => scaleType === 'minor' || scaleType === 'pentatonicMinor';

// Build a diatonic triad rooted at `rootMidi` for (rootPitch, scaleType). Uses a
// scale-third (3 for minor-ish, else 4), snapping to whichever third is in scale;
// pentatonic degrees with no diatonic third fall back to a root/4th/5th "sus"
// voicing (matching the advice the system prompt already gives). Chromatic keys
// accept both thirds.
const buildChord = (rootMidi, rootPitch, scaleType) => {
    const rootPc = mod12(rootMidi);
    const inScale = interval => isInScale(rootMidi + interval, rootPitch, scaleType);

    let fifth = 7;
    if (!inScale(7)) fifth = inScale(6) ? 6 : 7;

    if (scaleType === 'chromatic') {
        // No diatonic constraint — offer a plain triad but treat both the minor
        // and major third as chord tones (mirrors metrics.mjs's chromatic case).
        return {
            rootPc,
            quality: 'chord',
            tonePcs: [rootPc, mod12(rootMidi + 3), mod12(rootMidi + 4), mod12(rootMidi + fifth)],
            label: pcName(rootPc)
        };
    }

    const preferred = scaleIsMinorish(scaleType) ? 3 : 4;
    const other = preferred === 3 ? 4 : 3;
    let third = null;
    let quality;
    if (inScale(preferred)) {
        third = preferred;
        quality = preferred === 3 ? 'm' : '';
    } else if (inScale(other)) {
        third = other;
        quality = other === 3 ? 'm' : '';
    } else if (inScale(5)) {
        // Thirdless (e.g. pentatonic): quartal / sus voicing.
        third = 5;
        quality = 'sus';
    } else {
        third = preferred; // last resort; keep it in-key by intent
        quality = preferred === 3 ? 'm' : '';
    }
    if (fifth === 6) quality = 'dim';

    const tonePcs = [rootPc, mod12(rootMidi + third), mod12(rootMidi + fifth)];
    const suffix = quality === 'dim' ? '°' : quality === 'sus' ? 'sus' : quality;
    return {rootPc, quality, tonePcs, label: `${pcName(rootPc)}${suffix}`};
};

// Candidate chords: one per scale degree (12 for chromatic).
const candidateChords = (rootPitch, scaleType) => {
    const offsets = scaleType === 'chromatic' ?
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] :
        (SCALE_OFFSETS[scaleType] || SCALE_OFFSETS.chromatic);
    return offsets.map(off => buildChord(rootPitch + off, rootPitch, scaleType));
};

const noteBounds = n => {
    const start = isFiniteNum(n.step) ? n.step : 0;
    const dur = isFiniteNum(n.durationSteps) && n.durationSteps > 0 ? n.durationSteps : 1;
    return {start, end: start + dur};
};

const overlap = (aStart, aEnd, bStart, bEnd) =>
    Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

// Choose the harmonic root source: the pitched track with the lowest mean pitch
// (the bass). Returns its index in `tracks`, or -1 if there is no pitched track.
const findBassTrackIndex = tracks => {
    let best = -1;
    let bestMean = Infinity;
    tracks.forEach((t, i) => {
        if (!isPitchedTrack(t)) return;
        const pitches = (t.notes || []).filter(n => isFiniteNum(n.pitch)).map(n => n.pitch);
        if (pitches.length === 0) return;
        const mean = pitches.reduce((s, p) => s + p, 0) / pitches.length;
        if (mean < bestMean) {
            bestMean = mean;
            best = i;
        }
    });
    return best;
};

// Infer the chord for one region [start,end) by pooling the pitch classes that
// sound in it (weighted by overlap duration, bass doubled) and template-matching
// against the diatonic triads. Returns null when the region has no pitched sound.
const inferChord = (pitched, start, end, bassTrackIndex, chords) => {
    const pcWeight = new Array(12).fill(0);
    const bassPcWeight = new Array(12).fill(0);
    let total = 0;
    for (const n of pitched) {
        const ov = overlap(n.start, n.end, start, end);
        if (ov <= 0) continue;
        const pc = mod12(n.pitch);
        const isBass = n.trackIndex === bassTrackIndex;
        const w = ov * (isBass ? 2 : 1);
        pcWeight[pc] += w;
        total += w;
        if (isBass) bassPcWeight[pc] += ov;
    }
    if (total <= 0) return null;

    let bassRootPc = -1;
    let bassMax = 0;
    for (let pc = 0; pc < 12; pc++) {
        if (bassPcWeight[pc] > bassMax) {
            bassMax = bassPcWeight[pc];
            bassRootPc = pc;
        }
    }

    let best = null;
    for (const c of chords) {
        const uniq = Array.from(new Set(c.tonePcs));
        let score = uniq.reduce((s, pc) => s + pcWeight[pc], 0);
        if (bassRootPc >= 0 && c.rootPc === bassRootPc) score += bassMax; // root-in-bass tie-break
        const support = uniq.filter(pc => pcWeight[pc] > 0).length;
        if (!best || score > best.score) best = {chord: c, score, support};
    }

    // Confidence: the chord should explain most of the region's weight and be
    // supported by at least two of its tones actually sounding.
    const confident = best && (best.score / (total + bassMax) >= 0.5) && best.support >= 2;
    return {chord: best.chord, confident: !!confident};
};

// Merge consecutive regions that resolved to the same chord, for a compact
// progression display.
const mergeRegions = regions => {
    const out = [];
    for (const r of regions) {
        const prev = out[out.length - 1];
        if (prev && prev.label === r.label) {
            prev.end = r.end;
            prev.confident = prev.confident && r.confident;
        } else {
            out.push({...r});
        }
    }
    return out;
};

const registerRole = mean => {
    if (mean <= 48) return 'bass';
    if (mean <= 64) return 'low/pad';
    if (mean <= 78) return 'mid/lead';
    return 'high';
};

/**
 * Analyze an existing song's tracks into harmony + structure + register facts.
 * @param {object} args the song fields to analyze
 * @param {Array} args.tracks internal track objects
 * @param {number} args.rootPitch song tonic (MIDI)
 * @param {string} args.scaleType one of SCALE_OFFSETS keys
 * @param {number} args.lengthSteps song length in steps
 * @returns {{hasHarmony: boolean, harmony: Array, structure: object, registers: Array}} the analysis
 */
const analyzeSong = ({tracks, rootPitch, scaleType, lengthSteps}) => {
    const safeTracks = Array.isArray(tracks) ? tracks : [];
    const len = isFiniteNum(lengthSteps) && lengthSteps > 0 ? lengthSteps : STEPS_PER_BAR;

    // Flatten pitched notes, tagged with their track index (for bass detection).
    const pitched = [];
    safeTracks.forEach((t, ti) => {
        if (!isPitchedTrack(t)) return;
        for (const n of t.notes || []) {
            if (!isFiniteNum(n.pitch)) continue;
            const {start, end} = noteBounds(n);
            pitched.push({pitch: n.pitch, start, end, trackIndex: ti});
        }
    });

    const bars = Math.max(1, Math.ceil(len / STEPS_PER_BAR));

    // Per-track register + role.
    const registers = [];
    safeTracks.forEach((t, ti) => {
        if (isPitchedTrack(t)) {
            const ps = (t.notes || []).filter(n => isFiniteNum(n.pitch)).map(n => n.pitch);
            if (ps.length === 0) {
                registers.push({trackIndex: ti, kind: t.kind, role: 'empty', min: null, max: null});
                return;
            }
            const min = Math.min(...ps);
            const max = Math.max(...ps);
            const mean = ps.reduce((s, p) => s + p, 0) / ps.length;
            registers.push({trackIndex: ti, kind: t.kind, role: registerRole(mean), min, max});
        } else {
            registers.push({trackIndex: ti, kind: t.kind, role: 'drums', min: null, max: null});
        }
    });

    // Structure grid: which tracks are active in each bar.
    const grid = safeTracks.map((t, ti) => {
        const reg = registers[ti];
        const label = reg.role === 'drums' ? 'drums' : reg.role;
        const cells = [];
        for (let b = 0; b < bars; b++) {
            const bStart = b * STEPS_PER_BAR;
            const bEnd = bStart + STEPS_PER_BAR;
            let active = false;
            for (const n of t.notes || []) {
                const {start, end} = noteBounds(n);
                if (overlap(start, end, bStart, bEnd) > 0) {
                    active = true;
                    break;
                }
            }
            cells.push(active);
        }
        return {trackIndex: ti, label, cells};
    });

    // Onset count per bar (across all tracks) -> flag bars notably sparse.
    const onsetPerBar = new Array(bars).fill(0);
    for (const t of safeTracks) {
        for (const n of t.notes || []) {
            const s = isFiniteNum(n.step) ? n.step : 0;
            const b = Math.min(bars - 1, Math.max(0, Math.floor(s / STEPS_PER_BAR)));
            onsetPerBar[b]++;
        }
    }
    const sortedCounts = onsetPerBar.slice().sort((a, b) => a - b);
    const median = sortedCounts[Math.floor(sortedCounts.length / 2)] || 0;
    const sparseBars = [];
    onsetPerBar.forEach((c, b) => {
        if (median > 0 && c <= median / 2) sparseBars.push(b + 1);
    });

    // Repeat detection: fingerprint each bar (across tracks) and report a bar
    // that duplicates an earlier one.
    const barFingerprint = b => {
        const bStart = b * STEPS_PER_BAR;
        const tokens = [];
        safeTracks.forEach((t, ti) => {
            for (const n of t.notes || []) {
                const s = isFiniteNum(n.step) ? n.step : 0;
                if (s >= bStart && s < bStart + STEPS_PER_BAR) {
                    const what = isFiniteNum(n.pitch) ? `p${n.pitch}` : `d${n.drum}`;
                    tokens.push(`${ti}:${Math.round(s - bStart)}:${what}`);
                }
            }
        });
        return tokens.sort().join('|');
    };
    const repeats = [];
    const seen = new Map();
    for (let b = 0; b < bars; b++) {
        const fp = barFingerprint(b);
        if (!fp) continue;
        if (seen.has(fp)) {
            repeats.push({bar: b + 1, sameAs: seen.get(fp) + 1});
        } else {
            seen.set(fp, b);
        }
    }

    // Harmony: infer a chord per region, then merge adjacent equal regions.
    let harmony = [];
    const hasHarmony = pitched.length > 0;
    if (hasHarmony) {
        const bassTrackIndex = findBassTrackIndex(safeTracks);
        const chords = candidateChords(rootPitch, scaleType);
        let regionSteps = REGION_STEPS;
        if (Math.ceil(len / regionSteps) > MAX_REGIONS) regionSteps = STEPS_PER_BAR;
        const nRegions = Math.max(1, Math.ceil(len / regionSteps));
        const raw = [];
        let prev = null;
        for (let r = 0; r < nRegions; r++) {
            const start = r * regionSteps;
            const end = Math.min(len, start + regionSteps);
            const res = inferChord(pitched, start, end, bassTrackIndex, chords);
            let chord;
            let confident;
            if (res) {
                chord = res.chord;
                confident = res.confident;
                prev = chord;
            } else if (prev) {
                chord = prev; // carry previous chord through an empty region
                confident = false;
            } else {
                chord = chords[0]; // tonic fallback for a leading empty region
                confident = false;
            }
            raw.push({start, end, label: chord.label, tonePcs: chord.tonePcs, confident});
        }
        harmony = mergeRegions(raw);
    }

    return {
        hasHarmony,
        harmony,
        structure: {bars, grid, sparseBars, repeats},
        registers,
        tonicChord: candidateChords(rootPitch, scaleType)[0]
    };
};

const chordLine = region => {
    const tones = region.tonePcs.map(pcName).join(' ');
    const hedge = region.confident ? '' : '   (unclear — stay in scale)';
    return `  steps ${region.start}-${region.end - 1}: ${region.label} (${tones})${hedge}`;
};

/**
 * Render an analysis into the compact text brief injected into the AI prompt.
 * @param {object} analysis result of analyzeSong
 * @param {object} opts formatting options (key/scale for labels)
 * @param {number} opts.rootPitch song tonic (MIDI)
 * @param {string} opts.scaleType scale name
 * @param {number} [opts.editTrackIndex] track being edited (marked in the grid)
 * @returns {string} the brief
 */
const formatSongBrief = (analysis, {rootPitch, scaleType, editTrackIndex} = {}) => {
    const lines = [];
    lines.push('HARMONY + STRUCTURE BRIEF (derived from the existing notes — follow it):');
    lines.push(`Key/scale: ${pcName(rootPitch)} ${scaleType} (every pitched note is snapped to this scale).`);

    if (analysis.hasHarmony && analysis.harmony.length > 0) {
        lines.push('Implied chord per region (put strong-beat notes on these chord tones):');
        for (const region of analysis.harmony) lines.push(chordLine(region));
    } else {
        const tones = analysis.tonicChord.tonePcs.map(pcName).join(' ');
        lines.push(
            `No existing harmony yet — you are establishing it. Center strong beats on the ` +
            `tonic chord ${analysis.tonicChord.label} (${tones}) and its scale.`
        );
    }

    const {grid, sparseBars, repeats} = analysis.structure;
    if (grid.length > 0 && analysis.structure.bars > 1) {
        lines.push(`Structure (${analysis.structure.bars} bars; # = playing, . = resting):`);
        for (const row of grid) {
            const mark = row.trackIndex === editTrackIndex ? ' <- EDITING' : '';
            const cells = row.cells.map(c => (c ? '#' : '.')).join(' ');
            lines.push(`  ${row.label.padEnd(8)}: ${cells}${mark}`);
        }
        if (sparseBars.length > 0) {
            lines.push(`  Sparse bars (good places to enter): ${sparseBars.join(', ')}.`);
        }
        if (repeats.length > 0) {
            lines.push(`  Repeats: ${repeats.slice(0, 2).map(r => `bar ${r.bar} = bar ${r.sameAs}`)
                .join('; ')}.`);
        }
    }

    const occupied = analysis.registers
        .filter(r => r.min !== null)
        .map(r => `${r.label || r.role} ${midiName(r.min)}-${midiName(r.max)}`);
    if (occupied.length > 0) {
        lines.push(`Register in use: ${occupied.join(', ')}.`);
    }

    lines.push(
        'Guidance: enter where the existing parts rest; do not copy their rhythms; ' +
        'use non-chord scale tones only as passing/neighbor notes on weak beats.'
    );
    return lines.join('\n');
};

export {analyzeSong, formatSongBrief};
