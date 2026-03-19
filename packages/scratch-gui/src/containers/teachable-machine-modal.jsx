import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';
import VM from '@scratch/scratch-vm';

import TeachableMachineModalComponent from '../components/teachable-machine-modal/teachable-machine-modal.jsx';
import ModalVideoManager from '../lib/video/modal-video-manager.js';
import {closeTeachableMachineModal} from '../reducers/modals';

const MIN_EXAMPLES = 5;
const BURST_COUNT = 10;
const BURST_INTERVAL_MS = 200;
const COUNTDOWN_SECONDS = 3;

class TeachableMachineModal extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleCancel',
            'setCanvas',
            'handleWizardNext',
            'handleWizardBack',
            'handleChangeSecondLabelName',
            'handleRenameFirstLabel',
            'handleRenameSecondLabel',
            'handleTakePhoto',
            'handleCaptureBurst',
            'handleFlashEnd',
            'handleSwitchToDashboard',
            'handleExpandCapture',
            'handleExpandEdit',
            'handleCollapseCard',
            'handleRenameLabel',
            'handleDeleteLabel',
            'handleDeleteExample',
            'handleAddLabel',
            'handleClearAll'
        ]);

        const ext = props.vm.runtime.ext_teachableClassifier;
        const imageData = ext ? {...ext._imageData} : {};
        const classifierData = ext ? {...ext._classifierData} : {};

        const labels = Object.keys(classifierData);
        const shouldShowWizard = this._shouldShowWizard(classifierData);

        this.state = {
            mode: shouldShowWizard ? 'wizard' : 'dashboard',
            wizardStep: shouldShowWizard ? this._getInitialWizardStep(classifierData) : 1,
            firstLabelName: labels[0] || 'Background',
            secondLabelName: labels[1] || 'Hand',
            imageData: imageData,
            classifierData: classifierData,
            expandedLabel: null,
            editingLabel: null,
            cameraReady: false,
            cameraPermissionGranted: false,
            isCapturing: false,
            showFlash: false,
            countdownValue: null,
            activeCaptureLabelName: null
        };

        this.videoDevice = null;
        this._burstTimer = null;
        this._countdownTimer = null;
    }

    componentWillUnmount () {
        if (this.videoDevice) {
            this.videoDevice.disableVideo();
        }
        if (this._burstTimer) clearTimeout(this._burstTimer);
        if (this._countdownTimer) clearInterval(this._countdownTimer);
    }

    _shouldShowWizard (classifierData) {
        const labels = Object.keys(classifierData || this.state.classifierData);
        if (labels.length < 2) return true;
        const readyCount = labels.filter(l =>
            (classifierData || this.state.classifierData)[l].length >= MIN_EXAMPLES
        ).length;
        return readyCount < 2;
    }

    _getInitialWizardStep (classifierData) {
        const labels = Object.keys(classifierData);
        if (labels.length === 0) return 1;
        if (labels.length === 1) {
            const count = (classifierData[labels[0]] || []).length;
            if (count < MIN_EXAMPLES) return 2;
            return 3;
        }
        return 5;
    }

    _syncFromExtension () {
        const ext = this.props.vm.runtime.ext_teachableClassifier;
        if (ext) {
            this.setState({
                imageData: {...ext._imageData},
                classifierData: {...ext._classifierData}
            });
        }
    }

    _getCurrentCaptureLabel () {
        if (this.state.mode === 'wizard') {
            if (this.state.wizardStep === 2) return this.state.firstLabelName;
            if (this.state.wizardStep === 4) return this.state.secondLabelName;
        }
        return this.state.expandedLabel;
    }

    setCanvas (canvas) {
        if (canvas && !this.videoDevice) {
            this.videoDevice = new ModalVideoManager(canvas);
            this.videoDevice.enableVideo(
                () => this.setState({cameraPermissionGranted: true}),
                () => this.setState({cameraReady: true})
            );
        } else if (canvas && this.videoDevice) {
            // Re-attach to a new canvas
            this.videoDevice._canvas = canvas;
        }
    }

    handleCancel () {
        this.props.onCloseTeachableMachineModal();
    }

    handleWizardNext () {
        const {wizardStep} = this.state;
        if (wizardStep === 5) {
            this.handleCancel();
            return;
        }
        this.setState({wizardStep: wizardStep + 1});
    }

    handleWizardBack () {
        const {wizardStep} = this.state;
        if (wizardStep > 1) {
            this.setState({wizardStep: wizardStep - 1});
        }
    }

    handleChangeSecondLabelName (e) {
        this.setState({secondLabelName: e.target.value});
    }

    handleRenameFirstLabel (e) {
        const newName = e.target.value.trim();
        if (newName && newName !== this.state.firstLabelName) {
            const oldName = this.state.firstLabelName;
            // If the label already exists in data, rename it
            if (oldName in this.state.classifierData) {
                this.props.vm.runtime.emit('RENAME_LABEL', oldName, newName);
                this._syncFromExtension();
            }
            this.setState({firstLabelName: newName});
        }
    }

    handleRenameSecondLabel (e) {
        const newName = e.target.value.trim();
        if (newName && newName !== this.state.secondLabelName) {
            const oldName = this.state.secondLabelName;
            if (oldName in this.state.classifierData) {
                this.props.vm.runtime.emit('RENAME_LABEL', oldName, newName);
                this._syncFromExtension();
            }
            this.setState({secondLabelName: newName});
        }
    }

    handleTakePhoto () {
        if (!this.videoDevice || !this.state.cameraReady) return;
        const label = this._getCurrentCaptureLabel();
        if (!label) return;

        this.setState({showFlash: true});
        const frame = this.videoDevice._videoProvider.getFrame({
            format: 'image-data'
        });
        if (frame) {
            this.props.vm.runtime.emit('NEW_EXAMPLES', [frame], label);
            this._syncFromExtension();
        }
    }

    handleCaptureBurst () {
        if (!this.videoDevice || !this.state.cameraReady) return;
        const label = this._getCurrentCaptureLabel();
        if (!label) return;

        this.setState({
            isCapturing: true,
            countdownValue: COUNTDOWN_SECONDS
        });

        let count = COUNTDOWN_SECONDS;
        this._countdownTimer = setInterval(() => {
            count -= 1;
            if (count > 0) {
                this.setState({countdownValue: count});
            } else {
                clearInterval(this._countdownTimer);
                this._countdownTimer = null;
                this.setState({countdownValue: null});
                this._takeBurstFrames(BURST_COUNT, label);
            }
        }, 1000);
    }

    _takeBurstFrames (remaining, label) {
        if (remaining <= 0 || !this.videoDevice) {
            this.setState({isCapturing: false});
            return;
        }
        this.setState({showFlash: true});
        const frame = this.videoDevice._videoProvider.getFrame({
            format: 'image-data'
        });
        if (frame) {
            this.props.vm.runtime.emit('NEW_EXAMPLES', [frame], label);
            this._syncFromExtension();
        }
        this._burstTimer = setTimeout(() => {
            this._takeBurstFrames(remaining - 1, label);
        }, BURST_INTERVAL_MS);
    }

    handleFlashEnd () {
        this.setState({showFlash: false});
    }

    handleSwitchToDashboard () {
        this._syncFromExtension();
        this.setState({mode: 'dashboard'});
    }

    handleExpandCapture (labelName) {
        this.setState({
            expandedLabel: labelName,
            editingLabel: null
        });
    }

    handleExpandEdit (labelName) {
        this.setState({
            editingLabel: labelName,
            expandedLabel: null
        });
    }

    handleCollapseCard () {
        this._syncFromExtension();
        this.setState({
            expandedLabel: null,
            editingLabel: null
        });
    }

    handleRenameLabel (oldName, newName) {
        this.props.vm.runtime.emit('RENAME_LABEL', oldName, newName);
        this._syncFromExtension();
        // Update wizard label names if they match
        if (this.state.firstLabelName === oldName) {
            this.setState({firstLabelName: newName});
        }
        if (this.state.secondLabelName === oldName) {
            this.setState({secondLabelName: newName});
        }
        if (this.state.editingLabel === oldName) {
            this.setState({editingLabel: newName});
        }
        if (this.state.expandedLabel === oldName) {
            this.setState({expandedLabel: newName});
        }
    }

    handleDeleteLabel (labelName) {
        this.props.vm.runtime.emit('DELETE_LABEL', labelName);
        this._syncFromExtension();
        this.setState({
            editingLabel: null,
            expandedLabel: null
        });
        // Check if we should switch back to wizard
        const ext = this.props.vm.runtime.ext_teachableClassifier;
        if (ext && this._shouldShowWizard(ext._classifierData)) {
            this.setState({
                mode: 'wizard',
                wizardStep: this._getInitialWizardStep(ext._classifierData)
            });
        }
    }

    handleDeleteExample (labelName, idx) {
        this.props.vm.runtime.emit('DELETE_EXAMPLE', labelName, idx);
        this._syncFromExtension();
    }

    handleAddLabel (name) {
        // Initialize the label in the extension's data structures
        const ext = this.props.vm.runtime.ext_teachableClassifier;
        if (ext) {
            if (!ext._classifierData[name]) {
                ext._classifierData[name] = [];
                ext._imageData[name] = [];
            }
            if (ext.labelListEmpty) {
                ext.labelList.splice(ext.labelList.indexOf(''), 1);
                ext.labelListEmpty = false;
            }
            if (!ext.labelList.includes(name)) {
                ext.labelList.push(name);
            }
        }
        this._syncFromExtension();
        // Expand the new label for capture
        this.setState({
            expandedLabel: name,
            editingLabel: null
        });
    }

    handleClearAll () {
        this.props.vm.runtime.emit('CLEAR_ALL_LABELS');
        this._syncFromExtension();
        this.setState({
            mode: 'wizard',
            wizardStep: 1,
            firstLabelName: 'Background',
            secondLabelName: 'Hand',
            expandedLabel: null,
            editingLabel: null
        });
    }

    render () {
        return (
            <TeachableMachineModalComponent
                mode={this.state.mode}
                wizardStep={this.state.wizardStep}
                firstLabelName={this.state.firstLabelName}
                secondLabelName={this.state.secondLabelName}
                imageData={this.state.imageData}
                classifierData={this.state.classifierData}
                expandedLabel={this.state.expandedLabel}
                editingLabel={this.state.editingLabel}
                cameraReady={this.state.cameraReady}
                cameraPermissionGranted={this.state.cameraPermissionGranted}
                isCapturing={this.state.isCapturing}
                showFlash={this.state.showFlash}
                countdownValue={this.state.countdownValue}
                canvasRef={this.setCanvas}
                onFlashEnd={this.handleFlashEnd}
                onCancel={this.handleCancel}
                onWizardNext={this.handleWizardNext}
                onWizardBack={this.handleWizardBack}
                onChangeSecondLabelName={this.handleChangeSecondLabelName}
                onRenameFirstLabel={this.handleRenameFirstLabel}
                onRenameSecondLabel={this.handleRenameSecondLabel}
                onTakePhoto={this.handleTakePhoto}
                onCaptureBurst={this.handleCaptureBurst}
                onSwitchToDashboard={this.handleSwitchToDashboard}
                onExpandCapture={this.handleExpandCapture}
                onExpandEdit={this.handleExpandEdit}
                onCollapseCard={this.handleCollapseCard}
                onRenameLabel={this.handleRenameLabel}
                onDeleteLabel={this.handleDeleteLabel}
                onDeleteExample={this.handleDeleteExample}
                onAddLabel={this.handleAddLabel}
                onClearAll={this.handleClearAll}
            />
        );
    }
}

TeachableMachineModal.propTypes = {
    onCloseTeachableMachineModal: PropTypes.func.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapDispatchToProps = dispatch => ({
    onCloseTeachableMachineModal: () => dispatch(closeTeachableMachineModal())
});

export default connect(
    null,
    mapDispatchToProps
)(TeachableMachineModal);
