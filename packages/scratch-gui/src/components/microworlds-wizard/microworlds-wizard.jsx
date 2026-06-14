import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import styles from './microworlds-wizard.css';

const ChoiceButton = props => {
    const {label, value, selected, onChoose} = props;
    const handleClick = React.useCallback(() => onChoose(value), [value, onChoose]);
    return (
        <button
            className={classNames(styles.choiceButton, {
                [styles.choiceButtonSelected]: selected
            })}
            onClick={handleClick}
        >
            {label}
        </button>
    );
};

ChoiceButton.propTypes = {
    label: PropTypes.string,
    onChoose: PropTypes.func.isRequired,
    selected: PropTypes.bool,
    value: PropTypes.string
};

const MicroworldsWizard = props => {
    const {
        canAdvance,
        choices,
        hint,
        isLastStep,
        onChoose,
        onExit,
        onNext,
        prompt,
        selectedChoice,
        stepCount,
        stepIndex
    } = props;

    return (
        <div className={styles.wizardContainer}>
            <div className={styles.card}>
                <button
                    className={styles.skipButton}
                    onClick={onExit}
                >
                    {'Skip'}
                </button>

                <div className={styles.prompt}>{prompt}</div>
                {hint ? <div className={styles.hint}>{hint}</div> : null}

                {choices ? (
                    <div className={styles.choices}>
                        <div className={styles.choicesLabel}>{choices.label}</div>
                        <div className={styles.choiceButtons}>
                            {choices.options.map(option => (
                                <ChoiceButton
                                    key={option.value}
                                    label={option.label}
                                    value={option.value}
                                    selected={selectedChoice === option.value}
                                    onChoose={onChoose}
                                />
                            ))}
                        </div>
                    </div>
                ) : null}

                <div className={styles.footer}>
                    <div className={styles.pips}>
                        {Array.from({length: stepCount}).map((_, index) => (
                            <span
                                key={index}
                                className={classNames(styles.pip, {
                                    [styles.pipActive]: index === stepIndex,
                                    [styles.pipDone]: index < stepIndex
                                })}
                            />
                        ))}
                    </div>
                    <button
                        className={classNames(styles.nextButton, {
                            [styles.nextButtonDisabled]: !canAdvance
                        })}
                        disabled={!canAdvance}
                        onClick={onNext}
                    >
                        {isLastStep ? 'Finish' : 'Next'}
                    </button>
                </div>
            </div>
        </div>
    );
};

MicroworldsWizard.propTypes = {
    canAdvance: PropTypes.bool,
    choices: PropTypes.shape({
        label: PropTypes.string,
        options: PropTypes.arrayOf(PropTypes.shape({
            label: PropTypes.string,
            value: PropTypes.string
        }))
    }),
    hint: PropTypes.string,
    isLastStep: PropTypes.bool,
    onChoose: PropTypes.func.isRequired,
    onExit: PropTypes.func.isRequired,
    onNext: PropTypes.func.isRequired,
    prompt: PropTypes.string.isRequired,
    selectedChoice: PropTypes.string,
    stepCount: PropTypes.number.isRequired,
    stepIndex: PropTypes.number.isRequired
};

export default MicroworldsWizard;
