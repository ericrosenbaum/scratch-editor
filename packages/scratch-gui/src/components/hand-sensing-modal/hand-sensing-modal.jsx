import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, FormattedMessage} from 'react-intl';
import intlShape from '../../lib/intlShape.js';

import Box from '../box/box.jsx';
import Modal from '../modal/modal.jsx';
import starters from './starters.js';

import styles from './hand-sensing-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Hand Sensing',
        description: 'Title of the Hand Sensing welcome modal',
        id: 'gui.handSensingModal.title'
    },
    description: {
        defaultMessage: 'Use your camera to sense your hands and control sprites with gestures, ' +
            'pinches, and finger movements.',
        description: 'One-sentence description of the Hand Sensing extension',
        id: 'gui.handSensingModal.description'
    },
    chooseProject: {
        defaultMessage: 'Choose a project to get started:',
        description: 'Prompt above the row of starter projects',
        id: 'gui.handSensingModal.chooseProject'
    }
});

const HandSensingModal = props => (
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
            <p className={styles.chooseProject}>
                <FormattedMessage {...messages.chooseProject} />
            </p>
            <div className={styles.starterRow}>
                {starters.map(starter => (
                    <button
                        key={starter.id}
                        className={styles.starterCard}
                        data-testid="hand-sensing-starter"
                        onClick={() => props.onSelectProject(starter)}
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
                ))}
            </div>
        </Box>
    </Modal>
);

HandSensingModal.propTypes = {
    intl: intlShape.isRequired,
    isRtl: PropTypes.bool,
    onRequestClose: PropTypes.func.isRequired,
    onSelectProject: PropTypes.func.isRequired
};

export default injectIntl(HandSensingModal);
