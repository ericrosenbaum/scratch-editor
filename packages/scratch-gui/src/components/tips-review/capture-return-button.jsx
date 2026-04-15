/* eslint-disable react/prop-types */
import React from 'react';
import styles from './capture-return-button.css';

const CAPTURE_STATE_KEY = 'scratch-tips-editor-capture-state';

class CaptureReturnButton extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            visible: !!sessionStorage.getItem(CAPTURE_STATE_KEY)
        };
        this.handleClick = this.handleClick.bind(this);
        // Listen for storage changes (in case the key is set/cleared)
        this.checkInterval = null;
    }

    componentDidMount () {
        // Poll sessionStorage since it doesn't fire events in the same tab
        this.checkInterval = setInterval(() => {
            const hasState = !!sessionStorage.getItem(CAPTURE_STATE_KEY);
            if (hasState !== this.state.visible) {
                this.setState({visible: hasState});
            }
        }, 500);
    }

    componentWillUnmount () {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
    }

    handleClick () {
        if (this.props.onOpen) {
            this.props.onOpen();
        }
    }

    render () {
        if (!this.state.visible) return null;

        return (
            <button
                className={styles.captureReturnButton}
                onClick={this.handleClick}
            >
                <span className={styles.captureReturnIcon}>{'\u2190'}</span>
                {'Return to Tips Editor'}
            </button>
        );
    }
}

export default CaptureReturnButton;
