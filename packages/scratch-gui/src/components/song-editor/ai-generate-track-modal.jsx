import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, injectIntl} from 'react-intl';

import Modal from '../../containers/modal.jsx';
import intlShape from '../../lib/intlShape.js';
import {isSupported as isVoiceSupported, listen as voiceListen} from '../../lib/voice-input.js';
import Gemma4LoadStatus from './gemma4-load-status.jsx';
import ProviderPicker, {getStoredProviderId} from './provider-picker.jsx';

import micIcon from './icon--mic.svg';
import './ai-song-modal.raw.css';

const messages = defineMessages({
    titleInstrument: {
        defaultMessage: 'Generate Instrument Track',
        description: 'Title of the AI new-instrument-track modal',
        id: 'gui.songTab.aiGenerateInstrumentTitle'
    },
    titleDrum: {
        defaultMessage: 'Generate Drum Track',
        description: 'Title of the AI new-drum-track modal',
        id: 'gui.songTab.aiGenerateDrumTitle'
    },
    titleSynth: {
        defaultMessage: 'Generate Synth Track',
        description: 'Title of the AI new-synth-track modal',
        id: 'gui.songTab.aiGenerateSynthTitle'
    },
    titleSynthDrum: {
        defaultMessage: 'Generate Synth Drum Track',
        description: 'Title of the AI new-synth-drum-track modal',
        id: 'gui.songTab.aiGenerateSynthDrumTitle'
    },
    promptLabel: {
        defaultMessage: 'Describe the new track:',
        description: 'Label for the AI generate-track prompt textarea',
        id: 'gui.songTab.aiGenerateTrackPromptLabel'
    },
    placeholderInstrument: {
        defaultMessage: 'e.g. a funky bassline that grooves with the drums',
        description: 'Placeholder text for the AI generate-instrument-track prompt',
        id: 'gui.songTab.aiGenerateInstrumentPlaceholder'
    },
    placeholderDrum: {
        defaultMessage: 'e.g. a half-time hip-hop groove with hi-hats',
        description: 'Placeholder text for the AI generate-drum-track prompt',
        id: 'gui.songTab.aiGenerateDrumPlaceholder'
    },
    placeholderSynth: {
        defaultMessage: 'e.g. a warm pad that floats above the song',
        description: 'Placeholder text for the AI generate-synth-track prompt',
        id: 'gui.songTab.aiGenerateSynthPlaceholder'
    },
    placeholderSynthDrum: {
        defaultMessage: 'e.g. a punchy 808 trap beat with rolling hats',
        description: 'Placeholder text for the AI generate-synth-drum-track prompt',
        id: 'gui.songTab.aiGenerateSynthDrumPlaceholder'
    },
    tryLabel: {
        defaultMessage: 'Try:',
        description: 'Label preceding example generate-track prompts',
        id: 'gui.songTab.aiGenerateTrackTryLabel'
    }
});

const EXAMPLE_PROMPTS_FOR_KIND = {
    instrument: [
        'a bassline that locks in with the drums',
        'a soaring lead melody',
        'sparse piano chords that support the song',
        'a counter-melody in the high register',
        'a jazzy walking bass'
    ],
    drum: [
        'a punchy four-on-the-floor groove',
        'a half-time hip-hop beat with ghost notes',
        'a busy funk pattern with off-beat hi-hats',
        'a simple kick + snare backbeat',
        'a Latin / samba feel'
    ],
    synth: [
        'a warm pad that holds long chords under the melody',
        'a bright pluck lead with bouncing 8th notes',
        'a fat sub bass that locks in with the kick',
        'a glassy bell-like counter-melody up high',
        'a wobbly synth riff with attitude'
    ],
    synthDrum: [
        'a punchy 808 trap beat with rolling hi-hats',
        'a four-on-the-floor techno groove',
        'a boom-bap hip-hop kit with a fat kick and snappy snare',
        'a minimal electro beat with claps on the backbeat',
        'a fast drum-and-bass break'
    ]
};

class AiGenerateTrackModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            prompt: '',
            listening: false,
            interimTranscript: '',
            providerId: getStoredProviderId()
        };
        this.handleChange = this.handleChange.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleApply = this.handleApply.bind(this);
        this.handleExampleClick = this.handleExampleClick.bind(this);
        this.handleVoiceClick = this.handleVoiceClick.bind(this);
        this.handleProviderChange = this.handleProviderChange.bind(this);
    }

    handleProviderChange (providerId) {
        this.setState({providerId});
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
        this.props.onApply(trimmed, this.state.providerId);
    }

    handleExampleClick (event) {
        const example = event.currentTarget.getAttribute('data-example');
        if (example) this.setState({prompt: example});
    }

    render () {
        const {busy, error, intl, onCancel, kind} = this.props;
        const canSubmit = this.state.prompt.trim().length > 0 && !busy;
        const examples = EXAMPLE_PROMPTS_FOR_KIND[kind] || EXAMPLE_PROMPTS_FOR_KIND.instrument;
        const titleMessage = kind === 'drum' ? messages.titleDrum :
            (kind === 'synthDrum' ? messages.titleSynthDrum :
                (kind === 'synth' ? messages.titleSynth : messages.titleInstrument));
        const placeholderMessage = kind === 'drum' ? messages.placeholderDrum :
            (kind === 'synthDrum' ? messages.placeholderSynthDrum :
                (kind === 'synth' ? messages.placeholderSynth : messages.placeholderInstrument));
        return (
            <Modal
                className="ai-song-modal"
                contentLabel={intl.formatMessage(titleMessage)}
                id="aiGenerateTrackModal"
                onRequestClose={busy ? null : onCancel}
            >
                <div className="ai-song-modal-body">
                    <h2 className="ai-song-modal-title">
                        <FormattedMessage {...titleMessage} />
                    </h2>
                    <ProviderPicker
                        busy={busy}
                        value={this.state.providerId}
                        onChange={this.handleProviderChange}
                    />
                    <Gemma4LoadStatus providerId={this.state.providerId} />
                    <label
                        className="ai-song-modal-label"
                        htmlFor="aiGenerateTrackPrompt"
                    >
                        <FormattedMessage {...messages.promptLabel} />
                    </label>
                    <div className="ai-song-modal-textarea-wrap">
                        <textarea
                            autoFocus
                            className="ai-song-modal-textarea"
                            disabled={busy}
                            id="aiGenerateTrackPrompt"
                            placeholder={intl.formatMessage(placeholderMessage)}
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
                                description="Cancel button in AI generate-track modal"
                                id="gui.songTab.aiGenerateTrackCancel"
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
                                        defaultMessage="Generating…"
                                        description="Status while AI is generating a new track"
                                        id="gui.songTab.aiGenerateTrackBusy"
                                    />
                                </span>
                            ) : (
                                <FormattedMessage
                                    defaultMessage="Generate"
                                    description="Generate button in AI generate-track modal"
                                    id="gui.songTab.aiGenerateTrackApply"
                                />
                            )}
                        </button>
                    </div>
                </div>
            </Modal>
        );
    }
}

AiGenerateTrackModal.propTypes = {
    busy: PropTypes.bool,
    error: PropTypes.string,
    intl: intlShape.isRequired,
    kind: PropTypes.oneOf(['instrument', 'drum', 'synth', 'synthDrum']).isRequired,
    onCancel: PropTypes.func.isRequired,
    onApply: PropTypes.func.isRequired
};

export default injectIntl(AiGenerateTrackModal);
