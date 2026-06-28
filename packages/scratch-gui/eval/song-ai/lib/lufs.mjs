// Integrated loudness (LUFS) per ITU-R BS.1770-4 / EBU R128, plus sample peak.
//
// Pure, dependency-free, and DOM-free: operates on any object that looks like a
// Web Audio AudioBuffer — `{numberOfChannels, length, sampleRate, getChannelData(i)}`.
// That makes it importable both into the browser measurement page (real
// AudioBuffer) and into Node for the self-test (a plain object).
//
// Why this is the right metric: peak normalization (what the music samples
// already have) does not equal perceived loudness — a sustained pad and a
// plucked note at equal peak sound very different. LUFS is the broadcast-standard
// perceptual loudness measure, so calibrating every instrument to a common LUFS
// target is what makes the mix balanced by ear.
//
// IMPORTANT — sample rate: the K-weighting biquad coefficients below are the
// literal BS.1770 values defined at 48 kHz. Render the measurement
// OfflineAudioContext at 48000 Hz so they are exact (Web Audio resamples the
// 44.1 kHz sample buffers for free). Measuring a buffer at another rate will be
// slightly off; `measureLoudness` warns when sampleRate !== 48000.

// --- K-weighting (BS.1770-4), 48 kHz reference coefficients --------------------
// Stage 1: "pre-filter", a +4 dB high-shelf (head/torso acoustic model).
// Stage 2: RLB high-pass (~38 Hz), removes sub-bass rumble from the measure.
// Direct-Form-I difference eqn per stage:
//   y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]   (a0 = 1)
export const K_STAGE1 = {
    b0: 1.53512485958697, b1: -2.69169618940638, b2: 1.19839281085285,
    a1: -1.69065929318241, a2: 0.73248077421585
};
export const K_STAGE2 = {
    b0: 1.0, b1: -2.0, b2: 1.0,
    a1: -1.99004745483398, a2: 0.99007225036621
};

// BS.1770 channel weights. Only L/R here (no surround), both 1.0.
const CHANNEL_WEIGHT = 1.0;

const BLOCK_SECONDS = 0.4; // momentary block length
const HOP_SECONDS = 0.1; // 75% overlap
const ABSOLUTE_GATE_LUFS = -70.0;
const RELATIVE_GATE_LU = -10.0;
const OFFSET = -0.691; // BS.1770 loudness offset

// Apply one biquad (Direct-Form-I) in place-free fashion, returning a new array.
const biquad = (x, c) => {
    const y = new Float64Array(x.length);
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let n = 0; n < x.length; n++) {
        const xn = x[n];
        const yn = (c.b0 * xn) + (c.b1 * x1) + (c.b2 * x2) - (c.a1 * y1) - (c.a2 * y2);
        x2 = x1; x1 = xn;
        y2 = y1; y1 = yn;
        y[n] = yn;
    }
    return y;
};

// K-weight a single channel: stage 1 then stage 2.
const kWeight = channel => biquad(biquad(channel, K_STAGE1), K_STAGE2);

/**
 * Measure integrated loudness (LUFS) and sample peak of an AudioBuffer-like.
 * @param {object} buf - {numberOfChannels, length, sampleRate, getChannelData(i)}
 * @param {object} [opts]
 * @param {function} [opts.warn] - sink for the off-rate warning (default console.warn)
 * @returns {{lufs:number, samplePeak:number, samplePeakDb:number, nBlocks:number,
 *   nGatedBlocks:number}} lufs is -Infinity when nothing clears the absolute gate.
 */
export const measureLoudness = (buf, {warn = (m => { /* eslint-disable-line no-console */ console.warn(m); })} = {}) => {
    const sr = buf.sampleRate;
    if (sr !== 48000) {
        warn(`[lufs] buffer sampleRate is ${sr}, not 48000 — K-weighting coefficients are defined at 48 kHz, result will be slightly off.`);
    }
    const nCh = buf.numberOfChannels;
    const len = buf.length;

    // Sample peak across all channels (raw, un-weighted).
    let samplePeak = 0;
    for (let ch = 0; ch < nCh; ch++) {
        const data = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) {
            const a = Math.abs(data[i]);
            if (a > samplePeak) samplePeak = a;
        }
    }

    // K-weight each channel up front.
    const weighted = [];
    for (let ch = 0; ch < nCh; ch++) {
        weighted.push(kWeight(buf.getChannelData(ch)));
    }

    const blockLen = Math.round(BLOCK_SECONDS * sr);
    const hop = Math.round(HOP_SECONDS * sr);

    // Per block, the channel-weighted sum of mean-squares (the quantity that
    // gets log'd). Store it once so both gating passes reuse it.
    const blockZ = []; // Σ_ch G_ch * meanSquare_ch
    for (let start = 0; start + blockLen <= len; start += hop) {
        let z = 0;
        for (let ch = 0; ch < nCh; ch++) {
            const w = weighted[ch];
            let sum = 0;
            for (let i = start; i < start + blockLen; i++) sum += w[i] * w[i];
            z += CHANNEL_WEIGHT * (sum / blockLen);
        }
        blockZ.push(z);
    }

    const loudnessOf = z => (z > 0 ? OFFSET + (10 * Math.log10(z)) : -Infinity);

    // Absolute gate.
    const absKept = blockZ.filter(z => loudnessOf(z) >= ABSOLUTE_GATE_LUFS);
    if (absKept.length === 0) {
        return {lufs: -Infinity, samplePeak, samplePeakDb: dbfs(samplePeak), nBlocks: blockZ.length, nGatedBlocks: 0};
    }

    // Relative threshold: -10 LU below the absolute-gated mean.
    const absMean = absKept.reduce((s, z) => s + z, 0) / absKept.length;
    const relThreshold = loudnessOf(absMean) + RELATIVE_GATE_LU;

    const relKept = blockZ.filter(z => loudnessOf(z) >= relThreshold && loudnessOf(z) >= ABSOLUTE_GATE_LUFS);
    if (relKept.length === 0) {
        return {lufs: -Infinity, samplePeak, samplePeakDb: dbfs(samplePeak), nBlocks: blockZ.length, nGatedBlocks: 0};
    }
    const relMean = relKept.reduce((s, z) => s + z, 0) / relKept.length;

    return {
        lufs: loudnessOf(relMean),
        samplePeak,
        samplePeakDb: dbfs(samplePeak),
        nBlocks: blockZ.length,
        nGatedBlocks: relKept.length
    };
};

const dbfs = x => (x > 0 ? 20 * Math.log10(x) : -Infinity);

// --- Self-test ---------------------------------------------------------------
// Validates the implementation without an external reference WAV:
//   1) coefficient sanity via the analytic transfer function at DC and Nyquist
//      (catches a transposed/typo'd coefficient — independent of the LUFS math),
//   2) silence → -Infinity (gating works),
//   3) -6.02 dB amplitude → -6.02 LU (the MS/log/gating pipeline is correct),
//   4) a near-full-scale 1 kHz sine lands in a sane absolute band.
// Returns {ok, checks:[{name, ok, detail}]}.
export const runSelfTest = () => {
    const checks = [];
    const approx = (a, b, tol) => Math.abs(a - b) <= tol;

    // (1) Transfer function H(z) at z=+1 (DC) and z=-1 (Nyquist): for a biquad,
    // H(1) = (b0+b1+b2)/(1+a1+a2), H(-1) = (b0-b1+b2)/(1-a1+a2).
    const Hdc = c => (c.b0 + c.b1 + c.b2) / (1 + c.a1 + c.a2);
    const Hny = c => (c.b0 - c.b1 + c.b2) / (1 - c.a1 + c.a2);
    const s1dc = Hdc(K_STAGE1);
    const s1ny = Hny(K_STAGE1);
    const s2dc = Hdc(K_STAGE2);
    const s2ny = Hny(K_STAGE2);
    checks.push({name: 'stage1 DC ≈ 0 dB', ok: approx(s1dc, 1.0, 0.01), detail: `${(20 * Math.log10(s1dc)).toFixed(3)} dB`});
    checks.push({name: 'stage1 Nyquist ≈ +4 dB', ok: approx(20 * Math.log10(s1ny), 4.0, 0.1), detail: `${(20 * Math.log10(s1ny)).toFixed(3)} dB`});
    checks.push({name: 'stage2 DC ≈ -inf (HPF)', ok: Math.abs(s2dc) < 0.01, detail: `${s2dc.toExponential(2)}`});
    checks.push({name: 'stage2 Nyquist ≈ 0 dB', ok: approx(s2ny, 1.0, 0.01), detail: `${(20 * Math.log10(s2ny)).toFixed(3)} dB`});

    const sr = 48000;
    const makeSine = (freq, amp, seconds, channels = 2) => {
        const length = Math.round(sr * seconds);
        const data = [];
        for (let ch = 0; ch < channels; ch++) {
            const a = new Float32Array(length);
            for (let i = 0; i < length; i++) a[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
            data.push(a);
        }
        return {numberOfChannels: channels, length, sampleRate: sr, getChannelData: i => data[i]};
    };
    const quiet = () => { /* swallow off-rate warning; we render at 48k here anyway */ };

    // (2) silence.
    const sil = measureLoudness(makeSine(1000, 0, 3), {warn: quiet});
    checks.push({name: 'silence → -Infinity', ok: sil.lufs === -Infinity, detail: `${sil.lufs}`});

    // (3) relativity: halving amplitude drops LUFS by 6.02.
    const full = measureLoudness(makeSine(1000, 0.5, 3), {warn: quiet});
    const half = measureLoudness(makeSine(1000, 0.25, 3), {warn: quiet});
    const drop = full.lufs - half.lufs;
    checks.push({name: '-6 dB amplitude → -6.02 LU', ok: approx(drop, 6.02, 0.05), detail: `Δ=${drop.toFixed(3)} LU`});

    // (4) sane absolute band for a 1 kHz, -6 dBFS-peak stereo sine.
    checks.push({name: '1 kHz sine in sane band', ok: full.lufs > -20 && full.lufs < 0, detail: `${full.lufs.toFixed(2)} LUFS`});

    return {ok: checks.every(c => c.ok), checks};
};
