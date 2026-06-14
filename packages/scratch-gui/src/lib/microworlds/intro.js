/**
 * @file The single "intro" Microworld definition.
 *
 * A Microworld is a strict-but-choice-driven sequence of steps. Each step
 * declares:
 *   - `reveal`:   which editor chrome is visible during the step
 *   - `palette`:  the block opcodes allowed in the toolbox (null = all)
 *   - `preload`:  an optional preloaded block stack to seed onto the sprite
 *   - `choices`:  optional choice buttons that preserve user agency
 *   - `advanceOn`: the signal that lets the user move to the next step
 *
 * Text is intentionally minimal to reduce information overload for new users.
 * Prototype scope: English-only strings (no i18n yet).
 */

import {buildSayStack} from './blocks';

const intro = {
    id: 'intro',
    name: 'Get started',
    steps: [
        {
            // Confusion #1: you can click a block to run it.
            id: 'click-to-run',
            prompt: 'Click the block to make the cat talk.',
            hint: 'A single click runs a block right away.',
            reveal: {blocks: true},
            palette: ['looks_sayforsecs'],
            preload: () => buildSayStack({withHat: false, message: 'Hello!', secs: 2}),
            choices: {
                label: 'What should the cat say?',
                options: [
                    {label: 'Hello!', value: 'Hello!'},
                    {label: 'Hi there!', value: 'Hi there!'},
                    {label: 'Meow!', value: 'Meow!'}
                ]
            },
            advanceOn: 'scriptGlow'
        },
        {
            // Confusion #2: the green flag runs a whole stack.
            id: 'green-flag',
            prompt: 'Now click the green flag to run your code.',
            hint: 'The green flag starts every stack at once.',
            reveal: {blocks: true, greenFlag: true},
            palette: ['event_whenflagclicked', 'looks_sayforsecs'],
            preload: () => buildSayStack({withHat: true, message: 'Hello!', secs: 2}),
            advanceOn: 'greenFlag'
        },
        {
            // Confusion #3: a second block runs after the first (sequence).
            id: 'second-block',
            prompt: 'Snap another "say" block under the first one, then click the green flag.',
            hint: 'Blocks run from top to bottom, one after another.',
            reveal: {blocks: true, greenFlag: true},
            palette: ['event_whenflagclicked', 'looks_sayforsecs'],
            advanceOn: 'blocksAdded'
        },
        {
            // Confusion #4: a new sprite has its own code that also runs.
            id: 'add-sprite',
            prompt: 'Add a new sprite. Each sprite has its own code.',
            hint: 'Use the add-sprite button below the stage.',
            reveal: {blocks: true, greenFlag: true, spritePane: true},
            palette: ['event_whenflagclicked', 'looks_sayforsecs', 'motion_movesteps'],
            advanceOn: 'spriteAdded'
        }
    ]
};

export default intro;
