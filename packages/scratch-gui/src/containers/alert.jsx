import React from 'react';
import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import VM from '@scratch/scratch-vm';
import SB3Downloader from './sb3-downloader.jsx';
import AlertComponent from '../components/alerts/alert.jsx';
import {openConnectionModal} from '../reducers/modals';
import {setConnectionModalExtensionId} from '../reducers/connection-modal';
import {manualUpdateProject} from '../reducers/project-state';
import {activateTab, SOUNDS_TAB_INDEX} from '../reducers/editor-tab';
import {closeAlertWithId} from '../reducers/alerts';

class Alert extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleOnCloseAlert',
            'handleOnReconnect',
            'handleJumpToSound'
        ]);
    }
    handleOnCloseAlert () {
        this.props.onCloseAlert(this.props.index);
    }
    handleOnReconnect () {
        this.props.onOpenConnectionModal(this.props.extensionId);
        this.handleOnCloseAlert();
    }
    handleJumpToSound () {
        if (this.props.targetId && this.props.vm.runtime.getTargetById(this.props.targetId)) {
            this.props.vm.setEditingTarget(this.props.targetId);
        }
        this.props.onJumpToSoundsTab();
    }
    render () {
        const {
            alertId,
            closeButton,
            content,
            extensionName,
            level,
            iconSpinner,
            iconURL,
            message,
            onSaveNow,
            showDownload,
            showReconnect,
            showSaveNow,
            soundName,
            spriteName
        } = this.props;
        return (
            <SB3Downloader>{(_, downloadProject) => (
                <AlertComponent
                    alertId={alertId}
                    closeButton={closeButton}
                    content={content}
                    extensionName={extensionName}
                    iconSpinner={iconSpinner}
                    iconURL={iconURL}
                    level={level}
                    message={message}
                    showDownload={showDownload}
                    showReconnect={showReconnect}
                    showSaveNow={showSaveNow}
                    soundName={soundName}
                    spriteName={spriteName}
                    onCloseAlert={this.handleOnCloseAlert}
                    onDownload={downloadProject}
                    onJumpToSound={this.handleJumpToSound}
                    onReconnect={this.handleOnReconnect}
                    onSaveNow={onSaveNow}
                />
            )}</SB3Downloader>
        );
    }
}

const mapStateToProps = state => ({
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onOpenConnectionModal: id => {
        dispatch(setConnectionModalExtensionId(id));
        dispatch(openConnectionModal());
    },
    onSaveNow: () => {
        dispatch(manualUpdateProject());
    },
    onJumpToSoundsTab: () => {
        dispatch(activateTab(SOUNDS_TAB_INDEX));
        dispatch(closeAlertWithId('aiMusicComplete'));
    }
});

Alert.propTypes = {
    alertId: PropTypes.string,
    closeButton: PropTypes.bool,
    content: PropTypes.element,
    extensionId: PropTypes.string,
    extensionName: PropTypes.string,
    iconSpinner: PropTypes.bool,
    iconURL: PropTypes.string,
    index: PropTypes.number,
    level: PropTypes.string.isRequired,
    message: PropTypes.string,
    onCloseAlert: PropTypes.func.isRequired,
    onJumpToSoundsTab: PropTypes.func,
    onOpenConnectionModal: PropTypes.func,
    onSaveNow: PropTypes.func,
    showDownload: PropTypes.bool,
    showReconnect: PropTypes.bool,
    showSaveNow: PropTypes.bool,
    soundName: PropTypes.string,
    spriteName: PropTypes.string,
    targetId: PropTypes.string,
    vm: PropTypes.instanceOf(VM)
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Alert);
