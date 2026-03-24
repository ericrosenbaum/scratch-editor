import React from 'react';
import PropTypes from 'prop-types';

import SessionCard from './session-card.jsx';
import styles from './process-view.css';

const FILTER_LABELS = {
    coding: 'Coding',
    drawing: 'Drawing',
    sound: 'Sound',
    testing: 'Testing',
    debugging: 'Debugging',
    exploring: 'Exploring'
};

const ProcessViewComponent = ({
    visible, sessions, sessionChunksMap, chunkEventsMap,
    expandedSessions, expandedChunks, filters,
    onClose, onToggleSession, onToggleChunk,
    onSetFilter, onExpandAll, onCollapseAll
}) => {
    if (!visible) return null;

    const totalSessions = sessions.length;
    const totalChunks = Object.values(sessionChunksMap)
        .reduce((sum, chunks) => sum + chunks.length, 0);

    return (
        <div className={styles['process-view-overlay']}>
            <div className={styles.header}>
                <div>
                    <div className={styles['header-title']}>Process View</div>
                    <div className={styles['header-stats']}>
                        {totalSessions} session{totalSessions !== 1 ? 's' : ''}
                        {' \u00B7 '}
                        {totalChunks} chunk{totalChunks !== 1 ? 's' : ''}
                    </div>
                </div>
                <button
                    className={styles['close-button']}
                    onClick={onClose}
                    title="Close"
                >
                    {'\u2715'}
                </button>
            </div>

            <div className={styles['filter-bar']}>
                {Object.entries(FILTER_LABELS).map(([key, label]) => {
                    const activeClass = filters[key] ?
                        `${styles['filter-pill-active']} ${styles[`filter-pill-${key}`]}` : '';
                    return (
                        <button
                            key={key}
                            className={`${styles['filter-pill']} ${activeClass}`}
                            onClick={() => onSetFilter(key, !filters[key])}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>

            <div className={styles.toolbar}>
                <button
                    className={styles['toolbar-button']}
                    onClick={onExpandAll}
                >
                    Expand All
                </button>
                <button
                    className={styles['toolbar-button']}
                    onClick={onCollapseAll}
                >
                    Collapse All
                </button>
            </div>

            <div className={styles['session-list']}>
                {sessions.length === 0 ? (
                    <div className={styles['empty-state']}>
                        No sessions recorded yet.
                        <br />
                        Start editing to see your creative history!
                    </div>
                ) : (
                    sessions.slice().reverse().map(session => {
                        const chunks = (sessionChunksMap[session.id] || [])
                            .filter(c => filters[c.classification]);

                        return (
                            <SessionCard
                                key={session.id}
                                session={session}
                                chunks={chunks}
                                chunkEventsMap={chunkEventsMap}
                                expanded={!!expandedSessions[session.id]}
                                expandedChunks={expandedChunks}
                                onToggle={() => onToggleSession(session.id)}
                                onToggleChunk={onToggleChunk}
                            />
                        );
                    })
                )}
            </div>
        </div>
    );
};

ProcessViewComponent.propTypes = {
    visible: PropTypes.bool.isRequired,
    sessions: PropTypes.arrayOf(PropTypes.object).isRequired,
    sessionChunksMap: PropTypes.object.isRequired,
    chunkEventsMap: PropTypes.object.isRequired,
    expandedSessions: PropTypes.object.isRequired,
    expandedChunks: PropTypes.object.isRequired,
    filters: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired,
    onToggleSession: PropTypes.func.isRequired,
    onToggleChunk: PropTypes.func.isRequired,
    onSetFilter: PropTypes.func.isRequired,
    onExpandAll: PropTypes.func.isRequired,
    onCollapseAll: PropTypes.func.isRequired
};

export default ProcessViewComponent;
