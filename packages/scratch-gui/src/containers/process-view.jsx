import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import ProcessViewComponent from '../components/process-view/process-view.jsx';
import {
    toggleProcessView,
    toggleSession,
    toggleChunk,
    setFilter,
    expandAll,
    collapseAll
} from '../reducers/process-view';
import {detectChunks, generateSessionLabel} from '../lib/process-view/process-summarizer';

class ProcessView extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClose',
            'handleToggleSession',
            'handleToggleChunk',
            'handleSetFilter',
            'handleExpandAll',
            'handleCollapseAll',
            'loadData'
        ]);

        this.state = {
            sessions: [],
            sessionChunksMap: {},
            chunkEventsMap: {}
        };

        this._loadTimer = null;
    }

    componentDidMount () {
        if (this.props.visible) {
            this.loadData();
        }
    }

    componentDidUpdate (prevProps) {
        if (this.props.visible && !prevProps.visible) {
            this.loadData();
        }
    }

    componentWillUnmount () {
        if (this._loadTimer) {
            clearTimeout(this._loadTimer);
        }
    }

    async loadData () {
        const {processStorage} = this.props;
        if (!processStorage) return;

        try {
            const sessions = await processStorage.getSessions();
            const sessionChunksMap = {};
            const chunkEventsMap = {};

            for (const session of sessions) {
                const events = await processStorage.getEventsForSession(session.id);

                // Always regenerate chunks from current events so new
                // events recorded since the last open are included.
                let chunks = [];
                if (events.length > 0) {
                    chunks = detectChunks(session.id, events);
                    if (chunks.length > 0) {
                        await processStorage.saveChunks(chunks);
                    }
                }

                // Generate session label
                if (!session.heuristicLabel && chunks.length > 0) {
                    const label = generateSessionLabel(chunks, events);
                    await processStorage.updateSession(session.id, {
                        heuristicLabel: label
                    });
                    session.heuristicLabel = label;
                }

                sessionChunksMap[session.id] = chunks;

                // Map chunk events
                for (const chunk of chunks) {
                    const chunkEvents = events.filter(e =>
                        chunk.eventIds.includes(e.id)
                    );
                    chunkEventsMap[chunk.id] = chunkEvents;
                }
            }

            this.setState({sessions, sessionChunksMap, chunkEventsMap});
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('ProcessView: failed to load data', e);
        }
    }

    handleClose () {
        this.props.onToggleProcessView();
    }

    handleToggleSession (sessionId) {
        this.props.onToggleSession(sessionId);
    }

    handleToggleChunk (chunkId) {
        this.props.onToggleChunk(chunkId);
    }

    handleSetFilter (filterName, value) {
        this.props.onSetFilter(filterName, value);
    }

    handleExpandAll () {
        const sessionIds = this.state.sessions.map(s => s.id);
        const chunkIds = Object.values(this.state.sessionChunksMap)
            .flat()
            .map(c => c.id);
        this.props.onExpandAll(sessionIds, chunkIds);
    }

    handleCollapseAll () {
        this.props.onCollapseAll();
    }

    render () {
        return (
            <ProcessViewComponent
                visible={this.props.visible}
                sessions={this.state.sessions}
                sessionChunksMap={this.state.sessionChunksMap}
                chunkEventsMap={this.state.chunkEventsMap}
                expandedSessions={this.props.expandedSessions}
                expandedChunks={this.props.expandedChunks}
                filters={this.props.filters}
                onClose={this.handleClose}
                onToggleSession={this.handleToggleSession}
                onToggleChunk={this.handleToggleChunk}
                onSetFilter={this.handleSetFilter}
                onExpandAll={this.handleExpandAll}
                onCollapseAll={this.handleCollapseAll}
            />
        );
    }
}

ProcessView.propTypes = {
    visible: PropTypes.bool.isRequired,
    expandedSessions: PropTypes.object.isRequired,
    expandedChunks: PropTypes.object.isRequired,
    filters: PropTypes.object.isRequired,
    processStorage: PropTypes.object,
    onToggleProcessView: PropTypes.func.isRequired,
    onToggleSession: PropTypes.func.isRequired,
    onToggleChunk: PropTypes.func.isRequired,
    onSetFilter: PropTypes.func.isRequired,
    onExpandAll: PropTypes.func.isRequired,
    onCollapseAll: PropTypes.func.isRequired
};

const mapStateToProps = state => ({
    visible: state.scratchGui.processView.visible,
    expandedSessions: state.scratchGui.processView.expandedSessions,
    expandedChunks: state.scratchGui.processView.expandedChunks,
    filters: state.scratchGui.processView.filters
});

const mapDispatchToProps = dispatch => ({
    onToggleProcessView: () => dispatch(toggleProcessView()),
    onToggleSession: sessionId => dispatch(toggleSession(sessionId)),
    onToggleChunk: chunkId => dispatch(toggleChunk(chunkId)),
    onSetFilter: (name, value) => dispatch(setFilter(name, value)),
    onExpandAll: (sessionIds, chunkIds) => dispatch(expandAll(sessionIds, chunkIds)),
    onCollapseAll: () => dispatch(collapseAll())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(ProcessView);
