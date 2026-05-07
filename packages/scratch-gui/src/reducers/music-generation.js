const START = 'scratch-gui/music-generation/START';
const SUCCESS = 'scratch-gui/music-generation/SUCCESS';
const ERROR = 'scratch-gui/music-generation/ERROR';
const CLEAR_ERROR = 'scratch-gui/music-generation/CLEAR_ERROR';
const REQUEST_SOUND_SELECTION = 'scratch-gui/music-generation/REQUEST_SOUND_SELECTION';
const CLEAR_SOUND_SELECTION = 'scratch-gui/music-generation/CLEAR_SOUND_SELECTION';
const CLEAR_LAST_RESULT = 'scratch-gui/music-generation/CLEAR_LAST_RESULT';

const initialState = {
    isGenerating: false,
    targetId: null,
    targetName: null,
    prompt: '',
    error: null,
    pendingSoundSelection: null,
    lastResult: null
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
            error: null,
            lastResult: null
        });
    case SUCCESS:
        return Object.assign({}, state, {
            isGenerating: false,
            error: null,
            lastResult: action.result || null
        });
    case ERROR:
        return Object.assign({}, state, {
            isGenerating: false,
            error: action.error
        });
    case CLEAR_ERROR:
        return Object.assign({}, state, {error: null});
    case REQUEST_SOUND_SELECTION:
        return Object.assign({}, state, {
            pendingSoundSelection: {
                targetId: action.targetId,
                soundName: action.soundName
            }
        });
    case CLEAR_SOUND_SELECTION:
        return Object.assign({}, state, {pendingSoundSelection: null});
    case CLEAR_LAST_RESULT:
        return Object.assign({}, state, {lastResult: null});
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

const musicGenerationSuccess = result => ({type: SUCCESS, result: result || null});

const musicGenerationError = error => ({type: ERROR, error});

const clearMusicGenerationError = () => ({type: CLEAR_ERROR});

const requestSoundSelection = ({targetId, soundName}) => ({
    type: REQUEST_SOUND_SELECTION,
    targetId,
    soundName
});

const clearSoundSelection = () => ({type: CLEAR_SOUND_SELECTION});

const clearLastResult = () => ({type: CLEAR_LAST_RESULT});

export {
    reducer as default,
    initialState as musicGenerationInitialState,
    startMusicGeneration,
    musicGenerationSuccess,
    musicGenerationError,
    clearMusicGenerationError,
    requestSoundSelection,
    clearSoundSelection,
    clearLastResult
};
