const OPEN_UNSTUCK = 'scratch-gui/unstuck/OPEN_UNSTUCK';
const CLOSE_UNSTUCK = 'scratch-gui/unstuck/CLOSE_UNSTUCK';
const SHRINK_EXPAND_UNSTUCK = 'scratch-gui/unstuck/SHRINK_EXPAND_UNSTUCK';
const SET_QUERY = 'scratch-gui/unstuck/SET_QUERY';
const SET_TIP = 'scratch-gui/unstuck/SET_TIP';
const SET_LOADING = 'scratch-gui/unstuck/SET_LOADING';
const DRAG_UNSTUCK = 'scratch-gui/unstuck/DRAG_UNSTUCK';
const START_DRAG = 'scratch-gui/unstuck/START_DRAG';
const END_DRAG = 'scratch-gui/unstuck/END_DRAG';
const TOGGLE_CODE_EXPANDED = 'scratch-gui/unstuck/TOGGLE_CODE_EXPANDED';

const initialState = {
    visible: false,
    activeTipId: null,
    query: '',
    loading: false,
    expanded: true,
    codeExpanded: false,
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
            query: '',
            loading: false,
            expanded: true
        });
    case CLOSE_UNSTUCK:
        return Object.assign({}, state, {
            visible: false
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
            codeExpanded: false
        });
    case TOGGLE_CODE_EXPANDED:
        return Object.assign({}, state, {
            codeExpanded: !state.codeExpanded
        });
    case SET_LOADING:
        return Object.assign({}, state, {
            loading: action.loading
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

const toggleCodeExpanded = function () {
    return {type: TOGGLE_CODE_EXPANDED};
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
    toggleCodeExpanded
};
