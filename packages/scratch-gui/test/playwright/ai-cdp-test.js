#!/usr/bin/env node
// @ts-check
/**
 * Interactive AI Code Suggestions tester using Chrome remote debugging (CDP).
 *
 * Usage:
 *   1. Launch Chrome with remote debugging:
 *        /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
 *          --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug
 *   2. Run a single prompt:
 *        node ai-cdp-test.js "when green flag clicked, move 10 steps"
 *   3. Run all built-in test prompts:
 *        node ai-cdp-test.js --all
 *   4. Run interactively (prompt loop):
 *        node ai-cdp-test.js --interactive
 *
 * Connects to Chrome via CDP on port 9222, navigates to the Scratch editor
 * at localhost:8601, and runs AI code suggestion scenarios.
 */

const {chromium} = require('playwright');
const readline = require('readline');
const {buildPrompt} = require('../../src/lib/ai-prompt-template');

const CDP_URL = 'http://127.0.0.1:9222';
const EDITOR_URL = 'http://localhost:8601';

// How long to wait for AI generation to complete
const GENERATION_TIMEOUT = 5 * 60 * 1000; // 5 min (model may need to load first time)
const RUN_DURATION = 2000; // how long to let the project run before checking

// ---------------------------------------------------------------------------
// Redux / VM helpers (injected into page)
// ---------------------------------------------------------------------------
const getStoreHelper = `
    (() => {
        const guiEl = document.querySelector('[class*="gui"]');
        if (!guiEl) return null;
        const fiberKey = Object.keys(guiEl).find(k => k.startsWith('__reactFiber$'));
        if (!fiberKey) return null;
        let fiber = guiEl[fiberKey];
        while (fiber) {
            if (fiber.memoizedProps?.store) return fiber.memoizedProps.store;
            fiber = fiber.return;
        }
        return null;
    })()
`;

const vmHelpers = {
    getSpriteX: `(() => {
        const store = ${getStoreHelper};
        return store?.getState().scratchGui.vm?.editingTarget?.x ?? null;
    })()`,

    getSpritePos: `(() => {
        const store = ${getStoreHelper};
        const vm = store?.getState().scratchGui.vm;
        const t = vm?.editingTarget;
        return t ? {x: t.x, y: t.y} : {x: null, y: null};
    })()`,

    getSpriteDirection: `(() => {
        const store = ${getStoreHelper};
        return store?.getState().scratchGui.vm?.editingTarget?.direction ?? null;
    })()`,

    getSpriteSize: `(() => {
        const store = ${getStoreHelper};
        return store?.getState().scratchGui.vm?.editingTarget?.size ?? null;
    })()`,

    getSpriteVisible: `(() => {
        const store = ${getStoreHelper};
        return store?.getState().scratchGui.vm?.editingTarget?.visible ?? null;
    })()`,

    getSpriteEffects: `(() => {
        const store = ${getStoreHelper};
        return store?.getState().scratchGui.vm?.editingTarget?.effects ?? null;
    })()`,

    getBubbleText: `(() => {
        const store = ${getStoreHelper};
        const vm = store?.getState().scratchGui.vm;
        const target = vm?.editingTarget;
        if (!target) return null;
        const runtimeTarget = vm?.runtime?.targets?.find(t => t.id === target.id);
        if (runtimeTarget?.getCustomState) {
            const bubbleState = runtimeTarget.getCustomState('Scratch.looks');
            if (bubbleState) return bubbleState.text || null;
        }
        return null;
    })()`,

    getBlockCount: `(() => {
        const store = ${getStoreHelper};
        const vm = store?.getState().scratchGui.vm;
        return vm?.editingTarget
            ? Object.keys(vm.editingTarget.blocks._blocks).length
            : null;
    })()`,

    getBlockOpcodes: `(() => {
        const store = ${getStoreHelper};
        const vm = store?.getState().scratchGui.vm;
        if (!vm?.editingTarget) return null;
        return Object.values(vm.editingTarget.blocks._blocks).map(b => b.opcode);
    })()`,

    getGeneratedOpcodes: `(() => {
        const store = ${getStoreHelper};
        const state = store?.getState().scratchGui.aiCodeSuggestions;
        return state?.generatedBlocks?.map(b => b.opcode) ?? null;
    })()`,

    getAiStatus: `(() => {
        const store = ${getStoreHelper};
        return store?.getState().scratchGui.aiCodeSuggestions ?? null;
    })()`,

    getPreviewText: `(() => {
        const store = ${getStoreHelper};
        return store?.getState().scratchGui.aiCodeSuggestions?.previewText ?? null;
    })()`,

    getFullState: `(() => {
        const store = ${getStoreHelper};
        const vm = store?.getState().scratchGui.vm;
        const t = vm?.editingTarget;
        if (!t) return null;
        return {
            x: t.x, y: t.y, direction: t.direction,
            size: t.size, visible: t.visible,
            effects: t.effects,
            blockCount: Object.keys(t.blocks._blocks).length,
            opcodes: Object.values(t.blocks._blocks).map(b => b.opcode)
        };
    })()`,
};

const resetSprite = `(() => {
    const store = ${getStoreHelper};
    if (!store) return;
    const vm = store.getState().scratchGui.vm;
    if (!vm?.editingTarget) return;
    const target = vm.editingTarget;
    target.setXY(0, 0);
    target.setDirection(90);
    target.setSize(100);
    target.setVisible(true);
    target.clearEffects();
    // Clear all blocks
    const blockIds = Object.keys(target.blocks._blocks);
    for (const id of blockIds) {
        target.blocks.deleteBlock(id);
    }
    return {cleared: blockIds.length};
})()`;

// ---------------------------------------------------------------------------
// Fixture setup helpers
// ---------------------------------------------------------------------------

/**
 * Duplicate the cat sprite to create a two-sprite project.
 */
async function setupMultiSpriteProject (page) {
    return page.evaluate(`(async () => {
        const store = ${getStoreHelper};
        if (!store) return {error: 'no store'};
        const vm = store.getState().scratchGui.vm;
        if (!vm?.editingTarget) return {error: 'no editing target'};

        // Duplicate the current sprite
        const origId = vm.editingTarget.id;
        await vm.duplicateSprite(origId);

        // The duplicated sprite is now the editing target — rename and reposition
        const newTarget = vm.editingTarget;
        vm.renameSprite(newTarget.id, 'Sprite2');
        newTarget.setXY(100, 0);

        const nonStage = vm.runtime.targets.filter(t => !t.isStage);
        return {
            spriteCount: nonStage.length,
            names: nonStage.map(t => t.getName())
        };
    })()`);
}

/**
 * Add existing code (as scratchblocks text) to the current editing target.
 */
async function setupProjectWithExistingCode (page, scratchblocksText) {
    return page.evaluate(async (text) => {
        if (typeof window.__scratchblocksToVMBlocks !== 'function') {
            return {error: 'converter not available'};
        }
        const blocks = window.__scratchblocksToVMBlocks(text);
        // eslint-disable-next-line no-undef
        const guiEl = document.querySelector('[class*="gui"]');
        if (!guiEl) return {error: 'no gui'};
        const fiberKey = Object.keys(guiEl).find(k => k.startsWith('__reactFiber$'));
        if (!fiberKey) return {error: 'no fiber'};
        let fiber = guiEl[fiberKey];
        while (fiber) {
            if (fiber.memoizedProps?.store) break;
            fiber = fiber.return;
        }
        if (!fiber) return {error: 'no store'};
        const vm = fiber.memoizedProps.store.getState().scratchGui.vm;
        await vm.shareBlocksToTarget(blocks, vm.editingTarget.id);
        vm.refreshWorkspace();
        return {blockCount: Object.keys(vm.editingTarget.blocks._blocks).length};
    }, scratchblocksText);
}

/**
 * Delete extra sprites and reset to a clean blank project.
 */
async function resetToBlankProject (page) {
    return page.evaluate(`(() => {
        const store = ${getStoreHelper};
        if (!store) return {error: 'no store'};
        const vm = store.getState().scratchGui.vm;

        // Delete all sprites except the first non-stage target
        const nonStage = vm.runtime.targets.filter(t => !t.isStage);
        for (let i = nonStage.length - 1; i >= 1; i--) {
            vm.deleteSprite(nonStage[i].id);
        }

        // Reset remaining sprite
        const target = vm.runtime.targets.find(t => !t.isStage);
        if (target) {
            target.setXY(0, 0);
            target.setDirection(90);
            target.setSize(100);
            target.setVisible(true);
            target.clearEffects();
            const blockIds = Object.keys(target.blocks._blocks);
            for (const id of blockIds) target.blocks.deleteBlock(id);
            vm.setEditingTarget(target.id);
        }

        return {spriteCount: vm.runtime.targets.filter(t => !t.isStage).length};
    })()`);
}

/**
 * Switch the editing target to a named sprite.
 */
async function switchToSprite (page, spriteName) {
    return page.evaluate(`(() => {
        const store = ${getStoreHelper};
        if (!store) return {success: false};
        const vm = store.getState().scratchGui.vm;
        const target = vm.runtime.targets.find(t => t.getName() === '${spriteName}');
        if (target) {
            vm.setEditingTarget(target.id);
            return {success: true, name: target.getName()};
        }
        return {success: false};
    })()`);
}

// ---------------------------------------------------------------------------
// Built-in test prompts
// ---------------------------------------------------------------------------
const TEST_PROMPTS = [
    {
        name: 'move 10 steps',
        prompt: 'when green flag clicked, move 10 steps',
        expectedOpcodes: ['event_whenflagclicked', 'motion_movesteps'],
        verify: state => {
            if (state.x !== 0) return {pass: true, detail: `x=${state.x}`};
            return {pass: false, detail: `sprite didn't move (x=${state.x})`};
        }
    },
    {
        name: 'say hello',
        prompt: 'when green flag clicked, say hello',
        expectedOpcodes: ['looks_say'],
        verify: state => {
            if (state.opcodes.some(o => o.includes('looks_say'))) return {pass: true, detail: 'say block present'};
            return {pass: false, detail: 'no say block found'};
        }
    },
    {
        name: 'forever move and bounce',
        prompt: 'when green flag clicked, forever move 10 steps and if on edge bounce',
        expectedOpcodes: ['control_forever', 'motion_movesteps', 'motion_ifonedgebounce'],
        verify: state => {
            if (state.x !== 0) return {pass: true, detail: `x=${state.x}`};
            return {pass: false, detail: `sprite didn't move (x=${state.x})`};
        }
    },
    {
        name: 'change size',
        prompt: 'when green flag clicked, set size to 200 percent',
        expectedOpcodes: ['looks_setsizeto'],
        verify: state => {
            if (state.size !== 100) return {pass: true, detail: `size=${state.size}`};
            return {pass: false, detail: `size unchanged (${state.size})`};
        }
    },
    {
        name: 'hide sprite',
        prompt: 'when green flag clicked, hide',
        expectedOpcodes: ['looks_hide'],
        verify: state => {
            if (!state.visible) return {pass: true, detail: 'sprite hidden'};
            return {pass: false, detail: 'sprite still visible'};
        }
    },
    {
        name: 'repeat move',
        prompt: 'when green flag clicked, repeat 10 times: move 10 steps',
        expectedOpcodes: ['control_repeat', 'motion_movesteps'],
        verify: state => {
            if (state.x !== 0) return {pass: true, detail: `x=${state.x}`};
            return {pass: false, detail: `sprite didn't move (x=${state.x})`};
        }
    },
    {
        name: 'point and move',
        prompt: 'when green flag clicked, point in direction 45 then move 50 steps',
        expectedOpcodes: ['motion_pointindirection', 'motion_movesteps'],
        verify: state => {
            if (state.x !== 0 || state.y !== 0) return {pass: true, detail: `pos=(${state.x},${state.y})`};
            return {pass: false, detail: 'sprite didn\'t move'};
        }
    },
    {
        name: 'change color effect',
        prompt: 'when green flag clicked, change color effect by 25',
        expectedOpcodes: ['looks_changeeffectby'],
        verify: state => {
            if (state.effects?.color !== 0) return {pass: true, detail: `color=${state.effects?.color}`};
            return {pass: false, detail: 'color effect unchanged'};
        }
    },
    // --- Expanded prompts for Phase 1.5 ---
    {
        name: 'show sprite',
        prompt: 'when green flag clicked, show',
        expectedOpcodes: ['looks_show'],
        verify: state => {
            if (state.opcodes.some(o => o === 'looks_show')) return {pass: true, detail: 'show block present'};
            return {pass: false, detail: 'no show block found'};
        }
    },
    {
        name: 'next costume',
        prompt: 'when green flag clicked, next costume',
        expectedOpcodes: ['looks_nextcostume'],
        verify: state => {
            if (state.opcodes.some(o => o === 'looks_nextcostume')) return {pass: true, detail: 'next costume block present'};
            if (state.opcodes.some(o => o === 'looks_switchcostumeto')) return {pass: true, detail: 'switch costume present (close enough)'};
            return {pass: false, detail: 'no costume block'};
        }
    },
    {
        name: 'play sound',
        prompt: 'when green flag clicked, play sound pop until done',
        expectedOpcodes: ['sound_playuntildone'],
        verify: state => {
            if (state.opcodes.some(o => o.includes('sound_play'))) return {pass: true, detail: 'sound block present'};
            return {pass: false, detail: 'no sound block found'};
        }
    },
    {
        name: 'key press event',
        prompt: 'when space key pressed, move 10 steps',
        expectedOpcodes: ['event_whenkeypressed', 'motion_movesteps'],
        verify: state => {
            if (state.opcodes.some(o => o === 'event_whenkeypressed')) return {pass: true, detail: 'key press hat present'};
            return {pass: false, detail: 'no key press hat block'};
        }
    },
    {
        name: 'if-else',
        prompt: 'when green flag clicked, if touching mouse pointer then say hi else say bye',
        expectedOpcodes: ['control_if_else'],
        verify: state => {
            if (state.opcodes.some(o => o === 'control_if_else' || o === 'control_if')) return {pass: true, detail: 'if/else block present'};
            return {pass: false, detail: 'no if/else block'};
        }
    },
    {
        name: 'ask and answer',
        prompt: 'when green flag clicked, ask what is your name and wait, then say the answer',
        expectedOpcodes: ['sensing_askandwait'],
        verify: state => {
            if (state.opcodes.some(o => o === 'sensing_askandwait')) return {pass: true, detail: 'ask block present'};
            return {pass: false, detail: 'no ask block'};
        }
    },
    {
        name: 'variable loop',
        prompt: 'when green flag clicked, set my variable to 0, repeat 10: change my variable by 1',
        expectedOpcodes: ['data_setvariableto', 'control_repeat', 'data_changevariableby'],
        verify: state => {
            if (state.opcodes.some(o => o === 'data_setvariableto')) return {pass: true, detail: 'set variable block present'};
            return {pass: false, detail: 'no set variable block'};
        }
    },
    {
        name: 'multi-action sequence',
        prompt: 'when green flag clicked, set size to 50 percent, point in direction 180, move 100 steps',
        expectedOpcodes: ['looks_setsizeto', 'motion_pointindirection', 'motion_movesteps'],
        verify: state => {
            if (state.size !== 100 || state.x !== 0 || state.y !== 0) return {pass: true, detail: `size=${state.size}, pos=(${state.x},${state.y})`};
            return {pass: false, detail: 'no state change'};
        }
    },
    {
        name: 'pen square',
        prompt: 'when green flag clicked, pen down, repeat 4: move 100 steps, turn right 90 degrees',
        expectedOpcodes: ['control_repeat', 'motion_movesteps', 'motion_turnright'],
        verify: state => {
            // Pen effects aren't in sprite state, just verify blocks exist
            if (state.opcodes.some(o => o === 'control_repeat' || o.includes('motion_'))) return {pass: true, detail: 'repeat+motion blocks present'};
            return {pass: false, detail: 'missing blocks'};
        }
    },

    // --- Group A: Natural/informal phrasing ---
    {
        name: 'informal-spin',
        prompt: 'make the cat spin around',
        group: 'blank',
        expectedOpcodes: ['motion_turnright'],
        verify: state => {
            const hasTurn = state.opcodes.some(o => o.includes('turn'));
            if (hasTurn) return {pass: true, detail: 'has turn block'};
            // Accept direction change as evidence of turning
            if (state.direction !== 90) return {pass: true, detail: `direction=${state.direction}`};
            return {pass: false, detail: 'no turn block or direction change'};
        }
    },
    {
        name: 'informal-bounce',
        prompt: 'have it bounce off the walls forever',
        group: 'blank',
        expectedOpcodes: ['control_forever', 'motion_movesteps', 'motion_ifonedgebounce'],
        verify: state => {
            const hasForever = state.opcodes.some(o => o === 'control_forever');
            const hasBounce = state.opcodes.some(o => o === 'motion_ifonedgebounce');
            if (hasForever && hasBounce) return {pass: true, detail: 'forever+bounce present'};
            if (hasBounce) return {pass: true, detail: 'bounce present (no forever)'};
            return {pass: false, detail: 'missing bounce block'};
        }
    },
    {
        name: 'informal-grow-shrink',
        prompt: 'make the sprite get bigger then smaller over and over',
        group: 'blank',
        expectedOpcodes: ['looks_changesizeby'],
        verify: state => {
            const hasSize = state.opcodes.some(o => o.includes('size'));
            if (hasSize) return {pass: true, detail: 'has size block'};
            return {pass: false, detail: 'no size blocks found'};
        }
    },
    {
        name: 'informal-follow-mouse',
        prompt: 'follow my mouse pointer forever',
        group: 'blank',
        expectedOpcodes: ['motion_goto'],
        verify: state => {
            const hasGoto = state.opcodes.some(o => o.includes('goto') || o.includes('gotoxy'));
            const hasMouseMotion = state.opcodes.some(o => o.includes('changexby') || o.includes('changeyby'));
            const hasForever = state.opcodes.some(o => o === 'control_forever');
            if (hasGoto) return {pass: true, detail: `goto present, forever=${hasForever}`};
            if (hasMouseMotion && hasForever) return {pass: true, detail: 'change x/y in forever (mouse-following)'};
            return {pass: false, detail: 'no goto or mouse-following pattern found'};
        }
    },
    {
        name: 'ultra-short',
        prompt: 'spin',
        group: 'blank',
        expectedOpcodes: ['motion_turnright'],
        verify: state => {
            const hasTurn = state.opcodes.some(o => o.includes('turn'));
            const hasBlocks = state.blockCount > 0;
            if (hasTurn) return {pass: true, detail: 'has turn block'};
            if (hasBlocks) return {pass: true, detail: `has ${state.blockCount} blocks (no turn)`};
            return {pass: false, detail: 'no blocks generated'};
        }
    },
    {
        name: 'ambiguous-dance',
        prompt: 'make it dance',
        group: 'blank',
        expectedOpcodes: [],
        verify: state => {
            // Very lenient — model has creative freedom
            const nonShadow = state.opcodes.filter(o => !o.startsWith('math_') && o !== 'text' && !o.includes('menu'));
            if (nonShadow.length >= 3) return {pass: true, detail: `${nonShadow.length} non-shadow blocks`};
            if (nonShadow.length > 0) return {pass: true, detail: `${nonShadow.length} blocks (sparse but ok)`};
            return {pass: false, detail: 'no blocks generated'};
        }
    },

    // --- Group B: Multi-step / control flow ---
    {
        name: 'walk-and-color',
        prompt: 'make the cat walk back and forth while changing colors',
        group: 'blank',
        expectedOpcodes: ['control_forever', 'motion_movesteps', 'looks_changeeffectby'],
        verify: state => {
            const hasMotion = state.opcodes.some(o => o.includes('motion_'));
            const hasEffect = state.opcodes.some(o => o.includes('effect'));
            const hasSize = state.opcodes.some(o => o.includes('size'));
            if (hasMotion && hasEffect) return {pass: true, detail: 'motion+effect present'};
            if (hasMotion) return {pass: true, detail: 'motion present (no effect)'};
            if (hasEffect) return {pass: true, detail: 'effect present (no motion — model interpreted creatively)'};
            if (hasSize) return {pass: true, detail: 'size animation present'};
            return {pass: false, detail: 'no motion or effect blocks'};
        }
    },
    {
        name: 'count-to-ten',
        prompt: 'count to 10 and say each number',
        group: 'blank',
        expectedOpcodes: ['data_setvariableto', 'control_repeat'],
        verify: state => {
            const hasVar = state.opcodes.some(o => o.includes('data_'));
            const hasRepeat = state.opcodes.some(o => o === 'control_repeat');
            if (hasVar && hasRepeat) return {pass: true, detail: 'variable+repeat present'};
            if (hasVar) return {pass: true, detail: 'variable present (no repeat)'};
            return {pass: false, detail: 'no variable blocks'};
        }
    },
    {
        name: 'click-counter',
        prompt: 'keep score and add one every time I click the sprite',
        group: 'blank',
        expectedOpcodes: ['event_whenthisspriteclicked', 'data_changevariableby'],
        verify: state => {
            const hasClick = state.opcodes.some(o => o === 'event_whenthisspriteclicked');
            const hasVar = state.opcodes.some(o => o.includes('data_'));
            if (hasClick && hasVar) return {pass: true, detail: 'click+variable present'};
            if (hasClick) return {pass: true, detail: 'click hat present (no variable)'};
            return {pass: false, detail: 'no sprite clicked hat'};
        }
    },
    {
        name: 'wait-then-say',
        prompt: 'wait 3 seconds then say surprise for 2 seconds',
        group: 'blank',
        expectedOpcodes: ['control_wait', 'looks_sayforsecs'],
        verify: state => {
            const hasWait = state.opcodes.some(o => o === 'control_wait');
            const hasSay = state.opcodes.some(o => o.includes('looks_say'));
            if (hasWait && hasSay) return {pass: true, detail: 'wait+say present'};
            if (hasSay) return {pass: true, detail: 'say present (no explicit wait)'};
            return {pass: false, detail: 'no say block'};
        }
    },
    {
        name: 'clone-rain',
        prompt: 'create clones that fall down the screen',
        group: 'blank',
        expectedOpcodes: ['control_create_clone_of', 'control_start_as_clone'],
        verify: state => {
            const hasClone = state.opcodes.some(o => o.includes('clone'));
            if (hasClone) return {pass: true, detail: 'clone blocks present'};
            return {pass: false, detail: 'no clone blocks'};
        }
    },

    // --- Group C: Broadcasting / Events ---
    {
        name: 'broadcast-send',
        prompt: 'when green flag clicked, broadcast go',
        group: 'blank',
        expectedOpcodes: ['event_whenflagclicked', 'event_broadcast'],
        verify: state => {
            const hasBroadcast = state.opcodes.some(o => o.includes('broadcast') && !o.includes('received'));
            if (hasBroadcast) return {pass: true, detail: 'broadcast block present'};
            return {pass: false, detail: 'no broadcast block'};
        }
    },
    {
        name: 'clone-and-delete',
        prompt: 'when green flag clicked, create clone of myself. when I start as a clone, move 50 steps then delete this clone',
        group: 'blank',
        expectedOpcodes: ['control_create_clone_of', 'control_start_as_clone', 'control_delete_this_clone'],
        verify: state => {
            const hasCreate = state.opcodes.some(o => o === 'control_create_clone_of');
            const hasStart = state.opcodes.some(o => o === 'control_start_as_clone');
            if (hasCreate && hasStart) return {pass: true, detail: 'create+start clone present'};
            if (hasCreate || hasStart) return {pass: true, detail: 'partial clone blocks'};
            return {pass: false, detail: 'no clone blocks'};
        }
    },

    // --- Group D: Pen / Drawing ---
    {
        name: 'draw-triangle',
        prompt: 'use pen to draw a triangle with pen down, repeat 3, move, turn',
        group: 'blank',
        expectedOpcodes: ['pen_penDown', 'control_repeat', 'motion_movesteps'],
        verify: state => {
            const hasPen = state.opcodes.some(o => o.includes('pen'));
            const hasRepeat = state.opcodes.some(o => o === 'control_repeat');
            const hasMotion = state.opcodes.some(o => o.includes('motion_'));
            if (hasPen && hasRepeat) return {pass: true, detail: 'pen+repeat present'};
            if (hasPen) return {pass: true, detail: 'pen present (no repeat)'};
            if (hasRepeat && hasMotion) return {pass: true, detail: 'repeat+motion (no pen — model omitted pen)'};
            return {pass: false, detail: 'no pen or repeat+motion blocks'};
        }
    },
    {
        name: 'draw-circle',
        prompt: 'draw a circle using the pen',
        group: 'blank',
        expectedOpcodes: ['pen_penDown', 'control_repeat', 'motion_movesteps'],
        verify: state => {
            const hasPen = state.opcodes.some(o => o.includes('pen'));
            const hasRepeat = state.opcodes.some(o => o === 'control_repeat');
            if (hasPen && hasRepeat) return {pass: true, detail: 'pen+repeat present'};
            if (hasPen) return {pass: true, detail: 'pen present (no repeat)'};
            return {pass: false, detail: 'no pen blocks'};
        }
    },

    // --- Group E: Multi-sprite fixture ---
    {
        name: 'sprite2-say',
        prompt: 'when green flag clicked, say I am Sprite2',
        group: 'multi-sprite',
        targetSprite: 'Sprite2',
        expectedOpcodes: ['looks_say'],
        verify: state => {
            const hasSay = state.opcodes.some(o => o.includes('looks_say'));
            if (hasSay) return {pass: true, detail: 'say block present on Sprite2'};
            return {pass: false, detail: 'no say block'};
        }
    },
    {
        name: 'broadcast-receive',
        prompt: 'when I receive go, say hello',
        group: 'multi-sprite',
        targetSprite: 'Sprite2',
        expectedOpcodes: ['event_whenbroadcastreceived', 'looks_say'],
        verify: state => {
            const hasReceive = state.opcodes.some(o => o === 'event_whenbroadcastreceived');
            if (hasReceive) return {pass: true, detail: 'broadcast receive hat present'};
            return {pass: false, detail: 'no broadcast receive hat'};
        }
    },

    // --- Group F: Existing code fixture ---
    {
        name: 'add-click-handler',
        prompt: 'when this sprite clicked, say hello',
        group: 'existing-code',
        expectedOpcodes: ['event_whenthisspriteclicked'],
        verify: state => {
            const hasClick = state.opcodes.some(o => o === 'event_whenthisspriteclicked');
            if (hasClick) return {pass: true, detail: 'sprite clicked hat present'};
            return {pass: false, detail: 'no sprite clicked hat'};
        }
    },
    {
        name: 'add-key-handler',
        prompt: 'when space key pressed, play sound pop',
        group: 'existing-code',
        expectedOpcodes: ['event_whenkeypressed'],
        verify: state => {
            const hasKey = state.opcodes.some(o => o === 'event_whenkeypressed');
            if (hasKey) return {pass: true, detail: 'key pressed hat present'};
            return {pass: false, detail: 'no key pressed hat'};
        }
    },
];

// ---------------------------------------------------------------------------
// Core test logic
// ---------------------------------------------------------------------------

/**
 * Connect to Chrome via CDP and return {browser, page} for the editor tab.
 */
async function connectToChrome () {
    console.log(`Connecting to Chrome at ${CDP_URL}...`);
    const browser = await chromium.connectOverCDP(CDP_URL);
    const contexts = browser.contexts();
    if (contexts.length === 0) {
        throw new Error('No browser contexts found. Is Chrome open?');
    }

    // Find a page with the editor, or use the first page
    let page = null;
    for (const ctx of contexts) {
        for (const p of ctx.pages()) {
            const url = p.url();
            if (url.includes('localhost:8601') || url.includes('127.0.0.1:8601')) {
                page = p;
                break;
            }
        }
        if (page) break;
    }

    if (!page) {
        // Navigate the first available page to the editor
        page = contexts[0].pages()[0] || await contexts[0].newPage();
        console.log(`Navigating to ${EDITOR_URL}...`);
        await page.goto(EDITOR_URL);
        await page.waitForSelector('[class*="green-flag"]', {timeout: 30000});
        console.log('Editor loaded.');
    } else {
        console.log(`Found editor tab: ${page.url()}`);
    }

    return {browser, page};
}

/**
 * Run a single prompt through the full generate → add → run → verify cycle.
 * Returns a result object.
 */
async function runPrompt (page, prompt, verifyFn = null, expectedOpcodes = null) {
    const result = {
        prompt,
        status: 'ERROR',
        previewText: null,
        opcodes: null,
        stateBefore: null,
        stateAfter: null,
        consoleErrors: [],
        reason: null,
        timings: {}
    };

    // Collect console errors and AI-related logs during this test
    const consoleErrors = [];
    let rawModelOutput = null;
    let promptSent = null;
    const consoleHandler = msg => {
        const text = msg.text();
        if (msg.type() === 'error') {
            consoleErrors.push(text.substring(0, 500));
        }
        // Capture the raw model output logged by ai-code-suggestions.js
        if (text.includes('[ai-code-suggestions] raw output:')) {
            rawModelOutput = text.replace('[ai-code-suggestions] raw output:', '').trim();
        }
        if (text.includes('[ai-code-suggestions] prompt:')) {
            promptSent = text.replace('[ai-code-suggestions] prompt:', '').trim();
        }
        // Log AI-related messages in real time
        if (text.includes('ai-code-suggestions') || text.includes('ai-model') || text.includes('WebGPU')) {
            console.log(`  [browser ${msg.type()}] ${text.substring(0, 300)}`);
        }
    };
    page.on('console', consoleHandler);

    try {
        // Step 0: Dismiss any webpack dev server overlay that might block clicks
        await page.evaluate(() => {
            const overlay = document.getElementById('webpack-dev-server-client-overlay');
            if (overlay) overlay.remove();
        });

        // Reset sprite
        console.log('\n--- Resetting sprite state ---');
        const cleared = await page.evaluate(resetSprite);
        console.log(`  Cleared ${cleared?.cleared || 0} blocks, reset position/size/effects`);
        await page.waitForTimeout(300);

        // Close any open AI modal first
        const modalVisible = await page.locator('[class*="ai-suggestions-modal"]').isVisible().catch(() => false);
        if (modalVisible) {
            const closeBtn = page.locator('[class*="ai-suggestions-modal"] [class*="close"]');
            if (await closeBtn.isVisible().catch(() => false)) {
                await closeBtn.click();
                await page.waitForTimeout(300);
            }
        }

        // Step 1: Open AI modal
        console.log('\n--- Opening AI Code Suggestions ---');
        const aiButton = page.locator('button[title="AI Code Suggestions"]');
        if (!await aiButton.isVisible().catch(() => false)) {
            result.reason = 'AI Code Suggestions button not found';
            return result;
        }
        await aiButton.click();
        await page.waitForTimeout(500);

        // Step 2: Enter prompt and generate
        console.log(`--- Generating: "${prompt}" ---`);
        const input = page.locator('input[placeholder*="walk back and forth"]');
        if (!await input.isVisible({timeout: 3000}).catch(() => false)) {
            // Try textarea as fallback
            const textarea = page.locator('textarea[placeholder*="walk back and forth"]');
            if (!await textarea.isVisible({timeout: 2000}).catch(() => false)) {
                result.reason = 'Prompt input not found';
                return result;
            }
            await textarea.fill(prompt);
        } else {
            await input.fill(prompt);
        }

        const genStart = Date.now();
        await page.locator('button:has-text("Generate")').click();

        // Wait for generation (watch for model loading modal too)
        console.log('  Waiting for generation...');

        // Poll for completion
        let done = false;
        let attempts = 0;
        const maxAttempts = GENERATION_TIMEOUT / 1000;
        while (!done && attempts < maxAttempts) {
            await page.waitForTimeout(1000);
            attempts++;

            const aiState = await page.evaluate(vmHelpers.getAiStatus);
            if (aiState?.status === 'done') {
                done = true;
                result.previewText = aiState.previewText;
            } else if (aiState?.status === 'error') {
                result.reason = `Generation error: ${aiState.error}`;
                return result;
            } else {
                // Check for model loading modal
                const loadModal = await page.locator('#llm-load-modal').isVisible().catch(() => false);
                if (loadModal && attempts % 10 === 0) {
                    console.log('  (Model loading in progress...)');
                }
                if (attempts % 30 === 0) {
                    console.log(`  Still generating... (${attempts}s, status: ${aiState?.status})`);
                }
            }
        }

        result.timings.generation = Date.now() - genStart;
        console.log(`  Generation took ${(result.timings.generation / 1000).toFixed(1)}s`);

        if (!done) {
            result.reason = 'Generation timed out';
            return result;
        }

        // Step 3: Check generated blocks
        const generatedOpcodes = await page.evaluate(vmHelpers.getGeneratedOpcodes);
        result.opcodes = generatedOpcodes;
        console.log(`  Preview: ${result.previewText}`);
        console.log(`  Generated opcodes: ${generatedOpcodes?.join(', ')}`);

        if (expectedOpcodes) {
            const missing = expectedOpcodes.filter(
                op => !generatedOpcodes?.some(o => o.includes(op))
            );
            if (missing.length > 0) {
                console.log(`  WARNING: Missing expected opcodes: ${missing.join(', ')}`);
            }
        }

        // Step 4: Add blocks to project
        console.log('\n--- Adding blocks to project ---');
        const addButton = page.locator('button:has-text("Add to Project")');
        if (!await addButton.isVisible({timeout: 3000}).catch(() => false)) {
            result.reason = '"Add to Project" button not visible';
            return result;
        }
        await addButton.click();
        await page.waitForTimeout(1000);

        result.stateBefore = await page.evaluate(vmHelpers.getFullState);
        console.log(`  Blocks in workspace: ${result.stateBefore?.blockCount}`);
        console.log(`  Workspace opcodes: ${result.stateBefore?.opcodes?.join(', ')}`);

        if (!result.stateBefore?.blockCount) {
            result.reason = 'No blocks were added to workspace';
            result.status = 'FAIL';
            return result;
        }

        // Step 5: Reset position before running, then click green flag
        console.log('\n--- Running project ---');
        await page.evaluate(`(() => {
            const store = ${getStoreHelper};
            const vm = store?.getState().scratchGui.vm;
            if (vm?.editingTarget) {
                vm.editingTarget.setXY(0, 0);
                vm.editingTarget.setDirection(90);
                vm.editingTarget.setSize(100);
                vm.editingTarget.setVisible(true);
                vm.editingTarget.clearEffects();
            }
        })()`);

        await page.click('[class*="green-flag"]');
        console.log(`  Running for ${RUN_DURATION}ms...`);
        await page.waitForTimeout(RUN_DURATION);

        // Step 6: Check state after running
        result.stateAfter = await page.evaluate(vmHelpers.getFullState);

        // Stop the project - dismiss overlay first if it appeared
        await page.evaluate(() => {
            const overlay = document.getElementById('webpack-dev-server-client-overlay');
            if (overlay) overlay.remove();
        });
        await page.click('[class*="stop-all"]');
        await page.waitForTimeout(300);

        console.log(`  State after run: pos=(${result.stateAfter?.x},${result.stateAfter?.y}), dir=${result.stateAfter?.direction}, size=${result.stateAfter?.size}, visible=${result.stateAfter?.visible}`);

        // Step 7: Verify
        if (verifyFn && result.stateAfter) {
            const verification = verifyFn(result.stateAfter);
            result.status = verification.pass ? 'PASS' : 'FAIL';
            result.reason = verification.detail;
        } else {
            // Generic verification: did anything change?
            const before = {x: 0, y: 0, direction: 90, size: 100, visible: true};
            const after = result.stateAfter;
            const changed = after && (
                after.x !== before.x || after.y !== before.y ||
                after.direction !== before.direction || after.size !== before.size ||
                after.visible !== before.visible
            );
            if (changed) {
                result.status = 'PASS';
                result.reason = 'State changed after run';
            } else {
                // Check if there are blocks that don't produce visible state changes
                const hasNonMotion = result.opcodes?.some(o =>
                    o.includes('looks_say') || o.includes('sound_') ||
                    o.includes('looks_nextcostume')
                );
                if (hasNonMotion) {
                    result.status = 'PASS';
                    result.reason = 'Blocks added (non-motion, cannot verify state change)';
                } else {
                    result.status = 'FAIL';
                    result.reason = 'No observable state change after running';
                }
            }
        }

        result.consoleErrors = consoleErrors;
        result.rawModelOutput = rawModelOutput;
        result.promptSent = promptSent;
    } catch (err) {
        result.status = 'ERROR';
        result.reason = err.message;
    } finally {
        page.off('console', consoleHandler);
    }

    return result;
}

function printResult (result) {
    const icon = result.status === 'PASS' ? 'PASS' : result.status === 'FAIL' ? 'FAIL' : 'ERR ';
    console.log(`\n${'='.repeat(70)}`);
    console.log(`[${icon}] "${result.prompt}"`);
    console.log(`  Preview: ${result.previewText || '(none)'}`);
    console.log(`  Opcodes: ${result.opcodes?.join(', ') || '(none)'}`);
    console.log(`  Reason: ${result.reason || '(none)'}`);
    if (result.rawModelOutput) {
        console.log(`  Raw model output:\n${result.rawModelOutput.substring(0, 2000)}`);
    }
    if (result.timings.generation) {
        console.log(`  Generation time: ${(result.timings.generation / 1000).toFixed(1)}s`);
    }
    if (result.consoleErrors.length > 0) {
        console.log(`  Console errors (${result.consoleErrors.length}):`);
        for (const err of result.consoleErrors.slice(0, 5)) {
            console.log(`    - ${err.substring(0, 200)}`);
        }
    }
    console.log('='.repeat(70));
}

// ---------------------------------------------------------------------------
// Run modes
// ---------------------------------------------------------------------------

async function runSingle (prompt) {
    const {browser, page} = await connectToChrome();
    try {
        const testCase = TEST_PROMPTS.find(t => t.prompt === prompt || t.name === prompt);
        const result = await runPrompt(
            page, prompt,
            testCase?.verify || null,
            testCase?.expectedOpcodes || null
        );
        printResult(result);
        return result;
    } finally {
        // CDP connections use close() not disconnect()
        try { await browser.close(); } catch { /* ignore */ }
    }
}

async function runAll () {
    const {browser, page} = await connectToChrome();
    const results = [];
    try {
        for (const testCase of TEST_PROMPTS) {
            const result = await runPrompt(
                page,
                testCase.prompt,
                testCase.verify,
                testCase.expectedOpcodes
            );
            printResult(result);
            results.push({name: testCase.name, ...result});
        }

        // Summary
        console.log(`\n${'='.repeat(70)}`);
        console.log('SUMMARY');
        console.log('='.repeat(70));
        const passed = results.filter(r => r.status === 'PASS').length;
        const failed = results.filter(r => r.status === 'FAIL').length;
        const errors = results.filter(r => r.status === 'ERROR').length;
        for (const r of results) {
            const icon = r.status === 'PASS' ? 'OK  ' : r.status === 'FAIL' ? 'FAIL' : 'ERR ';
            console.log(`  [${icon}] ${r.name}: ${r.reason || ''}`);
        }
        console.log('-'.repeat(70));
        console.log(`  Total: ${results.length} | Passed: ${passed} | Failed: ${failed} | Errors: ${errors}`);
        console.log('='.repeat(70));
    } finally {
        // CDP connections use close() not disconnect()
        try { await browser.close(); } catch { /* ignore */ }
    }
    return results;
}

async function runInteractive () {
    const {browser, page} = await connectToChrome();
    const rl = readline.createInterface({input: process.stdin, output: process.stdout});

    const askPrompt = () => new Promise(resolve => {
        rl.question('\nEnter prompt (or "quit" to exit, "all" to run all): ', resolve);
    });

    console.log('\n--- Interactive AI Code Suggestions Tester ---');
    console.log('Type a Scratch prompt, "all" to run built-in tests, or "quit" to exit.\n');

    try {
        while (true) {
            const input = await askPrompt();
            const trimmed = input.trim();

            if (!trimmed || trimmed === 'quit' || trimmed === 'exit') break;

            if (trimmed === 'all') {
                for (const testCase of TEST_PROMPTS) {
                    const result = await runPrompt(page, testCase.prompt, testCase.verify, testCase.expectedOpcodes);
                    printResult(result);
                }
                continue;
            }

            if (trimmed === 'state') {
                const state = await page.evaluate(vmHelpers.getFullState);
                console.log('Current state:', JSON.stringify(state, null, 2));
                continue;
            }

            if (trimmed === 'reset') {
                await page.evaluate(resetSprite);
                console.log('Sprite reset.');
                continue;
            }

            if (trimmed === 'reload') {
                await page.reload();
                await page.waitForSelector('[class*="green-flag"]', {timeout: 30000});
                console.log('Page reloaded.');
                continue;
            }

            const testCase = TEST_PROMPTS.find(t => t.name === trimmed);
            const result = await runPrompt(
                page, testCase?.prompt || trimmed,
                testCase?.verify || null,
                testCase?.expectedOpcodes || null
            );
            printResult(result);
        }
    } finally {
        rl.close();
        // CDP connections use close() not disconnect()
        try { await browser.close(); } catch { /* ignore */ }
    }
}

// ---------------------------------------------------------------------------
// Scratchblocks testing modes
// ---------------------------------------------------------------------------

/**
 * Run a single prompt through scratchblocks generation (model called directly).
 * No UI interaction — just prompt → model → parse → validate.
 */
async function runScratchblocksPrompt (page, userPrompt) {
    const result = {
        prompt: userPrompt,
        status: 'ERROR',
        rawOutput: null,
        parsedText: null,
        validation: null,
        timings: {},
        reason: null,
        tokenEstimate: null
    };

    try {
        // Build the scratchblocks prompt and call the model directly via page.evaluate.
        // We inject the prompt-building logic inline since we can't import ES modules in evaluate.
        const genStart = Date.now();
        const sbPrompt = buildPrompt(userPrompt, '(no scripts)', 'sprite "Sprite1"');
        const output = await page.evaluate(async (promptStr) => {
            if (!window.__aiModelLoaded || !window.__aiGenerate) {
                return {error: 'Model not loaded. Run a JSON generation via the UI first to load the model.'};
            }
            console.log('[ai-cdp-test] scratchblocks prompt length:', promptStr.length);
            const raw = await window.__aiGenerate(promptStr);
            return {raw, promptLength: promptStr.length};
        }, sbPrompt);

        result.timings.generation = Date.now() - genStart;

        if (output.error) {
            result.reason = output.error;
            return result;
        }

        result.rawOutput = output.raw;
        result.promptLength = output.promptLength;
        result.tokenEstimate = Math.ceil((output.raw || '').length / 4);

        // Parse and validate using the same functions (run in page context)
        const parsed = await page.evaluate((raw) => {
            // We need to call parseScratchblocksOutput in the page context
            // Since we can't easily import ES modules in evaluate, we'll inline the logic
            let text = raw.trim();
            text = text.replace(/```\s*$/, '').trim();
            const fenceMatch = text.match(/```(?:scratchblocks|scratch)?(?:[ \t]+\w+)?[ \t]*\n?([\s\S]*?)```/);
            if (fenceMatch) {
                text = fenceMatch[1].trim();
            } else {
                const openFence = text.match(/```(?:scratchblocks|scratch)?(?:[ \t]+\w+)?[ \t]*\n?([\s\S]*)/);
                if (openFence) {
                    text = openFence[1].trim();
                }
            }
            text = text.replace(/^\n+|\n+$/g, '');
            text = text.replace(/^(?:code|scratchblocks)\s*\n/, '');
            return text;
        }, output.raw);

        result.parsedText = normalizeScratchblocksLocal(parsed);

        // Validate locally (Node.js side) — replicate the validation logic
        const validation = validateScratchblocksLocal(result.parsedText);
        result.validation = validation;

        if (validation.valid) {
            result.status = 'PASS';
            result.reason = `Valid scratchblocks (${validation.stats.blocks} blocks, ${validation.stats.recognized} recognized)`;
        } else {
            result.status = 'FAIL';
            result.reason = `Validation errors: ${validation.errors.join('; ')}`;
        }

    } catch (err) {
        result.reason = err.message;
    }

    return result;
}

/**
 * Lightweight normalization — mirrors normalizeScratchblocks from ai-code-suggestions.js
 */
function normalizeScratchblocksLocal (text) {
    const lines = text.split('\n');
    const normalized = [];
    const nestOpeners = /^(forever|repeat \(.+\)|if <.*> then|repeat until <.*>)$/;
    let depth = 0;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const trimmed = line.trim();
        if (!trimmed) { normalized.push(line); continue; }

        // Normalize abbreviations
        if (trimmed === 'bounce') {
            line = line.replace('bounce', 'if on edge, bounce');
        }

        // Strip embellishments
        line = line.replace(/^(\s*move \(\d+\) steps)(\s+.*)$/, '$1');
        line = line.replace(/^(\s*turn (?:right|left) \(\d+\) degrees)(\s+.*)$/, '$1');

        // Normalize model hallucinations / common mistakes
        line = line.replace(/^(\s*)change angle by (\(.+?\)) degrees$/, '$1turn right $2 degrees');
        line = line.replace(/^(\s*)broadcast (?!\()(\S+)$/, '$1broadcast ($2 v)');
        line = line.replace(/^(\s*)broadcast (?!\()(\S+) and wait$/, '$1broadcast ($2 v) and wait');
        line = line.replace(/^(\s*)when I receive (?!\[)(\S+)$/, '$1when I receive [$2 v]');
        line = line.replace(/^(\s*)when (?!\[)(\S+) key pressed$/, '$1when [$2 v] key pressed');
        line = line.replace(/^(\s*)play sound (\(.+? v?\))$/,
            '$1start sound $2');

        const retrimmed = line.trim();

        // Handle orphan "end"
        if (retrimmed === 'end') {
            if (depth > 0) { depth--; normalized.push(line); }
            continue;
        }
        if (nestOpeners.test(retrimmed)) depth++;
        normalized.push(line);
    }
    return normalized.join('\n');
}

/**
 * Local (Node.js side) scratchblocks validator — mirrors validateScratchblocks from ai-code-suggestions.js
 */
function validateScratchblocksLocal (text) {
    const HAT_PATTERNS = [
        /^when green flag clicked$/,
        /^when \[.+\] key pressed$/,
        /^when this sprite clicked$/,
        /^when stage clicked$/,
        /^when backdrop switches to \[.+\]$/,
        /^when \[.+ v?\] > \(.+\)$/,
        /^when I receive \[.+ v?\]$/,
        /^when I start as a clone$/
    ];

    const BLOCK_PATTERNS = [
        /^move \(.+\) steps$/, /^turn right \(.+\) degrees$/, /^turn left \(.+\) degrees$/,
        /^go to x: ?\(.+\) y: ?\(.+\)$/, /^go to \(.+ v\)$/,
        /^glide \(.+\) secs to x: ?\(.+\) y: ?\(.+\)$/, /^glide \(.+\) secs to \(.+ v\)$/,
        /^point in direction \(.+\)$/, /^point towards \(.+ v\)$/,
        /^change x by \(.+\)$/, /^set x to \(.+\)$/,
        /^change y by \(.+\)$/, /^set y to \(.+\)$/,
        /^if on edge, bounce$/, /^set rotation style \[.+\]$/,
        /^say \[.*\] for \(.+\) seconds$/, /^say \[.*\]$/,
        /^think \[.*\] for \(.+\) seconds$/, /^think \[.*\]$/,
        /^switch costume to \(.+ v?\)$/, /^next costume$/,
        /^switch backdrop to \(.+ v?\)$/, /^next backdrop$/,
        /^change size by \(.+\)$/, /^set size to \(.+\) ?%?$/,
        /^change \[.+ v?\] effect by \(.+\)$/, /^set \[.+ v?\] effect to \(.+\)$/,
        /^clear graphic effects$/, /^show$/, /^hide$/,
        /^go to \[.+\] layer$/, /^go \[.+\] \(.+\) layers?$/,
        /^play sound \(.+ v?\) until done$/, /^start sound \(.+ v?\)$/,
        /^stop all sounds$/,
        /^change \[.+\] effect by \(.+\)$/, /^set \[.+\] effect to \(.+\)$/,
        /^clear sound effects$/,
        /^change volume by \(.+\)$/, /^set volume to \(.+\) ?%?$/,
        /^broadcast \(.+ v?\)$/, /^broadcast \(.+ v?\) and wait$/,
        /^wait \(.+\) seconds$/, /^repeat \(.+\)$/, /^forever$/,
        /^if <.*> then$/, /^else$/, /^end$/,
        /^wait until <.*>$/, /^repeat until <.*>$/,
        /^stop \[.+ v?\]$/,
        /^create clone of \(.+ v?\)$/, /^delete this clone$/,
        /^ask \[.*\] and wait$/, /^reset timer$/,
        /^set drag mode \[.+\]$/,
        /^set \[.+ v?\] to \(.+\)$/, /^change \[.+ v?\] by \(.+\)$/,
        /^show variable \[.+\]$/, /^hide variable \[.+\]$/,
        /^add \[.*\] to \[.+ v?\]$/, /^delete \(.+\) of \[.+ v?\]$/,
        /^delete all of \[.+ v?\]$/,
        /^insert \[.*\] at \(.+\) of \[.+ v?\]$/,
        /^replace item \(.+\) of \[.+ v?\] with \[.*\]$/,
        /^show list \[.+\]$/, /^hide list \[.+\]$/,
        /^erase all$/, /^stamp$/, /^pen down$/, /^pen up$/,
        /^set pen color to \[.+\]$/, /^change pen \(.+\) by \(.+\)$/,
        /^set pen \(.+\) to \(.+\)$/, /^change pen size by \(.+\)$/,
        /^set pen size to \(.+\)$/,
        /^play drum \(.+\) for \(.+\) beats$/, /^rest for \(.+\) beats$/,
        /^play note \(.+\) for \(.+\) beats$/, /^set instrument to \(.+\)$/,
        /^set tempo to \(.+\)$/, /^change tempo by \(.+\)$/,
        /^define /,
    ];

    const errors = [];
    const warnings = [];
    const lines = text.split('\n')
        .map(l => l.replace(/\t/g, '    ').trimEnd())
        .filter(l => l.trim().length > 0);

    if (lines.length === 0) {
        return {valid: false, lines: [], errors: ['Empty output'], warnings: [], stats: {blocks: 0, depth: 0}};
    }

    const firstLine = lines[0].trim();
    const isHat = HAT_PATTERNS.some(p => p.test(firstLine));
    if (!isHat) {
        errors.push(`First line is not a hat block: "${firstLine}"`);
    }

    const jsonArtifacts = lines.some(l => /[{}\[\]]/.test(l.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '')));
    if (jsonArtifacts) {
        errors.push('Output contains JSON-like artifacts');
    }

    let depth = 0;
    let maxDepth = 0;
    let recognized = 0;
    let unrecognized = 0;
    const nestOpeners = /^(forever|repeat \(.+\)|if <.*> then|repeat until <.*>|else)$/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === 'end') {
            depth--;
            if (depth < 0) { errors.push(`Unexpected "end" at line ${i + 1}`); depth = 0; }
            recognized++;
            continue;
        }
        if (line === 'else') { recognized++; continue; }
        const isKnown = HAT_PATTERNS.some(p => p.test(line)) || BLOCK_PATTERNS.some(p => p.test(line));
        if (isKnown) { recognized++; } else { unrecognized++; warnings.push(`Unrecognized: "${line}"`); }
        if (nestOpeners.test(line)) { depth++; if (depth > maxDepth) maxDepth = depth; }
    }

    if (depth > 0) errors.push(`Unclosed nesting: ${depth} missing "end"`);

    return {
        valid: errors.length === 0,
        lines,
        errors,
        warnings,
        stats: {blocks: lines.length, maxDepth, recognized, unrecognized}
    };
}

function printScratchblocksResult (result) {
    const icon = result.status === 'PASS' ? 'PASS' : result.status === 'FAIL' ? 'FAIL' : 'ERR ';
    console.log(`\n${'='.repeat(70)}`);
    console.log(`[${icon}] "${result.prompt}" (scratchblocks)`);
    if (result.parsedText) {
        console.log(`  Output:\n${result.parsedText.split('\n').map(l => `    ${l}`).join('\n')}`);
    }
    if (result.validation) {
        const s = result.validation.stats;
        console.log(`  Stats: ${s.blocks} blocks, depth=${s.maxDepth}, ${s.recognized}/${s.blocks} recognized`);
        if (result.validation.errors.length) {
            console.log(`  Errors: ${result.validation.errors.join('; ')}`);
        }
        if (result.validation.warnings.length) {
            console.log(`  Warnings: ${result.validation.warnings.join('; ')}`);
        }
    }
    console.log(`  Reason: ${result.reason || '(none)'}`);
    if (result.timings.generation) {
        console.log(`  Generation: ${(result.timings.generation / 1000).toFixed(1)}s`);
    }
    if (result.promptLength) {
        console.log(`  Prompt length: ${result.promptLength} chars (~${Math.ceil(result.promptLength / 4)} tokens)`);
    }
    if (result.tokenEstimate) {
        console.log(`  Output tokens (est): ~${result.tokenEstimate}`);
    }
    if (result.rawOutput && result.rawOutput !== result.parsedText) {
        console.log(`  Raw output:\n${result.rawOutput.substring(0, 1000).split('\n').map(l => `    ${l}`).join('\n')}`);
    }
    console.log('='.repeat(70));
}

/**
 * Ensure the model is loaded by triggering one JSON generation through the UI.
 */
async function ensureModelLoaded (page) {
    const loaded = await page.evaluate(() => window.__aiModelLoaded);
    if (loaded) {
        console.log('Model already loaded.');
        return;
    }

    console.log('Model not loaded. Triggering one UI generation to load it...');
    // Run one quick prompt through the normal UI pipeline
    const warmupResult = await runPrompt(page, 'when green flag clicked, move 10 steps');
    if (warmupResult.status === 'ERROR' && warmupResult.reason?.includes('timed out')) {
        throw new Error('Could not load model (timed out during warmup generation)');
    }
    console.log(`Warmup generation done (status: ${warmupResult.status}). Model should now be loaded.`);

    const loadedNow = await page.evaluate(() => window.__aiModelLoaded);
    if (!loadedNow) {
        throw new Error('Model still not loaded after warmup generation');
    }
}

/**
 * Run all test prompts through scratchblocks generation and validate.
 */
async function runScratchblocks () {
    const {browser, page} = await connectToChrome();
    const results = [];
    try {
        await ensureModelLoaded(page);

        for (const testCase of TEST_PROMPTS) {
            console.log(`\n--- Scratchblocks: "${testCase.name}" ---`);
            const result = await runScratchblocksPrompt(page, testCase.prompt);
            printScratchblocksResult(result);
            results.push({name: testCase.name, ...result});
        }

        // Summary
        console.log(`\n${'='.repeat(70)}`);
        console.log('SCRATCHBLOCKS SUMMARY');
        console.log('='.repeat(70));
        const passed = results.filter(r => r.status === 'PASS').length;
        const failed = results.filter(r => r.status === 'FAIL').length;
        const errors = results.filter(r => r.status === 'ERROR').length;
        const totalGenTime = results.reduce((s, r) => s + (r.timings.generation || 0), 0);
        for (const r of results) {
            const icon = r.status === 'PASS' ? 'OK  ' : r.status === 'FAIL' ? 'FAIL' : 'ERR ';
            const stats = r.validation?.stats;
            const detail = stats ? `${stats.blocks} blocks, ${stats.recognized}/${stats.blocks} recognized` : '';
            console.log(`  [${icon}] ${r.name}: ${r.reason || ''} ${detail ? `(${detail})` : ''}`);
        }
        console.log('-'.repeat(70));
        console.log(`  Total: ${results.length} | Passed: ${passed} | Failed: ${failed} | Errors: ${errors}`);
        console.log(`  Total generation time: ${(totalGenTime / 1000).toFixed(1)}s`);
        console.log('='.repeat(70));
    } finally {
        try { await browser.close(); } catch { /* ignore */ }
    }
    return results;
}

/**
 * Run all test prompts through BOTH JSON and scratchblocks modes, compare results.
 */
async function runCompare () {
    const {browser, page} = await connectToChrome();
    const comparisons = [];
    try {
        await ensureModelLoaded(page);

        for (const testCase of TEST_PROMPTS) {
            console.log(`\n${'#'.repeat(70)}`);
            console.log(`# Comparing: "${testCase.name}"`);
            console.log('#'.repeat(70));

            // JSON mode (full pipeline)
            console.log('\n  [JSON MODE]');
            const jsonResult = await runPrompt(
                page, testCase.prompt, testCase.verify, testCase.expectedOpcodes
            );
            printResult(jsonResult);

            // Scratchblocks mode (direct model call)
            console.log('\n  [SCRATCHBLOCKS MODE]');
            const sbResult = await runScratchblocksPrompt(page, testCase.prompt);
            printScratchblocksResult(sbResult);

            comparisons.push({
                name: testCase.name,
                json: {status: jsonResult.status, time: jsonResult.timings.generation, reason: jsonResult.reason},
                scratchblocks: {
                    status: sbResult.status,
                    time: sbResult.timings.generation,
                    reason: sbResult.reason,
                    blocks: sbResult.validation?.stats?.blocks,
                    recognized: sbResult.validation?.stats?.recognized
                }
            });
        }

        // Comparison summary
        console.log(`\n${'='.repeat(70)}`);
        console.log('COMPARISON SUMMARY');
        console.log('='.repeat(70));
        console.log(`  ${'Test'.padEnd(25)} ${'JSON'.padEnd(12)} ${'Scratchblocks'.padEnd(15)} ${'JSON time'.padEnd(12)} ${'SB time'.padEnd(12)}`);
        console.log(`  ${'-'.repeat(25)} ${'-'.repeat(12)} ${'-'.repeat(15)} ${'-'.repeat(12)} ${'-'.repeat(12)}`);
        let jsonPassed = 0;
        let sbPassed = 0;
        let totalJsonTime = 0;
        let totalSbTime = 0;
        for (const c of comparisons) {
            const jTime = c.json.time ? `${(c.json.time / 1000).toFixed(1)}s` : 'N/A';
            const sTime = c.scratchblocks.time ? `${(c.scratchblocks.time / 1000).toFixed(1)}s` : 'N/A';
            console.log(`  ${c.name.padEnd(25)} ${c.json.status.padEnd(12)} ${c.scratchblocks.status.padEnd(15)} ${jTime.padEnd(12)} ${sTime.padEnd(12)}`);
            if (c.json.status === 'PASS') jsonPassed++;
            if (c.scratchblocks.status === 'PASS') sbPassed++;
            totalJsonTime += c.json.time || 0;
            totalSbTime += c.scratchblocks.time || 0;
        }
        console.log(`  ${'-'.repeat(25)} ${'-'.repeat(12)} ${'-'.repeat(15)} ${'-'.repeat(12)} ${'-'.repeat(12)}`);
        console.log(`  ${'TOTAL'.padEnd(25)} ${`${jsonPassed}/${comparisons.length}`.padEnd(12)} ${`${sbPassed}/${comparisons.length}`.padEnd(15)} ${`${(totalJsonTime / 1000).toFixed(1)}s`.padEnd(12)} ${`${(totalSbTime / 1000).toFixed(1)}s`.padEnd(12)}`);
        console.log('='.repeat(70));
    } finally {
        try { await browser.close(); } catch { /* ignore */ }
    }
    return comparisons;
}

// ---------------------------------------------------------------------------
// End-to-end scratchblocks mode: generate → convert → add to workspace → run → verify
// ---------------------------------------------------------------------------

/**
 * Run a single prompt through the full scratchblocks pipeline:
 * model generates text → scratchblocksToVMBlocks → shareBlocksToTarget → run → verify
 */
async function runE2EScratchblocksPrompt (page, prompt, verifyFn = null, {skipBlockReset = false} = {}) {
    const result = {
        prompt,
        status: 'ERROR',
        scratchblocksText: null,
        vmBlockCount: null,
        stateBefore: null,
        stateAfter: null,
        consoleErrors: [],
        reason: null,
        timings: {}
    };

    const consoleErrors = [];
    const consoleHandler = msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text().substring(0, 500));
        const text = msg.text();
        if (text.includes('scratchblocksToVMBlocks') || text.includes('ai-code-suggestions')) {
            console.log(`  [browser ${msg.type()}] ${text.substring(0, 300)}`);
        }
    };
    page.on('console', consoleHandler);

    try {
        // Dismiss webpack overlay
        await page.evaluate(() => {
            const overlay = document.getElementById('webpack-dev-server-client-overlay');
            if (overlay) overlay.remove();
        });

        // Reset sprite (optionally keep existing blocks for fixture tests)
        if (skipBlockReset) {
            console.log('\n--- Resetting sprite position (keeping blocks) ---');
            await page.evaluate(`(() => {
                const store = ${getStoreHelper};
                if (!store) return;
                const vm = store.getState().scratchGui.vm;
                if (vm?.editingTarget) {
                    vm.editingTarget.setXY(0, 0);
                    vm.editingTarget.setDirection(90);
                    vm.editingTarget.setSize(100);
                    vm.editingTarget.setVisible(true);
                    vm.editingTarget.clearEffects();
                }
            })()`);
        } else {
            console.log('\n--- Resetting sprite state ---');
            const cleared = await page.evaluate(resetSprite);
            console.log(`  Cleared ${cleared?.cleared || 0} blocks`);
        }
        await page.waitForTimeout(300);

        // Step 1: Generate scratchblocks text
        console.log(`--- Generating scratchblocks: "${prompt}" ---`);
        const genStart = Date.now();
        const sbPrompt = buildPrompt(prompt, '(no scripts)', 'sprite "Sprite1"');
        const genResult = await page.evaluate(async (promptStr) => {
            if (!window.__aiModelLoaded || !window.__aiGenerate) {
                return {error: 'Model not loaded'};
            }
            const raw = await window.__aiGenerate(promptStr);
            return {raw, promptLength: promptStr.length};
        }, sbPrompt);

        result.timings.generation = Date.now() - genStart;

        if (genResult.error) {
            result.reason = genResult.error;
            return result;
        }

        // Step 2: Parse the output (fence stripping + normalization)
        let sbText = genResult.raw.trim();
        sbText = sbText.replace(/```\s*$/, '').trim();
        const fenceMatch = sbText.match(/```(?:scratchblocks|scratch)?(?:[ \t]+\w+)?[ \t]*\n?([\s\S]*?)```/);
        if (fenceMatch) {
            sbText = fenceMatch[1].trim();
        } else {
            const openFence = sbText.match(/```(?:scratchblocks|scratch)?(?:[ \t]+\w+)?[ \t]*\n?([\s\S]*)/);
            if (openFence) sbText = openFence[1].trim();
        }
        sbText = sbText.replace(/^\n+|\n+$/g, '');
        sbText = sbText.replace(/^(?:code|scratchblocks)\s*\n/, '');
        sbText = normalizeScratchblocksLocal(sbText);
        result.scratchblocksText = sbText;

        console.log(`  Scratchblocks output:\n${sbText.split('\n').map(l => `    ${l}`).join('\n')}`);

        // Step 3: Convert to VM blocks inside the page (where scratchblocksToVMBlocks is available)
        const convertResult = await page.evaluate((text) => {
            try {
                // Access the module's scratchblocksToVMBlocks function via webpack
                // We need to call it in page context — use the window export
                const blocks = window.__scratchblocksToVMBlocks(text);
                return {blocks, error: null};
            } catch (err) {
                return {blocks: null, error: err.message};
            }
        }, sbText);

        if (convertResult.error) {
            result.reason = `Conversion error: ${convertResult.error}`;
            return result;
        }

        const blocks = convertResult.blocks;
        result.vmBlockCount = blocks.length;
        console.log(`  Converted to ${blocks.length} VM blocks`);
        console.log(`  Opcodes: ${blocks.filter(b => !b.shadow).map(b => b.opcode).join(', ')}`);

        // Step 4: Add blocks to workspace
        console.log('\n--- Adding blocks to workspace ---');
        const addResult = await page.evaluate((blocksJson) => {
            const store = (() => {
                const guiEl = document.querySelector('[class*="gui"]');
                const fiberKey = Object.keys(guiEl).find(k => k.startsWith('__reactFiber$'));
                let fiber = guiEl[fiberKey];
                while (fiber) {
                    if (fiber.memoizedProps?.store) return fiber.memoizedProps.store;
                    fiber = fiber.return;
                }
                return null;
            })();
            const vm = store?.getState().scratchGui.vm;
            if (!vm?.editingTarget) return {error: 'No editing target'};
            const blocks = JSON.parse(blocksJson);
            return vm.shareBlocksToTarget(blocks, vm.editingTarget.id)
                .then(() => {
                    vm.refreshWorkspace();
                    return {
                        blockCount: Object.keys(vm.editingTarget.blocks._blocks).length,
                        opcodes: Object.values(vm.editingTarget.blocks._blocks).map(b => b.opcode)
                    };
                })
                .catch(err => ({error: err.message}));
        }, JSON.stringify(blocks));

        if (addResult?.error) {
            result.reason = `Add to workspace error: ${addResult.error}`;
            return result;
        }

        result.stateBefore = addResult;
        console.log(`  Blocks in workspace: ${addResult.blockCount}`);

        // Step 5: Reset position, run, verify
        console.log('\n--- Running project ---');
        await page.evaluate(`(() => {
            const guiEl = document.querySelector('[class*="gui"]');
            const fiberKey = Object.keys(guiEl).find(k => k.startsWith('__reactFiber$'));
            let fiber = guiEl[fiberKey];
            let store = null;
            while (fiber) { if (fiber.memoizedProps?.store) { store = fiber.memoizedProps.store; break; } fiber = fiber.return; }
            const vm = store?.getState().scratchGui.vm;
            if (vm?.editingTarget) {
                vm.editingTarget.setXY(0, 0);
                vm.editingTarget.setDirection(90);
                vm.editingTarget.setSize(100);
                vm.editingTarget.setVisible(true);
                vm.editingTarget.clearEffects();
            }
        })()`);

        await page.click('[class*="green-flag"]');
        console.log(`  Running for ${RUN_DURATION}ms...`);
        await page.waitForTimeout(RUN_DURATION);

        result.stateAfter = await page.evaluate(vmHelpers.getFullState);

        await page.evaluate(() => {
            const overlay = document.getElementById('webpack-dev-server-client-overlay');
            if (overlay) overlay.remove();
        });
        await page.click('[class*="stop-all"]');
        await page.waitForTimeout(300);

        console.log(`  State: pos=(${result.stateAfter?.x},${result.stateAfter?.y}), dir=${result.stateAfter?.direction}, size=${result.stateAfter?.size}, visible=${result.stateAfter?.visible}`);

        // Verify
        if (verifyFn && result.stateAfter) {
            const v = verifyFn(result.stateAfter);
            result.status = v.pass ? 'PASS' : 'FAIL';
            result.reason = v.detail;
        } else {
            result.status = 'PASS';
            result.reason = `${blocks.length} VM blocks added, project ran`;
        }

        result.consoleErrors = consoleErrors;
    } catch (err) {
        result.reason = err.message;
    } finally {
        page.off('console', consoleHandler);
    }
    return result;
}

/**
 * Run all test prompts through the full scratchblocks E2E pipeline.
 * Handles fixture groups: blank → multi-sprite → existing-code.
 */
async function runE2EScratchblocks () {
    const {browser, page} = await connectToChrome();
    const results = [];
    try {
        await ensureModelLoaded(page);

        // Verify converter is available
        const hasConverter = await page.evaluate(() => typeof window.__scratchblocksToVMBlocks === 'function');
        if (!hasConverter) {
            console.log('WARNING: window.__scratchblocksToVMBlocks not found.');
            console.log('Aborting e2e test.');
            return results;
        }

        // Partition prompts by group
        const blankPrompts = TEST_PROMPTS.filter(t => !t.group || t.group === 'blank');
        const multiSpritePrompts = TEST_PROMPTS.filter(t => t.group === 'multi-sprite');
        const existingCodePrompts = TEST_PROMPTS.filter(t => t.group === 'existing-code');

        // --- Run blank-project prompts ---
        console.log(`\n${'='.repeat(70)}`);
        console.log(`BLANK PROJECT PROMPTS (${blankPrompts.length})`);
        console.log('='.repeat(70));
        for (const testCase of blankPrompts) {
            console.log(`\n${'#'.repeat(70)}`);
            console.log(`# E2E: "${testCase.name}"`);
            console.log('#'.repeat(70));
            const result = await runE2EScratchblocksPrompt(page, testCase.prompt, testCase.verify);
            printResult(result);
            results.push({name: testCase.name, group: 'blank', ...result});
        }

        // --- Set up multi-sprite project, run group E ---
        if (multiSpritePrompts.length > 0) {
            console.log(`\n${'='.repeat(70)}`);
            console.log(`MULTI-SPRITE PROMPTS (${multiSpritePrompts.length})`);
            console.log('='.repeat(70));

            // Reset to clean state first
            await resetToBlankProject(page);
            await page.waitForTimeout(500);

            const setupResult = await setupMultiSpriteProject(page);
            console.log(`  Multi-sprite setup: ${JSON.stringify(setupResult)}`);

            for (const testCase of multiSpritePrompts) {
                console.log(`\n${'#'.repeat(70)}`);
                console.log(`# E2E [multi-sprite]: "${testCase.name}" (target: ${testCase.targetSprite || 'default'})`);
                console.log('#'.repeat(70));

                // Switch to target sprite if specified
                if (testCase.targetSprite) {
                    const switched = await switchToSprite(page, testCase.targetSprite);
                    console.log(`  Switched to ${testCase.targetSprite}: ${JSON.stringify(switched)}`);
                }

                const result = await runE2EScratchblocksPrompt(page, testCase.prompt, testCase.verify);
                printResult(result);
                results.push({name: testCase.name, group: 'multi-sprite', ...result});
            }

            // Clean up
            await resetToBlankProject(page);
            await page.waitForTimeout(500);
        }

        // --- Set up existing code, run group F ---
        if (existingCodePrompts.length > 0) {
            console.log(`\n${'='.repeat(70)}`);
            console.log(`EXISTING CODE PROMPTS (${existingCodePrompts.length})`);
            console.log('='.repeat(70));

            const existingCode = 'when green flag clicked\nforever\n\tmove (10) steps\n\tif on edge, bounce\nend';
            const codeResult = await setupProjectWithExistingCode(page, existingCode);
            console.log(`  Existing code setup: ${JSON.stringify(codeResult)}`);

            for (const testCase of existingCodePrompts) {
                console.log(`\n${'#'.repeat(70)}`);
                console.log(`# E2E [existing-code]: "${testCase.name}"`);
                console.log('#'.repeat(70));
                const result = await runE2EScratchblocksPrompt(page, testCase.prompt, testCase.verify, {skipBlockReset: true});
                printResult(result);
                results.push({name: testCase.name, group: 'existing-code', ...result});
            }

            // Clean up
            await resetToBlankProject(page);
        }

        // Summary
        printE2ESummary(results);
    } finally {
        try { await browser.close(); } catch { /* ignore */ }
    }
    return results;
}

function printE2ESummary (results) {
    console.log(`\n${'='.repeat(70)}`);
    console.log('E2E SCRATCHBLOCKS SUMMARY');
    console.log('='.repeat(70));
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const errors = results.filter(r => r.status === 'ERROR').length;

    // Group results by group
    const groups = {};
    for (const r of results) {
        const g = r.group || 'blank';
        if (!groups[g]) groups[g] = [];
        groups[g].push(r);
    }

    for (const [group, groupResults] of Object.entries(groups)) {
        console.log(`\n  [${group}]`);
        for (const r of groupResults) {
            const icon = r.status === 'PASS' ? 'OK  ' : r.status === 'FAIL' ? 'FAIL' : 'ERR ';
            console.log(`    [${icon}] ${r.name}: ${r.reason || ''}`);
        }
    }

    console.log('-'.repeat(70));
    console.log(`  Total: ${results.length} | Passed: ${passed} | Failed: ${failed} | Errors: ${errors}`);
    console.log(`  Pass rate: ${(passed / results.length * 100).toFixed(0)}%`);
    console.log('='.repeat(70));
}

/**
 * Run the E2E suite multiple times and aggregate pass rates.
 */
async function runE2EScratchblocksLoop (iterations) {
    const allRuns = [];

    for (let i = 0; i < iterations; i++) {
        console.log(`\n${'*'.repeat(70)}`);
        console.log(`* LOOP ITERATION ${i + 1} of ${iterations}`);
        console.log('*'.repeat(70));

        const results = await runE2EScratchblocks();
        allRuns.push(results);
    }

    printLoopSummary(allRuns, iterations);
    return allRuns;
}

function printLoopSummary (allRuns, iterations) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`LOOP SUMMARY (${iterations} iterations)`);
    console.log('='.repeat(70));

    // Aggregate per-prompt pass rates
    const promptStats = {};
    for (const run of allRuns) {
        for (const r of run) {
            if (!promptStats[r.name]) {
                promptStats[r.name] = {passes: 0, fails: 0, errors: 0, group: r.group || 'blank'};
            }
            if (r.status === 'PASS') promptStats[r.name].passes++;
            else if (r.status === 'FAIL') promptStats[r.name].fails++;
            else promptStats[r.name].errors++;
        }
    }

    // Sort: consistent passes first, then flaky, then consistent fails
    const sorted = Object.entries(promptStats).sort((a, b) => {
        const aRate = a[1].passes / iterations;
        const bRate = b[1].passes / iterations;
        return bRate - aRate;
    });

    let totalPasses = 0;
    let totalTests = 0;
    let flaky = 0;

    console.log(`  ${'Test'.padEnd(30)} ${'Group'.padEnd(15)} ${'Pass Rate'.padEnd(12)} ${'Status'}`);
    console.log(`  ${'-'.repeat(30)} ${'-'.repeat(15)} ${'-'.repeat(12)} ${'-'.repeat(8)}`);

    for (const [name, stats] of sorted) {
        const rate = stats.passes / iterations;
        const pct = `${stats.passes}/${iterations} (${(rate * 100).toFixed(0)}%)`;
        let status;
        if (rate === 1) {
            status = 'SOLID';
        } else if (rate === 0) {
            status = 'BROKE';
        } else {
            status = 'FLAKY';
            flaky++;
        }
        console.log(`  ${name.padEnd(30)} ${stats.group.padEnd(15)} ${pct.padEnd(12)} ${status}`);
        totalPasses += stats.passes;
        totalTests += iterations;
    }

    console.log('-'.repeat(70));
    const overallRate = (totalPasses / totalTests * 100).toFixed(0);
    console.log(`  Overall: ${totalPasses}/${totalTests} (${overallRate}%)`);
    console.log(`  Solid: ${sorted.filter(([, s]) => s.passes === iterations).length} | Flaky: ${flaky} | Broken: ${sorted.filter(([, s]) => s.passes === 0).length}`);
    console.log('='.repeat(70));
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
async function main () {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
AI Code Suggestions CDP Tester

Usage:
  node ai-cdp-test.js "prompt text"     Run a single prompt
  node ai-cdp-test.js --all             Run all built-in test prompts
  node ai-cdp-test.js --interactive     Interactive prompt loop
  node ai-cdp-test.js --list            List built-in test prompts
  node ai-cdp-test.js --scratchblocks   Test scratchblocks text generation
  node ai-cdp-test.js --e2e-scratchblocks  Full pipeline: generate → convert → add → run → verify
  node ai-cdp-test.js --loop N --e2e-scratchblocks  Run E2E suite N times, aggregate results
  node ai-cdp-test.js --compare         Compare JSON vs scratchblocks modes

Prerequisites:
  1. Chrome running with: --remote-debugging-port=9222
  2. Dev server running on localhost:8601 (npm run start)

Interactive commands:
  state    - Show current sprite state
  reset    - Reset sprite position/blocks
  reload   - Reload the editor page
  all      - Run all built-in prompts
  quit     - Exit
`);
        return;
    }

    if (args.includes('--list')) {
        console.log('Built-in test prompts:');
        for (const t of TEST_PROMPTS) {
            console.log(`  ${t.name}: "${t.prompt}"`);
        }
        return;
    }

    // Parse --loop N flag
    const loopIdx = args.indexOf('--loop');
    const loopCount = loopIdx >= 0 ? parseInt(args[loopIdx + 1], 10) || 3 : 0;

    if (args.includes('--e2e-scratchblocks') && loopCount > 0) {
        await runE2EScratchblocksLoop(loopCount);
    } else if (args.includes('--e2e-scratchblocks')) {
        await runE2EScratchblocks();
    } else if (args.includes('--scratchblocks')) {
        await runScratchblocks();
    } else if (args.includes('--compare')) {
        await runCompare();
    } else if (args.includes('--all')) {
        await runAll();
    } else if (args.includes('--interactive') || args.includes('-i')) {
        await runInteractive();
    } else if (args.length > 0) {
        const prompt = args.join(' ');
        await runSingle(prompt);
    } else {
        // Default to interactive
        await runInteractive();
    }
}

main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
