import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';

import Box from '../../box/box.jsx';
import ImageThumbnail from '../shared/image-thumbnail.jsx';

import styles from '../teachable-machine-modal.css';

class LabelDetail extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleRename',
            'handleDeleteLabel',
            'handleToggleConfirmDelete'
        ]);
        this.state = {
            confirmingDelete: false
        };
    }
    handleRename (e) {
        const newName = e.target.value.trim();
        if (newName && newName !== this.props.labelName) {
            this.props.onRenameLabel(this.props.labelName, newName);
        }
    }
    handleDeleteLabel () {
        if (this.state.confirmingDelete) {
            this.props.onDeleteLabel(this.props.labelName);
        } else {
            this.setState({confirmingDelete: true});
        }
    }
    handleToggleConfirmDelete () {
        this.setState({confirmingDelete: false});
    }
    render () {
        const imageList = this.props.imageData[this.props.labelName] || [];
        return (
            <Box className={styles.labelDetail}>
                <div className={styles.labelDetailHeader}>
                    <span className={styles.labelDetailLabel}>{'Label: '}</span>
                    <input
                        className={styles.labelNameInput}
                        type="text"
                        defaultValue={this.props.labelName}
                        key={this.props.labelName}
                        onBlur={this.handleRename}
                    />
                </div>
                <div className={styles.labelDetailGrid}>
                    {imageList.map((image, idx) => (
                        <ImageThumbnail
                            key={`detail-${idx}`}
                            image={image}
                            index={idx}
                            showDelete
                            onDelete={this.props.onDeleteExample}
                        />
                    ))}
                </div>
                <div className={styles.labelDetailActions}>
                    {this.state.confirmingDelete ? (
                        <div className={styles.confirmDeleteRow}>
                            <span>{'Are you sure?'}</span>
                            <button
                                className={styles.dangerButton}
                                onClick={this.handleDeleteLabel}
                            >
                                {'Yes, delete'}
                            </button>
                            <button
                                className={styles.secondaryButton}
                                onClick={this.handleToggleConfirmDelete}
                            >
                                {'Cancel'}
                            </button>
                        </div>
                    ) : (
                        <button
                            className={styles.dangerButton}
                            onClick={this.handleDeleteLabel}
                        >
                            {'Delete this label'}
                        </button>
                    )}
                    <button
                        className={styles.secondaryButton}
                        onClick={this.props.onCollapse}
                    >
                        {'Done editing'}
                    </button>
                </div>
            </Box>
        );
    }
}

LabelDetail.propTypes = {
    labelName: PropTypes.string.isRequired,
    imageData: PropTypes.object.isRequired,
    onRenameLabel: PropTypes.func.isRequired,
    onDeleteLabel: PropTypes.func.isRequired,
    onDeleteExample: PropTypes.func.isRequired,
    onCollapse: PropTypes.func.isRequired
};

export default LabelDetail;
