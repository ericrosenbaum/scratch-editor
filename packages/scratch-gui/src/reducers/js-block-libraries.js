const SET_LIBRARIES = 'scratch-gui/js-block-libraries/SET_LIBRARIES';
const OPEN_EDITOR = 'scratch-gui/js-block-libraries/OPEN_EDITOR';
const UPDATE_DRAFT = 'scratch-gui/js-block-libraries/UPDATE_DRAFT';
const CLOSE_EDITOR = 'scratch-gui/js-block-libraries/CLOSE_EDITOR';

const initialState = {
    /** Mirror of the VM's installed JS-powered block libraries (source of truth is the VM). */
    libraries: [],
    /** The block currently open in the editor, or null. */
    editor: null
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SET_LIBRARIES:
        return Object.assign({}, state, {libraries: action.libraries});
    case OPEN_EDITOR:
        return Object.assign({}, state, {
            editor: {
                libraryId: action.libraryId,
                opcode: action.opcode, // null when authoring a brand-new block
                draft: action.draft,
                isNew: action.isNew
            }
        });
    case UPDATE_DRAFT:
        if (!state.editor) return state;
        return Object.assign({}, state, {
            editor: Object.assign({}, state.editor, {draft: action.draft})
        });
    case CLOSE_EDITOR:
        return Object.assign({}, state, {editor: null});
    default:
        return state;
    }
};

const setLibraries = libraries => ({type: SET_LIBRARIES, libraries});
const openBlockEditorState = ({libraryId, opcode, draft, isNew}) =>
    ({type: OPEN_EDITOR, libraryId, opcode, draft, isNew});
const updateBlockDraft = draft => ({type: UPDATE_DRAFT, draft});
const closeBlockEditorState = () => ({type: CLOSE_EDITOR});

export {
    reducer as default,
    initialState as jsBlockLibrariesInitialState,
    setLibraries,
    openBlockEditorState,
    updateBlockDraft,
    closeBlockEditorState
};
