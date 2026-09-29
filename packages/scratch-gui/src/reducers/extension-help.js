const OPEN = 'scratch-gui/extension-help/OPEN';
const CLOSE = 'scratch-gui/extension-help/CLOSE';

// The extension whose help modal is open; null while none is.
const initialState = {
    extensionId: null
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case OPEN:
        return Object.assign({}, state, {
            extensionId: action.extensionId
        });
    case CLOSE:
        return Object.assign({}, state, {
            extensionId: null
        });
    default:
        return state;
    }
};

const openExtensionHelp = function (extensionId) {
    return {
        type: OPEN,
        extensionId: extensionId
    };
};

const closeExtensionHelp = function () {
    return {
        type: CLOSE
    };
};

export {
    reducer as default,
    initialState as extensionHelpInitialState,
    openExtensionHelp,
    closeExtensionHelp
};
