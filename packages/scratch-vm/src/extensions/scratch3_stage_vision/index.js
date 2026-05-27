const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const clipService = require('./clip-service');
const curated = require('./curated-classes');

// eslint-disable-next-line @stylistic/max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iMzIiIGhlaWdodD0iMjQiIHJ4PSIzIiByeT0iMyIgZmlsbD0iI2ZmZiIgc3Ryb2tlPSIjNGQ0ZDRkIiBzdHJva2Utd2lkdGg9IjIiLz48Y2lyY2xlIGN4PSIyMCIgY3k9IjE2IiByPSI1IiBmaWxsPSIjZmZmIiBzdHJva2U9IiM0ZDRkNGQiIHN0cm9rZS13aWR0aD0iMiIvPjxjaXJjbGUgY3g9IjIwIiBjeT0iMTYiIHI9IjIiIGZpbGw9IiM0ZDRkNGQiLz48cGF0aCBkPSJNNiAzNkw4IDMyTDEwIDM2TTE0IDM2TDE2IDMwTDE4IDM2TTIyIDM2TDI0IDMyTDI2IDM2TTMwIDM2TDMyIDMwTDM0IDM2IiBzdHJva2U9IiM0ZDRkNGQiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+';

class Scratch3StageVision {
    constructor (runtime) {
        this.runtime = runtime;
        this._lastLabel = '';
        this._lastScore = 0;

        this.runtime.on('PROJECT_START', this._reset.bind(this));

        // Show the standard "loading extension data" alert while the model
        // downloads and warms up. Mirrors the pattern used by scratch3_qna.
        if (typeof window !== 'undefined') {
            this.runtime.emit('EXTENSION_DATA_LOADING', true);
            const handleReady = () => {
                this.runtime.emit('EXTENSION_DATA_LOADING', false);
                window.removeEventListener('stagevision:ready', handleReady);
            };
            window.addEventListener('stagevision:ready', handleReady);
            setTimeout(handleReady, 120000);
        }

        clipService.warmUp();
    }

    getInfo () {
        return {
            id: 'stageVision',
            name: 'Stage Vision',
            blockIconURI: blockIconURI,
            menuIconURI: blockIconURI,
            blocks: [
                {
                    opcode: 'classifyStageFromSet',
                    text: 'classify stage as one of [SET]',
                    blockType: BlockType.COMMAND,
                    arguments: {
                        SET: {
                            type: ArgumentType.STRING,
                            menu: 'labelSetMenu',
                            defaultValue: 'animals'
                        }
                    }
                },
                {
                    opcode: 'classifyStageFromList',
                    text: 'classify stage as one of [LIST]',
                    blockType: BlockType.COMMAND,
                    arguments: {
                        LIST: {
                            type: ArgumentType.STRING,
                            menu: 'listMenu',
                            defaultValue: ''
                        }
                    }
                },
                {
                    opcode: 'classifyStageTwo',
                    text: 'classify stage as [A] or [B]',
                    blockType: BlockType.COMMAND,
                    arguments: {
                        A: {type: ArgumentType.STRING, defaultValue: 'a cat'},
                        B: {type: ArgumentType.STRING, defaultValue: 'a dog'}
                    }
                },
                {
                    opcode: 'classifyStageThree',
                    text: 'classify stage as [A], [B], or [C]',
                    blockType: BlockType.COMMAND,
                    arguments: {
                        A: {type: ArgumentType.STRING, defaultValue: 'a cat'},
                        B: {type: ArgumentType.STRING, defaultValue: 'a dog'},
                        C: {type: ArgumentType.STRING, defaultValue: 'a bird'}
                    }
                },
                {
                    opcode: 'label',
                    text: 'label',
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'confidence',
                    text: 'confidence',
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'looksLike',
                    text: 'stage looks like [LABEL]?',
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        LABEL: {type: ArgumentType.STRING, defaultValue: 'a cat'}
                    }
                },
                {
                    opcode: 'looksLikeScore',
                    text: 'confidence stage looks like [LABEL]',
                    blockType: BlockType.REPORTER,
                    arguments: {
                        LABEL: {type: ArgumentType.STRING, defaultValue: 'a cat'}
                    }
                }
            ],
            menus: {
                labelSetMenu: {
                    acceptReporters: true,
                    items: '_buildLabelSetMenu'
                },
                listMenu: {
                    acceptReporters: true,
                    items: '_buildListMenu'
                }
            }
        };
    }

    _reset () {
        this._lastLabel = '';
        this._lastScore = 0;
    }

    _buildLabelSetMenu () {
        return Object.keys(curated).map(k => ({text: k, value: k}));
    }

    _buildListMenu () {
        const target = this.runtime.getEditingTarget() || this.runtime.getTargetForStage();
        const names = target ? target.getAllVariableNamesInScopeByType('list', false) : [];
        return names.length ? names.map(n => ({text: n, value: n})) : [{text: '(no lists)', value: ''}];
    }

    _snapshot () {
        return new Promise(resolve => {
            if (!this.runtime.renderer || typeof this.runtime.renderer.requestSnapshot !== 'function') {
                resolve(null);
                return;
            }
            this.runtime.renderer.requestSnapshot(resolve);
        });
    }

    _classifyAndStore (labels) {
        const filtered = labels.map(s => Cast.toString(s)).filter(s => s.length > 0);
        if (filtered.length === 0) {
            this._lastLabel = '';
            this._lastScore = 0;
            return;
        }
        return this._snapshot().then(dataURL => {
            if (!dataURL) {
                this._lastLabel = '';
                this._lastScore = 0;
                return;
            }
            return clipService.classify(dataURL, filtered).then(result => {
                this._lastLabel = result.label;
                this._lastScore = result.score;
            });
        })
            .catch(err => {
            // eslint-disable-next-line no-console
                console.log(`Error in stage-vision classify: ${err}`);
                this._lastLabel = '';
                this._lastScore = 0;
            });
    }

    classifyStageFromSet (args) {
        const setName = Cast.toString(args.SET);
        const labels = curated[setName];
        if (!labels) {
            this._lastLabel = '';
            this._lastScore = 0;
            return;
        }
        return this._classifyAndStore(labels);
    }

    classifyStageFromList (args, util) {
        const name = Cast.toString(args.LIST);
        if (!name) {
            this._lastLabel = '';
            this._lastScore = 0;
            return;
        }
        const stage = this.runtime.getTargetForStage();
        const list = util.target.lookupVariableByNameAndType(name, 'list') ||
                  (stage && stage.lookupVariableByNameAndType(name, 'list'));
        const labels = list ? list.value : [];
        return this._classifyAndStore(labels);
    }

    classifyStageTwo (args) {
        return this._classifyAndStore([args.A, args.B]);
    }

    classifyStageThree (args) {
        return this._classifyAndStore([args.A, args.B, args.C]);
    }

    label () {
        return this._lastLabel;
    }

    confidence () {
        return this._lastScore;
    }

    _scoreSingle (label) {
        const lab = Cast.toString(label);
        if (!lab) return Promise.resolve(0);
        return this._snapshot().then(dataURL => {
            if (!dataURL) return 0;
            return clipService.classify(dataURL, [lab, 'something else']).then(result => (
                result.label === lab ? result.score : 1 - result.score
            ));
        })
            .catch(err => {
            // eslint-disable-next-line no-console
                console.log(`Error in stage-vision looksLike: ${err}`);
                return 0;
            });
    }

    looksLike (args) {
        return this._scoreSingle(args.LABEL).then(score => score > 0.5);
    }

    looksLikeScore (args) {
        return this._scoreSingle(args.LABEL);
    }
}

module.exports = Scratch3StageVision;
