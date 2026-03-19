import PropTypes from 'prop-types';
import React from 'react';

import Box from '../../box/box.jsx';
import ProgressIndicator from '../shared/progress-indicator.jsx';
import WelcomeStep from './welcome-step.jsx';
import CaptureStep from './capture-step.jsx';
import NameLabelStep from './name-label-step.jsx';
import TryItStep from './try-it-step.jsx';

import styles from '../teachable-machine-modal.css';

const WizardView = props => {
    const firstLabelName = props.firstLabelName || 'Background';
    const secondLabelName = props.secondLabelName || '';

    let stepContent;
    switch (props.wizardStep) {
    case 1:
        stepContent = (
            <WelcomeStep
                canvasRef={props.canvasRef}
                cameraReady={props.cameraReady}
                cameraPermissionGranted={props.cameraPermissionGranted}
                onStart={props.onWizardNext}
            />
        );
        break;
    case 2:
        stepContent = (
            <CaptureStep
                canvasRef={props.canvasRef}
                cameraReady={props.cameraReady}
                cameraPermissionGranted={props.cameraPermissionGranted}
                labelName={firstLabelName}
                isBackground
                imageData={props.imageData}
                classifierData={props.classifierData}
                isCapturing={props.isCapturing}
                showFlash={props.showFlash}
                onFlashEnd={props.onFlashEnd}
                countdownValue={props.countdownValue}
                onTakePhoto={props.onTakePhoto}
                onCaptureBurst={props.onCaptureBurst}
                onRenameLabel={props.onRenameFirstLabel}
                onNext={props.onWizardNext}
            />
        );
        break;
    case 3:
        stepContent = (
            <NameLabelStep
                labelName={secondLabelName}
                onChangeLabelName={props.onChangeSecondLabelName}
                onNext={props.onWizardNext}
            />
        );
        break;
    case 4:
        stepContent = (
            <CaptureStep
                canvasRef={props.canvasRef}
                cameraReady={props.cameraReady}
                cameraPermissionGranted={props.cameraPermissionGranted}
                labelName={secondLabelName}
                isBackground={false}
                imageData={props.imageData}
                classifierData={props.classifierData}
                isCapturing={props.isCapturing}
                showFlash={props.showFlash}
                onFlashEnd={props.onFlashEnd}
                countdownValue={props.countdownValue}
                onTakePhoto={props.onTakePhoto}
                onCaptureBurst={props.onCaptureBurst}
                onRenameLabel={props.onRenameSecondLabel}
                onNext={props.onWizardNext}
            />
        );
        break;
    case 5:
        stepContent = (
            <TryItStep
                secondLabelName={secondLabelName}
                onAddMoreLabels={props.onSwitchToDashboard}
                onDone={props.onCancel}
            />
        );
        break;
    default:
        stepContent = null;
    }

    return (
        <Box
            className={styles.wizardContainer}
            data-wizard-step={props.wizardStep}
        >
            <ProgressIndicator currentStep={props.wizardStep} />
            {stepContent}
            {props.wizardStep > 1 && props.wizardStep < 5 ? (
                <button
                    className={styles.backButton}
                    onClick={props.onWizardBack}
                >
                    {'\u2190 Back'}
                </button>
            ) : null}
        </Box>
    );
};

WizardView.propTypes = {
    wizardStep: PropTypes.number.isRequired,
    firstLabelName: PropTypes.string,
    secondLabelName: PropTypes.string,
    canvasRef: PropTypes.func.isRequired,
    cameraReady: PropTypes.bool,
    cameraPermissionGranted: PropTypes.bool,
    imageData: PropTypes.object.isRequired,
    classifierData: PropTypes.object.isRequired,
    isCapturing: PropTypes.bool,
    showFlash: PropTypes.bool,
    onFlashEnd: PropTypes.func,
    countdownValue: PropTypes.number,
    onTakePhoto: PropTypes.func.isRequired,
    onCaptureBurst: PropTypes.func.isRequired,
    onRenameFirstLabel: PropTypes.func,
    onRenameSecondLabel: PropTypes.func,
    onChangeSecondLabelName: PropTypes.func.isRequired,
    onWizardNext: PropTypes.func.isRequired,
    onWizardBack: PropTypes.func.isRequired,
    onSwitchToDashboard: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
};

export default WizardView;
