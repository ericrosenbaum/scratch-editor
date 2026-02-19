import {FormattedMessage, defineMessages, useIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React, {useCallback, useState, useRef, useEffect} from 'react';
import {connect} from 'react-redux';
import VM from '@scratch/scratch-vm';

import Box from '../box/box.jsx';
import Button from '../button/button.jsx';
import ToggleButtons from '../toggle-buttons/toggle-buttons.jsx';
import Controls from '../../containers/controls.jsx';
import {getStageDimensions} from '../../lib/screen-utils';
import {STAGE_SIZE_MODES} from '../../lib/layout-constants';

import fullScreenIcon from './icon--fullscreen.svg';
import largeStageIcon from './icon--large-stage.svg';
import smallStageIcon from './icon--small-stage.svg';
import unFullScreenIcon from './icon--unfullscreen.svg';

import scratchLogo from '../menu-bar/scratch-logo.svg';
import styles from './stage-header.css';
import {storeProjectThumbnail} from '../../lib/store-project-thumbnail.js';
import {describeStage} from '../../lib/describe-stage';
import dataURItoBlob from '../../lib/data-uri-to-blob.js';
import throttle from 'lodash.throttle';

const messages = defineMessages({
    largeStageSizeMessage: {
        defaultMessage: 'Switch to large stage',
        description: 'Button to change stage size to large',
        id: 'gui.stageHeader.stageSizeLarge'
    },
    smallStageSizeMessage: {
        defaultMessage: 'Switch to small stage',
        description: 'Button to change stage size to small',
        id: 'gui.stageHeader.stageSizeSmall'
    },
    fullStageSizeMessage: {
        defaultMessage: 'Enter full screen mode',
        description: 'Button to change stage size to full screen',
        id: 'gui.stageHeader.stageSizeFull'
    },
    unFullStageSizeMessage: {
        defaultMessage: 'Exit full screen mode',
        description: 'Button to get out of full screen mode',
        id: 'gui.stageHeader.stageSizeUnFull'
    },
    setThumbnail: {
        defaultMessage: 'Set Thumbnail',
        description: 'Manually save project thumbnail',
        id: 'gui.stageHeader.saveThumbnail'
    },
    fullscreenControl: {
        defaultMessage: 'Full Screen Control',
        description: 'Button to enter/exit full screen mode',
        id: 'gui.stageHeader.fullscreenControl'
    }
});

const StageHeaderComponent = function (props) {
    const {
        isFullScreen,
        isPlayerOnly,
        manuallySaveThumbnails,
        onKeyPress,
        onSetStageLarge,
        onSetStageSmall,
        onSetStageFull,
        onSetStageUnFull,
        onUpdateProjectThumbnail,
        projectId,
        showBranding,
        stageSizeMode,
        vm
    } = props;
    const intl = useIntl();

    // --- Describe Stage state ---
    const [calloutOpen, setCalloutOpen] = useState(false);
    const [describeStatus, setDescribeStatus] = useState('idle'); // idle | loading | done | error
    const [description, setDescription] = useState('');
    const [ttsStatus, setTtsStatus] = useState('idle'); // idle | loading | playing
    const ttsSourceRef = useRef(null);
    const calloutRef = useRef(null);

    const stopTts = useCallback(() => {
        if (ttsSourceRef.current) {
            try { ttsSourceRef.current.stop(); } catch (_) {} // eslint-disable-line no-empty
            ttsSourceRef.current = null;
        }
        setTtsStatus('idle');
    }, []);

    // Close callout when clicking outside
    useEffect(() => {
        if (!calloutOpen) return;
        const onClickOutside = e => {
            if (calloutRef.current && !calloutRef.current.contains(e.target)) {
                setCalloutOpen(false);
                stopTts();
            }
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [calloutOpen, stopTts]);

    const handleDescribeClick = useCallback(async () => {
        if (calloutOpen) {
            setCalloutOpen(false);
            stopTts();
            return;
        }
        setCalloutOpen(true);
        setDescribeStatus('loading');
        setDescription('');
        try {
            const text = await describeStage(vm);
            setDescription(text);
            setDescribeStatus('done');
        } catch (e) {
            setDescribeStatus('error');
            setDescription(e.message || 'Error describing stage');
        }
    }, [vm, calloutOpen, stopTts]);

    const handleTtsPlay = useCallback(async () => {
        if (ttsStatus === 'playing') {
            stopTts();
            return;
        }
        setTtsStatus('loading');
        try {
            const text = description.substring(0, 128);
            const url = `https://synthesis-service.scratch.mit.edu/synth?locale=en-US&gender=female&text=${encodeURIComponent(text)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const buffer = await res.arrayBuffer();
            const audioCtx = new AudioContext();
            const audioBuffer = await audioCtx.decodeAudioData(buffer);
            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioCtx.destination);
            ttsSourceRef.current = source;
            setTtsStatus('playing');
            source.onended = () => {
                ttsSourceRef.current = null;
                setTtsStatus('idle');
            };
            source.start();
        } catch (_e) {
            // Fallback to browser speech synthesis
            if (window.speechSynthesis) {
                const utterance = new SpeechSynthesisUtterance(description);
                utterance.lang = 'en-US';
                setTtsStatus('playing');
                utterance.onend = () => setTtsStatus('idle');
                ttsSourceRef.current = {stop: () => window.speechSynthesis.cancel()};
                window.speechSynthesis.speak(utterance);
            } else {
                setTtsStatus('idle');
            }
        }
    }, [description, ttsStatus, stopTts]);

    let header = null;

    const onUpdateThumbnail = useCallback(
        throttle(
            () => {
                if (!onUpdateProjectThumbnail) {
                    return;
                }

                storeProjectThumbnail(vm, dataURI => {
                    onUpdateProjectThumbnail(projectId, dataURItoBlob(dataURI));
                });
            },
            3000
        ),
        [projectId, onUpdateProjectThumbnail]
    );

    if (isFullScreen) {
        const stageDimensions = getStageDimensions(null, true);
        const stageButton = showBranding ? (
            <div className={styles.embedScratchLogo}>
                <a
                    href="https://scratch.mit.edu"
                    rel="noopener noreferrer"
                    target="_blank"
                >
                    <img
                        alt="Scratch"
                        src={scratchLogo}
                    />
                </a>
            </div>
        ) : (
            <div className={styles.unselectWrapper}>
                <Button
                    className={styles.stageButton}
                    onClick={onSetStageUnFull}
                    onKeyPress={onKeyPress}
                >
                    <img
                        alt={intl.formatMessage(messages.unFullStageSizeMessage)}
                        className={styles.stageButtonIcon}
                        draggable={false}
                        src={unFullScreenIcon}
                        title={intl.formatMessage(messages.fullscreenControl)}
                    />
                </Button>
            </div>
        );
        header = (
            <Box className={styles.stageHeaderWrapperOverlay}>
                <Box
                    className={styles.stageMenuWrapper}
                    style={{width: stageDimensions.width}}
                >
                    <Controls vm={vm} />
                    {stageButton}
                </Box>
            </Box>
        );
    } else {
        const stageControls =
            isPlayerOnly ? (
                []
            ) : (
                <div className={styles.stageSizeToggleGroup}>
                    <ToggleButtons
                        buttons={[
                            {
                                handleClick: onSetStageSmall,
                                icon: smallStageIcon,
                                iconClassName: styles.stageButtonIcon,
                                isSelected: stageSizeMode === STAGE_SIZE_MODES.small,
                                title: intl.formatMessage(messages.smallStageSizeMessage)
                            },
                            {
                                handleClick: onSetStageLarge,
                                icon: largeStageIcon,
                                iconClassName: styles.stageButtonIcon,
                                isSelected: stageSizeMode === STAGE_SIZE_MODES.large,
                                title: intl.formatMessage(messages.largeStageSizeMessage)
                            }
                        ]}
                    />
                </div>
            );
        header = (
            <Box className={styles.stageHeaderWrapper}>
                <Box className={styles.stageMenuWrapper}>
                    <Controls vm={vm} />
                    <div className={styles.stageSizeRow}>
                        {!isPlayerOnly && (
                            <div
                                className={styles.describeWrapper}
                                ref={calloutRef}
                            >
                                <Button
                                    className={styles.stageButton}
                                    title="Describe stage with AI"
                                    onClick={handleDescribeClick}
                                >
                                    <svg
                                        className={styles.stageButtonIcon}
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        viewBox="0 0 24 24"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <circle
                                            cx="12"
                                            cy="12"
                                            r="3"
                                        />
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <path
                                            d="M18 4l2-2M6 4L4 2M18 20l2 2M6 20l-2 2"
                                            strokeWidth="1.5"
                                        />
                                    </svg>
                                </Button>
                                {calloutOpen && (
                                    <div className={styles.describeCallout}>
                                        <button
                                            className={styles.describeCalloutClose}
                                            onClick={() => {
                                                setCalloutOpen(false);
                                                stopTts();
                                            }}
                                        >
                                            {'✕'}
                                        </button>
                                        {describeStatus === 'loading' && (
                                            <div className={styles.describeCalloutLoading}>
                                                <span className={styles.describeSpinner} />
                                                {'Gemma is looking\u2026'}
                                            </div>
                                        )}
                                        {(describeStatus === 'done' || describeStatus === 'error') && (
                                            <React.Fragment>
                                                <p className={styles.describeCalloutText}>{description}</p>
                                                {describeStatus === 'done' && (
                                                    <button
                                                        className={styles.describeTtsButton}
                                                        disabled={ttsStatus === 'loading'}
                                                        onClick={handleTtsPlay}
                                                    >
                                                        {ttsStatus === 'playing' ? '\u23f9 Stop' : ttsStatus === 'loading' ? '\u2026' : '\u25b6 Play'}
                                                    </button>
                                                )}
                                            </React.Fragment>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        {stageControls}
                        <div className={styles.rightSection}>
                            {manuallySaveThumbnails && (
                                <Button
                                    aria-label={intl.formatMessage(messages.setThumbnail)}
                                    className={styles.setThumbnailButton}
                                    onClick={onUpdateThumbnail}
                                >
                                    <FormattedMessage {...messages.setThumbnail} />
                                </Button>
                            )}
                            <Button
                                className={styles.stageButton}
                                onClick={onSetStageFull}
                            >
                                <img
                                    alt={intl.formatMessage(messages.fullStageSizeMessage)}
                                    className={styles.stageButtonIcon}
                                    draggable={false}
                                    src={fullScreenIcon}
                                    title={intl.formatMessage(messages.fullscreenControl)}
                                />
                            </Button>
                        </div>
                    </div>
                </Box>
            </Box>
        );
    }

    return header;
};

const mapStateToProps = state => ({
    projectId: state.scratchGui.projectState.projectId,
    // This is the button's mode, as opposed to the actual current state
    stageSizeMode: state.scratchGui.stageSize.stageSize
});

StageHeaderComponent.propTypes = {
    isFullScreen: PropTypes.bool.isRequired,
    isPlayerOnly: PropTypes.bool.isRequired,
    manuallySaveThumbnails: PropTypes.bool,
    onKeyPress: PropTypes.func.isRequired,
    onSetStageFull: PropTypes.func.isRequired,
    onSetStageLarge: PropTypes.func.isRequired,
    onSetStageSmall: PropTypes.func.isRequired,
    onSetStageUnFull: PropTypes.func.isRequired,
    onUpdateProjectThumbnail: PropTypes.func,
    projectId: PropTypes.number.isRequired,
    showBranding: PropTypes.bool.isRequired,
    stageSizeMode: PropTypes.oneOf(Object.keys(STAGE_SIZE_MODES)),
    vm: PropTypes.instanceOf(VM).isRequired
};

StageHeaderComponent.defaultProps = {
    stageSizeMode: STAGE_SIZE_MODES.large
};

export default connect(mapStateToProps)(StageHeaderComponent);
