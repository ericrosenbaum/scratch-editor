import PropTypes from 'prop-types';
import React from 'react';
import * as ScratchBlocks from 'scratch-blocks';
import {getColorsForMode, colorModeMap} from '../../lib/settings/color-mode';
import blockTemplates from '../../lib/unstuck/block-templates.js';
import {getCustomBlockTemplates} from '../../lib/unstuck/tip-overrides.js';
import {blocksToXml} from '../../lib/unstuck/workspace-capture.js';

import styles from './block-preview.css';

class BlockPreview extends React.Component {
    constructor (props) {
        super(props);
        this.workspace = null;
        this.setRef = this.setRef.bind(this);
    }

    componentDidUpdate (prevProps) {
        if (prevProps.templateName !== this.props.templateName ||
            prevProps.blockXml !== this.props.blockXml) {
            this.buildBlocks();
        }
    }

    componentWillUnmount () {
        if (this.workspace) {
            this.workspace.dispose();
            this.workspace = null;
        }
    }

    setRef (el) {
        if (!el) return;
        if (this.workspace) return;
        this.container = el;

        const theme = new ScratchBlocks.Theme(
            this.props.colorMode,
            getColorsForMode(this.props.colorMode)
        );

        // Save the main workspace before inject, since inject() replaces it
        const previousMainWorkspace = ScratchBlocks.getMainWorkspace();

        this.workspace = ScratchBlocks.inject(el, {
            readOnly: true,
            zoom: {
                controls: false,
                wheel: false,
                pinch: false,
                startScale: 0.55
            },
            scrollbars: false,
            grid: false,
            comments: false,
            collapse: false,
            sounds: false,
            trashcan: false,
            theme,
            media: `static/${colorModeMap[this.props.colorMode].blocksMediaFolder}/`
        });

        // Restore the main workspace so glowStack and other features
        // continue to operate on the editor workspace, not this preview
        if (previousMainWorkspace) {
            ScratchBlocks.common.setMainWorkspace(previousMainWorkspace);
        }

        this.buildBlocks();
    }

    buildBlocks () {
        if (!this.workspace) return;
        this.workspace.clear();

        // Use explicit blockXml prop, or generate XML from block-templates JSON.
        // Captured templates live in localStorage via tip-overrides, so check
        // those too — otherwise the review preview shows nothing after capture.
        const {templateName} = this.props;
        const resolveTemplate = name => {
            if (!name) return null;
            const custom = getCustomBlockTemplates();
            return custom[name] || blockTemplates[name] || null;
        };
        const template = resolveTemplate(templateName);
        const xml = this.props.blockXml ||
            (template ? blocksToXml(template) : null);
        if (!xml) return;

        try {
            const dom = ScratchBlocks.utils.xml.textToDom(xml);
            ScratchBlocks.Xml.domToWorkspace(dom, this.workspace);
        } catch (e) {
            // Block type may not be registered — fail gracefully
            return;
        }

        // Let Blockly finish its initial render, then reposition and resize
        setTimeout(() => {
            this.layoutBlocks();
            this.resizeToFit();
        }, 100);
    }

    layoutBlocks () {
        if (!this.workspace || !this.container) return;

        const canvas = this.container.querySelector('.blocklyBlockCanvas');
        if (!canvas) return;

        // Get all top-level block <g> elements
        const groups = Array.from(canvas.children).filter(
            el => el.tagName === 'g' && el.getAttribute('data-id')
        );

        if (groups.length <= 1) return;

        const gap = 20;
        const x = 10;
        let yPos = 10;

        for (const group of groups) {
            const bbox = group.getBBox();
            // Set transform to position this group, accounting for
            // the block's internal offset (bbox.y relative to group origin)
            group.setAttribute('transform', `translate(${x}, ${yPos - bbox.y})`);
            yPos += bbox.height + gap;
        }
    }

    resizeToFit () {
        if (!this.workspace || !this.container) return;

        const scale = this.workspace.scale || 0.55;
        const padding = 12;
        const maxWidth = 460;
        const maxHeight = 500;

        // Calculate total extent from block groups' transforms + bboxes
        const canvas = this.container.querySelector('.blocklyBlockCanvas');
        const svg = this.container.querySelector('svg.blocklySvg');

        let contentRight = 0;
        let contentBottom = 0;

        if (canvas) {
            const groups = Array.from(canvas.children).filter(
                el => el.tagName === 'g' && el.getAttribute('data-id')
            );
            for (const group of groups) {
                const bbox = group.getBBox();
                const transform = group.getAttribute('transform') || '';
                const match = transform.match(/translate\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
                const tx = match ? parseFloat(match[1]) : 0;
                const ty = match ? parseFloat(match[2]) : 0;
                contentRight = Math.max(contentRight, tx + bbox.width);
                contentBottom = Math.max(contentBottom, ty + bbox.height);
            }
        }

        if (contentBottom === 0) {
            // Fallback to Blockly's metrics for single-stack templates
            const metrics = this.workspace.getBlocksBoundingBox();
            if (!metrics) return;
            contentRight = metrics.right - metrics.left;
            contentBottom = metrics.bottom - metrics.top;
        }

        const width = Math.max(200, (contentRight * scale) + (padding * 2));
        const height = Math.max(60, (contentBottom * scale) + (padding * 2));

        const finalWidth = Math.min(width, maxWidth);
        const finalHeight = Math.min(height, maxHeight);

        this.container.style.width = `${finalWidth}px`;
        this.container.style.height = `${finalHeight}px`;

        // Also resize the SVG element so it doesn't clip content
        if (svg) {
            svg.setAttribute('width', `${finalWidth}px`);
            svg.setAttribute('height', `${finalHeight}px`);
        }
    }

    render () {
        return (
            <div
                className={styles.workspaceContainer}
                ref={this.setRef}
            />
        );
    }
}

BlockPreview.propTypes = {
    blockXml: PropTypes.string,
    colorMode: PropTypes.string,
    templateName: PropTypes.string
};

BlockPreview.defaultProps = {
    colorMode: 'default'
};

export default BlockPreview;
