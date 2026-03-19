import PropTypes from 'prop-types';
import React from 'react';

import Box from '../../box/box.jsx';
import CoachingTip from '../shared/coaching-tip.jsx';
import CameraPreview from '../shared/camera-preview.jsx';

import styles from '../teachable-machine-modal.css';

const WelcomeStep = props => (
    <Box className={styles.wizardStepBody}>
        <CoachingTip
            text="Let's teach Scratch to see!"
            secondaryText={
                "First, show it what 'nothing' looks like \u2014 " +
                'just your room with nothing special in front of the camera.'
            }
        />
        <CameraPreview
            className={styles.wizardCamera}
            canvasRef={props.canvasRef}
            permissionGranted={props.cameraPermissionGranted}
            loaded={props.cameraReady}
        />
        <div className={styles.wizardActions}>
            <button
                className={styles.primaryButton}
                onClick={props.onStart}
                disabled={!props.cameraReady}
            >
                {'Start!'}
            </button>
        </div>
    </Box>
);

WelcomeStep.propTypes = {
    canvasRef: PropTypes.func.isRequired,
    cameraReady: PropTypes.bool,
    cameraPermissionGranted: PropTypes.bool,
    onStart: PropTypes.func.isRequired
};

export default WelcomeStep;
