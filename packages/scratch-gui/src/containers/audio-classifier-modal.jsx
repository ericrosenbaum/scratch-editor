import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from '@scratch/scratch-vm';
import {connect} from 'react-redux';

import * as speechCommands from '@tensorflow-models/speech-commands';

import AudioClassifierModalComponent from '../components/audio-classifier-modal/audio-classifier-modal.jsx';
import {closeAudioClassifierModal} from '../reducers/modals';

class AudioClassifierModal extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleRecordExample',
            'handleAddClass',
            'handleRemoveClass',
            'handleRenameClass',
            'handleTrain',
            'handleClose'
        ]);
        const ext = this.getExtension();
        this.state = {
            classes: ext ? ext._classes.slice() : ['Class 1', 'Class 2'],
            exampleCounts: ext ? ext.getExampleCounts() : {},
            isRecording: false,
            recordingClass: null,
            isTraining: false,
            isTrained: ext ? ext._trained : false,
            statusText: ext && ext._trained ? 'Ready' : ''
        };
    }

    getExtension () {
        return this.props.vm.runtime.ext_audioClassification || null;
    }

    async handleRecordExample (classIndex) {
        const ext = this.getExtension();
        if (!ext) return;

        const className = this.state.classes[classIndex];
        this.setState({isRecording: true, recordingClass: classIndex});

        try {
            await ext.ensureModel(speechCommands);
            await ext.collectExample(className);
            // Sync class list to extension
            ext._classes = this.state.classes.slice();
            this.setState({
                exampleCounts: ext.getExampleCounts(),
                isRecording: false,
                recordingClass: null
            });
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Failed to record example:', e);
            this.setState({
                isRecording: false,
                recordingClass: null,
                statusText: 'Recording failed'
            });
        }
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

        this.setState({isTraining: true, statusText: 'Training...'});
        try {
            await ext.train(progress => {
                const pct = Math.round(progress * 100);
                this.setState({statusText: `Training... ${pct}%`});
            });
            this.setState({
                isTraining: false,
                isTrained: true,
                statusText: 'Ready'
            });
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Training failed:', e);
            this.setState({
                isTraining: false,
                statusText: 'Training failed'
            });
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
                classes={this.state.classes}
                exampleCounts={this.state.exampleCounts}
                isRecording={this.state.isRecording}
                isTraining={this.state.isTraining}
                isTrained={this.state.isTrained}
                recordingClass={this.state.recordingClass}
                statusText={this.state.statusText}
                onAddClass={this.handleAddClass}
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
