import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl} from 'react-intl';
import VM from '@scratch/scratch-vm';

import Modal from '../../containers/modal.jsx';
import SongTab from '../../containers/song-tab.jsx';
import intlShape from '../../lib/intlShape.js';

import styles from './song-maker-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Song Maker',
        description: 'Title of the Song Maker editor modal',
        id: 'gui.songMakerModal.title'
    }
});

// Full-screen modal housing the Song Maker editor. Opened from the
// "Open Song Maker" toolbox button at the top of the Songs extension
// category, so the editor gets the whole viewport instead of a tab panel.
const SongMakerModal = props => (
    <Modal
        fullScreen
        className={styles.modalContent}
        contentLabel={props.intl.formatMessage(messages.title)}
        id="songMakerModal"
        onRequestClose={props.onRequestClose}
    >
        <div className={styles.body}>
            <SongTab vm={props.vm} />
        </div>
    </Modal>
);

SongMakerModal.propTypes = {
    intl: intlShape.isRequired,
    onRequestClose: PropTypes.func.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default injectIntl(SongMakerModal);
