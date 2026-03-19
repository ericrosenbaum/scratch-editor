import PropTypes from 'prop-types';
import React from 'react';

import Box from '../../box/box.jsx';
import CoachingTip from '../shared/coaching-tip.jsx';

import styles from '../teachable-machine-modal.css';

const NameLabelStep = props => (
    <Box className={styles.wizardStepBody}>
        <CoachingTip
            text="Now add something for Scratch to recognize!"
            secondaryText="Try something easy to show the camera, like your hand, a toy, or a funny face."
        />
        <div className={styles.nameLabelForm}>
            <label className={styles.nameLabelPrompt}>
                {'What should Scratch look for?'}
            </label>
            <input
                className={styles.nameLabelInput}
                type="text"
                placeholder="e.g. hand, face, cat"
                value={props.labelName}
                onChange={props.onChangeLabelName}
                autoFocus
            />
        </div>
        <div className={styles.wizardActions}>
            <button
                className={styles.primaryButton}
                onClick={props.onNext}
                disabled={!props.labelName.trim()}
            >
                {'Next \u2192'}
            </button>
        </div>
    </Box>
);

NameLabelStep.propTypes = {
    labelName: PropTypes.string.isRequired,
    onChangeLabelName: PropTypes.func.isRequired,
    onNext: PropTypes.func.isRequired
};

export default NameLabelStep;
