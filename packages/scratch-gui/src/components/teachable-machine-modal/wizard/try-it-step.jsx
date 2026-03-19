import PropTypes from 'prop-types';
import React from 'react';

import Box from '../../box/box.jsx';
import ExampleBlockSnippet from '../shared/example-block-snippet.jsx';

import styles from '../teachable-machine-modal.css';

const TryItStep = props => (
    <Box className={styles.wizardStepBody}>
        <div className={styles.tryItHeader}>
            <div className={styles.tryItCheckmark}>{'\u2714'}</div>
            <div className={styles.tryItTitle}>{'Your model is ready!'}</div>
            <div className={styles.tryItSubtitle}>
                {'Close this window and try these blocks:'}
            </div>
        </div>
        <ExampleBlockSnippet labelName={props.secondLabelName} />
        <div className={styles.wizardActions}>
            <button
                className={styles.secondaryButton}
                onClick={props.onAddMoreLabels}
            >
                {'+ Add More Labels'}
            </button>
            <button
                className={styles.primaryButton}
                onClick={props.onDone}
            >
                {'Done'}
            </button>
        </div>
    </Box>
);

TryItStep.propTypes = {
    secondLabelName: PropTypes.string.isRequired,
    onAddMoreLabels: PropTypes.func.isRequired,
    onDone: PropTypes.func.isRequired
};

export default TryItStep;
