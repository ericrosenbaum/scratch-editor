import React from 'react';
import PropTypes from 'prop-types';
import {EditorView, basicSetup} from 'codemirror';
import {EditorState, Compartment} from '@codemirror/state';
import {javascript} from '@codemirror/lang-javascript';
import {linter, lintGutter} from '@codemirror/lint';

import styles from './code-editor.css';

/**
 * A controlled CodeMirror 6 editor for authoring JS-powered block documents.
 * Diagnostics are supplied by the parent via `lintSource(doc) -> Diagnostic[]`
 * (the shape returned by static-analysis.analyze, which matches CodeMirror's).
 */
class CodeEditor extends React.Component {
    constructor (props) {
        super(props);
        this.container = React.createRef();
        this.view = null;
        this.linterCompartment = new Compartment();
    }

    componentDidMount () {
        const updateListener = EditorView.updateListener.of(update => {
            if (update.docChanged && this.props.onChange) {
                this.props.onChange(update.state.doc.toString());
            }
        });

        const state = EditorState.create({
            doc: this.props.value || '',
            extensions: [
                basicSetup,
                javascript(),
                lintGutter(),
                this.linterCompartment.of(this.makeLinter()),
                EditorView.lineWrapping,
                updateListener,
                EditorView.theme({
                    '&': {height: '100%', fontSize: '13px'},
                    '.cm-scroller': {fontFamily: 'monospace', overflow: 'auto'}
                })
            ]
        });
        this.view = new EditorView({state, parent: this.container.current});
    }

    componentDidUpdate (prevProps) {
        // Sync external value changes (e.g. switching blocks) into the editor.
        if (this.props.value !== prevProps.value && this.view) {
            const current = this.view.state.doc.toString();
            if (this.props.value !== current) {
                this.view.dispatch({
                    changes: {from: 0, to: current.length, insert: this.props.value || ''}
                });
            }
        }
    }

    componentWillUnmount () {
        if (this.view) {
            this.view.destroy();
            this.view = null;
        }
    }

    makeLinter () {
        return linter(view => {
            if (!this.props.lintSource) return [];
            const diagnostics = this.props.lintSource(view.state.doc.toString()) || [];
            // Clamp to valid ranges so CodeMirror never throws on stale offsets.
            const len = view.state.doc.length;
            return diagnostics.map(d => ({
                from: Math.max(0, Math.min(d.from || 0, len)),
                to: Math.max(0, Math.min(typeof d.to === 'number' ? d.to : (d.from || 0), len)),
                severity: d.severity || 'error',
                message: d.message
            }));
        }, {delay: 300});
    }

    render () {
        return (
            <div
                className={styles.editor}
                ref={this.container}
                data-testid="js-block-code-editor"
            />
        );
    }
}

CodeEditor.propTypes = {
    value: PropTypes.string,
    onChange: PropTypes.func,
    lintSource: PropTypes.func
};

export default CodeEditor;
