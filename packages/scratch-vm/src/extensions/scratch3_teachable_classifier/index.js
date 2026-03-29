const formatMessage = require('format-message');

const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Video = require('../../io/video');
const log = require('../../util/log');

// These are loaded dynamically to avoid slowing down initial page load.
// They are resolved from scratch-gui's node_modules since that's where webpack
// bundles everything. The GUI's package.json declares them as dependencies.
let mobilenet = null;
let knnClassifierModule = null;
let tf = null;

const loadMLLibraries = () => {
    if (mobilenet) return Promise.resolve();
    return Promise.all([
        // eslint-disable-next-line global-require
        Promise.resolve(require('@tensorflow/tfjs')),
        // eslint-disable-next-line global-require
        Promise.resolve(require('@tensorflow-models/mobilenet')),
        // eslint-disable-next-line global-require
        Promise.resolve(require('@tensorflow-models/knn-classifier'))
    ]).then(([tfLib, mobilenetLib, knnLib]) => {
        tf = tfLib;
        mobilenet = mobilenetLib;
        knnClassifierModule = knnLib;
    });
};

/**
 * Minimum number of examples per label before training is triggered.
 * @type {number}
 */
const MIN_EXAMPLES_FOR_TRAINING = 5;

/**
 * Dense head training hyperparameters.
 */
const DENSE_UNITS = 100;
const LEARNING_RATE = 0.001;
const TRAINING_EPOCHS = 20;
const TRAINING_BATCH_SIZE = 16;
const VALIDATION_SPLIT = 0.15;
const AUGMENTATION_COPIES = 2;
const AUGMENTATION_NOISE_STD = 0.01;
const AUGMENTATION_DROPOUT_RATE = 0.05;

// eslint-disable-next-line max-len
const menuIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iOCIgZmlsbD0iIzRjOTdmZiIvPjxjaXJjbGUgY3g9IjIwIiBjeT0iMTgiIHI9IjciIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMiIvPjxjaXJjbGUgY3g9IjE2IiBjeT0iMTYiIHI9IjEuNSIgZmlsbD0id2hpdGUiLz48Y2lyY2xlIGN4PSIyNCIgY3k9IjE2IiByPSIxLjUiIGZpbGw9IndoaXRlIi8+PHBhdGggZD0iTTE2IDIxIHEyIDMgOCAwIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjEuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHJlY3QgeD0iOCIgeT0iMjgiIHdpZHRoPSIyNCIgaGVpZ2h0PSI0IiByeD0iMiIgZmlsbD0id2hpdGUiIG9wYWNpdHk9IjAuNyIvPjwvc3ZnPg==';
// eslint-disable-next-line max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjE4IiByPSI3IiBmaWxsPSJub25lIiBzdHJva2U9IiM0YzllZmYiIHN0cm9rZS13aWR0aD0iMiIvPjxjaXJjbGUgY3g9IjE2IiBjeT0iMTYiIHI9IjEuNSIgZmlsbD0iIzRjOTdmZiIvPjxjaXJjbGUgY3g9IjI0IiBjeT0iMTYiIHI9IjEuNSIgZmlsbD0iIzRjOTdmZiIvPjxwYXRoIGQ9Ik0xNiAyMSBxMiAzIDggMCIgc3Ryb2tlPSIjNGM5N2ZmIiBzdHJva2Utd2lkdGg9IjEuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHJlY3QgeD0iNiIgeT0iMjkiIHdpZHRoPSIyOCIgaGVpZ2h0PSI0IiByeD0iMiIgZmlsbD0iIzRjOTdmZiIgb3BhY2l0eT0iMC43Ii8+PC9zdmc+';

/**
 * Teachable Classifier: uses webcam + MobileNet feature extraction + a dense
 * neural-network head (transfer learning) to let users train custom image
 * classifiers and trigger hat blocks in real time.  Falls back to KNN while
 * the dense model is training.
 */
class Scratch3TeachableClassifierBlocks {
    /**
     * Milliseconds between frame analyses.
     * @type {number}
     */
    static get INTERVAL () {
        return 100;
    }

    /**
     * Sliding window size for debouncing predictions.
     * @type {number}
     */
    static get LABEL_SAMPLES_SIZE () {
        return 3;
    }

    /**
     * Minimum confidence (0-1) to accept a prediction.
     * Below this, the prediction is treated as uncertain.
     * @type {number}
     */
    static get CONFIDENCE_THRESHOLD () {
        return 0.5;
    }

    /**
     * Video frame dimensions for classification.
     * @type {Array.<number>}
     */
    static get DIMENSIONS () {
        return [480, 360];
    }

    constructor (runtime) {
        this.runtime = runtime;

        // Register extension instance so the GUI modal can access it
        this.runtime.ext_teachableClassifier = this;

        // Prediction state
        this.predictedLabel = '';
        this.predictedConfidence = 0;

        // Label/image data (shared with GUI modal)
        // imageData: { [label]: ImageData[] }   — user-captured frames for display
        // classifierData: { [label]: number[][] } — serialized KNN activations for save/load
        this._imageData = {};
        this._classifierData = {};
        this._nextLabelNumber = 1;

        // Label list for block menus
        this.labelList = [''];
        this.labelListEmpty = true;

        // Sliding window for debouncing
        this.labelSamples = [];

        // ML modules (set after async load)
        this.mobilenetModule = null;
        this.classifier = null;

        // Dense head transfer-learning model (Phase 2)
        this._denseModel = null;
        this._isTraining = false;
        this._modelStale = true;
        this._trainingStatus = 'needs-data'; // 'needs-data' | 'training' | 'ready'

        // Listen for project reload
        this.runtime.on('PROJECT_LOADED', () => {
            this._clearLocal();
        });

        // Listen for model editing events emitted by the GUI modal
        this.runtime.on('NEW_EXAMPLES', (examples, label) => {
            this._newExamples(examples, label);
        });
        this.runtime.on('DELETE_EXAMPLE', (label, exampleNum) => {
            this._deleteExample(label, exampleNum);
        });
        this.runtime.on('RENAME_LABEL', (oldName, newName) => {
            this._renameLabel(oldName, newName);
        });
        this.runtime.on('DELETE_LABEL', label => {
            this._clearAllWithLabel(label);
        });
        this.runtime.on('CLEAR_ALL_LABELS', () => {
            this._clearAll();
        });

        // Load ML libraries and model
        this.runtime.emit('EXTENSION_DATA_LOADING', true);
        loadMLLibraries()
            .then(() => {
                this.classifier = knnClassifierModule.create();
                return mobilenet.load({version: 2, alpha: 1.0});
            })
            .then(net => {
                this.mobilenetModule = net;
                if (this.runtime.ioDevices) {
                    this._loop();
                }
                this.runtime.emit('EXTENSION_DATA_LOADING', false);
            })
            .catch(err => {
                log.error('Teachable Classifier: failed to load ML model', err);
                this.runtime.emit('EXTENSION_DATA_LOADING', false);
            });
    }

    /**
     * Periodically sample the webcam frame and run classification.
     * Uses the dense model when available, falling back to KNN.
     * @private
     */
    _loop () {
        setTimeout(
            this._loop.bind(this),
            Math.max(this.runtime.currentStepTime, Scratch3TeachableClassifierBlocks.INTERVAL)
        );

        const hasKnnData = this.classifier && this.classifier.getNumClasses() > 0;
        const hasDenseModel = this._denseModel && !this._modelStale;

        if (!hasKnnData && !hasDenseModel) {
            this.predictedLabel = '';
            this.predictedConfidence = 0;
            this.labelSamples = [];
            return;
        }

        // Auto-train the dense model if stale and enough data exists
        if (this._modelStale && !this._isTraining) {
            this._maybeTrainModel();
        }

        const frame = this.runtime.ioDevices.video.getFrame({
            format: Video.FORMAT_IMAGE_DATA,
            dimensions: Scratch3TeachableClassifierBlocks.DIMENSIONS
        });
        if (!frame) return;

        const input = this.mobilenetModule.infer(frame);

        const handleResult = result => {
            const conf = result.confidences[result.label];
            const confidence = conf !== undefined ? conf : 0;

            // Phase 1A: Confidence threshold — treat low-confidence as uncertain
            const effectiveLabel = confidence >= Scratch3TeachableClassifierBlocks.CONFIDENCE_THRESHOLD ?
                result.label : '';

            // Phase 1B: Majority-vote sliding window
            this.labelSamples.unshift({label: effectiveLabel, confidence});
            if (this.labelSamples.length > Scratch3TeachableClassifierBlocks.LABEL_SAMPLES_SIZE) {
                this.labelSamples.length = Scratch3TeachableClassifierBlocks.LABEL_SAMPLES_SIZE;
            }

            if (this.labelSamples.length === Scratch3TeachableClassifierBlocks.LABEL_SAMPLES_SIZE) {
                // Count occurrences of each non-empty label
                const counts = {};
                for (const sample of this.labelSamples) {
                    if (sample.label) {
                        counts[sample.label] = (counts[sample.label] || 0) + 1;
                    }
                }
                // Find label with highest count
                let bestLabel = '';
                let bestCount = 0;
                for (const l in counts) {
                    if (counts[l] > bestCount) {
                        bestCount = counts[l];
                        bestLabel = l;
                    }
                }
                // Require majority (at least 2 out of 3)
                if (bestCount >= 2) {
                    this.predictedLabel = bestLabel;
                    // Average confidence of matching samples
                    let confSum = 0;
                    let confN = 0;
                    for (const sample of this.labelSamples) {
                        if (sample.label === bestLabel) {
                            confSum += sample.confidence;
                            confN++;
                        }
                    }
                    this.predictedConfidence = confN > 0 ? confSum / confN : 0;
                }
                // On tie or all uncertain, keep current prediction unchanged
            }
        };

        // Prefer dense model, fall back to KNN
        if (hasDenseModel) {
            try {
                const result = this._predictWithDenseModel(input);
                input.dispose();
                handleResult(result);
            } catch (err) {
                input.dispose();
                log.warn('Teachable Classifier: dense model prediction error', err);
            }
        } else {
            this.classifier.predictClass(input)
                .then(result => {
                    input.dispose();
                    handleResult(result);
                })
                .catch(err => {
                    input.dispose();
                    log.warn('Teachable Classifier: prediction error', err);
                });
        }
    }

    /**
     * Predict using the trained dense head model (synchronous).
     * @param {tf.Tensor} features — MobileNet feature tensor
     * @returns {{label: string, confidence: number, confidences: Object}}
     * @private
     */
    _predictWithDenseModel (features) {
        const labels = this._denseModelLabels;
        const prediction = tf.tidy(() => {
            const input = features.expandDims(0);
            return this._denseModel.predict(input);
        });
        const scores = prediction.dataSync();
        prediction.dispose();

        let bestIdx = 0;
        let bestScore = scores[0];
        const confidences = {};
        for (let i = 0; i < labels.length; i++) {
            confidences[labels[i]] = scores[i];
            if (scores[i] > bestScore) {
                bestScore = scores[i];
                bestIdx = i;
            }
        }
        return {
            label: labels[bestIdx],
            confidence: bestScore,
            confidences
        };
    }

    /**
     * Check if we have enough data and trigger training if so.
     * @private
     */
    _maybeTrainModel () {
        const labels = Object.keys(this._classifierData);
        if (labels.length < 2) {
            this._setTrainingStatus('needs-data');
            return;
        }
        const readyLabels = labels.filter(l => this._classifierData[l].length >= MIN_EXAMPLES_FOR_TRAINING);
        if (readyLabels.length < 2) {
            this._setTrainingStatus('needs-data');
            return;
        }
        this._trainModel();
    }

    /**
     * Build and train a dense head classifier on stored feature vectors.
     * @private
     */
    _trainModel () {
        if (this._isTraining || !tf) return;
        this._isTraining = true;
        this._setTrainingStatus('training');

        const labels = Object.keys(this._classifierData).filter(
            l => this._classifierData[l].length > 0
        );
        if (labels.length < 2) {
            this._isTraining = false;
            this._setTrainingStatus('needs-data');
            return;
        }

        // Build training data with augmentation (Phase 3B)
        const allFeatures = [];
        const allLabels = [];
        for (let classIdx = 0; classIdx < labels.length; classIdx++) {
            const vectors = this._classifierData[labels[classIdx]];
            for (const vec of vectors) {
                // Original example
                allFeatures.push(vec);
                allLabels.push(classIdx);
                // Augmented copies
                for (let a = 0; a < AUGMENTATION_COPIES; a++) {
                    const augmented = new Array(vec.length);
                    for (let j = 0; j < vec.length; j++) {
                        // Gaussian noise + random dropout
                        const dropped = Math.random() < AUGMENTATION_DROPOUT_RATE;
                        augmented[j] = dropped ? 0 :
                            vec[j] + (AUGMENTATION_NOISE_STD * this._gaussianRandom());
                    }
                    allFeatures.push(augmented);
                    allLabels.push(classIdx);
                }
            }
        }

        const featureDim = allFeatures[0].length;
        const numClasses = labels.length;

        // Dispose previous model if exists
        if (this._denseModel) {
            this._denseModel.dispose();
            this._denseModel = null;
        }

        const model = tf.sequential();
        model.add(tf.layers.dense({
            inputShape: [featureDim],
            units: DENSE_UNITS,
            activation: 'relu',
            kernelInitializer: 'varianceScaling'
        }));
        model.add(tf.layers.dense({
            units: numClasses,
            activation: 'softmax'
        }));
        model.compile({
            optimizer: tf.train.adam(LEARNING_RATE),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });

        // Build tensors
        const xs = tf.tensor2d(allFeatures, [allFeatures.length, featureDim]);
        const oneHot = tf.oneHot(tf.tensor1d(allLabels, 'int32'), numClasses);

        model.fit(xs, oneHot, {
            epochs: TRAINING_EPOCHS,
            batchSize: TRAINING_BATCH_SIZE,
            shuffle: true,
            validationSplit: allFeatures.length > 10 ? VALIDATION_SPLIT : 0
        }).then(() => {
            xs.dispose();
            oneHot.dispose();
            this._denseModel = model;
            this._denseModelLabels = labels;
            this._modelStale = false;
            this._isTraining = false;
            this._setTrainingStatus('ready');
        }).catch(err => {
            xs.dispose();
            oneHot.dispose();
            model.dispose();
            log.error('Teachable Classifier: training failed', err);
            this._isTraining = false;
            this._setTrainingStatus('needs-data');
        });
    }

    /**
     * Generate a random number from a standard normal distribution.
     * Uses the Box-Muller transform.
     * @returns {number}
     * @private
     */
    _gaussianRandom () {
        let u = 0;
        let v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    /**
     * Update and emit training status.
     * @param {string} status — 'needs-data' | 'training' | 'ready'
     * @private
     */
    _setTrainingStatus (status) {
        this._trainingStatus = status;
        this.runtime.emit('MODEL_TRAINING_STATUS', status);
    }

    /**
     * @returns {object} Extension metadata including block definitions.
     */
    getInfo () {
        // Enable video on first load
        if (this.runtime.ioDevices) {
            this.runtime.ioDevices.video.enableVideo();
        }

        return {
            id: 'teachableClassifier',
            name: formatMessage({
                id: 'teachableClassifier.categoryName',
                default: 'Teachable Machine',
                description: 'Name of the Teachable Machine extension'
            }),
            menuIconURI,
            blockIconURI,
            blocks: [
                {
                    func: 'EDIT_MODEL',
                    blockType: BlockType.BUTTON,
                    text: formatMessage({
                        id: 'teachableClassifier.editModel',
                        default: 'Edit Model',
                        description: 'Button to open the training data editor'
                    })
                },
                {
                    opcode: 'whenISee',
                    text: formatMessage({
                        id: 'teachableClassifier.whenISee',
                        default: 'when I see [LABEL]',
                        description: 'Hat block that fires when the label is recognized'
                    }),
                    blockType: BlockType.HAT,
                    arguments: {
                        LABEL: {
                            type: ArgumentType.STRING,
                            menu: 'LABEL',
                            defaultValue: ''
                        }
                    }
                },
                {
                    opcode: 'predictImageLabel',
                    text: formatMessage({
                        id: 'teachableClassifier.guess',
                        default: 'guess',
                        description: 'Reporter block returning the current predicted label'
                    }),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'getConfidence',
                    text: formatMessage({
                        id: 'teachableClassifier.confidence',
                        default: 'confidence',
                        description: 'Reporter block returning confidence percentage (0-100)'
                    }),
                    blockType: BlockType.REPORTER,
                    hideFromPalette: true
                },
                '---',
                {
                    opcode: 'imageExample',
                    text: formatMessage({
                        id: 'teachableClassifier.addExample',
                        default: 'add example with label [LABEL]',
                        description: 'Command block to add the current webcam frame as a training example'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        LABEL: {
                            type: ArgumentType.STRING,
                            defaultValue: 'background'
                        }
                    },
                    hideFromPalette: true
                }
            ],
            menus: {
                LABEL: {
                    acceptReporters: true,
                    items: 'getLabels'
                }
            }
        };
    }

    // ─── Block implementations ─────────────────────────────────────────────────

    /**
     * Dynamic label menu items.
     */
    getLabels () {
        return this.labelList;
    }

    /**
     * Hat block: fires when predicted label matches LABEL argument.
     */
    whenISee (args) {
        return this.predictedLabel === args.LABEL;
    }

    /**
     * Reporter: current predicted label.
     */
    predictImageLabel () {
        return this.predictedLabel;
    }

    /**
     * Reporter: prediction confidence as a 0-100 integer.
     */
    getConfidence () {
        return Math.round(this.predictedConfidence * 100);
    }

    /**
     * Command: capture current webcam frame and add as training example.
     */
    imageExample (args) {
        if (!this.mobilenetModule) return;
        const frame = this.runtime.ioDevices.video.getFrame({
            format: Video.FORMAT_IMAGE_DATA,
            dimensions: Scratch3TeachableClassifierBlocks.DIMENSIONS
        });
        if (frame) {
            this._newExamples([frame], args.LABEL);
        }
    }

    // ─── Data management (called from GUI modal via runtime events) ────────────

    /**
     * Add example images for a label.
     * @param {ImageData[]} images
     * @param {string} label
     */
    _newExamples (images, label) {
        if (!this.mobilenetModule) return;
        for (const image of images) {
            const example = this.mobilenetModule.infer(image);
            const normalizedTensor = tf.tidy(() => {
                const norm = example.norm();
                return tf.div(example, norm);
            });
            const exampleArray = normalizedTensor.arraySync();
            normalizedTensor.dispose();
            this.classifier.addExample(example, label);
            example.dispose();

            // Keep label list up to date
            if (this.labelListEmpty) {
                this.labelList.splice(this.labelList.indexOf(''), 1);
                this.labelListEmpty = false;
            }
            if (!this.labelList.includes(label)) {
                this.labelList.push(label);
                this._imageData[label] = [image];
                this._classifierData[label] = [exampleArray];
            } else {
                this._imageData[label].push(image);
                this._classifierData[label].push(exampleArray);
            }
        }

        // Clone all class matrices to standalone tensors with independent dataIds.
        // addExample stores reshaped views that share dataIds with intermediate tensors;
        // if those are disposed by a subsequent tf.tidy, the classifier's matrices
        // become invalid. Cloning here ensures they are fully independent.
        const dataset = this.classifier.getClassifierDataset();
        const standaloneDataset = {};
        for (const l in dataset) {
            standaloneDataset[l] = dataset[l].clone();
            dataset[l].dispose();
        }
        this.classifier.setClassifierDataset(standaloneDataset);

        // Mark the dense model as stale so it retrains with the new data
        this._modelStale = true;
    }

    /**
     * Rename a label.
     * @param {string} oldName
     * @param {string} newName
     */
    _renameLabel (oldName, newName) {
        if (!this.classifier) return;
        const data = {...this.classifier.getClassifierDataset()};
        if (data[oldName]) {
            // Clone before clearing — clearAllClasses disposes the tensors in data
            const cloned = {};
            for (const l in data) {
                cloned[l === oldName ? newName : l] = data[l].clone();
            }
            this.classifier.clearAllClasses();
            this.classifier.setClassifierDataset(cloned);
        }
        this._classifierData[newName] = this._classifierData[oldName];
        delete this._classifierData[oldName];
        this._imageData[newName] = this._imageData[oldName];
        delete this._imageData[oldName];

        const idx = this.labelList.indexOf(oldName);
        if (idx !== -1) {
            this.labelList[idx] = newName;
        }
        this._modelStale = true;
    }

    /**
     * Delete a single example or all loaded examples for a label.
     * @param {string} label
     * @param {number} exampleNum  — -1 to delete all loaded (serialized) examples
     */
    _deleteExample (label, exampleNum) {
        if (!this.classifier) return;
        const data = {...this.classifier.getClassifierDataset()};
        const labelExamples = data[label] ? data[label].arraySync() : [];

        // _classifierData has loaded examples first, then captured images.
        const numLoaded = this._classifierData[label].length - this._imageData[label].length;

        if (exampleNum === -1) {
            // Delete all serialized (loaded-from-file) examples
            this._classifierData[label].splice(0, numLoaded);
            labelExamples.splice(0, numLoaded);
        } else {
            // Delete a specific captured image (imageIdx is its index in _imageData).
            // The corresponding index in _classifierData is numLoaded + imageIdx.
            const imageIdx = exampleNum;
            const dataIdx = numLoaded + imageIdx;
            this._imageData[label].splice(imageIdx, 1);
            this._classifierData[label].splice(dataIdx, 1);
            labelExamples.splice(dataIdx, 1);
        }

        if (labelExamples.length > 0) {
            // Clone all tensors before clearing — clearAllClasses disposes the originals.
            const cloned = {};
            for (const l in data) {
                cloned[l] = (l === label) ? tf.tensor(labelExamples) : data[l].clone();
            }
            this.classifier.clearAllClasses();
            this.classifier.setClassifierDataset(cloned);
        } else {
            this.classifier.clearClass(label);
        }
        this._modelStale = true;
    }

    /**
     * Delete a label entirely.
     * @param {string} label
     */
    _clearAllWithLabel (label) {
        if (!this.classifier) return;
        if (!this.labelList.includes(label)) return;

        if (this.classifier.getClassExampleCount()[label] > 0) {
            this.classifier.clearClass(label);
        }
        this.labelList.splice(this.labelList.indexOf(label), 1);
        delete this._classifierData[label];
        delete this._imageData[label];

        if (this.labelList.length === 0) {
            this.labelListEmpty = true;
            this.labelList.push('');
        }
        this._modelStale = true;
    }

    /**
     * Clear local classifier state (used on project load).
     */
    _clearLocal () {
        if (this.classifier) {
            this.classifier.clearAllClasses();
        }
        if (this._denseModel) {
            this._denseModel.dispose();
            this._denseModel = null;
        }
        this._denseModelLabels = null;
        this._modelStale = true;
        this._isTraining = false;
        this._setTrainingStatus('needs-data');
        this.labelList = [''];
        this.labelListEmpty = true;
        this._imageData = {};
        this._classifierData = {};
        this.predictedLabel = '';
        this.predictedConfidence = 0;
        this.labelSamples = [];
    }

    /**
     * Clear everything including persisted data.
     */
    _clearAll () {
        this._clearLocal();
        this._nextLabelNumber = 1;
    }

    // ─── Project save/load API ─────────────────────────────────────────────────

    /**
     * Return serializable training data for project save.
     * @returns {{ version: number, alpha: number, classifierData: object }}
     */
    getTrainingData () {
        return {
            version: 2,
            alpha: 1.0,
            classifierData: this._classifierData
        };
    }

    /**
     * Restore training data after project load.
     * @param {{ classifierData: object }} data
     */
    setTrainingData (data) {
        if (!data || !data.classifierData) return;
        this._clearLocal();
        this._classifierData = {...data.classifierData};

        // Restore labels
        for (const label of Object.keys(this._classifierData)) {
            if (this.labelListEmpty) {
                this.labelList.splice(this.labelList.indexOf(''), 1);
                this.labelListEmpty = false;
            }
            if (!this.labelList.includes(label)) {
                this.labelList.push(label);
            }
            this._imageData[label] = []; // no thumbnail images after load
        }

        // Restore KNN classifier for immediate predictions (fallback)
        if (this.classifier && tf) {
            const dataset = {};
            for (const [label, vectors] of Object.entries(this._classifierData)) {
                if (vectors.length > 0) {
                    dataset[label] = tf.tensor(vectors);
                }
            }
            this.classifier.clearAllClasses();
            this.classifier.setClassifierDataset(dataset);
        }

        // Mark stale so the dense model auto-trains from restored features
        this._modelStale = true;
    }

    /**
     * Get the next auto-generated label name.
     * @returns {string}
     */
    getNextLabelName () {
        return `Class ${this._nextLabelNumber++}`;
    }
}

module.exports = Scratch3TeachableClassifierBlocks;
