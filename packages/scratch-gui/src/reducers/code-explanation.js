const OPEN_CODE_EXPLANATION = 'scratch-gui/code-explanation/OPEN';
const SET_CODE_EXPLANATION_RESULT = 'scratch-gui/code-explanation/SET_RESULT';
const CLOSE_CODE_EXPLANATION = 'scratch-gui/code-explanation/CLOSE';

const initialState = {
    isOpen: false,
    spriteName: '',
    status: 'idle', // 'idle' | 'loading' | 'done' | 'error'
    text: ''
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case OPEN_CODE_EXPLANATION:
        return Object.assign({}, state, {
            isOpen: true,
            spriteName: action.spriteName,
            status: 'loading',
            text: ''
        });
    case SET_CODE_EXPLANATION_RESULT:
        return Object.assign({}, state, {
            status: action.status,
            text: action.text
        });
    case CLOSE_CODE_EXPLANATION:
        return Object.assign({}, initialState);
    default:
        return state;
    }
};

const openCodeExplanation = function (spriteName) {
    return {type: OPEN_CODE_EXPLANATION, spriteName};
};
const setCodeExplanationResult = function (status, text) {
    return {type: SET_CODE_EXPLANATION_RESULT, status, text};
};
const closeCodeExplanation = function () {
    return {type: CLOSE_CODE_EXPLANATION};
};

export {
    reducer as default,
    initialState as codeExplanationInitialState,
    openCodeExplanation,
    setCodeExplanationResult,
    closeCodeExplanation
};
