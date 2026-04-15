/**
 * Voice input for the "Get Unstuck" feature.
 * Uses the Web Speech API (SpeechRecognition) to transcribe spoken questions.
 * Gracefully degrades: if the API is unavailable, isSupported() returns false.
 */

/**
 * Check if the Web Speech API is available.
 * @returns {boolean} True if speech recognition is supported.
 */
const isSupported = function () {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
};

/**
 * Start listening for speech and return a promise that resolves with the transcript.
 * @param {object} [options] - Options
 * @param {string} [options.lang] - Language code (default: 'en-US')
 * @param {function} [options.onStart] - Called when recognition starts
 * @param {function} [options.onEnd] - Called when recognition ends
 * @param {function} [options.onInterim] - Called with the live transcript (final + interim) as the user speaks
 * @returns {Promise<string>} The transcribed text
 */
const listen = function (options = {}) {
    return new Promise((resolve, reject) => {
        if (!isSupported()) {
            reject(new Error('Speech recognition not supported'));
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.lang = options.lang || 'en-US';
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.continuous = false;

        let hasResult = false;

        recognition.onstart = function () {
            if (options.onStart) options.onStart();
        };

        recognition.onresult = function (event) {
            let finalTranscript = '';
            let interimTranscript = '';
            for (let i = 0; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTranscript += result[0].transcript;
                } else {
                    interimTranscript += result[0].transcript;
                }
            }
            if (options.onInterim) {
                options.onInterim(finalTranscript + interimTranscript);
            }
            if (finalTranscript && !hasResult) {
                hasResult = true;
                resolve(finalTranscript);
            }
        };

        recognition.onerror = function (event) {
            reject(new Error(event.error));
        };

        recognition.onend = function () {
            if (options.onEnd) options.onEnd();
            if (!hasResult) {
                reject(new Error('no-speech'));
            }
        };

        recognition.start();
    });
};

export {isSupported, listen};
