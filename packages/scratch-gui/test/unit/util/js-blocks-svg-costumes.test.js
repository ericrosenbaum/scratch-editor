import {SIGN_COSTUME, ROBOT_COSTUME} from '../../../src/lib/js-blocks/svg-costumes';
import {PROJECTS} from '../../../src/lib/js-blocks/projects';

/**
 * Parse a costume's SVG source and collect its element ids.
 * @param {object} costume - {svg}.
 * @returns {{doc: Document, ids: Set<string>}} parsed document and id set.
 */
const parseCostume = costume => {
    const doc = new DOMParser().parseFromString(costume.svg, 'image/svg+xml');
    expect(doc.documentElement.nodeName).toBe('svg'); // not a parsererror
    const ids = new Set(
        Array.from(doc.querySelectorAll('[id]')).map(el => el.getAttribute('id'))
    );
    return {doc, ids};
};

describe('svg example costumes', () => {
    test('sign costume parses and has the text lines the Sign blocks target', () => {
        const {doc, ids} = parseCostume(SIGN_COSTUME);
        expect(ids.has('line1')).toBe(true);
        expect(ids.has('line2')).toBe(true);
        for (const line of ['line1', 'line2']) {
            expect(doc.querySelector(`[id="${line}"]`).nodeName).toBe('text');
        }
    });

    test('robot costume parses and has every part the Robot Puppet project reaches for', () => {
        const {doc, ids} = parseCostume(ROBOT_COSTUME);
        const reached = [
            'arm-left', 'arm-right', 'pupil-left', 'pupil-right',
            'brow-left', 'brow-right', 'mouth-smile', 'mouth-open', 'light'
        ];
        for (const id of reached) expect(ids.has(id)).toBe(true);
        // Rotating parts carry the pivot hint Scratch.svg.rotate defaults to.
        for (const id of ['arm-left', 'arm-right', 'brow-left', 'brow-right']) {
            expect(doc.querySelector(`[id="${id}"]`).getAttribute('data-pivot')).toMatch(/^-?[\d.]+[ ,]-?[\d.]+$/);
        }
        // The expression swap starts with the open mouth hidden.
        expect(doc.querySelector('[id="mouth-open"]').getAttribute('display')).toBe('none');
    });

    test('costumes have no active content', () => {
        for (const costume of [SIGN_COSTUME, ROBOT_COSTUME]) {
            expect(costume.svg).not.toMatch(/<script|href|\son\w+=/i);
        }
    });

    test('the svg projects declare their costumes', () => {
        const sign = PROJECTS.find(p => p.id === 'talking-sign');
        const robot = PROJECTS.find(p => p.id === 'robot-puppet');
        expect(sign.costumes).toEqual([SIGN_COSTUME]);
        expect(robot.costumes).toEqual([ROBOT_COSTUME]);
    });
});
