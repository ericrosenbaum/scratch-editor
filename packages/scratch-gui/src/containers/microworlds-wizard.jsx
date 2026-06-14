import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from '@scratch/scratch-vm';
import {connect} from 'react-redux';

import MicroworldsWizardComponent from '../components/microworlds-wizard/microworlds-wizard.jsx';
import {SAY_MSG_ID} from '../lib/microworlds/blocks';
import {getCurrentStep, getStepCount} from '../lib/microworlds';
import {activateDeck} from '../reducers/cards';
import {
    microworldNextStep,
    setMicroworldChoice,
    finishMicroworld,
    exitMicroworld
} from '../reducers/microworlds';

// Deck shown after the wizard finishes, dropping the user into the full editor.
const FOLLOW_UP_DECK_ID = 'intro-move-sayhello';

class MicroworldsWizard extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleNext',
            'handleChoose',
            'handleExit',
            'handleScriptGlow',
            'handleGreenFlag',
            'handleProjectChanged',
            'handleTargetsUpdate'
        ]);
        this.state = {canAdvance: false};
        // The step index whose side effects have already been applied.
        this.processedStep = -1;
        // Top block id of the wizard's currently preloaded stack (for removal).
        this.preloadedTopBlockId = null;
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
     * apply any saved choice, capture gate baselines, and reset the gate.
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
            const blocks = step.preload();
            // Replace any previously preloaded wizard stack.
            if (this.preloadedTopBlockId &&
                vm.editingTarget.blocks._blocks[this.preloadedTopBlockId]) {
                vm.editingTarget.blocks.deleteBlock(this.preloadedTopBlockId);
            }
            blocks.forEach(block => vm.editingTarget.blocks.createBlock(block));
            this.preloadedTopBlockId = blocks[0].id;
            this.applyChoice(this.props.savedChoice);
            vm.refreshWorkspace();
        }

        this.blockBaseline = this.countBlocks();
        this.spriteBaseline = this.countSprites();
        this.setState({canAdvance: false});
    }
    applyChoice (value) {
        const {vm} = this.props;
        if (!value || !vm.editingTarget) return;
        const msgBlock = vm.editingTarget.blocks._blocks[SAY_MSG_ID];
        if (msgBlock && msgBlock.fields.TEXT) {
            msgBlock.fields.TEXT.value = value;
        }
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
        if (this.props.step && this.props.step.advanceOn === 'blocksAdded' &&
            this.countBlocks() > this.blockBaseline) {
            this.setState({canAdvance: true});
        }
    }
    handleTargetsUpdate () {
        if (this.props.step && this.props.step.advanceOn === 'spriteAdded' &&
            this.countSprites() > this.spriteBaseline) {
            this.setState({canAdvance: true});
        }
    }
    handleChoose (value) {
        this.props.onSetChoice(this.props.step.id, value);
        this.applyChoice(value);
        this.props.vm.refreshWorkspace();
    }
    handleNext () {
        if (this.props.isLastStep) {
            this.props.onFinish();
        } else {
            this.props.onNextStep();
        }
    }
    handleExit () {
        this.props.onExit();
    }
    render () {
        const {step, stepIndex, stepCount, isLastStep, savedChoice} = this.props;
        if (!step) return null;
        return (
            <MicroworldsWizardComponent
                canAdvance={this.state.canAdvance}
                choices={step.choices || null}
                hint={step.hint}
                isLastStep={isLastStep}
                prompt={step.prompt}
                selectedChoice={savedChoice}
                stepCount={stepCount}
                stepIndex={stepIndex}
                onChoose={this.handleChoose}
                onExit={this.handleExit}
                onNext={this.handleNext}
            />
        );
    }
}

MicroworldsWizard.propTypes = {
    isLastStep: PropTypes.bool,
    onExit: PropTypes.func.isRequired,
    onFinish: PropTypes.func.isRequired,
    onNextStep: PropTypes.func.isRequired,
    onSetChoice: PropTypes.func.isRequired,
    savedChoice: PropTypes.string,
    step: PropTypes.shape({
        id: PropTypes.string,
        prompt: PropTypes.string,
        hint: PropTypes.string,
        advanceOn: PropTypes.string,
        choices: PropTypes.object,
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
        savedChoice: (step && mwState.choices[step.id]) || null
    };
};

const mapDispatchToProps = dispatch => ({
    onNextStep: () => dispatch(microworldNextStep()),
    onSetChoice: (key, value) => dispatch(setMicroworldChoice(key, value)),
    onFinish: () => {
        dispatch(finishMicroworld());
        dispatch(activateDeck(FOLLOW_UP_DECK_ID));
    },
    onExit: () => dispatch(exitMicroworld())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(MicroworldsWizard);
