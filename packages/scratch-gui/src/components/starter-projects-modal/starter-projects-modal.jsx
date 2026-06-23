import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, FormattedMessage} from 'react-intl';
import intlShape from '../../lib/intlShape.js';

import Box from '../box/box.jsx';
import Modal from '../modal/modal.jsx';
import starters, {SPEECH, QNA, BOTH} from './starters.js';

import styles from './starter-projects-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Get Started',
        description: 'Title of the starter-projects welcome modal',
        id: 'gui.starterProjectsModal.title'
    },
    description: {
        defaultMessage: 'Pick a project to explore the Speech to Text and Q&A extensions, ' +
            'or start from scratch.',
        description: 'One-sentence description in the starter-projects modal',
        id: 'gui.starterProjectsModal.description'
    },
    speechGroup: {
        defaultMessage: 'Speech to Text',
        description: 'Heading for the Speech to Text starter projects',
        id: 'gui.starterProjectsModal.speechGroup'
    },
    qnaGroup: {
        defaultMessage: 'Q&A',
        description: 'Heading for the Q&A starter projects',
        id: 'gui.starterProjectsModal.qnaGroup'
    },
    bothGroup: {
        defaultMessage: 'Uses both',
        description: 'Heading for starter projects that use both extensions',
        id: 'gui.starterProjectsModal.bothGroup'
    },
    startFromScratch: {
        defaultMessage: 'Start from scratch',
        description: 'Button that closes the modal to begin with a blank project',
        id: 'gui.starterProjectsModal.startFromScratch'
    }
});

// Ordered sections rendered in the modal. Each maps a starter `group` to a heading.
const SECTIONS = [
    {group: SPEECH, label: messages.speechGroup},
    {group: QNA, label: messages.qnaGroup},
    {group: BOTH, label: messages.bothGroup}
];

class StarterCard extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, ['handleClick']);
    }
    handleClick () {
        this.props.onSelectProject(this.props.starter);
    }
    render () {
        const {starter} = this.props;
        return (
            <button
                className={styles.starterCard}
                data-testid="starter-project"
                onClick={this.handleClick}
            >
                <div className={styles.thumbnailWrapper}>
                    <img
                        className={styles.thumbnail}
                        src={starter.thumbnail}
                        alt={starter.title}
                        draggable={false}
                    />
                </div>
                <div className={styles.starterTitle}>{starter.title}</div>
                <div className={styles.starterDescription}>{starter.description}</div>
            </button>
        );
    }
}

StarterCard.propTypes = {
    onSelectProject: PropTypes.func.isRequired,
    starter: PropTypes.shape({
        title: PropTypes.string,
        description: PropTypes.string,
        thumbnail: PropTypes.string
    }).isRequired
};

const StarterProjectsModal = props => (
    <Modal
        className={styles.modalContent}
        contentLabel={props.intl.formatMessage(messages.title)}
        isRtl={props.isRtl}
        onRequestClose={props.onRequestClose}
    >
        <Box className={styles.body}>
            <p className={styles.description}>
                <FormattedMessage {...messages.description} />
            </p>
            <div className={styles.sections}>
                {SECTIONS.map(section => {
                    const items = starters.filter(starter => starter.group === section.group);
                    if (items.length === 0) return null;
                    return (
                        <div
                            key={section.group}
                            className={styles.section}
                        >
                            <div className={styles.sectionHeading}>
                                <FormattedMessage {...section.label} />
                            </div>
                            <div className={styles.starterRow}>
                                {items.map(starter => (
                                    <StarterCard
                                        key={starter.id}
                                        starter={starter}
                                        onSelectProject={props.onSelectProject}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className={styles.footer}>
                <button
                    className={styles.startFromScratchButton}
                    data-testid="start-from-scratch"
                    onClick={props.onRequestClose}
                >
                    <FormattedMessage {...messages.startFromScratch} />
                </button>
            </div>
        </Box>
    </Modal>
);

StarterProjectsModal.propTypes = {
    intl: intlShape.isRequired,
    isRtl: PropTypes.bool,
    onRequestClose: PropTypes.func.isRequired,
    onSelectProject: PropTypes.func.isRequired
};

export default injectIntl(StarterProjectsModal);
