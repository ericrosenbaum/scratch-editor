import PropTypes from 'prop-types';
import React from 'react';

import Box from '../../box/box.jsx';
import CoachingTip from '../shared/coaching-tip.jsx';
import CameraPreview from '../shared/camera-preview.jsx';
import CaptureControls from '../shared/capture-controls.jsx';
import StatusBadge from '../shared/status-badge.jsx';
import ImageThumbnail from '../shared/image-thumbnail.jsx';

import styles from '../teachable-machine-modal.css';

const MIN_EXAMPLES = 5;

const CaptureStep = props => {
    const exampleCount = (props.classifierData[props.labelName] || []).length;
    const imageList = props.imageData[props.labelName] || [];
    const isReady = exampleCount >= MIN_EXAMPLES;

    let coachingText;
    let secondaryText;
    if (props.isCapturing) {
        coachingText = 'Hold still! Capturing...';
    } else if (exampleCount === 0) {
        coachingText = props.isBackground ?
            'Point your camera at the room with nothing special in front of it.' :
            `Hold up your ${props.labelName} in front of the camera!`;
        secondaryText = props.isBackground ?
            'Try to keep it still while capturing.' :
            'Make sure it looks different from the background.';
    } else if (isReady) {
        coachingText = props.isBackground ?
            'Looking good! You can capture more or move on.' :
            `Awesome! Scratch now knows what ${props.labelName} looks like.`;
    } else {
        coachingText = `Almost there! You need at least ${MIN_EXAMPLES} examples.`;
    }

    return (
        <Box className={styles.wizardStepBody}>
            <CoachingTip
                text={coachingText}
                secondaryText={secondaryText}
            />
            <div className={styles.captureLayout}>
                <CameraPreview
                    className={styles.wizardCamera}
                    canvasRef={props.canvasRef}
                    permissionGranted={props.cameraPermissionGranted}
                    loaded={props.cameraReady}
                    showFlash={props.showFlash}
                    onFlashEnd={props.onFlashEnd}
                    countdownValue={props.countdownValue}
                />
                <div className={styles.captureSidebar}>
                    <div className={styles.captureLabelInfo}>
                        <span className={styles.captureLabelText}>{'Label: '}</span>
                        <input
                            className={styles.labelNameInput}
                            type="text"
                            defaultValue={props.labelName}
                            key={props.labelName}
                            onBlur={props.onRenameLabel}
                        />
                    </div>
                    <StatusBadge count={exampleCount} />
                    <div className={styles.captureImageGrid}>
                        {imageList.map((image, idx) => (
                            <ImageThumbnail
                                key={`capture-${idx}`}
                                image={image}
                                index={idx}
                            />
                        ))}
                    </div>
                </div>
            </div>
            <CaptureControls
                onTakePhoto={props.onTakePhoto}
                onCaptureBurst={props.onCaptureBurst}
                disabled={!props.cameraReady}
                isCapturing={props.isCapturing}
            />
            <div className={styles.wizardActions}>
                <button
                    className={styles.primaryButton}
                    onClick={props.onNext}
                    style={isReady ? undefined : {visibility: 'hidden'}}
                >
                    {props.isBackground ? 'Next \u2192' : "Done! Let's try it!"}
                </button>
            </div>
        </Box>
    );
};

CaptureStep.propTypes = {
    canvasRef: PropTypes.func.isRequired,
    cameraReady: PropTypes.bool,
    cameraPermissionGranted: PropTypes.bool,
    labelName: PropTypes.string.isRequired,
    isBackground: PropTypes.bool,
    imageData: PropTypes.object.isRequired,
    classifierData: PropTypes.object.isRequired,
    isCapturing: PropTypes.bool,
    showFlash: PropTypes.bool,
    onFlashEnd: PropTypes.func,
    countdownValue: PropTypes.number,
    onTakePhoto: PropTypes.func.isRequired,
    onCaptureBurst: PropTypes.func.isRequired,
    onRenameLabel: PropTypes.func,
    onNext: PropTypes.func.isRequired
};

export default CaptureStep;
