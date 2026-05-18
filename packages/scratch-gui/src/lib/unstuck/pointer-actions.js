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
import {getPreActionForTarget, getSideForTarget} from './pointer-targets';

let activeDriver = null;
let highlightCleanup = null;
let dismissListener = null;

/**
 * Destroy any active driver highlight.
 */
const destroyHighlight = function () {
    if (dismissListener) {
        window.removeEventListener('pointerdown', dismissListener, true);
        dismissListener = null;
    }
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
 * Install a one-shot global pointerdown listener that dismisses the highlight.
 * The user's click is allowed to propagate (so e.g. clicking the highlighted
 * tab still activates it) — we just tear down the spotlight on top of it.
 */
const installDismissOnPointerdown = function () {
    if (dismissListener) return;
    dismissListener = () => {
        destroyHighlight();
    };
    window.addEventListener('pointerdown', dismissListener, true);
};

/**
 * Execute a preAction before highlighting.
 * PreActions prepare the UI state so the target element is visible.
 * @param {string} preAction - The action name to execute
 * @param {function} dispatch - Redux dispatch function
 * @param {object} vm - Scratch VM instance (needed for target selection)
 * @returns {Promise} Resolves when the action is complete
 */
const executePreAction = function (preAction, dispatch, vm) {
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
    case 'selectStage':
        if (vm) {
            const stage = vm.runtime.getTargetForStage();
            if (stage) vm.setEditingTarget(stage.id);
        }
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
 * Resolves once the flyout's scroll position has been stable for a few frames,
 * indicating ContinuousFlyout's animated scroll has converged.
 * @param {object} flyoutWorkspace - The flyout's Blockly workspace
 * @returns {Promise<void>}
 */
const waitForScrollSettled = function (flyoutWorkspace) {
    return new Promise(resolve => {
        let lastY = flyoutWorkspace.scrollY;
        let stableFrames = 0;
        const tick = () => {
            const y = flyoutWorkspace.scrollY;
            if (y === lastY) {
                stableFrames++;
                if (stableFrames >= 3) {
                    resolve();
                    return;
                }
            } else {
                stableFrames = 0;
                lastY = y;
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
};

/**
 * Select a toolbox category and scroll the flyout to show a specific block.
 *
 * Uses Blockly's APIs directly rather than simulating a click. Clicking would
 * trigger ContinuousToolbox.scrollToCategory, whose RAF-driven animation races
 * with our own scroll adjustment (visible on Safari as a "scroll twice, end up
 * at category top" glitch). selectCategoryByName sets the visual highlight
 * without auto-scrolling, leaving us free to scroll directly to the block.
 *
 * @param {string} category - Toolbox category ID (e.g. 'motion', 'events')
 * @param {string} opcode - Block opcode to find and scroll to
 * @param {function} dispatch - Redux dispatch function
 * @returns {Promise<Element|null>} The block DOM element, or null
 */
const openCategoryAndScrollToBlock = function (category, opcode, dispatch) {
    dispatch(activateTab(BLOCKS_TAB_INDEX));

    return new Promise(resolve => {
        // Wait for tab switch to render before touching the toolbox.
        setTimeout(() => {
            const workspace = ScratchBlocks.getMainWorkspace();
            const toolbox = workspace && workspace.getToolbox();
            const flyout = workspace && workspace.getFlyout();
            if (!workspace || !toolbox || !flyout) {
                resolve(null);
                return;
            }

            const categoryItem = toolbox.getToolboxItems().find(
                item => typeof item.getId === 'function' && item.getId() === category
            );
            if (categoryItem) {
                toolbox.selectCategoryByName(categoryItem.getName());
            }

            const blockElement = findFlyoutBlockElement(opcode);
            if (!blockElement) {
                resolve(null);
                return;
            }

            const flyoutEl = document.querySelector('.blocklyFlyout');
            const flyoutRect = flyoutEl.getBoundingClientRect();
            const blockRect = blockElement.getBoundingClientRect();
            const alreadyVisible =
                blockRect.top >= flyoutRect.top &&
                blockRect.bottom <= flyoutRect.bottom;
            if (alreadyVisible) {
                resolve(blockElement);
                return;
            }

            // Position the block ~1/3 from the top of the flyout.
            // flyout.scrollTo expects workspace units (it multiplies by scale
            // internally); flyoutWorkspace.scrollY is in pixels.
            const flyoutWorkspace = flyout.getWorkspace();
            const currentScrollPx = -flyoutWorkspace.scrollY;
            const blockOffsetFromViewTop = blockRect.top - flyoutRect.top;
            const targetOffsetPx = flyoutRect.height / 3;
            const newScrollPx = Math.max(
                0,
                currentScrollPx + (blockOffsetFromViewTop - targetOffsetPx)
            );
            flyout.scrollTo(newScrollPx / flyoutWorkspace.scale);

            waitForScrollSettled(flyoutWorkspace).then(() => resolve(blockElement));
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
 * - CSS selector: { label, target }
 * - Block opcode: { label, blockOpcode, category }
 *
 * @param {object} pointer - Pointer config from a tip
 * @param {function} dispatch - Redux dispatch function
 * @param {object} [vm] - Scratch VM instance (optional, needed for some preActions)
 */
const highlightElement = function (pointer, dispatch, vm) {
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
                    side: 'right',
                    align: 'center'
                }
            });
            installDismissOnPointerdown();
        });
    } else {
        // CSS-selector-based highlighting
        const doHighlight = function () {
            const element = document.querySelector(pointer.target);
            if (!element) {
                return;
            }

            // Lower Blockly's high-z-index overlays so they don't paint over driver.js.
            // blocklyWidgetDiv (99999) and blocklyTooltipDiv (100000) sit above the
            // driver overlay (10000), so we temporarily bring them below it.
            const blocklyOverlays = document.querySelectorAll(
                '.blocklyWidgetDiv, .blocklyTooltipDiv, .blocklyDropDownDiv'
            );
            const cleanups = [];
            blocklyOverlays.forEach(div => {
                const prevZIndex = div.style.zIndex;
                div.style.zIndex = '0';
                cleanups.push(() => {
                    div.style.zIndex = prevZIndex;
                });
            });

            // Tabs overlap via negative margins, so sibling tabs bleed
            // through the driver.js spotlight cutout. Raise the target
            // above the overlay (z-index 10000) so it covers everything
            // in the cutout, and hide overlapping siblings so they don't
            // show through the spotlight padding area.
            // Only promote to position:relative when the element is statically
            // positioned — overriding an existing absolute/fixed position would
            // visibly shift the element (e.g. the Add Sprite button).
            const prevTargetZIndex = element.style.zIndex;
            element.style.zIndex = '10001';
            const isStatic = window.getComputedStyle(element).position === 'static';
            let restorePosition;
            if (isStatic) {
                const prevTargetPosition = element.style.position;
                element.style.position = 'relative';
                restorePosition = () => {
                    element.style.position = prevTargetPosition;
                };
            }
            cleanups.push(() => {
                element.style.zIndex = prevTargetZIndex;
                if (restorePosition) restorePosition();
            });

            // Hide sibling tabs that overlap into the spotlight cutout.
            // Only applies when the target is inside a tab list (tabs
            // overlap via negative margins).
            const tabList = element.closest('[class*="tab-list"]');
            if (tabList) {
                Array.from(tabList.children).forEach(sibling => {
                    if (sibling === element) return;
                    const prevVisibility = sibling.style.visibility;
                    sibling.style.visibility = 'hidden';
                    cleanups.push(() => {
                        sibling.style.visibility = prevVisibility;
                    });
                });
            }

            if (cleanups.length) {
                highlightCleanup = () => cleanups.forEach(fn => fn());
            }

            activeDriver = createDriver();
            activeDriver.highlight({
                element: pointer.target,
                popover: {
                    title: pointer.label,
                    side: getSideForTarget(pointer.target),
                    align: 'center'
                }
            });
            installDismissOnPointerdown();
        };

        const preAction = getPreActionForTarget(pointer.target);
        if (preAction) {
            executePreAction(preAction, dispatch, vm)
                .then(doHighlight);
        } else {
            doHighlight();
        }
    }
};

export {highlightElement, destroyHighlight};
export default highlightElement;
