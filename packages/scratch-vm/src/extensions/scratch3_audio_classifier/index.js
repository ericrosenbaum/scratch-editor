const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const formatMessage = require('format-message');
const log = require('../../util/log');

/**
 * Icon svg to be displayed in the blocks category menu, encoded as a data URI.
 * @type {string}
 */
// eslint-disable-next-line @stylistic/max-len
const menuIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGcgZmlsbD0ibm9uZSI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNDRjYzQ0YiLz48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMjAgOGMxLjY2IDAgMyAxLjM0IDMgM3Y3YzAgMS42Ni0xLjM0IDMtMyAzcy0zLTEuMzQtMy0zdi03YzAtMS42NiAxLjM0LTMgMy0zem03IDEwYzAgMy41My0yLjYxIDYuNDQtNiA2LjkzVjI4aDJ2MmgtNnYtMmgydi0zLjA3Yy0zLjM5LS40OS02LTMuNC02LTYuOTNoMmMwIDIuNzYgMi4yNCA1IDUgNXM1LTIuMjQgNS01aDJ6Ii8+PHBhdGggZmlsbD0iI2ZmYmYwMCIgZD0iTTMwIDZsMS41IDMuNUwzNSAxMWwtMy41IDEuNUwzMCAxNmwtMS41LTMuNUwyNSAxMWwzLjUtMS41eiIvPjxwYXRoIGZpbGw9IiNmZmJmMDAiIGQ9Ik05IDMybDEgMi4zM0wxMi4zMyAzNSAxMCAzNi4zMyA5IDM5IDcuNjcgMzYuMzMgNSAzNSA3LjY3IDMzLjMzeiIvPjwvZz48L3N2Zz4=';

/**
 * Icon svg to be displayed at the left edge of each extension block, encoded as a data URI.
 * @type {string}
 */
// eslint-disable-next-line @stylistic/max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMjAgOGMxLjY2IDAgMyAxLjM0IDMgM3Y3YzAgMS42Ni0xLjM0IDMtMyAzcy0zLTEuMzQtMy0zdi03YzAtMS42NiAxLjM0LTMgMy0zem03IDEwYzAgMy41My0yLjYxIDYuNDQtNiA2LjkzVjI4aDJ2MmgtNnYtMmgydi0zLjA3Yy0zLjM5LS40OS02LTMuNC02LTYuOTNoMmMwIDIuNzYgMi4yNCA1IDUgNXM1LTIuMjQgNS01aDJ6Ii8+PHBhdGggZmlsbD0iI2ZmYmYwMCIgZD0iTTMzIDRsMS4yIDIuOEwzNyA4bC0yLjggMS4yTDMzIDEybC0xLjItMi44TDI5IDhsMi44LTEuMnoiLz48L3N2Zz4=';

/**
 * The default class names for a new audio classifier.
 * @type {Array.<string>}
 */
const DEFAULT_CLASSES = ['Class 1'];

/**
 * Internal class name used for background noise samples.
 * This class is always present but hidden from the block menu.
 * @type {string}
 */
const BACKGROUND_CLASS = '_background_noise_';

/**
 * Transfer model name used with the speech-commands recognizer.
 * @type {string}
 */
const TRANSFER_MODEL_NAME = 'scratch-audio-classifier';

/**
 * Scratch 3.0 blocks for audio classification using short audio examples.
 * Uses @tensorflow-models/speech-commands transfer learning API.
 */
class Scratch3AudioClassifierBlocks {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;

        /**
         * List of class names for the classifier.
         * @type {Array.<string>}
         */
        this._classes = DEFAULT_CLASSES.slice();

        /**
         * The currently detected class name.
         * @type {string}
         */
        this._currentClass = '';

        /**
         * The previously detected class name (for edge triggering).
         * @type {string}
         */
        this._previousClass = '';

        /**
         * Confidence of the current classification (0-100).
         * @type {number}
         */
        this._confidence = 0;

        /**
         * Smoothed scores (exponential moving average) per class label.
         * @type {Object.<string, number>}
         */
        this._smoothedScores = {};

        /**
         * EMA smoothing factor. Higher = more smoothing (more weight on previous value).
         * 0.1 means 10% previous + 90% new each frame.
         * @type {number}
         */
        this._smoothingFactor = 0.1;

        /**
         * Whether the classifier is actively listening.
         * @type {boolean}
         */
        this._listening = false;

        /**
         * Whether the model has been trained.
         * @type {boolean}
         */
        this._trained = false;

        /**
         * Whether the model is currently being trained.
         * @type {boolean}
         */
        this._training = false;

        /**
         * The speech-commands base recognizer (loaded lazily).
         * @type {?object}
         */
        this._recognizer = null;

        /**
         * The transfer recognizer for custom classification.
         * @type {?object}
         */
        this._transferRecognizer = null;

        /**
         * Whether the base model is currently loading.
         * @type {boolean}
         */
        this._loading = false;

        /**
         * Whether the base model has been loaded.
         * @type {boolean}
         */
        this._modelLoaded = false;

        // Register this extension instance on the runtime so the GUI modal can access it.
        this.runtime.ext_audioClassification = this;
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'audioClassification',
            name: formatMessage({
                id: 'audioClassification.categoryName',
                default: 'Audio Classifier',
                description: 'Label for the Audio Classifier extension category'
            }),
            menuIconURI: menuIconURI,
            blockIconURI: blockIconURI,
            color1: '#CF63CF',
            color2: '#C94FC9',
            color3: '#BD42BD',
            blocks: [
                {
                    func: 'OPEN_AUDIO_TRAINER',
                    blockType: BlockType.BUTTON,
                    text: formatMessage({
                        id: 'audioClassification.openTrainer',
                        default: 'Open Audio Trainer',
                        description: 'Button to open the audio trainer modal'
                    })
                },
                '---',
                {
                    opcode: 'whenAudioSoundsLike',
                    text: formatMessage({
                        id: 'audioClassification.whenAudioSoundsLike',
                        default: 'when audio sounds like [CLASS]',
                        description: 'Hat block that triggers when audio matches a class'
                    }),
                    blockType: BlockType.HAT,
                    arguments: {
                        CLASS: {
                            type: ArgumentType.STRING,
                            menu: 'CLASS_MENU'
                        }
                    }
                },
                {
                    opcode: 'audioClass',
                    text: formatMessage({
                        id: 'audioClassification.audioClass',
                        default: 'audio class',
                        description: 'Reporter that returns the current audio class'
                    }),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'audioConfidence',
                    text: formatMessage({
                        id: 'audioClassification.audioConfidence',
                        default: 'audio confidence',
                        description: 'Reporter that returns the confidence of the current classification'
                    }),
                    blockType: BlockType.REPORTER
                }
            ],
            menus: {
                CLASS_MENU: {
                    acceptReporters: true,
                    items: 'getClassMenu'
                }
            }
        };
    }

    /**
     * @returns {Array.<object>} menu items for the class menu.
     */
    getClassMenu () {
        const userClasses = this._classes.filter(name => name !== BACKGROUND_CLASS);
        if (userClasses.length === 0) {
            return [{text: '---', value: '---'}];
        }
        return userClasses.map(name => ({text: name, value: name}));
    }

    /**
     * Ensure the base speech-commands model is loaded.
     * The speechCommands module must be passed in from the GUI side
     * since the npm package is declared as a scratch-gui dependency.
     * @param {object} speechCommands - the @tensorflow-models/speech-commands module.
     * @returns {Promise} resolves when the model is ready.
     */
    async ensureModel (speechCommands) {
        if (this._modelLoaded) return;
        if (this._loading) {
            // Wait for existing load to complete
            while (this._loading) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return;
        }
        if (!speechCommands) {
            throw new Error('speechCommands module must be provided');
        }
        this._loading = true;
        try {
            this._recognizer = speechCommands.create('BROWSER_FFT');
            await this._recognizer.ensureModelLoaded();
            this._transferRecognizer = this._recognizer.createTransfer(TRANSFER_MODEL_NAME);
            this._modelLoaded = true;
            log.info('Audio classifier base model loaded.');
        } catch (e) {
            log.error('Failed to load audio classifier model:', e);
            throw e;
        } finally {
            this._loading = false;
        }
    }

    /**
     * Collect one audio example for a class.
     * Records ~1 second of audio from the microphone.
     * @param {string} className - the class name to add an example for.
     * @returns {Promise} resolves when the example is collected.
     */
    async collectExample (className) {
        await this.ensureModel();
        await this._transferRecognizer.collectExample(className);
    }

    /**
     * Get the count of examples per class.
     * @returns {object} map of class name to example count.
     */
    getExampleCounts () {
        if (!this._transferRecognizer) return {};
        try {
            return this._transferRecognizer.countExamples();
        } catch (e) {
            return {};
        }
    }

    /**
     * Train the transfer model on collected examples.
     * @param {function} [onProgress] - optional callback receiving {progress, accuracy, valAccuracy}.
     * @returns {Promise} resolves when training is complete.
     */
    async train (onProgress) {
        if (!this._transferRecognizer) return;
        this._training = true;
        const epochs = 10;
        // Force re-creation of the transfer model before each training run.
        // 1. Workaround for speech-commands 0.5.4 + tfjs 4.x incompatibility:
        //    train() skips createTransferModelFromBaseModel() when model exists,
        //    leaving secondLastBaseDenseLayer unset.
        // 2. The output layer size must match the current number of classes.
        //    Without this, retraining after adding/removing a class fails with
        //    a shape mismatch (e.g., model expects [*,2] but data has 3 classes).
        const tr = this._transferRecognizer;
        if (tr.model) {
            tr.model = null;
        }
        tr.createTransferModelFromBaseModel();
        try {
            await this._transferRecognizer.train({
                epochs,
                validationSplit: 0.2,
                augmentByMixingNoiseRatio: 0.2,
                callback: {
                    onEpochEnd: (epoch, logs) => {
                        if (onProgress) {
                            onProgress({
                                progress: (epoch + 1) / epochs,
                                accuracy: logs.acc,
                                valAccuracy: logs.val_acc
                            });
                        }
                    }
                }
            });
            this._trained = true;
            log.info('Audio classifier training complete.');
            // Automatically start listening after training
            this.startListening();
        } catch (e) {
            log.error('Audio classifier training failed:', e);
            throw e;
        } finally {
            this._training = false;
        }
    }

    /**
     * Clear all collected examples for a specific class, or all if no class given.
     * @param {string} [className] - the class to clear, or omit to clear all.
     */
    clearExamples (className) {
        if (!this._transferRecognizer) return;
        try {
            if (className) {
                // clearExamples() takes no arguments — it always clears ALL examples.
                // Use getExamples + removeExample to clear a single class.
                const examples = this._transferRecognizer.getExamples(className);
                for (const {uid} of examples) {
                    this._transferRecognizer.removeExample(uid);
                }
            } else {
                this._transferRecognizer.clearExamples();
            }
            this._trained = false;
        } catch (e) {
            // Ignore errors if no examples exist
        }
    }

    /**
     * Get spectrogram data for all examples of a class.
     * @param {string} className - the class name to get spectrograms for.
     * @returns {Array.<{data: Float32Array, frameSize: number}>} spectrogram data for each example.
     */
    getExampleSpectrograms (className) {
        if (!this._transferRecognizer) return [];
        try {
            return this._transferRecognizer.getExamples(className).map(({uid, example}) => ({
                uid,
                data: example.spectrogram.data,
                frameSize: example.spectrogram.frameSize
            }));
        } catch (e) {
            return [];
        }
    }

    /**
     * Remove a single example by UID.
     * @param {string} uid - the unique ID of the example to remove.
     */
    removeExample (uid) {
        if (!this._transferRecognizer) return;
        try {
            this._transferRecognizer.removeExample(uid);
        } catch (e) {
            // Ignore if UID not found
        }
    }

    /**
     * Add a class name.
     * @param {string} className - the name to add.
     */
    addClass (className) {
        if (!this._classes.includes(className)) {
            this._classes.push(className);
        }
    }

    /**
     * Remove a class name and its examples.
     * @param {string} className - the name to remove.
     */
    removeClass (className) {
        const idx = this._classes.indexOf(className);
        if (idx >= 0) {
            this._classes.splice(idx, 1);
        }
        this.clearExamples(className);
    }

    /**
     * Rename a class.
     * @param {string} oldName - current name.
     * @param {string} newName - new name.
     */
    renameClass (oldName, newName) {
        const idx = this._classes.indexOf(oldName);
        if (idx >= 0) {
            this._classes[idx] = newName;
        }
        // Transfer examples from old label to new label in the dataset.
        // The speech-commands library has no rename API, so we re-add
        // each example under the new label and remove the original.
        if (this._transferRecognizer) {
            try {
                const examples = this._transferRecognizer.getExamples(oldName);
                for (const {uid, example} of examples) {
                    example.label = newName;
                    this._transferRecognizer.dataset.addExample(example);
                    this._transferRecognizer.removeExample(uid);
                }
            } catch (e) {
                // No examples under oldName — nothing to transfer.
            }
        }
    }

    /**
     * Save the trained transfer model to IndexedDB.
     * @returns {Promise} resolves when the model is saved.
     */
    async saveModel () {
        if (!this._transferRecognizer || !this._trained) return;
        try {
            await this._transferRecognizer.save();
            log.info('Audio classifier model saved.');
        } catch (e) {
            log.error('Failed to save audio classifier model:', e);
        }
    }

    /**
     * Load a previously saved transfer model from IndexedDB.
     * @param {object} speechCommands - the speech-commands module (needed to ensure base model).
     * @returns {Promise<boolean>} true if a saved model was loaded.
     */
    async loadModel (speechCommands) {
        try {
            await this.ensureModel(speechCommands);
            await this._transferRecognizer.load();
            // Restore class list from the loaded model's word labels
            const labels = this._transferRecognizer.wordLabels();
            this._classes = labels.filter(l => l !== BACKGROUND_CLASS);
            this._trained = true;
            log.info('Audio classifier model loaded from IndexedDB.');
            return true;
        } catch (e) {
            // No saved model found — this is normal on first use
            return false;
        }
    }

    // -- Block implementations --

    /**
     * Start real-time audio classification.
     * @returns {Promise} resolves when listening has started.
     */
    async startListening () {
        if (this._listening) return;
        if (!this._trained) {
            log.warn('Cannot start listening: model not trained.');
            return;
        }
        // Reset smoothed scores so stale values from a previous session don't persist
        this._smoothedScores = {};
        try {
            log.info('Audio classifier: starting listener...');
            await this._transferRecognizer.listen(result => {
                const scores = result.scores;
                const classLabels = this._transferRecognizer.wordLabels();

                // Apply exponential moving average smoothing to raw scores
                for (let i = 0; i < scores.length; i++) {
                    const label = classLabels[i];
                    if (this._smoothedScores[label] === undefined) {
                        this._smoothedScores[label] = scores[i];
                    } else {
                        this._smoothedScores[label] =
                            (this._smoothingFactor * this._smoothedScores[label]) +
                            ((1 - this._smoothingFactor) * scores[i]);
                    }
                }

                // Find the top-scoring class using smoothed scores
                let maxScore = 0;
                let maxIndex = 0;
                let bgScore = 0;
                for (let i = 0; i < classLabels.length; i++) {
                    const smoothed = this._smoothedScores[classLabels[i]];
                    if (classLabels[i] === BACKGROUND_CLASS) {
                        bgScore = smoothed;
                    }
                    if (smoothed > maxScore) {
                        maxScore = smoothed;
                        maxIndex = i;
                    }
                }

                this._previousClass = this._currentClass;
                const detectedLabel = classLabels[maxIndex];

                // Store raw and smoothed scores for debugging / inspection
                this._lastScores = {};
                for (let j = 0; j < classLabels.length; j++) {
                    this._lastScores[classLabels[j]] = Math.round(scores[j] * 1000) / 1000;
                }

                if (detectedLabel === BACKGROUND_CLASS || maxScore < 0.5) {
                    // Background won, or no class is confident enough —
                    // treat as background.
                    this._currentClass = 'background';
                    this._confidence = Math.round(maxScore * 100);
                } else {
                    this._currentClass = detectedLabel;
                    this._confidence = Math.round(maxScore * 100);
                }
            }, {
                // Use a low threshold so the callback fires for every frame.
                probabilityThreshold: 0.01,
                overlapFactor: 0.5,
                // Critical: without this, the library suppresses callbacks when
                // background noise wins, so _currentClass never returns to "background".
                invokeCallbackOnNoiseAndUnknown: true
            });
            this._listening = true;
            log.info('Audio classifier: listener started successfully.');
            this.runtime.emitMicListening(true);
        } catch (e) {
            log.error('Failed to start listening:', e);
        }
    }

    /**
     * Stop real-time audio classification.
     */
    async stopListening () {
        if (!this._listening) return;
        try {
            await this._transferRecognizer.stopListening();
        } catch (e) {
            log.error('Failed to stop listening:', e);
        }
        this._listening = false;
        this._currentClass = '';
        this._previousClass = '';
        this._confidence = 0;
        this._smoothedScores = {};
        this.runtime.emitMicListening(false);
    }

    /**
     * Hat block: triggers when audio sounds like the specified class.
     * Edge-triggered: only fires on transition to the class.
     * @param {object} args - block arguments.
     * @param {string} args.CLASS - the class name to match.
     * @returns {boolean} true if the current class matches and just changed to it.
     */
    whenAudioSoundsLike (args) {
        return this._currentClass === args.CLASS &&
            this._previousClass !== args.CLASS &&
            this._listening;
    }

    /**
     * Reporter: current audio class name.
     * @returns {string} the current class name.
     */
    audioClass () {
        return this._currentClass;
    }

    /**
     * Reporter: confidence of the current classification.
     * @returns {number} confidence 0-100.
     */
    audioConfidence () {
        return this._confidence;
    }
}

module.exports = Scratch3AudioClassifierBlocks;
