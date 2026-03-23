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
        </xml>`,
    foreverIfCheck: `
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
                                                <field name="TEXT">Touching!</field>
                                            </shadow>
                                        </value>
                                    </block>
                                </statement>
                            </block>
                        </statement>
                    </block>
                </next>
            </block>
        </xml>`,
    whenFlagGoToReset: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="motion_gotoxy">
                        <value name="X">
                            <shadow type="math_number"><field name="NUM">0</field></shadow>
                        </value>
                        <value name="Y">
                            <shadow type="math_number"><field name="NUM">0</field></shadow>
                        </value>
                        <next>
                            <block type="looks_setsizeto">
                                <value name="SIZE">
                                    <shadow type="math_number"><field name="NUM">100</field></shadow>
                                </value>
                            </block>
                        </next>
                    </block>
                </next>
            </block>
        </xml>`,
    foreverColorChange: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="control_forever">
                        <statement name="SUBSTACK">
                            <block type="looks_changeeffectby">
                                <field name="EFFECT">COLOR</field>
                                <value name="CHANGE">
                                    <shadow type="math_number"><field name="NUM">25</field></shadow>
                                </value>
                            </block>
                        </statement>
                    </block>
                </next>
            </block>
        </xml>`,
    foreverSpin: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="control_forever">
                        <statement name="SUBSTACK">
                            <block type="motion_turnright">
                                <value name="DEGREES">
                                    <shadow type="math_number"><field name="NUM">15</field></shadow>
                                </value>
                            </block>
                        </statement>
                    </block>
                </next>
            </block>
        </xml>`,
    foreverBounce: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="control_forever">
                        <statement name="SUBSTACK">
                            <block type="motion_movesteps">
                                <value name="STEPS">
                                    <shadow type="math_number"><field name="NUM">10</field></shadow>
                                </value>
                                <next>
                                    <block type="motion_ifonedgebounce" />
                                </next>
                            </block>
                        </statement>
                    </block>
                </next>
            </block>
        </xml>`,
    whenClickedChangeScore: `
        <xml>
            <block type="event_whenthisspriteclicked" x="10" y="10">
                <next>
                    <block type="data_changevariableby">
                        <field name="VARIABLE" id="unstuck_score_var">score</field>
                        <value name="VALUE">
                            <shadow type="math_number"><field name="NUM">1</field></shadow>
                        </value>
                    </block>
                </next>
            </block>
        </xml>`,
    foreverMove: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="control_forever">
                        <statement name="SUBSTACK">
                            <block type="motion_movesteps">
                                <value name="STEPS">
                                    <shadow type="math_number"><field name="NUM">10</field></shadow>
                                </value>
                            </block>
                        </statement>
                    </block>
                </next>
            </block>
        </xml>`,
    repeatTurn: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="control_repeat">
                        <value name="TIMES">
                            <shadow type="math_whole_number"><field name="NUM">10</field></shadow>
                        </value>
                        <statement name="SUBSTACK">
                            <block type="motion_movesteps">
                                <value name="STEPS">
                                    <shadow type="math_number"><field name="NUM">10</field></shadow>
                                </value>
                                <next>
                                    <block type="motion_turnright">
                                        <value name="DEGREES">
                                            <shadow type="math_number"><field name="NUM">36</field></shadow>
                                        </value>
                                    </block>
                                </next>
                            </block>
                        </statement>
                    </block>
                </next>
            </block>
        </xml>`,
    glideTo: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="motion_glidesecstoxy">
                        <value name="SECS">
                            <shadow type="math_number"><field name="NUM">1</field></shadow>
                        </value>
                        <value name="X">
                            <shadow type="math_number"><field name="NUM">100</field></shadow>
                        </value>
                        <value name="Y">
                            <shadow type="math_number"><field name="NUM">100</field></shadow>
                        </value>
                    </block>
                </next>
            </block>
        </xml>`,
    followMouse: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="control_forever">
                        <statement name="SUBSTACK">
                            <block type="motion_goto">
                                <value name="TO">
                                    <shadow type="motion_goto_menu">
                                        <field name="TO">_mouse_</field>
                                    </shadow>
                                </value>
                            </block>
                        </statement>
                    </block>
                </next>
            </block>
        </xml>`,
    askAndSay: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="sensing_askandwait">
                        <value name="QUESTION">
                            <shadow type="text"><field name="TEXT">What's your name?</field></shadow>
                        </value>
                        <next>
                            <block type="looks_say">
                                <value name="MESSAGE">
                                    <block type="sensing_answer" />
                                </value>
                            </block>
                        </next>
                    </block>
                </next>
            </block>
        </xml>`,
    repeatUntilEdge: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="control_repeat_until">
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
                            <block type="motion_movesteps">
                                <value name="STEPS">
                                    <shadow type="math_number"><field name="NUM">10</field></shadow>
                                </value>
                            </block>
                        </statement>
                    </block>
                </next>
            </block>
        </xml>`,
    gravityFall: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="control_forever">
                        <statement name="SUBSTACK">
                            <block type="motion_changeyby">
                                <value name="DY">
                                    <shadow type="math_number"><field name="NUM">-2</field></shadow>
                                </value>
                            </block>
                        </statement>
                    </block>
                </next>
            </block>
        </xml>`,
    broadcastGo: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="event_broadcast">
                        <value name="BROADCAST_INPUT">
                            <shadow type="event_broadcast_menu">
                                <field name="BROADCAST_OPTION">go!</field>
                            </shadow>
                        </value>
                    </block>
                </next>
            </block>
        </xml>`,
    cloneForever: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="control_forever">
                        <statement name="SUBSTACK">
                            <block type="control_create_clone_of">
                                <value name="CLONE_OPTION">
                                    <shadow type="control_create_clone_of_menu">
                                        <field name="CLONE_OPTION">_myself_</field>
                                    </shadow>
                                </value>
                                <next>
                                    <block type="control_wait">
                                        <value name="DURATION">
                                            <shadow type="math_positive_number">
                                                <field name="NUM">1</field>
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
    goToCenter: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="motion_gotoxy">
                        <value name="X">
                            <shadow type="math_number"><field name="NUM">0</field></shadow>
                        </value>
                        <value name="Y">
                            <shadow type="math_number"><field name="NUM">0</field></shadow>
                        </value>
                    </block>
                </next>
            </block>
        </xml>`,
    moveRandomSteps: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="motion_movesteps">
                        <value name="STEPS">
                            <block type="operator_random">
                                <value name="FROM">
                                    <shadow type="math_number"><field name="NUM">1</field></shadow>
                                </value>
                                <value name="TO">
                                    <shadow type="math_number"><field name="NUM">10</field></shadow>
                                </value>
                            </block>
                        </value>
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
            theme
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
