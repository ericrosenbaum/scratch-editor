import PropTypes from 'prop-types';
import React from 'react';

import Box from '../../box/box.jsx';
import CameraPreview from '../shared/camera-preview.jsx';
import CaptureControls from '../shared/capture-controls.jsx';

import styles from '../teachable-machine-modal.css';

const InlineCapture = props => (
    <Box className={styles.inlineCapture}>
        <CameraPreview
            className={styles.inlineCameraPreview}
            canvasRef={props.canvasRef}
            permissionGranted={props.cameraPermissionGranted}
            loaded={props.cameraReady}
            showFlash={props.showFlash}
            onFlashEnd={props.onFlashEnd}
            countdownValue={props.countdownValue}
        />
        <CaptureControls
            onTakePhoto={props.onTakePhoto}
            onCaptureBurst={props.onCaptureBurst}
            disabled={!props.cameraReady}
            isCapturing={props.isCapturing}
        />
        <button
            className={styles.collapseButton}
            onClick={props.onCollapse}
        >
            {'Collapse \u25B2'}
        </button>
    </Box>
);

InlineCapture.propTypes = {
    canvasRef: PropTypes.func.isRequired,
    cameraReady: PropTypes.bool,
    cameraPermissionGranted: PropTypes.bool,
    isCapturing: PropTypes.bool,
    showFlash: PropTypes.bool,
    onFlashEnd: PropTypes.func,
    countdownValue: PropTypes.number,
    onTakePhoto: PropTypes.func.isRequired,
    onCaptureBurst: PropTypes.func.isRequired,
    onCollapse: PropTypes.func.isRequired
};

export default InlineCapture;
