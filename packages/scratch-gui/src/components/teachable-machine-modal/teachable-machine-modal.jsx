import PropTypes from 'prop-types';
import React from 'react';
import keyMirror from 'keymirror';

import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';

import ModelEditor from './model-editor.jsx';
import LabelEditor from './label-editor.jsx';
import ExampleEditor from './example-editor.jsx';

import styles from './teachable-machine-modal.css';

const PHASES = keyMirror({
    modelEditor: null,
    labelEditor: null,
    exampleEditor: null
});

const TeachableMachineModalComponent = props => (
    <Modal
        className={styles.modalContent}
        contentLabel="Teachable Machine"
        headerClassName={styles.header}
        id="teachableMachineModal"
        onRequestClose={props.onCancel}
    >
        <Box className={styles.body}>
            {props.phase === PHASES.modelEditor && (
                <ModelEditor
                    classifierData={props.classifierData}
                    imageData={props.imageData}
                    onAddLabel={props.onAddLabel}
                    onCancel={props.onCancel}
                    onClearAll={props.onClearAll}
                    onDeleteLabel={props.onDeleteLabel}
                    onEditLabel={props.onEditLabel}
                />
            )}
            {props.phase === PHASES.labelEditor && (
                <LabelEditor
                    activeLabel={props.activeLabel}
                    classifierData={props.classifierData}
                    imageData={props.imageData}
                    onAddExamples={props.onAddExamples}
                    onDeleteExample={props.onDeleteExample}
                    onEditModel={props.onEditModel}
                    onRenameLabel={props.onRenameLabel}
                />
            )}
            {props.phase === PHASES.exampleEditor && (
                <ExampleEditor
                    activeLabel={props.activeLabel}
                    imageData={props.imageData}
                    onEditLabel={props.onEditLabel}
                    onEditModel={props.onEditModel}
                    onNewExamples={props.onNewExamples}
                />
            )}
        </Box>
    </Modal>
);

TeachableMachineModalComponent.propTypes = {
    activeLabel: PropTypes.string,
    classifierData: PropTypes.object,
    imageData: PropTypes.object,
    onAddExamples: PropTypes.func,
    onAddLabel: PropTypes.func,
    onCancel: PropTypes.func.isRequired,
    onClearAll: PropTypes.func,
    onDeleteExample: PropTypes.func,
    onDeleteLabel: PropTypes.func,
    onEditLabel: PropTypes.func,
    onEditModel: PropTypes.func,
    onNewExamples: PropTypes.func,
    onRenameLabel: PropTypes.func,
    phase: PropTypes.oneOf(Object.keys(PHASES)).isRequired
};

export {
    TeachableMachineModalComponent as default,
    PHASES
};
