import React from 'react';
import PropTypes from 'prop-types';
import Box from '../box/box.jsx';
import aiSparkleIcon from './icon--ai-sparkle.svg';
import styles from './ai-suggest-button.css';

const AiSuggestButton = ({onClick}) => (
    <Box className={styles.aiSuggestButtonContainer}>
        <button
            className={styles.aiSuggestButton}
            title="AI Code Suggestions"
            onClick={onClick}
        >
            <img
                className={styles.aiSuggestButtonIcon}
                draggable={false}
                src={aiSparkleIcon}
            />
        </button>
    </Box>
);

AiSuggestButton.propTypes = {
    onClick: PropTypes.func
};

export default AiSuggestButton;
