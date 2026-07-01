import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, FormattedMessage} from 'react-intl';
import intlShape from '../../lib/intlShape.js';

import Box from '../box/box.jsx';
import Modal from '../modal/modal.jsx';
import starters from './starters.js';

import styles from './songs-examples-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Songs',
        description: 'Title of the Songs examples welcome modal',
        id: 'gui.songsExamplesModal.title'
    },
    description: {
        defaultMessage: 'Make music with the Songs extension! Each example plays a song ' +
            'from the library and uses blocks to bring it to life.',
        description: 'One-sentence description of the Songs extension',
        id: 'gui.songsExamplesModal.description'
    },
    chooseProject: {
        defaultMessage: 'Open an example, then press the green flag:',
        description: 'Prompt above the row of example projects',
        id: 'gui.songsExamplesModal.chooseProject'
    }
});

class StarterCard extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, ['handleClick']);
    }
    handleClick () {
        this.props.onSelect(this.props.starter);
    }
    render () {
        const starter = this.props.starter;
        return (
            <button
                className={styles.starterCard}
                data-testid="songs-example"
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
    onSelect: PropTypes.func.isRequired,
    starter: PropTypes.shape({
        description: PropTypes.string,
        thumbnail: PropTypes.string,
        title: PropTypes.string
    }).isRequired
};

const SongsExamplesModal = props => (
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
                    <StarterCard
                        key={starter.id}
                        starter={starter}
                        onSelect={props.onSelectProject}
                    />
                ))}
            </div>
        </Box>
    </Modal>
);

SongsExamplesModal.propTypes = {
    intl: intlShape.isRequired,
    isRtl: PropTypes.bool,
    onRequestClose: PropTypes.func.isRequired,
    onSelectProject: PropTypes.func.isRequired
};

export default injectIntl(SongsExamplesModal);
