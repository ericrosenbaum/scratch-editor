import PropTypes from 'prop-types';
import React from 'react';
import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import DatasetItem from './dataset-item.jsx';
import PairRow from './pair-row.jsx';
import styles from './qa-data-modal.css';

const QADataModal = props => {
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
    } = props;

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
                        <div className={styles.sidebarHeader}>{'Datasets'}</div>
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
                        </div>
                        <button
                            className={styles.addButton}
                            onClick={onAddDataset}
                        >
                            {'+ Add dataset'}
                        </button>
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
                                        {'Delete dataset'}
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
                                            key={i}
                                            index={i}
                                            question={p.question}
                                            answer={p.answer}
                                            onChangeQuestion={onChangeQuestion}
                                            onChangeAnswer={onChangeAnswer}
                                            onDelete={onDeletePair}
                                        />
                                    ))}
                                </div>
                                <button
                                    className={styles.addButton}
                                    onClick={onAddPair}
                                >
                                    {'+ Add question/answer'}
                                </button>
                            </React.Fragment>
                        ) : (
                            <div className={styles.empty}>
                                {'No dataset selected. Click "+ Add dataset" to create one.'}
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
};

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
