import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import React from 'react';
import * as ScratchBlocks from 'scratch-blocks';

import {
    closeUnstuck,
    shrinkExpandUnstuck,
    setQuery,
    setTip,
    setLoading,
    setSearchResults,
    clearResults,
    dragUnstuck,
    startDrag,
    endDrag,
    openUnstuck,
    toggleCodeExpanded,
    setBrowseAll,
    setBrowseFilter
} from '../reducers/unstuck';

import {activateDeck} from '../reducers/cards.js';

import UnstuckCardComponent from '../components/unstuck-card/unstuck-card.jsx';
import tips, {quickPicks} from '../lib/libraries/tips/index.js';
import EmbeddingTipProvider from '../lib/unstuck/embedding-tip-provider.js';
import extractProjectContext from '../lib/unstuck/context-extractor.js';
import getProjectText from '../lib/unstuck/blocks-to-text.js';
import buildContextQuery from '../lib/unstuck/context-query-builder.js';
import {highlightElement, destroyHighlight} from '../lib/unstuck/pointer-actions.js';
import {isSupported as isVoiceSupported, listen as voiceListen} from '../lib/unstuck/voice-input.js';

const tipProvider = new EmbeddingTipProvider(tips);

const queryTips = function (context, query) {
    console.log(`[Tips] query="${query}"`);
    return tipProvider.getTips(context, query)
        .then(results => {
            const summary = results.map(r =>
                `${r.tipId} (${r.score.toFixed(1)}): ${(tips[r.tipId] && tips[r.tipId].text || '').substring(0, 60)}`
            );
            console.log(`[Tips] results (${results.length}):\n  ${summary.join('\n  ')}`);
            return results;
        });
};

class UnstuckCard extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            listening: false,
            interimTranscript: '',
            modelReady: tipProvider._ready,
            modelError: false,
            modelProgress: 0
        };
        this.handleSubmit = this.handleSubmit.bind(this);
        this.handleQueryChange = this.handleQueryChange.bind(this);
        this.handlePickClick = this.handlePickClick.bind(this);
        this.handleFollowUp = this.handleFollowUp.bind(this);
        this.handleAskAnother = this.handleAskAnother.bind(this);
        this.handlePointerClick = this.handlePointerClick.bind(this);
        this.handleAddToProject = this.handleAddToProject.bind(this);
        this.handleVoiceClick = this.handleVoiceClick.bind(this);
        this.handleSelectResult = this.handleSelectResult.bind(this);
        this.handleBackToResults = this.handleBackToResults.bind(this);
        this.handleSelectBrowseTip = this.handleSelectBrowseTip.bind(this);
        this.handleBackFromBrowseTip = this.handleBackFromBrowseTip.bind(this);
    }

    componentDidMount () {
        if (!this.state.modelReady) {
            tipProvider.setProgressListener(({progress}) => {
                if (this._unmounted) return;
                // Round to avoid spamming setState with sub-percent diffs.
                const next = Math.round(progress);
                if (next !== this.state.modelProgress) {
                    this.setState({modelProgress: next});
                }
            });
            tipProvider.ready
                .then(() => {
                    if (this._unmounted) return;
                    this.setState({modelReady: true});
                })
                .catch(() => {
                    if (this._unmounted) return;
                    this.setState({modelError: true});
                });
        }
    }

    componentWillUnmount () {
        this._unmounted = true;
        tipProvider.setProgressListener(null);
        destroyHighlight();
    }

    handleQueryChange (e) {
        this.props.onSetQuery(e.target.value);
    }

    handleSubmit () {
        const query = this.props.query.trim();
        if (!query) return;

        this.props.onSetLoading(true);

        const context = extractProjectContext(
            this.props.vm,
            this.props.activeTabIndex
        );

        queryTips(context, query)
            .then(results => {
                if (results.length > 0) {
                    this.props.onSetSearchResults(results);
                } else {
                    this.props.onSetSearchResults([{tipId: 'nothing-happens', score: 0}]);
                }
            })
            .catch(() => {
                this.props.onSetSearchResults([{tipId: 'nothing-happens', score: 0}]);
            });
    }

    handlePickClick (query) {
        this.props.onSetQuery(query);
        setTimeout(() => {
            this.props.onSetLoading(true);
            const context = extractProjectContext(
                this.props.vm,
                this.props.activeTabIndex
            );
            queryTips(context, query)
                .then(results => {
                    if (results.length > 0) {
                        this.props.onSetSearchResults(results);
                    }
                })
                .catch(() => {
                    this.props.onSetLoading(false);
                });
        }, 0);
    }

    handleFollowUp (tipId) {
        const tip = tips[tipId];
        if (tip && tip.tutorialId) {
            this.props.onActivateDeck(tip.tutorialId);
            return;
        }
        this.props.onSetTip(tipId);
    }

    handleAskAnother () {
        destroyHighlight();
        this.props.onClearResults();
    }

    handleSelectResult (tipId) {
        const tip = tips[tipId];
        if (tip && tip.tutorialId) {
            this.props.onActivateDeck(tip.tutorialId);
            return;
        }
        this.props.onSetTip(tipId);
    }

    handleBackToResults () {
        destroyHighlight();
        this.props.onSetTip(null);
    }

    handleSelectBrowseTip (tipId) {
        const tip = tips[tipId];
        if (tip && tip.tutorialId) {
            this.props.onActivateDeck(tip.tutorialId);
            return;
        }
        this.props.onSetTip(tipId);
    }

    handleBackFromBrowseTip () {
        destroyHighlight();
        this.props.onSetTip(null);
    }

    handleAddToProject () {
        const activeTip = this.props.activeTipId ? tips[this.props.activeTipId] : null;
        if (!activeTip || !activeTip._capturedBlocks || activeTip._capturedBlocks.length === 0) return;

        // Captured blocks may reference variables/lists/broadcasts that don't
        // exist in the current project. Always create missing ones as GLOBAL
        // variables on the stage (or remap to an existing same-named global
        // variable) before sharing, so every sprite can see them and the
        // blocks palette picks them up after refresh.
        const vm = this.props.vm;
        const stage = vm.runtime.getTargetForStage();
        const editingTarget = vm.editingTarget;
        const idRemap = {};
        const prepared = JSON.parse(JSON.stringify(activeTip._capturedBlocks));
        for (const block of prepared) {
            if (!block.fields) continue;
            for (const field of Object.values(block.fields)) {
                if (!field.id || typeof field.variableType !== 'string') continue;
                // Look up only on the stage (global scope). Using
                // editingTarget.lookupVariableById would match a local variable
                // on the current sprite, but we want globals only.
                if (stage.lookupVariableById(field.id)) continue;
                const existing = stage.lookupVariableByNameAndType(field.value, field.variableType);
                if (existing) {
                    idRemap[field.id] = existing.id;
                    field.id = existing.id;
                } else {
                    stage.createVariable(field.id, field.value, field.variableType);
                }
            }
        }
        // Fix up block-level variable refs (e.g. monitor owners) if we remapped any ids.
        if (Object.keys(idRemap).length > 0) {
            for (const block of prepared) {
                if (!block.fields) continue;
                for (const field of Object.values(block.fields)) {
                    if (field.id && idRemap[field.id]) {
                        field.id = idRemap[field.id];
                    }
                }
            }
        }

        // Remap sound names: a sound_sounds_menu shadow may reference a sound
        // (e.g. "Meow") that doesn't exist on the target. Blockly's dropdown
        // falls back to displaying the first option, but the stored field
        // value stays unchanged, so playSound's name lookup returns -1 and
        // nothing plays. Rewrite the value to the first available sound name.
        const targetSoundNames = (editingTarget.sprite && editingTarget.sprite.sounds || [])
            .map(s => s.name);
        if (targetSoundNames.length > 0) {
            for (const block of prepared) {
                if (block.opcode !== 'sound_sounds_menu') continue;
                const field = block.fields && block.fields.SOUND_MENU;
                if (field && !targetSoundNames.includes(field.value)) {
                    field.value = targetSoundNames[0];
                }
            }
        }

        vm.shareBlocksToTarget(prepared, editingTarget.id)
            .then(() => {
                vm.refreshWorkspace();
                // refreshWorkspace → emitWorkspaceUpdate → clearWorkspaceAndLoadFromXml
                // loads the new <variables> into Blockly's variable map, but
                // because Blockly events are suppressed during that reload, no
                // VAR_CREATE fires and the toolbox (which normally refreshes on
                // VAR_CREATE) never rebuilds its Variables category. Force a
                // rerender so the palette picks up the new variable immediately.
                const workspace = ScratchBlocks.getMainWorkspace();
                if (workspace) {
                    const toolbox = workspace.getToolbox && workspace.getToolbox();
                    if (toolbox && toolbox.forceRerender) {
                        toolbox.forceRerender();
                    }
                }
            });
    }

    handlePointerClick (pointerIndex) {
        const activeTip = this.props.activeTipId ? tips[this.props.activeTipId] : null;
        if (!activeTip || !activeTip.pointers || !activeTip.pointers[pointerIndex]) return;
        highlightElement(activeTip.pointers[pointerIndex], this.props.dispatch, this.props.vm);
    }

    handleVoiceClick () {
        if (this.state.listening) return;
        this.setState({listening: true, interimTranscript: ''});
        voiceListen({
            onInterim: text => this.setState({interimTranscript: text}),
            onEnd: () => this.setState({listening: false, interimTranscript: ''})
        })
            .then(transcript => {
                this.setState({interimTranscript: ''});
                this.props.onSetQuery(transcript);
                this.props.onSetLoading(true);
                const context = extractProjectContext(
                    this.props.vm,
                    this.props.activeTabIndex
                );
                queryTips(context, transcript)
                    .then(results => {
                        if (results.length > 0) {
                            this.props.onSetSearchResults(results);
                        } else {
                            this.props.onSetSearchResults([{tipId: 'nothing-happens', score: 0}]);
                        }
                    })
                    .catch(() => {
                        this.props.onSetSearchResults([{tipId: 'nothing-happens', score: 0}]);
                    });
            })
            .catch(() => {
                this.setState({listening: false, interimTranscript: ''});
            });
    }

    render () {
        const activeTip = this.props.activeTipId ? tips[this.props.activeTipId] : null;

        return (
            <UnstuckCardComponent
                activeTip={activeTip}
                browseAll={this.props.browseAll}
                browseFilter={this.props.browseFilter}
                codeExpanded={this.props.codeExpanded}
                expanded={this.props.expanded}
                listening={this.state.listening}
                interimTranscript={this.state.interimTranscript}
                loading={this.props.loading}
                modelReady={this.state.modelReady}
                modelError={this.state.modelError}
                modelProgress={this.state.modelProgress}
                query={this.props.query}
                searchResults={this.props.searchResults}
                voiceSupported={isVoiceSupported()}
                quickPicks={quickPicks}
                tips={tips}
                vm={this.props.vm}
                x={this.props.x}
                y={this.props.y}
                onAddToProject={this.handleAddToProject}
                onAskAnother={this.handleAskAnother}
                onBackFromBrowseTip={this.handleBackFromBrowseTip}
                onBackToResults={this.handleBackToResults}
                onBrowseAll={this.props.onBrowseAll}
                onBrowseFilter={this.props.onBrowseFilter}
                onClose={this.props.onClose}
                onDrag={this.props.onDrag}
                onEndDrag={this.props.onEndDrag}
                onFollowUp={this.handleFollowUp}
                onPickClick={this.handlePickClick}
                onPointerClick={this.handlePointerClick}
                onQueryChange={this.handleQueryChange}
                onSelectBrowseTip={this.handleSelectBrowseTip}
                onSelectResult={this.handleSelectResult}
                onShrinkExpand={this.props.onShrinkExpand}
                onStartDrag={this.props.onStartDrag}
                onToggleCode={this.props.onToggleCode}
                onVoiceClick={this.handleVoiceClick}
                onSubmit={this.handleSubmit}
            />
        );
    }
}

UnstuckCard.propTypes = {
    activeTipId: PropTypes.string,
    activeTabIndex: PropTypes.number.isRequired,
    browseAll: PropTypes.bool.isRequired,
    browseFilter: PropTypes.string,
    onActivateDeck: PropTypes.func.isRequired,
    onBrowseAll: PropTypes.func.isRequired,
    onBrowseFilter: PropTypes.func.isRequired,
    codeExpanded: PropTypes.bool.isRequired,
    dispatch: PropTypes.func.isRequired,
    expanded: PropTypes.bool.isRequired,
    loading: PropTypes.bool.isRequired,
    onClearResults: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    onDrag: PropTypes.func.isRequired,
    onEndDrag: PropTypes.func.isRequired,
    onSetLoading: PropTypes.func.isRequired,
    onSetQuery: PropTypes.func.isRequired,
    onSetSearchResults: PropTypes.func.isRequired,
    onSetTip: PropTypes.func.isRequired,
    onShrinkExpand: PropTypes.func.isRequired,
    onStartDrag: PropTypes.func.isRequired,
    onToggleCode: PropTypes.func.isRequired,
    query: PropTypes.string.isRequired,
    searchResults: PropTypes.arrayOf(PropTypes.shape({
        tipId: PropTypes.string.isRequired,
        score: PropTypes.number.isRequired
    })).isRequired,
    vm: PropTypes.object.isRequired,
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired
};

const mapStateToProps = state => ({
    activeTipId: state.scratchGui.unstuck.activeTipId,
    activeTabIndex: state.scratchGui.editorTab.activeTabIndex,
    browseAll: state.scratchGui.unstuck.browseAll,
    browseFilter: state.scratchGui.unstuck.browseFilter,
    codeExpanded: state.scratchGui.unstuck.codeExpanded,
    expanded: state.scratchGui.unstuck.expanded,
    loading: state.scratchGui.unstuck.loading,
    query: state.scratchGui.unstuck.query,
    searchResults: state.scratchGui.unstuck.searchResults,
    x: state.scratchGui.unstuck.x,
    y: state.scratchGui.unstuck.y
});

const mapDispatchToProps = dispatch => ({
    dispatch,
    onClose: () => {
        destroyHighlight();
        dispatch(closeUnstuck());
    },
    onDrag: (e_, data) => dispatch(dragUnstuck(data.x, data.y)),
    onEndDrag: () => dispatch(endDrag()),
    onClearResults: () => dispatch(clearResults()),
    onOpen: () => dispatch(openUnstuck()),
    onSetLoading: loading => dispatch(setLoading(loading)),
    onSetQuery: query => dispatch(setQuery(query)),
    onSetSearchResults: results => dispatch(setSearchResults(results)),
    onSetTip: tipId => dispatch(setTip(tipId)),
    onShrinkExpand: () => dispatch(shrinkExpandUnstuck()),
    onStartDrag: () => dispatch(startDrag()),
    onToggleCode: () => dispatch(toggleCodeExpanded()),
    onActivateDeck: deckId => dispatch(activateDeck(deckId)),
    onBrowseAll: () => dispatch(setBrowseAll(true)),
    onBrowseFilter: tag => dispatch(setBrowseFilter(tag))
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(UnstuckCard);
