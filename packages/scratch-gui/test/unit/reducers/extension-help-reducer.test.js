/* eslint-env jest */
import extensionHelpReducer, {
    extensionHelpInitialState,
    openExtensionHelp,
    closeExtensionHelp
} from '../../../src/reducers/extension-help';

let defaultState;

test('initialState has no help open', () => {
    expect(extensionHelpReducer(defaultState, {type: 'anything'}).extensionId).toBe(null);
    expect(extensionHelpInitialState.extensionId).toBe(null);
});

test('openExtensionHelp records whose help is open', () => {
    const state = extensionHelpReducer(defaultState, openExtensionHelp('handSensing'));
    expect(state.extensionId).toBe('handSensing');
});

test('closeExtensionHelp closes it again', () => {
    const openState = extensionHelpReducer(defaultState, openExtensionHelp('handSensing'));
    const state = extensionHelpReducer(openState, closeExtensionHelp());
    expect(state.extensionId).toBe(null);
});
