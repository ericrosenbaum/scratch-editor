import PropTypes from 'prop-types';
import React from 'react';

import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';

import WizardView from './wizard/wizard.jsx';
import DashboardView from './dashboard/dashboard.jsx';

import styles from './teachable-machine-modal.css';

const TeachableMachineModalComponent = props => (
    <Modal
        className={styles.modalContent}
        contentLabel="Teachable Machine"
        headerClassName={styles.header}
        id="teachableMachineModal"
        onRequestClose={props.onCancel}
    >
        <Box className={styles.body}>
            {props.mode === 'wizard' ? (
                <WizardView
                    wizardStep={props.wizardStep}
                    firstLabelName={props.firstLabelName}
                    secondLabelName={props.secondLabelName}
                    canvasRef={props.canvasRef}
                    cameraReady={props.cameraReady}
                    cameraPermissionGranted={props.cameraPermissionGranted}
                    imageData={props.imageData}
                    classifierData={props.classifierData}
                    isCapturing={props.isCapturing}
                    showFlash={props.showFlash}
                    onFlashEnd={props.onFlashEnd}
                    countdownValue={props.countdownValue}
                    onTakePhoto={props.onTakePhoto}
                    onCaptureBurst={props.onCaptureBurst}
                    onRenameFirstLabel={props.onRenameFirstLabel}
                    onRenameSecondLabel={props.onRenameSecondLabel}
                    onChangeSecondLabelName={props.onChangeSecondLabelName}
                    onWizardNext={props.onWizardNext}
                    onWizardBack={props.onWizardBack}
                    onSwitchToDashboard={props.onSwitchToDashboard}
                    onCancel={props.onCancel}
                />
            ) : (
                <DashboardView
                    imageData={props.imageData}
                    classifierData={props.classifierData}
                    expandedLabel={props.expandedLabel}
                    editingLabel={props.editingLabel}
                    canvasRef={props.canvasRef}
                    cameraReady={props.cameraReady}
                    cameraPermissionGranted={props.cameraPermissionGranted}
                    isCapturing={props.isCapturing}
                    showFlash={props.showFlash}
                    onFlashEnd={props.onFlashEnd}
                    countdownValue={props.countdownValue}
                    onTakePhoto={props.onTakePhoto}
                    onCaptureBurst={props.onCaptureBurst}
                    onExpandCapture={props.onExpandCapture}
                    onExpandEdit={props.onExpandEdit}
                    onCollapseCard={props.onCollapseCard}
                    onRenameLabel={props.onRenameLabel}
                    onDeleteLabel={props.onDeleteLabel}
                    onDeleteExample={props.onDeleteExample}
                    onAddLabel={props.onAddLabel}
                    onClearAll={props.onClearAll}
                    onCancel={props.onCancel}
                    trainingStatus={props.trainingStatus}
                />
            )}
        </Box>
    </Modal>
);

TeachableMachineModalComponent.propTypes = {
    mode: PropTypes.oneOf(['wizard', 'dashboard']).isRequired,
    wizardStep: PropTypes.number,
    firstLabelName: PropTypes.string,
    secondLabelName: PropTypes.string,
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
    onCancel: PropTypes.func.isRequired,
    onWizardNext: PropTypes.func,
    onWizardBack: PropTypes.func,
    onChangeSecondLabelName: PropTypes.func,
    onRenameFirstLabel: PropTypes.func,
    onRenameSecondLabel: PropTypes.func,
    onTakePhoto: PropTypes.func.isRequired,
    onCaptureBurst: PropTypes.func.isRequired,
    onSwitchToDashboard: PropTypes.func,
    onExpandCapture: PropTypes.func,
    onExpandEdit: PropTypes.func,
    onCollapseCard: PropTypes.func,
    onRenameLabel: PropTypes.func,
    onDeleteLabel: PropTypes.func,
    onDeleteExample: PropTypes.func,
    onAddLabel: PropTypes.func,
    onClearAll: PropTypes.func,
    trainingStatus: PropTypes.string
};

export default TeachableMachineModalComponent;
