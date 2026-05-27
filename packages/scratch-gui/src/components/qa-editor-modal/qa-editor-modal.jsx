/* eslint-disable react/jsx-no-bind, @stylistic/no-confusing-arrow, no-negated-condition */

import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import classNames from 'classnames';

import Modal from '../../containers/modal.jsx';

import styles from './qa-editor-modal.css';

class QAEditorModalComponent extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClose',
            'handleAddDataset',
            'handleDeleteDataset',
            'handleSelectDataset',
            'handleDatasetNameChange',
            'handleAddPair',
            'handleDeletePair',
            'handleQuestionChange',
            'handleAnswerChange',
            'handleQuestionKeyDown',
            'handleAnswerKeyDown',
            'autoResize',
            'setQuestionRef',
            'setAnswerRef'
        ]);
        this.state = {
            localDatasets: props.datasets.map(d => ({
                ...d,
                pairs: d.pairs.map(p => ({...p}))
            })),
            selectedIndex: props.datasets.length > 0 ? 0 : null
        };
        this.questionRefs = {};
        this.answerRefs = {};
    }

    componentDidMount () {
        Object.values(this.questionRefs).forEach(ref => {
            if (ref) this.autoResize(ref);
        });
        Object.values(this.answerRefs).forEach(ref => {
            if (ref) this.autoResize(ref);
        });
    }

    componentDidUpdate (prevProps, prevState) {
        if (prevState !== this.state) {
            Object.values(this.questionRefs).forEach(ref => {
                if (ref) this.autoResize(ref);
            });
            Object.values(this.answerRefs).forEach(ref => {
                if (ref) this.autoResize(ref);
            });
        }
        if (this._focusNewQuestion) {
            this._focusNewQuestion = false;
            const {selectedIndex, localDatasets} = this.state;
            if (selectedIndex !== null) {
                const newIndex = localDatasets[selectedIndex].pairs.length - 1;
                const ref = this.questionRefs[newIndex];
                if (ref) ref.focus();
            }
        }
    }

    autoResize (textarea) {
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    }

    setQuestionRef (index, ref) {
        this.questionRefs[index] = ref;
        if (ref) this.autoResize(ref);
    }

    setAnswerRef (index, ref) {
        this.answerRefs[index] = ref;
        if (ref) this.autoResize(ref);
    }

    handleClose () {
        // Closing saves the working copy back to the extension.
        this.props.onSave(this.state.localDatasets);
    }

    handleAddDataset (e) {
        if (e) e.stopPropagation();
        const newDataset = {name: 'New dataset', pairs: []};
        const newDatasets = [...this.state.localDatasets, newDataset];
        this.setState({
            localDatasets: newDatasets,
            selectedIndex: newDatasets.length - 1
        });
    }

    handleDeleteDataset (e, index) {
        e.stopPropagation();
        const newDatasets = this.state.localDatasets.filter((_, i) => i !== index);
        let newSelected = this.state.selectedIndex;
        if (newDatasets.length === 0) {
            newSelected = null;
        } else if (index <= this.state.selectedIndex) {
            newSelected = Math.max(0, this.state.selectedIndex - 1);
        }
        this.setState({localDatasets: newDatasets, selectedIndex: newSelected});
    }

    handleSelectDataset (index) {
        this.questionRefs = {};
        this.answerRefs = {};
        this.setState({selectedIndex: index});
    }

    handleDatasetNameChange (index, newName) {
        const newDatasets = this.state.localDatasets.map((d, i) =>
            i === index ? {...d, name: newName} : d
        );
        this.setState({localDatasets: newDatasets});
    }

    handleAddPair (e) {
        if (e) e.stopPropagation();
        const {selectedIndex, localDatasets} = this.state;
        if (selectedIndex === null) return;
        const newPair = {question: '', answer: ''};
        const newDatasets = localDatasets.map((d, i) => {
            if (i !== selectedIndex) return d;
            return {...d, pairs: [...d.pairs, newPair]};
        });
        this._focusNewQuestion = true;
        this.setState({localDatasets: newDatasets});
    }

    handleDeletePair (e, pairIndex) {
        e.stopPropagation();
        const {selectedIndex, localDatasets} = this.state;
        if (selectedIndex === null) return;
        const newDatasets = localDatasets.map((d, i) => {
            if (i !== selectedIndex) return d;
            return {...d, pairs: d.pairs.filter((_, pi) => pi !== pairIndex)};
        });
        delete this.questionRefs[pairIndex];
        delete this.answerRefs[pairIndex];
        this.setState({localDatasets: newDatasets});
    }

    handleQuestionChange (pairIndex, value) {
        const {selectedIndex, localDatasets} = this.state;
        if (selectedIndex === null) return;
        const newDatasets = localDatasets.map((d, i) => {
            if (i !== selectedIndex) return d;
            return {
                ...d,
                pairs: d.pairs.map((p, pi) =>
                    pi === pairIndex ? {...p, question: value} : p
                )
            };
        });
        this.setState({localDatasets: newDatasets});
    }

    handleAnswerChange (pairIndex, value) {
        const {selectedIndex, localDatasets} = this.state;
        if (selectedIndex === null) return;
        const newDatasets = localDatasets.map((d, i) => {
            if (i !== selectedIndex) return d;
            return {
                ...d,
                pairs: d.pairs.map((p, pi) =>
                    pi === pairIndex ? {...p, answer: value} : p
                )
            };
        });
        this.setState({localDatasets: newDatasets});
    }

    handleQuestionKeyDown (pairIndex, e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const ref = this.answerRefs[pairIndex];
            if (ref) ref.focus();
        }
    }

    handleAnswerKeyDown (pairIndex, e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.handleAddPair();
        }
    }

    render () {
        const {localDatasets, selectedIndex} = this.state;
        const selectedDataset = selectedIndex !== null ? localDatasets[selectedIndex] : null;
        const pairs = selectedDataset ? selectedDataset.pairs : [];

        return (
            <Modal
                className={styles.modalContent}
                contentLabel="Edit Q&A Data"
                onRequestClose={this.handleClose}
            >
                <div className={styles.body}>
                    <div className={styles.panels}>
                        <div className={styles.datasetPanel}>
                            <div className={styles.datasetPanelHeader}>{'Datasets'}</div>
                            <div className={styles.datasetList}>
                                {localDatasets.map((dataset, index) => (
                                    <div
                                        key={index}
                                        className={classNames(
                                            styles.datasetItem,
                                            {[styles.datasetItemSelected]: index === selectedIndex}
                                        )}
                                        onClick={() => this.handleSelectDataset(index)}
                                    >
                                        <input
                                            className={styles.datasetNameInput}
                                            type="text"
                                            value={dataset.name}
                                            placeholder="Dataset name"
                                            onClick={e => {
                                                e.stopPropagation();
                                                this.handleSelectDataset(index);
                                            }}
                                            onChange={e => {
                                                e.stopPropagation();
                                                this.handleDatasetNameChange(index, e.target.value);
                                            }}
                                        />
                                        <button
                                            className={styles.datasetDeleteButton}
                                            type="button"
                                            title="Delete dataset"
                                            onClick={e => this.handleDeleteDataset(e, index)}
                                        >
                                            {'✕'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <button
                                className={styles.addDatasetButton}
                                type="button"
                                onClick={this.handleAddDataset}
                            >
                                {'+ Add Dataset'}
                            </button>
                        </div>

                        <div className={styles.pairsPanel}>
                            {selectedDataset === null ? (
                                <div className={styles.noDatasetMessage}>
                                    {'Select a dataset on the left, or create a new one.'}
                                </div>
                            ) : (
                                <React.Fragment>
                                    <div className={styles.pairsPanelHeader}>
                                        <div className={styles.pairsPanelHeaderQuestion}>{'Question'}</div>
                                        <div className={styles.pairsPanelHeaderAnswer}>{'Answer'}</div>
                                        <div className={styles.pairsPanelHeaderAction} />
                                    </div>
                                    <div className={styles.pairsList}>
                                        {pairs.length === 0 ? (
                                            <div className={styles.emptyMessage}>
                                                {'No Q&A pairs yet. Click + Add Pair to add one.'}
                                            </div>
                                        ) : (
                                            pairs.map((pair, pairIndex) => (
                                                <div
                                                    className={styles.pairRow}
                                                    key={pairIndex}
                                                >
                                                    <div className={styles.pairInputWrap}>
                                                        <textarea
                                                            ref={ref => this.setQuestionRef(pairIndex, ref)}
                                                            className={styles.pairTextarea}
                                                            rows="1"
                                                            placeholder="Question..."
                                                            value={pair.question}
                                                            onKeyDown={e => this.handleQuestionKeyDown(pairIndex, e)}
                                                            onChange={e => {
                                                                this.handleQuestionChange(pairIndex, e.target.value);
                                                                this.autoResize(e.target);
                                                            }}
                                                        />
                                                    </div>
                                                    <div className={styles.pairInputWrap}>
                                                        <textarea
                                                            ref={ref => this.setAnswerRef(pairIndex, ref)}
                                                            className={styles.pairTextarea}
                                                            rows="1"
                                                            placeholder="Answer..."
                                                            value={pair.answer}
                                                            onKeyDown={e => this.handleAnswerKeyDown(pairIndex, e)}
                                                            onChange={e => {
                                                                this.handleAnswerChange(pairIndex, e.target.value);
                                                                this.autoResize(e.target);
                                                            }}
                                                        />
                                                    </div>
                                                    <button
                                                        className={styles.pairRemoveButton}
                                                        type="button"
                                                        onClick={e => this.handleDeletePair(e, pairIndex)}
                                                    >
                                                        {'✕'}
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </React.Fragment>
                            )}
                        </div>
                    </div>
                    <div className={styles.footer}>
                        <div className={styles.footerLeft}>
                            <button
                                className={styles.addButton}
                                type="button"
                                disabled={selectedDataset === null}
                                onClick={this.handleAddPair}
                            >
                                {'+ Add Pair'}
                            </button>
                        </div>
                        <div className={styles.pairCount}>
                            {selectedDataset !== null ?
                                `${pairs.length} pair${pairs.length === 1 ? '' : 's'}` :
                                ''
                            }
                        </div>
                    </div>
                </div>
            </Modal>
        );
    }
}

QAEditorModalComponent.propTypes = {
    datasets: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string.isRequired,
        pairs: PropTypes.arrayOf(PropTypes.shape({
            question: PropTypes.string.isRequired,
            answer: PropTypes.string.isRequired
        })).isRequired
    })).isRequired,
    onSave: PropTypes.func.isRequired
};

export default QAEditorModalComponent;
