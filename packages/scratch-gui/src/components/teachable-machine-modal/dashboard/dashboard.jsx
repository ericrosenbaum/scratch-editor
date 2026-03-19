import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';

import Box from '../../box/box.jsx';
import LabelCard from './label-card.jsx';

import styles from '../teachable-machine-modal.css';

class DashboardView extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleAddLabel',
            'handleAddLabelKeyDown',
            'handleNewLabelNameChange',
            'handleCancelAddLabel',
            'handleClearAll',
            'handleCancelClear'
        ]);
        this.state = {
            addingLabel: false,
            newLabelName: '',
            confirmingClear: false
        };
    }
    handleAddLabel () {
        if (this.state.addingLabel) {
            const name = this.state.newLabelName.trim();
            if (name) {
                this.props.onAddLabel(name);
                this.setState({addingLabel: false, newLabelName: ''});
            }
        } else {
            this.setState({addingLabel: true});
        }
    }
    handleAddLabelKeyDown (e) {
        if (e.key === 'Enter') {
            this.handleAddLabel();
        }
    }
    handleNewLabelNameChange (e) {
        this.setState({newLabelName: e.target.value});
    }
    handleCancelAddLabel () {
        this.setState({addingLabel: false, newLabelName: ''});
    }
    handleClearAll () {
        if (this.state.confirmingClear) {
            this.props.onClearAll();
            this.setState({confirmingClear: false});
        } else {
            this.setState({confirmingClear: true});
        }
    }
    handleCancelClear () {
        this.setState({confirmingClear: false});
    }
    render () {
        const labels = Object.keys(this.props.classifierData);

        return (
            <Box className={styles.dashboardContainer}>
                <div className={styles.dashboardStatus}>
                    {labels.length >= 2 ? (
                        `Model ready \u2014 watching for: ${labels.join(', ')}`
                    ) : (
                        'Add labels to train your model'
                    )}
                </div>
                <div className={styles.labelCardList}>
                    {labels.map(label => (
                        <LabelCard
                            key={label}
                            labelName={label}
                            imageData={this.props.imageData}
                            classifierData={this.props.classifierData}
                            isExpandedCapture={this.props.expandedLabel === label}
                            isExpandedEdit={this.props.editingLabel === label}
                            canvasRef={this.props.canvasRef}
                            cameraReady={this.props.cameraReady}
                            cameraPermissionGranted={this.props.cameraPermissionGranted}
                            isCapturing={this.props.isCapturing}
                            showFlash={this.props.showFlash}
                            onFlashEnd={this.props.onFlashEnd}
                            countdownValue={this.props.countdownValue}
                            onTakePhoto={this.props.onTakePhoto}
                            onCaptureBurst={this.props.onCaptureBurst}
                            onExpandCapture={this.props.onExpandCapture}
                            onExpandEdit={this.props.onExpandEdit}
                            onCollapse={this.props.onCollapseCard}
                            onRenameLabel={this.props.onRenameLabel}
                            onDeleteLabel={this.props.onDeleteLabel}
                            onDeleteExample={this.props.onDeleteExample}
                        />
                    ))}
                </div>
                <div className={styles.dashboardAddLabel}>
                    {this.state.addingLabel ? (
                        <div className={styles.addLabelForm}>
                            <input
                                className={styles.labelNameInput}
                                type="text"
                                placeholder="Label name"
                                value={this.state.newLabelName}
                                onChange={this.handleNewLabelNameChange}
                                onKeyDown={this.handleAddLabelKeyDown}
                                autoFocus
                            />
                            <button
                                className={styles.secondaryButton}
                                onClick={this.handleAddLabel}
                                disabled={!this.state.newLabelName.trim()}
                            >
                                {'Add'}
                            </button>
                            <button
                                className={styles.secondaryButton}
                                onClick={this.handleCancelAddLabel}
                            >
                                {'Cancel'}
                            </button>
                        </div>
                    ) : (
                        <button
                            className={styles.secondaryButton}
                            onClick={this.handleAddLabel}
                        >
                            {'+ Add Another Label'}
                        </button>
                    )}
                </div>
                <div className={styles.dashboardFooter}>
                    <div className={styles.dashboardBottomButtons}>
                        {this.state.confirmingClear ? (
                            <div className={styles.confirmDeleteRow}>
                                <span>{'Are you sure?'}</span>
                                <button
                                    className={styles.dangerButton}
                                    onClick={this.handleClearAll}
                                >
                                    {'Yes, clear all'}
                                </button>
                                <button
                                    className={styles.secondaryButton}
                                    onClick={this.handleCancelClear}
                                >
                                    {'Cancel'}
                                </button>
                            </div>
                        ) : (
                            <button
                                className={styles.dangerButton}
                                onClick={this.handleClearAll}
                            >
                                {'Clear All'}
                            </button>
                        )}
                        <button
                            className={styles.primaryButton}
                            onClick={this.props.onCancel}
                        >
                            {'Done'}
                        </button>
                    </div>
                </div>
            </Box>
        );
    }
}

DashboardView.propTypes = {
    imageData: PropTypes.object.isRequired,
    classifierData: PropTypes.object.isRequired,
    expandedLabel: PropTypes.string,
    editingLabel: PropTypes.string,
    canvasRef: PropTypes.func.isRequired,
    cameraReady: PropTypes.bool,
    cameraPermissionGranted: PropTypes.bool,
    isCapturing: PropTypes.bool,
    showFlash: PropTypes.bool,
    onFlashEnd: PropTypes.func,
    countdownValue: PropTypes.number,
    onTakePhoto: PropTypes.func.isRequired,
    onCaptureBurst: PropTypes.func.isRequired,
    onExpandCapture: PropTypes.func.isRequired,
    onExpandEdit: PropTypes.func.isRequired,
    onCollapseCard: PropTypes.func.isRequired,
    onRenameLabel: PropTypes.func.isRequired,
    onDeleteLabel: PropTypes.func.isRequired,
    onDeleteExample: PropTypes.func.isRequired,
    onAddLabel: PropTypes.func.isRequired,
    onClearAll: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
};

export default DashboardView;
