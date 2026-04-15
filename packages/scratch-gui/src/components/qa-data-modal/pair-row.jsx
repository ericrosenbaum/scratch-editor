import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import styles from './qa-data-modal.css';

class PairRow extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, ['handleQuestion', 'handleAnswer', 'handleDelete']);
    }
    handleQuestion (e) {
        this.props.onChangeQuestion(this.props.index, e.target.value);
    }
    handleAnswer (e) {
        this.props.onChangeAnswer(this.props.index, e.target.value);
    }
    handleDelete () {
        this.props.onDelete(this.props.index);
    }
    render () {
        return (
            <div className={styles.pairRow}>
                <textarea
                    className={styles.pairInput}
                    value={this.props.question}
                    onChange={this.handleQuestion}
                />
                <textarea
                    className={styles.pairInput}
                    value={this.props.answer}
                    onChange={this.handleAnswer}
                />
                <button
                    className={styles.removeButton}
                    title="Delete row"
                    onClick={this.handleDelete}
                >
                    {'\u00D7'}
                </button>
            </div>
        );
    }
}

PairRow.propTypes = {
    index: PropTypes.number.isRequired,
    question: PropTypes.string.isRequired,
    answer: PropTypes.string.isRequired,
    onChangeQuestion: PropTypes.func.isRequired,
    onChangeAnswer: PropTypes.func.isRequired,
    onDelete: PropTypes.func.isRequired
};

export default PairRow;
