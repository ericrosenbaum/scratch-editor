import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import DatasetItem from './dataset-item.jsx';
import PairRow from './pair-row.jsx';
import styles from './qa-data-modal.css';

class QADataModal extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleEnterFromAnswer', 'setPairRef']);
        this.pairRefs = {};
        this._focusPairIndex = -1;
    }
    componentDidUpdate () {
        if (this._focusPairIndex >= 0 && this.pairRefs[this._focusPairIndex]) {
            this.pairRefs[this._focusPairIndex].focusQuestion();
            this._focusPairIndex = -1;
        }
    }
    setPairRef (index, el) {
        if (el) {
            this.pairRefs[index] = el;
        } else {
            delete this.pairRefs[index];
        }
    }
    handleEnterFromAnswer (pairIndex) {
        const {datasets, activeDatasetIndex} = this.props;
        const activeDataset = datasets[activeDatasetIndex];
        if (activeDataset && pairIndex === activeDataset.pairs.length - 1) {
            // Last pair — add a new one and schedule focus
            this._focusPairIndex = pairIndex + 1;
            this.props.onAddPair();
        } else if (activeDataset && pairIndex < activeDataset.pairs.length - 1) {
            // Not the last pair — focus next pair's question
            const nextRef = this.pairRefs[pairIndex + 1];
            if (nextRef) {
                nextRef.focusQuestion();
            }
        }
    }
    render () {
        const {
            datasets,
            activeDatasetIndex,
            onSelectDataset,
            onAddDataset,
            onDeleteDataset,
            onRenameDataset,
            onAddPair,
            onDeletePair,
            onChangeQuestion,
            onChangeAnswer,
            onSave,
            onCancel
        } = this.props;

        const activeDataset = datasets[activeDatasetIndex];

        return (
            <Modal
                id="qaDataEditorModal"
                className={styles.modalContent}
                contentLabel="Edit Q+A Data"
                onRequestClose={onCancel}
            >
                <Box className={styles.body}>
                    <div className={styles.container}>
                        <div className={styles.sidebar}>
                            <div className={styles.sidebarHeader}>{'Data Sets'}</div>
                            <div className={styles.datasetList}>
                                {datasets.map((d, i) => (
                                    <DatasetItem
                                        key={i}
                                        index={i}
                                        name={d.name}
                                        active={i === activeDatasetIndex}
                                        onSelect={onSelectDataset}
                                    />
                                ))}
                                <button
                                    className={styles.addButton}
                                    onClick={onAddDataset}
                                >
                                    {'+ Add Data Set'}
                                </button>
                            </div>
                        </div>

                        <div className={styles.main}>
                            {activeDataset ? (
                                <React.Fragment>
                                    <div className={styles.mainHeader}>
                                        <input
                                            className={styles.nameInput}
                                            type="text"
                                            value={activeDataset.name}
                                            onChange={onRenameDataset}
                                        />
                                        <button
                                            className={styles.deleteDatasetButton}
                                            onClick={onDeleteDataset}
                                        >
                                            {'Delete Data Set'}
                                        </button>
                                    </div>
                                    <div className={styles.pairsHeader}>
                                        <div className={styles.pairsHeaderQuestion}>{'Question'}</div>
                                        <div className={styles.pairsHeaderAnswer}>{'Answer'}</div>
                                        <div className={styles.pairsHeaderRemove} />
                                    </div>
                                    <div className={styles.pairsList}>
                                        {activeDataset.pairs.map((p, i) => (
                                            <PairRow
                                                ref={el => this.setPairRef(i, el)}
                                                key={i}
                                                index={i}
                                                question={p.question}
                                                answer={p.answer}
                                                onChangeQuestion={onChangeQuestion}
                                                onChangeAnswer={onChangeAnswer}
                                                onDelete={onDeletePair}
                                                onEnterFromAnswer={this.handleEnterFromAnswer}
                                            />
                                        ))}
                                        <button
                                            className={styles.addButton}
                                            onClick={onAddPair}
                                        >
                                            {'+ Add Question / Answer'}
                                        </button>
                                    </div>
                                </React.Fragment>
                            ) : (
                                <div className={styles.empty}>
                                    {'No data set selected. Click "+ Add Data Set" to create one.'}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={styles.buttonRow}>
                        <button onClick={onCancel}>{'Cancel'}</button>
                        <button
                            className={styles.okButton}
                            onClick={onSave}
                        >
                            {'Save'}
                        </button>
                    </div>
                </Box>
            </Modal>
        );
    }
}

QADataModal.propTypes = {
    datasets: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string.isRequired,
        pairs: PropTypes.arrayOf(PropTypes.shape({
            question: PropTypes.string.isRequired,
            answer: PropTypes.string.isRequired
        })).isRequired
    })).isRequired,
    activeDatasetIndex: PropTypes.number.isRequired,
    onSelectDataset: PropTypes.func.isRequired,
    onAddDataset: PropTypes.func.isRequired,
    onDeleteDataset: PropTypes.func.isRequired,
    onRenameDataset: PropTypes.func.isRequired,
    onAddPair: PropTypes.func.isRequired,
    onDeletePair: PropTypes.func.isRequired,
    onChangeQuestion: PropTypes.func.isRequired,
    onChangeAnswer: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
};

export default QADataModal;
