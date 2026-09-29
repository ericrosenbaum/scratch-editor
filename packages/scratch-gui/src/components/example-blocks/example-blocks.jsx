import PropTypes from 'prop-types';
import React from 'react';
import * as ScratchBlocks from 'scratch-blocks';

import {BLOCKS_DEFAULT_SCALE} from '../../lib/layout-constants';

import styles from './example-blocks.css';

// Breathing room around the blocks, in screen pixels, so the edge of a block
// or the curve of a hat is not clipped by the edge of the drawing.
const PADDING = 4;

// Space between one stack and the next, in workspace units.
const STACK_GAP = 24;

// inject() names its renderer `scratch_<scratchTheme>`; this recovers the
// option a workspace was injected with so another can use the same renderer.
const scratchThemeOf = workspace => workspace.options.renderer.replace(/^scratch_/, '');

/**
 * A read-only drawing of one or more stacks of blocks, sized to fit them.
 *
 * The blocks are drawn with the editor workspace's theme, renderer, media,
 * and text direction, so they look exactly as they would in the editor. The
 * theme is where the editor registers an extension's block colors when it
 * loads, so sharing it is what lets an extension's blocks render in their
 * own colors.
 *
 * Stacks are laid out top to bottom in the order they appear in the XML; any
 * x and y attributes in the XML are ignored. The drawing shrinks to the width
 * it is given when a stack would otherwise spill out of it.
 */
class ExampleBlocks extends React.Component {
    constructor (props) {
        super(props);
        this.container = null;
        this.workspace = null;
        this.setContainer = this.setContainer.bind(this);
    }

    componentDidUpdate (prevProps) {
        if (!this.workspace) return;
        if (prevProps.xml !== this.props.xml || prevProps.scale !== this.props.scale) {
            this.loadBlocks();
        }
    }

    componentWillUnmount () {
        if (this.workspace) {
            this.workspace.dispose();
            this.workspace = null;
        }
    }

    setContainer (container) {
        if (!container || this.workspace) return;
        this.container = container;

        const editorWorkspace = ScratchBlocks.getMainWorkspace();
        if (!editorWorkspace) {
            // eslint-disable-next-line no-console
            console.warn('ExampleBlocks: no editor workspace to draw with; leaving the example empty');
            return;
        }

        this.workspace = ScratchBlocks.inject(container, {
            readOnly: true,
            rtl: editorWorkspace.RTL,
            media: editorWorkspace.options.pathToMedia,
            theme: editorWorkspace.getTheme(),
            scratchTheme: scratchThemeOf(editorWorkspace),
            zoom: {startScale: this.props.scale},
            move: {scrollbars: false, drag: false, wheel: false},
            sounds: false
        });
        // inject() makes the newest workspace the main one, which is where
        // the rest of the editor looks for the user's blocks.
        ScratchBlocks.common.setMainWorkspace(editorWorkspace);

        this.loadBlocks();
    }

    loadBlocks () {
        this.workspace.clear();
        ScratchBlocks.Xml.domToWorkspace(ScratchBlocks.utils.xml.textToDom(this.props.xml), this.workspace);
        this.fitToBlocks();
    }

    async fitToBlocks () {
        await ScratchBlocks.renderManagement.finishQueuedRenders();
        if (!this.workspace) return; // unmounted while the blocks were rendering

        const {container, workspace} = this;
        const stacks = workspace.getTopBlocks(false);
        const sizes = stacks.map(stack => stack.getHeightWidth());
        const width = Math.max(0, ...sizes.map(size => size.width));
        const height = sizes.reduce((total, size) => total + size.height, 0) +
            (STACK_GAP * Math.max(0, stacks.length - 1));

        // Clear the size set by any earlier fit so the container is back to
        // filling the space it is given, which is the room to measure.
        container.style.width = '';
        container.style.height = '';
        workspace.setScale(this.props.scale);

        // A long translation of a block's text can make a stack wider than
        // the room; shrink it to fit rather than spill out.
        const room = container.clientWidth - (2 * PADDING);
        if (room > 0 && width * workspace.scale > room) {
            workspace.setScale(room / width);
        }
        const {scale} = workspace;

        // A stack's position is its top left corner, or its top right corner
        // when the text direction is right to left.
        const inset = PADDING / scale;
        const originX = workspace.RTL ? inset + width : inset;
        let originY = inset;
        stacks.forEach((stack, i) => {
            const {x, y} = stack.getRelativeToSurfaceXY();
            stack.moveBy(originX - x, originY - y);
            originY += sizes[i].height + STACK_GAP;
        });

        container.style.width = `${Math.ceil((width * scale) + (2 * PADDING))}px`;
        container.style.height = `${Math.ceil((height * scale) + (2 * PADDING))}px`;
        ScratchBlocks.svgResize(workspace);
    }

    render () {
        return (
            <div
                className={styles.exampleBlocks}
                ref={this.setContainer}
            />
        );
    }
}

ExampleBlocks.propTypes = {
    scale: PropTypes.number,
    xml: PropTypes.string.isRequired
};

ExampleBlocks.defaultProps = {
    scale: BLOCKS_DEFAULT_SCALE
};

export default ExampleBlocks;
