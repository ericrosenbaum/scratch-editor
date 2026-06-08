/* eslint-env jest */
import React from 'react';
import ReactModal from 'react-modal';
import {screen, fireEvent, waitFor} from '@testing-library/react';
import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import {Provider} from 'react-redux';
import configureStore from 'redux-mock-store';
import HandSensingModal from '../../../src/containers/hand-sensing-modal.jsx';

const SET_PROJECT_TITLE = 'projectTitle/SET_PROJECT_TITLE';
const SET_PROJECT_CHANGED = 'scratch-gui/project-changed/SET_PROJECT_CHANGED';

const makeStore = (projectChanged, vm) => configureStore()({
    locales: {isRtl: false, locale: 'en-US'},
    scratchGui: {
        modals: {handSensingModal: true},
        projectChanged,
        vm
    }
});

describe('HandSensingModal Container', () => {
    let originalFetch;
    let originalConfirm;

    beforeAll(() => {
        ReactModal.setAppElement(document.body);
    });
    beforeEach(() => {
        originalFetch = global.fetch;
        originalConfirm = global.confirm;
        global.fetch = jest.fn(() => Promise.resolve({
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))
        }));
    });
    afterEach(() => {
        global.fetch = originalFetch;
        global.confirm = originalConfirm;
    });

    test('clicking a starter on an unchanged project loads it without a confirm', async () => {
        global.confirm = jest.fn(() => false);
        const vm = {loadProject: jest.fn(() => Promise.resolve())};
        const store = makeStore(false, vm);

        renderWithIntl(
            <Provider store={store}>
                <HandSensingModal />
            </Provider>
        );

        fireEvent.click(screen.getAllByTestId('hand-sensing-starter')[0]);

        await waitFor(() => expect(vm.loadProject).toHaveBeenCalled());
        expect(global.confirm).not.toHaveBeenCalled();
        expect(global.fetch).toHaveBeenCalled();

        const types = store.getActions().map(a => a.type);
        expect(types).toContain(SET_PROJECT_TITLE);
        // Freshly loaded project is marked unchanged (happens on a later tick).
        await waitFor(() => {
            const changedActions = store.getActions()
                .filter(a => a.type === SET_PROJECT_CHANGED && a.changed === false);
            expect(changedActions.length).toBeGreaterThan(0);
        });
    });

    test('clicking a starter with unsaved changes prompts and aborts on cancel', async () => {
        global.confirm = jest.fn(() => false);
        const vm = {loadProject: jest.fn(() => Promise.resolve())};
        const store = makeStore(true, vm);

        renderWithIntl(
            <Provider store={store}>
                <HandSensingModal />
            </Provider>
        );

        fireEvent.click(screen.getAllByTestId('hand-sensing-starter')[0]);

        expect(global.confirm).toHaveBeenCalledTimes(1);
        // User cancelled: nothing should load.
        expect(vm.loadProject).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('clicking a starter with unsaved changes loads it when confirmed', async () => {
        global.confirm = jest.fn(() => true);
        const vm = {loadProject: jest.fn(() => Promise.resolve())};
        const store = makeStore(true, vm);

        renderWithIntl(
            <Provider store={store}>
                <HandSensingModal />
            </Provider>
        );

        fireEvent.click(screen.getAllByTestId('hand-sensing-starter')[0]);

        expect(global.confirm).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(vm.loadProject).toHaveBeenCalled());
    });
});
