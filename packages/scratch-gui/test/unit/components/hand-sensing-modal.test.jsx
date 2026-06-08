/* eslint-env jest */
import React from 'react';
import ReactModal from 'react-modal';
import {fireEvent, screen} from '@testing-library/react';
import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import HandSensingModal from '../../../src/components/hand-sensing-modal/hand-sensing-modal.jsx';

describe('HandSensingModal', () => {
    beforeAll(() => {
        // react-modal renders into a portal and requires an app element
        ReactModal.setAppElement(document.body);
    });

    test('shows the title and one-sentence description', () => {
        renderWithIntl(
            <HandSensingModal
                onRequestClose={jest.fn()}
                onSelectProject={jest.fn()}
            />
        );
        expect(screen.getByText('Hand Sensing')).toBeTruthy();
        expect(screen.getByText(/sense your hands/i)).toBeTruthy();
    });

    test('renders one card per starter project', () => {
        renderWithIntl(
            <HandSensingModal
                onRequestClose={jest.fn()}
                onSelectProject={jest.fn()}
            />
        );
        const cards = screen.getAllByTestId('hand-sensing-starter');
        expect(cards).toHaveLength(6);
    });

    test('clicking a starter card calls onSelectProject with a loadable starter', () => {
        const onSelectProject = jest.fn();
        renderWithIntl(
            <HandSensingModal
                onRequestClose={jest.fn()}
                onSelectProject={onSelectProject}
            />
        );
        const cards = screen.getAllByTestId('hand-sensing-starter');
        fireEvent.click(cards[0]);
        expect(onSelectProject).toHaveBeenCalledTimes(1);
        const starter = onSelectProject.mock.calls[0][0];
        // Each starter must carry the data needed to load it.
        expect(starter).toHaveProperty('sb3');
        expect(starter).toHaveProperty('title');
    });
});
