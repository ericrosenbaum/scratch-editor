import PropTypes from 'prop-types';
import React from 'react';
import styles from './ai-code-button.css';

const AiCodeButton = ({onClick, visible}) => {
    if (!visible) return null;
    return (
        <button
            className={styles.aiCodeButton}
            title="AI Code Suggestions"
            onClick={onClick}
        >
            <svg
                className={styles.aiCodeButtonIcon}
                viewBox="0 0 24 24"
                fill="white"
            >
                <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
            </svg>
        </button>
    );
};

AiCodeButton.propTypes = {
    onClick: PropTypes.func,
    visible: PropTypes.bool
};

export default AiCodeButton;
