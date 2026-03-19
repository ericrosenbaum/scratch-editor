import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import CloseButton from '../../close-button/close-button.jsx';

import styles from '../teachable-machine-modal.css';

class ImageThumbnail extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'setCanvas',
            'handleDelete'
        ]);
    }
    componentDidUpdate () {
        this.setCanvas(this.canvas);
    }
    setCanvas (canvas) {
        this.canvas = canvas;
        if (this.canvas && this.props.image) {
            const ctx = this.canvas.getContext('2d');
            ctx.putImageData(this.props.image, 0, 0);
        }
    }
    handleDelete () {
        if (this.props.onDelete) {
            this.props.onDelete(this.props.index);
        }
    }
    render () {
        return (
            <div className={styles.imageThumbnail}>
                <canvas
                    height="360"
                    width="480"
                    className={styles.imageThumbnailCanvas}
                    ref={this.setCanvas}
                />
                {this.props.showDelete ? (
                    <CloseButton
                        className={styles.thumbnailDeleteButton}
                        size={CloseButton.SIZE_SMALL}
                        onClick={this.handleDelete}
                    />
                ) : null}
            </div>
        );
    }
}

ImageThumbnail.propTypes = {
    image: PropTypes.instanceOf(ImageData),
    index: PropTypes.number,
    showDelete: PropTypes.bool,
    onDelete: PropTypes.func
};

ImageThumbnail.defaultProps = {
    showDelete: false
};

export default ImageThumbnail;
