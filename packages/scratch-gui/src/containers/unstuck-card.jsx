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
import {updateMetrics as updateWorkspaceMetrics} from '../reducers/workspace-metrics';

import UnstuckCardComponent from '../components/unstuck-card/unstuck-card.jsx';
import tips, {quickPicks} from '../lib/libraries/tips/index.js';
import EmbeddingTipProvider from '../lib/unstuck/embedding-tip-provider.js';
import extractProjectContext from '../lib/unstuck/context-extractor.js';
import getProjectText from '../lib/unstuck/blocks-to-text.js';
import buildContextQuery from '../lib/unstuck/context-query-builder.js';
import {highlightElement, destroyHighlight} from '../lib/unstuck/pointer-actions.js';
import {isSupported as isVoiceSupported, listen as voiceListen} from '../lib/unstuck/voice-input.js';
import * as tipEvents from '../lib/unstuck/tip-events.js';
import * as postTipWatcher from '../lib/unstuck/post-tip-watcher.js';
import layoutInsertedBlocks, {VIEWPORT_MARGIN} from '../lib/unstuck/layout-inserted-blocks.js';
import {BLOCKS_DEFAULT_SCALE} from '../lib/layout-constants';

const tipProvider = new EmbeddingTipProvider(tips);

const queryTips = function (context, query) {
    console.log(`[Tips] query="${query}"`);
    const startedAt = Date.now();
    return tipProvider.getTips(context, query)
        .then(results => {
            const summary = results.map(r =>
                `${r.tipId} (${r.score.toFixed(1)}): ${(tips[r.tipId] && tips[r.tipId].text || '').substring(0, 60)}`
            );
            console.log(`[Tips] results (${results.length}):\n  ${summary.join('\n  ')}`);
            tipEvents.resultsReturned(query, results, Date.now() - startedAt);
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
        this.handleRandomTip = this.handleRandomTip.bind(this);
    }

    componentDidMount () {
        tipEvents.cardOpened(this.props.vm, this.props.activeTabIndex, this.state.modelReady);
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
        tipEvents.cardClosed();
        postTipWatcher.start({
            tipId: this.props.activeTipId,
            trigger: 'card_closed',
            vm: this.props.vm,
            activeTabIndex: this.props.activeTabIndex
        });
    }

    handleQueryChange (e) {
        this.props.onSetQuery(e.target.value);
    }

    handleSubmit () {
        const query = this.props.query.trim();
        if (!query) return;

        this.props.onSetLoading(true);
        tipEvents.querySubmitted(query, 'typed');

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
        tipEvents.querySubmitted(query, 'quickpick');
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
        tipEvents.resultClicked(tipId, null, 'followup');
        if (tip && tip.tutorialId) {
            tipEvents.tutorialOpened(tipId, tip.tutorialId);
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
        const position = this.props.searchResults.findIndex(r => r.tipId === tipId);
        tipEvents.resultClicked(tipId, position, 'results');
        if (tip && tip.tutorialId) {
            tipEvents.tutorialOpened(tipId, tip.tutorialId);
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
        tipEvents.resultClicked(tipId, null, 'browse');
        if (tip && tip.tutorialId) {
            tipEvents.tutorialOpened(tipId, tip.tutorialId);
            this.props.onActivateDeck(tip.tutorialId);
            return;
        }
        this.props.onSetTip(tipId);
    }

    handleBackFromBrowseTip () {
        destroyHighlight();
        this.props.onSetTip(null);
    }

    handleRandomTip () {
        const pool = Object.values(tips).filter(t => !t.tutorialId);
        if (pool.length === 0) return;
        let pick = pool[Math.floor(Math.random() * pool.length)];
        if (pool.length > 1 && pick.id === this.props.activeTipId) {
            pick = pool[Math.floor(Math.random() * pool.length)];
        }
        tipEvents.resultClicked(pick.id, null, 'random');
        this.props.onSetTip(pick.id);
    }

    handleAddToProject () {
        // Move focus off the button so subsequent key presses reach the VM:
        // vmListenerHOC only forwards keys when focus is on document.body or an SVGElement.
        if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
        }

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

        // Position the inserted top-level stacks based on current viewport
        // scroll and existing scripts so we don't hide other code, and so
        // multiple stacks within a single tip don't stack on top of each other.
        const mainWorkspace = ScratchBlocks.getMainWorkspace();
        const targetMetrics = this.props.workspaceMetrics.targets[editingTarget.id] || {
            scrollX: 0,
            scrollY: 0,
            scale: BLOCKS_DEFAULT_SCALE
        };
        const insertion = layoutInsertedBlocks(
            prepared, mainWorkspace, targetMetrics, this.props.isRtl
        );

        // If we shifted the insertion below existing content, the new blocks
        // may lie outside the viewport. Update workspace metrics so that
        // refreshWorkspace's scroll-restore lands the new blocks near the
        // top-left of the viewport with the standard margin.
        if (insertion.shiftedBelow) {
            const scale = targetMetrics.scale || BLOCKS_DEFAULT_SCALE;
            const newScrollY = VIEWPORT_MARGIN - (insertion.baseY * scale);
            const newScrollX = this.props.isRtl ?
                (insertion.baseX * scale) - VIEWPORT_MARGIN :
                VIEWPORT_MARGIN - (insertion.baseX * scale);
            this.props.dispatch(updateWorkspaceMetrics({
                targetID: editingTarget.id,
                scrollX: newScrollX,
                scrollY: newScrollY,
                scale: scale
            }));
        }

        const tipIdForEvent = this.props.activeTipId;
        vm.shareBlocksToTarget(prepared, editingTarget.id)
            .then(() => {
                tipEvents.addToProject(tipIdForEvent, prepared);
                postTipWatcher.start({
                    tipId: tipIdForEvent,
                    trigger: 'add_to_project',
                    vm: this.props.vm,
                    activeTabIndex: this.props.activeTabIndex
                });
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
        const pointer = activeTip.pointers[pointerIndex];
        tipEvents.showMeClicked(this.props.activeTipId, pointerIndex, pointer.label);
        postTipWatcher.start({
            tipId: this.props.activeTipId,
            trigger: 'show_me',
            vm: this.props.vm,
            activeTabIndex: this.props.activeTabIndex
        });
        highlightElement(pointer, this.props.dispatch, this.props.vm);
    }

    handleVoiceClick () {
        if (this.state.listening) return;
        this.setState({listening: true, interimTranscript: ''});
        tipEvents.voiceStarted();
        voiceListen({
            onInterim: text => this.setState({interimTranscript: text}),
            onEnd: () => this.setState({listening: false, interimTranscript: ''})
        })
            .then(transcript => {
                this.setState({interimTranscript: ''});
                tipEvents.voiceCompleted(transcript);
                this.props.onSetQuery(transcript);
                this.props.onSetLoading(true);
                tipEvents.querySubmitted(transcript, 'voice');
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
            .catch(err => {
                tipEvents.voiceAborted(err && err.message ? err.message : 'aborted');
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
                colorMode={this.props.colorMode}
                expanded={this.props.expanded}
                locale={this.props.locale}
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
                onRandomTip={this.handleRandomTip}
                onPointerClick={this.handlePointerClick}
                onQueryChange={this.handleQueryChange}
                onSelectBrowseTip={this.handleSelectBrowseTip}
                onSelectResult={this.handleSelectResult}
                onShrinkExpand={this.props.onShrinkExpand}
                onStartDrag={this.props.onStartDrag}
                onStarterLinkClick={this.props.onStarterLinkClick}
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
    colorMode: PropTypes.string,
    dispatch: PropTypes.func.isRequired,
    expanded: PropTypes.bool.isRequired,
    isRtl: PropTypes.bool,
    loading: PropTypes.bool.isRequired,
    locale: PropTypes.string,
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
    onStarterLinkClick: PropTypes.func,
    onToggleCode: PropTypes.func.isRequired,
    query: PropTypes.string.isRequired,
    searchResults: PropTypes.arrayOf(PropTypes.shape({
        tipId: PropTypes.string.isRequired,
        score: PropTypes.number.isRequired
    })).isRequired,
    vm: PropTypes.object.isRequired,
    workspaceMetrics: PropTypes.shape({
        targets: PropTypes.object
    }),
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired
};

const mapStateToProps = state => ({
    activeTipId: state.scratchGui.unstuck.activeTipId,
    activeTabIndex: state.scratchGui.editorTab.activeTabIndex,
    browseAll: state.scratchGui.unstuck.browseAll,
    browseFilter: state.scratchGui.unstuck.browseFilter,
    codeExpanded: state.scratchGui.unstuck.codeExpanded,
    colorMode: state.scratchGui.settings.colorMode,
    expanded: state.scratchGui.unstuck.expanded,
    isRtl: state.locales.isRtl,
    loading: state.scratchGui.unstuck.loading,
    locale: state.locales.locale,
    query: state.scratchGui.unstuck.query,
    searchResults: state.scratchGui.unstuck.searchResults,
    workspaceMetrics: state.scratchGui.workspaceMetrics,
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
    onActivateDeck: deckId => dispatch(activateDeck(deckId))
});

const mergeProps = (stateProps, dispatchProps, ownProps) => Object.assign({}, ownProps, stateProps, dispatchProps, {
    onToggleCode: () => {
        if (!stateProps.codeExpanded) tipEvents.codeExpanded(stateProps.activeTipId);
        dispatchProps.dispatch(toggleCodeExpanded());
    },
    onBrowseAll: () => {
        tipEvents.browseOpened();
        dispatchProps.dispatch(setBrowseAll(true));
    },
    onBrowseFilter: tag => {
        tipEvents.browseFilter(tag);
        dispatchProps.dispatch(setBrowseFilter(tag));
    },
    onStarterLinkClick: (tipId, projectUrl) => {
        tipEvents.starterLinkClicked(tipId, projectUrl);
    }
});

export default connect(
    mapStateToProps,
    mapDispatchToProps,
    mergeProps
)(UnstuckCard);
