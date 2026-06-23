/* eslint-env jest */
import modalsReducer, {
    modalsInitialState,
    openStarterProjectsModal,
    closeStarterProjectsModal
} from '../../../src/reducers/modals';

test('initialState opens the starter-projects modal by default', () => {
    expect(modalsReducer(undefined, {type: 'anything'}).starterProjects).toBe(true);
    expect(modalsInitialState.starterProjects).toBe(true);
});

test('closeStarterProjectsModal hides the modal', () => {
    const state = modalsReducer(undefined, {type: 'anything'});
    const next = modalsReducer(state, closeStarterProjectsModal());
    expect(next.starterProjects).toBe(false);
});

test('openStarterProjectsModal shows the modal again', () => {
    const closedState = modalsReducer(undefined, closeStarterProjectsModal());
    const next = modalsReducer(closedState, openStarterProjectsModal());
    expect(next.starterProjects).toBe(true);
});

test('toggling the starter-projects modal does not affect other modals', () => {
    const state = modalsReducer(undefined, {type: 'anything'});
    const next = modalsReducer(state, closeStarterProjectsModal());
    expect(next.connectionModal).toBe(false);
    expect(next.extensionLibrary).toBe(false);
    expect(next.qnaEditor).toBe(false);
});
