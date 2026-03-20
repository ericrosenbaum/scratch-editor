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
    openUnstuck
} from '../reducers/unstuck';

import UnstuckCardComponent from '../components/unstuck-card/unstuck-card.jsx';
import tips, {quickPicks} from '../lib/libraries/tips/index.js';
import KeywordTipProvider from '../lib/unstuck/tip-provider.js';
import extractProjectContext from '../lib/unstuck/context-extractor.js';

const tipProvider = new KeywordTipProvider(tips);

class UnstuckCard extends React.Component {
    constructor (props) {
        super(props);
        this.handleSubmit = this.handleSubmit.bind(this);
        this.handleQueryChange = this.handleQueryChange.bind(this);
        this.handlePickClick = this.handlePickClick.bind(this);
        this.handleFollowUp = this.handleFollowUp.bind(this);
        this.handleAskAnother = this.handleAskAnother.bind(this);
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

        tipProvider.getTips(context, query)
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
            tipProvider.getTips(context, query)
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
        this.props.onSetQuery('');
        this.props.onSetTip(null);
    }

    render () {
        const activeTip = this.props.activeTipId ? tips[this.props.activeTipId] : null;

        return (
            <UnstuckCardComponent
                activeTip={activeTip}
                expanded={this.props.expanded}
                loading={this.props.loading}
                query={this.props.query}
                quickPicks={quickPicks}
                tips={tips}
                x={this.props.x}
                y={this.props.y}
                onAskAnother={this.handleAskAnother}
                onClose={this.props.onClose}
                onDrag={this.props.onDrag}
                onEndDrag={this.props.onEndDrag}
                onFollowUp={this.handleFollowUp}
                onPickClick={this.handlePickClick}
                onQueryChange={this.handleQueryChange}
                onShrinkExpand={this.props.onShrinkExpand}
                onStartDrag={this.props.onStartDrag}
                onSubmit={this.handleSubmit}
            />
        );
    }
}

UnstuckCard.propTypes = {
    activeTipId: PropTypes.string,
    activeTabIndex: PropTypes.number.isRequired,
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
    query: PropTypes.string.isRequired,
    vm: PropTypes.object.isRequired,
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired
};

const mapStateToProps = state => ({
    activeTipId: state.scratchGui.unstuck.activeTipId,
    activeTabIndex: state.scratchGui.editorTab.activeTabIndex,
    expanded: state.scratchGui.unstuck.expanded,
    loading: state.scratchGui.unstuck.loading,
    query: state.scratchGui.unstuck.query,
    x: state.scratchGui.unstuck.x,
    y: state.scratchGui.unstuck.y
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeUnstuck()),
    onDrag: (e_, data) => dispatch(dragUnstuck(data.x, data.y)),
    onEndDrag: () => dispatch(endDrag()),
    onOpen: () => dispatch(openUnstuck()),
    onSetLoading: loading => dispatch(setLoading(loading)),
    onSetQuery: query => dispatch(setQuery(query)),
    onSetTip: tipId => dispatch(setTip(tipId)),
    onShrinkExpand: () => dispatch(shrinkExpandUnstuck()),
    onStartDrag: () => dispatch(startDrag())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(UnstuckCard);
