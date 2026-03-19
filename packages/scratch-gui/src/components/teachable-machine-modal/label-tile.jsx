import PropTypes from 'prop-types';
import classNames from 'classnames';
import React from 'react';
import bindAll from 'lodash.bindall';
import Box from '../box/box.jsx';
import ImageTile from './image-tile.jsx';

import styles from './teachable-machine-modal.css';

class LabelTile extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleEditLabel',
            'handleDeleteLabel'
        ]);
    }
    handleEditLabel () {
        this.props.onEditLabel(this.props.name);
    }
    handleDeleteLabel () {
        this.props.onDeleteLabel(this.props.name);
    }
    render () {
        const isComplete = this.props.exampleCount >= 5;
        return (
            <Box className={classNames(
                styles.labelTile,
                isComplete ? styles.labelTileComplete : styles.labelTileIncomplete
            )}>
                <Box className={styles.verticalLayout}>
                    <Box className={styles.labelTileHeader}>
                        <Box className={styles.labelTileName}>
                            {`${this.props.name} (${this.props.exampleCount} examples)`}
                        </Box>
                        <button onClick={this.handleEditLabel}>{'Edit'}</button>
                        <button onClick={this.handleDeleteLabel}>{'Delete'}</button>
                    </Box>
                    <Box className={styles.examplePreview}>
                        {(this.props.imageData[this.props.name] || []).map((example, idx) => (
                            <Box
                                className={styles.exampleImage}
                                key={idx} // eslint-disable-line react/no-array-index-key
                            >
                                <ImageTile
                                    image={example}
                                    id={idx}
                                    closeButton={false}
                                />
                            </Box>
                        ))}
                        {!isComplete ? (
                            <div className={styles.needsMoreExamples}>{'Needs at least 5 examples!'}</div>
                        ) : null}
                    </Box>
                </Box>
            </Box>
        );
    }
}

LabelTile.propTypes = {
    name: PropTypes.string,
    onEditLabel: PropTypes.func,
    onDeleteLabel: PropTypes.func,
    imageData: PropTypes.object,
    exampleCount: PropTypes.number
};

export default LabelTile;
