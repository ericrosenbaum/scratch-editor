import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import styles from './qa-data-modal.css';

class PairRow extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleQuestion',
            'handleAnswer',
            'handleDelete',
            'handleQuestionKeyDown',
            'handleAnswerKeyDown',
            'setQuestionRef',
            'setAnswerRef',
            'autoSize'
        ]);
        this.questionRef = null;
        this.answerRef = null;
    }
    componentDidMount () {
        this.autoSize(this.questionRef);
        this.autoSize(this.answerRef);
    }
    componentDidUpdate (prevProps) {
        if (prevProps.question !== this.props.question) {
            this.autoSize(this.questionRef);
        }
        if (prevProps.answer !== this.props.answer) {
            this.autoSize(this.answerRef);
        }
    }
    setQuestionRef (el) {
        this.questionRef = el;
    }
    setAnswerRef (el) {
        this.answerRef = el;
    }
    autoSize (el) {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
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
    handleQuestionKeyDown (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (this.answerRef) {
                this.answerRef.focus();
            }
        }
    }
    handleAnswerKeyDown (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.props.onEnterFromAnswer(this.props.index);
        }
    }
    focusQuestion () {
        if (this.questionRef) {
            this.questionRef.focus();
        }
    }
    render () {
        return (
            <div className={styles.pairRow}>
                <textarea
                    ref={this.setQuestionRef}
                    className={styles.pairInput}
                    value={this.props.question}
                    onChange={this.handleQuestion}
                    onKeyDown={this.handleQuestionKeyDown}
                    rows={1}
                />
                <textarea
                    ref={this.setAnswerRef}
                    className={styles.pairInput}
                    value={this.props.answer}
                    onChange={this.handleAnswer}
                    onKeyDown={this.handleAnswerKeyDown}
                    rows={1}
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
    onDelete: PropTypes.func.isRequired,
    onEnterFromAnswer: PropTypes.func.isRequired
};

export default PairRow;
