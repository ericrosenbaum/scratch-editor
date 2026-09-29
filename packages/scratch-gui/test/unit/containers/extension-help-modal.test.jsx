/* eslint-env jest */
import React from 'react';
import ReactModal from 'react-modal';
import {screen, fireEvent} from '@testing-library/react';
import {Provider} from 'react-redux';
import configureStore from 'redux-mock-store';
import {renderWithIntl} from '../../helpers/intl-helpers.jsx';

// The example blocks are drawn by scratch-blocks on the editor's workspace,
// neither of which exists here.
jest.mock('../../../src/components/example-blocks/example-blocks.jsx', () => ({
    __esModule: true,
    default: () => null
}));
import ExtensionHelpModal from '../../../src/containers/extension-help-modal.jsx';
import {closeExtensionHelp} from '../../../src/reducers/extension-help';

const makeStore = extensionId => configureStore()({
    locales: {isRtl: false, locale: 'en-US'},
    scratchGui: {
        extensionHelp: {extensionId}
    }
});

const renderWithStore = store => renderWithIntl(
    <Provider store={store}>
        <ExtensionHelpModal />
    </Provider>
);

describe('ExtensionHelpModal Container', () => {
    beforeAll(() => {
        ReactModal.setAppElement(document.body);
    });

    test('renders the help modal registered for the open extension', () => {
        renderWithStore(makeStore('handSensing'));
        expect(screen.getByText('Hand Sensing')).toBeTruthy();
    });

    test('the close button closes the help', () => {
        const store = makeStore('handSensing');
        renderWithStore(store);

        fireEvent.click(screen.getByRole('button', {name: /close/i, hidden: true}));
        expect(store.getActions()).toEqual([closeExtensionHelp()]);
    });

    test('throws when no help modal is registered for the extension', () => {
        // React reports the error it is about to rethrow; keep the output clean.
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => renderWithStore(makeStore('motion')))
            .toThrow('no help modal is registered for extension "motion"');
        consoleError.mockRestore();
    });
});
