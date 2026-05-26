import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, injectIntl} from 'react-intl';

import Modal from '../../containers/modal.jsx';
import intlShape from '../../lib/intlShape.js';
import {isSupported as isVoiceSupported, listen as voiceListen} from '../../lib/voice-input.js';

import micIcon from './icon--mic.svg';
import './ai-song-modal.raw.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'AI Edit Track',
        description: 'Title of the per-track AI edit modal',
        id: 'gui.songTab.aiEditTrackTitle'
    },
    promptLabel: {
        defaultMessage: 'What should the AI do to this track?',
        description: 'Label for the AI track edit prompt textarea',
        id: 'gui.songTab.aiEditTrackPromptLabel'
    },
    placeholder: {
        defaultMessage: 'e.g. harmonize this piano part with 3-note chords',
        description: 'Placeholder text for the AI track edit prompt textarea',
        id: 'gui.songTab.aiEditTrackPlaceholder'
    },
    tryLabel: {
        defaultMessage: 'Try:',
        description: 'Label preceding example track edit prompts',
        id: 'gui.songTab.aiEditTrackTryLabel'
    }
});

const EXAMPLE_PROMPTS_FOR_KIND = {
    instrument: [
        'harmonize this part with 3-note chords',
        'drop everything down by an octave',
        'make the melody twice as fast',
        'add syncopation and ghost notes',
        'simplify it to the strongest 8 notes'
    ],
    drum: [
        'make it a half-time groove',
        'add busy hi-hat fills before downbeats',
        'simplify to just kick + snare backbeat',
        'double the speed'
    ],
    synth: [
        'turn this into a long-held pad with whole-note chords',
        'rewrite as a bouncy 16th-note arpeggio',
        'simplify to a single sustained drone',
        'add a counter-melody an octave higher'
    ]
};

class AiEditTrackModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {prompt: '', listening: false, interimTranscript: ''};
        this.handleChange = this.handleChange.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleApply = this.handleApply.bind(this);
        this.handleExampleClick = this.handleExampleClick.bind(this);
        this.handleVoiceClick = this.handleVoiceClick.bind(this);
    }

    handleVoiceClick () {
        if (this.state.listening) return;
        this.setState({listening: true, interimTranscript: ''});
        voiceListen({
            onInterim: text => this.setState({interimTranscript: text}),
            onEnd: () => this.setState({listening: false, interimTranscript: ''})
        })
            .then(transcript => {
                this.setState({prompt: transcript, interimTranscript: ''});
            })
            .catch(() => {
                this.setState({listening: false, interimTranscript: ''});
            });
    }

    handleChange (e) {
        this.setState({prompt: e.target.value});
    }

    handleKeyDown (e) {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            this.handleApply();
        }
    }

    handleApply () {
        const trimmed = this.state.prompt.trim();
        if (!trimmed || this.props.busy) return;
        this.props.onApply(trimmed);
    }

    handleExampleClick (event) {
        const example = event.currentTarget.getAttribute('data-example');
        if (example) this.setState({prompt: example});
    }

    render () {
        const {busy, error, intl, onCancel, trackName, trackKind} = this.props;
        const canSubmit = this.state.prompt.trim().length > 0 && !busy;
        const examples = EXAMPLE_PROMPTS_FOR_KIND[trackKind] || EXAMPLE_PROMPTS_FOR_KIND.instrument;
        return (
            <Modal
                className="ai-song-modal"
                contentLabel={intl.formatMessage(messages.title)}
                id="aiEditTrackModal"
                onRequestClose={busy ? null : onCancel}
            >
                <div className="ai-song-modal-body">
                    <h2 className="ai-song-modal-title">
                        <FormattedMessage {...messages.title} />
                        {trackName ? (
                            <span className="ai-song-modal-subtitle">{` — ${trackName}`}</span>
                        ) : null}
                    </h2>
                    <label
                        className="ai-song-modal-label"
                        htmlFor="aiEditTrackPrompt"
                    >
                        <FormattedMessage {...messages.promptLabel} />
                    </label>
                    <div className="ai-song-modal-textarea-wrap">
                        <textarea
                            autoFocus
                            className="ai-song-modal-textarea"
                            disabled={busy}
                            id="aiEditTrackPrompt"
                            placeholder={intl.formatMessage(messages.placeholder)}
                            readOnly={this.state.listening}
                            rows={3}
                            value={this.state.listening && this.state.interimTranscript ?
                                this.state.interimTranscript :
                                this.state.prompt}
                            onChange={this.handleChange}
                            onKeyDown={this.handleKeyDown}
                        />
                        {isVoiceSupported() ? (
                            <button
                                className={classNames(
                                    'ai-song-modal-mic-button',
                                    {'ai-song-modal-mic-button-active': this.state.listening}
                                )}
                                disabled={busy || this.state.listening}
                                title="Speak your prompt"
                                type="button"
                                onClick={this.handleVoiceClick}
                            >
                                <img
                                    className="ai-song-modal-mic-icon"
                                    src={micIcon}
                                />
                            </button>
                        ) : null}
                    </div>
                    <div className="ai-song-modal-examples">
                        <span className="ai-song-modal-examples-label">
                            <FormattedMessage {...messages.tryLabel} />
                        </span>
                        {examples.map(example => (
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
                                description="Cancel button in AI track edit modal"
                                id="gui.songTab.aiEditTrackCancel"
                            />
                        </button>
                        <button
                            className="ai-song-modal-generate"
                            disabled={!canSubmit}
                            type="button"
                            onClick={this.handleApply}
                        >
                            {busy ? (
                                <span className="ai-song-modal-spinner-row">
                                    <span className="ai-song-modal-spinner" />
                                    <FormattedMessage
                                        defaultMessage="Editing…"
                                        description="Status while AI is editing a track"
                                        id="gui.songTab.aiEditTrackBusy"
                                    />
                                </span>
                            ) : (
                                <FormattedMessage
                                    defaultMessage="Apply"
                                    description="Apply button in AI track edit modal"
                                    id="gui.songTab.aiEditTrackApply"
                                />
                            )}
                        </button>
                    </div>
                </div>
            </Modal>
        );
    }
}

AiEditTrackModal.propTypes = {
    busy: PropTypes.bool,
    error: PropTypes.string,
    intl: intlShape.isRequired,
    trackName: PropTypes.string,
    trackKind: PropTypes.oneOf(['instrument', 'drum', 'synth']),
    onCancel: PropTypes.func.isRequired,
    onApply: PropTypes.func.isRequired
};

export default injectIntl(AiEditTrackModal);
