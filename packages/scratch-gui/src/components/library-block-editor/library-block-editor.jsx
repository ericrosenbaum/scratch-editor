import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import Modal from '../../containers/modal.jsx';
import Box from '../box/box.jsx';
import CodeEditor from '../code-editor/code-editor.jsx';
import ApiReference from '../api-reference/api-reference.jsx';

import styles from './library-block-editor.css';

/**
 * Editor for a single JS-powered block: a CodeMirror text area over the spec+JS
 * document, a live diagnostics summary, Save/Cancel, and a toggleable API
 * reference panel shown beside the code so you can look up `Scratch.*` while
 * writing the block.
 */
class LibraryBlockEditor extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleToggleDocs', 'handleCloseDocs']);
        this.state = {docsOpen: false};
    }
    handleToggleDocs () {
        this.setState(state => ({docsOpen: !state.docsOpen}));
    }
    handleCloseDocs () {
        this.setState({docsOpen: false});
    }
    render () {
        const props = this.props;
        return (
            <Modal
                className={this.state.docsOpen ? styles.modalContentWide : styles.modalContent}
                contentLabel="Edit JS Block"
                onRequestClose={props.onCancel}
                id="libraryBlockEditor"
            >
                <Box className={styles.body}>
                    <Box className={styles.helpRow}>
                        <p className={styles.help}>
                            {'Write a block as a "---" header (type, label, inputs) followed by JavaScript. '}
                            {'Use {name} in the label for each input, and read inputs with Scratch.args.name.'}
                        </p>
                        <button
                            className={styles.docsButton}
                            data-testid="js-block-api-reference"
                            onClick={this.handleToggleDocs}
                        >
                            {this.state.docsOpen ? 'Hide API reference' : '📖 API reference'}
                        </button>
                    </Box>

                    <Box className={styles.workArea}>
                        <Box className={styles.editorWrap}>
                            <CodeEditor
                                value={props.draft}
                                lintSource={props.lintSource}
                                onChange={props.onDraftChange}
                            />
                        </Box>
                        {this.state.docsOpen ? (
                            <ApiReference onClose={this.handleCloseDocs} />
                        ) : null}
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
    }
}

LibraryBlockEditor.propTypes = {
    draft: PropTypes.string,
    errorCount: PropTypes.number,
    lintSource: PropTypes.func,
    onCancel: PropTypes.func,
    onDraftChange: PropTypes.func,
    onSave: PropTypes.func
};

export default LibraryBlockEditor;
