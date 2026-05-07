const START = 'scratch-gui/music-generation/START';
const SUCCESS = 'scratch-gui/music-generation/SUCCESS';
const ERROR = 'scratch-gui/music-generation/ERROR';
const CLEAR_ERROR = 'scratch-gui/music-generation/CLEAR_ERROR';

const initialState = {
    isGenerating: false,
    targetId: null,
    targetName: null,
    prompt: '',
    error: null
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case START:
        return Object.assign({}, state, {
            isGenerating: true,
            targetId: action.targetId,
            targetName: action.targetName,
            prompt: action.prompt,
            error: null
        });
    case SUCCESS:
        return Object.assign({}, state, {
            isGenerating: false,
            error: null
        });
    case ERROR:
        return Object.assign({}, state, {
            isGenerating: false,
            error: action.error
        });
    case CLEAR_ERROR:
        return Object.assign({}, state, {error: null});
    default:
        return state;
    }
};

const startMusicGeneration = ({targetId, targetName, prompt}) => ({
    type: START,
    targetId,
    targetName,
    prompt
});

const musicGenerationSuccess = () => ({type: SUCCESS});

const musicGenerationError = error => ({type: ERROR, error});

const clearMusicGenerationError = () => ({type: CLEAR_ERROR});

export {
    reducer as default,
    initialState as musicGenerationInitialState,
    startMusicGeneration,
    musicGenerationSuccess,
    musicGenerationError,
    clearMusicGenerationError
};
