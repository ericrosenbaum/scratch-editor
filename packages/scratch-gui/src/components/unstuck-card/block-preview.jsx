import PropTypes from 'prop-types';
import React from 'react';
import * as ScratchBlocks from 'scratch-blocks';
import {getColorsForMode, colorModeMap} from '../../lib/settings/color-mode';

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
        </xml>`,
    changeSizeBy: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="looks_changesizeby">
                        <value name="CHANGE">
                            <shadow type="math_number"><field name="NUM">10</field></shadow>
                        </value>
                    </block>
                </next>
            </block>
        </xml>`,
    setGhostZero: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="looks_seteffectto">
                        <field name="EFFECT">GHOST</field>
                        <value name="VALUE">
                            <shadow type="math_number"><field name="NUM">0</field></shadow>
                        </value>
                    </block>
                </next>
            </block>
        </xml>`,
    setSizeTo100: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="looks_setsizeto">
                        <value name="SIZE">
                            <shadow type="math_number"><field name="NUM">100</field></shadow>
                        </value>
                    </block>
                </next>
            </block>
        </xml>`,
    foreverChangeSizePulse: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="control_forever">
                        <statement name="SUBSTACK">
                            <block type="looks_changesizeby">
                                <value name="CHANGE">
                                    <shadow type="math_number"><field name="NUM">5</field></shadow>
                                </value>
                                <next>
                                    <block type="control_wait">
                                        <value name="DURATION">
                                            <shadow type="math_positive_number">
                                                <field name="NUM">0.5</field>
                                            </shadow>
                                        </value>
                                        <next>
                                            <block type="looks_changesizeby">
                                                <value name="CHANGE">
                                                    <shadow type="math_number"><field name="NUM">-5</field></shadow>
                                                </value>
                                                <next>
                                                    <block type="control_wait">
                                                        <value name="DURATION">
                                                            <shadow type="math_positive_number">
                                                                <field name="NUM">0.5</field>
                                                            </shadow>
                                                        </value>
                                                    </block>
                                                </next>
                                            </block>
                                        </next>
                                    </block>
                                </next>
                            </block>
                        </statement>
                    </block>
                </next>
            </block>
        </xml>`,
    setColorEffect: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="looks_seteffectto">
                        <field name="EFFECT">COLOR</field>
                        <value name="VALUE">
                            <shadow type="math_number"><field name="NUM">50</field></shadow>
                        </value>
                    </block>
                </next>
            </block>
        </xml>`,
    whenCloneStart: `
        <xml>
            <block type="control_start_as_clone" x="10" y="10">
                <next>
                    <block type="motion_movesteps">
                        <value name="STEPS">
                            <shadow type="math_number"><field name="NUM">50</field></shadow>
                        </value>
                    </block>
                </next>
            </block>
        </xml>`,
    deleteClone: `
        <xml>
            <block type="control_start_as_clone" x="10" y="10">
                <next>
                    <block type="motion_movesteps">
                        <value name="STEPS">
                            <shadow type="math_number"><field name="NUM">50</field></shadow>
                        </value>
                        <next>
                            <block type="control_delete_this_clone" />
                        </next>
                    </block>
                </next>
            </block>
        </xml>`,
    waitBlock: `
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
                        <next>
                            <block type="control_wait">
                                <value name="DURATION">
                                    <shadow type="math_positive_number">
                                        <field name="NUM">1</field>
                                    </shadow>
                                </value>
                                <next>
                                    <block type="looks_sayforsecs">
                                        <value name="MESSAGE">
                                            <shadow type="text"><field name="TEXT">Goodbye!</field></shadow>
                                        </value>
                                        <value name="SECS">
                                            <shadow type="math_number"><field name="NUM">2</field></shadow>
                                        </value>
                                    </block>
                                </next>
                            </block>
                        </next>
                    </block>
                </next>
            </block>
        </xml>`,
    broadcastAndReceive: `
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
            <block type="event_whenbroadcastreceived" x="10" y="250">
                <field name="BROADCAST_OPTION">go!</field>
                <next>
                    <block type="motion_movesteps">
                        <value name="STEPS">
                            <shadow type="math_number"><field name="NUM">10</field></shadow>
                        </value>
                    </block>
                </next>
            </block>
        </xml>`,
    cloneCreateAndBehave: `
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
            <block type="control_start_as_clone" x="10" y="400">
                <next>
                    <block type="motion_movesteps">
                        <value name="STEPS">
                            <shadow type="math_number"><field name="NUM">50</field></shadow>
                        </value>
                    </block>
                </next>
            </block>
        </xml>`,
    cloneBasicsPair: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="control_create_clone_of">
                        <value name="CLONE_OPTION">
                            <shadow type="control_create_clone_of_menu">
                                <field name="CLONE_OPTION">_myself_</field>
                            </shadow>
                        </value>
                    </block>
                </next>
            </block>
            <block type="control_start_as_clone" x="10" y="250">
                <next>
                    <block type="motion_movesteps">
                        <value name="STEPS">
                            <shadow type="math_number"><field name="NUM">50</field></shadow>
                        </value>
                    </block>
                </next>
            </block>
        </xml>`,
    twoFlagStacks: `
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
            <block type="event_whenflagclicked" x="10" y="380">
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
    broadcastLevels: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="event_broadcast">
                        <value name="BROADCAST_INPUT">
                            <shadow type="event_broadcast_menu">
                                <field name="BROADCAST_OPTION">level2</field>
                            </shadow>
                        </value>
                    </block>
                </next>
            </block>
            <block type="event_whenbroadcastreceived" x="10" y="250">
                <field name="BROADCAST_OPTION">level2</field>
                <next>
                    <block type="looks_switchbackdropto">
                        <value name="BACKDROP">
                            <shadow type="looks_backdrops">
                                <field name="BACKDROP">backdrop2</field>
                            </shadow>
                        </value>
                    </block>
                </next>
            </block>
        </xml>`,
    hopJump: `
        <xml>
            <block type="event_whenkeypressed" x="10" y="10">
                <field name="KEY_OPTION">space</field>
                <next>
                    <block type="motion_changeyby">
                        <value name="DY">
                            <shadow type="math_number"><field name="NUM">50</field></shadow>
                        </value>
                        <next>
                            <block type="control_wait">
                                <value name="DURATION">
                                    <shadow type="math_positive_number">
                                        <field name="NUM">0.3</field>
                                    </shadow>
                                </value>
                                <next>
                                    <block type="motion_changeyby">
                                        <value name="DY">
                                            <shadow type="math_number"><field name="NUM">-50</field></shadow>
                                        </value>
                                    </block>
                                </next>
                            </block>
                        </next>
                    </block>
                </next>
            </block>
        </xml>`,
    foreverIfKeySmooth: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="control_forever">
                        <statement name="SUBSTACK">
                            <block type="control_if">
                                <value name="CONDITION">
                                    <block type="sensing_keypressed">
                                        <value name="KEY_OPTION">
                                            <shadow type="sensing_keyoptions">
                                                <field name="KEY_OPTION">right arrow</field>
                                            </shadow>
                                        </value>
                                    </block>
                                </value>
                                <statement name="SUBSTACK">
                                    <block type="motion_changexby">
                                        <value name="DX">
                                            <shadow type="math_number"><field name="NUM">5</field></shadow>
                                        </value>
                                    </block>
                                </statement>
                            </block>
                        </statement>
                    </block>
                </next>
            </block>
        </xml>`,
    bounceUpDown: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="control_forever">
                        <statement name="SUBSTACK">
                            <block type="control_repeat">
                                <value name="TIMES">
                                    <shadow type="math_whole_number"><field name="NUM">10</field></shadow>
                                </value>
                                <statement name="SUBSTACK">
                                    <block type="motion_changeyby">
                                        <value name="DY">
                                            <shadow type="math_number"><field name="NUM">5</field></shadow>
                                        </value>
                                    </block>
                                </statement>
                                <next>
                                    <block type="control_repeat">
                                        <value name="TIMES">
                                            <shadow type="math_whole_number"><field name="NUM">10</field></shadow>
                                        </value>
                                        <statement name="SUBSTACK">
                                            <block type="motion_changeyby">
                                                <value name="DY">
                                                    <shadow type="math_number"><field name="NUM">-5</field></shadow>
                                                </value>
                                            </block>
                                        </statement>
                                    </block>
                                </next>
                            </block>
                        </statement>
                    </block>
                </next>
            </block>
        </xml>`,
    moveSideToSide: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="control_forever">
                        <statement name="SUBSTACK">
                            <block type="motion_movesteps">
                                <value name="STEPS">
                                    <shadow type="math_number"><field name="NUM">5</field></shadow>
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
    waddleTurn: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="control_forever">
                        <statement name="SUBSTACK">
                            <block type="motion_turnright">
                                <value name="DEGREES">
                                    <shadow type="math_number"><field name="NUM">10</field></shadow>
                                </value>
                                <next>
                                    <block type="control_wait">
                                        <value name="DURATION">
                                            <shadow type="math_positive_number">
                                                <field name="NUM">0.1</field>
                                            </shadow>
                                        </value>
                                        <next>
                                            <block type="motion_turnleft">
                                                <value name="DEGREES">
                                                    <shadow type="math_number"><field name="NUM">10</field></shadow>
                                                </value>
                                                <next>
                                                    <block type="control_wait">
                                                        <value name="DURATION">
                                                            <shadow type="math_positive_number">
                                                                <field name="NUM">0.1</field>
                                                            </shadow>
                                                        </value>
                                                    </block>
                                                </next>
                                            </block>
                                        </next>
                                    </block>
                                </next>
                            </block>
                        </statement>
                    </block>
                </next>
            </block>
        </xml>`,
    fallingFromSky: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="motion_gotoxy">
                        <value name="X">
                            <shadow type="math_number"><field name="NUM">0</field></shadow>
                        </value>
                        <value name="Y">
                            <shadow type="math_number"><field name="NUM">180</field></shadow>
                        </value>
                        <next>
                            <block type="control_forever">
                                <statement name="SUBSTACK">
                                    <block type="motion_changeyby">
                                        <value name="DY">
                                            <shadow type="math_number"><field name="NUM">-5</field></shadow>
                                        </value>
                                    </block>
                                </statement>
                            </block>
                        </next>
                    </block>
                </next>
            </block>
        </xml>`,
    touchingColorGoto: `
        <xml>
            <block type="event_whenflagclicked" x="10" y="10">
                <next>
                    <block type="control_forever">
                        <statement name="SUBSTACK">
                            <block type="control_if">
                                <value name="CONDITION">
                                    <block type="sensing_touchingcolor">
                                        <value name="COLOR">
                                            <shadow type="colour_picker">
                                                <field name="COLOUR">#ff0000</field>
                                            </shadow>
                                        </value>
                                    </block>
                                </value>
                                <statement name="SUBSTACK">
                                    <block type="motion_gotoxy">
                                        <value name="X">
                                            <shadow type="math_number"><field name="NUM">0</field></shadow>
                                        </value>
                                        <value name="Y">
                                            <shadow type="math_number"><field name="NUM">0</field></shadow>
                                        </value>
                                    </block>
                                </statement>
                            </block>
                        </statement>
                    </block>
                </next>
            </block>
        </xml>`,
    backflipSpin: `
        <xml>
            <block type="event_whenkeypressed" x="10" y="10">
                <field name="KEY_OPTION">space</field>
                <next>
                    <block type="motion_changeyby">
                        <value name="DY">
                            <shadow type="math_number"><field name="NUM">50</field></shadow>
                        </value>
                        <next>
                            <block type="control_repeat">
                                <value name="TIMES">
                                    <shadow type="math_whole_number"><field name="NUM">10</field></shadow>
                                </value>
                                <statement name="SUBSTACK">
                                    <block type="motion_turnright">
                                        <value name="DEGREES">
                                            <shadow type="math_number"><field name="NUM">36</field></shadow>
                                        </value>
                                    </block>
                                </statement>
                                <next>
                                    <block type="motion_changeyby">
                                        <value name="DY">
                                            <shadow type="math_number"><field name="NUM">-50</field></shadow>
                                        </value>
                                    </block>
                                </next>
                            </block>
                        </next>
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

        const xml = BLOCK_XML[this.props.templateName];
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
    colorMode: PropTypes.string,
    templateName: PropTypes.string.isRequired
};

BlockPreview.defaultProps = {
    colorMode: 'default'
};

export default BlockPreview;
