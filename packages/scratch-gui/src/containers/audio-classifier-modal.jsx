import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from '@scratch/scratch-vm';
import {connect} from 'react-redux';

import '@tensorflow/tfjs';
import * as speechCommands from '@tensorflow-models/speech-commands';

import AudioClassifierModalComponent from '../components/audio-classifier-modal/audio-classifier-modal.jsx';
import {closeAudioClassifierModal} from '../reducers/modals';

const BACKGROUND_CLASS = '_background_noise_';
const EXAMPLES_PER_RECORD = 8;

class AudioClassifierModal extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleRecordExample',
            'handleRecordBackground',
            'handleClearExamples',
            'handleClearBackground',
            'handleAddClass',
            'handleRemoveClass',
            'handleRenameClass',
            'handleTrain',
            'handleClose'
        ]);
        const ext = this.getExtension();
        this.state = {
            classes: ext ? ext._classes.slice() : ['Class 1'],
            exampleCounts: ext ? ext.getExampleCounts() : {},
            isRecording: false,
            recordingClass: null,
            recordingProgress: null,
            isRecordingBackground: false,
            backgroundRecordingProgress: null,
            isTraining: false,
            isTrained: ext ? ext._trained : false,
            statusText: ext && ext._trained ? 'Listening' : '',
            audioLevel: 0
        };
        this._analyserNode = null;
        this._audioLevelRaf = null;
    }

    componentDidMount () {
        this._startAudioLevelMeter();
        // Try loading a saved model
        this._tryLoadModel();
    }

    componentWillUnmount () {
        this._stopAudioLevelMeter();
    }

    getExtension () {
        return this.props.vm.runtime.ext_audioClassification || null;
    }

    async _tryLoadModel () {
        const ext = this.getExtension();
        if (!ext || ext._trained) return;
        try {
            const loaded = await ext.loadModel(speechCommands);
            if (loaded) {
                this.setState({
                    classes: ext._classes.slice(),
                    isTrained: true,
                    statusText: 'Loaded saved model'
                });
            }
        } catch (e) {
            // No saved model — this is fine
        }
    }

    _startAudioLevelMeter () {
        navigator.mediaDevices.getUserMedia({audio: true}).then(stream => {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioCtx.createMediaStreamSource(stream);
            this._analyserNode = audioCtx.createAnalyser();
            this._analyserNode.fftSize = 256;
            source.connect(this._analyserNode);
            this._audioContext = audioCtx;
            this._micStream = stream;
            this._pollAudioLevel();
        }).catch(() => {
            // Mic not available — level meter just won't show
        });
    }

    _pollAudioLevel () {
        if (!this._analyserNode) return;
        const data = new Uint8Array(this._analyserNode.frequencyBinCount);
        this._analyserNode.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i];
        }
        const avg = sum / data.length;
        // Scale 0-255 to 0-100
        const level = Math.min(100, Math.round((avg / 255) * 200));
        this.setState({audioLevel: level});
        this._audioLevelRaf = requestAnimationFrame(() => this._pollAudioLevel());
    }

    _stopAudioLevelMeter () {
        if (this._audioLevelRaf) {
            cancelAnimationFrame(this._audioLevelRaf);
            this._audioLevelRaf = null;
        }
        if (this._audioContext) {
            this._audioContext.close();
            this._audioContext = null;
        }
        if (this._micStream) {
            this._micStream.getTracks().forEach(t => t.stop());
            this._micStream = null;
        }
        this._analyserNode = null;
    }

    async handleRecordBackground () {
        const ext = this.getExtension();
        if (!ext) return;

        this.setState({isRecordingBackground: true, backgroundRecordingProgress: null});

        try {
            await ext.ensureModel(speechCommands);
            for (let i = 0; i < EXAMPLES_PER_RECORD; i++) {
                this.setState({backgroundRecordingProgress: `${i + 1} of ${EXAMPLES_PER_RECORD}`});
                await ext.collectExample(BACKGROUND_CLASS);
            }
            this.setState({
                exampleCounts: ext.getExampleCounts(),
                isRecordingBackground: false,
                backgroundRecordingProgress: null
            });
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Failed to record background:', e);
            this.setState({
                isRecordingBackground: false,
                backgroundRecordingProgress: null,
                statusText: 'Recording failed'
            });
        }
    }

    async handleRecordExample (classIndex) {
        const ext = this.getExtension();
        if (!ext) return;

        const className = this.state.classes[classIndex];
        this.setState({isRecording: true, recordingClass: classIndex, recordingProgress: null});

        try {
            await ext.ensureModel(speechCommands);
            for (let i = 0; i < EXAMPLES_PER_RECORD; i++) {
                this.setState({recordingProgress: `${i + 1} of ${EXAMPLES_PER_RECORD}`});
                await ext.collectExample(className);
            }
            ext._classes = this.state.classes.slice();
            this.setState({
                exampleCounts: ext.getExampleCounts(),
                isRecording: false,
                recordingClass: null,
                recordingProgress: null
            });
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Failed to record example:', e);
            this.setState({
                isRecording: false,
                recordingClass: null,
                recordingProgress: null,
                statusText: 'Recording failed'
            });
        }
    }

    handleClearExamples (classIndex) {
        const ext = this.getExtension();
        if (!ext) return;
        const className = this.state.classes[classIndex];
        ext.clearExamples(className);
        this.setState({
            exampleCounts: ext.getExampleCounts(),
            isTrained: false,
            statusText: ''
        });
    }

    handleClearBackground () {
        const ext = this.getExtension();
        if (!ext) return;
        ext.clearExamples(BACKGROUND_CLASS);
        this.setState({
            exampleCounts: ext.getExampleCounts(),
            isTrained: false,
            statusText: ''
        });
    }

    handleAddClass () {
        const newClasses = this.state.classes.slice();
        const newName = `Class ${newClasses.length + 1}`;
        newClasses.push(newName);
        const ext = this.getExtension();
        if (ext) {
            ext.addClass(newName);
        }
        this.setState({classes: newClasses});
    }

    handleRemoveClass (classIndex) {
        const className = this.state.classes[classIndex];
        const newClasses = this.state.classes.slice();
        newClasses.splice(classIndex, 1);
        const ext = this.getExtension();
        if (ext) {
            ext.removeClass(className);
        }
        this.setState({
            classes: newClasses,
            exampleCounts: ext ? ext.getExampleCounts() : {},
            isTrained: false,
            statusText: ''
        });
    }

    handleRenameClass (classIndex, newName) {
        const oldName = this.state.classes[classIndex];
        const newClasses = this.state.classes.slice();
        newClasses[classIndex] = newName;
        const ext = this.getExtension();
        if (ext) {
            ext.renameClass(oldName, newName);
        }
        this.setState({classes: newClasses});
    }

    async handleTrain () {
        const ext = this.getExtension();
        if (!ext) return;

        // Sync classes to extension
        ext._classes = this.state.classes.slice();

        this.setState({isTraining: true, statusText: ''});
        // Yield a frame so React can render the spinner before training blocks the thread
        await new Promise(resolve => requestAnimationFrame(resolve));
        try {
            let finalAccuracy = null;
            await ext.train(({progress, accuracy, valAccuracy}) => {
                const pct = Math.round(progress * 100);
                const acc = valAccuracy != null ? valAccuracy : accuracy;
                if (acc != null) {
                    finalAccuracy = Math.round(acc * 100);
                    this.setState({statusText: `Training... ${pct}% (${finalAccuracy}% accuracy)`});
                } else {
                    this.setState({statusText: `Training... ${pct}%`});
                }
            });
            const suffix = finalAccuracy != null ? ` \u2014 ${finalAccuracy}% accuracy` : '';
            this.setState({
                isTraining: false,
                isTrained: true,
                statusText: `Listening${suffix}`
            });
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Training failed:', e);
            this.setState({
                isTraining: false,
                statusText: 'Training failed'
            });
            return;
        }
        // Auto-save the trained model (fire-and-forget, don't block on failure)
        try {
            ext.saveModel();
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Failed to save model:', e);
        }
    }

    handleClose () {
        // Sync final class state to extension before closing
        const ext = this.getExtension();
        if (ext) {
            ext._classes = this.state.classes.slice();
        }
        this.props.onClose();
    }

    render () {
        return (
            <AudioClassifierModalComponent
                audioLevel={this.state.audioLevel}
                backgroundExampleCount={this.state.exampleCounts[BACKGROUND_CLASS] || 0}
                backgroundRecordingProgress={this.state.backgroundRecordingProgress}
                classes={this.state.classes}
                exampleCounts={this.state.exampleCounts}
                isRecording={this.state.isRecording}
                isRecordingBackground={this.state.isRecordingBackground}
                isTraining={this.state.isTraining}
                isTrained={this.state.isTrained}
                recordingClass={this.state.recordingClass}
                recordingProgress={this.state.recordingProgress}
                statusText={this.state.statusText}
                onAddClass={this.handleAddClass}
                onClearBackground={this.handleClearBackground}
                onClearExamples={this.handleClearExamples}
                onRecordBackground={this.handleRecordBackground}
                onRecordExample={this.handleRecordExample}
                onRemoveClass={this.handleRemoveClass}
                onRenameClass={this.handleRenameClass}
                onRequestClose={this.handleClose}
                onTrain={this.handleTrain}
            />
        );
    }
}

AudioClassifierModal.propTypes = {
    onClose: PropTypes.func.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = () => ({});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeAudioClassifierModal())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(AudioClassifierModal);
