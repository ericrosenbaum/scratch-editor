import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from '@scratch/scratch-vm';
import {connect} from 'react-redux';

import MicroworldsWizardComponent from '../components/microworlds-wizard/microworlds-wizard.jsx';
import {getCurrentStep, getStepCount} from '../lib/microworlds';
import {activateDeck} from '../reducers/cards';
import {
    microworldNextStep,
    microworldSetStep,
    finishMicroworld
} from '../reducers/microworlds';

// Deck shown after the wizard finishes, dropping the user into the full editor.
const FOLLOW_UP_DECK_ID = 'intro-move-sayhello';

class MicroworldsWizard extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleNext',
            'handleScriptGlow',
            'handleGreenFlag',
            'handleProjectChanged',
            'handleTargetsUpdate'
        ]);
        this.state = {canAdvance: false};
        // The step index whose side effects have already been applied.
        this.processedStep = -1;
        // Baselines captured on step entry, used by the "added" gates.
        this.blockBaseline = 0;
        this.spriteBaseline = 0;
    }
    componentDidMount () {
        const {vm} = this.props;
        vm.on('SCRIPT_GLOW_ON', this.handleScriptGlow);
        vm.on('PROJECT_START', this.handleGreenFlag);
        vm.on('PROJECT_CHANGED', this.handleProjectChanged);
        vm.on('targetsUpdate', this.handleTargetsUpdate);
        this.processStepIfNeeded();
    }
    componentDidUpdate () {
        this.processStepIfNeeded();
    }
    componentWillUnmount () {
        const {vm} = this.props;
        vm.removeListener('SCRIPT_GLOW_ON', this.handleScriptGlow);
        vm.removeListener('PROJECT_START', this.handleGreenFlag);
        vm.removeListener('PROJECT_CHANGED', this.handleProjectChanged);
        vm.removeListener('targetsUpdate', this.handleTargetsUpdate);
    }
    countBlocks () {
        const target = this.props.vm.editingTarget;
        return target ? Object.keys(target.blocks._blocks).length : 0;
    }
    countSprites () {
        return this.props.vm.runtime.targets.filter(target => !target.isStage).length;
    }
    /**
     * Apply the side effects for the current step exactly once: preload blocks,
     * capture gate baselines, and reset the gate.
     */
    processStepIfNeeded () {
        const {vm, step, stepIndex} = this.props;
        if (!step || stepIndex === this.processedStep) return;
        // Defer until the project (and an editing target) is available.
        if (!vm.editingTarget) return;

        // Mark processed up front so our own refreshWorkspace/createBlock events
        // (which re-enter via componentDidUpdate / VM listeners) don't re-run this.
        this.processedStep = stepIndex;

        if (step.preload) {
            const targetBlocks = vm.editingTarget.blocks;
            // Clear every wizard block (all use the `mw_` prefix) before
            // reseeding. If the user has rearranged a block, the old top-block
            // ids no longer describe the live graph, so a stale block could
            // survive — and since createBlock is a no-op on an existing id, the
            // re-created stack would inherit a dangling/cyclic `next` (which then
            // overflows the stack when the workspace is serialized to XML).
            Object.keys(targetBlocks._blocks)
                .filter(id => id.startsWith('mw_'))
                .forEach(id => {
                    if (targetBlocks._blocks[id]) targetBlocks.deleteBlock(id);
                });
            step.preload().forEach(block => targetBlocks.createBlock(block));
            vm.refreshWorkspace();
        }

        this.blockBaseline = this.countBlocks();
        this.spriteBaseline = this.countSprites();
        this.setState({canAdvance: false});
    }
    /**
     * Whether the two blocks named by a step's `connection` are now joined in a
     * single stack (matched in either direction).
     * @param {?object} connection {parent, child} block ids
     * @returns {boolean} true when connected
     */
    isConnected (connection) {
        if (!connection || !this.props.vm.editingTarget) return false;
        const blocks = this.props.vm.editingTarget.blocks._blocks;
        const {parent, child} = connection;
        const p = blocks[parent];
        const c = blocks[child];
        return Boolean((p && p.next === child) || (c && c.next === parent));
    }
    handleScriptGlow () {
        if (this.props.step && this.props.step.advanceOn === 'scriptGlow') {
            this.setState({canAdvance: true});
        }
    }
    handleGreenFlag () {
        if (this.props.step && this.props.step.advanceOn === 'greenFlag') {
            this.setState({canAdvance: true});
        }
    }
    handleProjectChanged () {
        const {step} = this.props;
        if (!step) return;
        if (step.advanceOn === 'blocksAdded' && this.countBlocks() > this.blockBaseline) {
            this.setState({canAdvance: true});
        }
        if (step.advanceOn === 'blocksConnected' && this.isConnected(step.connection)) {
            this.setState({canAdvance: true});
        }
    }
    handleTargetsUpdate () {
        // The editing target may not have existed when we first tried to
        // preload (project still loading); retry now that targets are ready.
        this.processStepIfNeeded();
        if (this.props.step && this.props.step.advanceOn === 'spriteAdded' &&
            this.countSprites() > this.spriteBaseline) {
            this.setState({canAdvance: true});
        }
    }
    handleNext () {
        if (this.props.isLastStep) {
            this.props.onFinish();
        } else {
            this.props.onNextStep();
        }
    }
    render () {
        const {step, stepIndex, stepCount, isLastStep} = this.props;
        if (!step) return null;
        return (
            <MicroworldsWizardComponent
                canAdvance={this.state.canAdvance}
                clickTarget={step.clickTarget}
                dragHint={step.dragHint}
                isLastStep={isLastStep}
                isRunning={this.props.isRunning}
                prompt={step.prompt}
                stepCount={stepCount}
                stepIndex={stepIndex}
                onGoToStep={this.props.onGoToStep}
                onNext={this.handleNext}
            />
        );
    }
}

MicroworldsWizard.propTypes = {
    isLastStep: PropTypes.bool,
    isRunning: PropTypes.bool,
    onFinish: PropTypes.func.isRequired,
    onGoToStep: PropTypes.func.isRequired,
    onNextStep: PropTypes.func.isRequired,
    step: PropTypes.shape({
        id: PropTypes.string,
        prompt: PropTypes.string,
        advanceOn: PropTypes.string,
        connection: PropTypes.shape({
            parent: PropTypes.string,
            child: PropTypes.string
        }),
        dragHint: PropTypes.object,
        clickTarget: PropTypes.string,
        preload: PropTypes.func
    }),
    stepCount: PropTypes.number,
    stepIndex: PropTypes.number,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => {
    const mwState = state.scratchGui.microworlds;
    const step = getCurrentStep(mwState);
    const stepCount = getStepCount(mwState);
    return {
        step,
        stepIndex: mwState.step,
        stepCount,
        isLastStep: mwState.step === stepCount - 1,
        isRunning: state.scratchGui.vmStatus.running
    };
};

const mapDispatchToProps = dispatch => ({
    onNextStep: () => dispatch(microworldNextStep()),
    onGoToStep: step => dispatch(microworldSetStep(step)),
    onFinish: () => {
        dispatch(finishMicroworld());
        dispatch(activateDeck(FOLLOW_UP_DECK_ID));
    }
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(MicroworldsWizard);
