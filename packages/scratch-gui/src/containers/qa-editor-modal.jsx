import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from '@scratch/scratch-vm';
import {connect} from 'react-redux';

import QAEditorModalComponent from '../components/qa-editor-modal/qa-editor-modal.jsx';

import {closeQnaEditor} from '../reducers/modals';

class QAEditorModal extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleSave']);
    }
    handleSave (datasets) {
        const ext = this.props.vm.runtime._qnaExtension;
        if (ext && typeof ext.setQADatasets === 'function') {
            ext.setQADatasets(datasets);
        }
        this.props.onClose();
    }
    render () {
        const ext = this.props.vm.runtime._qnaExtension;
        const datasets = (ext && ext.getQADatasets) ? ext.getQADatasets() : [];
        return (
            <QAEditorModalComponent
                datasets={datasets}
                onSave={this.handleSave}
            />
        );
    }
}

QAEditorModal.propTypes = {
    onClose: PropTypes.func.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeQnaEditor())
});

export default connect(mapStateToProps, mapDispatchToProps)(QAEditorModal);
