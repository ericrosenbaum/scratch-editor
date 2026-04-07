import PropTypes from 'prop-types';
import React from 'react';
import styles from './ai-code-modal.css';

const AiCodeModalComponent = ({
    isOpen,
    prompt,
    generatedCode,
    isGenerating,
    error,
    onClose,
    onPromptChange,
    onSubmit,
    onAddToSprite
}) => {
    if (!isOpen) return null;

    const handleKeyDown = e => {
        if (e.key === 'Enter' && !e.shiftKey && !isGenerating && prompt.trim()) {
            e.preventDefault();
            onSubmit();
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <div className={styles.modalHeader}>
                    <span>{'AI Code Suggestions'}</span>
                    <button
                        className={styles.closeButton}
                        onClick={onClose}
                    >
                        {'\u2715'}
                    </button>
                </div>
                <div className={styles.modalBody}>
                    <textarea
                        className={styles.promptInput}
                        placeholder="Describe what you want the sprite to do..."
                        value={prompt}
                        onChange={e => onPromptChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={2}
                    />
                    <div className={styles.buttonRow}>
                        <button
                            className={styles.generateButton}
                            disabled={isGenerating || !prompt.trim()}
                            onClick={onSubmit}
                        >
                            {isGenerating ? 'Generating...' : 'Generate'}
                        </button>
                        {generatedCode && (
                            <button
                                className={styles.addButton}
                                disabled={isGenerating}
                                onClick={onAddToSprite}
                            >
                                {'Add to Sprite'}
                            </button>
                        )}
                    </div>
                    {isGenerating && (
                        <div className={styles.statusText}>
                            {'Thinking...'}
                        </div>
                    )}
                    {error && (
                        <div className={styles.errorText}>
                            {error}
                        </div>
                    )}
                    {generatedCode && (
                        <div className={styles.codeDisplay}>
                            {generatedCode}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

AiCodeModalComponent.propTypes = {
    error: PropTypes.string,
    generatedCode: PropTypes.string,
    isGenerating: PropTypes.bool,
    isOpen: PropTypes.bool,
    onAddToSprite: PropTypes.func,
    onClose: PropTypes.func,
    onPromptChange: PropTypes.func,
    onSubmit: PropTypes.func,
    prompt: PropTypes.string
};

export default AiCodeModalComponent;
