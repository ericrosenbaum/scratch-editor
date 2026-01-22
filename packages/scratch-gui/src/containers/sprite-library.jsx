import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {injectIntl, defineMessages} from 'react-intl';
import intlShape from '../lib/intlShape.js';
import VM from '@scratch/scratch-vm';

import spriteLibraryContent from '../lib/libraries/sprites.json';
import randomizeSpritePosition from '../lib/randomize-sprite-position';
import spriteTags from '../lib/libraries/sprite-tags';

import LibraryComponent from '../components/library/library.jsx';

const messages = defineMessages({
    libraryTitle: {
        defaultMessage: 'Choose a Sprite',
        description: 'Heading for the sprite library',
        id: 'gui.spriteLibrary.chooseASprite'
    }
});

class SpriteLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelect'
        ]);
    }
    handleItemSelect (item) {
        try {
            console.log(`[SpriteLibrary] Selecting item: ${JSON.stringify(item)}`);
            // Randomize position of library sprite
            randomizeSpritePosition(item);
            this.props.vm.addSprite(JSON.stringify(item)).then(() => {
                console.log('[SpriteLibrary] Successfully added sprite');
                this.props.onActivateBlocksTab();
            }).catch(e => {
                // Try to extract useful info even if it's a FetchError or similar
                let errorStr = String(e);
                if (typeof e === 'object') {
                    errorStr = JSON.stringify(e, Object.getOwnPropertyNames(e), 2);
                }
                console.error(`[SpriteLibrary] Error adding sprite: ${errorStr}`);
                alert(`Error adding sprite: ${errorStr}`);
            });
        } catch (err) {
            console.error(`[SpriteLibrary] Synchronous error in handleItemSelect: ${err.message}`);
            alert(`Synchronous error in handleItemSelect: ${err.message}`);
        }
    }
    render () {
        return (
            <LibraryComponent
                data={spriteLibraryContent}
                id="spriteLibrary"
                tags={spriteTags}
                title={this.props.intl.formatMessage(messages.libraryTitle)}
                onItemSelected={this.handleItemSelect}
                onRequestClose={this.props.onRequestClose}
            />
        );
    }
}

SpriteLibrary.propTypes = {
    intl: intlShape.isRequired,
    onActivateBlocksTab: PropTypes.func.isRequired,
    onRequestClose: PropTypes.func,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default injectIntl(SpriteLibrary);
