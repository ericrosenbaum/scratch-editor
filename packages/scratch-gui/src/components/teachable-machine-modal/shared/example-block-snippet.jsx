import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import ScratchBlocks from 'scratch-blocks';

import styles from '../teachable-machine-modal.css';

class ExampleBlockSnippet extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'setBlocksRef'
        ]);
        this.workspace = null;
    }
    componentWillUnmount () {
        if (this.workspace) {
            this.workspace.dispose();
            this.workspace = null;
        }
    }
    escapeXml (str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
    setBlocksRef (ref) {
        if (!ref) return;

        const oldDefaultToolbox = ScratchBlocks.Blocks.defaultToolbox;
        ScratchBlocks.Blocks.defaultToolbox = null;

        this.workspace = ScratchBlocks.inject(ref, {
            readOnly: true,
            scrollbars: false,
            zoom: {
                controls: false,
                wheel: false,
                startScale: 0.675
            },
            comments: false,
            collapse: false,
            media: 'static/blocks-media/default/'
        });

        ScratchBlocks.Blocks.defaultToolbox = oldDefaultToolbox;

        const labelName = this.escapeXml(this.props.labelName);

        // Use XML for block definitions — handles connections and shadow blocks natively
        const xmlString = [
            '<xml>',
            '  <block type="teachableClassifier_whenISee" x="20" y="20">',
            '    <value name="LABEL">',
            `      <shadow type="text"><field name="TEXT">${labelName}</field></shadow>`,
            '    </value>',
            '    <next>',
            '      <block type="sound_playuntildone">',
            '        <value name="SOUND_MENU">',
            '          <shadow type="text"><field name="TEXT">meow</field></shadow>',
            '        </value>',
            '      </block>',
            '    </next>',
            '  </block>',
            '  <block type="looks_sayforsecs" x="20" y="140">',
            '    <value name="MESSAGE">',
            '      <block type="teachableClassifier_predictImageLabel" />',
            '    </value>',
            '    <value name="SECS">',
            '      <shadow type="math_number"><field name="NUM">2</field></shadow>',
            '    </value>',
            '  </block>',
            '</xml>'
        ].join('');

        const dom = ScratchBlocks.Xml.textToDom(xmlString);
        ScratchBlocks.Xml.domToWorkspace(dom, this.workspace);

        // Auto-size the container height to fit the rendered blocks
        requestAnimationFrame(() => {
            if (!this.workspace) return;
            const canvas = this.workspace.getCanvas();
            if (!canvas) return;
            const bbox = canvas.getBBox();
            const scale = this.workspace.scale;
            const padding = 20;
            ref.style.height = `${Math.ceil((bbox.y + bbox.height) * scale) + padding}px`;
        });
    }
    render () {
        return (
            <div className={styles.blockSnippets}>
                <div
                    className={styles.blocksPreview}
                    ref={this.setBlocksRef}
                />
                <div className={styles.blockSnippetTip}>
                    {'Tip: Check the box next to the "guess" block in the palette to see the prediction on stage!'}
                </div>
            </div>
        );
    }
}

ExampleBlockSnippet.propTypes = {
    labelName: PropTypes.string.isRequired
};

export default ExampleBlockSnippet;
