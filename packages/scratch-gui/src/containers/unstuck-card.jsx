import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import React from 'react';

import {
    closeUnstuck,
    shrinkExpandUnstuck,
    setQuery,
    setTip,
    setLoading,
    dragUnstuck,
    startDrag,
    endDrag,
    openUnstuck,
    toggleCodeExpanded
} from '../reducers/unstuck';

import UnstuckCardComponent from '../components/unstuck-card/unstuck-card.jsx';
import tips, {quickPicks} from '../lib/libraries/tips/index.js';
import KeywordTipProvider from '../lib/unstuck/tip-provider.js';
import EmbeddingTipProvider from '../lib/unstuck/embedding-tip-provider.js';
import extractProjectContext from '../lib/unstuck/context-extractor.js';
import {highlightElement, destroyHighlight} from '../lib/unstuck/pointer-actions.js';
import blockTemplates from '../lib/unstuck/block-templates.js';
import {isSupported as isVoiceSupported, listen as voiceListen} from '../lib/unstuck/voice-input.js';

const keywordProvider = new KeywordTipProvider(tips);
let tipProvider;
try {
    tipProvider = new EmbeddingTipProvider(tips, keywordProvider);
} catch (e) {
    console.warn('[Unstuck] Embedding provider failed to initialize, using keyword fallback', e);
    tipProvider = keywordProvider;
}

const queryTips = function (context, query) {
    const provider = tipProvider._ready ? 'embedding' : 'keyword';
    console.log(`[Tips] query="${query}" provider=${provider}`);
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
            listening: false
        };
        this.handleSubmit = this.handleSubmit.bind(this);
        this.handleQueryChange = this.handleQueryChange.bind(this);
        this.handlePickClick = this.handlePickClick.bind(this);
        this.handleFollowUp = this.handleFollowUp.bind(this);
        this.handleAskAnother = this.handleAskAnother.bind(this);
        this.handlePointerClick = this.handlePointerClick.bind(this);
        this.handleAddToProject = this.handleAddToProject.bind(this);
        this.handleVoiceClick = this.handleVoiceClick.bind(this);
    }

    componentWillUnmount () {
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
                    this.props.onSetTip(results[0].tipId);
                } else {
                    // No matching tip found - show a fallback
                    this.props.onSetTip('nothing-happens');
                }
            });
    }

    handlePickClick (query) {
        this.props.onSetQuery(query);
        // Use setTimeout to let the state update, then submit
        setTimeout(() => {
            this.props.onSetLoading(true);
            const context = extractProjectContext(
                this.props.vm,
                this.props.activeTabIndex
            );
            queryTips(context, query)
                .then(results => {
                    if (results.length > 0) {
                        this.props.onSetTip(results[0].tipId);
                    }
                });
        }, 0);
    }

    handleFollowUp (tipId) {
        this.props.onSetTip(tipId);
    }

    handleAskAnother () {
        destroyHighlight();
        this.props.onSetQuery('');
        this.props.onSetTip(null);
    }

    handleAddToProject () {
        const activeTip = this.props.activeTipId ? tips[this.props.activeTipId] : null;
        if (!activeTip || !activeTip.blockExample) return;
        const template = blockTemplates[activeTip.blockExample];
        if (!template) return;
        this.props.vm.shareBlocksToTarget(template, this.props.vm.editingTarget.id)
            .then(() => {
                this.props.vm.refreshWorkspace();
            });
    }

    handlePointerClick (pointerIndex) {
        const activeTip = this.props.activeTipId ? tips[this.props.activeTipId] : null;
        if (!activeTip || !activeTip.pointers || !activeTip.pointers[pointerIndex]) return;
        highlightElement(activeTip.pointers[pointerIndex], this.props.dispatch);
    }

    handleVoiceClick () {
        if (this.state.listening) return;
        this.setState({listening: true});
        voiceListen({
            onEnd: () => this.setState({listening: false})
        })
            .then(transcript => {
                this.props.onSetQuery(transcript);
                // Auto-submit after getting the transcript
                this.props.onSetLoading(true);
                const context = extractProjectContext(
                    this.props.vm,
                    this.props.activeTabIndex
                );
                queryTips(context, transcript)
                    .then(results => {
                        if (results.length > 0) {
                            this.props.onSetTip(results[0].tipId);
                        }
                    });
            })
            .catch(() => {
                this.setState({listening: false});
            });
    }

    render () {
        const activeTip = this.props.activeTipId ? tips[this.props.activeTipId] : null;

        return (
            <UnstuckCardComponent
                activeTip={activeTip}
                codeExpanded={this.props.codeExpanded}
                expanded={this.props.expanded}
                listening={this.state.listening}
                loading={this.props.loading}
                query={this.props.query}
                voiceSupported={isVoiceSupported()}
                quickPicks={quickPicks}
                tips={tips}
                x={this.props.x}
                y={this.props.y}
                onAddToProject={this.handleAddToProject}
                onAskAnother={this.handleAskAnother}
                onClose={this.props.onClose}
                onDrag={this.props.onDrag}
                onEndDrag={this.props.onEndDrag}
                onFollowUp={this.handleFollowUp}
                onPickClick={this.handlePickClick}
                onPointerClick={this.handlePointerClick}
                onQueryChange={this.handleQueryChange}
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
    codeExpanded: PropTypes.bool.isRequired,
    dispatch: PropTypes.func.isRequired,
    expanded: PropTypes.bool.isRequired,
    loading: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onDrag: PropTypes.func.isRequired,
    onEndDrag: PropTypes.func.isRequired,
    onSetLoading: PropTypes.func.isRequired,
    onSetQuery: PropTypes.func.isRequired,
    onSetTip: PropTypes.func.isRequired,
    onShrinkExpand: PropTypes.func.isRequired,
    onStartDrag: PropTypes.func.isRequired,
    onToggleCode: PropTypes.func.isRequired,
    query: PropTypes.string.isRequired,
    vm: PropTypes.object.isRequired,
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired
};

const mapStateToProps = state => ({
    activeTipId: state.scratchGui.unstuck.activeTipId,
    activeTabIndex: state.scratchGui.editorTab.activeTabIndex,
    codeExpanded: state.scratchGui.unstuck.codeExpanded,
    expanded: state.scratchGui.unstuck.expanded,
    loading: state.scratchGui.unstuck.loading,
    query: state.scratchGui.unstuck.query,
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
    onOpen: () => dispatch(openUnstuck()),
    onSetLoading: loading => dispatch(setLoading(loading)),
    onSetQuery: query => dispatch(setQuery(query)),
    onSetTip: tipId => dispatch(setTip(tipId)),
    onShrinkExpand: () => dispatch(shrinkExpandUnstuck()),
    onStartDrag: () => dispatch(startDrag()),
    onToggleCode: () => dispatch(toggleCodeExpanded())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(UnstuckCard);
