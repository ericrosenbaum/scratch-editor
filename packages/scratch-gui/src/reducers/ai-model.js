const SET_AI_MODEL_STATUS = 'aiModel/SET_STATUS';
const SET_AI_MODEL_PROGRESS = 'aiModel/SET_PROGRESS';
const SET_AI_MODEL_ERROR = 'aiModel/SET_ERROR';

const initialState = {
    status: 'idle', // idle | loading | ready | error | unavailable
    progress: {received: 0, total: 0},
    error: null
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SET_AI_MODEL_STATUS:
        return {...state, status: action.status, error: null};
    case SET_AI_MODEL_PROGRESS:
        return {...state, progress: {received: action.received, total: action.total}};
    case SET_AI_MODEL_ERROR:
        return {...state, status: 'error', error: action.error};
    default:
        return state;
    }
};

const setAiModelStatus = status => ({
    type: SET_AI_MODEL_STATUS,
    status
});

const setAiModelProgress = (received, total) => ({
    type: SET_AI_MODEL_PROGRESS,
    received,
    total
});

const setAiModelError = error => ({
    type: SET_AI_MODEL_ERROR,
    error
});

export {
    reducer as default,
    initialState as aiModelInitialState,
    setAiModelStatus,
    setAiModelProgress,
    setAiModelError
};
