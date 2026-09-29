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
import PenTextModal from '../../../src/components/pen-text-modal/pen-text-modal.jsx';
import SoundRemixModal from '../../../src/components/sound-remix-modal/sound-remix-modal.jsx';
import StretchModal from '../../../src/components/stretch-modal/stretch-modal.jsx';

const modals = [
    ['Pen Text', PenTextModal, /use pen text to write on the stage/i, /show a timer/i, /write at an angle/i],
    ['Sound Remix', SoundRemixModal, /use sound remix to play any part/i, /make a sound stutter/i, null],
    ['Stretch', StretchModal, /use stretch to change a sprite's width/i, /squish and spring back/i,
        /reset width and height when the project starts/i]
];

describe.each(modals)('%s help modal', (title, Modal, intro, example, tip) => {
    beforeAll(() => {
        // react-modal renders into a portal and requires an app element
        ReactModal.setAppElement(document.body);
    });

    test('shows the title, intro, example, and tip if it has one', () => {
        renderWithIntl(<Modal onRequestClose={jest.fn()} />);
        expect(screen.getByText(title)).toBeTruthy();
        expect(screen.getByText(intro)).toBeTruthy();
        expect(screen.getByText('TRY IT')).toBeTruthy();
        expect(screen.getByText(example)).toBeTruthy();
        if (tip) {
            expect(screen.getByText('TIP')).toBeTruthy();
            expect(screen.getByText(tip)).toBeTruthy();
        } else {
            expect(screen.queryByText('TIP')).toBeNull();
        }
    });

    test('the close button calls onRequestClose', () => {
        const onRequestClose = jest.fn();
        renderWithIntl(<Modal onRequestClose={onRequestClose} />);
        fireEvent.click(screen.getByRole('button', {name: /close/i, hidden: true}));
        expect(onRequestClose).toHaveBeenCalledTimes(1);
    });
});
