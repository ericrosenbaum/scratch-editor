import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';
import VM from '@scratch/scratch-vm';

import TeachableMachineModalComponent, {PHASES} from '../components/teachable-machine-modal/teachable-machine-modal.jsx';
import {closeTeachableMachineModal} from '../reducers/modals';

class TeachableMachineModal extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleCancel',
            'handleAddLabel',
            'handleClearAll',
            'handleDeleteLabel',
            'handleEditLabel',
            'handleEditModel',
            'handleAddExamples',
            'handleDeleteExample',
            'handleNewExamples',
            'handleRenameLabel'
        ]);
        // Read initial data from the extension instance
        const ext = props.vm.runtime.ext_teachableClassifier;
        this.state = {
            phase: PHASES.modelEditor,
            activeLabel: null,
            imageData: ext ? {...ext._imageData} : {},
            classifierData: ext ? {...ext._classifierData} : {}
        };
    }

    /**
     * Get a fresh snapshot of data from the extension.
     */
    _syncFromExtension () {
        const ext = this.props.vm.runtime.ext_teachableClassifier;
        if (ext) {
            this.setState({
                imageData: {...ext._imageData},
                classifierData: {...ext._classifierData}
            });
        }
    }

    handleCancel () {
        this.props.onCloseTeachableMachineModal();
    }

    handleAddLabel () {
        const ext = this.props.vm.runtime.ext_teachableClassifier;
        const name = ext ? ext.getNextLabelName() : `Class ${Date.now()}`;
        this.setState({
            phase: PHASES.exampleEditor,
            activeLabel: name
        });
    }

    handleClearAll () {
        this.props.vm.runtime.emit('CLEAR_ALL_LABELS');
        this._syncFromExtension();
    }

    handleDeleteLabel (label) {
        this.props.vm.runtime.emit('DELETE_LABEL', label);
        this._syncFromExtension();
    }

    handleEditLabel (label) {
        this.setState({
            phase: PHASES.labelEditor,
            activeLabel: label
        });
    }

    handleEditModel () {
        this._syncFromExtension();
        this.setState({phase: PHASES.modelEditor});
    }

    handleAddExamples () {
        this.setState({phase: PHASES.exampleEditor});
    }

    handleDeleteExample (exampleNum) {
        this.props.vm.runtime.emit('DELETE_EXAMPLE', this.state.activeLabel, exampleNum);
        this._syncFromExtension();
    }

    handleNewExamples (newExamples, isNewLabel) {
        if (newExamples.length > 0) {
            this.props.vm.runtime.emit('NEW_EXAMPLES', newExamples, this.state.activeLabel);
        }
        if (isNewLabel) {
            this._syncFromExtension();
            this.setState({phase: PHASES.modelEditor});
        }
    }

    handleRenameLabel (oldName, newName) {
        this.props.vm.runtime.emit('RENAME_LABEL', oldName, newName);
        const activeLabel = this.state.activeLabel === oldName ? newName : this.state.activeLabel;
        this._syncFromExtension();
        this.setState({activeLabel});
    }

    render () {
        return (
            <TeachableMachineModalComponent
                activeLabel={this.state.activeLabel}
                classifierData={this.state.classifierData}
                imageData={this.state.imageData}
                phase={this.state.phase}
                onAddExamples={this.handleAddExamples}
                onAddLabel={this.handleAddLabel}
                onCancel={this.handleCancel}
                onClearAll={this.handleClearAll}
                onDeleteExample={this.handleDeleteExample}
                onDeleteLabel={this.handleDeleteLabel}
                onEditLabel={this.handleEditLabel}
                onEditModel={this.handleEditModel}
                onNewExamples={this.handleNewExamples}
                onRenameLabel={this.handleRenameLabel}
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
