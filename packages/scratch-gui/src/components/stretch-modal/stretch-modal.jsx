import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, FormattedMessage} from 'react-intl';
import intlShape from '../../lib/intlShape.js';

import ExampleBlocks from '../example-blocks/example-blocks.jsx';
import ExtensionHelpModal from '../extension-help-modal/extension-help-modal.jsx';
import HelpCard from '../extension-help-modal/help-card.jsx';

import stretchIcon from '../../lib/libraries/extensions/stretch/stretch-small.svg';
import introPreview from './stretch-intro.webm';

const messages = defineMessages({
    title: {
        defaultMessage: 'Stretch',
        description: 'Title of the Stretch help modal',
        id: 'gui.stretchModal.title'
    },
    intro: {
        defaultMessage: 'Use Stretch to change a sprite\'s width and height separately: make a bouncy ball, ' +
            'a wobbly jelly, or a character that breathes in and out.',
        description: 'One-sentence introduction at the top of the Stretch help modal',
        id: 'gui.stretchModal.intro'
    },
    exampleTitle: {
        defaultMessage: 'Make a sprite squish and spring back',
        description: 'Title of the example script shown in the Stretch help modal',
        id: 'gui.stretchModal.exampleTitle'
    },
    resetTip: {
        defaultMessage: 'Stretching stays until you change it, so reset width and height when the project starts.',
        description: 'Tip suggesting resetting the stretch when the green flag is clicked',
        id: 'gui.stretchModal.resetTip'
    }
});

const axisMenu = axis => `
    <value name="AXIS">
        <shadow type="stretch_menu_AXIS"><field name="AXIS">${axis}</field></shadow>
    </value>`;

const number = (name, value) =>
    `<value name="${name}"><shadow type="math_number"><field name="NUM">${value}</field></shadow></value>`;

const wait = next => `
    <block type="control_wait">
        ${number('DURATION', 0.2)}
        ${next ? `<next>${next}</next>` : ''}
    </block>`;

// Squashing flat, then springing back, over and over.
const SQUASH_XML = `
<xml>
    <block type="control_forever">
        <statement name="SUBSTACK">
            <block type="stretch_squish">
                ${axisMenu('height')}
                ${number('AMOUNT', 40)}
                <next>
                    ${wait(`
                        <block type="stretch_resetStretch">
                            <next>${wait()}</next>
                        </block>`)}
                </next>
            </block>
        </statement>
    </block>
</xml>`;

const RESET_XML = `
<xml>
    <block type="event_whenflagclicked">
        <next>
            <block type="stretch_resetStretch"></block>
        </next>
    </block>
</xml>`;

const StretchModal = props => (
    <ExtensionHelpModal
        title={props.intl.formatMessage(messages.title)}
        headerImage={stretchIcon}
        video={introPreview}
        intro={<FormattedMessage {...messages.intro} />}
        isRtl={props.isRtl}
        onRequestClose={props.onRequestClose}
    >
        <HelpCard
            variant="example"
            title={<FormattedMessage {...messages.exampleTitle} />}
        >
            <ExampleBlocks xml={SQUASH_XML} />
        </HelpCard>
        <HelpCard
            variant="tip"
            title={<FormattedMessage {...messages.resetTip} />}
        >
            <ExampleBlocks xml={RESET_XML} />
        </HelpCard>
    </ExtensionHelpModal>
);

StretchModal.propTypes = {
    intl: intlShape.isRequired,
    isRtl: PropTypes.bool,
    onRequestClose: PropTypes.func.isRequired
};

export default injectIntl(StretchModal);
