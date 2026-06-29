/**
 * Test helper: a deterministic Web Audio environment for Song Maker scheduler
 * and playback tests, built on `web-audio-test-api`.
 *
 * Why this exists:
 *   - The Song scheduler/playback needs `runtime.audioEngine.audioContext` to
 *     build its master bus and per-track FX chains. In Node there is no real
 *     AudioContext, so we wire a mock one.
 *   - `web-audio-test-api` gates `createStereoPanner` behind a feature flag
 *     (the scheduler's track chain uses it), so we enable it once on require.
 *   - The real transport drives itself with `setInterval(_tick, 25)` against
 *     wall-clock time, which is non-deterministic and would also keep the Node
 *     event loop alive past a test. `startDeterministic()` starts the transport
 *     and immediately kills the interval so the test can drive the mock clock
 *     itself via `advance()`.
 */

const WebAudioTestAPI = require('web-audio-test-api');

// The scheduler's per-track chain calls ctx.createStereoPanner(); enable it.
// Idempotent — safe to call from every test file that requires this helper.
WebAudioTestAPI.setState({'AudioContext#createStereoPanner': 'enabled'});

/** @returns {object} a fresh mock audio context (currentTime starts at 0). */
const makeAudioContext = () => new WebAudioTestAPI.AudioContext();

/**
 * Give a VM runtime a minimal audio engine backed by a mock AudioContext, so
 * `runtime.songPlayback` can spin up a real SongScheduler. Returns the context
 * so the test can advance its clock.
 * @param {object} vm - a VirtualMachine instance
 * @returns {object} the mock audio context (currentTime starts at 0)
 */
const attachFakeAudio = vm => {
    const ctx = makeAudioContext();
    vm.runtime.audioEngine = {
        audioContext: ctx,
        getInputNode: () => ctx.destination
    };
    return ctx;
};

/**
 * Format seconds as the "MM:SS.mmm" string web-audio-test-api's $processTo wants.
 * @param {number} sec - time in seconds
 * @returns {string} the formatted time string
 */
const fmtTime = sec => {
    const m = Math.floor(sec / 60);
    return `${String(m).padStart(2, '0')}:${(sec - (m * 60)).toFixed(3).padStart(6, '0')}`;
};

/**
 * Start a scheduler and detach its real `setInterval` timer so the test fully
 * controls time via `advance()`. The first synchronous `_tick()` (run inside
 * start()) still happens, so step-0 notes are scheduled immediately.
 * @param {object} scheduler - a SongScheduler instance
 * @param {object} [opts] - forwarded to scheduler.start()
 */
const startDeterministic = (scheduler, opts) => {
    scheduler.start(opts);
    if (scheduler._timer) {
        clearInterval(scheduler._timer);
        scheduler._timer = null;
    }
};

/**
 * Drive a scheduler's clock from `fromSec` to `toSec` in `stepSec` increments,
 * advancing the mock context and calling `_tick()` at each step — the same
 * cadence the real `setInterval` would, but deterministic.
 * @param {object} ctx - the mock audio context
 * @param {object} scheduler - a SongScheduler instance
 * @param {object} opts - timing window
 * @param {number} [opts.fromSec] - start time in seconds (default 0.075)
 * @param {number} opts.toSec - end time in seconds (inclusive)
 * @param {number} [opts.stepSec] - tick increment in seconds (default 0.025)
 */
const advance = (ctx, scheduler, {fromSec = 0.075, toSec, stepSec = 0.025}) => {
    // Round to avoid floating-point drift accumulating in the time string.
    for (let t = fromSec; t <= toSec + 1e-9; t = Math.round((t + stepSec) * 1000) / 1000) {
        ctx.$processTo(fmtTime(t));
        scheduler._tick();
    }
};

module.exports = {
    WebAudioTestAPI,
    makeAudioContext,
    attachFakeAudio,
    fmtTime,
    startDeterministic,
    advance
};
