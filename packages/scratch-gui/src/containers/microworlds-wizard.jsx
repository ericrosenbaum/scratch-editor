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

// Once a step's task is completed, pause briefly so the result is visible
// (the say bubble, the snapped blocks, the new sprite) before advancing.
const AUTO_ADVANCE_MS = 1200;

// Steps whose action runs the project (clicking a block, the green flag) wait
// for that code to finish before advancing. If a thread never actually starts,
// fall back to advancing after this long so the wizard can't stall.
const NO_RUN_FALLBACK_MS = 1000;

class MicroworldsWizard extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleNext',
            'handleScriptGlow',
            'handleGreenFlag',
            'handleProjectChanged',
            'handleTargetsUpdate',
            'handleRunStart',
            'handleRunStop'
        ]);
        // `canAdvance` latches once the step's task is done; `celebrate` flips on
        // only for the pre-advance pause, which is when the confetti burst plays.
        this.state = {canAdvance: false, celebrate: false};
        // The step index whose side effects have already been applied.
        this.processedStep = -1;
        // Whether the current step's advance condition has already been met
        // (latched so a gate that fires repeatedly only advances once).
        this.gateSatisfied = false;
        // Pending auto-advance timer (set when a step's task is completed).
        this.advanceTimeout = null;
        // For code-running steps: true while we're waiting for the project to
        // finish (PROJECT_RUN_STOP) before starting the advance countdown.
        this.awaitingRunStop = false;
        // Fallback timer for code-running steps whose script never starts.
        this.runStartTimeout = null;
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
        vm.on('PROJECT_RUN_START', this.handleRunStart);
        vm.on('PROJECT_RUN_STOP', this.handleRunStop);
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
        vm.removeListener('PROJECT_RUN_START', this.handleRunStart);
        vm.removeListener('PROJECT_RUN_STOP', this.handleRunStop);
        this.clearAdvance();
    }
    /**
     * Whether the current step's action runs the project (clicking a block, the
     * green flag). Those steps must wait for that code to finish before
     * advancing; gates that only rearrange blocks or add a sprite do not.
     * @returns {boolean} true when completing the step runs code
     */
    stepRunsCode () {
        const {step} = this.props;
        return Boolean(step && (step.advanceOn === 'scriptGlow' || step.advanceOn === 'greenFlag'));
    }
    /**
     * Mark the current step's task as complete: reveal the result, then advance.
     * Latched per step so a gate that fires repeatedly only advances once. For
     * code-running steps we hold off the advance until the script finishes
     * (PROJECT_RUN_STOP) so we never cut a say bubble/glide short or reseed the
     * next step mid-run.
     */
    markCanAdvance () {
        if (this.gateSatisfied) return;
        this.gateSatisfied = true;
        this.setState({canAdvance: true});
        if (this.stepRunsCode()) {
            this.awaitingRunStop = true;
            // Guard against a step whose script never starts a thread: advance
            // anyway after a short wait so the wizard can't get stuck.
            this.runStartTimeout = setTimeout(() => {
                this.runStartTimeout = null;
                if (this.awaitingRunStop) {
                    this.awaitingRunStop = false;
                    this.scheduleAdvance();
                }
            }, NO_RUN_FALLBACK_MS);
        } else {
            this.scheduleAdvance();
        }
    }
    /**
     * Start the brief pause before advancing so the result stays visible.
     */
    scheduleAdvance () {
        if (this.advanceTimeout) return;
        // The pause before the next step appears — celebrate the completed step
        // for its duration.
        this.setState({celebrate: true});
        this.advanceTimeout = setTimeout(() => {
            this.advanceTimeout = null;
            this.handleNext();
        }, AUTO_ADVANCE_MS);
    }
    clearAdvance () {
        if (this.advanceTimeout) {
            clearTimeout(this.advanceTimeout);
            this.advanceTimeout = null;
        }
        if (this.runStartTimeout) {
            clearTimeout(this.runStartTimeout);
            this.runStartTimeout = null;
        }
        this.awaitingRunStop = false;
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
        this.gateSatisfied = false;
        this.clearAdvance();
        this.setState({canAdvance: false, celebrate: false});
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
            this.markCanAdvance();
        }
    }
    handleGreenFlag () {
        if (this.props.step && this.props.step.advanceOn === 'greenFlag') {
            this.markCanAdvance();
        }
    }
    handleProjectChanged () {
        const {step} = this.props;
        if (!step) return;
        if (step.advanceOn === 'blocksAdded' && this.countBlocks() > this.blockBaseline) {
            this.markCanAdvance();
        }
        if (step.advanceOn === 'blocksConnected' && this.isConnected(step.connection)) {
            this.markCanAdvance();
        }
    }
    handleRunStart () {
        // The step's script has actually started, so the no-run fallback is no
        // longer needed; PROJECT_RUN_STOP will drive the advance once it ends.
        if (this.awaitingRunStop && this.runStartTimeout) {
            clearTimeout(this.runStartTimeout);
            this.runStartTimeout = null;
        }
    }
    handleRunStop () {
        // The code that completed this step has finished — now start the pause
        // before advancing.
        if (this.awaitingRunStop) {
            this.awaitingRunStop = false;
            this.scheduleAdvance();
        }
    }
    handleTargetsUpdate () {
        // The editing target may not have existed when we first tried to
        // preload (project still loading); retry now that targets are ready.
        this.processStepIfNeeded();
        if (this.props.step && this.props.step.advanceOn === 'spriteAdded' &&
            this.countSprites() > this.spriteBaseline) {
            this.markCanAdvance();
        }
    }
    handleNext () {
        this.clearAdvance();
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
                celebrate={this.state.celebrate}
                clickTarget={step.clickTarget}
                dragHint={step.dragHint}
                isLastStep={isLastStep}
                prompt={step.prompt}
                pulseTarget={step.pulseTarget}
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
        pulseTarget: PropTypes.string,
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
        isLastStep: mwState.step === stepCount - 1
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
