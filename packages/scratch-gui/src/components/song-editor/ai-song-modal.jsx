import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, injectIntl} from 'react-intl';

import Modal from '../../containers/modal.jsx';
import intlShape from '../../lib/intlShape.js';

import './ai-song-modal.raw.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Generate a Song with AI',
        description: 'Title of the AI song generation modal',
        id: 'gui.songTab.aiSongModalTitle'
    },
    promptLabel: {
        defaultMessage: 'Describe the song you want:',
        description: 'Label for the AI song prompt textarea',
        id: 'gui.songTab.aiSongPromptLabel'
    },
    placeholder: {
        defaultMessage: 'e.g. a chill lo-fi beat with a soft piano melody',
        description: 'Placeholder text for the AI song prompt textarea',
        id: 'gui.songTab.aiSongPromptPlaceholder'
    },
    tryLabel: {
        defaultMessage: 'Try:',
        description: 'Label preceding example AI song prompts',
        id: 'gui.songTab.aiSongTryLabel'
    }
});

const EXAMPLE_PROMPTS = [
    'a spooky piano melody in a minor key',
    'an upbeat funk groove with bass and drums',
    'a sad cello solo',
    'an 8-bit video game boss theme'
];

class AiSongModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {prompt: ''};
        this.handleChange = this.handleChange.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleGenerate = this.handleGenerate.bind(this);
        this.handleExampleClick = this.handleExampleClick.bind(this);
    }

    handleChange (e) {
        this.setState({prompt: e.target.value});
    }

    handleKeyDown (e) {
        // Cmd/Ctrl+Enter submits, like a typical chat input.
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            this.handleGenerate();
        }
    }

    handleGenerate () {
        const trimmed = this.state.prompt.trim();
        if (!trimmed || this.props.busy) return;
        this.props.onGenerate(trimmed);
    }

    handleExampleClick (event) {
        const example = event.currentTarget.getAttribute('data-example');
        if (example) this.setState({prompt: example});
    }

    render () {
        const {busy, error, intl, onCancel} = this.props;
        const canSubmit = this.state.prompt.trim().length > 0 && !busy;
        return (
            <Modal
                className="ai-song-modal"
                contentLabel={intl.formatMessage(messages.title)}
                id="aiSongModal"
                onRequestClose={busy ? null : onCancel}
            >
                <div className="ai-song-modal-body">
                    <h2 className="ai-song-modal-title">
                        <FormattedMessage {...messages.title} />
                    </h2>
                    <label
                        className="ai-song-modal-label"
                        htmlFor="aiSongPrompt"
                    >
                        <FormattedMessage {...messages.promptLabel} />
                    </label>
                    <textarea
                        autoFocus
                        className="ai-song-modal-textarea"
                        disabled={busy}
                        id="aiSongPrompt"
                        placeholder={intl.formatMessage(messages.placeholder)}
                        rows={3}
                        value={this.state.prompt}
                        onChange={this.handleChange}
                        onKeyDown={this.handleKeyDown}
                    />
                    <div className="ai-song-modal-examples">
                        <span className="ai-song-modal-examples-label">
                            <FormattedMessage {...messages.tryLabel} />
                        </span>
                        {EXAMPLE_PROMPTS.map(example => (
                            <button
                                className="ai-song-modal-example-chip"
                                data-example={example}
                                disabled={busy}
                                key={example}
                                type="button"
                                onClick={this.handleExampleClick}
                            >
                                {example}
                            </button>
                        ))}
                    </div>
                    {error ? (
                        <div
                            className="ai-song-modal-error"
                            role="alert"
                        >
                            {error}
                        </div>
                    ) : null}
                    <div className="ai-song-modal-buttons">
                        <button
                            className="ai-song-modal-cancel"
                            disabled={busy}
                            type="button"
                            onClick={onCancel}
                        >
                            <FormattedMessage
                                defaultMessage="Cancel"
                                description="Cancel button in AI song modal"
                                id="gui.songTab.aiSongCancel"
                            />
                        </button>
                        <button
                            className="ai-song-modal-generate"
                            disabled={!canSubmit}
                            type="button"
                            onClick={this.handleGenerate}
                        >
                            {busy ? (
                                <span className="ai-song-modal-spinner-row">
                                    <span className="ai-song-modal-spinner" />
                                    <FormattedMessage
                                        defaultMessage="Generating…"
                                        description="Status while AI is generating a song"
                                        id="gui.songTab.aiSongGenerating"
                                    />
                                </span>
                            ) : (
                                <FormattedMessage
                                    defaultMessage="Generate"
                                    description="Generate button in AI song modal"
                                    id="gui.songTab.aiSongGenerate"
                                />
                            )}
                        </button>
                    </div>
                </div>
            </Modal>
        );
    }
}

AiSongModal.propTypes = {
    busy: PropTypes.bool,
    error: PropTypes.string,
    intl: intlShape.isRequired,
    onCancel: PropTypes.func.isRequired,
    onGenerate: PropTypes.func.isRequired
};

export default injectIntl(AiSongModal);
