/* eslint-env jest */
import React from 'react';
import ReactModal from 'react-modal';
import {fireEvent, screen} from '@testing-library/react';
import {renderWithIntl} from '../../helpers/intl-helpers.jsx';

// The example blocks are drawn by scratch-blocks on the editor's workspace,
// neither of which exists here.
jest.mock('../../../src/components/example-blocks/example-blocks.jsx', () => ({
    __esModule: true,
    default: () => null
}));
import HandSensingModal from '../../../src/components/hand-sensing-modal/hand-sensing-modal.jsx';

describe('HandSensingModal', () => {
    beforeAll(() => {
        // react-modal renders into a portal and requires an app element
        ReactModal.setAppElement(document.body);
    });

    test('shows the title, intro, both cards, and the privacy note', () => {
        renderWithIntl(
            <HandSensingModal
                onRequestClose={jest.fn()}
            />
        );
        expect(screen.getByText('Hand Sensing')).toBeTruthy();
        expect(screen.getByText(/use hand sensing to make finger puppets/i)).toBeTruthy();
        expect(screen.getByText('TRY IT')).toBeTruthy();
        expect(screen.getByText(/make a sprite follow your finger/i)).toBeTruthy();
        expect(screen.getByText('TIP')).toBeTruthy();
        expect(screen.getByText(/far enough back from the camera/i)).toBeTruthy();
        expect(screen.getByAltText(/too close to the camera/i)).toBeTruthy();
        expect(screen.getByAltText(/the whole hand fits/i)).toBeTruthy();
        expect(screen.getByText(/none of your camera or hand sensing data is stored/i)).toBeTruthy();
    });

    test('the close button calls onRequestClose', () => {
        const onRequestClose = jest.fn();
        renderWithIntl(
            <HandSensingModal
                onRequestClose={onRequestClose}
            />
        );
        fireEvent.click(screen.getByRole('button', {name: /close/i, hidden: true}));
        expect(onRequestClose).toHaveBeenCalledTimes(1);
    });
});
