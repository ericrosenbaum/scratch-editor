import PropTypes from 'prop-types';
import React from 'react';

import styles from './help-note.css';

/**
 * A line of small print under the cards of an extension help modal, such as
 * a privacy notice, with an icon beside it.
 */
const HelpNote = props => (
    <p className={styles.note}>
        <img
            className={styles.noteIcon}
            src={props.icon}
            alt=""
            draggable={false}
        />
        {props.children}
    </p>
);

HelpNote.propTypes = {
    children: PropTypes.node.isRequired,
    icon: PropTypes.string.isRequired
};

export default HelpNote;
