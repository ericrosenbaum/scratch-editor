/**
 * Pointer actions for the "Get Unstuck" feature.
 * Uses driver.js to highlight UI elements with animated popovers.
 */
import {driver} from 'driver.js';
import 'driver.js/dist/driver.css';

import {
    activateTab,
    BLOCKS_TAB_INDEX,
    COSTUMES_TAB_INDEX,
    SOUNDS_TAB_INDEX
} from '../../reducers/editor-tab';

let activeDriver = null;

/**
 * Destroy any active driver highlight.
 */
const destroyHighlight = function () {
    if (activeDriver) {
        activeDriver.destroy();
        activeDriver = null;
    }
};

/**
 * Execute a preAction before highlighting.
 * PreActions prepare the UI state so the target element is visible.
 * @param {string} preAction - The action name to execute
 * @param {function} dispatch - Redux dispatch function
 * @returns {Promise} Resolves when the action is complete
 */
const executePreAction = function (preAction, dispatch) {
    switch (preAction) {
    case 'switchToCodeTab':
        dispatch(activateTab(BLOCKS_TAB_INDEX));
        break;
    case 'switchToCostumesTab':
        dispatch(activateTab(COSTUMES_TAB_INDEX));
        break;
    case 'switchToSoundsTab':
        dispatch(activateTab(SOUNDS_TAB_INDEX));
        break;
    default:
        break;
    }

    // Give the UI time to re-render after the dispatch
    return new Promise(resolve => setTimeout(resolve, 300));
};

/**
 * Highlight a UI element using driver.js.
 * @param {object} pointer - Pointer config from a tip
 * @param {string} pointer.label - Description shown in the popover
 * @param {string} pointer.target - CSS selector for the element to highlight
 * @param {string} [pointer.preAction] - Optional action to execute before highlighting
 * @param {string} [pointer.side] - Popover position: top, right, bottom, left
 * @param {function} dispatch - Redux dispatch function
 */
const highlightElement = function (pointer, dispatch) {
    // Clean up any existing highlight
    destroyHighlight();

    const doHighlight = function () {
        const element = document.querySelector(pointer.target);
        if (!element) {
            return;
        }

        activeDriver = driver({
            animate: true,
            overlayColor: 'rgba(0, 0, 0, 0.5)',
            overlayOpacity: 0.5,
            stagePadding: 8,
            stageRadius: 8,
            allowClose: true,
            showButtons: ['close'],
            popoverClass: 'unstuck-pointer-popover',
            onDestroyed: () => {
                activeDriver = null;
            }
        });

        activeDriver.highlight({
            element: pointer.target,
            popover: {
                title: pointer.label,
                side: pointer.side || 'bottom',
                align: 'center'
            }
        });
    };

    if (pointer.preAction) {
        executePreAction(pointer.preAction, dispatch)
            .then(doHighlight);
    } else {
        doHighlight();
    }
};

export {highlightElement, destroyHighlight};
export default highlightElement;
