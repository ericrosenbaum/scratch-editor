/**
 * @file The single "intro" Microworld definition.
 *
 * A Microworld is a short, guided sequence of first-steps. Each step declares:
 *   - `reveal`:     which editor chrome is visible during the step
 *   - `palette`:    the block opcodes allowed in the toolbox (null = all). The
 *                   toolbox is visually hidden during the intro, but the palette
 *                   is kept so the filtered toolbox stays minimal.
 *   - `preload`:    a preloaded block stack seeded onto the sprite
 *   - `clickTarget`: CSS selector the "Show me" cursor taps (click/flag steps)
 *   - `dragHint`:   {block, anchor, placement, color} for the animated drag
 *                   "Show me" cursor on drag-to-connect steps
 *   - `advanceOn`:  the signal that lets the user move to the next step
 *                   ('scriptGlow' | 'greenFlag' | 'blocksConnected')
 *   - `connection`: for 'blocksConnected' steps, the expected `parent.next ===
 *                   child` connection (matched in either direction)
 *   - `finishLabel`: for the final, taskless handoff step, the label of the
 *                   call-to-action button that opens the full editor (a step
 *                   with no `advanceOn` waits for this button instead of a gate)
 *
 * Text is intentionally minimal to reduce information overload for new users.
 * Prototype scope: English-only strings (no i18n yet).
 */

import {
    buildSayStack,
    buildLooseStack,
    buildConnectedStack,
    buildHatPlusStack,
    buildFullStack,
    HAT_ID,
    SAY_ID,
    GLIDE_ID
} from './blocks';

const MESSAGE = 'Hello!';

const intro = {
    id: 'intro',
    name: 'Get started',
    steps: [
        {
            // You can click a block to run it.
            id: 'click-to-run',
            prompt: 'Click the say block to try it',
            reveal: {blocks: true},
            palette: ['looks_sayforsecs'],
            preload: () => buildSayStack({withHat: false, message: MESSAGE, secs: 2}),
            clickTarget: `[data-id="${SAY_ID}"]`,
            advanceOn: 'scriptGlow'
        },
        {
            // A second block connects below the first to make a stack.
            id: 'drag-stack',
            prompt: 'Drag the blocks together to make a stack',
            reveal: {blocks: true},
            palette: ['looks_sayforsecs', 'motion_glideto'],
            preload: () => buildLooseStack({message: MESSAGE, secs: 2}),
            dragHint: {
                block: `[data-id="${GLIDE_ID}"]`,
                anchor: `[data-id="${SAY_ID}"]`,
                placement: 'below',
                color: '#4C97FF' // motion (glide)
            },
            advanceOn: 'blocksConnected',
            connection: {parent: SAY_ID, child: GLIDE_ID}
        },
        {
            // Blocks run from top to bottom, one after another.
            id: 'click-stack',
            prompt: 'Click the blocks to run them in order',
            reveal: {blocks: true},
            palette: ['looks_sayforsecs', 'motion_glideto'],
            preload: () => buildConnectedStack({message: MESSAGE, secs: 2}),
            clickTarget: `[data-id="${SAY_ID}"]`,
            advanceOn: 'scriptGlow'
        },
        {
            // A green-flag hat connects on top of the stack.
            id: 'connect-hat',
            prompt: 'Connect the green flag block to your stack',
            reveal: {blocks: true},
            palette: ['event_whenflagclicked', 'looks_sayforsecs', 'motion_glideto'],
            preload: () => buildHatPlusStack({message: MESSAGE, secs: 2}),
            dragHint: {
                block: `[data-id="${HAT_ID}"]`,
                anchor: `[data-id="${SAY_ID}"]`,
                placement: 'above',
                color: '#FFBF00' // events (hat)
            },
            advanceOn: 'blocksConnected',
            connection: {parent: HAT_ID, child: SAY_ID}
        },
        {
            // The green flag runs the whole stack.
            id: 'click-flag',
            prompt: 'Click the green flag button to run your code',
            reveal: {blocks: true, greenFlag: true},
            palette: ['event_whenflagclicked', 'looks_sayforsecs', 'motion_glideto'],
            preload: () => buildFullStack({message: MESSAGE, secs: 2}),
            clickTarget: '[class*="green-flag"]',
            // Pulse the green flag button until it's clicked, to draw the eye to
            // it (the only off-card control this intro asks the user to press).
            pulseTarget: '[class*="green-flag"]',
            advanceOn: 'greenFlag'
        },
        {
            // A project can have more than one sprite. Reveal a simplified
            // sprite pane and let the user add one from the library.
            id: 'add-sprite',
            prompt: 'Now let’s add another sprite',
            reveal: {blocks: true, greenFlag: true, spritePane: true},
            palette: ['event_whenflagclicked', 'looks_sayforsecs', 'motion_glideto'],
            preload: () => buildFullStack({message: MESSAGE, secs: 2}),
            clickTarget: '[class*="sprite-selector_add-button"]',
            advanceOn: 'spriteAdded'
        },
        {
            // Handoff: celebrate, then let the user open the full editor
            // themselves. No preload (keep the learner's work) and no advanceOn
            // (button-only finish); reveal matches the prior step so nothing
            // hides on entry.
            id: 'all-set',
            prompt: 'You did it! Ready to make your own?',
            reveal: {blocks: true, greenFlag: true, spritePane: true},
            palette: ['event_whenflagclicked', 'looks_sayforsecs', 'motion_glideto'],
            finishLabel: 'Open the editor'
        }
    ]
};

export default intro;
