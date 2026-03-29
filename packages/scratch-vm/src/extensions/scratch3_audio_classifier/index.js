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
const DEFAULT_CLASSES = ['Class 1', 'Class 2'];

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
                    opcode: 'openTrainer',
                    text: formatMessage({
                        id: 'audioClassification.openTrainer',
                        default: 'open audio trainer',
                        description: 'Block to open the audio trainer modal'
                    }),
                    blockType: BlockType.COMMAND
                },
                '---',
                {
                    opcode: 'startListening',
                    text: formatMessage({
                        id: 'audioClassification.startListening',
                        default: 'start listening',
                        description: 'Block to start audio classification'
                    }),
                    blockType: BlockType.COMMAND
                },
                {
                    opcode: 'stopListening',
                    text: formatMessage({
                        id: 'audioClassification.stopListening',
                        default: 'stop listening',
                        description: 'Block to stop audio classification'
                    }),
                    blockType: BlockType.COMMAND
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
        if (this._classes.length === 0) {
            return [{text: '---', value: '---'}];
        }
        return this._classes.map(name => ({text: name, value: name}));
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
     * @param {function} [onProgress] - optional callback for training progress (0-1).
     * @returns {Promise} resolves when training is complete.
     */
    async train (onProgress) {
        if (!this._transferRecognizer) return;
        this._training = true;
        try {
            await this._transferRecognizer.train({
                epochs: 25,
                callback: {
                    onEpochEnd: (epoch, logs) => {
                        if (onProgress) {
                            onProgress((epoch + 1) / 25);
                        }
                    }
                }
            });
            this._trained = true;
            log.info('Audio classifier training complete.');
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
                this._transferRecognizer.clearExamples(className);
            } else {
                this._transferRecognizer.clearExamples();
            }
            this._trained = false;
        } catch (e) {
            // Ignore errors if no examples exist
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
    }

    // -- Block implementations --

    /**
     * Open the audio trainer modal.
     */
    openTrainer () {
        this.runtime.emit('OPEN_AUDIO_CLASSIFIER_MODAL');
    }

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
        try {
            await this._transferRecognizer.listen(result => {
                const scores = result.scores;
                const classLabels = this._transferRecognizer.wordLabels();
                let maxScore = 0;
                let maxIndex = 0;
                for (let i = 0; i < scores.length; i++) {
                    if (scores[i] > maxScore) {
                        maxScore = scores[i];
                        maxIndex = i;
                    }
                }
                this._previousClass = this._currentClass;
                this._currentClass = classLabels[maxIndex];
                this._confidence = Math.round(maxScore * 100);
            }, {
                probabilityThreshold: 0.5,
                overlapFactor: 0.5
            });
            this._listening = true;
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
