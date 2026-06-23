/* eslint-env jest */
import React from 'react';
import ReactModal from 'react-modal';
import {fireEvent, screen} from '@testing-library/react';
import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import StarterProjectsModal from '../../../src/components/starter-projects-modal/starter-projects-modal.jsx';
import starters from '../../../src/components/starter-projects-modal/starters.js';

describe('StarterProjectsModal', () => {
    beforeAll(() => {
        // react-modal renders into a portal and requires an app element
        ReactModal.setAppElement(document.body);
    });

    test('shows the title and description', () => {
        renderWithIntl(
            <StarterProjectsModal
                onRequestClose={jest.fn()}
                onSelectProject={jest.fn()}
            />
        );
        expect(screen.getByText('Get Started')).toBeTruthy();
        expect(screen.getByText(/explore the Speech to Text and Q&A extensions/i)).toBeTruthy();
    });

    test('renders the three group headings', () => {
        renderWithIntl(
            <StarterProjectsModal
                onRequestClose={jest.fn()}
                onSelectProject={jest.fn()}
            />
        );
        expect(screen.getByText('Speech to Text')).toBeTruthy();
        expect(screen.getByText('Q&A')).toBeTruthy();
        expect(screen.getByText('Uses both')).toBeTruthy();
    });

    test('renders one card per starter project', () => {
        renderWithIntl(
            <StarterProjectsModal
                onRequestClose={jest.fn()}
                onSelectProject={jest.fn()}
            />
        );
        const cards = screen.getAllByTestId('starter-project');
        expect(cards).toHaveLength(starters.length);
    });

    test('clicking a starter card calls onSelectProject with a loadable starter', () => {
        const onSelectProject = jest.fn();
        renderWithIntl(
            <StarterProjectsModal
                onRequestClose={jest.fn()}
                onSelectProject={onSelectProject}
            />
        );
        fireEvent.click(screen.getAllByTestId('starter-project')[0]);
        expect(onSelectProject).toHaveBeenCalledTimes(1);
        const starter = onSelectProject.mock.calls[0][0];
        // Each starter must carry the data needed to load it.
        expect(starter).toHaveProperty('sb3');
        expect(starter).toHaveProperty('title');
    });

    test('clicking "Start from scratch" closes the modal without loading', () => {
        const onRequestClose = jest.fn();
        const onSelectProject = jest.fn();
        renderWithIntl(
            <StarterProjectsModal
                onRequestClose={onRequestClose}
                onSelectProject={onSelectProject}
            />
        );
        fireEvent.click(screen.getByTestId('start-from-scratch'));
        expect(onRequestClose).toHaveBeenCalledTimes(1);
        expect(onSelectProject).not.toHaveBeenCalled();
    });
});
