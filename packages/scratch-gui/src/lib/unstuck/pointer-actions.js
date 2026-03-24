/**
 * Pointer actions for the "Get Unstuck" feature.
 * Uses driver.js to highlight UI elements with animated popovers.
 */
import {driver} from 'driver.js';
import 'driver.js/dist/driver.css';
import * as ScratchBlocks from 'scratch-blocks';

import {
    activateTab,
    BLOCKS_TAB_INDEX,
    COSTUMES_TAB_INDEX,
    SOUNDS_TAB_INDEX
} from '../../reducers/editor-tab';

let activeDriver = null;
let highlightCleanup = null;

/**
 * Destroy any active driver highlight.
 */
const destroyHighlight = function () {
    if (highlightCleanup) {
        highlightCleanup();
        highlightCleanup = null;
    }
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
 * If a flyout block is outside the visible flyout area, scroll the flyout
 * so the block is visible.
 * @param {Element} blockElement - The block SVG element in the flyout
 */
const ensureBlockVisible = function (blockElement) {
    const flyoutEl = document.querySelector('.blocklyFlyout');
    if (!flyoutEl) return;

    const flyoutRect = flyoutEl.getBoundingClientRect();
    const blockRect = blockElement.getBoundingClientRect();

    // Already fully visible — nothing to do
    if (blockRect.top >= flyoutRect.top && blockRect.bottom <= flyoutRect.bottom) {
        return;
    }

    const workspace = ScratchBlocks.getMainWorkspace();
    if (!workspace) return;

    const flyout = workspace.getFlyout();
    if (!flyout) return;

    const flyoutWorkspace = flyout.getWorkspace();
    const metrics = flyoutWorkspace.getMetrics();

    // Scroll so the block appears 1/3 from the top of the flyout.
    // viewTop and setY both work in the same coordinate system.
    const blockOffsetFromViewTop = blockRect.top - flyoutRect.top;
    const targetOffset = flyoutRect.height / 3;
    const scrollDelta = blockOffsetFromViewTop - targetOffset;

    flyoutWorkspace.scrollbar.setY(Math.max(0, metrics.viewTop + scrollDelta));
};

/**
 * Simulate a full user click on an element.
 * Blockly toolbox categories require a pointerdown event sequence
 * (not just .click()) to trigger category selection and flyout scrolling.
 * @param {Element} element - The DOM element to click
 */
const simulateClick = function (element) {
    const rect = element.getBoundingClientRect();
    const cx = rect.left + (rect.width / 2);
    const cy = rect.top + (rect.height / 2);
    const eventOpts = {
        bubbles: true,
        cancelable: true,
        clientX: cx,
        clientY: cy,
        button: 0,
        pointerId: 1,
        pointerType: 'mouse'
    };
    element.dispatchEvent(new PointerEvent('pointerdown', eventOpts));
    element.dispatchEvent(new PointerEvent('pointerup', eventOpts));
    element.dispatchEvent(new MouseEvent('mousedown', eventOpts));
    element.dispatchEvent(new MouseEvent('mouseup', eventOpts));
    element.dispatchEvent(new MouseEvent('click', eventOpts));
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
            // Click the category in the toolbox using a full event sequence
            // so Blockly handles the selection and scrolls the flyout
            const categoryElement = document.querySelector(
                `.blocklyToolboxCategory#${category}`
            );
            if (categoryElement) {
                simulateClick(categoryElement);
            }

            // Wait for flyout to scroll to category, then ensure block is visible.
            // After scrolling, wait again so driver.js measures the correct position.
            setTimeout(() => {
                const blockElement = findFlyoutBlockElement(opcode);
                if (blockElement) {
                    ensureBlockVisible(blockElement);
                    // Wait for scroll to settle before resolving
                    setTimeout(() => resolve(blockElement), 200);
                } else {
                    resolve(null);
                }
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
            if (highlightCleanup) {
                highlightCleanup();
                highlightCleanup = null;
            }
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

            // Lower the main Blockly workspace so it doesn't paint over the overlay.
            // There may be multiple .injectionDiv elements (block preview + main workspace),
            // so we target the one inside the blocks component.
            const injectionDivs = document.querySelectorAll('.injectionDiv');
            const cleanups = [];
            injectionDivs.forEach(div => {
                const prevZIndex = div.style.zIndex;
                div.style.zIndex = '-1';
                cleanups.push(() => {
                    div.style.zIndex = prevZIndex;
                });
            });
            if (cleanups.length) {
                highlightCleanup = () => cleanups.forEach(fn => fn());
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
