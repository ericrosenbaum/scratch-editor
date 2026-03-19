import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import classNames from 'classnames';

import Box from '../../box/box.jsx';
import StatusBadge from '../shared/status-badge.jsx';
import ImageThumbnail from '../shared/image-thumbnail.jsx';
import InlineCapture from './inline-capture.jsx';
import LabelDetail from './label-detail.jsx';

import styles from '../teachable-machine-modal.css';

class LabelCard extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleExpandCapture',
            'handleExpandEdit',
            'handleCollapse',
            'handleDeleteExample'
        ]);
    }
    handleExpandCapture () {
        this.props.onExpandCapture(this.props.labelName);
    }
    handleExpandEdit () {
        this.props.onExpandEdit(this.props.labelName);
    }
    handleCollapse () {
        this.props.onCollapse();
    }
    handleDeleteExample (idx) {
        this.props.onDeleteExample(this.props.labelName, idx);
    }
    render () {
        const {labelName, imageData, classifierData} = this.props;
        const exampleCount = (classifierData[labelName] || []).length;
        const imageList = imageData[labelName] || [];
        const isExpanded = this.props.isExpandedCapture || this.props.isExpandedEdit;

        return (
            <Box className={classNames(styles.labelCard, isExpanded ? styles.labelCardExpanded : null)}>
                <div className={styles.labelCardHeader}>
                    <div className={styles.labelCardName}>{labelName}</div>
                    <StatusBadge count={exampleCount} />
                    <div className={styles.labelCardActions}>
                        <button
                            className={styles.iconButton}
                            onClick={this.handleExpandCapture}
                            title="Add more examples"
                        >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <circle cx="8" cy="8.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                                <path d="M2 5.5h1.5l1-1.5h7l1 1.5H14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="1.25" />
                            </svg>
                        </button>
                        <button
                            className={styles.iconButton}
                            onClick={this.handleExpandEdit}
                            title="Edit label"
                        >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M11.5 1.5l3 3-9 9H2.5v-3z" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
                                <line x1="9.5" y1="3.5" x2="12.5" y2="6.5" stroke="currentColor" strokeWidth="1.25" />
                            </svg>
                        </button>
                    </div>
                </div>
                {this.props.isExpandedEdit ? null : (
                    <div className={styles.thumbnailStrip}>
                        {imageList.slice(0, 8).map((image, idx) => (
                            <ImageThumbnail
                                key={`thumb-${idx}`}
                                image={image}
                                index={idx}
                            />
                        ))}
                        {imageList.length > 8 ? (
                            <div className={styles.thumbnailMore}>
                                {`+${imageList.length - 8}`}
                            </div>
                        ) : null}
                    </div>
                )}
                {this.props.isExpandedCapture ? (
                    <InlineCapture
                        canvasRef={this.props.canvasRef}
                        cameraReady={this.props.cameraReady}
                        cameraPermissionGranted={this.props.cameraPermissionGranted}
                        isCapturing={this.props.isCapturing}
                        showFlash={this.props.showFlash}
                        onFlashEnd={this.props.onFlashEnd}
                        countdownValue={this.props.countdownValue}
                        onTakePhoto={this.props.onTakePhoto}
                        onCaptureBurst={this.props.onCaptureBurst}
                        onCollapse={this.handleCollapse}
                    />
                ) : null}
                {this.props.isExpandedEdit ? (
                    <LabelDetail
                        labelName={labelName}
                        imageData={imageData}
                        onRenameLabel={this.props.onRenameLabel}
                        onDeleteLabel={this.props.onDeleteLabel}
                        onDeleteExample={this.handleDeleteExample}
                        onCollapse={this.handleCollapse}
                    />
                ) : null}
            </Box>
        );
    }
}

LabelCard.propTypes = {
    labelName: PropTypes.string.isRequired,
    imageData: PropTypes.object.isRequired,
    classifierData: PropTypes.object.isRequired,
    isExpandedCapture: PropTypes.bool,
    isExpandedEdit: PropTypes.bool,
    canvasRef: PropTypes.func,
    cameraReady: PropTypes.bool,
    cameraPermissionGranted: PropTypes.bool,
    isCapturing: PropTypes.bool,
    showFlash: PropTypes.bool,
    onFlashEnd: PropTypes.func,
    countdownValue: PropTypes.number,
    onTakePhoto: PropTypes.func,
    onCaptureBurst: PropTypes.func,
    onExpandCapture: PropTypes.func.isRequired,
    onExpandEdit: PropTypes.func.isRequired,
    onCollapse: PropTypes.func.isRequired,
    onRenameLabel: PropTypes.func.isRequired,
    onDeleteLabel: PropTypes.func.isRequired,
    onDeleteExample: PropTypes.func.isRequired
};

export default LabelCard;
