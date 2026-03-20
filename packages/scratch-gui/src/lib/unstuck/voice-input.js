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
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.continuous = false;

        recognition.onstart = function () {
            if (options.onStart) options.onStart();
        };

        recognition.onresult = function (event) {
            const transcript = event.results[0][0].transcript;
            resolve(transcript);
        };

        recognition.onerror = function (event) {
            reject(new Error(event.error));
        };

        recognition.onend = function () {
            if (options.onEnd) options.onEnd();
        };

        recognition.start();
    });
};

export {isSupported, listen};
