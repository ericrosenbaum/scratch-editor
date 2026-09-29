import helpIconUrl from './assets/icon--category-help.svg';
import {extensionHasHelp} from './extension-help';

// Geometry mirrors scratch-blocks' StatusIndicatorLabel so extension header
// buttons all look the same. Sizes are in workspace units; the flyout renders
// at 0.675 scale.
const HEADER_HEIGHT = 40;
const BUTTON_SIZE = 30;
const MARGIN_X = 20;
const MARGIN_Y = 5;
const TOUCH_PADDING = 16;

let helpButtonCallback = null;

/**
 * Set the function invoked when a category help button is clicked.
 * @param {function(string)} callback - receives the extension id.
 */
const setCategoryHelpCallback = callback => {
    helpButtonCallback = callback;
};

let registered = false;

/**
 * Replace the stock 'label' flyout inflater with one that adds a help button
 * next to the category name for extensions that have in-editor help defined
 * (see extension-help.js). All other labels render exactly as stock.
 *
 * Must be called before ScratchBlocks.inject: the flyout caches its inflater
 * instances on first use.
 * @param {ScratchBlocks} ScratchBlocks - the scratch-blocks module.
 */
const registerCategoryHelpLabelInflater = ScratchBlocks => {
    if (registered) return;
    registered = true;

    /**
     * A flyout category header label with a help button to the right of the
     * category name. Mirrors scratch-blocks' StatusIndicatorLabel, which does
     * the same for peripheral extensions' status buttons.
     */
    class CategoryHelpLabel extends ScratchBlocks.FlyoutButton {
        constructor (workspace, targetWorkspace, json, extensionId) {
            super(workspace, targetWorkspace, json, true /* isFlyoutLabel */);
            this.extensionId = extensionId;

            const heightDelta = HEADER_HEIGHT - this.height;
            this.height = HEADER_HEIGHT;
            const text = this.getSvgRoot().querySelector('text');
            if (!text) {
                throw new Error('CategoryHelpLabel: missing flyout text element');
            }
            const previousY = Number(text.getAttribute('y'));
            text.setAttribute('y', `${previousY + (heightDelta / 2)}`);

            const flyout = targetWorkspace.getFlyout();
            const flyoutWidth = flyout ? flyout.getWidth() : 0;
            const buttonX = workspace.RTL ?
                MARGIN_X - flyoutWidth + BUTTON_SIZE :
                (flyoutWidth - BUTTON_SIZE - MARGIN_X) / workspace.scale;

            const icon = ScratchBlocks.utils.dom.createSvgElement(
                'image',
                {
                    class: 'blocklyFlyoutButton categoryHelpIcon',
                    height: `${BUTTON_SIZE}px`,
                    width: `${BUTTON_SIZE}px`,
                    x: `${buttonX}px`,
                    y: `${MARGIN_Y}px`
                },
                this.getSvgRoot()
            );
            icon.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', helpIconUrl);

            const touchTarget = ScratchBlocks.utils.dom.createSvgElement(
                'rect',
                {
                    'class': 'blocklyTouchTargetBackground categoryHelpButton',
                    'data-extension-id': extensionId,
                    'height': `${BUTTON_SIZE + (2 * TOUCH_PADDING)}px`,
                    'width': `${BUTTON_SIZE + (2 * TOUCH_PADDING)}px`,
                    'x': `${buttonX - TOUCH_PADDING}px`,
                    'y': `${MARGIN_Y - TOUCH_PADDING}px`
                },
                this.getSvgRoot()
            );

            this.helpMouseUpWrapper = ScratchBlocks.browserEvents.bind(
                touchTarget, 'mouseup', null, () => {
                    if (helpButtonCallback) helpButtonCallback(this.extensionId);
                }
            );
        }

        dispose () {
            ScratchBlocks.browserEvents.unbind(this.helpMouseUpWrapper);
            super.dispose();
        }
    }

    class CategoryHelpLabelFlyoutInflater extends ScratchBlocks.LabelFlyoutInflater {
        load (state, flyout) {
            const targetWorkspace = flyout.targetWorkspace || flyout.getWorkspace();
            // Plain labels carry no id; resolve the category by its display
            // name to find the extension id, the same way the continuous
            // flyout's own scroll tracking does.
            const toolbox = targetWorkspace.getToolbox && targetWorkspace.getToolbox();
            const category = toolbox && typeof toolbox.getCategoryByName === 'function' ?
                toolbox.getCategoryByName(state.text) : null;
            const extensionId = category ? category.getId() : null;
            if (!extensionId || !extensionHasHelp(extensionId)) {
                return super.load(state, flyout);
            }
            const label = new CategoryHelpLabel(flyout.getWorkspace(), targetWorkspace, state, extensionId);
            label.show();
            // The item type must stay 'label' so the continuous flyout's
            // category scroll tracking recognizes this header.
            return new ScratchBlocks.FlyoutItem(label, 'label');
        }
    }

    // Replace Blockly's stock 'label' inflater, registered at blockly/core
    // module load; allowOverrides makes the replacement (and any re-run) legal.
    ScratchBlocks.registry.register(
        ScratchBlocks.registry.Type.FLYOUT_INFLATER,
        'label',
        CategoryHelpLabelFlyoutInflater,
        true
    );
};

export {
    registerCategoryHelpLabelInflater,
    setCategoryHelpCallback
};
