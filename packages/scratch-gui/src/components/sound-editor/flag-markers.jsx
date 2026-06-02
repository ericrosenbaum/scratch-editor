import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';

import Input from '../forms/input.jsx';
import BufferedInputHOC from '../forms/buffered-input-hoc.jsx';

import styles from './flag-markers.css';
import flagIcon from './icon--flag.svg';
import playIcon from './icon--play.svg';
import stopIcon from './icon--stop.svg';
import deleteIcon from '../delete-button/icon--delete.svg';

const BufferedInput = BufferedInputHOC(Input);

const FlagMarkers = props => {
    const {markers, duration, selectedId, rootRef} = props;
    return (
        <div
            className={styles.overlay}
            ref={rootRef}
        >
            {markers.map(marker => {
                const position = duration > 0 ? (marker.time / duration) : 0;
                const isSelected = marker.broadcastId === selectedId;
                // Keep the popover on screen: anchor it left/right near the edges
                // instead of centering it (which would clip off the panel).
                const popoverSide = position < 0.34 ? styles.popoverLeft :
                    (position > 0.66 ? styles.popoverRight : null);
                return (
                    <div
                        key={marker.broadcastId}
                        className={classNames(styles.marker, {[styles.selected]: isSelected})}
                        style={{left: `${Math.max(0, Math.min(1, position)) * 100}%`}}
                    >
                        <div className={styles.line} />
                        <div className={styles.number}>{marker.number}</div>
                        <div
                            className={styles.handle}
                            title={marker.name}
                            onMouseDown={e => props.onMarkerMouseDown(marker.broadcastId, e)}
                            onTouchStart={e => props.onMarkerMouseDown(marker.broadcastId, e)}
                        >
                            <img
                                draggable={false}
                                src={flagIcon}
                            />
                        </div>
                        {isSelected ? (
                            <div className={classNames(styles.popover, popoverSide)}>
                                <div
                                    className={classNames(styles.playButton, {[styles.stopButton]: props.playing})}
                                    role="button"
                                    title={props.playing ? props.stopLabel : props.playLabel}
                                    onClick={() => (
                                        props.playing ? props.onStopMarker() : props.onPlayMarker(marker.time)
                                    )}
                                >
                                    <img
                                        draggable={false}
                                        src={props.playing ? stopIcon : playIcon}
                                    />
                                </div>
                                <div className={styles.inputColumn}>
                                    <div className={styles.inputLabel}>{props.broadcastLabel}</div>
                                    <BufferedInput
                                        className={styles.popoverInput}
                                        type="text"
                                        value={marker.name}
                                        onSubmit={name => props.onRenameMarker(marker.broadcastId, name)}
                                    />
                                </div>
                                <div
                                    className={styles.deleteButton}
                                    role="button"
                                    title={props.deleteLabel}
                                    onClick={() => props.onDeleteMarker(marker.broadcastId)}
                                >
                                    <img
                                        draggable={false}
                                        src={deleteIcon}
                                    />
                                </div>
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
};

FlagMarkers.propTypes = {
    broadcastLabel: PropTypes.string,
    deleteLabel: PropTypes.string,
    duration: PropTypes.number,
    markers: PropTypes.arrayOf(PropTypes.shape({
        broadcastId: PropTypes.string,
        name: PropTypes.string,
        number: PropTypes.number,
        time: PropTypes.number
    })),
    onDeleteMarker: PropTypes.func,
    onMarkerMouseDown: PropTypes.func,
    onPlayMarker: PropTypes.func,
    onRenameMarker: PropTypes.func,
    onStopMarker: PropTypes.func,
    playLabel: PropTypes.string,
    playing: PropTypes.bool,
    rootRef: PropTypes.func,
    selectedId: PropTypes.string,
    stopLabel: PropTypes.string
};

export default FlagMarkers;
