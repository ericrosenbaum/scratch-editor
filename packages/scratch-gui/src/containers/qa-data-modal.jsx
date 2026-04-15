import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import QADataModalComponent from '../components/qa-data-modal/qa-data-modal.jsx';
import {closeQADataEditor} from '../reducers/modals';

/**
 * Deep clone a datasets array into a plain, editable structure.
 * @param {Array<{name:string, pairs:Array<{question:string,answer:string}>}>} datasets
 */
const cloneDatasets = function (datasets) {
    return datasets.map(d => ({
        name: d.name,
        pairs: d.pairs.map(p => ({question: p.question, answer: p.answer}))
    }));
};

class QADataModal extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleSelectDataset',
            'handleAddDataset',
            'handleDeleteDataset',
            'handleRenameDataset',
            'handleAddPair',
            'handleDeletePair',
            'handleChangeQuestion',
            'handleChangeAnswer',
            'handleSave',
            'handleCancel'
        ]);

        // Pull the current datasets out of the VM extension instance.
        const ext = props.vm && props.vm.runtime && props.vm.runtime._qaExtension;
        const initial = ext && typeof ext.getQADatasets === 'function' ?
            cloneDatasets(ext.getQADatasets()) :
            [];

        this.state = {
            datasets: initial,
            activeDatasetIndex: initial.length > 0 ? 0 : -1
        };
    }

    handleSelectDataset (index) {
        this.setState({activeDatasetIndex: index});
    }

    handleAddDataset () {
        this.setState(state => {
            const datasets = state.datasets.concat({
                name: `dataset ${state.datasets.length + 1}`,
                pairs: []
            });
            return {datasets, activeDatasetIndex: datasets.length - 1};
        });
    }

    handleDeleteDataset () {
        this.setState(state => {
            if (state.activeDatasetIndex < 0) return null;
            const datasets = state.datasets.slice();
            datasets.splice(state.activeDatasetIndex, 1);
            const activeDatasetIndex = Math.min(state.activeDatasetIndex, datasets.length - 1);
            return {datasets, activeDatasetIndex};
        });
    }

    handleRenameDataset (e) {
        const newName = e.target.value;
        this.setState(state => {
            if (state.activeDatasetIndex < 0) return null;
            const datasets = state.datasets.slice();
            datasets[state.activeDatasetIndex] = Object.assign(
                {},
                datasets[state.activeDatasetIndex],
                {name: newName}
            );
            return {datasets};
        });
    }

    handleAddPair () {
        this.setState(state => {
            if (state.activeDatasetIndex < 0) return null;
            const datasets = state.datasets.slice();
            const current = datasets[state.activeDatasetIndex];
            datasets[state.activeDatasetIndex] = Object.assign({}, current, {
                pairs: current.pairs.concat({question: '', answer: ''})
            });
            return {datasets};
        });
    }

    handleDeletePair (pairIndex) {
        this.setState(state => {
            if (state.activeDatasetIndex < 0) return null;
            const datasets = state.datasets.slice();
            const current = datasets[state.activeDatasetIndex];
            const pairs = current.pairs.slice();
            pairs.splice(pairIndex, 1);
            datasets[state.activeDatasetIndex] = Object.assign({}, current, {pairs});
            return {datasets};
        });
    }

    handleChangeQuestion (pairIndex, value) {
        this._updatePair(pairIndex, {question: value});
    }

    handleChangeAnswer (pairIndex, value) {
        this._updatePair(pairIndex, {answer: value});
    }

    _updatePair (pairIndex, patch) {
        this.setState(state => {
            if (state.activeDatasetIndex < 0) return null;
            const datasets = state.datasets.slice();
            const current = datasets[state.activeDatasetIndex];
            const pairs = current.pairs.slice();
            pairs[pairIndex] = Object.assign({}, pairs[pairIndex], patch);
            datasets[state.activeDatasetIndex] = Object.assign({}, current, {pairs});
            return {datasets};
        });
    }

    handleSave () {
        const ext = this.props.vm &&
            this.props.vm.runtime &&
            this.props.vm.runtime._qaExtension;
        if (ext && typeof ext.setQADatasets === 'function') {
            ext.setQADatasets(cloneDatasets(this.state.datasets));
        }
        this.props.onClose();
    }

    handleCancel () {
        this.props.onClose();
    }

    render () {
        return (
            <QADataModalComponent
                datasets={this.state.datasets}
                activeDatasetIndex={this.state.activeDatasetIndex}
                onSelectDataset={this.handleSelectDataset}
                onAddDataset={this.handleAddDataset}
                onDeleteDataset={this.handleDeleteDataset}
                onRenameDataset={this.handleRenameDataset}
                onAddPair={this.handleAddPair}
                onDeletePair={this.handleDeletePair}
                onChangeQuestion={this.handleChangeQuestion}
                onChangeAnswer={this.handleChangeAnswer}
                onSave={this.handleSave}
                onCancel={this.handleCancel}
            />
        );
    }
}

QADataModal.propTypes = {
    vm: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired
};

const mapStateToProps = () => ({});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeQADataEditor())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(QADataModal);
