import React from 'react';
import {act, render} from '@testing-library/react';

jest.mock('scratch-blocks', () => ({
    getMainWorkspace: jest.fn(),
    inject: jest.fn(),
    common: {setMainWorkspace: jest.fn()},
    Xml: {domToWorkspace: jest.fn()},
    utils: {xml: {textToDom: jest.fn(text => `dom(${text})`)}},
    renderManagement: {finishQueuedRenders: () => Promise.resolve()},
    svgResize: jest.fn()
}));
import * as ScratchBlocks from 'scratch-blocks';
import ExampleBlocks from '../../../src/components/example-blocks/example-blocks.jsx';

const theme = {name: 'the editor theme'};

const makeEditorWorkspace = ({rtl = false} = {}) => ({
    RTL: rtl,
    options: {pathToMedia: 'static/blocks-media/default/', renderer: 'scratch_catblocks'},
    getTheme: () => theme
});

const makeStack = (width, height) => ({
    getHeightWidth: () => ({width, height}),
    getRelativeToSurfaceXY: () => ({x: 0, y: 0}),
    moveBy: jest.fn()
});

const makeExampleWorkspace = (rtl, stacks) => {
    const workspace = {
        RTL: rtl,
        scale: 1,
        setScale: jest.fn(scale => {
            workspace.scale = scale;
        }),
        clear: jest.fn(),
        dispose: jest.fn(),
        getTopBlocks: jest.fn(() => stacks)
    };
    return workspace;
};

// The layout happens after the blocks have rendered, one microtask later.
const finishRendering = () => act(() => Promise.resolve());

describe('ExampleBlocks', () => {
    let editorWorkspace;
    let exampleWorkspace;
    let stacks;

    const setUp = ({rtl = false} = {}) => {
        editorWorkspace = makeEditorWorkspace({rtl});
        stacks = [makeStack(100, 50), makeStack(60, 30)];
        exampleWorkspace = makeExampleWorkspace(rtl, stacks);
        ScratchBlocks.getMainWorkspace.mockReturnValue(editorWorkspace);
        ScratchBlocks.inject.mockReturnValue(exampleWorkspace);
    };

    beforeEach(() => {
        jest.clearAllMocks();
        setUp();
    });

    test('draws in a read-only workspace that borrows the editor workspace\'s look', async () => {
        const {container} = render(<ExampleBlocks xml="<xml/>" />);
        await finishRendering();

        expect(ScratchBlocks.inject).toHaveBeenCalledTimes(1);
        expect(ScratchBlocks.inject).toHaveBeenCalledWith(container.firstChild, expect.objectContaining({
            readOnly: true,
            rtl: false,
            media: 'static/blocks-media/default/',
            theme,
            scratchTheme: 'catblocks'
        }));
        expect(ScratchBlocks.Xml.domToWorkspace).toHaveBeenCalledWith('dom(<xml/>)', exampleWorkspace);
    });

    test('hands the main workspace back to the editor after injecting', async () => {
        render(<ExampleBlocks xml="<xml/>" />);
        await finishRendering();

        expect(ScratchBlocks.common.setMainWorkspace).toHaveBeenCalledWith(editorWorkspace);
        const [injectOrder] = ScratchBlocks.inject.mock.invocationCallOrder;
        const [restoreOrder] = ScratchBlocks.common.setMainWorkspace.mock.invocationCallOrder;
        expect(restoreOrder).toBeGreaterThan(injectOrder);
    });

    test('lays the stacks out in a column and sizes itself to fit them', async () => {
        const {container} = render(<ExampleBlocks
            scale={1}
            xml="<xml/>"
        />);
        await finishRendering();

        // 4px of padding, then the second stack 24 units below the first.
        expect(stacks[0].moveBy).toHaveBeenCalledWith(4, 4);
        expect(stacks[1].moveBy).toHaveBeenCalledWith(4, 4 + 50 + 24);
        // The widest stack plus padding by the stacks, the gap, and padding.
        expect(container.firstChild.style.width).toBe('108px');
        expect(container.firstChild.style.height).toBe('112px');
        expect(ScratchBlocks.svgResize).toHaveBeenCalledWith(exampleWorkspace);
    });

    test('lines the stacks up on the right in a right-to-left workspace', async () => {
        setUp({rtl: true});
        render(<ExampleBlocks
            scale={1}
            xml="<xml/>"
        />);
        await finishRendering();

        expect(ScratchBlocks.inject).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({rtl: true}));
        // A stack's position is its top right corner, at the far edge of the widest stack.
        expect(stacks[0].moveBy).toHaveBeenCalledWith(4 + 100, 4);
        expect(stacks[1].moveBy).toHaveBeenCalledWith(4 + 100, 4 + 50 + 24);
    });

    test('shrinks the blocks when the widest stack would not fit the room', async () => {
        const {container} = render(<ExampleBlocks
            scale={1}
            xml="<xml/>"
        />);
        // 58px of room less 4px of padding on each side leaves 50px for a 100-unit stack.
        Object.defineProperty(container.firstChild, 'clientWidth', {value: 58});
        await finishRendering();

        expect(exampleWorkspace.scale).toBe(0.5);
        expect(stacks[0].moveBy).toHaveBeenCalledWith(8, 8);
        expect(container.firstChild.style.width).toBe('58px');
        expect(container.firstChild.style.height).toBe('60px');
    });

    test('redraws in the same workspace when given different xml', async () => {
        const {rerender} = render(<ExampleBlocks xml="<xml>1</xml>" />);
        await finishRendering();
        rerender(<ExampleBlocks xml="<xml>2</xml>" />);
        await finishRendering();

        expect(ScratchBlocks.inject).toHaveBeenCalledTimes(1);
        expect(exampleWorkspace.clear).toHaveBeenCalledTimes(2);
        expect(ScratchBlocks.Xml.domToWorkspace).toHaveBeenLastCalledWith('dom(<xml>2</xml>)', exampleWorkspace);
    });

    test('disposes of its workspace when unmounted', async () => {
        const {unmount} = render(<ExampleBlocks xml="<xml/>" />);
        await finishRendering();
        unmount();

        expect(exampleWorkspace.dispose).toHaveBeenCalledTimes(1);
    });

    test('stays empty, with a warning, when there is no editor workspace to draw with', async () => {
        ScratchBlocks.getMainWorkspace.mockReturnValue(null);
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const {container} = render(<ExampleBlocks xml="<xml/>" />);
        await finishRendering();

        expect(ScratchBlocks.inject).not.toHaveBeenCalled();
        expect(container.firstChild.childNodes).toHaveLength(0);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('no editor workspace'));
        warn.mockRestore();
    });
});
