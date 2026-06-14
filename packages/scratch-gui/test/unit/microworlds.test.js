import microworldsReducer, {
    microworldsInitialState,
    startMicroworld,
    microworldNextStep,
    microworldPrevStep,
    setMicroworldChoice,
    finishMicroworld,
    exitMicroworld
} from '../../src/reducers/microworlds';
import {
    getCurrentStep,
    getReveal,
    getPalette,
    getStepCount
} from '../../src/lib/microworlds';
import {buildSayStack, HAT_ID, SAY_ID, SAY_MSG_ID} from '../../src/lib/microworlds/blocks';
import filterToolboxXML from '../../src/lib/microworlds/filter-toolbox';

describe('microworlds reducer', () => {
    test('initial state is inactive', () => {
        const state = microworldsReducer(undefined, {type: 'anything'});
        expect(state.active).toBe(false);
        expect(state.step).toBe(0);
    });

    test('startMicroworld activates the wizard at step 0', () => {
        const state = microworldsReducer(microworldsInitialState, startMicroworld('intro'));
        expect(state.active).toBe(true);
        expect(state.worldId).toBe('intro');
        expect(state.step).toBe(0);
    });

    test('nextStep advances and finishes on the last step', () => {
        let state = microworldsReducer(microworldsInitialState, startMicroworld('intro'));
        const lastStep = getStepCount(state) - 1;
        for (let i = 0; i < lastStep; i++) {
            state = microworldsReducer(state, microworldNextStep());
            expect(state.step).toBe(i + 1);
            expect(state.active).toBe(true);
        }
        // Advancing past the final step finishes the microworld.
        state = microworldsReducer(state, microworldNextStep());
        expect(state.active).toBe(false);
        expect(state.completed).toBe(true);
    });

    test('prevStep does not go below 0', () => {
        let state = microworldsReducer(microworldsInitialState, startMicroworld('intro'));
        state = microworldsReducer(state, microworldPrevStep());
        expect(state.step).toBe(0);
    });

    test('setChoice records a per-step choice', () => {
        let state = microworldsReducer(microworldsInitialState, startMicroworld('intro'));
        state = microworldsReducer(state, setMicroworldChoice('click-to-run', 'Meow!'));
        expect(state.choices['click-to-run']).toBe('Meow!');
    });

    test('finish and exit deactivate the wizard', () => {
        let state = microworldsReducer(microworldsInitialState, startMicroworld('intro'));
        const finished = microworldsReducer(state, finishMicroworld());
        expect(finished.active).toBe(false);
        expect(finished.completed).toBe(true);

        state = microworldsReducer(microworldsInitialState, startMicroworld('intro'));
        const exited = microworldsReducer(state, exitMicroworld());
        expect(exited).toEqual(microworldsInitialState);
    });
});

describe('microworlds selectors', () => {
    const active = microworldsReducer(microworldsInitialState, startMicroworld('intro'));

    test('return empty/null when inactive', () => {
        expect(getCurrentStep(microworldsInitialState)).toBeNull();
        expect(getReveal(microworldsInitialState)).toEqual({});
        expect(getPalette(microworldsInitialState)).toBeNull();
    });

    test('expose the current step config when active', () => {
        const step = getCurrentStep(active);
        expect(step.id).toBe('click-to-run');
        expect(getReveal(active).blocks).toBe(true);
        expect(getReveal(active).greenFlag).toBeUndefined();
        expect(getPalette(active)).toContain('looks_sayforsecs');
        expect(getStepCount(active)).toBeGreaterThan(1);
    });
});

describe('buildSayStack', () => {
    test('builds a standalone say stack with shadow inputs', () => {
        const blocks = buildSayStack({withHat: false, message: 'Hi', secs: 2});
        const say = blocks.find(b => b.id === SAY_ID);
        expect(say.opcode).toBe('looks_sayforsecs');
        expect(say.topLevel).toBe(true);
        expect(say.parent).toBeNull();
        const msg = blocks.find(b => b.id === SAY_MSG_ID);
        expect(msg.shadow).toBe(true);
        expect(msg.fields.TEXT.value).toBe('Hi');
    });

    test('builds a hat-connected stack', () => {
        const blocks = buildSayStack({withHat: true, message: 'Hi', secs: 2});
        const hat = blocks.find(b => b.id === HAT_ID);
        const say = blocks.find(b => b.id === SAY_ID);
        expect(hat.opcode).toBe('event_whenflagclicked');
        expect(hat.next).toBe(SAY_ID);
        expect(say.parent).toBe(HAT_ID);
        expect(say.topLevel).toBe(false);
        // The hat is the top block (used for deterministic removal).
        expect(blocks[0].id).toBe(HAT_ID);
    });
});

describe('filterToolboxXML', () => {
    const xml = [
        '<xml>',
        '<category name="Motion"><block type="motion_movesteps"/><block type="motion_turnright"/></category>',
        '<category name="Looks"><label text="Looks"/><block type="looks_say"/><block type="looks_sayforsecs"/></category>',
        '</xml>'
    ].join('');

    test('returns xml unchanged when no palette is given', () => {
        expect(filterToolboxXML(xml, null)).toBe(xml);
    });

    test('keeps only allowed blocks and drops empty categories', () => {
        const result = filterToolboxXML(xml, ['looks_sayforsecs']);
        expect(result).toContain('looks_sayforsecs');
        expect(result).not.toContain('looks_say"');
        expect(result).not.toContain('motion_movesteps');
        expect(result).not.toContain('Motion');
        // Non-block nodes (labels) in a kept category are removed too.
        expect(result).not.toContain('label');
    });
});
