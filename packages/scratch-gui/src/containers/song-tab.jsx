import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import VM from '@scratch/scratch-vm';

import SongEditor from '../components/song-editor/song-editor.jsx';
import '../components/song-editor/song-editor.raw.css';
import errorBoundaryHOC from '../lib/error-boundary-hoc.jsx';
import {createBlankSong} from '../lib/song-defaults.js';

class SongTab extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleSongUpdate']);
    }

    componentDidMount () {
        // Single project-wide song. Re-render whenever it mutates so the editor
        // (which reads from runtime.song) stays in sync. Bootstrap a blank
        // song on an empty project so the editor always has something to render.
        this._onSongsChanged = () => this.forceUpdate();
        this.props.vm.runtime.on('SONGS_CHANGED', this._onSongsChanged);
        if (!this.props.vm.runtime.song) {
            this.props.vm.setSong(createBlankSong('Song'));
        }
    }

    componentWillUnmount () {
        if (this._onSongsChanged) {
            this.props.vm.runtime.removeListener('SONGS_CHANGED', this._onSongsChanged);
        }
    }

    handleSongUpdate (updatedSong) {
        this.props.vm.updateSong(updatedSong);
    }

    render () {
        const {vm} = this.props;
        const song = vm.runtime.song;

        return (
            <div className="song-tab-root">
                {song ? (
                    <SongEditor
                        song={song}
                        vm={vm}
                        onChange={this.handleSongUpdate}
                    />
                ) : (
                    <div className="song-editor-empty">Loading…</div>
                )}
            </div>
        );
    }
}

SongTab.propTypes = {
    vm: PropTypes.instanceOf(VM).isRequired
};

export default errorBoundaryHOC('Song Tab')(SongTab);
