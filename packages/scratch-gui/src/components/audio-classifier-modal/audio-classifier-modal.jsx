import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage} from 'react-intl';

import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';

import styles from './audio-classifier-modal.css';

const AudioClassifierModalComponent = ({
    classes,
    exampleCounts,
    isRecording,
    recordingClass,
    isTraining,
    isTrained,
    statusText,
    onRecordExample,
    onAddClass,
    onRemoveClass,
    onRenameClass,
    onTrain,
    onRequestClose
}) => {
    const canTrain = classes.length >= 2 &&
        classes.filter(c => (exampleCounts[c] || 0) > 0).length >= 2 &&
        !isTraining && !isRecording;

    return (
        <Modal
            className={styles.modalContent}
            contentLabel={
                <FormattedMessage
                    defaultMessage="Audio Classifier"
                    description="Title for the audio classifier modal"
                    id="gui.audioClassifier.title"
                />
            }
            headerClassName={styles.header}
            id="audioClassifierModal"
            onRequestClose={onRequestClose}
        >
            <Box className={styles.body}>
                {classes.map((className, index) => (
                    <div className={styles.classRow} key={index}>
                        <input
                            className={styles.classNameInput}
                            type="text"
                            value={className}
                            onChange={e => onRenameClass(index, e.target.value)}
                        />
                        <button
                            className={classNames(
                                styles.recordButton,
                                {[styles.recording]: isRecording && recordingClass === index}
                            )}
                            disabled={isRecording || isTraining}
                            onClick={() => onRecordExample(index)}
                        >
                            {isRecording && recordingClass === index ? (
                                <FormattedMessage
                                    defaultMessage="Recording..."
                                    description="Label while recording audio example"
                                    id="gui.audioClassifier.recording"
                                />
                            ) : (
                                <FormattedMessage
                                    defaultMessage="Record"
                                    description="Label for record audio example button"
                                    id="gui.audioClassifier.record"
                                />
                            )}
                        </button>
                        <span className={styles.exampleCount}>
                            <FormattedMessage
                                defaultMessage="{count} {count, plural, one {example} other {examples}}"
                                description="Count of audio examples"
                                id="gui.audioClassifier.exampleCount"
                                values={{count: exampleCounts[className] || 0}}
                            />
                        </span>
                        {classes.length > 2 ? (
                            <button
                                className={styles.deleteButton}
                                disabled={isRecording || isTraining}
                                onClick={() => onRemoveClass(index)}
                                title="Remove class"
                            >
                                {'✕'}
                            </button>
                        ) : null}
                    </div>
                ))}
                <div className={styles.footer}>
                    <button
                        className={styles.addClassButton}
                        disabled={isRecording || isTraining}
                        onClick={onAddClass}
                    >
                        <FormattedMessage
                            defaultMessage="+ Add Class"
                            description="Button to add a new audio class"
                            id="gui.audioClassifier.addClass"
                        />
                    </button>
                    <span className={classNames(
                        styles.statusText,
                        {[styles.statusTrained]: isTrained}
                    )}>
                        {statusText}
                    </span>
                    <button
                        className={styles.trainButton}
                        disabled={!canTrain}
                        onClick={onTrain}
                    >
                        {isTraining ? (
                            <FormattedMessage
                                defaultMessage="Training..."
                                description="Label while training audio classifier"
                                id="gui.audioClassifier.training"
                            />
                        ) : (
                            <FormattedMessage
                                defaultMessage="Train"
                                description="Button to train audio classifier"
                                id="gui.audioClassifier.train"
                            />
                        )}
                    </button>
                </div>
            </Box>
        </Modal>
    );
};

AudioClassifierModalComponent.propTypes = {
    classes: PropTypes.arrayOf(PropTypes.string).isRequired,
    exampleCounts: PropTypes.objectOf(PropTypes.number).isRequired,
    isRecording: PropTypes.bool.isRequired,
    isTraining: PropTypes.bool.isRequired,
    isTrained: PropTypes.bool.isRequired,
    onAddClass: PropTypes.func.isRequired,
    onRecordExample: PropTypes.func.isRequired,
    onRemoveClass: PropTypes.func.isRequired,
    onRenameClass: PropTypes.func.isRequired,
    onRequestClose: PropTypes.func.isRequired,
    onTrain: PropTypes.func.isRequired,
    recordingClass: PropTypes.number,
    statusText: PropTypes.string.isRequired
};

export default AudioClassifierModalComponent;
