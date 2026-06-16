import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import styles from './microworlds-wizard.css';

/* Arrow-only "Next" glyph (no text), matching the design. */
const NextArrow = () => (
    <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        aria-hidden="true"
    >
        <path
            d="M8,5 L16,12 L8,19"
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

/* Translucent demo cursors for the drag "Show me" hint. */
const CursorArrow = () => (
    <svg
        width="20"
        height="20"
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
        width="28"
        height="28"
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

const LOOP_MS = 3400;
const EASE = 'cubic-bezier(0.25, 0.1, 0.25, 1)';

/* "Show me" drag hint: a translucent cursor glides to the loose `block`, grabs
   it, and drags a ghost copy onto the `anchor` block (above/below it), looping.
   Positions are measured live from the real Blockly blocks. */
const GhostCursor = ({block, anchor, placement, color}) => {
    const cursorRef = React.useRef(null);
    const arrowRef = React.useRef(null);
    const grabRef = React.useRef(null);
    const ghostRef = React.useRef(null);

    React.useLayoutEffect(() => {
        let anims = [];
        let retry = null;
        const reduce = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const start = () => {
            const dragEl = document.querySelector(block);
            const anchorEl = document.querySelector(anchor);
            const cursor = cursorRef.current;
            const ghost = ghostRef.current;
            if (!dragEl || !anchorEl || !cursor || !ghost) {
                retry = setTimeout(start, 150);
                return;
            }
            const d = dragEl.getBoundingClientRect();
            const a = anchorEl.getBoundingClientRect();
            const w = d.width;
            const h = d.height;
            ghost.style.width = `${w}px`;
            ghost.style.height = `${h}px`;
            ghost.style.backgroundColor = color;

            // Cursor grabs the block near its center; the ghost copy tracks the
            // cursor minus that grab offset so it lands meshed with the anchor.
            const grab = {x: d.left + (w / 2), y: d.top + (h / 2)};
            const rest = {x: grab.x + 52, y: grab.y + 46};
            const tl = placement === 'below' ?
                {x: a.left, y: a.bottom - 6} :
                {x: a.left, y: (a.top - h) + 6};
            const drop = {x: tl.x + (w / 2), y: tl.y + (h / 2)};
            const tr = (x, y) => `translate(${x}px, ${y}px)`;

            if (reduce) {
                // No motion: park the cursor + ghost at the connection point.
                cursor.style.transform = tr(drop.x, drop.y);
                cursor.style.opacity = 1;
                if (grabRef.current) grabRef.current.style.opacity = 1;
                if (arrowRef.current) arrowRef.current.style.opacity = 0;
                ghost.style.transform = tr(tl.x, tl.y);
                ghost.style.opacity = 0.5;
                return;
            }

            const opts = {duration: LOOP_MS, iterations: Infinity, easing: EASE};
            anims.push(cursor.animate([
                {transform: tr(rest.x, rest.y), opacity: 0, offset: 0},
                {transform: tr(rest.x, rest.y), opacity: 0, offset: 0.08},
                {transform: tr(grab.x, grab.y), opacity: 1, offset: 0.16},
                {transform: tr(grab.x, grab.y), opacity: 1, offset: 0.24},
                {transform: tr(drop.x, drop.y), opacity: 1, offset: 0.58},
                {transform: tr(drop.x, drop.y), opacity: 1, offset: 0.72},
                {transform: tr(drop.x, drop.y), opacity: 0, offset: 0.84},
                {transform: tr(rest.x, rest.y), opacity: 0, offset: 1}
            ], opts));
            anims.push(ghost.animate([
                {transform: tr(d.left, d.top), opacity: 0, offset: 0},
                {transform: tr(d.left, d.top), opacity: 0, offset: 0.2},
                {transform: tr(d.left, d.top), opacity: 0.5, offset: 0.24},
                {transform: tr(tl.x, tl.y), opacity: 0.5, offset: 0.58},
                {transform: tr(tl.x, tl.y), opacity: 0.5, offset: 0.72},
                {transform: tr(tl.x, tl.y), opacity: 0, offset: 0.82},
                {transform: tr(d.left, d.top), opacity: 0, offset: 1}
            ], opts));
            anims.push(arrowRef.current.animate([
                {opacity: 1, offset: 0}, {opacity: 1, offset: 0.16},
                {opacity: 0, offset: 0.22}, {opacity: 0, offset: 1}
            ], opts));
            anims.push(grabRef.current.animate([
                {opacity: 0, offset: 0}, {opacity: 0, offset: 0.16},
                {opacity: 1, offset: 0.22}, {opacity: 1, offset: 0.72},
                {opacity: 0, offset: 0.82}, {opacity: 0, offset: 1}
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
    }, [block, anchor, placement, color]);

    return (
        <div className={styles.ghostLayer}>
            <div
                className={styles.ghostBlock}
                ref={ghostRef}
            />
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

GhostCursor.propTypes = {
    anchor: PropTypes.string.isRequired,
    block: PropTypes.string.isRequired,
    color: PropTypes.string,
    placement: PropTypes.oneOf(['above', 'below']).isRequired
};

/* "Show me" spotlight: dims the editor and cuts a hole around the element
   matched by `selector` (a giant box-shadow makes the surrounding dim layer). */
const Spotlight = ({selector}) => {
    const [rect, setRect] = React.useState(null);
    React.useLayoutEffect(() => {
        const measure = () => {
            const el = selector && document.querySelector(selector);
            if (!el) {
                setRect(null);
                return;
            }
            const r = el.getBoundingClientRect();
            setRect({left: r.left, top: r.top, width: r.width, height: r.height});
        };
        measure();
        // Re-measure shortly after mount in case Blockly is still laying out.
        const timer = setTimeout(measure, 60);
        window.addEventListener('resize', measure);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', measure);
        };
    }, [selector]);
    if (!rect) return null;
    const pad = 8;
    return (
        <div
            className={styles.spotlightHole}
            style={{
                left: rect.left - pad,
                top: rect.top - pad,
                width: rect.width + (pad * 2),
                height: rect.height + (pad * 2)
            }}
        />
    );
};

Spotlight.propTypes = {
    selector: PropTypes.string
};

const MicroworldsWizard = props => {
    const {
        canAdvance,
        dragHint,
        isLastStep,
        onGoToStep,
        onNext,
        prompt,
        spotlight,
        stepCount,
        stepIndex
    } = props;

    const [showMe, setShowMe] = React.useState(false);

    // Hide the hint whenever the step changes or its action is completed.
    React.useEffect(() => setShowMe(false), [stepIndex]);
    React.useEffect(() => {
        if (canAdvance) setShowMe(false);
    }, [canAdvance]);

    // Dismiss the hint as soon as the user interacts (deferred a tick so the
    // press that opened it doesn't immediately close it).
    React.useEffect(() => {
        if (!showMe) return;
        const dismiss = () => setShowMe(false);
        const id = setTimeout(() => document.addEventListener('pointerdown', dismiss), 0);
        return () => {
            clearTimeout(id);
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
            <div className={styles.card}>
                <div className={styles.prompt}>{prompt}</div>

                <button
                    className={styles.showMeButton}
                    onClick={handleShowMe}
                >
                    {'Show me'}
                </button>

                <div className={styles.footer}>
                    <div className={styles.pips}>
                        {Array.from({length: stepCount}).map((_, index) => (
                            <button
                                key={index}
                                className={classNames(styles.pip, {
                                    [styles.pipActive]: index === stepIndex
                                })}
                                data-step={index}
                                onClick={handlePipClick}
                                aria-label={`Go to step ${index + 1}`}
                            />
                        ))}
                    </div>
                    <div className={styles.actions}>
                        <button
                            className={classNames(styles.nextButton, {
                                [styles.nextButtonDisabled]: !canAdvance
                            })}
                            disabled={!canAdvance}
                            onClick={onNext}
                            aria-label={isLastStep ? 'Finish' : 'Next'}
                        >
                            <NextArrow />
                        </button>
                        <button
                            className={styles.skipButton}
                            onClick={onNext}
                        >
                            {'Skip'}
                        </button>
                    </div>
                </div>
            </div>

            {showMe && dragHint ? (
                <GhostCursor
                    block={dragHint.block}
                    anchor={dragHint.anchor}
                    placement={dragHint.placement}
                    color={dragHint.color}
                />
            ) : null}
            {showMe && !dragHint && spotlight ? <Spotlight selector={spotlight} /> : null}
        </div>
    );
};

MicroworldsWizard.propTypes = {
    canAdvance: PropTypes.bool,
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
    spotlight: PropTypes.string,
    stepCount: PropTypes.number.isRequired,
    stepIndex: PropTypes.number.isRequired
};

export default MicroworldsWizard;
