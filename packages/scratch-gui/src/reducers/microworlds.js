import {getStepCount} from '../lib/microworlds';

const START = 'scratch-gui/microworlds/START';
const NEXT_STEP = 'scratch-gui/microworlds/NEXT_STEP';
const PREV_STEP = 'scratch-gui/microworlds/PREV_STEP';
const SET_STEP = 'scratch-gui/microworlds/SET_STEP';
const SET_CHOICE = 'scratch-gui/microworlds/SET_CHOICE';
const FINISH = 'scratch-gui/microworlds/FINISH';
const EXIT = 'scratch-gui/microworlds/EXIT';

const initialState = {
    active: false,
    worldId: null,
    step: 0,
    completed: false,
    // Per-step choices the user has made (preserves agency), keyed by step id.
    choices: {}
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case START:
        return Object.assign({}, initialState, {
            active: true,
            worldId: action.worldId,
            step: 0
        });
    case NEXT_STEP: {
        if (!state.active) return state;
        const lastStep = getStepCount(state) - 1;
        // Advancing past the final step finishes the microworld.
        if (state.step >= lastStep) {
            return Object.assign({}, state, {active: false, completed: true});
        }
        return Object.assign({}, state, {step: state.step + 1});
    }
    case PREV_STEP:
        if (!state.active || state.step <= 0) return state;
        return Object.assign({}, state, {step: state.step - 1});
    case SET_STEP: {
        if (!state.active) return state;
        const lastStep = getStepCount(state) - 1;
        const step = Math.max(0, Math.min(action.step, lastStep));
        return Object.assign({}, state, {step});
    }
    case SET_CHOICE:
        return Object.assign({}, state, {
            choices: Object.assign({}, state.choices, {[action.key]: action.value})
        });
    case FINISH:
        return Object.assign({}, state, {active: false, completed: true});
    case EXIT:
        return Object.assign({}, initialState);
    default:
        return state;
    }
};

const startMicroworld = worldId => ({type: START, worldId});
const microworldNextStep = () => ({type: NEXT_STEP});
const microworldPrevStep = () => ({type: PREV_STEP});
const microworldSetStep = step => ({type: SET_STEP, step});
const setMicroworldChoice = (key, value) => ({type: SET_CHOICE, key, value});
const finishMicroworld = () => ({type: FINISH});
const exitMicroworld = () => ({type: EXIT});

export {
    reducer as default,
    initialState as microworldsInitialState,
    startMicroworld,
    microworldNextStep,
    microworldPrevStep,
    microworldSetStep,
    setMicroworldChoice,
    finishMicroworld,
    exitMicroworld
};
