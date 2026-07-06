import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, FormattedMessage} from 'react-intl';
import intlShape from '../../lib/intlShape.js';

import Box from '../box/box.jsx';
import Modal from '../modal/modal.jsx';
import starters from './starters.js';

import styles from './popup-examples-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: '3D Pop-Up',
        description: 'Title of the 3D Pop-Up welcome modal',
        id: 'gui.popupExamplesModal.title'
    },
    description: {
        defaultMessage: 'Pop your project into 3D! Drawings stand up as extruded pop-ups, ' +
            'and you can spin the camera around your scene.',
        description: 'One-sentence description of the 3D Pop-Up extension',
        id: 'gui.popupExamplesModal.description'
    },
    chooseProject: {
        defaultMessage: 'Open an example to get started:',
        description: 'Prompt above the row of example projects',
        id: 'gui.popupExamplesModal.chooseProject'
    }
});

class StarterCard extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, ['handleClick', 'handleMouseEnter', 'handleMouseLeave']);
        this.state = {hovered: false};
    }
    handleClick () {
        this.props.onSelect(this.props.starter);
    }
    handleMouseEnter () {
        this.setState({hovered: true});
    }
    handleMouseLeave () {
        this.setState({hovered: false});
    }
    render () {
        const starter = this.props.starter;
        const animate = this.state.hovered && starter.animatedThumbnail;
        return (
            <button
                className={styles.starterCard}
                data-testid="popup-example"
                onClick={this.handleClick}
                onMouseEnter={this.handleMouseEnter}
                onMouseLeave={this.handleMouseLeave}
                onFocus={this.handleMouseEnter}
                onBlur={this.handleMouseLeave}
            >
                <div className={styles.thumbnailWrapper}>
                    {/* Remounting the <img> (via key) restarts the GIF from its
                        first frame on every hover. */}
                    <img
                        key={animate ? 'animated' : 'static'}
                        className={styles.thumbnail}
                        src={animate ? starter.animatedThumbnail : starter.thumbnail}
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
        animatedThumbnail: PropTypes.string,
        description: PropTypes.string,
        thumbnail: PropTypes.string,
        title: PropTypes.string
    }).isRequired
};

const PopupExamplesModal = props => (
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

PopupExamplesModal.propTypes = {
    intl: intlShape.isRequired,
    isRtl: PropTypes.bool,
    onRequestClose: PropTypes.func.isRequired,
    onSelectProject: PropTypes.func.isRequired
};

export default injectIntl(PopupExamplesModal);
