import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import {closeExtensionHelp} from '../reducers/extension-help';
import {getExtensionHelpModal} from '../lib/extension-help';

const ExtensionHelpModal = props => {
    const HelpModal = getExtensionHelpModal(props.extensionId);
    if (!HelpModal) {
        throw new Error(
            `ExtensionHelpModal: no help modal is registered for extension "${props.extensionId}"`
        );
    }
    return (
        <HelpModal
            isRtl={props.isRtl}
            onRequestClose={props.onRequestClose}
        />
    );
};

ExtensionHelpModal.propTypes = {
    extensionId: PropTypes.string.isRequired,
    isRtl: PropTypes.bool,
    onRequestClose: PropTypes.func.isRequired
};

const mapStateToProps = state => ({
    extensionId: state.scratchGui.extensionHelp.extensionId,
    isRtl: state.locales.isRtl
});

const mapDispatchToProps = dispatch => ({
    onRequestClose: () => dispatch(closeExtensionHelp())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(ExtensionHelpModal);
