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
 * Find a flyout block element in the DOM by its opcode.
 * Block elements have the opcode as their first CSS class.
 * @param {string} opcode - The block opcode (e.g. 'motion_movesteps')
 * @returns {Element|null} The block SVG group element, or null
 */
const findFlyoutBlockElement = function (opcode) {
    return document.querySelector(`.blocklyFlyout .${opcode}.blocklyDraggable`);
};

/**
 * Click a toolbox category and scroll the flyout to show a specific block.
 * @param {string} category - Toolbox category ID (e.g. 'motion', 'events')
 * @param {string} opcode - Block opcode to find and scroll to
 * @param {function} dispatch - Redux dispatch function
 * @returns {Promise<Element|null>} The block DOM element, or null
 */
const openCategoryAndScrollToBlock = function (category, opcode, dispatch) {
    // Switch to code tab
    dispatch(activateTab(BLOCKS_TAB_INDEX));

    return new Promise(resolve => {
        // Wait for tab switch to render
        setTimeout(() => {
            // Click the category in the toolbox
            const categoryElement = document.querySelector(
                `.blocklyToolboxCategory#${category}`
            );
            if (categoryElement) {
                categoryElement.click();
            }

            // Wait for flyout to scroll to category
            setTimeout(() => {
                const blockElement = findFlyoutBlockElement(opcode);
                if (!blockElement) return resolve(null);

                // Check if block is visible in the flyout
                const flyout = document.querySelector('.blocklyFlyout');
                if (flyout) {
                    const flyoutRect = flyout.getBoundingClientRect();
                    const blockRect = blockElement.getBoundingClientRect();

                    // If block is outside the visible flyout, scroll to it
                    if (blockRect.top < flyoutRect.top ||
                        blockRect.bottom > flyoutRect.bottom) {
                        blockElement.scrollIntoView({
                            block: 'center',
                            behavior: 'instant'
                        });
                    }
                }

                resolve(blockElement);
            }, 200);
        }, 300);
    });
};

/**
 * Create a driver.js instance with standard config.
 * @returns {object} driver.js instance
 */
const createDriver = function () {
    return driver({
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
};

/**
 * Highlight a UI element using driver.js.
 *
 * Supports two pointer shapes:
 * - CSS selector: { label, target, preAction?, side? }
 * - Block opcode: { label, blockOpcode, category, side? }
 *
 * @param {object} pointer - Pointer config from a tip
 * @param {function} dispatch - Redux dispatch function
 */
const highlightElement = function (pointer, dispatch) {
    // Clean up any existing highlight
    destroyHighlight();

    if (pointer.blockOpcode) {
        // Block-targeting pointer: open category and highlight the block
        openCategoryAndScrollToBlock(
            pointer.category,
            pointer.blockOpcode,
            dispatch
        ).then(blockElement => {
            if (!blockElement) return;

            activeDriver = createDriver();
            activeDriver.highlight({
                element: blockElement,
                popover: {
                    title: pointer.label,
                    side: pointer.side || 'right',
                    align: 'center'
                }
            });
        });
    } else {
        // CSS-selector-based highlighting
        const doHighlight = function () {
            const element = document.querySelector(pointer.target);
            if (!element) {
                return;
            }

            activeDriver = createDriver();
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
    }
};

export {highlightElement, destroyHighlight};
export default highlightElement;
