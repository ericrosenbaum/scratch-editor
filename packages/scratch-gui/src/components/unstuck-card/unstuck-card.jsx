/* eslint-disable react/no-multi-comp */
import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import Draggable from 'react-draggable';

import styles from './unstuck-card.css';
import BlockPreview from './block-preview.jsx';

import closeIcon from '../cards/icon--close.svg';
import shrinkIcon from '../cards/icon--shrink.svg';
import expandIcon from '../cards/icon--expand.svg';
import micIcon from './icon--mic.svg';
import tipsIcon from '../../lib/assets/icon--tips.svg';

import decks from '../../lib/libraries/decks/index.jsx';
import blockThumbnailsCache from '../../lib/libraries/tips/block-thumbnails-cache.json';

const blockThumbnails = blockThumbnailsCache.thumbnails || {};

/* ===== HEADER ===== */
const UnstuckCardHeader = ({
    activeTip, browseAll, hasResults, onClose, onShrinkExpand,
    onAskAnother, onBackToResults, onBackFromBrowseTip, expanded
}) => {
    let headerContent;
    if (activeTip && browseAll) {
        headerContent = (
            <button
                className={styles.backButton}
                onClick={onBackFromBrowseTip}
            >
                <span className={styles.backArrow}>{'\u2190'}</span>
                {' Back'}
            </button>
        );
    } else if (activeTip && hasResults) {
        headerContent = (
            <button
                className={styles.backButton}
                onClick={onBackToResults}
            >
                <span className={styles.backArrow}>{'\u2190'}</span>
                {' Back'}
            </button>
        );
    } else if (browseAll) {
        headerContent = (
            <button
                className={styles.backButton}
                onClick={onAskAnother}
            >
                <span className={styles.backArrow}>{'\u2190'}</span>
                {' New question'}
            </button>
        );
    } else if (activeTip) {
        // Navigated from contextual suggestion (no search results)
        headerContent = (
            <button
                className={styles.backButton}
                onClick={onBackToResults}
            >
                <span className={styles.backArrow}>{'\u2190'}</span>
                {' Back'}
            </button>
        );
    } else if (hasResults) {
        headerContent = (
            <button
                className={styles.backButton}
                onClick={onAskAnother}
            >
                <span className={styles.backArrow}>{'\u2190'}</span>
                {' New question'}
            </button>
        );
    } else {
        headerContent = (
            <span>
                <img
                    className={styles.tipsIcon}
                    draggable={false}
                    src={tipsIcon}
                />
                {'Tips'}
            </span>
        );
    }

    return (
        <div className={styles.header}>
            <div className={styles.headerLeft}>
                {headerContent}
            </div>
            <div className={styles.headerButtons}>
                <button
                    className={styles.headerButton}
                    onClick={onShrinkExpand}
                >
                    <img
                        draggable={false}
                        src={expanded ? shrinkIcon : expandIcon}
                    />
                </button>
                <button
                    className={styles.headerButton}
                    onClick={onClose}
                >
                    <img
                        draggable={false}
                        src={closeIcon}
                    />
                </button>
            </div>
        </div>
    );
};

UnstuckCardHeader.propTypes = {
    activeTip: PropTypes.object,
    browseAll: PropTypes.bool,
    expanded: PropTypes.bool.isRequired,
    hasResults: PropTypes.bool.isRequired,
    onAskAnother: PropTypes.func.isRequired,
    onBackFromBrowseTip: PropTypes.func.isRequired,
    onBackToResults: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    onShrinkExpand: PropTypes.func.isRequired
};

/* ===== QUERY INPUT (with mic inside) ===== */
class QueryInput extends React.Component {
    constructor (props) {
        super(props);
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }
    handleKeyDown (e) {
        if (e.key === 'Enter' && this.props.query.trim()) {
            this.props.onSubmit();
        }
    }
    render () {
        const displayValue = this.props.listening && this.props.interimTranscript ?
            this.props.interimTranscript :
            this.props.query;
        return (
            <div className={styles.queryRow}>
                <input
                    className={styles.queryInput}
                    placeholder="Or type your question..."
                    readOnly={this.props.listening}
                    value={displayValue}
                    onChange={this.props.onQueryChange}
                    onKeyDown={this.handleKeyDown}
                />
                {this.props.voiceSupported ? (
                    <button
                        className={classNames(
                            styles.micButton,
                            {[styles.micButtonActive]: this.props.listening}
                        )}
                        disabled={this.props.listening}
                        title="Ask with your voice"
                        onClick={this.props.onVoiceClick}
                    >
                        <img
                            className={styles.micIcon}
                            src={micIcon}
                        />
                    </button>
                ) : null}
            </div>
        );
    }
}

QueryInput.propTypes = {
    interimTranscript: PropTypes.string,
    listening: PropTypes.bool,
    onQueryChange: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired,
    onVoiceClick: PropTypes.func,
    query: PropTypes.string.isRequired,
    voiceSupported: PropTypes.bool
};

/* ===== QUICK PICKS (2-column grid with colored dots) ===== */
class QuickPicks extends React.Component {
    constructor (props) {
        super(props);
        this.handleClick = this.handleClick.bind(this);
    }
    handleClick (e) {
        this.props.onPickClick(e.currentTarget.dataset.query);
    }
    render () {
        return (
            <div className={styles.quickPicks}>
                {this.props.picks.map((pick, index) => (
                    <button
                        className={styles.quickPick}
                        data-query={pick.query}
                        key={pick.query}
                        style={{animationDelay: `${index * 40}ms`}}
                        onClick={this.handleClick}
                    >
                        <span
                            className={styles.quickPickDot}
                            style={{
                                backgroundColor: pick.color || '#ccc',
                                boxShadow: `0 0 0 3px ${pick.color || '#ccc'}33`
                            }}
                        />
                        {pick.label}
                    </button>
                ))}
            </div>
        );
    }
}

QuickPicks.propTypes = {
    onPickClick: PropTypes.func.isRequired,
    picks: PropTypes.arrayOf(PropTypes.shape({
        color: PropTypes.string,
        label: PropTypes.string.isRequired,
        query: PropTypes.string.isRequired
    })).isRequired
};

/* ===== CONTEXT SUGGESTIONS ===== */
class ContextSuggestions extends React.Component {
    constructor (props) {
        super(props);
        this.handleClick = this.handleClick.bind(this);
    }
    handleClick (e) {
        this.props.onSelectResult(e.currentTarget.dataset.tipId);
    }
    render () {
        const {suggestions, tips: allTips} = this.props;
        if (!suggestions || suggestions.length === 0) return null;
        const display = suggestions.slice(0, 3);
        return (
            <div className={styles.contextSuggestions}>
                <div className={styles.contextSuggestionsLabel}>
                    {'Suggested for you'}
                </div>
                {display.map((s, index) => {
                    const tip = allTips[s.tipId];
                    if (!tip) return null;
                    const label = tip.title || tip.text;
                    return (
                        <button
                            className={styles.contextSuggestion}
                            data-tip-id={s.tipId}
                            key={s.tipId}
                            style={{animationDelay: `${index * 60}ms`}}
                            onClick={this.handleClick}
                        >
                            <span
                                className={styles.quickPickDot}
                                style={{
                                    backgroundColor: getSuggestionDotColor(s.reason, tip),
                                    boxShadow: `0 0 0 3px ${getSuggestionDotColor(s.reason, tip)}33`
                                }}
                            />
                            <span className={styles.contextSuggestionText}>
                                {label}
                            </span>
                        </button>
                    );
                })}
            </div>
        );
    }
}

ContextSuggestions.propTypes = {
    onSelectResult: PropTypes.func.isRequired,
    suggestions: PropTypes.arrayOf(PropTypes.shape({
        tipId: PropTypes.string.isRequired,
        score: PropTypes.number.isRequired,
        reason: PropTypes.string.isRequired
    })).isRequired,
    tips: PropTypes.object.isRequired
};

/* ===== BROWSE FILTERS ===== */
const BROWSE_FILTERS = [
    {tag: 'tutorial', label: 'Tutorials', color: '#855CD6'},
    {tag: 'starter-project', label: 'Starters', color: '#FF6680'},
    {tag: 'beginner', label: 'Beginner', color: '#4C97FF'},
    {tag: 'motion', label: 'Motion', color: '#4C97FF'},
    {tag: 'looks', label: 'Looks', color: '#9966FF'},
    {tag: 'sound', label: 'Sound', color: '#CF63CF'},
    {tag: 'events', label: 'Events', color: '#FFBF00'},
    {tag: 'control', label: 'Control', color: '#FFAB19'},
    {tag: 'sensing', label: 'Sensing', color: '#5CB1D6'},
    {tag: 'operators', label: 'Operators', color: '#59C059'},
    {tag: 'variables', label: 'Variables', color: '#FF8C1A'},
    {tag: 'pen', label: 'Pen', color: '#0fBD8C'},
    {tag: 'game', label: 'Game', color: '#FF6680'},
    {tag: 'animation', label: 'Animation', color: '#9966FF'},
    {tag: 'debugging', label: 'Debugging', color: '#FF8C1A'}
];

/* ===== TAG COLORS ===== */
const TAG_COLORS = {
    motion: '#4C97FF',
    looks: '#9966FF',
    sound: '#CF63CF',
    events: '#FFBF00',
    control: '#FFAB19',
    sensing: '#5CB1D6',
    operators: '#59C059',
    variables: '#FF8C1A',
    pen: '#0fBD8C',
    'starter-project': '#FF6680'
};

const getTagColor = tag => TAG_COLORS[tag] || '#888';

const SUGGESTION_DOT_COLORS = {
    'empty-project': '#FFBF00',
    'no-hat-blocks': '#FFBF00',
    'costumes-tab': '#9966FF',
    'sounds-tab': '#CF63CF',
    'no-broadcast': '#FFBF00',
    'no-variables': '#FF8C1A'
};

const getSuggestionDotColor = function (reason, tip) {
    if (SUGGESTION_DOT_COLORS[reason]) return SUGGESTION_DOT_COLORS[reason];
    if (tip && tip.tags && tip.tags.length > 0) {
        return TAG_COLORS[tip.tags[0]] || '#4C97FF';
    }
    return '#4C97FF';
};

/* ===== SEARCH RESULTS ===== */
class SearchResults extends React.Component {
    constructor (props) {
        super(props);
        this.handleResultClick = this.handleResultClick.bind(this);
    }
    handleResultClick (e) {
        this.props.onSelectResult(e.currentTarget.dataset.tipId);
    }
    render () {
        const {results, tips, query, listening, interimTranscript, voiceSupported,
            onQueryChange, onSubmit, onVoiceClick} = this.props;

        return (
            <div className={styles.searchResults}>
                <QueryInput
                    interimTranscript={interimTranscript}
                    listening={listening}
                    query={query}
                    voiceSupported={voiceSupported}
                    onQueryChange={onQueryChange}
                    onSubmit={onSubmit}
                    onVoiceClick={onVoiceClick}
                />
                <div className={styles.resultsLabel}>
                    {`${results.length} result${results.length !== 1 ? 's' : ''}`}
                </div>
                {results.map((result, index) => {
                    const tip = tips[result.tipId];
                    if (!tip) return null;
                    const tutorialThumb = tip.tutorialId && decks[tip.tutorialId] ?
                        decks[tip.tutorialId].img : null;
                    const blockThumb = blockThumbnails[result.tipId] || null;
                    const thumbSrc = tip.thumbnail || tutorialThumb || blockThumb;
                    return (
                        <button
                            className={styles.resultCard}
                            data-tip-id={result.tipId}
                            key={result.tipId}
                            style={{animationDelay: `${index * 60}ms`}}
                            onClick={this.handleResultClick}
                        >
                            {thumbSrc ? (
                                <div className={styles.resultCardRow}>
                                    <img
                                        className={styles.resultThumb}
                                        draggable={false}
                                        src={thumbSrc}
                                    />
                                    <div className={styles.resultCardBody}>
                                        {tip.title ? (
                                            <div className={styles.resultCardTitle}>
                                                {tip.title}
                                            </div>
                                        ) : null}
                                        <div className={styles.resultCardText}>
                                            {tip.text}
                                        </div>
                                        <div className={styles.resultTags}>
                                            {tip.thumbnail ? (
                                                <span className={styles.starterBadge}>
                                                    {'Starter project'}
                                                </span>
                                            ) : null}
                                            {tip.tutorialId ? (
                                                <span className={styles.tutorialBadge}>
                                                    {'\u25B6 Tutorial'}
                                                </span>
                                            ) : null}
                                            {tip.pointers && tip.pointers.length > 0 ? (
                                                <span className={styles.showMeBadge}>
                                                    {'Show me'}
                                                </span>
                                            ) : null}
                                            {tip._capturedBlocks && tip._capturedBlocks.length > 0 ? (
                                                <span className={styles.tryCodeBadge}>
                                                    {'Try this code'}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className={styles.resultCardBody}>
                                    {tip.title ? (
                                        <div className={styles.resultCardTitle}>
                                            {tip.title}
                                        </div>
                                    ) : null}
                                    <div className={styles.resultCardText}>
                                        {tip.text}
                                    </div>
                                    <div className={styles.resultTags}>
                                        {tip.thumbnail ? (
                                            <span className={styles.starterBadge}>
                                                {'Starter project'}
                                            </span>
                                        ) : null}
                                        {tip.tutorialId ? (
                                            <span className={styles.tutorialBadge}>
                                                {'\u25B6 Tutorial'}
                                            </span>
                                        ) : null}
                                        {tip.pointers && tip.pointers.length > 0 ? (
                                            <span className={styles.showMeBadge}>
                                                {'Show me'}
                                            </span>
                                        ) : null}
                                        {tip._capturedBlocks && tip._capturedBlocks.length > 0 ? (
                                            <span className={styles.tryCodeBadge}>
                                                {'Try this code'}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        );
    }
}

/* ===== BROWSE ALL TIPS ===== */
const tipMatchesFilter = (tip, filterTag) => {
    if (filterTag === 'tutorial') return !!tip.tutorialId;
    return tip.tags && tip.tags.includes(filterTag);
};

const tipDisplayLabel = tip => tip.title || tip.text;
const sortByLabel = (a, b) => tipDisplayLabel(a).localeCompare(tipDisplayLabel(b));

const getTipDotColor = tip => {
    if (tip.tutorialId) return '#855CD6';
    if (tip.tags && tip.tags.includes('starter-project')) return '#FF6680';
    const categoryTags = ['motion', 'looks', 'sound', 'events', 'control', 'sensing', 'operators', 'variables', 'pen'];
    for (const tag of categoryTags) {
        if (tip.tags && tip.tags.includes(tag)) return TAG_COLORS[tag] || '#888';
    }
    return '#888';
};

class BrowseAllTips extends React.Component {
    constructor (props) {
        super(props);
        this.handleTipClick = this.handleTipClick.bind(this);
        this.handleFilterClick = this.handleFilterClick.bind(this);
    }
    handleTipClick (e) {
        this.props.onSelectTip(e.currentTarget.dataset.tipId);
    }
    handleFilterClick (e) {
        const tag = e.currentTarget.dataset.tag;
        this.props.onFilterChange(tag === this.props.activeFilter ? null : tag);
    }
    render () {
        const {tips, activeFilter} = this.props;
        const allTips = Object.values(tips);

        let sections;
        if (activeFilter) {
            const filtered = allTips
                .filter(tip => tipMatchesFilter(tip, activeFilter))
                .sort(sortByLabel);
            const filterDef = BROWSE_FILTERS.find(f => f.tag === activeFilter);
            sections = [{label: filterDef ? filterDef.label : activeFilter, tips: filtered}];
        } else {
            const tutorials = allTips.filter(t => t.tutorialId).sort(sortByLabel);
            const starters = allTips
                .filter(t => !t.tutorialId && t.tags && t.tags.includes('starter-project'))
                .sort(sortByLabel);
            const regular = allTips
                .filter(t => !t.tutorialId && !(t.tags && t.tags.includes('starter-project')))
                .sort(sortByLabel);
            sections = [
                {label: 'Tutorials', tips: tutorials},
                {label: 'Starter Projects', tips: starters},
                {label: 'Tips', tips: regular}
            ].filter(s => s.tips.length > 0);
        }

        return (
            <div className={styles.browseAll}>
                <div className={styles.filterBar}>
                    {BROWSE_FILTERS.map(f => (
                        <button
                            className={classNames(
                                styles.filterPill,
                                {[styles.filterPillActive]: activeFilter === f.tag}
                            )}
                            data-tag={f.tag}
                            key={f.tag}
                            style={activeFilter === f.tag ?
                                {background: f.color, borderColor: f.color} :
                                {}
                            }
                            onClick={this.handleFilterClick}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <div className={styles.tipList}>
                    {sections.map(section => (
                        <React.Fragment key={section.label}>
                            <div className={styles.sectionLabel}>
                                {`${section.label} (${section.tips.length})`}
                            </div>
                            {section.tips.map(tip => (
                                <button
                                    className={styles.compactTip}
                                    data-tip-id={tip.id}
                                    key={tip.id}
                                    onClick={this.handleTipClick}
                                >
                                    <span
                                        className={styles.typeDot}
                                        style={{backgroundColor: getTipDotColor(tip)}}
                                    />
                                    <span className={styles.compactTipText}>
                                        {tipDisplayLabel(tip)}
                                    </span>
                                </button>
                            ))}
                        </React.Fragment>
                    ))}
                </div>
            </div>
        );
    }
}

BrowseAllTips.propTypes = {
    activeFilter: PropTypes.string,
    onFilterChange: PropTypes.func.isRequired,
    onSelectTip: PropTypes.func.isRequired,
    // eslint-disable-next-line react/forbid-prop-types
    tips: PropTypes.object.isRequired
};

SearchResults.propTypes = {
    interimTranscript: PropTypes.string,
    listening: PropTypes.bool,
    onQueryChange: PropTypes.func.isRequired,
    onSelectResult: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired,
    onVoiceClick: PropTypes.func,
    query: PropTypes.string.isRequired,
    results: PropTypes.arrayOf(PropTypes.shape({
        tipId: PropTypes.string.isRequired,
        score: PropTypes.number.isRequired
    })).isRequired,
    // eslint-disable-next-line react/forbid-prop-types
    tips: PropTypes.object.isRequired,
    voiceSupported: PropTypes.bool
};

/* ===== TIP DISPLAY ===== */
const speechSynthesisSupported = typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance !== 'undefined';

// Used as onMouseDown on buttons that should be clickable but must not
// pull focus away from the editor (Blockly and the runtime listen for
// keyboard input on the workspace).
const preventFocus = e => e.preventDefault();

class TipDisplay extends React.Component {
    constructor (props) {
        super(props);
        this.state = {isSpeaking: false};
        this.handleFollowUp = this.handleFollowUp.bind(this);
        this.handleShowMe = this.handleShowMe.bind(this);
        this.handleStarterLink = this.handleStarterLink.bind(this);
        this.handleToggleSpeak = this.handleToggleSpeak.bind(this);
    }
    componentDidUpdate (prevProps) {
        // Cancel speech when switching tips so the previous tip's voice
        // doesn't continue over the new tip's view.
        if (prevProps.tip && this.props.tip && prevProps.tip.id !== this.props.tip.id) {
            this.stopSpeaking();
        }
    }
    componentWillUnmount () {
        this.stopSpeaking();
    }
    stopSpeaking () {
        if (!speechSynthesisSupported) return;
        window.speechSynthesis.cancel();
        if (this.state.isSpeaking) this.setState({isSpeaking: false});
    }
    handleToggleSpeak (e) {
        // Belt-and-suspenders: even with onMouseDown preventDefault, a keyboard
        // activation will focus the button. Drop focus so subsequent key events
        // go to the editor.
        if (e && e.currentTarget && e.currentTarget.blur) e.currentTarget.blur();
        if (!speechSynthesisSupported) return;
        if (this.state.isSpeaking) {
            this.stopSpeaking();
            return;
        }
        const text = this.props.tip && this.props.tip.text;
        if (!text) return;
        // cancel anything still in the queue from a previous tip
        window.speechSynthesis.cancel();
        const utter = new window.SpeechSynthesisUtterance(text);
        utter.onend = () => this.setState({isSpeaking: false});
        utter.onerror = () => this.setState({isSpeaking: false});
        window.speechSynthesis.speak(utter);
        this.setState({isSpeaking: true});
    }
    handleFollowUp (e) {
        this.props.onFollowUp(e.currentTarget.dataset.tipId);
    }
    handleStarterLink () {
        if (this.props.onStarterLinkClick) {
            this.props.onStarterLinkClick(this.props.tip.id, this.props.tip.projectUrl);
        }
    }
    handleShowMe (e) {
        const index = Number(e.currentTarget.dataset.pointerIndex) || 0;
        this.props.onPointerClick(index);
    }
    render () {
        const {tip, tips, onAddToProject, codeExpanded, onToggleCode, vm} = this.props;
        const pointers = tip.pointers || [];
        const hasPointers = pointers.length > 0;
        const multiplePointers = pointers.length > 1;
        const hasBlocks = !!(tip._capturedBlocks && tip._capturedBlocks.length > 0);
        const hasFollowUps = tip.followUps && tip.followUps.length > 0;

        return (
            <div>
                {tip.title ? (
                    <div className={styles.tipTitle}>
                        {tip.title}
                    </div>
                ) : null}
                <div className={styles.tipTextRow}>
                    <div className={styles.tipText}>
                        {tip.text}
                    </div>
                    {speechSynthesisSupported && tip.text ? (
                        <button
                            aria-label={this.state.isSpeaking ? 'Stop reading' : 'Read aloud'}
                            className={classNames(
                                styles.speakButton,
                                {[styles.speakButtonActive]: this.state.isSpeaking}
                            )}
                            title={this.state.isSpeaking ? 'Stop' : 'Read aloud'}
                            // Don't take focus on click — keyboard inputs need
                            // to keep going to the editor / Blockly workspace.
                            onMouseDown={preventFocus}
                            onClick={this.handleToggleSpeak}
                        >
                            {this.state.isSpeaking ? (
                                <svg
                                    height="20"
                                    viewBox="0 0 14 14"
                                    width="20"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <rect
                                        fill="currentColor"
                                        height="8"
                                        rx="1"
                                        width="8"
                                        x="3"
                                        y="3"
                                    />
                                </svg>
                            ) : (
                                <svg
                                    height="20"
                                    viewBox="0 0 14 14"
                                    width="20"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        d="M3 5.5h2L7.5 3v8L5 8.5H3z"
                                        fill="currentColor"
                                    />
                                    <path
                                        d="M9 5.2c0.6 0.5 0.9 1.1 0.9 1.8s-0.3 1.3-0.9 1.8M10.5 3.7c1.1 0.8 1.7 2 1.7 3.3s-0.6 2.5-1.7 3.3"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeLinecap="round"
                                        strokeWidth="1.2"
                                    />
                                </svg>
                            )}
                        </button>
                    ) : null}
                </div>

                {tip.thumbnail ? (
                    <div className={styles.starterProject}>
                        <a
                            className={styles.thumbnailLink}
                            href={tip.projectUrl}
                            rel="noopener noreferrer"
                            target="_blank"
                            onClick={this.handleStarterLink}
                        >
                            <img
                                className={styles.thumbnail}
                                draggable={false}
                                src={tip.thumbnail}
                            />
                        </a>
                        <a
                            className={styles.openProjectButton}
                            href={tip.projectUrl}
                            rel="noopener noreferrer"
                            target="_blank"
                            onClick={this.handleStarterLink}
                        >
                            {'Open project'}
                            <span className={styles.openProjectArrow}>{'\u2197'}</span>
                        </a>
                    </div>
                ) : null}

                {hasPointers ? (
                    multiplePointers ? (
                        <div className={styles.showMeButtonGroup}>
                            {pointers.map((pointer, i) => (
                                <button
                                    className={styles.showMeButton}
                                    data-pointer-index={i}
                                    key={i}
                                    onClick={this.handleShowMe}
                                >
                                    {pointer.label}
                                    <span className={styles.showMeArrow}>{'\u2192'}</span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <button
                            className={styles.showMeButton}
                            data-pointer-index={0}
                            onClick={this.handleShowMe}
                        >
                            {'Show me'}
                            <span className={styles.showMeArrow}>{'\u2192'}</span>
                        </button>
                    )
                ) : null}

                {hasBlocks ? (
                    <div className={styles.codeSection}>
                        <button
                            className={styles.codeSectionHeader}
                            onClick={onToggleCode}
                        >
                            <span>{'Try this code'}</span>
                            <span
                                className={classNames(
                                    styles.codeSectionCaret,
                                    {[styles.codeSectionCaretOpen]: codeExpanded}
                                )}
                            >
                                {'\u25BC'}
                            </span>
                        </button>
                        <div
                            className={classNames(
                                styles.codeSectionBody,
                                codeExpanded ?
                                    styles.codeSectionBodyExpanded :
                                    styles.codeSectionBodyCollapsed
                            )}
                        >
                            <div className={styles.codeSectionInner}>
                                <BlockPreview
                                    blocks={tip._capturedBlocks}
                                    vm={vm}
                                />
                                <button
                                    className={styles.addToProjectButton}
                                    onClick={onAddToProject}
                                >
                                    {'Add to my project'}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}

                {hasFollowUps ? (
                    <div className={styles.followUps}>
                        {tip.followUps
                            .filter(id => tips[id])
                            .slice(0, 3)
                            .map(followUpId => (
                                <button
                                    className={styles.followUp}
                                    data-tip-id={followUpId}
                                    key={followUpId}
                                    onClick={this.handleFollowUp}
                                >
                                    {tips[followUpId].title || followUpId}
                                </button>
                            ))
                        }
                    </div>
                ) : null}
            </div>
        );
    }
}

TipDisplay.propTypes = {
    codeExpanded: PropTypes.bool.isRequired,
    onAddToProject: PropTypes.func.isRequired,
    onFollowUp: PropTypes.func.isRequired,
    onPointerClick: PropTypes.func.isRequired,
    onStarterLinkClick: PropTypes.func,
    onToggleCode: PropTypes.func.isRequired,
    tip: PropTypes.shape({
        id: PropTypes.string,
        text: PropTypes.string.isRequired,
        // eslint-disable-next-line react/forbid-prop-types
        _capturedBlocks: PropTypes.array,
        thumbnail: PropTypes.string,
        projectUrl: PropTypes.string,
        pointers: PropTypes.arrayOf(PropTypes.shape({
            label: PropTypes.string.isRequired,
            target: PropTypes.string.isRequired
        })),
        followUps: PropTypes.arrayOf(PropTypes.string)
    }).isRequired,
    // eslint-disable-next-line react/forbid-prop-types
    tips: PropTypes.object.isRequired,
    // eslint-disable-next-line react/forbid-prop-types
    vm: PropTypes.object
};

/* ===== MAIN CARD ===== */
const UnstuckCard = ({
    activeTip,
    browseAll,
    browseFilter,
    codeExpanded,
    expanded,
    interimTranscript,
    listening,
    loading,
    modelReady,
    modelError,
    modelProgress,
    onAddToProject,
    onBackFromBrowseTip,
    onBackToResults,
    onBrowseAll,
    onBrowseFilter,
    onClose,
    onDrag,
    onEndDrag,
    onFollowUp,
    onAskAnother,
    onPickClick,
    onPointerClick,
    onRandomTip,
    onQueryChange,
    onSelectBrowseTip,
    onSelectResult,
    onShrinkExpand,
    onStartDrag,
    onStarterLinkClick,
    onSubmit,
    onToggleCode,
    onVoiceClick,
    query,
    quickPicks,
    searchResults,
    tips,
    vm,
    voiceSupported,
    x,
    y
}) => {
    const cardHorizontalDragOffset = 300;
    const cardVerticalDragOffset = expanded ? 200 : 0;
    const menuBarHeight = 48;

    if (x === 0 && y === 0) {
        // Default position: bottom-right, near sprite pane
        x = window.innerWidth - 380;
        y = window.innerHeight - menuBarHeight - 420;
        if (y < 8) y = 8;
    }

    return (
        <div
            className={styles.unstuckOverlay}
            style={{
                width: `${window.innerWidth + (2 * cardHorizontalDragOffset)}px`,
                height: `${window.innerHeight - menuBarHeight + cardVerticalDragOffset}px`,
                top: `${menuBarHeight}px`,
                left: `${-cardHorizontalDragOffset}px`
            }}
        >
            <Draggable
                bounds="parent"
                cancel=".no-drag"
                position={{x, y}}
                onDrag={onDrag}
                onStart={onStartDrag}
                onStop={onEndDrag}
            >
                <div className={styles.unstuckContainer}>
                    <div className={styles.card}>
                        <UnstuckCardHeader
                            activeTip={activeTip}
                            browseAll={browseAll}
                            expanded={expanded}
                            hasResults={searchResults.length > 0}
                            onAskAnother={onAskAnother}
                            onBackFromBrowseTip={onBackFromBrowseTip}
                            onBackToResults={onBackToResults}
                            onClose={onClose}
                            onShrinkExpand={onShrinkExpand}
                        />
                        {expanded ? (
                            <div className={classNames(styles.body, 'no-drag')}>
                                {modelError ? (
                                    <div className={styles.loading}>
                                        {'Couldn’t load tip search. Check your connection and refresh.'}
                                    </div>
                                ) : loading ? (
                                    modelReady ? (
                                        <div className={styles.loading}>
                                            {'Finding tips'}
                                            <span className={styles.loadingDots} />
                                        </div>
                                    ) : (
                                        <div className={styles.loadingProgress}>
                                            <div className={styles.setupNoticeRow}>
                                                <span>{'Setting up tip search'}</span>
                                                <span>{`${modelProgress || 0}%`}</span>
                                            </div>
                                            <div className={styles.progressTrack}>
                                                <div
                                                    className={styles.progressFill}
                                                    style={{width: `${modelProgress || 0}%`}}
                                                />
                                            </div>
                                        </div>
                                    )
                                ) : activeTip ? (
                                    <TipDisplay
                                        codeExpanded={codeExpanded}
                                        tip={activeTip}
                                        tips={tips}
                                        vm={vm}
                                        onAddToProject={onAddToProject}
                                        onFollowUp={onFollowUp}
                                        onPointerClick={onPointerClick}
                                        onStarterLinkClick={onStarterLinkClick}
                                        onToggleCode={onToggleCode}
                                    />
                                ) : searchResults.length > 0 ? (
                                    <SearchResults
                                        interimTranscript={interimTranscript}
                                        listening={listening}
                                        query={query}
                                        results={searchResults}
                                        tips={tips}
                                        voiceSupported={voiceSupported}
                                        onQueryChange={onQueryChange}
                                        onSelectResult={onSelectResult}
                                        onSubmit={onSubmit}
                                        onVoiceClick={onVoiceClick}
                                    />
                                ) : browseAll ? (
                                    <BrowseAllTips
                                        activeFilter={browseFilter}
                                        tips={tips}
                                        onFilterChange={onBrowseFilter}
                                        onSelectTip={onSelectBrowseTip}
                                    />
                                ) : (
                                    <div className={styles.emptyState}>
                                        <div className={styles.promptText}>
                                            {'What do you need help with?'}
                                        </div>
                                        <button
                                            className={styles.randomTipButton}
                                            onClick={onRandomTip}
                                        >
                                            <span className={styles.randomTipIcon}>{'🎲'}</span>
                                            {'Surprise me!'}
                                        </button>
                                        <QuickPicks
                                            picks={quickPicks}
                                            onPickClick={onPickClick}
                                        />
                                        <QueryInput
                                            interimTranscript={interimTranscript}
                                            listening={listening}
                                            query={query}
                                            voiceSupported={voiceSupported}
                                            onQueryChange={onQueryChange}
                                            onSubmit={onSubmit}
                                            onVoiceClick={onVoiceClick}
                                        />
                                        {modelReady ? null : (
                                            <div className={styles.setupNotice}>
                                                <div className={styles.setupNoticeRow}>
                                                    <span>{'Setting up tip search'}</span>
                                                    <span>{`${modelProgress || 0}%`}</span>
                                                </div>
                                                <div className={styles.progressTrack}>
                                                    <div
                                                        className={styles.progressFill}
                                                        style={{width: `${modelProgress || 0}%`}}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        <button
                                            className={styles.browseAllLink}
                                            onClick={onBrowseAll}
                                        >
                                            {'Browse all tips'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>
                </div>
            </Draggable>
        </div>
    );
};

UnstuckCard.propTypes = {
    activeTip: PropTypes.object,
    browseAll: PropTypes.bool,
    browseFilter: PropTypes.string,
    codeExpanded: PropTypes.bool,
    expanded: PropTypes.bool.isRequired,
    interimTranscript: PropTypes.string,
    listening: PropTypes.bool,
    loading: PropTypes.bool.isRequired,
    modelError: PropTypes.bool,
    modelProgress: PropTypes.number,
    modelReady: PropTypes.bool,
    onAddToProject: PropTypes.func.isRequired,
    onAskAnother: PropTypes.func.isRequired,
    onBackFromBrowseTip: PropTypes.func.isRequired,
    onBackToResults: PropTypes.func.isRequired,
    onBrowseAll: PropTypes.func.isRequired,
    onBrowseFilter: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    onDrag: PropTypes.func.isRequired,
    onEndDrag: PropTypes.func.isRequired,
    onFollowUp: PropTypes.func.isRequired,
    onPickClick: PropTypes.func.isRequired,
    onPointerClick: PropTypes.func.isRequired,
    onRandomTip: PropTypes.func.isRequired,
    onQueryChange: PropTypes.func.isRequired,
    onSelectBrowseTip: PropTypes.func.isRequired,
    onSelectResult: PropTypes.func.isRequired,
    onShrinkExpand: PropTypes.func.isRequired,
    onStartDrag: PropTypes.func.isRequired,
    onStarterLinkClick: PropTypes.func,
    onSubmit: PropTypes.func.isRequired,
    onToggleCode: PropTypes.func,
    onVoiceClick: PropTypes.func,
    query: PropTypes.string.isRequired,
    quickPicks: PropTypes.array.isRequired,
    searchResults: PropTypes.arrayOf(PropTypes.shape({
        tipId: PropTypes.string.isRequired,
        score: PropTypes.number.isRequired
    })).isRequired,
    tips: PropTypes.object.isRequired,
    // eslint-disable-next-line react/forbid-prop-types
    vm: PropTypes.object,
    voiceSupported: PropTypes.bool,
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired
};

export {TipDisplay};
export default UnstuckCard;
