const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const defaultQAData = require('./default-qa-data');

// eslint-disable-next-line @stylistic/max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbDpzcGFjZT0icHJlc2VydmUiIGlkPSJMYXllcl8xIiB3aWR0aD0iMzQyIiBoZWlnaHQ9IjMzMSIgeD0iMCIgeT0iMCIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMzQyIDMzMSIgdmVyc2lvbj0iMS4xIj48c3R5bGU+LnN0Mjh7ZmlsbDojZmZmO3N0cm9rZTojNGQ0ZDRkO3N0cm9rZS13aWR0aDoxMS42ODU5fS5zdDI4LC5zdDMwLC5zdDM0LC5zdDM3e3N0cm9rZS1taXRlcmxpbWl0OjEwfS5zdDMwe2ZpbGw6IzRkNGQ0ZDtzdHJva2U6IzRkNGQ0ZDtzdHJva2Utd2lkdGg6MTEuNjg1OX0uc3QzNCwuc3QzN3tmaWxsOiNmZmZ9LnN0MzR7c3Ryb2tlOiM0ZDRkNGQ7c3Ryb2tlLXdpZHRoOjExLjY4NTk7c3Ryb2tlLWxpbmVjYXA6cm91bmR9LnN0Mzd7c3Ryb2tlOiNmZmY7c3Ryb2tlLXdpZHRoOjJ9PC9zdHlsZT48cGF0aCBkPSJNMjguMyAyMjUuOXYtMjUuNWMwLTguMyA2LjctMTUgMTUtMTVoMTgyLjNjOC4zIDAgMTUgNi43IDE1IDE1djI1LjVjMCA4LjMtNi43IDE1LTE1IDE1SDQzLjNjLTguMyAwLTE1LTYuNy0xNS0xNXoiIGNsYXNzPSJzdDI4Ii8+PHBhdGggZD0iTTUzLjEgMjQzLjZ2LTYzLjhjMC0xNC45IDEyLjEtMjcgMjctMjdoMTA4LjZjMTQuOSAwIDI3IDEyLjEgMjcgMjd2NjMuOGMwIDE0LjktMTIuMSAyNy0yNyAyN0g4MC4xYy0xNC45IDAtMjctMTItMjctMjd6IiBjbGFzcz0ic3QyOCIvPjxjaXJjbGUgY3g9IjgzLjEiIGN5PSIxMDQuMSIgcj0iMTQuMSIgY2xhc3M9InN0MjgiLz48Y2lyY2xlIGN4PSI5Ny44IiBjeT0iMjAwLjkiIHI9IjguNCIgY2xhc3M9InN0MzAiLz48Y2lyY2xlIGN4PSIxNjkuNyIgY3k9IjIwMC45IiByPSI4LjQiIGNsYXNzPSJzdDMwIi8+PHBhdGggZD0iTTExMyAyMzEuNGM5IDE0LjEgMzIuOSAxMy43IDQxLjYgMCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzRkNGQ0ZDtzdHJva2Utd2lkdGg6MTEuNjg1OTtzdHJva2UtbGluZWNhcDpyb3VuZDtzdHJva2UtbWl0ZXJsaW1pdDoxMCIvPjxwYXRoIGQ9Ik0xMTAuMSAyNzcuM2g0OC43djI5LjJoLTQ4Ljd6IiBjbGFzcz0ic3QzNCIvPjxwYXRoIGQ9Im0xODguNiAxMjYuMyAzMy44LTE5LjMtOSA3YzM0LjMgOS42IDczLjYtLjIgOTAuOS0yMi42czYuOC01MC4xLTI0LjItNjMuOS03Mi4zLTkuNC05NS41IDEwLjNjLTIzLjIgMTkuNy0yMC42IDQ4LjMgNS45IDY1LjlsLTEuOSAyMi42eiIgc3R5bGU9ImZpbGw6IzRkNGQ0ZDtzdHJva2U6IzRkNGQ0ZDtzdHJva2Utd2lkdGg6MTI7c3Ryb2tlLWxpbmVqb2luOnJvdW5kO3N0cm9rZS1taXRlcmxpbWl0OjEwIi8+PGNpcmNsZSBjeD0iMjAzLjYiIGN5PSI2Ny45IiByPSI4LjQiIGNsYXNzPSJzdDM3Ii8+PGNpcmNsZSBjeD0iMjQwLjUiIGN5PSI2Ny45IiByPSI4LjQiIGNsYXNzPSJzdDM3Ii8+PGNpcmNsZSBjeD0iMjc3LjQiIGN5PSI2Ny45IiByPSI4LjQiIGNsYXNzPSJzdDM3Ii8+PHBhdGggZD0iTTgzLjEgMTE4LjJ2MzQuNiIgY2xhc3M9InN0MjgiLz48cGF0aCBkPSJNNjUuOCAzMDYuNWgxMzYuMSIgY2xhc3M9InN0MzQiLz48L3N2Zz4=';

/**
 * Host for the Q+A blocks. Provides a single "answer question using dataset"
 * command plus a matching reporter. The answer is chosen by semantic similarity
 * against a user-editable list of (question, answer) pairs. Embedding inference
 * runs in scratch-gui's shared EmbeddingGemma worker — this extension has no
 * embedding code of its own; it accesses the service via runtime.embeddingService.
 */
class Scratch3QABlocks {
    constructor (runtime) {
        this.runtime = runtime;
        this._lastAnswer = '';

        // Deep-clone defaults so edits don't mutate the module export.
        this._qaDatasets = defaultQAData.map(d => ({
            name: d.name,
            pairs: d.pairs.map(p => ({question: p.question, answer: p.answer}))
        }));

        // Expose this instance on the runtime so the GUI modal can read/write datasets.
        this.runtime._qaExtension = this;

        this.runtime.on('PROJECT_START', () => {
            this._lastAnswer = '';
        });
    }

    getInfo () {
        return {
            id: 'qa',
            name: 'Q+A',
            blockIconURI: blockIconURI,
            blocks: [
                {
                    blockType: BlockType.BUTTON,
                    text: 'Edit Q+A Data',
                    func: 'EDIT_QA_DATA'
                },
                {
                    opcode: 'answerQuestion',
                    text: 'answer [QUESTION] using [DATASET]',
                    blockType: BlockType.COMMAND,
                    arguments: {
                        QUESTION: {
                            type: ArgumentType.STRING,
                            defaultValue: 'what is Scratch?'
                        },
                        DATASET: {
                            type: ArgumentType.STRING,
                            menu: 'qaDatasetMenu',
                            defaultValue: 'scratch QA'
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
                    items: 'getQADatasetMenu'
                }
            }
        };
    }

    getQADatasetMenu () {
        const items = this._qaDatasets.map(d => ({text: d.name, value: d.name}));
        if (items.length === 0) {
            items.push({text: '(no data sets)', value: ''});
        }
        return items;
    }

    getQADatasets () {
        return this._qaDatasets;
    }

    setQADatasets (datasets) {
        this._qaDatasets = datasets;
        if (this.runtime && typeof this.runtime.requestBlocksUpdate === 'function') {
            this.runtime.requestBlocksUpdate();
        }
    }

    answerQuestion (args) {
        const question = Cast.toString(args.QUESTION).substring(0, 500);
        if (question.length < 1) {
            this._lastAnswer = '';
            return;
        }
        const datasetName = Cast.toString(args.DATASET);
        const dataset = this._qaDatasets.find(d => d.name === datasetName);
        if (!dataset || dataset.pairs.length === 0) {
            this._lastAnswer = '';
            return;
        }
        const svc = this.runtime.embeddingService;
        if (!svc || typeof svc.findMostSimilar !== 'function') {
            this._lastAnswer = '';
            return;
        }
        const questions = dataset.pairs.map(p => p.question);
        return svc.findMostSimilar(question, questions)
            .then(bestQuestion => {
                const pair = dataset.pairs.find(p => p.question === bestQuestion);
                this._lastAnswer = pair ? pair.answer : '';
            })
            .catch(err => {
                // eslint-disable-next-line no-console
                console.log(`Error in answerQuestion: ${err}`);
                this._lastAnswer = '';
            });
    }

    getQAAnswer () {
        return this._lastAnswer;
    }
}

module.exports = Scratch3QABlocks;
