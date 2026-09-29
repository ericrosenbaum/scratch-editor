import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, FormattedMessage} from 'react-intl';
import intlShape from '../../lib/intlShape.js';

import ExampleBlocks from '../example-blocks/example-blocks.jsx';
import ExtensionHelpModal from '../extension-help-modal/extension-help-modal.jsx';
import HelpCard from '../extension-help-modal/help-card.jsx';

import penTextIcon from './icon--header.svg';
import introPreview from './pen-text-intro.webm';

const messages = defineMessages({
    title: {
        defaultMessage: 'Pen Text',
        description: 'Title of the Pen Text help modal',
        id: 'gui.penTextModal.title'
    },
    intro: {
        defaultMessage: 'Use Pen Text to write on the stage: label a chart, make a greeting card, ' +
            'show a score, or tell a story.',
        description: 'One-sentence introduction at the top of the Pen Text help modal',
        id: 'gui.penTextModal.intro'
    },
    exampleTitle: {
        defaultMessage: 'Show a timer on the stage',
        description: 'Title of the example script shown in the Pen Text help modal',
        id: 'gui.penTextModal.exampleTitle'
    },
    angleTip: {
        defaultMessage: 'Writing starts where the sprite is. Point the sprite in a direction to write at an angle!',
        description: 'Tip explaining that text is written from the sprite, in the direction it points',
        id: 'gui.penTextModal.angleTip'
    }
});

// Erasing and rewriting every frame keeps the timer's text up to date.
const TIMER_XML = `
<xml>
    <block type="control_forever">
        <statement name="SUBSTACK">
            <block type="penText_clear">
                <next>
                    <block type="motion_gotoxy">
                        <value name="X"><shadow type="math_number"><field name="NUM">-200</field></shadow></value>
                        <value name="Y"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
                        <next>
                            <block type="penText_write">
                                <value name="TEXT">
                                    <shadow type="text"><field name="TEXT"></field></shadow>
                                    <block type="sensing_timer"></block>
                                </value>
                            </block>
                        </next>
                    </block>
                </next>
            </block>
        </statement>
    </block>
</xml>`;

const ANGLE_XML = `
<xml>
    <block type="motion_pointindirection">
        <value name="DIRECTION"><shadow type="math_angle"><field name="NUM">45</field></shadow></value>
        <next>
            <block type="penText_write">
                <value name="TEXT"><shadow type="text"><field name="TEXT">Hello!</field></shadow></value>
            </block>
        </next>
    </block>
</xml>`;

const PenTextModal = props => (
    <ExtensionHelpModal
        title={props.intl.formatMessage(messages.title)}
        headerImage={penTextIcon}
        video={introPreview}
        intro={<FormattedMessage {...messages.intro} />}
        isRtl={props.isRtl}
        onRequestClose={props.onRequestClose}
    >
        <HelpCard
            variant="example"
            title={<FormattedMessage {...messages.exampleTitle} />}
        >
            <ExampleBlocks xml={TIMER_XML} />
        </HelpCard>
        <HelpCard
            variant="tip"
            title={<FormattedMessage {...messages.angleTip} />}
        >
            <ExampleBlocks xml={ANGLE_XML} />
        </HelpCard>
    </ExtensionHelpModal>
);

PenTextModal.propTypes = {
    intl: intlShape.isRequired,
    isRtl: PropTypes.bool,
    onRequestClose: PropTypes.func.isRequired
};

export default injectIntl(PenTextModal);
