import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from '@scratch/scratch-vm';
import {connect} from 'react-redux';

import MusicGenerationModalComponent from
    '../components/music-generation-modal/music-generation-modal.jsx';

import {closeMusicGeneration} from '../reducers/modals';
import {
    clearMusicGenerationError,
    clearLastResult,
    requestSoundSelection
} from '../reducers/music-generation';
import {activateTab, SOUNDS_TAB_INDEX} from '../reducers/editor-tab';
import {closeAlertWithId} from '../reducers/alerts';
import {startMusicGenerationFlow} from '../lib/lyria/start-music-generation';
import {
    isSupported as isVoiceSupported,
    listen as voiceListen
} from '../lib/voice-input.js';

class MusicGenerationModal extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleChangePrompt',
            'handleGenerate',
            'handleClose',
            'handleMicClick',
            'handleOpenSound'
        ]);
        this.state = {
            prompt: '',
            listening: false
        };
        this.voiceSession = null;
    }
    componentWillUnmount () {
        this.stopListening();
    }
    stopListening () {
        if (this.voiceSession) {
            this.voiceSession.stop();
            this.voiceSession = null;
        }
        if (this.state.listening) this.setState({listening: false});
    }
    handleChangePrompt (e) {
        if (this.props.errorMessage) this.props.onClearError();
        this.setState({prompt: e.target.value});
    }
    handleGenerate () {
        const {prompt} = this.state;
        if (!prompt.trim() || this.props.isGenerating) return;
        this.stopListening();
        startMusicGenerationFlow({
            prompt,
            vm: this.props.vm,
            dispatch: this.props.dispatch,
            isGenerating: this.props.isGenerating
        });
    }
    handleClose () {
        this.stopListening();
        this.props.onClearLastResult();
        this.props.onClose();
    }
    handleMicClick () {
        if (this.props.isGenerating) return;
        if (this.state.listening) {
            this.stopListening();
            return;
        }
        if (this.props.errorMessage) this.props.onClearError();
        this.setState({listening: true, prompt: ''});
        const session = voiceListen({
            onInterim: text => this.setState({prompt: text}),
            onEnd: () => {
                this.voiceSession = null;
                this.setState({listening: false});
            }
        });
        this.voiceSession = session;
        session.promise
            .then(transcript => this.setState({prompt: transcript}))
            .catch(() => {
                // Soft errors (no-speech, aborted): leave prompt as-is. onEnd
                // already cleared the listening flag.
            });
    }
    handleOpenSound () {
        const {lastResult} = this.props;
        if (!lastResult || !lastResult.targetId || !lastResult.soundName) return;
        const {targetId, soundName} = lastResult;
        if (this.props.vm.runtime.getTargetById(targetId)) {
            this.props.vm.setEditingTarget(targetId);
        }
        this.props.onRequestSoundSelection({targetId, soundName});
        this.props.onActivateSoundsTab();
        this.handleClose();
    }
    render () {
        return (
            <MusicGenerationModalComponent
                errorMessage={this.props.errorMessage}
                isGenerating={this.props.isGenerating}
                lastResult={this.props.lastResult}
                listening={this.state.listening}
                prompt={this.state.prompt}
                voiceSupported={isVoiceSupported()}
                onChangePrompt={this.handleChangePrompt}
                onClose={this.handleClose}
                onGenerate={this.handleGenerate}
                onMicClick={this.handleMicClick}
                onOpenSound={this.handleOpenSound}
            />
        );
    }
}

MusicGenerationModal.propTypes = {
    dispatch: PropTypes.func.isRequired,
    errorMessage: PropTypes.string,
    isGenerating: PropTypes.bool.isRequired,
    lastResult: PropTypes.shape({
        targetId: PropTypes.string,
        soundName: PropTypes.string
    }),
    onActivateSoundsTab: PropTypes.func.isRequired,
    onClearError: PropTypes.func.isRequired,
    onClearLastResult: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    onRequestSoundSelection: PropTypes.func.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm,
    isGenerating: state.scratchGui.musicGeneration.isGenerating,
    errorMessage: (state.scratchGui.musicGeneration.error &&
        state.scratchGui.musicGeneration.error.message) || null,
    lastResult: state.scratchGui.musicGeneration.lastResult
});

const mapDispatchToProps = dispatch => ({
    dispatch,
    onClose: () => dispatch(closeMusicGeneration()),
    onClearError: () => dispatch(clearMusicGenerationError()),
    onClearLastResult: () => dispatch(clearLastResult()),
    onActivateSoundsTab: () => {
        dispatch(activateTab(SOUNDS_TAB_INDEX));
        dispatch(closeAlertWithId('aiMusicComplete'));
    },
    onRequestSoundSelection: ({targetId, soundName}) => {
        dispatch(requestSoundSelection({targetId, soundName}));
    }
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(MusicGenerationModal);
