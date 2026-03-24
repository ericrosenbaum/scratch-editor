import React from 'react';
import PropTypes from 'prop-types';

import EventRow from './event-row.jsx';
import styles from './chunk-card.css';

const formatDuration = (startTime, endTime) => {
    const diffMs = endTime - startTime;
    if (diffMs < 60000) return `${Math.round(diffMs / 1000)}s`;
    return `${Math.round(diffMs / 60000)}m`;
};

const ChunkCard = ({chunk, events, expanded, onToggle}) => {
    const cardClass = `chunk-card-${chunk.classification}`;
    const badgeClass = `badge-${chunk.classification}`;

    return (
        <div className={`${styles['chunk-card']} ${styles[cardClass] || ''}`}>
            <div
                className={styles['chunk-header']}
                onClick={onToggle}
            >
                {chunk.stageSnapshot && (
                    <img
                        className={styles['chunk-thumbnail']}
                        src={chunk.stageSnapshot}
                        alt=""
                    />
                )}
                <div className={styles['chunk-info']}>
                    <div className={styles['chunk-label-row']}>
                        <span className={`${styles['classification-badge']} ${styles[badgeClass] || ''}`}>
                            {chunk.classification}
                        </span>
                        <span className={styles['chunk-label']}>
                            {chunk.aiLabel || chunk.heuristicLabel}
                        </span>
                    </div>
                    <div className={styles['chunk-meta']}>
                        {formatDuration(chunk.startTime, chunk.endTime)}
                        {' \u00B7 '}
                        {events.length} event{events.length !== 1 ? 's' : ''}
                    </div>
                </div>
            </div>
            {expanded && (
                <div className={styles['chunk-body']}>
                    {events.map(event => (
                        <EventRow key={event.id} event={event} />
                    ))}
                </div>
            )}
        </div>
    );
};

ChunkCard.propTypes = {
    chunk: PropTypes.shape({
        id: PropTypes.string.isRequired,
        classification: PropTypes.string.isRequired,
        heuristicLabel: PropTypes.string.isRequired,
        aiLabel: PropTypes.string,
        stageSnapshot: PropTypes.string,
        startTime: PropTypes.number.isRequired,
        endTime: PropTypes.number.isRequired
    }).isRequired,
    events: PropTypes.arrayOf(PropTypes.object).isRequired,
    expanded: PropTypes.bool.isRequired,
    onToggle: PropTypes.func.isRequired
};

export default ChunkCard;
