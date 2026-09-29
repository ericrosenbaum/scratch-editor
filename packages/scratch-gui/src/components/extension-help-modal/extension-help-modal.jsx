import PropTypes from 'prop-types';
import React from 'react';

import Box from '../box/box.jsx';
import Modal from '../modal/modal.jsx';

import styles from './extension-help-modal.css';

/**
 * The shell of an extension's in-editor help modal: the extension's icon and
 * name in the header, a banner introducing the extension with a looping
 * video and one sentence, and a grid of content under it. Each extension
 * fills the grid with its own children, typically HelpCards and a HelpNote.
 */
const ExtensionHelpModal = props => (
    <Modal
        className={styles.modalContent}
        contentLabel={props.title}
        headerImage={props.headerImage}
        isRtl={props.isRtl}
        onRequestClose={props.onRequestClose}
    >
        <Box className={styles.body}>
            <div className={styles.hero}>
                {props.heroDecoration}
                <video
                    className={styles.introPreview}
                    src={props.video}
                    autoPlay
                    loop
                    muted
                    playsInline
                />
                <p className={styles.introText}>
                    {props.intro}
                </p>
            </div>
            <div className={styles.content}>
                {props.children}
            </div>
        </Box>
    </Modal>
);

ExtensionHelpModal.propTypes = {
    children: PropTypes.node,
    headerImage: PropTypes.string.isRequired,
    // Decoration drawn over the banner, positioned relative to it.
    heroDecoration: PropTypes.node,
    intro: PropTypes.node.isRequired,
    isRtl: PropTypes.bool,
    onRequestClose: PropTypes.func.isRequired,
    title: PropTypes.string.isRequired,
    video: PropTypes.string.isRequired
};

export default ExtensionHelpModal;
