const SET_ANALYZING = 'scratch-gui/qa-analyzing/SET_ANALYZING';

const initialState = false;

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SET_ANALYZING:
        return action.analyzing;
    default:
        return state;
    }
};

const setQaAnalyzing = function (analyzing) {
    return {
        type: SET_ANALYZING,
        analyzing: analyzing
    };
};

export {
    reducer as default,
    initialState as qaAnalyzingInitialState,
    setQaAnalyzing
};
