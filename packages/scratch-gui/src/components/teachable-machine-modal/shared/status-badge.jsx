import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';

import styles from '../teachable-machine-modal.css';

const MIN_EXAMPLES = 5;

const StatusBadge = props => {
    const count = props.count || 0;
    const isReady = count >= MIN_EXAMPLES;
    return (
        <div
            className={classNames(
                styles.statusBadge,
                isReady ? styles.statusBadgeReady : styles.statusBadgeNeeds
            )}
        >
            {isReady ? (
                `${count} examples \u2714`
            ) : (
                `${count} of ${MIN_EXAMPLES} needed`
            )}
        </div>
    );
};

StatusBadge.propTypes = {
    count: PropTypes.number
};

export default StatusBadge;
