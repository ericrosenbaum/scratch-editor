import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';

import styles from '../teachable-machine-modal.css';

const CaptureControls = props => (
    <div className={styles.captureControls}>
        <button
            className={classNames(styles.captureButton, styles.captureButtonSingle)}
            onClick={props.onTakePhoto}
            disabled={props.disabled || props.isCapturing}
        >
            {'Take Photo'}
        </button>
        <button
            className={classNames(styles.captureButton, styles.captureButtonBurst)}
            onClick={props.onCaptureBurst}
            disabled={props.disabled || props.isCapturing}
        >
            {props.isCapturing ? 'Capturing...' : 'Capture 10'}
        </button>
    </div>
);

CaptureControls.propTypes = {
    onTakePhoto: PropTypes.func.isRequired,
    onCaptureBurst: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
    isCapturing: PropTypes.bool
};

CaptureControls.defaultProps = {
    disabled: false,
    isCapturing: false
};

export default CaptureControls;
