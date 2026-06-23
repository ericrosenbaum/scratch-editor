const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const defaultQAData = require('./default-qa-data');
const embeddingService = require('./embedding-service');

// Shown when no Q&A pair matches the question well enough.
const DEFAULT_NO_MATCH_ANSWER = 'Sorry, I don\'t know.';
// Minimum cosine similarity (0-1) the best match must reach to be used.
const DEFAULT_NO_MATCH_THRESHOLD = 0.55;

/**
 * Return a clone of a dataset with the no-match fields filled in from the
 * defaults when absent, so the rest of the extension can rely on them and
 * older projects (saved before this feature) stay backward-compatible.
 * @param {object} d a dataset {name, pairs, noMatchAnswer?, noMatchThreshold?}
 * @returns {object} a normalized dataset clone
 */
const normalizeDataset = d => ({
    name: d.name,
    pairs: (d.pairs || []).map(p => ({question: p.question, answer: p.answer})),
    noMatchAnswer: typeof d.noMatchAnswer === 'string' ? d.noMatchAnswer : DEFAULT_NO_MATCH_ANSWER,
    noMatchThreshold: typeof d.noMatchThreshold === 'number' ? d.noMatchThreshold : DEFAULT_NO_MATCH_THRESHOLD
});

// eslint-disable-next-line @stylistic/max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbDpzcGFjZT0icHJlc2VydmUiIGlkPSJMYXllcl8xIiB3aWR0aD0iMzQyIiBoZWlnaHQ9IjMzMSIgeD0iMCIgeT0iMCIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMzQyIDMzMSIgdmVyc2lvbj0iMS4xIj48c3R5bGU+LnN0Mjh7ZmlsbDojZmZmO3N0cm9rZTojNGQ0ZDRkO3N0cm9rZS13aWR0aDoxMS42ODU5fS5zdDI4LC5zdDMwLC5zdDM0LC5zdDM3e3N0cm9rZS1taXRlcmxpbWl0OjEwfS5zdDMwe2ZpbGw6IzRkNGQ0ZDtzdHJva2U6IzRkNGQ0ZDtzdHJva2Utd2lkdGg6MTEuNjg1OX0uc3QzNCwuc3QzN3tmaWxsOiNmZmZ9LnN0MzR7c3Ryb2tlOiM0ZDRkNGQ7c3Ryb2tlLXdpZHRoOjExLjY4NTk7c3Ryb2tlLWxpbmVjYXA6cm91bmR9LnN0Mzd7c3Ryb2tlOiNmZmY7c3Ryb2tlLXdpZHRoOjJ9PC9zdHlsZT48cGF0aCBkPSJNMjguMyAyMjUuOXYtMjUuNWMwLTguMyA2LjctMTUgMTUtMTVoMTgyLjNjOC4zIDAgMTUgNi43IDE1IDE1djI1LjVjMCA4LjMtNi43IDE1LTE1IDE1SDQzLjNjLTguMyAwLTE1LTYuNy0xNS0xNXoiIGNsYXNzPSJzdDI4Ii8+PHBhdGggZD0iTTUzLjEgMjQzLjZ2LTYzLjhjMC0xNC45IDEyLjEtMjcgMjctMjdoMTA4LjZjMTQuOSAwIDI3IDEyLjEgMjcgMjd2NjMuOGMwIDE0LjktMTIuMSAyNy0yNyAyN0g4MC4xYy0xNC45IDAtMjctMTItMjctMjd6IiBjbGFzcz0ic3QyOCIvPjxjaXJjbGUgY3g9IjgzLjEiIGN5PSIxMDQuMSIgcj0iMTQuMSIgY2xhc3M9InN0MjgiLz48Y2lyY2xlIGN4PSI5Ny44IiBjeT0iMjAwLjkiIHI9IjguNCIgY2xhc3M9InN0MzAiLz48Y2lyY2xlIGN4PSIxNjkuNyIgY3k9IjIwMC45IiByPSI4LjQiIGNsYXNzPSJzdDMwIi8+PHBhdGggZD0iTTExMyAyMzEuNGM5IDE0LjEgMzIuOSAxMy43IDQxLjYgMCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzRkNGQ0ZDtzdHJva2Utd2lkdGg6MTEuNjg1OTtzdHJva2UtbGluZWNhcDpyb3VuZDtzdHJva2UtbWl0ZXJsaW1pdDoxMCIvPjxwYXRoIGQ9Ik0xMTAuMSAyNzcuM2g0OC43djI5LjJoLTQ4Ljd6IiBjbGFzcz0ic3QzNCIvPjxwYXRoIGQ9Im0xODguNiAxMjYuMyAzMy44LTE5LjMtOSA3YzM0LjMgOS42IDczLjYtLjIgOTAuOS0yMi42czYuOC01MC4xLTI0LjItNjMuOS03Mi4zLTkuNC05NS41IDEwLjNjLTIzLjIgMTkuNy0yMC42IDQ4LjMgNS45IDY1LjlsLTEuOSAyMi42eiIgc3R5bGU9ImZpbGw6IzRkNGQ0ZDtzdHJva2U6IzRkNGQ0ZDtzdHJva2Utd2lkdGg6MTI7c3Ryb2tlLWxpbmVqb2luOnJvdW5kO3N0cm9rZS1taXRlcmxpbWl0OjEwIi8+PGNpcmNsZSBjeD0iMjAzLjYiIGN5PSI2Ny45IiByPSI4LjQiIGNsYXNzPSJzdDM3Ii8+PGNpcmNsZSBjeD0iMjQwLjUiIGN5PSI2Ny45IiByPSI4LjQiIGNsYXNzPSJzdDM3Ii8+PGNpcmNsZSBjeD0iMjc3LjQiIGN5PSI2Ny45IiByPSI4LjQiIGNsYXNzPSJzdDM3Ii8+PHBhdGggZD0iTTgzLjEgMTE4LjJ2MzQuNiIgY2xhc3M9InN0MjgiLz48cGF0aCBkPSJNNjUuOCAzMDYuNWgxMzYuMSIgY2xhc3M9InN0MzQiLz48L3N2Zz4=';

class Scratch3QnaBlocks {
    constructor (runtime) {
        this.runtime = runtime;

        // Expose this instance on runtime so the GUI's Edit-QA-Data modal can
        // read and write datasets directly.
        this.runtime._qnaExtension = this;

        // Deep-clone default Q&A datasets so edits don't mutate the module export.
        this._qaDatasets = defaultQAData.map(normalizeDataset);

        this._lastQAAnswer = '';

        // Number of answer-question blocks currently computing an answer. Drives
        // the GUI loading spinner via runtime QA_ANALYZING events; a counter (not
        // a boolean) keeps the spinner correct when several blocks run at once.
        this._pendingAnswers = 0;

        this.runtime.on('PROJECT_START', this._resetAnswer.bind(this));
        this.runtime.on('PROJECT_STOP_ALL', this._resetAnalyzing.bind(this));

        // Show the standard "loading extension data" alert while the
        // embedding model downloads and warms up. Mirrors the pattern used by
        // scratch3_face_sensing. The embedding service dispatches a
        // 'embeddingservice:ready' window event when the model is loaded; a
        // 2-minute timeout is a safety net for the failure case.
        if (typeof window !== 'undefined') {
            this.runtime.emit('EXTENSION_DATA_LOADING', true);
            const handleReady = () => {
                this.runtime.emit('EXTENSION_DATA_LOADING', false);
                window.removeEventListener('embeddingservice:ready', handleReady);
            };
            window.addEventListener('embeddingservice:ready', handleReady);
            setTimeout(handleReady, 120000);
        }

        // Start downloading the embedding model in the background.
        embeddingService.warmUp();
    }

    getInfo () {
        return {
            id: 'qna',
            name: 'Q+A',
            blockIconURI: blockIconURI,
            menuIconURI: blockIconURI,
            blocks: [
                {
                    blockType: BlockType.BUTTON,
                    text: 'Edit QA Data',
                    func: 'EDIT_QA_DATA'
                },
                {
                    opcode: 'answerQuestion',
                    text: 'answer [QUESTION] using [DATASET]',
                    blockType: BlockType.COMMAND,
                    arguments: {
                        QUESTION: {
                            type: ArgumentType.STRING,
                            defaultValue: 'What is Scratch?'
                        },
                        DATASET: {
                            type: ArgumentType.STRING,
                            menu: 'qaDatasetMenu',
                            defaultValue: 'Scratch FAQ'
                        }
                    }
                },
                {
                    opcode: 'getQAAnswer',
                    text: 'answer',
                    blockType: BlockType.REPORTER
                }
            ],
            menus: {
                qaDatasetMenu: {
                    acceptReporters: true,
                    items: '_buildQADatasetMenu'
                }
            }
        };
    }

    _buildQADatasetMenu () {
        const items = this._qaDatasets.map(d => ({text: d.name, value: d.name}));
        items.push({text: 'edit QA data...', value: 'EDIT_QA_DATA'});
        return items;
    }

    getQADatasets () {
        return this._qaDatasets;
    }

    setQADatasets (datasets) {
        this._qaDatasets = (datasets || []).map(normalizeDataset);
        if (this.runtime && typeof this.runtime.requestBlocksUpdate === 'function') {
            this.runtime.requestBlocksUpdate();
        }
    }

    /**
     * Serialize this extension's state so it can be saved into the project file.
     * The serializer (serialization/sb3.js) calls this when a project is saved.
     * @returns {object} a JSON-serializable blob of the extension's datasets.
     */
    serialize () {
        return {
            datasets: this._qaDatasets.map(d => ({
                name: d.name,
                pairs: d.pairs.map(p => ({question: p.question, answer: p.answer})),
                noMatchAnswer: d.noMatchAnswer,
                noMatchThreshold: d.noMatchThreshold
            }))
        };
    }

    /**
     * Restore this extension's state from a previously serialized blob.
     * The VM (virtual-machine.js installTargets) calls this after the extension
     * has loaded during project load. Missing/empty data leaves the defaults in place.
     * @param {object} data the blob previously produced by serialize().
     */
    deserialize (data) {
        if (data && Array.isArray(data.datasets)) {
            // setQADatasets normalizes each dataset, backfilling no-match
            // fields for projects saved before they existed.
            this.setQADatasets(data.datasets);
        }
    }

    _resetAnswer () {
        this._lastQAAnswer = '';
        this._resetAnalyzing();
    }

    /**
     * Clear the "finding an answer" loading state and hide the GUI spinner.
     * @private
     */
    _resetAnalyzing () {
        this._pendingAnswers = 0;
        if (this.runtime && typeof this.runtime.emitQnaAnalyzing === 'function') {
            this.runtime.emitQnaAnalyzing(false);
        }
    }

    /**
     * Track one answer-question block starting or finishing, and emit a
     * QA_ANALYZING event so the GUI shows the loading spinner while any
     * answer is being computed.
     * @param {boolean} analyzing - true when a block starts, false when it ends.
     * @private
     */
    _setAnalyzing (analyzing) {
        this._pendingAnswers = Math.max(0, (this._pendingAnswers || 0) + (analyzing ? 1 : -1));
        if (this.runtime && typeof this.runtime.emitQnaAnalyzing === 'function') {
            this.runtime.emitQnaAnalyzing(this._pendingAnswers > 0);
        }
    }

    answerQuestion (args) {
        const question = Cast.toString(args.QUESTION).substring(0, 500);
        if (question.length < 1) {
            this._lastQAAnswer = '';
            return;
        }
        const datasetName = Cast.toString(args.DATASET);
        const dataset = this._qaDatasets.find(d => d.name === datasetName);
        if (!dataset || dataset.pairs.length === 0) {
            this._lastQAAnswer = '';
            return;
        }
        const questions = dataset.pairs.map(p => p.question);
        const noMatchAnswer = typeof dataset.noMatchAnswer === 'string' ?
            dataset.noMatchAnswer : DEFAULT_NO_MATCH_ANSWER;
        const threshold = typeof dataset.noMatchThreshold === 'number' ?
            dataset.noMatchThreshold : DEFAULT_NO_MATCH_THRESHOLD;
        this._setAnalyzing(true);
        return embeddingService.findMostSimilar(question, questions)
            .then(({candidate, score}) => {
                // If even the best match is too weak, answer "I don't know".
                if (score < threshold) {
                    this._lastQAAnswer = noMatchAnswer;
                    return;
                }
                const pair = dataset.pairs.find(p => p.question === candidate);
                this._lastQAAnswer = pair ? pair.answer : noMatchAnswer;
            })
            .catch(err => {
                // eslint-disable-next-line no-console
                console.log(`Error in answerQuestion: ${err}`);
                this._lastQAAnswer = '';
            })
            .then(() => {
                this._setAnalyzing(false);
            });
    }

    getQAAnswer () {
        return this._lastQAAnswer;
    }
}

module.exports = Scratch3QnaBlocks;
