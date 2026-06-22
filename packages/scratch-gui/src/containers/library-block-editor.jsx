import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import LibraryBlockEditorComponent from '../components/library-block-editor/library-block-editor.jsx';
import {analyze} from '../lib/js-blocks/static-analysis';
import {buildLibraryBlock, nextOpcode, upsertBlock} from '../lib/js-blocks/library-model';
import {buildJsBlockPrompt, stripFences} from '../lib/js-blocks/ai-block-prompt';
import * as aiModelService from '../lib/ai-model-service';
import {setLibraries, updateBlockDraft, closeBlockEditorState} from '../reducers/js-block-libraries';
import {closeJsBlockEditor} from '../reducers/modals';

class LibraryBlockEditor extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleSave', 'handleCancel', 'handleDraftChange', 'lintSource',
            'handlePromptChange', 'handleGenerate'
        ]);
        this.state = {
            promptText: '',
            isGenerating: false,
            generateError: null
        };
    }
    componentDidMount () {
        this._mounted = true;
    }
    componentWillUnmount () {
        // Cancel can unmount us mid-generation; guard the async setState.
        this._mounted = false;
    }
    lintSource (doc) {
        return analyze(doc).diagnostics;
    }
    handleDraftChange (draft) {
        this.props.onDraftChange(draft);
    }
    handlePromptChange (promptText) {
        this.setState({promptText});
    }
    async handleGenerate () {
        const text = this.state.promptText.trim();
        if (!text || this.state.isGenerating) return;
        this.setState({isGenerating: true, generateError: null});
        try {
            // Lazily load the model the first time the user asks to generate.
            if (aiModelService.getStatus() !== 'ready') {
                await aiModelService.init();
            }
            if (aiModelService.getStatus() !== 'ready') {
                throw new Error(
                    'AI model is unavailable on this device (needs WebGPU). Try a desktop Chrome browser.'
                );
            }
            const response = await aiModelService.generate(buildJsBlockPrompt(text));
            const doc = stripFences(response);
            if (this._mounted) this.props.onDraftChange(doc);
        } catch (err) {
            const message = err && err.message === 'cancelled' ?
                'Generation cancelled.' : `Couldn’t generate a block: ${(err && err.message) || err}`;
            if (this._mounted) this.setState({generateError: message});
        } finally {
            if (this._mounted) this.setState({isGenerating: false});
        }
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
                generateError={this.state.generateError}
                isGenerating={this.state.isGenerating}
                lintSource={this.lintSource}
                promptText={this.state.promptText}
                onCancel={this.handleCancel}
                onDraftChange={this.handleDraftChange}
                onGenerate={this.handleGenerate}
                onPromptChange={this.handlePromptChange}
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
