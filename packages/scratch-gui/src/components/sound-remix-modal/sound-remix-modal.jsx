import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, FormattedMessage} from 'react-intl';
import intlShape from '../../lib/intlShape.js';

import ExampleBlocks from '../example-blocks/example-blocks.jsx';
import ExtensionHelpModal from '../extension-help-modal/extension-help-modal.jsx';
import HelpCard from '../extension-help-modal/help-card.jsx';

import soundRemixIcon from '../../lib/libraries/extensions/soundRemix/soundRemix-small.svg';
import introPreview from './sound-remix-intro.webm';

const messages = defineMessages({
    title: {
        defaultMessage: 'Sound Remix',
        description: 'Title of the Sound Remix help modal',
        id: 'gui.soundRemixModal.title'
    },
    intro: {
        defaultMessage: 'Use Sound Remix to play any part of a sound: chop a recording into beats, ' +
            'make a stutter effect, or remix your own voice.',
        description: 'One-sentence introduction at the top of the Sound Remix help modal',
        id: 'gui.soundRemixModal.intro'
    },
    exampleTitle: {
        defaultMessage: 'Make a sound stutter',
        description: 'Title of the example script shown in the Sound Remix help modal',
        id: 'gui.soundRemixModal.exampleTitle'
    }
});

const soundMenu = `
    <value name="SOUND">
        <shadow type="soundRemix_menu_SOUND"><field name="SOUND">Meow</field></shadow>
    </value>`;

const number = (name, value) =>
    `<value name="${name}"><shadow type="math_number"><field name="NUM">${value}</field></shadow></value>`;

// Replaying the first moment of a sound makes it stutter.
const STUTTER_XML = `
<xml>
    <block type="control_repeat">
        ${number('TIMES', 3)}
        <statement name="SUBSTACK">
            <block type="soundRemix_playSoundFromToUntilDone">
                ${soundMenu}
                ${number('START', 0)}
                ${number('END', 0.15)}
            </block>
        </statement>
    </block>
</xml>`;

const SoundRemixModal = props => (
    <ExtensionHelpModal
        title={props.intl.formatMessage(messages.title)}
        headerImage={soundRemixIcon}
        video={introPreview}
        intro={<FormattedMessage {...messages.intro} />}
        isRtl={props.isRtl}
        onRequestClose={props.onRequestClose}
    >
        <HelpCard
            variant="example"
            wide
            title={<FormattedMessage {...messages.exampleTitle} />}
        >
            <ExampleBlocks xml={STUTTER_XML} />
        </HelpCard>
    </ExtensionHelpModal>
);

SoundRemixModal.propTypes = {
    intl: intlShape.isRequired,
    isRtl: PropTypes.bool,
    onRequestClose: PropTypes.func.isRequired
};

export default injectIntl(SoundRemixModal);
