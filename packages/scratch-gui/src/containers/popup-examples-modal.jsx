import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {defineMessages, injectIntl} from 'react-intl';
import intlShape from '../lib/intlShape.js';

import log from '../lib/log';
import sharedMessages from '../lib/shared-messages';

import {
    closePopupExamplesModal,
    openLoadingProject,
    closeLoadingProject
} from '../reducers/modals';
import {setProjectTitle} from '../reducers/project-title';
import {setProjectUnchanged} from '../reducers/project-changed';

import PopupExamplesModalComponent from '../components/popup-examples-modal/popup-examples-modal.jsx';

const messages = defineMessages({
    loadError: {
        id: 'gui.popupExamplesModal.loadError',
        defaultMessage: 'The example project failed to load.',
        description: 'Error shown when a 3D Pop-Up example project fails to load.'
    }
});

class PopupExamplesModal extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleSelectProject'
        ]);
    }
    handleSelectProject (starter) {
        // If the project has unsaved changes, confirm before replacing it (matches
        // the "replace project" confirm used by the file uploader).
        if (this.props.projectChanged) {
            const replaceAllowed = confirm( // eslint-disable-line no-alert
                this.props.intl.formatMessage(sharedMessages.replaceProjectWarning)
            );
            if (!replaceAllowed) return;
        }

        this.props.onRequestClose();
        this.props.onLoadingStarted();

        fetch(starter.sb3)
            .then(response => response.arrayBuffer())
            .then(buffer => this.props.vm.loadProject(buffer))
            .then(() => {
                this.props.onSetProjectTitle(starter.title);
                // Mark unchanged on the next tick so we win the race with the VM's
                // PROJECT_CHANGED event (mirrors vm-manager-hoc.jsx).
                setTimeout(() => this.props.onSetProjectUnchanged());
            })
            .catch(error => {
                log.warn(error);
                alert(this.props.intl.formatMessage(messages.loadError)); // eslint-disable-line no-alert
            })
            .then(() => {
                this.props.onLoadingFinished();
            });
    }
    render () {
        if (!this.props.visible) return null;
        return (
            <PopupExamplesModalComponent
                isRtl={this.props.isRtl}
                onRequestClose={this.props.onRequestClose}
                onSelectProject={this.handleSelectProject}
            />
        );
    }
}

PopupExamplesModal.propTypes = {
    intl: intlShape.isRequired,
    isRtl: PropTypes.bool,
    onLoadingFinished: PropTypes.func.isRequired,
    onLoadingStarted: PropTypes.func.isRequired,
    onRequestClose: PropTypes.func.isRequired,
    onSetProjectTitle: PropTypes.func.isRequired,
    onSetProjectUnchanged: PropTypes.func.isRequired,
    projectChanged: PropTypes.bool,
    visible: PropTypes.bool,
    vm: PropTypes.shape({
        loadProject: PropTypes.func
    }).isRequired
};

const mapStateToProps = state => ({
    isRtl: state.locales.isRtl,
    projectChanged: state.scratchGui.projectChanged,
    visible: state.scratchGui.modals.popupExamplesModal,
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onRequestClose: () => dispatch(closePopupExamplesModal()),
    onLoadingStarted: () => dispatch(openLoadingProject()),
    onLoadingFinished: () => dispatch(closeLoadingProject()),
    onSetProjectTitle: title => dispatch(setProjectTitle(title)),
    onSetProjectUnchanged: () => dispatch(setProjectUnchanged())
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(PopupExamplesModal));
