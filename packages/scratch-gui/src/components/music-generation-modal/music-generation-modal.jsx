import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';

import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import Spinner from '../spinner/spinner.jsx';

import styles from './music-generation-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Generate Music',
        description: 'AI music generation modal title',
        id: 'gui.musicGenerationModal.title'
    },
    promptPlaceholder: {
        defaultMessage: 'e.g. lo-fi hip hop with mellow piano and vinyl crackle',
        description: 'Placeholder for the AI music prompt input',
        id: 'gui.musicGenerationModal.promptPlaceholder'
    }
});

const MusicGenerationModalComponent = ({
    prompt,
    isGenerating,
    errorMessage,
    onChangePrompt,
    onGenerate,
    onClose
}) => {
    const intl = useIntl();
    const canGenerate = !isGenerating && prompt.trim().length > 0;
    return (
        <Modal
            className={styles.modalContent}
            contentLabel={intl.formatMessage(messages.title)}
            onRequestClose={onClose}
        >
            <Box className={styles.body}>
                <label
                    className={styles.label}
                    htmlFor="music-generation-prompt"
                >
                    <FormattedMessage
                        defaultMessage="Describe the music you want (30 seconds, instrumental):"
                        description="Label above the AI music prompt input"
                        id="gui.musicGenerationModal.label"
                    />
                </label>
                <textarea
                    className={styles.promptInput}
                    disabled={isGenerating}
                    id="music-generation-prompt"
                    maxLength={300}
                    placeholder={intl.formatMessage(messages.promptPlaceholder)}
                    rows={3}
                    value={prompt}
                    onChange={onChangePrompt}
                />
                {errorMessage ? (
                    <div className={styles.error}>{errorMessage}</div>
                ) : null}
                {isGenerating ? (
                    <div className={styles.helper}>
                        <FormattedMessage
                            defaultMessage="You can close this window — we'll let you know when it's ready."
                            description="Hint shown while AI music is generating in the background"
                            id="gui.musicGenerationModal.backgroundHint"
                        />
                    </div>
                ) : null}
                <div className={styles.buttonRow}>
                    <button
                        className={styles.generateButton}
                        disabled={!canGenerate}
                        onClick={onGenerate}
                    >
                        {isGenerating ? (
                            <>
                                <Spinner
                                    className={styles.spinner}
                                    level="info"
                                />
                                <FormattedMessage
                                    defaultMessage="Generating…"
                                    description="Button label while AI music is generating"
                                    id="gui.musicGenerationModal.generating"
                                />
                            </>
                        ) : (
                            <FormattedMessage
                                defaultMessage="Generate"
                                description="Button to start AI music generation"
                                id="gui.musicGenerationModal.generate"
                            />
                        )}
                    </button>
                </div>
            </Box>
        </Modal>
    );
};

MusicGenerationModalComponent.propTypes = {
    errorMessage: PropTypes.string,
    isGenerating: PropTypes.bool.isRequired,
    onChangePrompt: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    onGenerate: PropTypes.func.isRequired,
    prompt: PropTypes.string.isRequired
};

export default MusicGenerationModalComponent;
