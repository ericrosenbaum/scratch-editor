import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import {FormattedMessage} from 'react-intl';

import Box from '../box/box.jsx';
import CloseButton from '../close-button/close-button.jsx';
import Spinner from '../spinner/spinner.jsx';
import {AlertLevels} from '../../lib/alerts/index.jsx';

import styles from './alert.css';

const closeButtonColors = {
    [AlertLevels.SUCCESS]: CloseButton.COLOR_GREEN,
    [AlertLevels.WARN]: CloseButton.COLOR_ORANGE
};

const renderSpecialContent = ({alertId, message, spriteName, onJumpToSound}) => {
    if (alertId === 'aiMusicComplete') {
        return (
            <FormattedMessage
                defaultMessage="Music ready on {spriteName}. <a>Open</a>"
                description="Toast shown when AI music generation completes"
                id="gui.alerts.aiMusicComplete"
                values={{
                    spriteName: spriteName || '',
                    a: chunks => (
                        <button
                            className={styles.alertConnectionButton}
                            onClick={onJumpToSound}
                        >
                            {chunks}
                        </button>
                    )
                }}
            />
        );
    }
    if (alertId === 'aiMusicError') {
        return (
            <FormattedMessage
                defaultMessage="Music generation failed: {message}"
                description="Toast shown when AI music generation errors"
                id="gui.alerts.aiMusicError"
                values={{message: message || ''}}
            />
        );
    }
    return null;
};

const AlertComponent = ({
    alertId,
    content,
    closeButton,
    extensionName,
    iconSpinner,
    iconURL,
    level,
    message,
    showDownload,
    showSaveNow,
    spriteName,
    onCloseAlert,
    onDownload,
    onJumpToSound,
    onSaveNow,
    onReconnect,
    showReconnect
}) => (
    <Box
        className={classNames(styles.alert, styles[level])}
    >
        {/* TODO: implement Rtl handling */}
        {(iconSpinner || iconURL) && (
            <div className={styles.iconSection}>
                {iconSpinner && (
                    <Spinner
                        className={styles.alertSpinner}
                        level={level}
                    />
                )}
                {iconURL && (
                    <img
                        className={styles.alertIcon}
                        src={iconURL}
                    />
                )}
            </div>
        )}
        <div className={styles.alertMessage}>
            {extensionName ? (
                <FormattedMessage
                    defaultMessage="Scratch lost connection to {extensionName}."
                    description="Message indicating that an extension peripheral has been disconnected"
                    id="gui.alerts.lostPeripheralConnection"
                    values={{
                        extensionName: (
                            `${extensionName}`
                        )
                    }}
                />
            ) : (renderSpecialContent({alertId, message, spriteName, onJumpToSound}) || content)}
        </div>
        <div className={styles.alertButtons}>
            {showSaveNow && (
                <button
                    className={styles.alertConnectionButton}
                    onClick={onSaveNow}
                >
                    <FormattedMessage
                        defaultMessage="Try Again"
                        description="Button to try saving again"
                        id="gui.alerts.tryAgain"
                    />
                </button>
            )}
            {showDownload && (
                <button
                    className={styles.alertConnectionButton}
                    onClick={onDownload}
                >
                    <FormattedMessage
                        defaultMessage="Download"
                        description="Button to download project locally"
                        id="gui.alerts.download"
                    />
                </button>
            )}
            {showReconnect && (
                <button
                    className={styles.alertConnectionButton}
                    onClick={onReconnect}
                >
                    <FormattedMessage
                        defaultMessage="Reconnect"
                        description="Button to reconnect the device"
                        id="gui.connection.reconnect"
                    />
                </button>
            )}
            {closeButton && (
                <Box
                    className={styles.alertCloseButtonContainer}
                >
                    <CloseButton
                        className={classNames(styles.alertCloseButton)}
                        color={closeButtonColors[level]}
                        size={CloseButton.SIZE_LARGE}
                        onClick={onCloseAlert}
                    />
                </Box>
            )}
        </div>
    </Box>
);

AlertComponent.propTypes = {
    alertId: PropTypes.string,
    closeButton: PropTypes.bool,
    content: PropTypes.oneOfType([PropTypes.element, PropTypes.string]),
    extensionName: PropTypes.string,
    iconSpinner: PropTypes.bool,
    iconURL: PropTypes.string,
    level: PropTypes.string,
    message: PropTypes.string,
    onCloseAlert: PropTypes.func.isRequired,
    onDownload: PropTypes.func,
    onJumpToSound: PropTypes.func,
    onReconnect: PropTypes.func,
    onSaveNow: PropTypes.func,
    showDownload: PropTypes.func,
    showReconnect: PropTypes.bool,
    showSaveNow: PropTypes.bool,
    spriteName: PropTypes.string
};

AlertComponent.defaultProps = {
    level: AlertLevels.WARN
};

export default AlertComponent;
