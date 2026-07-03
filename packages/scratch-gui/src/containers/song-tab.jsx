import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import VM from '@scratch/scratch-vm';

import SongEditor from '../components/song-editor/song-editor.jsx';
import SongSelector from '../components/song-editor/song-selector.jsx';
import '../components/song-editor/song-editor.raw.css';
import errorBoundaryHOC from '../lib/error-boundary-hoc.jsx';
import {createBlankSong} from '../lib/song-defaults.js';

class SongTab extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleSongUpdate',
            'handleSelectSong',
            'handleNewSong',
            'handleDuplicateSong',
            'handleDeleteSong',
            'handleRenameSong'
        ]);
    }

    componentDidMount () {
        // The project holds a list of songs with one ACTIVE at a time (the one
        // the blocks play and this editor shows). Re-render on both structural
        // changes (SONGS_CHANGED: add/delete/rename/edit/load) and selection
        // changes (ACTIVE_SONG_CHANGED: the selector, a `switch to song`
        // block). Bootstrap a blank song on an empty project so the editor
        // always has something to render.
        this._onSongsChanged = () => this.forceUpdate();
        this.props.vm.runtime.on('SONGS_CHANGED', this._onSongsChanged);
        this.props.vm.runtime.on('ACTIVE_SONG_CHANGED', this._onSongsChanged);
        if (this.props.vm.runtime.songs.length === 0) {
            this.props.vm.addSong(createBlankSong('Song'));
        }
    }

    componentWillUnmount () {
        if (this._onSongsChanged) {
            this.props.vm.runtime.removeListener('SONGS_CHANGED', this._onSongsChanged);
            this.props.vm.runtime.removeListener('ACTIVE_SONG_CHANGED', this._onSongsChanged);
        }
    }

    handleSongUpdate (updatedSong) {
        this.props.vm.updateSong(updatedSong);
    }

    handleSelectSong (songId) {
        this.props.vm.setActiveSong(songId);
    }

    handleNewSong () {
        this.props.vm.addSong(createBlankSong('Song'));
    }

    handleDuplicateSong (songId) {
        this.props.vm.duplicateSong(songId);
    }

    handleDeleteSong (songId) {
        this.props.vm.deleteSong(songId);
    }

    handleRenameSong (songId, name) {
        this.props.vm.renameSong(songId, name);
    }

    render () {
        const {vm} = this.props;
        const songs = vm.runtime.songs;
        const song = vm.runtime.song;

        return (
            <div className="song-tab-root">
                {song ? (
                    <React.Fragment>
                        <SongSelector
                            songs={songs}
                            activeSongId={song.songId}
                            onSelectSong={this.handleSelectSong}
                            onNewSong={this.handleNewSong}
                            onDuplicateSong={this.handleDuplicateSong}
                            onDeleteSong={this.handleDeleteSong}
                            onRenameSong={this.handleRenameSong}
                        />
                        <SongEditor
                            song={song}
                            vm={vm}
                            onChange={this.handleSongUpdate}
                        />
                    </React.Fragment>
                ) : (
                    <div className="song-editor-empty">{'Loading…'}</div>
                )}
            </div>
        );
    }
}

SongTab.propTypes = {
    vm: PropTypes.instanceOf(VM).isRequired
};

export default errorBoundaryHOC('Song Tab')(SongTab);
