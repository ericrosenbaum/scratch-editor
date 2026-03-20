const ArgumentType = require('../../extension-support/argument-type');
const Cast = require('../../util/cast');
const BlockType = require('../../extension-support/block-type');
const formatMessage = require('format-message');
const log = require('../../util/log');
const DiffMatchPatch = require('diff-match-patch');


/**
 * Url of icon to be displayed at the left edge of each extension block.
 * @type {string}
 */
// eslint-disable-next-line @stylistic/max-len
const iconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjRkZGRkZGIj48cGF0aCBkPSJNMTIgMTRjMS42NiAwIDIuOTktMS4zNCAyLjk5LTNMMTUgNWMwLTEuNjYtMS4zNC0zLTMtM1M5IDMuMzQgOSA1djZjMCAxLjY2IDEuMzQgMyAzIDN6bTUuMy0zYzAgMy0yLjU0IDUuMS01LjMgNS4xUzYuNyAxNCA2LjcgMTFINWMwIDMuNDEgMi43MiA2LjIzIDYgNi43MlYyMWgydi0zLjI4YzMuMjgtLjQ4IDYtMy4zIDYtNi43MmgtMS43eiIvPjxwYXRoIGQ9Ik0wIDBoMjR2MjRIMHoiIGZpbGw9Im5vbmUiLz48L3N2Zz4K';


/**
 * Url of icon to be displayed in the toolbox menu for the extension category.
 * @type {string}
 */
// eslint-disable-next-line @stylistic/max-len
const menuIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNHB4IiBoZWlnaHQ9IjI0cHgiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzc1NzU3NSI+CiAgICA8cGF0aCBkPSJNMTIgMTRjMS42NiAwIDIuOTktMS4zNCAyLjk5LTNMMTUgNWMwLTEuNjYtMS4zNC0zLTMtM1M5IDMuMzQgOSA1djZjMCAxLjY2IDEuMzQgMyAzIDN6bTUuMy0zYzAgMy0yLjU0IDUuMS01LjMgNS4xUzYuNyAxNCA2LjcgMTFINWMwIDMuNDEgMi43MiA2LjIzIDYgNi43MlYyMWgydi0zLjI4YzMuMjgtLjQ4IDYtMy4zIDYtNi43MmgtMS43eiIvPgogICAgPHBhdGggZD0iTTAgMGgyNHYyNEgweiIgZmlsbD0ibm9uZSIvPgo8L3N2Zz4K';

/**
 * The max amount of time the Listen And Wait block will listen for.
 * @type {number}
 */
const listenAndWaitBlockTimeoutMs = 10000;

/**
 * RMS threshold below which audio is considered silence.
 * @type {number}
 */
const SILENCE_THRESHOLD = 0.01;

/**
 * Duration of silence (ms) after speech detected before stopping recording.
 * @type {number}
 */
const SILENCE_DURATION_MS = 1500;

/**
 * The target sample rate for Whisper input.
 * @type {number}
 */
const WHISPER_SAMPLE_RATE = 16000;


class Scratch3Speech2TextBlocks {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;

        /**
         * An array of phrases from the [when I hear] hat blocks.
         * @type {Array}
         * @private
         */
        this._phraseList = [];

        /**
         * The most recent transcription result.
         * @type {string}
         * @private
         */
        this._currentUtterance = '';

        /**
         * Used to get the hat blocks to edge trigger.
         * @type {string}
         * @private
         */
        this._utteranceForEdgeTrigger = null;

        /**
         * The list of queued `resolve` callbacks for 'Listen and Wait' blocks.
         * @type {!Array}
         * @private
         */
        this._speechPromises = [];

        /**
         * The id of the timeout for max listen duration.
         * @type {number}
         * @private
         */
        this._speechTimeoutId = null;

        /**
         * The AudioContext used to manage the microphone.
         * @type {AudioContext}
         * @private
         */
        this._context = null;

        /**
         * MediaStreamAudioSourceNode for the microphone.
         * @type {MediaStreamAudioSourceNode}
         * @private
         */
        this._sourceNode = null;

        /**
         * The ScriptProcessorNode for capturing audio data.
         * @type {ScriptProcessorNode}
         * @private
         */
        this._scriptNode = null;

        /**
         * A Promise for microphone access.
         * @type {Promise}
         * @private
         */
        this._audioPromise = null;

        /**
         * Whether we are currently recording audio.
         * @type {boolean}
         * @private
         */
        this._isRecording = false;

        /**
         * Buffer to accumulate recorded audio chunks.
         * @type {Array.<Float32Array>}
         * @private
         */
        this._audioChunks = [];

        /**
         * Whether speech has been detected during this recording session.
         * @type {boolean}
         * @private
         */
        this._speechDetected = false;

        /**
         * Timestamp of when silence began after speech was detected.
         * @type {number}
         * @private
         */
        this._silenceStartTime = 0;

        /**
         * Callback to stop recording and trigger transcription.
         * @type {Function}
         * @private
         */
        this._stopRecordingCallback = null;

        /**
         * Diff Match Patch for fuzzy matching of transcription results.
         */
        this._dmp = new DiffMatchPatch();
        this._dmp.Match_Threshold = 0.3;

        /**
         * Whether the Whisper model is ready for inference.
         * @type {boolean}
         * @private
         */
        this._modelReady = false;

        /**
         * The Web Worker running Whisper inference.
         * @type {Worker}
         * @private
         */
        this._worker = null;

        /**
         * Promise that resolves when the model is loaded.
         * @type {Promise}
         * @private
         */
        this._modelLoading = null;

        /**
         * Resolve function for the current transcription request.
         * @type {Function}
         * @private
         */
        this._transcriptionResolve = null;

        this._processAudioCallback = this._processAudioCallback.bind(this);
        this._resetListening = this._resetListening.bind(this);

        this.runtime.on('PROJECT_STOP_ALL', this._resetListening.bind(this));
        this.runtime.on('PROJECT_START', this._resetEdgeTriggerUtterance.bind(this));

        // Start loading the Whisper model immediately
        this._initializeWhisper();
    }

    /**
     * Initialize the Web Worker and begin loading the Whisper model.
     * @private
     */
    _initializeWhisper () {
        log.info('[Speech2Text] Starting Whisper initialization...');
        this.runtime.emit('EXTENSION_DATA_LOADING', true);

        log.info('[Speech2Text] Creating Web Worker from static/whisper-worker.js');
        try {
            this._worker = new Worker('./static/whisper-worker.js');
        } catch (e) {
            log.error(`[Speech2Text] Failed to create worker: ${e}`);
            this.runtime.emit('EXTENSION_DATA_LOADING', false);
            return;
        }
        log.info('[Speech2Text] Worker created successfully');

        this._worker.onerror = e => {
            log.error(`[Speech2Text] Worker error event: ${e.message} (${e.filename}:${e.lineno})`);
            this.runtime.emit('EXTENSION_DATA_LOADING', false);
        };

        this._modelLoading = new Promise((resolve, reject) => {
            this._worker.onmessage = event => {
                const {type} = event.data;
                log.info(`[Speech2Text] Worker message: ${type}`);
                if (type === 'ready') {
                    this._modelReady = true;
                    this.runtime.emit('EXTENSION_DATA_LOADING', false);
                    log.info('[Speech2Text] Whisper model loaded successfully');
                    this._worker.onmessage = this._onWorkerMessage.bind(this);
                    resolve();
                } else if (type === 'progress') {
                    log.info(`[Speech2Text] Model download: ${Math.round(event.data.progress)}% - ${event.data.file}`);
                } else if (type === 'error') {
                    log.error(`[Speech2Text] Model loading error: ${event.data.message}`);
                    this.runtime.emit('EXTENSION_DATA_LOADING', false);
                    reject(new Error(event.data.message));
                }
            };
        });

        log.info('[Speech2Text] Sending init message to worker');
        this._worker.postMessage({type: 'init'});

        this._modelLoading.catch(e => {
            log.error(`[Speech2Text] Failed to load Whisper model: ${e}`);
        });
    }

    /**
     * Handle messages from the Whisper worker during transcription.
     * @param {MessageEvent} event - The message from the worker.
     * @private
     */
    _onWorkerMessage (event) {
        const {type} = event.data;
        if (type === 'result') {
            const text = this._normalizeText(event.data.text);
            if (text) {
                this._currentUtterance = text;
                this._utteranceForEdgeTrigger = text;
                log.info(`Transcription result: ${text}`);
            }
            if (this._transcriptionResolve) {
                this._transcriptionResolve();
                this._transcriptionResolve = null;
            }
            this._resolveSpeechPromises();
        } else if (type === 'error') {
            log.error(`Transcription error: ${event.data.message}`);
            if (this._transcriptionResolve) {
                this._transcriptionResolve();
                this._transcriptionResolve = null;
            }
            this._resolveSpeechPromises();
        }
    }

    /**
     * Scans all the 'When I hear' hat blocks for each sprite and pulls out the text.
     * @returns {Array} list of strings from the hat blocks in the project.
     * @private
     */
    _scanBlocksForPhraseList () {
        const words = [];
        this.runtime.targets.forEach(target => {
            target.blocks._scripts.forEach(id => {
                const b = target.blocks.getBlock(id);
                if (b.opcode === 'speech_whenIHearHat') {
                    const inputId = b.inputs.PHRASE.block;
                    const inputBlock = target.blocks.getBlock(inputId);
                    if (inputBlock.opcode === 'text') {
                        const word = target.blocks.getBlock(inputId).fields.TEXT.value;
                        words.push(word);
                    }
                }
            });
        });
        return words;
    }

    /**
     * Get the viewer's language code.
     * @returns {string} the language code.
     */
    _getViewerLanguageCode () {
        const locale = formatMessage.setup().locale || navigator.language || navigator.userLanguage || 'en-US';
        // Extract just the language part (e.g. 'en' from 'en-US')
        return locale.split(/[-_]/)[0];
    }

    /**
     * Resets all things related to listening.
     * @private
     */
    _resetListening () {
        this.runtime.emitMicListening(false);
        this._stopRecording();
        this._resolveSpeechPromises();
    }

    /**
     * Reset the utterance for edge triggering.
     * @private
     */
    _resetEdgeTriggerUtterance () {
        this._utteranceForEdgeTrigger = '';
    }

    /**
     * Stop recording audio.
     * @private
     */
    _stopRecording () {
        this._isRecording = false;
        if (this._scriptNode) {
            this._scriptNode.removeEventListener('audioprocess', this._processAudioCallback);
            this._scriptNode.disconnect();
        }
        if (this._sourceNode) {
            this._sourceNode.disconnect();
        }
        if (this._speechTimeoutId) {
            clearTimeout(this._speechTimeoutId);
            this._speechTimeoutId = null;
        }
    }

    /**
     * Resolves all the speech promises.
     * @private
     */
    _resolveSpeechPromises () {
        for (let i = 0; i < this._speechPromises.length; i++) {
            const resFn = this._speechPromises[i];
            resFn();
        }
        this._speechPromises = [];
    }

    /**
     * Normalizes text for matching.
     * @param {string} text The text to normalize.
     * @returns {string} The normalized text.
     * @private
     */
    _normalizeText (text) {
        text = Cast.toString(text).toLowerCase();
        text = text.replace(/[.?!,]/g, '');
        text = text.trim();
        return text;
    }

    /**
     * Compute a fuzzy match.
     * @param {string} text The text to search in.
     * @param {string} pattern The pattern to search for.
     * @returns {number} The match index or -1.
     */
    _computeFuzzyMatch (text, pattern) {
        if (!pattern || !text) {
            return -1;
        }
        let match = -1;
        try {
            match = this._dmp.match_main(text, pattern, 0);
        } catch (e) {
            return pattern.indexOf(text);
        }
        return match;
    }

    /**
     * Check if the pattern matches the text using fuzzy matching.
     * @param {string} pattern The pattern to match.
     * @param {string} text The text to match against.
     * @returns {boolean} true if there is a match.
     * @private
     */
    _speechMatches (pattern, text) {
        pattern = this._normalizeText(pattern);
        text = this._normalizeText(text);
        const match = this._computeFuzzyMatch(text, pattern);
        return match !== -1;
    }

    /**
     * Initialize the audio context and connect the microphone.
     * @returns {Promise} Resolves when mic is ready.
     * @private
     */
    _initializeMicrophone () {
        if (!this._context) {
            this._context = new (window.AudioContext || window.webkitAudioContext)();
        }
        // In Safari we have to call getUserMedia every time.
        this._audioPromise = navigator.mediaDevices.getUserMedia({audio: true});
        return this._audioPromise;
    }

    /**
     * Compute the RMS energy of an audio buffer.
     * @param {Float32Array} buffer The audio samples.
     * @returns {number} The RMS energy.
     * @private
     */
    _computeRMS (buffer) {
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
            sum += buffer[i] * buffer[i];
        }
        return Math.sqrt(sum / buffer.length);
    }

    /**
     * Audio processing callback that accumulates chunks and handles silence detection.
     * @param {AudioProcessingEvent} e The audio event.
     * @private
     */
    _processAudioCallback (e) {
        if (!this._isRecording) return;

        const samples = e.inputBuffer.getChannelData(0);
        // Copy the samples since the buffer is reused
        this._audioChunks.push(new Float32Array(samples));

        const rms = this._computeRMS(samples);

        if (rms > SILENCE_THRESHOLD) {
            this._speechDetected = true;
            this._silenceStartTime = 0;
        } else if (this._speechDetected) {
            if (this._silenceStartTime === 0) {
                this._silenceStartTime = Date.now();
            } else if (Date.now() - this._silenceStartTime > SILENCE_DURATION_MS) {
                // Silence after speech — stop recording
                if (this._stopRecordingCallback) {
                    this._stopRecordingCallback();
                }
            }
        }
    }

    /**
     * Resample audio from the source sample rate to 16kHz.
     * @param {Float32Array} audioData The audio samples.
     * @param {number} sourceSampleRate The source sample rate.
     * @returns {Float32Array} The resampled audio at 16kHz.
     * @private
     */
    _resampleTo16kHz (audioData, sourceSampleRate) {
        if (sourceSampleRate === WHISPER_SAMPLE_RATE) {
            return audioData;
        }
        const ratio = sourceSampleRate / WHISPER_SAMPLE_RATE;
        const newLength = Math.round(audioData.length / ratio);
        const result = new Float32Array(newLength);
        for (let i = 0; i < newLength; i++) {
            const srcIndex = i * ratio;
            const srcIndexFloor = Math.floor(srcIndex);
            const srcIndexCeil = Math.min(srcIndexFloor + 1, audioData.length - 1);
            const fraction = srcIndex - srcIndexFloor;
            result[i] = ((1 - fraction) * audioData[srcIndexFloor]) +
                (fraction * audioData[srcIndexCeil]);
        }
        return result;
    }

    /**
     * Record audio and return the recorded buffer.
     * @returns {Promise<Float32Array>} The recorded audio samples.
     * @private
     */
    _recordAudio () {
        return new Promise((resolve, reject) => {
            this._initializeMicrophone()
                .then(stream => {
                    this._audioChunks = [];
                    this._speechDetected = false;
                    this._silenceStartTime = 0;
                    this._isRecording = true;

                    this._sourceNode = this._context.createMediaStreamSource(stream);
                    this._scriptNode = this._context.createScriptProcessor(4096, 1, 1);

                    const finishRecording = () => {
                        this._stopRecording();
                        this.runtime.emitMicListening(false);

                        // Concatenate all chunks
                        const totalLength = this._audioChunks.reduce(
                            (sum, chunk) => sum + chunk.length, 0
                        );
                        const combined = new Float32Array(totalLength);
                        let offset = 0;
                        for (let i = 0; i < this._audioChunks.length; i++) {
                            combined.set(this._audioChunks[i], offset);
                            offset += this._audioChunks[i].length;
                        }
                        this._audioChunks = [];

                        // Resample to 16kHz
                        const resampled = this._resampleTo16kHz(combined, this._context.sampleRate);
                        resolve(resampled);
                    };

                    this._stopRecordingCallback = finishRecording;

                    this._scriptNode.addEventListener('audioprocess', this._processAudioCallback);
                    this._sourceNode.connect(this._scriptNode);
                    this._scriptNode.connect(this._context.destination);

                    // Force timeout after max duration
                    this._speechTimeoutId = setTimeout(finishRecording, listenAndWaitBlockTimeoutMs);
                })
                .catch(e => {
                    log.error(`Problem connecting to microphone: ${e}`);
                    reject(e);
                });
        });
    }

    /**
     * The key to load & store a target's speech-related state.
     * @type {string}
     */
    static get STATE_KEY () {
        return 'Scratch.speech';
    }

    /**
     * @returns {object} Metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'speech2text',
            name: formatMessage({
                id: 'speech.extensionName',
                default: 'Speech to Text',
                description: 'Name of extension that adds speech recognition blocks.'
            }),
            menuIconURI: menuIconURI,
            blockIconURI: iconURI,
            blocks: [
                {
                    opcode: 'listenAndWait',
                    text: formatMessage({
                        id: 'speech.listenAndWait',
                        default: 'listen and wait',
                        // eslint-disable-next-line @stylistic/max-len
                        description: 'Start listening to the microphone and wait for a result from the speech recognition system.'
                    }),
                    blockType: BlockType.COMMAND
                },
                {
                    opcode: 'whenIHearHat',
                    text: formatMessage({
                        id: 'speech.whenIHear',
                        default: 'when I hear [PHRASE]',
                        // eslint-disable-next-line @stylistic/max-len
                        description: 'Event that triggers when the text entered on the block is recognized by the speech recognition system.'
                    }),
                    blockType: BlockType.HAT,
                    arguments: {
                        PHRASE: {
                            type: ArgumentType.STRING,
                            defaultValue: formatMessage({
                                id: 'speech.defaultWhenIHearValue',
                                default: 'let\'s go',
                                description: 'The default phrase/word that, when heard, triggers the event.'
                            })
                        }
                    }
                },
                {
                    opcode: 'getSpeech',
                    text: formatMessage({
                        id: 'speech.speechReporter',
                        default: 'speech',
                        description: 'Get the text of spoken words transcribed by the speech recognition system.'
                    }),
                    blockType: BlockType.REPORTER
                }
            ]
        };
    }

    /**
     * Start the listening process if it isn't already in progress, then transcribe using Whisper.
     * @returns {Promise} A promise that will resolve when listening and transcription are complete.
     */
    listenAndWait () {
        this._phraseList = this._scanBlocksForPhraseList();
        this._resetEdgeTriggerUtterance();

        const speechPromise = new Promise(resolve => {
            const listeningInProgress = this._speechPromises.length > 0;
            this._speechPromises.push(resolve);
            if (!listeningInProgress) {
                this._startListening();
            }
        });
        return speechPromise;
    }

    /**
     * Kick off the listening and transcription process.
     * @private
     */
    _startListening () {
        const doListen = () => {
            this.runtime.emitMicListening(true);
            this._recordAudio()
                .then(audioData => this._transcribe(audioData))
                .catch(e => {
                    log.error(`Listen failed: ${e}`);
                    this._resolveSpeechPromises();
                });
        };

        if (this._modelReady) {
            doListen();
        } else {
            this._modelLoading
                .then(doListen)
                .catch(e => {
                    log.error(`Model not available: ${e}`);
                    this._resolveSpeechPromises();
                });
        }
    }

    /**
     * Send recorded audio to the Whisper worker for transcription.
     * @param {Float32Array} audioData The recorded audio at 16kHz.
     * @returns {Promise} Resolves when transcription is complete.
     * @private
     */
    _transcribe (audioData) {
        return new Promise(resolve => {
            this._transcriptionResolve = resolve;

            const language = this._getViewerLanguageCode();
            // Transfer the audio buffer to the worker (zero-copy)
            this._worker.postMessage(
                {
                    type: 'transcribe',
                    audio: audioData,
                    language: language
                },
                [audioData.buffer]
            );
        });
    }

    /**
     * An edge triggered hat block to listen for a specific phrase.
     * @param {object} args - the block arguments.
     * @returns {boolean} true if the phrase matches what was transcribed.
     */
    whenIHearHat (args) {
        return this._speechMatches(args.PHRASE, this._utteranceForEdgeTrigger);
    }

    /**
     * Reporter for the last heard phrase/utterance.
     * @returns {string} The latest thing we heard from a listen and wait block.
     */
    getSpeech () {
        return this._currentUtterance;
    }
}
module.exports = Scratch3Speech2TextBlocks;
