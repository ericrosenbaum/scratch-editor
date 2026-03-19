import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';

import styles from '../teachable-machine-modal.css';

const STEP_COUNT = 5;

const ProgressIndicator = props => (
    <div className={styles.progressIndicator}>
        {Array.from({length: STEP_COUNT}, (_, i) => {
            const step = i + 1;
            return (
                <React.Fragment key={step}>
                    {i > 0 && (
                        <div
                            className={classNames(
                                styles.progressLine,
                                step <= props.currentStep ? styles.progressLineActive : null
                            )}
                        />
                    )}
                    <div
                        className={classNames(
                            styles.progressDot,
                            step === props.currentStep ? styles.progressDotCurrent : null,
                            step < props.currentStep ? styles.progressDotComplete : null
                        )}
                    >
                        {step}
                    </div>
                </React.Fragment>
            );
        })}
    </div>
);

ProgressIndicator.propTypes = {
    currentStep: PropTypes.number.isRequired
};

export default ProgressIndicator;
