import React, {useEffect, useRef, useState} from 'react';
import PropTypes from 'prop-types';
import ReactModal from 'react-modal';
import styles from './code-explanation-modal.css';

const CodeExplanationModal = ({isOpen, spriteName, status, text, onClose}) => {
    const [offset, setOffset] = useState({dx: 0, dy: 0});
    const dragRef = useRef(null);

    // Reset position each time the modal opens
    useEffect(() => {
        if (isOpen) setOffset({dx: 0, dy: 0});
    }, [isOpen]);

    // Window-level mouse handlers so drag works even if cursor leaves the header
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

    if (!isOpen) return null;

    const handleHeaderMouseDown = e => {
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startDx: offset.dx,
            startDy: offset.dy
        };
        e.preventDefault();
    };

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
                    {'Explain Code'}
                    {spriteName ? <span className={styles.spriteName}>{` — ${spriteName}`}</span> : null}
                </div>
                <button
                    className={styles.closeButton}
                    onClick={onClose}
                >
                    {'✕'}
                </button>
            </div>
            <div className={styles.body}>
                {status === 'loading' && (
                    <div className={styles.loadingContainer}>
                        <div className={styles.spinner} />
                        <div className={styles.loadingText}>{'Gemma is reading the code…'}</div>
                    </div>
                )}
                {status === 'done' && (
                    <div className={styles.explanationText}>{text}</div>
                )}
                {status === 'error' && (
                    <div className={styles.errorText}>{text}</div>
                )}
            </div>
        </ReactModal>
    );
};

CodeExplanationModal.propTypes = {
    isOpen: PropTypes.bool,
    spriteName: PropTypes.string,
    status: PropTypes.oneOf(['idle', 'loading', 'done', 'error']),
    text: PropTypes.string,
    onClose: PropTypes.func.isRequired
};

export default CodeExplanationModal;
