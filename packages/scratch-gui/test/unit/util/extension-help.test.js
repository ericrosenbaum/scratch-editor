import {getExtensionHelpModal, extensionHasHelp} from '../../../src/lib/extension-help';
import HandSensingModal from '../../../src/components/hand-sensing-modal/hand-sensing-modal.jsx';

test('extensionHasHelp is true for the extensions with help modals', () => {
    for (const id of ['handSensing', 'penText', 'soundRemix', 'stretch']) {
        expect(extensionHasHelp(id)).toBe(true);
    }
});

test('extensionHasHelp is false for extensions and categories without help', () => {
    expect(extensionHasHelp('motion')).toBe(false);
    expect(extensionHasHelp('pen')).toBe(false);
    expect(extensionHasHelp('faceSensing')).toBe(false);
});

test('extensionHasHelp does not report inherited object properties as help', () => {
    expect(extensionHasHelp('toString')).toBe(false);
    expect(extensionHasHelp('hasOwnProperty')).toBe(false);
});

test('getExtensionHelpModal returns the hand sensing help modal', () => {
    expect(getExtensionHelpModal('handSensing')).toBe(HandSensingModal);
});

test('getExtensionHelpModal returns null when no help is defined', () => {
    expect(getExtensionHelpModal('motion')).toBe(null);
});
