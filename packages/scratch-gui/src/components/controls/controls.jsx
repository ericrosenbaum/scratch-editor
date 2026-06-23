import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, useIntl} from 'react-intl';

import GreenFlag from '../green-flag/green-flag.jsx';
import StopAll from '../stop-all/stop-all.jsx';
import TurboMode from '../turbo-mode/turbo-mode.jsx';

import styles from './controls.css';

const messages = defineMessages({
    goTitle: {
        id: 'gui.controls.go',
        defaultMessage: 'Go',
        description: 'Green flag button title'
    },
    stopTitle: {
        id: 'gui.controls.stop',
        defaultMessage: 'Stop',
        description: 'Stop button title'
    },
    analyzingTitle: {
        id: 'gui.controls.analyzingSpeech',
        defaultMessage: 'Analyzing speech…',
        description: 'Tooltip for the spinner shown while spoken audio is being transcribed'
    },
    findingAnswerTitle: {
        id: 'gui.controls.findingAnswer',
        defaultMessage: 'Finding answer…',
        description: 'Tooltip for the spinner shown while the Q&A extension is finding an answer'
    }
});

const Controls = function (props) {
    const {
        active,
        className,
        onGreenFlagClick,
        onStopAllClick,
        qaAnalyzing,
        speechAnalyzing,
        turbo,
        ...componentProps
    } = props;
    const intl = useIntl();
    return (
        <div
            className={classNames(styles.controlsContainer, className)}
            {...componentProps}
        >
            <GreenFlag
                active={active}
                title={intl.formatMessage(messages.goTitle)}
                onClick={onGreenFlagClick}
            />
            <StopAll
                active={active}
                title={intl.formatMessage(messages.stopTitle)}
                onClick={onStopAllClick}
            />
            {speechAnalyzing ? (
                <div
                    className={styles.speechSpinner}
                    title={intl.formatMessage(messages.analyzingTitle)}
                />
            ) : null}
            {qaAnalyzing ? (
                <div
                    className={styles.qaSpinner}
                    title={intl.formatMessage(messages.findingAnswerTitle)}
                />
            ) : null}
            {turbo ? (
                <TurboMode />
            ) : null}
        </div>
    );
};

Controls.propTypes = {
    active: PropTypes.bool,
    className: PropTypes.string,
    onGreenFlagClick: PropTypes.func.isRequired,
    onStopAllClick: PropTypes.func.isRequired,
    qaAnalyzing: PropTypes.bool,
    speechAnalyzing: PropTypes.bool,
    turbo: PropTypes.bool
};

Controls.defaultProps = {
    active: false,
    qaAnalyzing: false,
    speechAnalyzing: false,
    turbo: false
};

export default Controls;
