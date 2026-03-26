import React from 'react';
import PropTypes from 'prop-types';

import styles from './event-row.css';

const formatTime = timestamp => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'});
};

const getEventDescription = event => {
    const d = event.data || {};
    switch (event.type) {
    case 'blocks_changed': {
        // Use rich summary if available, else fall back to count
        if (d.summary) return d.summary;
        const count = Math.abs(d.blockCount || 0);
        if (d.action === 'added') return `Added ${count} block${count !== 1 ? 's' : ''}`;
        if (d.action === 'deleted') return `Deleted ${count} block${count !== 1 ? 's' : ''}`;
        return `Modified blocks`;
    }
    case 'blocks_moved_between_sprites':
        return `Moved ${d.blockCount || ''} blocks from ${d.fromSprite} to ${d.toSprite}`;
    case 'costume_added':
    case 'backdrop_added':
        return `Added costume "${d.costumeName}"`;
    case 'costume_edited':
    case 'backdrop_edited':
        return `Edited costume "${d.costumeName}"`;
    case 'costume_deleted':
    case 'backdrop_deleted':
        return `Deleted costume "${d.costumeName}"`;
    case 'costume_duplicated':
        return `Duplicated costume "${d.sourceCostume}"`;
    case 'sound_added':
        return `Added sound "${d.soundName}"`;
    case 'sound_deleted':
        return `Deleted sound "${d.soundName}"`;
    case 'sound_recorded':
        return `Recorded sound "${d.soundName}"`;
    case 'sprite_added':
        return `Added sprite "${d.spriteName}"`;
    case 'sprite_deleted':
        return `Deleted sprite "${d.spriteName}"`;
    case 'sprite_renamed':
        return `Renamed "${d.oldName}" to "${d.newName}"`;
    case 'execution_started':
        return '\u25B6 Started running';
    case 'execution_stopped': {
        const secs = d.durationMs ? (d.durationMs / 1000).toFixed(1) : '?';
        return `\u23F9 Stopped (${secs}s)`;
    }
    case 'ui_green_flag':
        return '\u2691 Clicked green flag';
    case 'ui_stop_button':
        return '\u23F9 Clicked stop';
    case 'ui_stack_click':
        return '\u25B6 Clicked a block stack';
    case 'variable_created': {
        const varLabel = d.varType === 'list' ? 'list' : 'variable';
        const scope = d.isCloud ? ' (cloud)' : d.isLocal ? ' (local)' : '';
        return `Created ${varLabel} "${d.varName}"${scope}`;
    }
    case 'variable_renamed':
        return `Renamed variable "${d.oldName}" to "${d.newName}"`;
    case 'variable_deleted':
        return `Deleted ${d.varType === 'list' ? 'list' : 'variable'} "${d.varName}"`;
    case 'extension_added':
        return `Added extension "${d.extensionName || d.extensionId}"`;
    case 'tab_switched':
        return `Switched to ${d.toTab} tab`;
    case 'comment_added':
        return 'Added a comment';
    case 'comment_deleted':
        return 'Deleted a comment';
    default:
        return event.type;
    }
};

const EventRow = ({event}) => {
    const dotClass = `dot-${event.type}`;

    return (
        <div className={styles['event-row']}>
            <div className={`${styles['timeline-dot']} ${styles[dotClass] || ''}`} />
            <div className={styles['event-content']}>
                <div className={styles['event-label']}>
                    {getEventDescription(event)}
                    {event.sprite && (
                        <span className={styles['sprite-chip']}>{event.sprite}</span>
                    )}
                </div>
                <div className={styles['event-time']}>{formatTime(event.timestamp)}</div>
            </div>
            {event.thumbnail && (
                <img
                    className={styles['event-thumbnail']}
                    src={event.thumbnail}
                    alt=""
                />
            )}
        </div>
    );
};

EventRow.propTypes = {
    event: PropTypes.shape({
        id: PropTypes.string,
        type: PropTypes.string.isRequired,
        timestamp: PropTypes.number.isRequired,
        sprite: PropTypes.string,
        data: PropTypes.object,
        thumbnail: PropTypes.string
    }).isRequired
};

export default EventRow;
