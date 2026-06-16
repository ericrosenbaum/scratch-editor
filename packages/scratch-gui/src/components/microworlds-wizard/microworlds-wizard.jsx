import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import styles from './microworlds-wizard.css';

/* Chevron glyph for the round "Next" button. */
const Chevron = () => (
    <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
    >
        <path
            d="M9 5l7 7-7 7"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

/* Speaker glyph for the read-aloud button. */
const SpeakerIcon = () => (
    <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
    >
        <path
            d="M4 9v6h3.5L13 19V5L7.5 9H4z"
            fill="currentColor"
        />
        <path
            d="M16.5 8.5a4 4 0 0 1 0 7M19 6a7.5 7.5 0 0 1 0 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
        />
    </svg>
);

/* Read-aloud button: speaks the instruction via the browser's speech
   synthesis and pulses while speaking. Tap again to stop. */
const SpeakButton = ({text}) => {
    const [on, setOn] = React.useState(false);

    // Stop any in-progress speech when the step's text changes or on unmount.
    React.useEffect(() => {
        setOn(false);
        return () => {
            if (window.speechSynthesis) window.speechSynthesis.cancel();
        };
    }, [text]);

    const speak = React.useCallback(() => {
        const synth = window.speechSynthesis;
        if (!synth) return;
        synth.cancel();
        if (on) {
            setOn(false);
            return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1.1;
        utterance.onend = () => setOn(false);
        utterance.onerror = () => setOn(false);
        setOn(true);
        synth.speak(utterance);
    }, [on, text]);

    return (
        <button
            className={classNames(styles.btnSpeak, {[styles.btnSpeakOn]: on})}
            onClick={speak}
            aria-label="Read instruction aloud"
            title="Read aloud"
        >
            <SpeakerIcon />
        </button>
    );
};

SpeakButton.propTypes = {
    text: PropTypes.string
};

/* Translucent demo cursors for the "Show me" hint. */
const CursorArrow = () => (
    <svg
        width="36"
        height="36"
        viewBox="0 0 24 24"
        style={{display: 'block'}}
        aria-hidden="true"
    >
        <path
            d="M5 2 L5 18 L9 14.5 L11.8 20.5 L14.3 19.4 L11.6 13.6 L17.5 13.2 Z"
            fill="rgba(40,46,66,0.62)"
            stroke="#fff"
            strokeWidth="1.3"
            strokeLinejoin="round"
        />
    </svg>
);

const GRAB_PATH = 'M10 17 V12.5 a1.8 1.8 0 0 1 3.6 0 V11 a1.8 1.8 0 0 1 3.6 0 ' +
    'V11.5 a1.8 1.8 0 0 1 3.6 0 V13 a1.8 1.8 0 0 1 3.6 0 V19 a7 7 0 0 1 -7 7 ' +
    'h-1.5 a7 7 0 0 1 -6.1 -3.6 l-2.4 -4.2 a1.9 1.9 0 0 1 3.1 -2 z';

const CursorGrab = () => (
    <svg
        width="50"
        height="50"
        viewBox="0 0 32 32"
        style={{display: 'block'}}
        aria-hidden="true"
    >
        <path
            d={GRAB_PATH}
            fill="rgba(255,255,255,0.92)"
            stroke="rgba(40,46,66,0.78)"
            strokeWidth="1.4"
            strokeLinejoin="round"
        />
    </svg>
);

const DEMO_MS = 2400;
const EASE = 'cubic-bezier(0.25, 0.1, 0.25, 1)';
// Strong ease-in on the final hold->fade segment so the cursor stays put, then
// snaps away quickly right at the end (rather than fading the whole way).
const FADE_EASE = 'cubic-bezier(0.85, 0, 1, 1)';
const tr = (x, y) => `translate(${x}px, ${y}px)`;
const centerOf = el => {
    const r = el.getBoundingClientRect();
    return {x: r.left + (r.width / 2), y: r.top + (r.height / 2)};
};

/* "Show me" cursor: a translucent pointer that always starts at the Show me
   button, then either taps a click `target` (with a ripple) or grabs the loose
   `dragHint.block` and drags a ghost copy onto the anchor. Plays once. Positions
   are measured live from the real editor elements. */
const ShowMeCursor = ({originRef, dragHint, clickTarget}) => {
    const cursorRef = React.useRef(null);
    const arrowRef = React.useRef(null);
    const grabRef = React.useRef(null);
    const ghostRef = React.useRef(null);
    const rippleRef = React.useRef(null);

    React.useLayoutEffect(() => {
        let anims = [];
        let retry = null;
        const reduce = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const start = () => {
            const cursor = cursorRef.current;
            const origin = originRef.current;
            if (!cursor || !origin) {
                retry = setTimeout(start, 150);
                return;
            }
            const from = centerOf(origin);
            // Linear timeline so each segment's duration is exactly its offset
            // span; per-keyframe easing shapes the glide and the final fade.
            const opts = {duration: DEMO_MS, iterations: 1};

            if (dragHint) {
                const dragEl = document.querySelector(dragHint.block);
                const anchorEl = document.querySelector(dragHint.anchor);
                const ghost = ghostRef.current;
                if (!dragEl || !anchorEl || !ghost) {
                    retry = setTimeout(start, 150);
                    return;
                }
                const d = dragEl.getBoundingClientRect();
                const a = anchorEl.getBoundingClientRect();
                const w = d.width;
                const h = d.height;
                ghost.style.width = `${w}px`;
                ghost.style.height = `${h}px`;
                ghost.style.backgroundColor = dragHint.color;

                // Cursor grabs the block near its center; the ghost copy tracks
                // the cursor so it lands meshed with the anchor.
                const grab = {x: d.left + (w / 2), y: d.top + (h / 2)};
                const tl = dragHint.placement === 'below' ?
                    {x: a.left, y: a.bottom - 6} :
                    {x: a.left, y: (a.top - h) + 6};
                const drop = {x: tl.x + (w / 2), y: tl.y + (h / 2)};

                if (reduce) {
                    cursor.style.transform = tr(drop.x, drop.y);
                    cursor.style.opacity = 1;
                    grabRef.current.style.opacity = 1;
                    arrowRef.current.style.opacity = 0;
                    ghost.style.transform = tr(tl.x, tl.y);
                    ghost.style.opacity = 0.5;
                    return;
                }

                anims.push(cursor.animate([
                    {transform: tr(from.x, from.y), opacity: 0, offset: 0},
                    {transform: tr(from.x, from.y), opacity: 1, offset: 0.07, easing: EASE},
                    {transform: tr(grab.x, grab.y), opacity: 1, offset: 0.4},
                    {transform: tr(grab.x, grab.y), opacity: 1, offset: 0.47, easing: EASE},
                    {transform: tr(drop.x, drop.y), opacity: 1, offset: 0.83},
                    {transform: tr(drop.x, drop.y), opacity: 1, offset: 0.88, easing: FADE_EASE},
                    {transform: tr(drop.x, drop.y), opacity: 0, offset: 1}
                ], opts));
                anims.push(ghost.animate([
                    {transform: tr(d.left, d.top), opacity: 0, offset: 0},
                    {transform: tr(d.left, d.top), opacity: 0, offset: 0.43},
                    {transform: tr(d.left, d.top), opacity: 0.5, offset: 0.47, easing: EASE},
                    {transform: tr(tl.x, tl.y), opacity: 0.5, offset: 0.83},
                    {transform: tr(tl.x, tl.y), opacity: 0.5, offset: 0.88, easing: FADE_EASE},
                    {transform: tr(tl.x, tl.y), opacity: 0, offset: 1}
                ], opts));
                anims.push(arrowRef.current.animate([
                    {opacity: 1, offset: 0}, {opacity: 1, offset: 0.4},
                    {opacity: 0, offset: 0.47}, {opacity: 0, offset: 1}
                ], opts));
                anims.push(grabRef.current.animate([
                    {opacity: 0, offset: 0}, {opacity: 0, offset: 0.4},
                    {opacity: 1, offset: 0.47}, {opacity: 1, offset: 1}
                ], opts));
                return;
            }

            // ---- click mode: glide to the target and tap it ----
            const targetEl = clickTarget && document.querySelector(clickTarget);
            const ripple = rippleRef.current;
            if (!targetEl || !ripple) {
                retry = setTimeout(start, 150);
                return;
            }
            const to = centerOf(targetEl);
            ripple.style.left = `${to.x}px`;
            ripple.style.top = `${to.y}px`;
            grabRef.current.style.opacity = 0; // click uses the arrow pointer only
            arrowRef.current.style.opacity = 1;

            if (reduce) {
                cursor.style.transform = tr(to.x, to.y);
                cursor.style.opacity = 1;
                return;
            }

            anims.push(cursor.animate([
                {transform: tr(from.x, from.y), opacity: 0, offset: 0},
                {transform: tr(from.x, from.y), opacity: 1, offset: 0.07, easing: EASE},
                {transform: tr(to.x, to.y), opacity: 1, offset: 0.72},
                {transform: tr(to.x, to.y + 4), opacity: 1, offset: 0.8},
                {transform: tr(to.x, to.y), opacity: 1, offset: 0.86, easing: FADE_EASE},
                {transform: tr(to.x, to.y), opacity: 0, offset: 1}
            ], opts));
            anims.push(ripple.animate([
                {transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0, offset: 0},
                {transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0, offset: 0.72},
                {transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0.65, offset: 0.8},
                {transform: 'translate(-50%, -50%) scale(1.5)', opacity: 0, offset: 0.96},
                {transform: 'translate(-50%, -50%) scale(1.5)', opacity: 0, offset: 1}
            ], opts));
        };

        start();
        const onResize = () => {
            anims.forEach(an => an.cancel());
            anims = [];
            start();
        };
        window.addEventListener('resize', onResize);
        return () => {
            if (retry) clearTimeout(retry);
            window.removeEventListener('resize', onResize);
            anims.forEach(an => an.cancel());
        };
    }, [originRef, dragHint, clickTarget]);

    return (
        <div className={styles.ghostLayer}>
            {dragHint ?
                <div
                    className={styles.ghostBlock}
                    ref={ghostRef}
                /> :
                <div
                    className={styles.ripple}
                    ref={rippleRef}
                />
            }
            <div
                className={styles.ghostCursor}
                ref={cursorRef}
            >
                <span
                    className={styles.gcArrow}
                    ref={arrowRef}
                ><CursorArrow /></span>
                <span
                    className={styles.gcGrab}
                    ref={grabRef}
                ><CursorGrab /></span>
            </div>
        </div>
    );
};

ShowMeCursor.propTypes = {
    clickTarget: PropTypes.string,
    dragHint: PropTypes.shape({
        anchor: PropTypes.string,
        block: PropTypes.string,
        color: PropTypes.string,
        placement: PropTypes.oneOf(['above', 'below'])
    }),
    originRef: PropTypes.shape({current: PropTypes.any})
};

const MicroworldsWizard = props => {
    const {
        canAdvance,
        clickTarget,
        dragHint,
        isLastStep,
        onGoToStep,
        onNext,
        prompt,
        stepCount,
        stepIndex
    } = props;

    const [showMe, setShowMe] = React.useState(false);
    const showMeRef = React.useRef(null);

    // "Show me" is only locked out while its (one-shot) demo is playing.
    const showMeDisabled = showMe;

    // Hide the hint whenever the step changes or its action is completed.
    React.useEffect(() => setShowMe(false), [stepIndex]);
    React.useEffect(() => {
        if (canAdvance) setShowMe(false);
    }, [canAdvance]);

    // The cursor demo runs once: dismiss it when it finishes, or as soon as the
    // user interacts (the press that opened it is deferred a tick so it doesn't
    // immediately close).
    React.useEffect(() => {
        if (!showMe) return;
        const dismiss = () => setShowMe(false);
        const doneId = setTimeout(dismiss, DEMO_MS);
        const clickId = setTimeout(() => document.addEventListener('pointerdown', dismiss), 0);
        return () => {
            clearTimeout(doneId);
            clearTimeout(clickId);
            document.removeEventListener('pointerdown', dismiss);
        };
    }, [showMe]);

    const handleShowMe = React.useCallback(() => setShowMe(true), []);
    const handlePipClick = React.useCallback(
        e => onGoToStep(Number(e.currentTarget.dataset.step)),
        [onGoToStep]
    );

    return (
        <div className={styles.wizardContainer}>
            <div className={styles.tutBar}>
                <SpeakButton text={prompt} />

                <div className={styles.tutTitle}>{prompt}</div>

                <button
                    ref={showMeRef}
                    className={classNames(styles.btnShow, {
                        [styles.btnShowDisabled]: showMeDisabled
                    })}
                    disabled={showMeDisabled}
                    onClick={handleShowMe}
                >
                    {'Show me'}
                </button>

                <span className={styles.grow} />

                <div className={styles.stepDots}>
                    {Array.from({length: stepCount}).map((_, index) => (
                        <button
                            key={index}
                            className={classNames(styles.dot, {
                                [styles.dotOn]: index === stepIndex
                            })}
                            data-step={index}
                            onClick={handlePipClick}
                            aria-label={`Go to step ${index + 1}`}
                        />
                    ))}
                </div>

                <button
                    className={styles.btnNext}
                    onClick={onNext}
                    aria-label={isLastStep ? 'Finish' : 'Next'}
                >
                    <Chevron />
                </button>
            </div>

            {showMe && (dragHint || clickTarget) ? (
                <ShowMeCursor
                    originRef={showMeRef}
                    dragHint={dragHint}
                    clickTarget={clickTarget}
                />
            ) : null}
        </div>
    );
};

MicroworldsWizard.propTypes = {
    canAdvance: PropTypes.bool,
    clickTarget: PropTypes.string,
    dragHint: PropTypes.shape({
        anchor: PropTypes.string,
        block: PropTypes.string,
        color: PropTypes.string,
        placement: PropTypes.oneOf(['above', 'below'])
    }),
    isLastStep: PropTypes.bool,
    onGoToStep: PropTypes.func.isRequired,
    onNext: PropTypes.func.isRequired,
    prompt: PropTypes.string.isRequired,
    stepCount: PropTypes.number.isRequired,
    stepIndex: PropTypes.number.isRequired
};

export default MicroworldsWizard;
