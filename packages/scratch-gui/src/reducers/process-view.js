const TOGGLE_SESSION = 'scratch-gui/process-view/TOGGLE_SESSION';
const TOGGLE_CHUNK = 'scratch-gui/process-view/TOGGLE_CHUNK';
const SET_FILTER = 'scratch-gui/process-view/SET_FILTER';
const EXPAND_ALL = 'scratch-gui/process-view/EXPAND_ALL';
const COLLAPSE_ALL = 'scratch-gui/process-view/COLLAPSE_ALL';

const processViewInitialState = {
    expandedSessions: {},
    expandedChunks: {},
    filters: {
        coding: true,
        drawing: true,
        sound: true,
        testing: true,
        debugging: true,
        exploring: true
    }
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = processViewInitialState;

    switch (action.type) {
    case TOGGLE_SESSION: {
        const expanded = Object.assign({}, state.expandedSessions);
        expanded[action.sessionId] = !expanded[action.sessionId];
        return Object.assign({}, state, {expandedSessions: expanded});
    }
    case TOGGLE_CHUNK: {
        const expanded = Object.assign({}, state.expandedChunks);
        expanded[action.chunkId] = !expanded[action.chunkId];
        return Object.assign({}, state, {expandedChunks: expanded});
    }
    case SET_FILTER:
        return Object.assign({}, state, {
            filters: Object.assign({}, state.filters, {
                [action.filterName]: action.value
            })
        });
    case EXPAND_ALL:
        return Object.assign({}, state, {
            expandedSessions: action.sessionIds.reduce((acc, id) => {
                acc[id] = true;
                return acc;
            }, {}),
            expandedChunks: action.chunkIds.reduce((acc, id) => {
                acc[id] = true;
                return acc;
            }, {})
        });
    case COLLAPSE_ALL:
        return Object.assign({}, state, {
            expandedSessions: {},
            expandedChunks: {}
        });
    default:
        return state;
    }
};

const toggleSession = sessionId => ({type: TOGGLE_SESSION, sessionId});
const toggleChunk = chunkId => ({type: TOGGLE_CHUNK, chunkId});
const setFilter = (filterName, value) => ({type: SET_FILTER, filterName, value});
const expandAll = (sessionIds, chunkIds) => ({type: EXPAND_ALL, sessionIds, chunkIds});
const collapseAll = () => ({type: COLLAPSE_ALL});

export {
    reducer as default,
    processViewInitialState,
    toggleSession,
    toggleChunk,
    setFilter,
    expandAll,
    collapseAll
};
