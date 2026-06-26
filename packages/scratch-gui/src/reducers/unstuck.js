const OPEN_UNSTUCK = 'scratch-gui/unstuck/OPEN_UNSTUCK';
const CLOSE_UNSTUCK = 'scratch-gui/unstuck/CLOSE_UNSTUCK';
const SHRINK_EXPAND_UNSTUCK = 'scratch-gui/unstuck/SHRINK_EXPAND_UNSTUCK';
const SET_QUERY = 'scratch-gui/unstuck/SET_QUERY';
const SET_TIP = 'scratch-gui/unstuck/SET_TIP';
const SET_LOADING = 'scratch-gui/unstuck/SET_LOADING';
const DRAG_UNSTUCK = 'scratch-gui/unstuck/DRAG_UNSTUCK';
const START_DRAG = 'scratch-gui/unstuck/START_DRAG';
const END_DRAG = 'scratch-gui/unstuck/END_DRAG';
const SET_SEARCH_RESULTS = 'scratch-gui/unstuck/SET_SEARCH_RESULTS';
const CLEAR_RESULTS = 'scratch-gui/unstuck/CLEAR_RESULTS';
const SET_BROWSE_ALL = 'scratch-gui/unstuck/SET_BROWSE_ALL';
const SET_BROWSE_FILTER = 'scratch-gui/unstuck/SET_BROWSE_FILTER';
const SET_CONTEXT_SUGGESTIONS = 'scratch-gui/unstuck/SET_CONTEXT_SUGGESTIONS';
const SET_PICK_MODE = 'scratch-gui/unstuck/SET_PICK_MODE';

const initialState = {
    visible: false,
    activeTipId: null,
    searchResults: [],
    query: '',
    loading: false,
    expanded: true,
    browseAll: false,
    browseFilter: null,
    contextSuggestions: [],
    pickMode: false,
    x: 0,
    y: 0,
    dragging: false
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case OPEN_UNSTUCK:
        return Object.assign({}, state, {
            visible: true,
            activeTipId: null,
            searchResults: [],
            query: '',
            loading: false,
            expanded: true,
            browseAll: false,
            browseFilter: null,
            contextSuggestions: [],
            pickMode: false
        });
    case CLOSE_UNSTUCK:
        return Object.assign({}, state, {
            visible: false,
            pickMode: false
        });
    case SHRINK_EXPAND_UNSTUCK:
        return Object.assign({}, state, {
            expanded: !state.expanded
        });
    case SET_QUERY:
        return Object.assign({}, state, {
            query: action.query
        });
    case SET_TIP:
        return Object.assign({}, state, {
            activeTipId: action.tipId,
            loading: false,
            pickMode: false
        });
    case SET_SEARCH_RESULTS:
        return Object.assign({}, state, {
            searchResults: action.results,
            activeTipId: null,
            loading: false,
            pickMode: false
        });
    case CLEAR_RESULTS:
        return Object.assign({}, state, {
            searchResults: [],
            activeTipId: null,
            query: '',
            browseAll: false,
            browseFilter: null,
            pickMode: false
        });
    case SET_BROWSE_ALL:
        return Object.assign({}, state, {
            browseAll: action.active,
            browseFilter: null,
            activeTipId: null,
            searchResults: [],
            query: ''
        });
    case SET_BROWSE_FILTER:
        return Object.assign({}, state, {
            browseFilter: action.tag
        });
    case SET_CONTEXT_SUGGESTIONS:
        return Object.assign({}, state, {
            contextSuggestions: action.suggestions
        });
    case SET_LOADING:
        return Object.assign({}, state, {
            loading: action.loading
        });
    case SET_PICK_MODE:
        return Object.assign({}, state, {
            pickMode: !!action.active
        });
    case DRAG_UNSTUCK:
        return Object.assign({}, state, {
            x: action.x,
            y: action.y
        });
    case START_DRAG:
        return Object.assign({}, state, {
            dragging: true
        });
    case END_DRAG:
        return Object.assign({}, state, {
            dragging: false
        });
    default:
        return state;
    }
};

const openUnstuck = function () {
    return {type: OPEN_UNSTUCK};
};

const closeUnstuck = function () {
    return {type: CLOSE_UNSTUCK};
};

const shrinkExpandUnstuck = function () {
    return {type: SHRINK_EXPAND_UNSTUCK};
};

const setQuery = function (query) {
    return {type: SET_QUERY, query};
};

const setTip = function (tipId) {
    return {type: SET_TIP, tipId};
};

const setLoading = function (loading) {
    return {type: SET_LOADING, loading};
};

const dragUnstuck = function (x, y) {
    return {type: DRAG_UNSTUCK, x, y};
};

const startDrag = function () {
    return {type: START_DRAG};
};

const endDrag = function () {
    return {type: END_DRAG};
};

const setSearchResults = function (results) {
    return {type: SET_SEARCH_RESULTS, results};
};

const clearResults = function () {
    return {type: CLEAR_RESULTS};
};

const setBrowseAll = function (active) {
    return {type: SET_BROWSE_ALL, active};
};

const setBrowseFilter = function (tag) {
    return {type: SET_BROWSE_FILTER, tag};
};

const setContextSuggestions = function (suggestions) {
    return {type: SET_CONTEXT_SUGGESTIONS, suggestions};
};

const setPickMode = function (active) {
    return {type: SET_PICK_MODE, active};
};

export {
    reducer as default,
    initialState as unstuckInitialState,
    openUnstuck,
    closeUnstuck,
    shrinkExpandUnstuck,
    setQuery,
    setTip,
    setLoading,
    dragUnstuck,
    startDrag,
    endDrag,
    setSearchResults,
    clearResults,
    setBrowseAll,
    setBrowseFilter,
    setContextSuggestions,
    setPickMode
};
