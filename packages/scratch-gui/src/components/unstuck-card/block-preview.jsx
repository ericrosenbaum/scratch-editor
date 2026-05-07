import PropTypes from 'prop-types';
import React from 'react';
import * as ScratchBlocks from 'scratch-blocks';
import {getColorsForMode, colorModeMap} from '../../lib/settings/color-mode';
import {blocksToXml} from '../../lib/unstuck/workspace-capture.js';

import styles from './block-preview.css';

// Built-in extensions whose blocks are only registered with ScratchBlocks
// after the extension is loaded. Mirrors `builtinExtensions` in
// scratch-vm/src/extension-support/extension-manager.js — keep in sync.
const KNOWN_EXTENSION_IDS = new Set([
    'pen', 'wedo2', 'music', 'microbit', 'text2speech', 'translate',
    'videoSensing', 'ev3', 'makeymakey', 'boost', 'gdxfor', 'faceSensing'
]);

// All extensions render in the same Scratch-extension green in the
// preview, regardless of any custom category color the extension declares.
// Matches `defaultExtensionColors` in scratch-vm/src/engine/runtime.js.
const EXTENSION_PRIMARY = '#0FBD8C';
const EXTENSION_SECONDARY = '#0DA57A';
const EXTENSION_TERTIARY = '#0B8E69';

const extensionIdFromOpcode = function (opcode) {
    if (!opcode) return null;
    const idx = opcode.indexOf('_');
    if (idx <= 0) return null;
    const prefix = opcode.slice(0, idx);
    return KNOWN_EXTENSION_IDS.has(prefix) ? prefix : null;
};

const extensionsInTemplate = function (blocks) {
    const ids = new Set();
    if (!Array.isArray(blocks)) return ids;
    for (const block of blocks) {
        const extId = extensionIdFromOpcode(block && block.opcode);
        if (extId) ids.add(extId);
    }
    return ids;
};

class BlockPreview extends React.Component {
    constructor (props) {
        super(props);
        this.workspace = null;
        this.setRef = this.setRef.bind(this);
        this.handleExtensionAdded = this.handleExtensionAdded.bind(this);
    }

    componentDidMount () {
        if (this.props.vm) {
            this.props.vm.on('EXTENSION_ADDED', this.handleExtensionAdded);
        }
    }

    componentDidUpdate (prevProps) {
        if (prevProps.vm !== this.props.vm) {
            if (prevProps.vm) {
                prevProps.vm.removeListener('EXTENSION_ADDED', this.handleExtensionAdded);
            }
            if (this.props.vm) {
                this.props.vm.on('EXTENSION_ADDED', this.handleExtensionAdded);
            }
        }
        if (prevProps.colorMode !== this.props.colorMode && this.workspace) {
            // ScratchBlocks' theme media (icons) is bound at inject() time, so
            // swapping themes alone leaves the old icon set in place. Tear the
            // workspace down and let setRef rebuild it on the next render.
            this.workspace.dispose();
            this.workspace = null;
            this.setRef(this.container);
            return;
        }
        if (prevProps.locale !== this.props.locale && this.workspace) {
            // ScratchMsgs.setLocale() is global; the main editor already calls
            // it on locale change, but our preview's already-rendered XML keeps
            // the old labels. Re-apply and rebuild to pick up the new strings.
            ScratchBlocks.ScratchMsgs.setLocale(this.props.locale);
            this.buildBlocks();
        }
        if (prevProps.blocks !== this.props.blocks) {
            this.buildBlocks();
        }
    }

    componentWillUnmount () {
        if (this.props.vm) {
            this.props.vm.removeListener('EXTENSION_ADDED', this.handleExtensionAdded);
        }
        if (this.workspace) {
            this.workspace.dispose();
            this.workspace = null;
        }
    }

    handleExtensionAdded () {
        // An extension just registered its block definitions with
        // ScratchBlocks — re-attempt rendering so previously-unknown
        // opcodes can now resolve.
        this.buildBlocks();
    }

    ensureExtensionsLoaded (blocks) {
        const {vm} = this.props;
        if (!vm || !vm.extensionManager) return;
        const ids = extensionsInTemplate(blocks);
        for (const extId of ids) {
            if (!vm.extensionManager.isExtensionLoaded(extId)) {
                // Fire-and-forget; EXTENSION_ADDED triggers a re-render.
                Promise.resolve(vm.extensionManager.loadExtensionURL(extId))
                    .catch(() => { /* extension load failed; preview stays empty */ });
            }
        }
    }

    setRef (el) {
        if (!el) return;
        if (this.workspace) return;
        this.container = el;

        // Make sure ScratchMsgs reflects the editor's current locale before
        // injecting — block labels are pulled from this global registry.
        if (this.props.locale) {
            ScratchBlocks.ScratchMsgs.setLocale(this.props.locale);
        }

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

        // Seed the workspace's theme with a single "extension green" style
        // for every known extension ID. Without this, extension blocks fall
        // back to no-fill / black because the theme has no entry for their
        // category. We mutate the theme before any blocks render, so no
        // setTheme() refresh call is needed.
        const wsTheme = this.workspace.getTheme();
        for (const extId of KNOWN_EXTENSION_IDS) {
            wsTheme.setBlockStyle(extId, {
                colourPrimary: EXTENSION_PRIMARY,
                colourSecondary: EXTENSION_SECONDARY,
                colourTertiary: EXTENSION_TERTIARY,
                colourQuaternary: EXTENSION_TERTIARY
            });
            wsTheme.setBlockStyle(`${extId}_selected`, {
                colourPrimary: EXTENSION_TERTIARY,
                colourSecondary: EXTENSION_TERTIARY,
                colourTertiary: EXTENSION_TERTIARY,
                colourQuaternary: EXTENSION_TERTIARY
            });
        }

        this.buildBlocks();
    }

    buildBlocks () {
        if (!this.workspace) return;
        this.workspace.clear();

        const {blocks} = this.props;
        if (!blocks || blocks.length === 0) return;
        const xml = blocksToXml(blocks);
        if (!xml) return;

        // Pre-load any extensions referenced by the captured blocks so their
        // definitions are registered with ScratchBlocks before we render.
        // EXTENSION_ADDED triggers a re-render once loaded.
        this.ensureExtensionsLoaded(blocks);

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
    // eslint-disable-next-line react/forbid-prop-types
    blocks: PropTypes.array,
    colorMode: PropTypes.string,
    locale: PropTypes.string,
    // eslint-disable-next-line react/forbid-prop-types
    vm: PropTypes.object
};

BlockPreview.defaultProps = {
    colorMode: 'default'
};

export default BlockPreview;
