import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';

import styles from '../teachable-machine-modal.css';

const CameraPreview = props => (
    <div className={classNames(styles.cameraPreview, props.className)}>
        <canvas
            className={styles.cameraCanvas}
            height="360"
            width="480"
            ref={props.canvasRef}
        />
        {props.permissionGranted ? (
            props.loaded ? null : (
                <div className={styles.cameraOverlayMessage}>
                    {'Loading Camera...'}
                </div>
            )
        ) : (
            <div className={styles.cameraOverlayMessage}>
                {'We need your permission to use your camera'}
            </div>
        )}
        {props.showFlash ? (
            <div
                className={styles.flashOverlay}
                onAnimationEnd={props.onFlashEnd}
            />
        ) : null}
        {props.countdownValue ? (
            <div className={styles.countdownOverlay}>
                {props.countdownValue}
            </div>
        ) : null}
    </div>
);

CameraPreview.propTypes = {
    canvasRef: PropTypes.func.isRequired,
    className: PropTypes.string,
    permissionGranted: PropTypes.bool,
    loaded: PropTypes.bool,
    showFlash: PropTypes.bool,
    onFlashEnd: PropTypes.func,
    countdownValue: PropTypes.number
};

CameraPreview.defaultProps = {
    permissionGranted: false,
    loaded: false,
    showFlash: false
};

export default CameraPreview;
