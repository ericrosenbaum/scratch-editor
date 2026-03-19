import PropTypes from 'prop-types';
import React from 'react';

import styles from '../teachable-machine-modal.css';

const CoachingTip = props => (
    <div className={styles.coachingTip}>
        <div className={styles.coachingTipText}>
            {props.text}
        </div>
        {props.secondaryText ? (
            <div className={styles.coachingTipSecondary}>
                {props.secondaryText}
            </div>
        ) : null}
    </div>
);

CoachingTip.propTypes = {
    text: PropTypes.string.isRequired,
    secondaryText: PropTypes.string
};

export default CoachingTip;
