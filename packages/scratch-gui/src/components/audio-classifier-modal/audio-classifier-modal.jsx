import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage} from 'react-intl';

import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import Spinner from '../spinner/spinner.jsx';

import styles from './audio-classifier-modal.css';

const AudioClassifierModalComponent = ({
    audioLevel,
    backgroundExampleCount,
    backgroundRecordingProgress,
    classes,
    exampleCounts,
    isRecording,
    isRecordingBackground,
    recordingClass,
    recordingProgress,
    isTraining,
    isTrained,
    statusText,
    onRecordBackground,
    onClearBackground,
    onRecordExample,
    onClearExamples,
    onAddClass,
    onRemoveClass,
    onRenameClass,
    onTrain,
    onRequestClose
}) => {
    const anyRecording = isRecording || isRecordingBackground;
    const canTrain = backgroundExampleCount > 0 &&
        classes.length >= 1 &&
        classes.filter(c => (exampleCounts[c] || 0) > 0).length >= 1 &&
        !isTraining && !anyRecording;

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
                <div className={styles.levelMeter}>
                    <div
                        className={styles.levelFill}
                        style={{width: `${audioLevel}%`}}
                    />
                </div>
                <div className={styles.backgroundSection}>
                    <div className={styles.backgroundRow}>
                        <span className={styles.backgroundLabel}>
                            <FormattedMessage
                                defaultMessage="Background Noise"
                                description="Label for background noise recording"
                                id="gui.audioClassifier.backgroundNoise"
                            />
                        </span>
                        <button
                            className={classNames(
                                styles.recordButton,
                                {[styles.recording]: isRecordingBackground}
                            )}
                            disabled={anyRecording || isTraining}
                            onClick={onRecordBackground}
                        >
                            {isRecordingBackground ? (
                                backgroundRecordingProgress || (
                                    <FormattedMessage
                                        defaultMessage="Recording..."
                                        description="Label while recording background noise"
                                        id="gui.audioClassifier.recordingBackground"
                                    />
                                )
                            ) : (
                                <FormattedMessage
                                    defaultMessage="Record"
                                    description="Label for record background noise button"
                                    id="gui.audioClassifier.recordBackground"
                                />
                            )}
                        </button>
                        <span className={styles.exampleCount}>
                            <FormattedMessage
                                defaultMessage="{count} {count, plural, one {example} other {examples}}"
                                description="Count of background noise examples"
                                id="gui.audioClassifier.backgroundExampleCount"
                                values={{count: backgroundExampleCount}}
                            />
                        </span>
                        {backgroundExampleCount > 0 ? (
                            <button
                                className={styles.clearButton}
                                disabled={anyRecording || isTraining}
                                onClick={onClearBackground}
                                title="Clear background examples"
                            >
                                {'↺'}
                            </button>
                        ) : null}
                    </div>
                    <div className={styles.backgroundHint}>
                        <FormattedMessage
                            defaultMessage="Record a few seconds of the background noise in your environment"
                            description="Hint text for background noise recording"
                            id="gui.audioClassifier.backgroundHint"
                        />
                    </div>
                </div>
                <div className={styles.classSeparator} />
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
                            disabled={anyRecording || isTraining}
                            onClick={() => onRecordExample(index)}
                        >
                            {isRecording && recordingClass === index ? (
                                recordingProgress || (
                                    <FormattedMessage
                                        defaultMessage="Recording..."
                                        description="Label while recording audio example"
                                        id="gui.audioClassifier.recording"
                                    />
                                )
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
                        {(exampleCounts[className] || 0) > 0 ? (
                            <button
                                className={styles.clearButton}
                                disabled={anyRecording || isTraining}
                                onClick={() => onClearExamples(index)}
                                title="Clear examples"
                            >
                                {'↺'}
                            </button>
                        ) : null}
                        {classes.length > 1 ? (
                            <button
                                className={styles.deleteButton}
                                disabled={anyRecording || isTraining}
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
                        disabled={anyRecording || isTraining}
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
                            <Spinner
                                className={styles.trainSpinner}
                                level="info"
                                small
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
    audioLevel: PropTypes.number.isRequired,
    backgroundExampleCount: PropTypes.number.isRequired,
    backgroundRecordingProgress: PropTypes.string,
    classes: PropTypes.arrayOf(PropTypes.string).isRequired,
    exampleCounts: PropTypes.objectOf(PropTypes.number).isRequired,
    isRecording: PropTypes.bool.isRequired,
    isRecordingBackground: PropTypes.bool.isRequired,
    isTraining: PropTypes.bool.isRequired,
    isTrained: PropTypes.bool.isRequired,
    onAddClass: PropTypes.func.isRequired,
    onClearBackground: PropTypes.func.isRequired,
    onClearExamples: PropTypes.func.isRequired,
    onRecordBackground: PropTypes.func.isRequired,
    onRecordExample: PropTypes.func.isRequired,
    onRemoveClass: PropTypes.func.isRequired,
    onRenameClass: PropTypes.func.isRequired,
    onRequestClose: PropTypes.func.isRequired,
    onTrain: PropTypes.func.isRequired,
    recordingClass: PropTypes.number,
    recordingProgress: PropTypes.string,
    statusText: PropTypes.string.isRequired
};

export default AudioClassifierModalComponent;
