import PropTypes from 'prop-types';
import React from 'react';
import styles from './qa-data-modal.css';

class DatasetItem extends React.PureComponent {
    constructor (props) {
        super(props);
        this.handleClick = this.handleClick.bind(this);
    }
    handleClick () {
        this.props.onSelect(this.props.index);
    }
    render () {
        const className = this.props.active ?
            `${styles.datasetItem} ${styles.datasetItemActive}` :
            styles.datasetItem;
        return (
            <button
                className={className}
                onClick={this.handleClick}
            >
                <span className={styles.datasetItemName}>{this.props.name}</span>
            </button>
        );
    }
}

DatasetItem.propTypes = {
    index: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    active: PropTypes.bool.isRequired,
    onSelect: PropTypes.func.isRequired
};

export default DatasetItem;
