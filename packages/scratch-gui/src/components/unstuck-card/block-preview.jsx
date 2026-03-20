import PropTypes from 'prop-types';
import React from 'react';
import * as ScratchBlocks from 'scratch-blocks';
import {getColorsForMode} from '../../lib/settings/color-mode';

import styles from './block-preview.css';

/**
 * Block preview definitions as Blockly XML strings.
 * This is the most reliable way to populate a read-only scratch-blocks workspace
 * since the block types are defined via XML in the Blockly registry.
 */
const BLOCK_XML = {
    whenFlagMove: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="motion_movesteps">
                        <value name="STEPS">
                            <shadow type="math_number"><field name="NUM">10</field></shadow>
                        </value>
                    </block>
                </next>
            </block>
        </xml>`,
    whenKeyMoveRight: `
        <xml>
            <block type="event_whenkeypressed" x="10" y="10">
                <field name="KEY_OPTION">right arrow</field>
                <next>
                    <block type="motion_changexby">
                        <value name="DX">
                            <shadow type="math_number"><field name="NUM">10</field></shadow>
                        </value>
                    </block>
                </next>
            </block>
        </xml>`,
    foreverNextCostume: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="control_forever">
                        <statement name="SUBSTACK">
                            <block type="looks_nextcostume">
                                <next>
                                    <block type="control_wait">
                                        <value name="DURATION">
                                            <shadow type="math_positive_number">
                                                <field name="NUM">0.25</field>
                                            </shadow>
                                        </value>
                                    </block>
                                </next>
                            </block>
                        </statement>
                    </block>
                </next>
            </block>
        </xml>`,
    saySomething: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="looks_sayforsecs">
                        <value name="MESSAGE">
                            <shadow type="text"><field name="TEXT">Hello!</field></shadow>
                        </value>
                        <value name="SECS">
                            <shadow type="math_number"><field name="NUM">2</field></shadow>
                        </value>
                    </block>
                </next>
            </block>
        </xml>`,
    playSound: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="sound_playuntildone">
                        <value name="SOUND_MENU">
                            <shadow type="sound_sounds_menu">
                                <field name="SOUND_MENU">Meow</field>
                            </shadow>
                        </value>
                    </block>
                </next>
            </block>
        </xml>`,
    foreverIfTouching: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="control_forever">
                        <statement name="SUBSTACK">
                            <block type="control_if">
                                <value name="CONDITION">
                                    <block type="sensing_touchingobject">
                                        <value name="TOUCHINGOBJECTMENU">
                                            <shadow type="sensing_touchingobjectmenu">
                                                <field name="TOUCHINGOBJECTMENU">_edge_</field>
                                            </shadow>
                                        </value>
                                    </block>
                                </value>
                                <statement name="SUBSTACK">
                                    <block type="looks_say">
                                        <value name="MESSAGE">
                                            <shadow type="text">
                                                <field name="TEXT">Ouch!</field>
                                            </shadow>
                                        </value>
                                    </block>
                                </statement>
                            </block>
                        </statement>
                    </block>
                </next>
            </block>
        </xml>`
};

class BlockPreview extends React.Component {
    constructor (props) {
        super(props);
        this.workspace = null;
        this.setRef = this.setRef.bind(this);
    }

    componentDidUpdate (prevProps) {
        if (prevProps.templateName !== this.props.templateName) {
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
            theme
        });

        this.buildBlocks();
    }

    buildBlocks () {
        if (!this.workspace) return;
        this.workspace.clear();

        const xml = BLOCK_XML[this.props.templateName];
        if (!xml) return;

        try {
            const dom = ScratchBlocks.utils.xml.textToDom(xml);
            ScratchBlocks.Xml.domToWorkspace(dom, this.workspace);
        } catch (e) {
            // Block type may not be registered — fail gracefully
            return;
        }

        requestAnimationFrame(() => {
            this.resizeToFit();
        });
    }

    resizeToFit () {
        if (!this.workspace || !this.container) return;

        const metrics = this.workspace.getBlocksBoundingBox();
        if (!metrics) return;

        const scale = this.workspace.scale || 0.55;
        const padding = 12;
        const width = Math.max(200, ((metrics.right - metrics.left) * scale) + (padding * 2));
        const height = Math.max(60, ((metrics.bottom - metrics.top) * scale) + (padding * 2));

        this.container.style.height = `${Math.min(height, 250)}px`;
        this.container.style.width = `${Math.min(width, 360)}px`;
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
    colorMode: PropTypes.string,
    templateName: PropTypes.string.isRequired
};

BlockPreview.defaultProps = {
    colorMode: 'default'
};

export default BlockPreview;
