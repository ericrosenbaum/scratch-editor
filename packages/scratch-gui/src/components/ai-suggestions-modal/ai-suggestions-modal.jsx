import React, {useEffect, useRef, useState, useCallback} from 'react';
import PropTypes from 'prop-types';
import ReactModal from 'react-modal';
import styles from './ai-suggestions-modal.css';

const AiSuggestionsModal = ({
    isOpen,
    status,
    previewText,
    error,
    onClose,
    onGenerate,
    onAdd,
    onRegenerate
}) => {
    const [prompt, setPrompt] = useState('');
    const [offset, setOffset] = useState({dx: 0, dy: 0});
    const dragRef = useRef(null);
    const inputRef = useRef(null);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setOffset({dx: 0, dy: 0});
            setPrompt('');
            // Focus the input after a short delay to let the modal render
            setTimeout(() => {
                if (inputRef.current) inputRef.current.focus();
            }, 100);
        }
    }, [isOpen]);

    // Drag handlers
    useEffect(() => {
        const onMouseMove = e => {
            if (!dragRef.current) return;
            setOffset({
                dx: dragRef.current.startDx + (e.clientX - dragRef.current.startX),
                dy: dragRef.current.startDy + (e.clientY - dragRef.current.startY)
            });
        };
        const onMouseUp = () => {
            dragRef.current = null;
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, []);

    const handleHeaderMouseDown = useCallback(e => {
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startDx: offset.dx,
            startDy: offset.dy
        };
        e.preventDefault();
    }, [offset]);

    const handleSubmit = useCallback(e => {
        if (e) e.preventDefault();
        if (prompt.trim() && status !== 'generating') {
            onGenerate(prompt.trim());
        }
    }, [prompt, status, onGenerate]);

    const handleKeyDown = useCallback(e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    }, [handleSubmit]);

    const handleRegenerate = useCallback(() => {
        if (prompt.trim()) {
            onRegenerate(prompt.trim());
        }
    }, [prompt, onRegenerate]);

    if (!isOpen) return null;

    const isGenerating = status === 'generating';
    const isDone = status === 'done';
    const isError = status === 'error';

    return (
        <ReactModal
            isOpen={isOpen}
            onRequestClose={onClose}
            className={styles.modalContainer}
            overlayClassName={styles.modalOverlay}
            shouldCloseOnOverlayClick={false}
            style={{content: {transform: `translate(${offset.dx}px, ${offset.dy}px)`}}}
        >
            <div
                className={styles.header}
                onMouseDown={handleHeaderMouseDown}
            >
                <div className={styles.title}>
                    {'AI Code Suggestions'}
                </div>
                <button
                    className={styles.closeButton}
                    onClick={onClose}
                >
                    {'\u2715'}
                </button>
            </div>
            <div className={styles.body}>
                <div className={styles.promptSection}>
                    <label className={styles.promptLabel}>
                        {'What do you want this sprite to do?'}
                    </label>
                    <div className={styles.promptRow}>
                        <input
                            ref={inputRef}
                            className={styles.promptInput}
                            type="text"
                            placeholder="e.g. walk back and forth, chase the mouse..."
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isGenerating}
                        />
                        <button
                            className={styles.generateButton}
                            onClick={handleSubmit}
                            disabled={!prompt.trim() || isGenerating}
                        >
                            {isGenerating ? 'Generating...' : 'Generate'}
                        </button>
                    </div>
                </div>

                {isGenerating && (
                    <div className={styles.loadingContainer}>
                        <div className={styles.spinner} />
                        <div className={styles.loadingText}>
                            {'Gemma is writing code...'}
                        </div>
                    </div>
                )}

                {isDone && previewText && (
                    <div className={styles.previewSection}>
                        <div className={styles.previewLabel}>{'Suggested code:'}</div>
                        <div className={styles.previewCode}>{previewText}</div>
                        <div className={styles.actionRow}>
                            <button
                                className={styles.regenerateButton}
                                onClick={handleRegenerate}
                            >
                                {'Regenerate'}
                            </button>
                            <button
                                className={styles.addButton}
                                onClick={onAdd}
                            >
                                {'Add to Project'}
                            </button>
                        </div>
                    </div>
                )}

                {isError && (
                    <div>
                        <div className={styles.errorText}>{error}</div>
                        <div className={styles.actionRow}>
                            <button
                                className={styles.regenerateButton}
                                onClick={handleRegenerate}
                                disabled={!prompt.trim()}
                            >
                                {'Try Again'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </ReactModal>
    );
};

AiSuggestionsModal.propTypes = {
    isOpen: PropTypes.bool,
    status: PropTypes.oneOf(['idle', 'generating', 'done', 'error']),
    previewText: PropTypes.string,
    error: PropTypes.string,
    onClose: PropTypes.func.isRequired,
    onGenerate: PropTypes.func.isRequired,
    onAdd: PropTypes.func.isRequired,
    onRegenerate: PropTypes.func.isRequired
};

export default AiSuggestionsModal;
