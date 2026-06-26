import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl} from 'react-intl';
import VM from '@scratch/scratch-vm';

import intlShape from '../lib/intlShape.js';
import LibraryComponent from '../components/library/library.jsx';
import libraryIcon from '../components/song-editor/song-track-library-icon.svg';

import songTrackLibraryContent from '../lib/libraries/song-tracks.json';
import songTrackTags from '../lib/libraries/song-track-tags.js';
import {previewSongForItem} from '../lib/song-library/import.js';

const messages = defineMessages({
    trackLibraryTitle: {
        defaultMessage: 'Add a Track',
        description: 'Heading for the song-maker track library',
        id: 'gui.songLibrary.addATrack'
    },
    sectionLibraryTitle: {
        defaultMessage: 'Start from a Section',
        description: 'Heading for the song-maker section (whole-song) library',
        id: 'gui.songLibrary.startFromASection'
    }
});

const SCALE_LABELS = {
    major: 'Major',
    minor: 'Minor',
    pentatonicMajor: 'Penta. Major',
    pentatonicMinor: 'Penta. Minor',
    chromatic: 'Chromatic'
};
const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const keyLabel = item => {
    if (typeof item.rootPitch !== 'number') return '';
    const pc = PITCH_CLASS_NAMES[((item.rootPitch % 12) + 12) % 12];
    return `${pc} ${SCALE_LABELS[item.scaleType] || ''}`.trim();
};

// One-line card subtitle: what the item is + its musical context.
const describeItem = item => {
    const bars = Math.max(1, Math.round((item.lengthSteps || 32) / ((item.stepsPerBeat || 4) * 4)));
    if (item.itemType === 'song') {
        return `${item.trackCount || 0} tracks · ${keyLabel(item)} · ${item.tempo} BPM · ${bars} bars`;
    }
    return `${item.instrumentName || ''} · ${keyLabel(item)} · ${item.tempo} BPM · ${bars} bars`;
};

/**
 * Browses the bundled song-track/section library and previews items by playing
 * them through the shared transport (vm.previewSong) on hover. Selecting a
 * 'track' item layers it onto the current song; selecting a 'song' item starts
 * a new arrangement from it. Mutation of the actual song happens in the parent
 * (SongEditor) so it flows through the editor's undo/redo.
 */
class SongLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelected',
            'handleItemMouseEnter',
            'handleItemMouseLeave'
        ]);
    }
    componentWillUnmount () {
        this.props.vm.stopSongPreview();
    }
    handleItemMouseEnter (item) {
        try {
            this.props.vm.previewSong(previewSongForItem(item), {startStep: item.previewStartStep || 0});
        } catch (e) {
            // A malformed library item shouldn't break browsing.
        }
    }
    handleItemMouseLeave () {
        this.props.vm.stopSongPreview();
    }
    handleItemSelected (item) {
        this.props.vm.stopSongPreview();
        if (item.itemType === 'song') {
            this.props.onReplaceSong(item);
        } else {
            this.props.onAddTrack(item);
        }
    }
    render () {
        const wantSongs = this.props.itemType === 'song';
        const data = songTrackLibraryContent
            .filter(item => (item.itemType === 'song') === wantSongs)
            .map(item => ({
                ...item,
                rawURL: libraryIcon,
                description: describeItem(item)
            }));
        const title = this.props.intl.formatMessage(
            wantSongs ? messages.sectionLibraryTitle : messages.trackLibraryTitle
        );
        return (
            <LibraryComponent
                showPlayButton
                data={data}
                id="songLibrary"
                tags={songTrackTags}
                title={title}
                onItemMouseEnter={this.handleItemMouseEnter}
                onItemMouseLeave={this.handleItemMouseLeave}
                onItemSelected={this.handleItemSelected}
                onRequestClose={this.props.onRequestClose}
            />
        );
    }
}

SongLibrary.propTypes = {
    intl: intlShape.isRequired,
    itemType: PropTypes.oneOf(['track', 'song']).isRequired,
    onAddTrack: PropTypes.func.isRequired,
    onReplaceSong: PropTypes.func.isRequired,
    onRequestClose: PropTypes.func,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default injectIntl(SongLibrary);
