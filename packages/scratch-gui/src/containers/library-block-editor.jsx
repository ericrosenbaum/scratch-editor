import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import LibraryBlockEditorComponent from '../components/library-block-editor/library-block-editor.jsx';
import {analyze} from '../lib/js-blocks/static-analysis';
import {buildLibraryBlock, nextOpcode, upsertBlock} from '../lib/js-blocks/library-model';
import {setLibraries, updateBlockDraft, closeBlockEditorState} from '../reducers/js-block-libraries';
import {closeJsBlockEditor} from '../reducers/modals';

class LibraryBlockEditor extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleSave', 'handleCancel', 'handleDraftChange', 'lintSource']);
    }
    lintSource (doc) {
        return analyze(doc).diagnostics;
    }
    handleDraftChange (draft) {
        this.props.onDraftChange(draft);
    }
    handleCancel () {
        this.props.onClose();
    }
    handleSave () {
        const {editor, libraries, vm} = this.props;
        const library = libraries.find(lib => lib.id === editor.libraryId);
        if (!library) {
            this.props.onClose();
            return;
        }
        const opcode = editor.opcode || nextOpcode(library);
        const built = buildLibraryBlock(editor.draft, opcode);
        if (!built.ok) return; // Save is disabled in the UI while errors remain.

        const updatedLibrary = upsertBlock(library, built.block);
        vm.addCustomLibrary(updatedLibrary);
        this.props.onSetLibraries(vm.getCustomLibraries().map(lib => lib));
        this.props.onClose();
    }
    render () {
        if (!this.props.editor) return null;
        const errorCount = analyze(this.props.editor.draft)
            .diagnostics.filter(d => d.severity === 'error').length;
        return (
            <LibraryBlockEditorComponent
                draft={this.props.editor.draft}
                errorCount={errorCount}
                lintSource={this.lintSource}
                onCancel={this.handleCancel}
                onDraftChange={this.handleDraftChange}
                onSave={this.handleSave}
            />
        );
    }
}

LibraryBlockEditor.propTypes = {
    editor: PropTypes.shape({
        libraryId: PropTypes.string,
        opcode: PropTypes.string,
        draft: PropTypes.string,
        isNew: PropTypes.bool
    }),
    libraries: PropTypes.arrayOf(PropTypes.object),
    onClose: PropTypes.func,
    onDraftChange: PropTypes.func,
    onSetLibraries: PropTypes.func,
    vm: PropTypes.shape({
        addCustomLibrary: PropTypes.func,
        getCustomLibraries: PropTypes.func
    })
};

const mapStateToProps = state => ({
    editor: state.scratchGui.jsBlockLibraries.editor,
    libraries: state.scratchGui.jsBlockLibraries.libraries,
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onDraftChange: draft => dispatch(updateBlockDraft(draft)),
    onSetLibraries: libraries => dispatch(setLibraries(libraries)),
    onClose: () => {
        dispatch(closeBlockEditorState());
        dispatch(closeJsBlockEditor());
    }
});

export default connect(mapStateToProps, mapDispatchToProps)(LibraryBlockEditor);
