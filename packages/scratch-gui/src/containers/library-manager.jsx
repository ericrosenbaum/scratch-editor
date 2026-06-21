import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import LibraryManagerComponent from '../components/library-manager/library-manager.jsx';
import {createLibrary, defaultDocument, removeBlock} from '../lib/js-blocks/library-model';
import {downloadLibrary, parseImportedLibrary} from '../lib/js-blocks/library-io';
import {exampleLibraryList} from '../lib/js-blocks/example-libraries';
import {setLibraries, openBlockEditorState} from '../reducers/js-block-libraries';
import {openJsBlockEditor, closeJsLibraryManager} from '../reducers/modals';

class LibraryManager extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'syncFromVm', 'handleNewLibrary', 'handleDeleteLibrary', 'handleNewBlock',
            'handleEditBlock', 'handleDeleteBlock', 'handleExport', 'handleImport',
            'handleImportFile', 'handleAddExample', 'handleRequestClose'
        ]);
        this.fileInput = null;
        this.examples = exampleLibraryList();
    }
    componentDidMount () {
        this.syncFromVm();
    }
    syncFromVm () {
        this.props.onSetLibraries(this.props.vm.getCustomLibraries().slice());
    }
    handleNewLibrary () {
        // eslint-disable-next-line no-alert
        const name = window.prompt('Name your library:', 'My Library');
        if (name === null) return;
        const library = createLibrary(name);
        this.props.vm.addCustomLibrary(library);
        this.syncFromVm();
    }
    handleDeleteLibrary (libraryId) {
        // eslint-disable-next-line no-alert
        if (!window.confirm('Delete this library and all its blocks?')) return;
        this.props.vm.deleteCustomLibrary(libraryId);
        this.syncFromVm();
    }
    handleNewBlock (libraryId) {
        this.props.onOpenBlockEditor({
            libraryId,
            opcode: null,
            draft: defaultDocument('command'),
            isNew: true
        });
    }
    handleEditBlock (libraryId, block) {
        this.props.onOpenBlockEditor({
            libraryId,
            opcode: block.opcode,
            draft: block.source || '',
            isNew: false
        });
    }
    handleDeleteBlock (libraryId, opcode) {
        const library = this.props.libraries.find(lib => lib.id === libraryId);
        if (!library) return;
        this.props.vm.addCustomLibrary(removeBlock(library, opcode));
        this.syncFromVm();
    }
    handleExport (libraryId) {
        const library = this.props.libraries.find(lib => lib.id === libraryId);
        if (library) downloadLibrary(library);
    }
    handleImport () {
        if (this.fileInput) this.fileInput.click();
    }
    handleImportFile (event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const {library, skipped} = parseImportedLibrary(reader.result);
                this.props.vm.addCustomLibrary(library);
                this.syncFromVm();
                if (skipped.length > 0) {
                    // eslint-disable-next-line no-alert
                    window.alert(`Imported, but skipped ${skipped.length} block(s) that did not pass checks.`);
                }
            } catch (e) {
                // eslint-disable-next-line no-alert
                window.alert(`Could not import: ${e.message}`);
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // allow re-importing the same file
    }
    handleAddExample (name) {
        const example = this.examples.find(ex => ex.name === name);
        if (!example) return;
        this.props.vm.addCustomLibrary(example.build());
        this.syncFromVm();
    }
    handleRequestClose () {
        this.props.onRequestClose();
    }
    render () {
        return (
            <React.Fragment>
                <LibraryManagerComponent
                    examples={this.examples}
                    onAddExample={this.handleAddExample}
                    libraries={this.props.libraries}
                    onDeleteBlock={this.handleDeleteBlock}
                    onDeleteLibrary={this.handleDeleteLibrary}
                    onEditBlock={this.handleEditBlock}
                    onExport={this.handleExport}
                    onImport={this.handleImport}
                    onNewBlock={this.handleNewBlock}
                    onNewLibrary={this.handleNewLibrary}
                    onRequestClose={this.handleRequestClose}
                />
                <input
                    accept=".json,.scratchlib.json,application/json"
                    ref={el => {
                        this.fileInput = el;
                    }}
                    style={{display: 'none'}}
                    type="file"
                    onChange={this.handleImportFile}
                />
            </React.Fragment>
        );
    }
}

LibraryManager.propTypes = {
    libraries: PropTypes.arrayOf(PropTypes.object),
    onOpenBlockEditor: PropTypes.func,
    onRequestClose: PropTypes.func,
    onSetLibraries: PropTypes.func,
    vm: PropTypes.shape({
        addCustomLibrary: PropTypes.func,
        deleteCustomLibrary: PropTypes.func,
        getCustomLibraries: PropTypes.func
    })
};

const mapStateToProps = state => ({
    libraries: state.scratchGui.jsBlockLibraries.libraries,
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onSetLibraries: libraries => dispatch(setLibraries(libraries)),
    onOpenBlockEditor: payload => {
        dispatch(openBlockEditorState(payload));
        dispatch(openJsBlockEditor());
    },
    onRequestClose: () => dispatch(closeJsLibraryManager())
});

export default connect(mapStateToProps, mapDispatchToProps)(LibraryManager);
