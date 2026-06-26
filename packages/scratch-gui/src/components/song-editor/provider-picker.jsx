import PropTypes from 'prop-types';
import React from 'react';

import {listAvailableProviders, ACCESS_CODE_KEY, PROXY_URL} from '../../lib/song-ai.js';

const STORAGE_KEY = 'scratchSongAiProvider';

// Whether this build talks to the server-side proxy (SONG_AI_PROXY_URL was set
// at build time). The shared/workshop build runs in proxy mode; local dev does
// not. In proxy mode we (a) require a shared access code and (b) lock the Song
// Maker to Claude Haiku — the cheapest paid model — hiding the model picker so
// every call routes through the proxy's access-code + spend-cap. In local dev
// the normal user-selectable picker is restored.
const PROXY_MODE = Boolean(PROXY_URL);
const FORCED_PROVIDER_ID = PROXY_MODE ? 'anthropic' : null;

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

const getStoredAccessCode = () => {
    if (typeof localStorage === 'undefined') return null;
    try {
        return localStorage.getItem(ACCESS_CODE_KEY);
    } catch (e) {
        return null;
    }
};

const storeAccessCode = code => {
    if (typeof localStorage === 'undefined') return;
    try {
        if (code) {
            localStorage.setItem(ACCESS_CODE_KEY, code);
        } else {
            localStorage.removeItem(ACCESS_CODE_KEY);
        }
    } catch (e) { /* ignore */ }
};

class ProviderPicker extends React.Component {
    constructor (props) {
        super(props);
        const storedCode = getStoredAccessCode();
        this.state = {
            available: null,
            // Access-code gate (proxy mode only): show the input until a code is
            // saved, then collapse to a "Change" affordance.
            codeInput: storedCode || '',
            hasStoredCode: Boolean(storedCode),
            editingCode: false
        };
        this.handleChange = this.handleChange.bind(this);
        this.handleCodeInput = this.handleCodeInput.bind(this);
        this.handleSaveCode = this.handleSaveCode.bind(this);
        this.handleEditCode = this.handleEditCode.bind(this);
    }

    componentDidMount () {
        // While locked, skip availability discovery and just report the forced
        // provider so every generate/edit call routes through Haiku.
        if (FORCED_PROVIDER_ID) {
            if (this.props.onChange) this.props.onChange(FORCED_PROVIDER_ID);
            return;
        }
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

    handleCodeInput (e) {
        this.setState({codeInput: e.target.value});
    }

    handleSaveCode () {
        const code = this.state.codeInput.trim();
        storeAccessCode(code);
        this.setState({hasStoredCode: Boolean(code), editingCode: false});
    }

    handleEditCode () {
        this.setState({editingCode: true});
    }

    renderAccessCode () {
        if (!PROXY_MODE) return null;
        const {busy} = this.props;
        const {codeInput, hasStoredCode, editingCode} = this.state;
        if (hasStoredCode && !editingCode) {
            return (
                <div className="ai-song-modal-access-code ai-song-modal-access-code-saved">
                    <span>{'✓ Access code saved'}</span>
                    <button
                        className="ai-song-modal-access-code-change"
                        disabled={busy}
                        type="button"
                        onClick={this.handleEditCode}
                    >{'Change'}</button>
                </div>
            );
        }
        return (
            <div className="ai-song-modal-access-code">
                <label
                    className="ai-song-modal-access-code-label"
                    htmlFor="aiSongAccessCode"
                >{'Enter the workshop access code you were given:'}</label>
                <div className="ai-song-modal-access-code-row">
                    <input
                        className="ai-song-modal-access-code-input"
                        disabled={busy}
                        id="aiSongAccessCode"
                        placeholder={'Access code'}
                        type="password"
                        value={codeInput}
                        onChange={this.handleCodeInput}
                    />
                    <button
                        className="ai-song-modal-access-code-save"
                        disabled={busy || !codeInput.trim()}
                        type="button"
                        onClick={this.handleSaveCode}
                    >{'Save'}</button>
                </div>
            </div>
        );
    }

    renderPicker () {
        // Hidden while locked to a single provider.
        if (FORCED_PROVIDER_ID) return null;
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

    render () {
        const accessCode = this.renderAccessCode();
        const picker = this.renderPicker();
        if (!accessCode && !picker) return null;
        return (
            <React.Fragment>
                {accessCode}
                {picker}
            </React.Fragment>
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
