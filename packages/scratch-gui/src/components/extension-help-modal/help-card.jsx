import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage} from 'react-intl';

import greenFlagIcon from '../green-flag/icon--green-flag.svg';
import exclamationIcon from './icon--exclamation.svg';

import styles from './help-card.css';

const messages = defineMessages({
    tryIt: {
        defaultMessage: 'TRY IT',
        description: 'Label above an example script in an extension help modal',
        id: 'gui.extensionHelpModal.tryIt'
    },
    tip: {
        defaultMessage: 'TIP',
        description: 'Label above a piece of advice in an extension help modal',
        id: 'gui.extensionHelpModal.tip'
    }
});

// Each kind of card announces itself with an eyebrow: an example script with
// the green flag that runs it, advice with an exclamation mark.
const eyebrows = {
    example: (
        <span className={styles.eyebrow}>
            <img
                className={styles.eyebrowIcon}
                src={greenFlagIcon}
                alt=""
                draggable={false}
            />
            <FormattedMessage {...messages.tryIt} />
        </span>
    ),
    tip: (
        <span className={styles.eyebrow}>
            <span className={styles.eyebrowDot}>
                <img
                    className={styles.eyebrowDotIcon}
                    src={exclamationIcon}
                    alt=""
                    draggable={false}
                />
            </span>
            <FormattedMessage {...messages.tip} />
        </span>
    )
};

/**
 * One card in an extension help modal: an eyebrow label, a title, and the
 * card's content. The children follow the heading in a column; a child with
 * `margin-top: auto` sits at the bottom of the card. A wide card takes a whole
 * row, for example scripts too long to read at half the modal's width.
 */
const HelpCard = props => (
    <div className={classNames(styles.card, styles[props.variant], {[styles.wide]: props.wide})}>
        <div className={styles.cardHeading}>
            {eyebrows[props.variant]}
            <h3 className={styles.cardTitle}>
                {props.title}
            </h3>
        </div>
        {props.children}
    </div>
);

HelpCard.propTypes = {
    children: PropTypes.node,
    title: PropTypes.node.isRequired,
    variant: PropTypes.oneOf(['example', 'tip']).isRequired,
    wide: PropTypes.bool
};

export default HelpCard;
