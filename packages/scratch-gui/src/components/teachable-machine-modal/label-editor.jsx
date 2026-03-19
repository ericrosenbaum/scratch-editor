import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import bindAll from 'lodash.bindall';

import Box from '../box/box.jsx';
import ImageTile from './image-tile.jsx';
import CloseButton from '../close-button/close-button.jsx';

import styles from './teachable-machine-modal.css';

class LabelEditor extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleRenameLabel',
            'handleDeleteLoadedExamples'
        ]);
    }
    handleRenameLabel (e) {
        if (this.props.activeLabel !== e.target.value) {
            this.props.onRenameLabel(this.props.activeLabel, e.target.value);
        }
    }
    handleDeleteLoadedExamples () {
        this.props.onDeleteExample(-1);
    }
    render () {
        const imageList = this.props.imageData[this.props.activeLabel] || [];
        const classifierList = this.props.classifierData[this.props.activeLabel] || [];
        const numLoaded = classifierList.length - imageList.length;
        return (
            <Box className={styles.body}>
                <Box className={styles.activityArea}>
                    <Box className={styles.verticalLayout}>
                        <Box className={styles.exampleViewerText}>
                            {'Label '}
                            <input
                                className={styles.inputField}
                                defaultValue={this.props.activeLabel}
                                type="text"
                                onBlur={this.handleRenameLabel}
                            />
                            {` (${classifierList.length} examples)`}
                        </Box>
                        <Box className={styles.exampleViewerImageContainer}>
                            {numLoaded > 0 ? (
                                <Box className={styles.loadedExamplesBox}>
                                    <CloseButton
                                        className={styles.deleteButton}
                                        size={CloseButton.SIZE_SMALL}
                                        onClick={this.handleDeleteLoadedExamples}
                                    />
                                    {`${numLoaded} examples loaded from file`}
                                </Box>
                            ) : <div />}
                            {imageList.map((example, idx) => (
                                <Box
                                    className={styles.exampleImage}
                                    key={idx} // eslint-disable-line react/no-array-index-key
                                >
                                    <ImageTile
                                        image={example}
                                        id={idx}
                                        closeButton
                                        onDeleteExample={this.props.onDeleteExample}
                                    />
                                </Box>
                            ))}
                        </Box>
                    </Box>
                </Box>
                <Box className={classNames(styles.bottomArea)}>
                    <Box className={classNames(styles.bottomAreaItem, styles.buttonRow)}>
                        <button onClick={this.props.onAddExamples}>{'Add Examples'}</button>
                        <button onClick={this.props.onEditModel}>{'Done'}</button>
                    </Box>
                </Box>
            </Box>
        );
    }
}

LabelEditor.propTypes = {
    onAddExamples: PropTypes.func,
    onDeleteExample: PropTypes.func,
    onEditModel: PropTypes.func,
    onRenameLabel: PropTypes.func,
    activeLabel: PropTypes.string,
    classifierData: PropTypes.object,
    imageData: PropTypes.object
};

export default LabelEditor;
