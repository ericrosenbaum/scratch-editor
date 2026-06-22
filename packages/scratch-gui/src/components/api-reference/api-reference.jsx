import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';

import {API_REFERENCE} from '../../lib/js-blocks/api-reference';
import styles from './api-reference.css';

/**
 * A searchable, scrollable panel listing the complete `Scratch.*` API available
 * to authored JS-powered block code. Shown beside the editor so you can read the
 * API while writing the block.
 */
class ApiReference extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleSearch', 'handleClose']);
        this.state = {query: ''};
    }
    handleSearch (e) {
        this.setState({query: e.target.value});
    }
    handleClose () {
        if (this.props.onClose) this.props.onClose();
    }
    render () {
        const q = this.state.query.trim().toLowerCase();
        const sections = API_REFERENCE
            .map(section => ({
                section: section.section,
                entries: q ?
                    section.entries.filter(en =>
                        en.sig.toLowerCase().includes(q) || en.desc.toLowerCase().includes(q)) :
                    section.entries
            }))
            .filter(section => section.entries.length > 0);

        return (
            <div className={styles.panel}>
                <div className={styles.panelHeader}>
                    <span className={styles.panelTitle}>{'API reference'}</span>
                    {this.props.onClose ? (
                        <button
                            className={styles.closeButton}
                            title="Close"
                            onClick={this.handleClose}
                        >{'×'}</button>
                    ) : null}
                </div>
                <input
                    className={styles.search}
                    type="text"
                    placeholder="Search the API…"
                    value={this.state.query}
                    onChange={this.handleSearch}
                />
                <div className={styles.list}>
                    {sections.length === 0 ? (
                        <p className={styles.empty}>{'No matches.'}</p>
                    ) : sections.map(section => (
                        <div
                            key={section.section}
                            className={styles.section}
                        >
                            <h3 className={styles.sectionTitle}>{section.section}</h3>
                            {section.entries.map(entry => (
                                <div
                                    key={entry.sig}
                                    className={styles.entry}
                                >
                                    <code className={styles.sig}>{entry.sig}</code>
                                    <span className={styles.desc}>{entry.desc}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }
}

ApiReference.propTypes = {
    onClose: PropTypes.func
};

export default ApiReference;
