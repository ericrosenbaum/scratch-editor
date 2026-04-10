/**
 * Fake audio source for Playwright tests.
 *
 * Wraps the real getUserMedia (which returns Chromium's synthetic audio via
 * --use-fake-device-for-media-stream) and mixes in a controllable oscillator.
 * This way the MediaStream is "real" from Chrome's perspective, but we can
 * shift the dominant frequency to produce distinct training data for each class.
 *
 * Control from the test:
 *   page.evaluate(() => window._setFakeAudio('sine', 440));
 *   page.evaluate(() => window._setFakeAudio('sine', 880));
 *   page.evaluate(() => window._setFakeAudio('off'));          // original fake stream only
 */

(function () {
    let audioCtx = null;
    let oscillator = null;
    let oscGain = null;

    function ensureAudioCtx () {
        if (audioCtx) return audioCtx;
        audioCtx = new AudioContext({sampleRate: 44100});
        if (audioCtx.state === 'suspended') audioCtx.resume();

        oscGain = audioCtx.createGain();
        oscGain.gain.value = 0;
        // oscGain will be connected to destinations as streams are created

        return audioCtx;
    }

    /**
     * Switch the injected tone.
     * @param {string} type   - 'sine'|'square'|'sawtooth'|'triangle'|'off'
     * @param {number} [freq] - Hz (ignored for 'off')
     */
    function setFakeAudio (type, freq) {
        ensureAudioCtx();

        // Tear down old oscillator
        if (oscillator) {
            oscillator.stop();
            oscillator.disconnect();
            oscillator = null;
        }

        if (type === 'off') {
            oscGain.gain.value = 0;
            console.log('[fake-audio] oscillator off');
            return;
        }

        oscillator = audioCtx.createOscillator();
        oscillator.type = type || 'sine';
        oscillator.frequency.value = freq || 440;
        oscillator.connect(oscGain);
        oscGain.gain.value = 0.95;
        oscillator.start();
        console.log(`[fake-audio] oscillator: ${oscillator.type} @ ${freq} Hz`);
    }

    window._setFakeAudio = setFakeAudio;

    // Track all destinations so we can connect/disconnect the real source
    const destinations = [];
    let realGainNodes = [];

    // Patch getUserMedia to mix our oscillator into every audio stream
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function (constraints) {
        // Get the real stream (Chromium's fake device)
        const realStream = await original(constraints);

        // Only process audio streams
        if (!constraints || !constraints.audio) return realStream;

        const ctx = ensureAudioCtx();
        const dest = ctx.createMediaStreamDestination();

        // Connect the real mic stream through (quiet)
        const realSource = ctx.createMediaStreamSource(realStream);
        const realGain = ctx.createGain();
        realGain.gain.value = 0.1;
        realSource.connect(realGain);
        realGain.connect(dest);
        realGainNodes.push(realGain);

        // Connect the oscillator mixer
        oscGain.connect(dest);
        destinations.push(dest);

        console.log('[fake-audio] getUserMedia intercepted — mixed stream returned');
        return dest.stream;
    };

    /**
     * Mute/unmute the real Chromium fake device signal.
     * When testing background, we want near-silence so the model detects background.
     */
    window._setFakeDeviceGain = function (gain) {
        for (const g of realGainNodes) {
            g.gain.value = gain;
        }
    };
})();
