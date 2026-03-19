import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import bindAll from 'lodash.bindall';

import Box from '../box/box.jsx';
import ModalVideoManager from '../../lib/video/modal-video-manager.js';

import styles from './teachable-machine-modal.css';

class ExampleEditor extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleGoBack',
            'setCanvas',
            'handleLoaded',
            'handleAccess',
            'handleNewExample',
            'countdown',
            'createNewExamples',
            'takePictures',
            'takeSinglePicture'
        ]);
        this.state = {
            trainInfo: "Press Train when you're ready!",
            intervalHandler: null,
            loaded: false,
            access: false,
            training: false,
            countdown: true,
            multiPicture: true,
            capture: false,
            newExamples: []
        };
    }
    componentWillUnmount () {
        clearInterval(this.state.intervalHandler);
        if (this.videoDevice) {
            this.videoDevice.disableVideo();
        }
    }
    handleGoBack () {
        if (this.videoDevice) {
            this.videoDevice.disableVideo();
        }
        if (this.props.activeLabel in this.props.imageData) {
            this.props.onNewExamples(this.state.newExamples, false);
            this.props.onEditLabel(this.props.activeLabel);
        } else {
            this.props.onNewExamples(this.state.newExamples, true);
            this.props.onEditModel();
        }
    }
    setCanvas (canvas) {
        this.canvas = canvas;
        if (this.canvas) {
            this.videoDevice = new ModalVideoManager(this.canvas);
            this.videoDevice.enableVideo(this.handleAccess, this.handleLoaded);
        }
    }
    handleLoaded () {
        this.setState({loaded: true});
    }
    handleAccess () {
        this.setState({access: true});
    }
    handleNewExample () {
        if (this.state.countdown) {
            this.setState({
                trainInfo: 3,
                training: true,
                intervalHandler: setInterval(this.countdown, 1000)
            });
        } else {
            this.createNewExamples();
        }
    }
    countdown () {
        if (this.state.trainInfo > 1) {
            this.setState({trainInfo: this.state.trainInfo - 1});
        } else {
            clearInterval(this.state.intervalHandler);
            this.createNewExamples();
        }
    }
    createNewExamples () {
        if (this.canvas) {
            if (this.state.multiPicture) {
                this.setState({trainInfo: 'training...'});
                setTimeout(this.takePictures, 200, 10);
            } else {
                this.takeSinglePicture();
            }
        }
    }
    takePictures (numPictures) {
        this.setState({capture: true}, () => {
            const frame = this.videoDevice._videoProvider.getFrame({
                format: 'image-data'
            });
            if (frame) {
                this.setState({newExamples: this.state.newExamples.concat([frame])}, () => {
                    if (numPictures === 1) {
                        setTimeout(this.handleGoBack, 200);
                    } else {
                        setTimeout(this.takePictures, 200, numPictures - 1);
                    }
                });
            }
        });
    }
    takeSinglePicture () {
        this.setState({capture: true}, () => {
            const frame = this.videoDevice._videoProvider.getFrame({
                format: 'image-data'
            });
            if (frame) {
                this.setState({
                    trainInfo: "Press Train when you're ready!",
                    training: false,
                    newExamples: this.state.newExamples.concat([frame])
                });
            }
        });
    }
    render () {
        return (
            <Box className={styles.body}>
                <Box className={styles.activityArea}>
                    <Box className={styles.verticalLayout}>
                        <Box className={styles.instructions}>
                            {this.state.trainInfo}
                        </Box>
                        <Box className={styles.canvasArea}>
                            <canvas
                                className={styles.canvas}
                                height="360"
                                ref={this.setCanvas}
                                width="480"
                            />
                            {this.state.access ? (
                                <div className={classNames(styles.loadingCameraMessage)}>
                                    {this.state.loaded ? null : 'Loading Camera...'}
                                </div>
                            ) : (
                                <div className={classNames(styles.loadingCameraMessage)}>
                                    {'We need your permission to use your camera'}
                                </div>
                            )}
                            {this.state.capture ? (
                                <div
                                    className={styles.flashOverlay}
                                    onAnimationEnd={() => this.setState({capture: false})}
                                />
                            ) : null}
                        </Box>
                        <Box className={classNames(styles.instructions)}>
                            <Box className={classNames(styles.checkbox)}>
                                <input
                                    defaultChecked={this.state.countdown}
                                    type="checkbox"
                                    onChange={() => this.setState({countdown: !this.state.countdown})}
                                />
                                <div>{'Countdown timer'}</div>
                            </Box>
                            <Box className={classNames(styles.checkbox)}>
                                <input
                                    defaultChecked={this.state.multiPicture}
                                    type="checkbox"
                                    onChange={() => this.setState({multiPicture: !this.state.multiPicture})}
                                />
                                <div>{'Take 10 pictures'}</div>
                            </Box>
                        </Box>
                    </Box>
                </Box>
                <Box className={classNames(styles.bottomArea)}>
                    {this.state.training ? null : (
                        <Box className={classNames(styles.bottomAreaItem, styles.buttonRow)}>
                            <button onClick={this.handleNewExample}>{'Train'}</button>
                            <button onClick={this.handleGoBack}>{'Back'}</button>
                        </Box>
                    )}
                </Box>
            </Box>
        );
    }
}

ExampleEditor.propTypes = {
    onEditLabel: PropTypes.func,
    onEditModel: PropTypes.func,
    onNewExamples: PropTypes.func,
    activeLabel: PropTypes.string,
    imageData: PropTypes.object
};

export default ExampleEditor;
