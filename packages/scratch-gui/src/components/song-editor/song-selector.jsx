import React from 'react';
import PropTypes from 'prop-types';

import Input from '../forms/input.jsx';
import BufferedInputHOC from '../forms/buffered-input-hoc.jsx';

const BufferedInput = BufferedInputHOC(Input);

const stopPropagation = e => e.stopPropagation();

const SongSelectorItem = props => {
    const {song, isSelected, canDelete, onSelect, onDuplicate, onDelete, onRename} = props;
    const songId = song.songId;
    const trackCount = (song.tracks || []).length;

    const handleSelect = React.useCallback(() => onSelect(songId), [onSelect, songId]);
    const handleKeyDown = React.useCallback(e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(songId);
        }
    }, [onSelect, songId]);
    const handleDuplicate = React.useCallback(e => {
        e.stopPropagation();
        onDuplicate(songId);
    }, [onDuplicate, songId]);
    const handleDelete = React.useCallback(e => {
        e.stopPropagation();
        onDelete(songId);
    }, [onDelete, songId]);
    const handleRename = React.useCallback(name => onRename(songId, name), [onRename, songId]);

    return (
        <div
            className={`song-selector-item${isSelected ? ' is-selected' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`Select song ${song.name}`}
            onClick={handleSelect}
            onKeyDown={handleKeyDown}
        >
            {isSelected ? (
                <BufferedInput
                    className="song-selector-name-input"
                    type="text"
                    maxLength={40}
                    aria-label="Song name"
                    value={song.name}
                    /* Keep the card's key/click handling (select on
                       Enter/Space) away from typing in the name field. */
                    onKeyDown={stopPropagation}
                    onClick={stopPropagation}
                    onSubmit={handleRename}
                />
            ) : (
                <span className="song-selector-name">{song.name}</span>
            )}
            <span className="song-selector-meta">
                {`${trackCount} ${trackCount === 1 ? 'track' : 'tracks'} · ${song.tempo} bpm`}
            </span>
            {isSelected && (
                <div className="song-selector-item-actions">
                    <button
                        className="song-selector-action-btn"
                        title="Duplicate song"
                        aria-label={`Duplicate song ${song.name}`}
                        onClick={handleDuplicate}
                    >
                        {'Duplicate'}
                    </button>
                    <button
                        className="song-selector-action-btn song-selector-delete-btn"
                        title="Delete song"
                        aria-label={`Delete song ${song.name}`}
                        disabled={!canDelete}
                        onClick={handleDelete}
                    >
                        {'Delete'}
                    </button>
                </div>
            )}
        </div>
    );
};

SongSelectorItem.propTypes = {
    song: PropTypes.shape({
        songId: PropTypes.string.isRequired,
        name: PropTypes.string,
        tempo: PropTypes.number,
        tracks: PropTypes.arrayOf(PropTypes.shape({}))
    }).isRequired,
    isSelected: PropTypes.bool.isRequired,
    canDelete: PropTypes.bool.isRequired,
    onSelect: PropTypes.func.isRequired,
    onDuplicate: PropTypes.func.isRequired,
    onDelete: PropTypes.func.isRequired,
    onRename: PropTypes.func.isRequired
};

/**
 * Left-hand column of the Song Maker listing the project's songs — the
 * asset-selector pattern the sound/costume tabs use, but as a simple list
 * (the shared AssetPanel Selector is welded to sprite thumbnails and the
 * app-wide drag-and-drop, neither of which apply inside the Song Maker
 * modal). Clicking a card selects that song for editing AND makes it the
 * active song the blocks play — one concept, like the current costume.
 * @param {object} props - see propTypes.
 * @returns {JSX.Element} the selector column.
 */
const SongSelector = props => {
    const {
        songs,
        activeSongId,
        onSelectSong,
        onNewSong,
        onDuplicateSong,
        onDeleteSong,
        onRenameSong
    } = props;

    return (
        <div className="song-selector">
            <div className="song-selector-list">
                {songs.map(song => (
                    <SongSelectorItem
                        key={song.songId}
                        song={song}
                        isSelected={song.songId === activeSongId}
                        canDelete={songs.length > 1}
                        onSelect={onSelectSong}
                        onDuplicate={onDuplicateSong}
                        onDelete={onDeleteSong}
                        onRename={onRenameSong}
                    />
                ))}
            </div>
            <button
                className="song-selector-new-btn"
                onClick={onNewSong}
            >
                {'+ New Song'}
            </button>
        </div>
    );
};

SongSelector.propTypes = {
    songs: PropTypes.arrayOf(PropTypes.shape({
        songId: PropTypes.string.isRequired,
        name: PropTypes.string,
        tempo: PropTypes.number,
        tracks: PropTypes.arrayOf(PropTypes.shape({}))
    })).isRequired,
    activeSongId: PropTypes.string,
    onSelectSong: PropTypes.func.isRequired,
    onNewSong: PropTypes.func.isRequired,
    onDuplicateSong: PropTypes.func.isRequired,
    onDeleteSong: PropTypes.func.isRequired,
    onRenameSong: PropTypes.func.isRequired
};

export default SongSelector;
