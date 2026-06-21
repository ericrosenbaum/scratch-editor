import PropTypes from 'prop-types';
import React from 'react';
import Modal from '../../containers/modal.jsx';
import Box from '../box/box.jsx';
import CodeEditor from '../code-editor/code-editor.jsx';

import styles from './library-block-editor.css';

/**
 * Presentational editor for a single JS-powered block: a CodeMirror text area
 * over the spec+JS document, a live diagnostics summary, and Save/Cancel.
 * @param props
 */
const LibraryBlockEditor = props => (
    <Modal
        className={styles.modalContent}
        contentLabel="Edit JS Block"
        onRequestClose={props.onCancel}
        id="libraryBlockEditor"
    >
        <Box className={styles.body}>
            <p className={styles.help}>
                {'Write a block as a "---" header (type, label, inputs) followed by JavaScript. '}
                {'Use {name} in the label for each input, and read inputs with Scratch.args.name.'}
            </p>

            <Box className={styles.editorWrap}>
                <CodeEditor
                    value={props.draft}
                    lintSource={props.lintSource}
                    onChange={props.onDraftChange}
                />
            </Box>

            <Box className={styles.statusRow}>
                {props.errorCount > 0 ? (
                    <span
                        className={styles.statusError}
                        data-testid="js-block-error-count"
                    >
                        {`${props.errorCount} problem${props.errorCount === 1 ? '' : 's'} to fix`}
                    </span>
                ) : (
                    <span
                        className={styles.statusOk}
                        data-testid="js-block-status-ok"
                    >
                        {'Looks good'}
                    </span>
                )}
            </Box>

            <Box className={styles.buttonRow}>
                <button
                    className={styles.cancelButton}
                    onClick={props.onCancel}
                >
                    {'Cancel'}
                </button>
                <button
                    className={styles.okButton}
                    disabled={props.errorCount > 0}
                    data-testid="js-block-save"
                    onClick={props.onSave}
                >
                    {'Save block'}
                </button>
            </Box>
        </Box>
    </Modal>
);

LibraryBlockEditor.propTypes = {
    draft: PropTypes.string,
    errorCount: PropTypes.number,
    lintSource: PropTypes.func,
    onCancel: PropTypes.func,
    onDraftChange: PropTypes.func,
    onSave: PropTypes.func
};

export default LibraryBlockEditor;
