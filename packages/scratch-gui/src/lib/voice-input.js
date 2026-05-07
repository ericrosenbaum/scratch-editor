// Wrapper around the Web Speech API (SpeechRecognition) for live-transcribed
// prompt input. Gracefully degrades: isSupported() returns false on browsers
// without the API.

const isSupported = () =>
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

/**
 * Start listening for speech.
 * @param {object} [options]
 * @param {string} [options.lang] - Language code (default: 'en-US')
 * @param {function} [options.onStart]
 * @param {function} [options.onEnd]
 * @param {function} [options.onInterim] - Called with the live transcript
 *   (final + interim) as the user speaks.
 * @returns {{promise: Promise<string>, stop: function}} promise resolves with
 *   the final transcript, or rejects on error/no-speech. stop() ends the
 *   session early (the promise will resolve with whatever has been captured,
 *   or reject with 'no-speech' if nothing was captured).
 */
const listen = (options = {}) => {
    if (!isSupported()) {
        return {
            promise: Promise.reject(new Error('Speech recognition not supported')),
            stop: () => {}
        };
    }

    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = options.lang || 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    let finalTranscript = '';
    let lastInterim = '';

    const promise = new Promise((resolve, reject) => {
        recognition.onstart = () => {
            if (options.onStart) options.onStart();
        };
        recognition.onresult = event => {
            let interim = '';
            let final = '';
            for (let i = 0; i < event.results.length; i++) {
                const r = event.results[i];
                if (r.isFinal) final += r[0].transcript;
                else interim += r[0].transcript;
            }
            finalTranscript = final;
            lastInterim = interim;
            if (options.onInterim) options.onInterim(final + interim);
        };
        recognition.onerror = event => {
            if (event.error === 'aborted' || event.error === 'no-speech') {
                const text = (finalTranscript + lastInterim).trim();
                if (text) resolve(text);
                else reject(new Error(event.error));
                return;
            }
            reject(new Error(event.error));
        };
        recognition.onend = () => {
            if (options.onEnd) options.onEnd();
            const text = (finalTranscript + lastInterim).trim();
            if (text) resolve(text);
            else reject(new Error('no-speech'));
        };
        try {
            recognition.start();
        } catch (e) {
            reject(e);
        }
    });

    const stop = () => {
        try {
            recognition.stop();
        } catch (e) {
            // ignore
        }
    };

    return {promise, stop};
};

export {isSupported, listen};
