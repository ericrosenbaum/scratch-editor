const OPEN_AI_SUGGESTIONS = 'scratch-gui/ai-code-suggestions/OPEN';
const CLOSE_AI_SUGGESTIONS = 'scratch-gui/ai-code-suggestions/CLOSE';
const SET_GENERATING = 'scratch-gui/ai-code-suggestions/SET_GENERATING';
const SET_RESULT = 'scratch-gui/ai-code-suggestions/SET_RESULT';
const SET_ERROR = 'scratch-gui/ai-code-suggestions/SET_ERROR';

const initialState = {
    isOpen: false,
    status: 'idle', // 'idle' | 'generating' | 'done' | 'error'
    generatedBlocks: null, // array of block objects for insertion
    previewText: '',
    error: ''
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case OPEN_AI_SUGGESTIONS:
        return Object.assign({}, state, {
            isOpen: true,
            status: 'idle',
            generatedBlocks: null,
            previewText: '',
            error: ''
        });
    case CLOSE_AI_SUGGESTIONS:
        return Object.assign({}, initialState);
    case SET_GENERATING:
        return Object.assign({}, state, {
            status: 'generating',
            generatedBlocks: null,
            previewText: '',
            error: ''
        });
    case SET_RESULT:
        return Object.assign({}, state, {
            status: 'done',
            generatedBlocks: action.blocks,
            previewText: action.previewText
        });
    case SET_ERROR:
        return Object.assign({}, state, {
            status: 'error',
            error: action.error
        });
    default:
        return state;
    }
};

const openAiSuggestions = function () {
    return {type: OPEN_AI_SUGGESTIONS};
};
const closeAiSuggestions = function () {
    return {type: CLOSE_AI_SUGGESTIONS};
};
const setGenerating = function () {
    return {type: SET_GENERATING};
};
const setResult = function (blocks, previewText) {
    return {type: SET_RESULT, blocks, previewText};
};
const setError = function (error) {
    return {type: SET_ERROR, error};
};

export {
    reducer as default,
    initialState as aiCodeSuggestionsInitialState,
    openAiSuggestions,
    closeAiSuggestions,
    setGenerating,
    setResult,
    setError
};
