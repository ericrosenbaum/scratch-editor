import PropTypes from 'prop-types';
import React from 'react';

import {listAvailableProviders} from '../../lib/song-ai.js';

const STORAGE_KEY = 'scratchSongAiProvider';

const getStoredProviderId = () => {
    if (typeof localStorage === 'undefined') return null;
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
        return null;
    }
};

const storeProviderId = id => {
    if (typeof localStorage === 'undefined' || !id) return;
    try {
        localStorage.setItem(STORAGE_KEY, id);
    } catch (e) { /* ignore */ }
};

class ProviderPicker extends React.Component {
    constructor (props) {
        super(props);
        this.state = {available: null};
        this.handleChange = this.handleChange.bind(this);
    }

    componentDidMount () {
        listAvailableProviders().then(available => {
            this.setState({available});
            // Pick the stored choice if it's still available; otherwise the
            // first available provider. Notify the parent either way so it
            // has a concrete providerId to dispatch with.
            const stored = getStoredProviderId();
            const storedAvailable = available.find(p => p.id === stored && p.available);
            const fallback = available.find(p => p.available);
            const effective = (storedAvailable || fallback || {}).id || null;
            if (effective && this.props.onChange) {
                this.props.onChange(effective);
            }
        });
    }

    handleChange (e) {
        const id = e.target.value;
        storeProviderId(id);
        if (this.props.onChange) this.props.onChange(id);
    }

    render () {
        const {available} = this.state;
        if (!available) return null;
        const usable = available.filter(p => p.available);
        // Hide the picker if there's nothing meaningful to choose between.
        if (usable.length <= 1) return null;
        const {value, busy} = this.props;
        return (
            <div className="ai-song-modal-provider">
                <label
                    className="ai-song-modal-provider-label"
                    htmlFor="aiSongProviderPicker"
                >{'AI: '}</label>
                <select
                    className="ai-song-modal-provider-select"
                    disabled={busy}
                    id="aiSongProviderPicker"
                    value={value || ''}
                    onChange={this.handleChange}
                >
                    {usable.map(p => (
                        <option
                            key={p.id}
                            value={p.id}
                        >{p.label}</option>
                    ))}
                </select>
            </div>
        );
    }
}

ProviderPicker.propTypes = {
    busy: PropTypes.bool,
    onChange: PropTypes.func,
    value: PropTypes.string
};

export default ProviderPicker;
export {getStoredProviderId, storeProviderId};
