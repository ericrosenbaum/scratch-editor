import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import VM from '@scratch/scratch-vm';

import ProcessRecorder from './process-recorder';
import ProcessStorage from './process-storage';
import {installSimulator} from './process-simulator';
import {installDataChecker} from './process-data-checker';

/**
 * Higher Order Component that initializes the ProcessRecorder
 * and passes it as a prop to the wrapped component.
 */
const processRecorderHOC = function (WrappedComponent) {
    class ProcessRecorderWrapper extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'getProcessRecorder',
                'getProcessStorage'
            ]);

            this.storage = new ProcessStorage('local');
            this.recorder = new ProcessRecorder(props.vm, this.storage);

            // Attach recorder to VM so blocks.jsx can call setWorkspace
            props.vm.processRecorder = this.recorder;
        }

        componentDidMount () {
            this.recorder.start();
            installSimulator(this.props.vm, this.storage);
            installDataChecker(this.storage);
        }

        componentDidUpdate (prevProps) {
            if (prevProps.activeTabIndex !== this.props.activeTabIndex) {
                this.recorder.setActiveTab(this.props.activeTabIndex);
            }
        }

        componentWillUnmount () {
            this.recorder.stop();
            this.storage.close();
            delete this.props.vm.processRecorder;
            delete window.__processSimulator;
            delete window.__processDataChecker;
        }

        getProcessRecorder () {
            return this.recorder;
        }

        getProcessStorage () {
            return this.storage;
        }

        render () {
            const {
                /* eslint-disable no-unused-vars */
                activeTabIndex,
                /* eslint-enable no-unused-vars */
                ...componentProps
            } = this.props;

            return (
                <WrappedComponent
                    processRecorder={this.recorder}
                    processStorage={this.storage}
                    {...componentProps}
                />
            );
        }
    }

    ProcessRecorderWrapper.propTypes = {
        activeTabIndex: PropTypes.number.isRequired,
        vm: PropTypes.instanceOf(VM).isRequired
    };

    const mapStateToProps = state => ({
        activeTabIndex: state.scratchGui.editorTab.activeTabIndex,
        vm: state.scratchGui.vm
    });

    return connect(mapStateToProps)(ProcessRecorderWrapper);
};

export default processRecorderHOC;
