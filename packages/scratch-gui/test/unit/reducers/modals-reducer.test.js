/* eslint-env jest */
import modalsReducer, {
    modalsInitialState,
    openHandSensingModal,
    closeHandSensingModal
} from '../../../src/reducers/modals';

test('initialState opens the Hand Sensing modal by default', () => {
    expect(modalsReducer(undefined, {type: 'anything'}).handSensingModal).toBe(true);
    expect(modalsInitialState.handSensingModal).toBe(true);
});

test('closeHandSensingModal hides the modal', () => {
    const state = modalsReducer(undefined, {type: 'anything'});
    const next = modalsReducer(state, closeHandSensingModal());
    expect(next.handSensingModal).toBe(false);
});

test('openHandSensingModal shows the modal again', () => {
    const closedState = modalsReducer(undefined, closeHandSensingModal());
    const next = modalsReducer(closedState, openHandSensingModal());
    expect(next.handSensingModal).toBe(true);
});

test('toggling Hand Sensing modal does not affect other modals', () => {
    const state = modalsReducer(undefined, {type: 'anything'});
    const next = modalsReducer(state, closeHandSensingModal());
    expect(next.connectionModal).toBe(false);
    expect(next.extensionLibrary).toBe(false);
});
