// Percussion voice synthesis for "synthDrum" tracks. Shared by the scheduler
// (SongScheduler._scheduleSynthDrumNote) and the editor preview
// (SongPlayback._previewSynthDrumNote) so the synth is written exactly once.
//
// A voice = a pitched body oscillator with a downward pitch envelope + a
// band-passed white-noise burst + optional tanh drive, summed and scaled by
// velocity. It is a one-shot: amplitude is envelope-driven, so note duration is
// ignored (a hi-hat rings for its noiseDecay regardless of the grid cell width).
//
// Param ranges (see synth-drum-presets.js for authoring docs):
//   bodyWave 'sine'|'square'|'sawtooth'|'triangle'
//   tune 0..1 -> 30..1500 Hz (exp)      pitchEnv 0..1 -> 0..3 octaves up
//   pitchDecay/bodyDecay/noiseDecay seconds   bodyLevel/noiseLevel 0..1
//   noiseColor 0..1 -> 200..12000 Hz bandpass center   drive 0..1

const {velocityToGain} = require('./instrument-gain');

const clamp01 = x => Math.max(0, Math.min(1, Number(x) || 0));

// One second of mono white noise, cached on the AudioContext and reused by
// every voice (looped, then stopped at the voice's tail). AudioBuffers of a
// matching sample rate are safe to share across voices.
const getNoiseBuffer = ctx => {
    if (ctx.__songNoiseBuffer) return ctx.__songNoiseBuffer;
    const len = Math.max(1, Math.floor(ctx.sampleRate * 1.0));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2) - 1;
    ctx.__songNoiseBuffer = buf;
    return buf;
};

const DRIVE_SAMPLES = 1024;
// tanh saturation curve, normalized so the endpoints stay at ±1. amount 0 is
// effectively linear; higher amounts crush harder.
const makeDriveCurve = amount => {
    const k = amount * 12;
    const curve = new Float32Array(DRIVE_SAMPLES);
    const denom = Math.tanh(k) || 1;
    for (let i = 0; i < DRIVE_SAMPLES; i++) {
        const x = ((i / (DRIVE_SAMPLES - 1)) * 2) - 1;
        curve[i] = k < 0.0001 ? x : Math.tanh(k * x) / denom;
    }
    return curve;
};

/**
 * Build and start a one-shot percussion voice.
 * @param {AudioContext} ctx
 * @param {object} params - resolved voice params (see above)
 * @param {number} when - ctx time to start
 * @param {number} velocity - MIDI 1..127
 * @param {AudioNode} destination - node to connect the voice output to
 * @param {number} [trim] - per-preset loudness trim (linear, default 1) from
 *   instrument-gain.js, equalizing this preset against the other families.
 * @returns {object} voice wrapper: {_scheduledStart, _trackId, onEnded,
 *   stop(t), disconnect()} — same surface SongScheduler._activeSources uses.
 */
const buildPercussionVoice = (ctx, params, when, velocity, destination, trim = 1) => {
    const p = params || {};
    // Shared velocity curve (matches sampled-drum / synth voices), with the same
    // 0.7 peak headroom (body + noise can both approach 1 before this) and the
    // per-preset loudness trim folded in.
    const velGain = velocityToGain(velocity) * (typeof trim === 'number' ? trim : 1);

    const baseFreq = 30 * Math.pow(50, clamp01(p.tune));
    const startFreq = Math.min(18000, baseFreq * Math.pow(2, clamp01(p.pitchEnv) * 3));
    const pitchDecay = Math.max(0.001, Math.min(0.5, Number(p.pitchDecay) || 0));
    const bodyDecay = Math.max(0.005, Math.min(2, Number(p.bodyDecay) || 0.1));
    const noiseDecay = Math.max(0.005, Math.min(2, Number(p.noiseDecay) || 0.1));
    const bodyLevel = clamp01(p.bodyLevel);
    const noiseLevel = clamp01(p.noiseLevel);

    const nodes = [];
    const mix = ctx.createGain();
    mix.gain.value = 1;
    nodes.push(mix);

    let bodyOsc = null;
    if (bodyLevel > 0.001) {
        bodyOsc = ctx.createOscillator();
        bodyOsc.type = p.bodyWave || 'sine';
        bodyOsc.frequency.cancelScheduledValues(when);
        bodyOsc.frequency.setValueAtTime(startFreq, when);
        // exponentialRamp needs strictly-positive targets; baseFreq always is.
        bodyOsc.frequency.exponentialRampToValueAtTime(Math.max(1, baseFreq), when + pitchDecay);
        const bodyGain = ctx.createGain();
        bodyGain.gain.cancelScheduledValues(when);
        bodyGain.gain.setValueAtTime(bodyLevel, when);
        bodyGain.gain.exponentialRampToValueAtTime(0.0001, when + bodyDecay);
        bodyOsc.connect(bodyGain);
        bodyGain.connect(mix);
        nodes.push(bodyOsc, bodyGain);
    }

    let noiseSrc = null;
    if (noiseLevel > 0.001) {
        noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = getNoiseBuffer(ctx);
        noiseSrc.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 200 * Math.pow(60, clamp01(p.noiseColor));
        bp.Q.value = 0.8;
        const noiseGain = ctx.createGain();
        noiseGain.gain.cancelScheduledValues(when);
        noiseGain.gain.setValueAtTime(noiseLevel, when);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, when + noiseDecay);
        noiseSrc.connect(bp);
        bp.connect(noiseGain);
        noiseGain.connect(mix);
        nodes.push(noiseSrc, bp, noiseGain);
    }

    // Optional drive: only inserted when asked for, so the clean path never
    // routes through a waveshaper (whose ±1 input domain would clip a hot mix).
    let chainOut = mix;
    if (clamp01(p.drive) > 0.001) {
        const pre = ctx.createGain();
        pre.gain.value = 0.7;
        const shaper = ctx.createWaveShaper();
        shaper.curve = makeDriveCurve(clamp01(p.drive));
        shaper.oversample = '2x';
        mix.connect(pre);
        pre.connect(shaper);
        chainOut = shaper;
        nodes.push(pre, shaper);
    }

    const master = ctx.createGain();
    master.gain.value = velGain * 0.7;
    chainOut.connect(master);
    master.connect(destination);
    nodes.push(master);

    const stopAt = when + Math.max(bodyDecay, noiseDecay, pitchDecay) + 0.05;
    try {
        if (bodyOsc) {
            bodyOsc.start(when);
            bodyOsc.stop(stopAt);
        }
        if (noiseSrc) {
            noiseSrc.start(when);
            noiseSrc.stop(stopAt);
        }
    } catch (e) { /* ignore */ }

    const voice = {
        _scheduledStart: when,
        _trackId: null,
        // Caller may set onEnded to run extra cleanup (e.g. splice from an
        // active-voice list) when the voice finishes.
        onEnded: null,
        stop (t) {
            try {
                if (bodyOsc) bodyOsc.stop(t);
            } catch (e) { /* ignore */ }
            try {
                if (noiseSrc) noiseSrc.stop(t);
            } catch (e) { /* ignore */ }
        },
        disconnect () {
            for (const n of nodes) {
                try {
                    n.disconnect();
                } catch (e) { /* ignore */ }
            }
        }
    };

    // Drive cleanup off whichever source node we created (both stop together).
    const driver = bodyOsc || noiseSrc;
    if (driver) {
        driver.onended = () => {
            voice.disconnect();
            if (typeof voice.onEnded === 'function') voice.onEnded();
        };
    }

    return voice;
};

module.exports = {
    buildPercussionVoice
};
