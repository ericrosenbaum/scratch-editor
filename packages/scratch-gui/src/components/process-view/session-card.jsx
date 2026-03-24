import React from 'react';
import PropTypes from 'prop-types';

import ChunkCard from './chunk-card.jsx';
import styles from './session-card.css';

const formatDate = timestamp => {
    const d = new Date(timestamp);
    return d.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const formatDuration = (startTime, endTime) => {
    if (!endTime) return 'ongoing';
    const diffMs = endTime - startTime;
    if (diffMs < 60000) return `${Math.round(diffMs / 1000)}s`;
    if (diffMs < 3600000) return `${Math.round(diffMs / 60000)}m`;
    const hours = Math.floor(diffMs / 3600000);
    const mins = Math.round((diffMs % 3600000) / 60000);
    return `${hours}h ${mins}m`;
};

const SessionCard = ({
    session, chunks, chunkEventsMap, expanded,
    expandedChunks, onToggle, onToggleChunk
}) => {
    const thumbnail = session.stageSnapshotEnd || session.stageSnapshotStart;
    const label = session.aiLabel || session.heuristicLabel || 'Editing session';
    const totalEvents = chunks.reduce((sum, c) => sum + (chunkEventsMap[c.id] || []).length, 0);

    return (
        <div className={styles['session-card']}>
            <div
                className={styles['session-header']}
                onClick={onToggle}
            >
                <span className={`${styles['expand-icon']} ${expanded ? styles['expand-icon-open'] : ''}`}>
                    {'\u25B6'}
                </span>
                {thumbnail ? (
                    <img
                        className={styles['session-thumbnail']}
                        src={thumbnail}
                        alt="Stage snapshot"
                    />
                ) : (
                    <div className={styles['session-thumbnail-placeholder']}>
                        {'\uD83C\uDFAC'}
                    </div>
                )}
                <div className={styles['session-info']}>
                    <div className={styles['session-date']}>
                        {formatDate(session.startTime)}
                    </div>
                    <div className={styles['session-label']}>{label}</div>
                    <div className={styles['session-stats']}>
                        <span className={styles['session-stat']}>
                            {formatDuration(session.startTime, session.endTime)}
                        </span>
                        <span className={styles['session-stat']}>
                            {chunks.length} chunk{chunks.length !== 1 ? 's' : ''}
                        </span>
                        <span className={styles['session-stat']}>
                            {totalEvents} event{totalEvents !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>
            </div>
            {expanded && (
                <div className={styles['session-body']}>
                    {chunks.map(chunk => (
                        <ChunkCard
                            key={chunk.id}
                            chunk={chunk}
                            events={chunkEventsMap[chunk.id] || []}
                            expanded={!!expandedChunks[chunk.id]}
                            onToggle={() => onToggleChunk(chunk.id)}
                        />
                    ))}
                    {chunks.length === 0 && (
                        <div style={{fontSize: 12, color: '#999', padding: 8}}>
                            No activity chunks detected
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

SessionCard.propTypes = {
    session: PropTypes.shape({
        id: PropTypes.string.isRequired,
        startTime: PropTypes.number.isRequired,
        endTime: PropTypes.number,
        stageSnapshotStart: PropTypes.string,
        stageSnapshotEnd: PropTypes.string,
        aiLabel: PropTypes.string,
        heuristicLabel: PropTypes.string
    }).isRequired,
    chunks: PropTypes.arrayOf(PropTypes.object).isRequired,
    chunkEventsMap: PropTypes.object.isRequired,
    expanded: PropTypes.bool.isRequired,
    expandedChunks: PropTypes.object.isRequired,
    onToggle: PropTypes.func.isRequired,
    onToggleChunk: PropTypes.func.isRequired
};

export default SessionCard;
