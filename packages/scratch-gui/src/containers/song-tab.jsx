import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import {defineMessages, injectIntl} from 'react-intl';
import intlShape from '../lib/intlShape.js';
import VM from '@scratch/scratch-vm';
import {connect} from 'react-redux';

import AssetPanel from '../components/asset-panel/asset-panel.jsx';
import songIcon from '../components/asset-panel/icon--song.svg';
import addSongIcon from '../components/asset-panel/icon--add-song.svg';
import aiSongIcon from '../components/asset-panel/icon--ai-song.svg';
import surpriseIcon from '../components/action-menu/icon--surprise.svg';

import SongEditor from '../components/song-editor/song-editor.jsx';
import '../components/song-editor/song-editor.raw.css';
import AiSongModal from '../components/song-editor/ai-song-modal.jsx';
import errorBoundaryHOC from '../lib/error-boundary-hoc.jsx';
import {createBlankSong, createBlankTrack} from '../lib/song-defaults.js';
import {generateSongFromPrompt, SongAiError} from '../lib/song-ai.js';

class SongTab extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleSelectSong',
            'handleDeleteSong',
            'handleDuplicateSong',
            'handleNewSong',
            'handleSurpriseSong',
            'handleSongUpdate',
            'handleRename',
            'handleOpenAiModal',
            'handleCloseAiModal',
            'handleGenerateAiSong'
        ]);
        this.state = {
            selectedSongIndex: 0,
            aiModalOpen: false,
            aiBusy: false,
            aiError: null
        };
    }

    componentWillReceiveProps (nextProps) {
        const {editingTarget, sprites, stage} = nextProps;
        const target = editingTarget && sprites[editingTarget] ? sprites[editingTarget] : stage;
        if (!target) return;
        const songs = target.songs || [];
        if (this.props.editingTarget !== editingTarget) {
            this.setState({selectedSongIndex: 0});
        } else if (this.state.selectedSongIndex > songs.length - 1) {
            this.setState({selectedSongIndex: Math.max(songs.length - 1, 0)});
        }
    }

    _currentSongs () {
        const {vm} = this.props;
        if (!vm.editingTarget) return [];
        const songs = vm.editingTarget.sprite.songs;
        return Array.isArray(songs) ? songs : [];
    }

    _uniqueName (base) {
        const used = new Set(this._currentSongs().map(s => s.name));
        if (!used.has(base)) return base;
        let i = 2;
        while (used.has(`${base}${i}`)) i++;
        return `${base}${i}`;
    }

    handleSelectSong (idx) {
        this.setState({selectedSongIndex: idx});
    }

    handleNewSong () {
        const song = createBlankSong(this._uniqueName('Song'));
        this.props.vm.addSong(song);
        // Select the newly added song.
        // Optimistically advance selection; we re-sync below after the redux update.
        this.setState({selectedSongIndex: this._currentSongs().length});
        // Force selection update after redux change:
        setTimeout(() => {
            const songs = this._currentSongs();
            this.setState({selectedSongIndex: Math.max(0, songs.length - 1)});
        }, 0);
    }

    handleSurpriseSong () {
        const song = createBlankSong(this._uniqueName('Beat'));
        song.tempo = 90 + Math.floor(Math.random() * 60);
        // Add a drum track too
        song.tracks.push(createBlankTrack('drum'));
        song.tracks[1].drum = 2; // bass drum
        // Sprinkle a simple pattern
        const instTrack = song.tracks[0];
        for (let s = 0; s < song.lengthSteps; s += 4) {
            instTrack.notes.push({step: s, durationSteps: 2, pitch: 60 + ((s / 4) % 8)});
        }
        const drumTrack = song.tracks[1];
        for (let s = 0; s < song.lengthSteps; s += 8) {
            drumTrack.notes.push({step: s, durationSteps: 1});
        }
        this.props.vm.addSong(song);
        setTimeout(() => {
            const songs = this._currentSongs();
            this.setState({selectedSongIndex: Math.max(0, songs.length - 1)});
        }, 0);
    }

    handleOpenAiModal () {
        this.setState({aiModalOpen: true, aiError: null});
    }

    handleCloseAiModal () {
        if (this.state.aiBusy) return;
        this.setState({aiModalOpen: false, aiError: null});
    }

    async handleGenerateAiSong (prompt) {
        this.setState({aiBusy: true, aiError: null});
        try {
            const fallbackName = this._uniqueName('AI Song');
            const generated = await generateSongFromPrompt({prompt, fallbackName});
            generated.name = this._uniqueName(generated.name || fallbackName);
            this.props.vm.addSong(generated);
            this.setState({aiBusy: false, aiModalOpen: false, aiError: null});
            setTimeout(() => {
                const songs = this._currentSongs();
                this.setState({selectedSongIndex: Math.max(0, songs.length - 1)});
            }, 0);
        } catch (err) {
            const message = err instanceof SongAiError ?
                err.message :
                (err && err.message) || 'Something went wrong generating the song.';
            this.setState({aiBusy: false, aiError: message});
        }
    }

    handleDeleteSong (idx) {
        this.props.vm.deleteSong(idx);
        if (idx <= this.state.selectedSongIndex) {
            this.setState({selectedSongIndex: Math.max(0, this.state.selectedSongIndex - 1)});
        }
    }

    handleDuplicateSong (idx) {
        this.props.vm.duplicateSong(idx);
        setTimeout(() => {
            this.setState({selectedSongIndex: idx + 1});
        }, 0);
    }

    handleSongUpdate (updatedSong) {
        this.props.vm.updateSong(this.state.selectedSongIndex, updatedSong);
    }

    handleRename (newName) {
        this.props.vm.renameSong(this.state.selectedSongIndex, newName);
    }

    render () {
        const {ariaLabel, ariaRole, intl, vm} = this.props;
        if (!vm.editingTarget) return null;

        const songs = this._currentSongs();
        const items = songs.map(song => ({
            url: songIcon,
            name: song.name,
            details: `${song.tempo || 120} BPM`,
            dragPayload: song
        }));

        const messages = defineMessages({
            addSong: {
                defaultMessage: 'Add Song',
                description: 'Button to add a new song in the Song Maker tab',
                id: 'gui.songTab.addSong'
            },
            surpriseSong: {
                defaultMessage: 'Surprise',
                description: 'Button to add a random song',
                id: 'gui.songTab.surpriseSong'
            },
            aiSong: {
                defaultMessage: 'AI',
                description: 'Button to generate a song from a text prompt with AI',
                id: 'gui.songTab.aiSong'
            }
        });

        const selectedSong = songs[this.state.selectedSongIndex] || null;

        return (
            <React.Fragment>
                <AssetPanel
                    ariaLabel={ariaLabel}
                    ariaRole={ariaRole}
                    buttons={[{
                        title: intl.formatMessage(messages.addSong),
                        img: addSongIcon,
                        onClick: this.handleNewSong
                    }, {
                        title: intl.formatMessage(messages.aiSong),
                        img: aiSongIcon,
                        onClick: this.handleOpenAiModal
                    }, {
                        title: intl.formatMessage(messages.surpriseSong),
                        img: surpriseIcon,
                        onClick: this.handleSurpriseSong
                    }]}
                    items={items}
                    selectedItemIndex={this.state.selectedSongIndex}
                    onDeleteClick={this.handleDeleteSong}
                    onDuplicateClick={this.handleDuplicateSong}
                    onItemClick={this.handleSelectSong}
                >
                    {selectedSong ? (
                        <SongEditor
                            song={selectedSong}
                            vm={vm}
                            onChange={this.handleSongUpdate}
                            onRename={this.handleRename}
                        />
                    ) : (
                        <div className="song-editor-empty">
                            Click <strong>Add Song</strong> in the left column to start composing.
                        </div>
                    )}
                </AssetPanel>
                {this.state.aiModalOpen ? (
                    <AiSongModal
                        busy={this.state.aiBusy}
                        error={this.state.aiError}
                        onCancel={this.handleCloseAiModal}
                        onGenerate={this.handleGenerateAiSong}
                    />
                ) : null}
            </React.Fragment>
        );
    }
}

SongTab.propTypes = {
    ariaLabel: PropTypes.string,
    ariaRole: PropTypes.string,
    editingTarget: PropTypes.string,
    intl: intlShape,
    sprites: PropTypes.object,
    stage: PropTypes.object,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => ({
    editingTarget: state.scratchGui.targets.editingTarget,
    sprites: state.scratchGui.targets.sprites,
    stage: state.scratchGui.targets.stage
});

export default errorBoundaryHOC('Song Tab')(
    injectIntl(connect(mapStateToProps)(SongTab))
);
