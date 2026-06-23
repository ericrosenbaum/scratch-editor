const SET_ANALYZING = 'scratch-gui/speech-recognition/SET_ANALYZING';

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

const setSpeechAnalyzing = function (analyzing) {
    return {
        type: SET_ANALYZING,
        analyzing: analyzing
    };
};

export {
    reducer as default,
    initialState as speechRecognitionInitialState,
    setSpeechAnalyzing
};
