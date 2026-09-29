import HandSensingModal from '../components/hand-sensing-modal/hand-sensing-modal.jsx';
import PenTextModal from '../components/pen-text-modal/pen-text-modal.jsx';
import SoundRemixModal from '../components/sound-remix-modal/sound-remix-modal.jsx';
import StretchModal from '../components/stretch-modal/stretch-modal.jsx';

/**
 * Map of extension id -> the component that renders that extension's
 * in-editor help modal. Adding help for a new extension is one entry here:
 * the modal then opens when the extension is added, and the help button in
 * the blocks palette appears on the extension's category.
 */
const extensionHelpModals = {
    handSensing: HandSensingModal,
    penText: PenTextModal,
    soundRemix: SoundRemixModal,
    stretch: StretchModal
};

/**
 * Get the component that renders an extension's help modal.
 * @param {string} extensionId - the extension id, e.g. 'handSensing'.
 * @returns {?React.Component} the modal component, or null if the extension has no help.
 */
const getExtensionHelpModal = extensionId => (
    Object.prototype.hasOwnProperty.call(extensionHelpModals, extensionId) ?
        extensionHelpModals[extensionId] : null
);

/**
 * Whether an extension has in-editor help available.
 * @param {string} extensionId - the extension id.
 * @returns {boolean} true if help is defined for the extension.
 */
const extensionHasHelp = extensionId => getExtensionHelpModal(extensionId) !== null;

export {
    getExtensionHelpModal,
    extensionHasHelp
};
