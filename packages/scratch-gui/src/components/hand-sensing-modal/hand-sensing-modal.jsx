import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, FormattedMessage} from 'react-intl';
import intlShape from '../../lib/intlShape.js';

import ExampleBlocks from '../example-blocks/example-blocks.jsx';
import ExtensionHelpModal from '../extension-help-modal/extension-help-modal.jsx';
import HelpCard from '../extension-help-modal/help-card.jsx';
import HelpNote from '../extension-help-modal/help-note.jsx';

import handSensingIcon from '../../lib/libraries/extensions/handSensing/handSensing-small.svg';
import lockIcon from '../extension-help-modal/icon--lock.svg';
import checkIcon from './icon--check.svg';
import crossIcon from './icon--cross.svg';
import sparkle from './sparkle.svg';
import introPreview from './hand-sensing-intro.webm';
import tooCloseFrame from './camera-view--too-close.svg';
import farEnoughFrame from './camera-view--far-enough.svg';

import styles from './hand-sensing-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Hand Sensing',
        description: 'Title of the Hand Sensing help modal',
        id: 'gui.handSensingModal.title'
    },
    intro: {
        defaultMessage: 'Use Hand Sensing to make finger puppets, paint rainbows, use your hands to play ' +
            'games or make music, or whatever else you can imagine.',
        description: 'One-sentence introduction at the top of the Hand Sensing help modal',
        id: 'gui.handSensingModal.intro'
    },
    exampleTitle: {
        defaultMessage: 'Make a sprite follow your finger',
        description: 'Title of the example script shown in the Hand Sensing help modal',
        id: 'gui.handSensingModal.exampleTitle'
    },
    cameraTip: {
        defaultMessage: 'Make sure to hold your hand far enough back from the camera!',
        description: 'Warning about holding the hand far enough from the camera',
        id: 'gui.handSensingModal.cameraTip'
    },
    tooCloseAlt: {
        defaultMessage: 'Too close to the camera: the hand does not fit in the picture.',
        description: 'Description of the picture of a hand held too close to the camera',
        id: 'gui.handSensingModal.tooCloseAlt'
    },
    farEnoughAlt: {
        defaultMessage: 'Far enough back: the whole hand fits in the picture.',
        description: 'Description of the picture of a hand held far enough from the camera',
        id: 'gui.handSensingModal.farEnoughAlt'
    },
    privacy: {
        defaultMessage: 'None of your camera or Hand Sensing data is stored or sent to Scratch or anywhere else.',
        description: 'Note explaining that hand sensing sends no data anywhere',
        id: 'gui.handSensingModal.privacy'
    }
});

// A forever loop around "go to left index finger": the smallest script that
// makes a sprite follow the user's finger.
const FOLLOW_FINGER_XML = `
<xml>
    <block type="control_forever">
        <statement name="SUBSTACK">
            <block type="handSensing_goToPart">
                <field name="HAND">left</field>
                <field name="PART">index_finger_tip</field>
            </block>
        </statement>
    </block>
</xml>`;

const Sparkle = ({className}) => (
    <img
        className={className}
        src={sparkle}
        alt=""
        aria-hidden
        draggable={false}
    />
);

Sparkle.propTypes = {
    className: PropTypes.string.isRequired
};

// The sparkles from the extension's icon, scattered around the banner.
const sparkles = (
    <React.Fragment>
        <Sparkle className={styles.sparkleA} />
        <Sparkle className={styles.sparkleB} />
        <Sparkle className={styles.sparkleC} />
    </React.Fragment>
);

const HandSensingModal = props => (
    <ExtensionHelpModal
        title={props.intl.formatMessage(messages.title)}
        headerImage={handSensingIcon}
        video={introPreview}
        intro={<FormattedMessage {...messages.intro} />}
        heroDecoration={sparkles}
        isRtl={props.isRtl}
        onRequestClose={props.onRequestClose}
    >
        <HelpCard
            variant="example"
            title={<FormattedMessage {...messages.exampleTitle} />}
        >
            <ExampleBlocks xml={FOLLOW_FINGER_XML} />
        </HelpCard>
        <HelpCard
            variant="tip"
            title={<FormattedMessage {...messages.cameraTip} />}
        >
            <div className={styles.cameraViews}>
                <div className={styles.cameraView}>
                    <img
                        className={styles.cameraViewImage}
                        src={tooCloseFrame}
                        alt={props.intl.formatMessage(messages.tooCloseAlt)}
                        draggable={false}
                    />
                    <span className={styles.badgeBad}>
                        <img
                            className={styles.badgeMark}
                            src={crossIcon}
                            alt=""
                            draggable={false}
                        />
                    </span>
                </div>
                <div className={styles.cameraView}>
                    <img
                        className={styles.cameraViewImage}
                        src={farEnoughFrame}
                        alt={props.intl.formatMessage(messages.farEnoughAlt)}
                        draggable={false}
                    />
                    <span className={styles.badgeGood}>
                        <img
                            className={styles.badgeMark}
                            src={checkIcon}
                            alt=""
                            draggable={false}
                        />
                    </span>
                </div>
            </div>
        </HelpCard>
        <HelpNote icon={lockIcon}>
            <FormattedMessage {...messages.privacy} />
        </HelpNote>
    </ExtensionHelpModal>
);

HandSensingModal.propTypes = {
    intl: intlShape.isRequired,
    isRtl: PropTypes.bool,
    onRequestClose: PropTypes.func.isRequired
};

export default injectIntl(HandSensingModal);
