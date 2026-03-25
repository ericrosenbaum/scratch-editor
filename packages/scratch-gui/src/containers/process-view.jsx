import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import ProcessViewComponent from '../components/process-view/process-view.jsx';
import {
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
            'handleToggleSession',
            'handleToggleChunk',
            'handleSetFilter',
            'handleExpandAll',
            'handleCollapseAll',
            'handleClearHistory',
            'handleDeleteSession',
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
        this.loadData();
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

            // Hide sessions that have no chunks or events
            const visibleSessions = sessions.filter(s =>
                (sessionChunksMap[s.id] || []).length > 0
            );

            this.setState({sessions: visibleSessions, sessionChunksMap, chunkEventsMap});
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('ProcessView: failed to load data', e);
        }
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

    async handleClearHistory () {
        // eslint-disable-next-line no-alert
        if (!window.confirm('Clear all process history? This cannot be undone.')) return;
        const {processStorage} = this.props;
        if (!processStorage) return;
        await processStorage.clearAll();
        this.setState({sessions: [], sessionChunksMap: {}, chunkEventsMap: {}});
    }

    async handleDeleteSession (sessionId) {
        const {processStorage} = this.props;
        if (!processStorage) return;
        await processStorage.deleteSession(sessionId);
        this.setState(prevState => {
            const sessions = prevState.sessions.filter(s => s.id !== sessionId);
            const sessionChunksMap = Object.assign({}, prevState.sessionChunksMap);
            const chunkEventsMap = Object.assign({}, prevState.chunkEventsMap);
            const chunks = sessionChunksMap[sessionId] || [];
            for (const chunk of chunks) {
                delete chunkEventsMap[chunk.id];
            }
            delete sessionChunksMap[sessionId];
            return {sessions, sessionChunksMap, chunkEventsMap};
        });
    }

    render () {
        return (
            <ProcessViewComponent
                sessions={this.state.sessions}
                sessionChunksMap={this.state.sessionChunksMap}
                chunkEventsMap={this.state.chunkEventsMap}
                expandedSessions={this.props.expandedSessions}
                expandedChunks={this.props.expandedChunks}
                filters={this.props.filters}
                onToggleSession={this.handleToggleSession}
                onToggleChunk={this.handleToggleChunk}
                onSetFilter={this.handleSetFilter}
                onExpandAll={this.handleExpandAll}
                onCollapseAll={this.handleCollapseAll}
                onClearHistory={this.handleClearHistory}
                onDeleteSession={this.handleDeleteSession}
            />
        );
    }
}

ProcessView.propTypes = {
    expandedSessions: PropTypes.object.isRequired,
    expandedChunks: PropTypes.object.isRequired,
    filters: PropTypes.object.isRequired,
    processStorage: PropTypes.object,
    onToggleSession: PropTypes.func.isRequired,
    onToggleChunk: PropTypes.func.isRequired,
    onSetFilter: PropTypes.func.isRequired,
    onExpandAll: PropTypes.func.isRequired,
    onCollapseAll: PropTypes.func.isRequired
};

const mapStateToProps = state => ({
    expandedSessions: state.scratchGui.processView.expandedSessions,
    expandedChunks: state.scratchGui.processView.expandedChunks,
    filters: state.scratchGui.processView.filters
});

const mapDispatchToProps = dispatch => ({
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
