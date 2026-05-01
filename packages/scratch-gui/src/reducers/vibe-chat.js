const APPEND_TURN = 'scratch-gui/vibe-chat/APPEND_TURN';
const UPDATE_TURN = 'scratch-gui/vibe-chat/UPDATE_TURN';
const SET_STATUS = 'scratch-gui/vibe-chat/SET_STATUS';
const SET_SESSION = 'scratch-gui/vibe-chat/SET_SESSION';
const HYDRATE = 'scratch-gui/vibe-chat/HYDRATE';
const MARK_REVERTED = 'scratch-gui/vibe-chat/MARK_REVERTED';
const RESET = 'scratch-gui/vibe-chat/RESET';

export const vibeChatInitialState = {
    sessionId: null,
    status: 'idle',     // 'idle' | 'thinking' | 'editing' | 'rebuilding' | 'applied' | 'error'
    statusDetail: null,
    turns: []
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = vibeChatInitialState;
    switch (action.type) {
    case HYDRATE:
        return {...vibeChatInitialState, ...action.payload};
    case SET_SESSION:
        return {...state, sessionId: action.sessionId};
    case SET_STATUS:
        return {...state, status: action.status, statusDetail: action.detail || null};
    case APPEND_TURN:
        return {...state, turns: [...state.turns, action.turn]};
    case UPDATE_TURN: {
        const turns = state.turns.map(t =>
            t.turnId === action.turnId ? {...t, ...action.patch} : t
        );
        return {...state, turns};
    }
    case MARK_REVERTED: {
        const turns = state.turns.map(t =>
            t.turnId === action.turnId ?
                {...t, reverted: true, divergedFiles: action.divergedFiles || []} :
                t
        );
        return {...state, turns};
    }
    case RESET:
        return vibeChatInitialState;
    default:
        return state;
    }
};

export default reducer;

export const hydrateVibeChat = payload => ({type: HYDRATE, payload});
export const setVibeSession = sessionId => ({type: SET_SESSION, sessionId});
export const setVibeStatus = (status, detail) => ({type: SET_STATUS, status, detail});
export const appendTurn = turn => ({type: APPEND_TURN, turn});
export const updateTurn = (turnId, patch) => ({type: UPDATE_TURN, turnId, patch});
export const markReverted = (turnId, divergedFiles) => ({
    type: MARK_REVERTED,
    turnId,
    divergedFiles
});
export const resetVibeChat = () => ({type: RESET});
