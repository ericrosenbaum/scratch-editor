// Headless loudness-measurement surface for the Song Maker mix calibration.
// Served by the dev server at /song-loudness.html. The Node command
// (eval/song-ai/commands/measure-loudness.mjs) attaches over CDP and calls
// window.__songLoudness — see eval/song-ai/lib/loudness-driver.mjs. No UI.
//
// It boots a bare VM with an AudioEngine, loads the `music` extension (which
// decodes the instrument/drum sample MP3s), then renders each instrument /
// preset through the REAL scheduler (SongScheduler) into a 48 kHz
// OfflineAudioContext and measures integrated LUFS + sample peak. Rendering
// through the shipping scheduler — not a reimplementation — is what makes the
// numbers track production. We import the GUI preset catalogs and stuff their
// params into the test track so we measure exactly the preset a user picks.
//
// Why 48 kHz: the K-weighting coefficients in lufs.mjs are the literal BS.1770
// 48 kHz values; Web Audio resamples the 44.1 kHz sample buffers for free.
//
// Why direct _scheduleNote instead of scheduler.start(): start() installs a
// 25 ms wall-clock setInterval that reads audioContext.currentTime — which
// stays 0 in an OfflineAudioContext until startRendering(). So we schedule the
// note(s) directly and render. This runs 100% real voice code, just without the
// wall-clock transport.

import VM from '@scratch/scratch-vm';
import AudioEngine from 'scratch-audio';
import SongScheduler from '@scratch/scratch-vm/src/extensions/scratch3_songs/scheduler';

import {SYNTH_PRESETS} from '../lib/synth-presets';
import {SYNTH_DRUM_PRESETS, INSTRUMENT_NAMES, DRUM_NAMES} from '../lib/song-defaults';
import {measureLoudness} from '../../eval/song-ai/lib/lufs.mjs';

const SR = 48000;
const RENDER_SECONDS = 3.5; // 2.0 s sustain + release/decay tail
const TEST_VELOCITY = 100;
const TEST_PITCH = 60; // C4
const SUSTAIN_STEPS = 16; // at tempo 120 / 4 steps-per-beat = 0.125 s/step → 2.0 s

// --- VM + music boot ---------------------------------------------------------
const vm = new VM();
vm.attachAudioEngine(new AudioEngine());
vm.setCompatibilityMode(true);
vm.start();
// Expose for debugging / fallback inspection.
window.vm = vm;

let musicLoadError = null;
try {
    vm.extensionManager.loadExtensionIdSync('music');
} catch (e) {
    musicLoadError = (e && e.message) || String(e);
}

const music = () => vm.runtime._musicExtension || null;

// Resolve once the sample MP3s have decoded (async in the music extension).
const ready = async () => {
    if (musicLoadError) return {ok: false, reason: `music extension failed to load: ${musicLoadError}`};
    const m = music();
    if (!m) return {ok: false, reason: 'no music extension on runtime'};
    for (let i = 0; i < 100; i++) {
        const drum0 = m.getDrumPlayer(0);
        const inst0 = m.getInstrumentPlayer(0, TEST_PITCH);
        if (drum0 && drum0.buffer && inst0 && inst0.player && inst0.player.buffer) {
            return {ok: true, sampleRate: drum0.buffer.sampleRate};
        }
        await new Promise(done => setTimeout(done, 100));
    }
    return {ok: false, reason: 'sample buffers did not decode within 10 s'};
};

// --- target catalog ----------------------------------------------------------
const named = (n, names, prefix) =>
    Array.from({length: n}, (_, i) => ({index: i, name: names[i] || `${prefix}${i}`}));

const listTargets = () => {
    const m = music();
    const nInstruments = m && m.INSTRUMENT_INFO ? m.INSTRUMENT_INFO.length : INSTRUMENT_NAMES.length;
    const nDrums = m && m.DRUM_INFO ? m.DRUM_INFO.length : DRUM_NAMES.length;
    return {
        instruments: named(nInstruments, INSTRUMENT_NAMES, 'inst'),
        drums: named(nDrums, DRUM_NAMES, 'drum'),
        synths: SYNTH_PRESETS.map((p, i) => ({index: i, name: p.name})),
        synthDrums: SYNTH_DRUM_PRESETS.map((p, i) => ({index: i, name: p.name}))
    };
};

// --- one measurement ---------------------------------------------------------
const TRACK_ID = 'm';
const BASE_SONG = {tempo: 120, lengthSteps: 64, stepsPerBeat: 4, rootPitch: 60, scaleType: 'chromatic'};

// Build the {song, note} pair for a target. volume 100 + neutral effects keep
// the per-track chain transparent (unity gain + the fixed 12 kHz lowpass, which
// is flat at C4), so we measure the raw instrument on the real signal path.
const mkNote = (kind, extra) => ({
    trackId: TRACK_ID,
    kind,
    instrument: 0,
    drum: 0,
    velocity: TEST_VELOCITY,
    step: 0,
    durationSteps: 1,
    pitch: TEST_PITCH,
    ...extra
});

const buildCase = (family, index) => {
    const common = {trackId: TRACK_ID, volume: 100, effects: {}, muted: false, notes: []};
    if (family === 'instrument') {
        return {
            song: {...BASE_SONG, tracks: [{...common, kind: 'instrument', instrument: index + 1}]},
            note: mkNote('instrument', {instrument: index, durationSteps: SUSTAIN_STEPS})
        };
    }
    if (family === 'drum') {
        return {
            song: {...BASE_SONG, tracks: [{...common, kind: 'drum'}]},
            note: mkNote('drum', {drum: index})
        };
    }
    if (family === 'synth') {
        const preset = SYNTH_PRESETS[index];
        return {
            song: {...BASE_SONG, tracks: [{...common, kind: 'synth', synth: {...preset, preset: preset.name}}]},
            note: mkNote('synth', {durationSteps: SUSTAIN_STEPS})
        };
    }
    if (family === 'synthDrum') {
        const preset = SYNTH_DRUM_PRESETS[index];
        const presetIndex = index + 1; // getDrumVoice keys are 1-based
        // Real lanes (voiceParamsForPreset) store the preset NAME under `preset`;
        // the GUI catalog entry uses `name`. getDrumVoice keys trims off `preset`,
        // so map it across or every lane falls back to the default ('Kick').
        const laneParams = {...preset, preset: preset.name};
        return {
            song: {...BASE_SONG, tracks: [{...common, kind: 'synthDrum', drumVoices: {[presetIndex]: laneParams}}]},
            note: mkNote('synthDrum', {drum: index})
        };
    }
    throw new Error(`unknown family ${family}`);
};

const measureOne = async ({family, index}) => {
    const m = music();
    if (!m) throw new Error('music extension not ready');
    const {song, note} = buildCase(family, index);
    const oac = new OfflineAudioContext(2, Math.ceil(SR * RENDER_SECONDS), SR);
    const sched = new SongScheduler({
        song,
        audioContext: oac,
        destination: oac.destination,
        getInstrumentBuffer: (instIdx, midiNote) => {
            const info = m.getInstrumentPlayer(instIdx, midiNote);
            if (!info || !info.player || !info.player.buffer) return null;
            const {player, sampleNote, releaseTime} = info;
            return {buffer: player.buffer, sampleNote, releaseTime};
        },
        getDrumBuffer: drumIdx => {
            const p = m.getDrumPlayer(drumIdx);
            return p && p.buffer;
        }
    });
    // Schedule directly (no wall-clock transport — see file header), small
    // offset so the attack isn't clipped at t=0.
    sched._scheduleNote(note, 0.05);
    const rendered = await oac.startRendering();
    const {lufs, samplePeak, samplePeakDb, nGatedBlocks} = measureLoudness(rendered, {warn: () => {}});
    // family+'s' is the listTargets key for every family ('synthDrum' → 'synthDrums').
    const entry = (listTargets()[`${family}s`] || [])[index];
    const name = (entry && entry.name) || `${family}${index}`;
    return {family, index, name, lufs, samplePeak, samplePeakDb, nGatedBlocks};
};

// --- whole-song render (clipping / distortion diagnostics) -------------------
// Renders a full library payload (every track, every note) through the real
// scheduler, optionally through a faithful copy of the song master bus
// (song-playback.js _masterBus: makeup 1.0 → DynamicsCompressor limiter), and
// reports the rendered sample peak + how many samples exceed 0 dBFS. An
// OfflineAudioContext does NOT clamp to [-1, 1], so samplePeak > 1.0 on the
// post-limiter render is signal that WILL hard-clip (distort) on real hardware.
const MASTER_MAKEUP_GAIN = 1.0;
const MASTER_LIMITER = {threshold: -3, knee: 0, ratio: 20, attack: 0.003, release: 0.25};

const clipStats = rendered => {
    let peak = 0;
    let clipped = 0;
    let total = 0;
    for (let c = 0; c < rendered.numberOfChannels; c++) {
        const data = rendered.getChannelData(c);
        total += data.length;
        for (let i = 0; i < data.length; i++) {
            const a = Math.abs(data[i]);
            if (a > peak) peak = a;
            if (a > 1.0) clipped++;
        }
    }
    return {
        samplePeak: peak,
        samplePeakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
        clippedSamples: clipped,
        clippedFraction: total ? clipped / total : 0
    };
};

// Soft-clip ("clipper") curve for a WaveShaper: transparent below `knee`, then a
// tanh approach to `ceiling`, so the output magnitude can never exceed `ceiling`
// (inputs past ±1 clamp to the curve endpoints, which are ≤ ceiling). Catches
// the fast transients a DynamicsCompressor's attack window lets through.
const makeSoftClipCurve = (ceiling, knee) => {
    const N = 4096;
    const curve = new Float32Array(N);
    const span = Math.max(1e-3, ceiling - knee);
    for (let i = 0; i < N; i++) {
        const x = ((i / (N - 1)) * 2) - 1;
        const a = Math.abs(x);
        const y = a <= knee ? a : knee + (span * Math.tanh((a - knee) / span));
        curve[i] = Math.sign(x) * y;
    }
    return curve;
};

const measureSong = async ({payload, limiter = true, master = null}) => {
    const m = music();
    if (!m) throw new Error('music extension not ready');
    const tempo = payload.tempo || 120;
    const stepsPerBeat = payload.stepsPerBeat || 4;
    const lengthSteps = payload.lengthSteps || 32;
    const secPerStep = 60 / (tempo * stepsPerBeat);
    const offset = 0.05;
    const tail = 2.5; // release/reverb/delay decay
    const seconds = offset + (lengthSteps * secPerStep) + tail;
    const oac = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);

    let destination = oac.destination;
    if (limiter) {
        const cfg = {
            makeup: MASTER_MAKEUP_GAIN,
            threshold: MASTER_LIMITER.threshold,
            knee: MASTER_LIMITER.knee,
            ratio: MASTER_LIMITER.ratio,
            attack: MASTER_LIMITER.attack,
            release: MASTER_LIMITER.release,
            softClipCeiling: null,
            softClipKnee: 0.8,
            ...(master || {})
        };
        const input = oac.createGain();
        input.gain.value = cfg.makeup;
        const lim = oac.createDynamicsCompressor();
        lim.threshold.setValueAtTime(cfg.threshold, 0);
        lim.knee.setValueAtTime(cfg.knee, 0);
        lim.ratio.setValueAtTime(cfg.ratio, 0);
        lim.attack.setValueAtTime(cfg.attack, 0);
        lim.release.setValueAtTime(cfg.release, 0);
        input.connect(lim);
        let tailNode = lim;
        if (cfg.softClipCeiling) {
            const clip = oac.createWaveShaper();
            clip.curve = makeSoftClipCurve(cfg.softClipCeiling, cfg.softClipKnee);
            clip.oversample = '4x';
            lim.connect(clip);
            tailNode = clip;
        }
        tailNode.connect(oac.destination);
        destination = input;
    }

    const tracks = (payload.tracks || []).map((t, i) => ({...t, trackId: `t${i}`}));
    const song = {tempo, lengthSteps, stepsPerBeat, rootPitch: 60, scaleType: 'chromatic', tracks};
    const sched = new SongScheduler({
        song,
        audioContext: oac,
        destination,
        getInstrumentBuffer: (instIdx, midiNote) => {
            const info = m.getInstrumentPlayer(instIdx, midiNote);
            if (!info || !info.player || !info.player.buffer) return null;
            const {player, sampleNote, releaseTime} = info;
            return {buffer: player.buffer, sampleNote, releaseTime};
        },
        getDrumBuffer: drumIdx => {
            const p = m.getDrumPlayer(drumIdx);
            return p && p.buffer;
        }
    });

    let scheduled = 0;
    for (const t of tracks) {
        const isDrum = t.kind === 'drum';
        for (const n of (t.notes || [])) {
            const when = offset + (n.step * secPerStep);
            const note = isDrum ?
                {trackId: t.trackId,
                    kind: 'drum',
                    drum: n.drum - 1,
                    velocity: n.velocity,
                    step: n.step,
                    durationSteps: n.durationSteps} :
                {trackId: t.trackId,
                    kind: 'instrument',
                    instrument: t.instrument - 1,
                    pitch: n.pitch,
                    velocity: n.velocity,
                    step: n.step,
                    durationSteps: n.durationSteps};
            sched._scheduleNote(note, when);
            scheduled++;
        }
    }

    const rendered = await oac.startRendering();
    const clip = clipStats(rendered);
    const {lufs} = measureLoudness(rendered, {warn: () => {}});
    return {limiter, scheduled, seconds, lufs, ...clip};
};

const measureAll = async () => {
    const targets = listTargets();
    const families = [
        ['instrument', targets.instruments],
        ['drum', targets.drums],
        ['synth', targets.synths],
        ['synthDrum', targets.synthDrums]
    ];
    const results = [];
    for (const [family, list] of families) {
        for (const t of list) {
            results.push(await measureOne({family, index: t.index}));
        }
    }
    return {results, sampleRate: SR, velocity: TEST_VELOCITY, pitch: TEST_PITCH};
};

window.__songLoudness = {ready, listTargets, measureOne, measureAll, measureSong};

// eslint-disable-next-line no-console
console.log('[song-loudness] window.__songLoudness ready');
