import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from '@scratch/scratch-vm';
import {connect} from 'react-redux';

import MusicGenerationModalComponent from
    '../components/music-generation-modal/music-generation-modal.jsx';

import {closeMusicGeneration} from '../reducers/modals';
import {clearMusicGenerationError} from '../reducers/music-generation';
import {startMusicGenerationFlow} from '../lib/lyria/start-music-generation';

class MusicGenerationModal extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleChangePrompt',
            'handleGenerate',
            'handleClose'
        ]);
        this.state = {prompt: ''};
    }
    handleChangePrompt (e) {
        if (this.props.errorMessage) this.props.onClearError();
        this.setState({prompt: e.target.value});
    }
    handleGenerate () {
        const {prompt} = this.state;
        if (!prompt.trim() || this.props.isGenerating) return;
        startMusicGenerationFlow({
            prompt,
            vm: this.props.vm,
            dispatch: this.props.dispatch,
            isGenerating: this.props.isGenerating
        });
    }
    handleClose () {
        this.props.onClose();
    }
    render () {
        return (
            <MusicGenerationModalComponent
                errorMessage={this.props.errorMessage}
                isGenerating={this.props.isGenerating}
                prompt={this.state.prompt}
                onChangePrompt={this.handleChangePrompt}
                onClose={this.handleClose}
                onGenerate={this.handleGenerate}
            />
        );
    }
}

MusicGenerationModal.propTypes = {
    dispatch: PropTypes.func.isRequired,
    errorMessage: PropTypes.string,
    isGenerating: PropTypes.bool.isRequired,
    onClearError: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm,
    isGenerating: state.scratchGui.musicGeneration.isGenerating,
    errorMessage: (state.scratchGui.musicGeneration.error &&
        state.scratchGui.musicGeneration.error.message) || null
});

const mapDispatchToProps = dispatch => ({
    dispatch,
    onClose: () => dispatch(closeMusicGeneration()),
    onClearError: () => dispatch(clearMusicGenerationError())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(MusicGenerationModal);
