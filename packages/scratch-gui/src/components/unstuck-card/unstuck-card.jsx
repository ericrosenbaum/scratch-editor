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

/* ===== HEADER ===== */
const UnstuckCardHeader = ({
    activeTip, hasResults, onClose, onShrinkExpand, onAskAnother, onBackToResults, expanded
}) => {
    let headerContent;
    if (activeTip && hasResults) {
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
        headerContent = <span>{'Need help?'}</span>;
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
    expanded: PropTypes.bool.isRequired,
    hasResults: PropTypes.bool.isRequired,
    onAskAnother: PropTypes.func.isRequired,
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
        return (
            <div className={styles.queryRow}>
                <input
                    className={styles.queryInput}
                    placeholder="Or type your question..."
                    value={this.props.query}
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
    pen: '#0fBD8C'
};

const getTagColor = tag => TAG_COLORS[tag] || '#888';

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
        const {results, tips, query, listening, voiceSupported,
            onQueryChange, onSubmit, onVoiceClick} = this.props;

        return (
            <div className={styles.searchResults}>
                <QueryInput
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
                    return (
                        <button
                            className={styles.resultCard}
                            data-tip-id={result.tipId}
                            key={result.tipId}
                            style={{animationDelay: `${index * 60}ms`}}
                            onClick={this.handleResultClick}
                        >
                            <div className={styles.resultCardText}>
                                {tip.text}
                            </div>
                            <div className={styles.resultTags}>
                                {tip.tutorialId ? (
                                    <span className={styles.tutorialBadge}>
                                        {'\u25B6 Tutorial'}
                                    </span>
                                ) : null}
                                {tip.tags && tip.tags.length > 0 ? (
                                    tip.tags.filter(tag => tag !== 'tutorial').slice(0, 4).map(tag => (
                                        <span
                                            className={styles.resultTag}
                                            key={tag}
                                            style={{backgroundColor: getTagColor(tag)}}
                                        >
                                            {tag}
                                        </span>
                                    ))
                                ) : null}
                            </div>
                        </button>
                    );
                })}
            </div>
        );
    }
}

SearchResults.propTypes = {
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
class TipDisplay extends React.Component {
    constructor (props) {
        super(props);
        this.handleFollowUp = this.handleFollowUp.bind(this);
        this.handleShowMe = this.handleShowMe.bind(this);
    }
    handleFollowUp (e) {
        this.props.onFollowUp(e.currentTarget.dataset.tipId);
    }
    handleShowMe () {
        // Cycle through pointers — use index 0 for single, or step through
        this.props.onPointerClick(0);
    }
    render () {
        const {tip, tips, onAddToProject, codeExpanded, onToggleCode} = this.props;
        const hasPointers = tip.pointers && tip.pointers.length > 0;
        const hasBlocks = !!tip.blockExample;
        const hasFollowUps = tip.followUps && tip.followUps.length > 0;

        return (
            <div>
                <div className={styles.tipText}>
                    {tip.text}
                </div>

                {hasPointers ? (
                    <button
                        className={styles.showMeButton}
                        onClick={this.handleShowMe}
                    >
                        {'Show me'}
                        <span className={styles.showMeArrow}>{'\u2192'}</span>
                    </button>
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
                                    templateName={tip.blockExample}
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
                                    {tips[followUpId].followUpLabel || followUpId}
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
    onToggleCode: PropTypes.func.isRequired,
    tip: PropTypes.shape({
        text: PropTypes.string.isRequired,
        blockExample: PropTypes.string,
        pointers: PropTypes.arrayOf(PropTypes.shape({
            label: PropTypes.string.isRequired,
            target: PropTypes.string.isRequired
        })),
        followUps: PropTypes.arrayOf(PropTypes.string)
    }).isRequired,
    // eslint-disable-next-line react/forbid-prop-types
    tips: PropTypes.object.isRequired
};

/* ===== MAIN CARD ===== */
const UnstuckCard = ({
    activeTip,
    codeExpanded,
    expanded,
    listening,
    loading,
    onAddToProject,
    onBackToResults,
    onClose,
    onDrag,
    onEndDrag,
    onFollowUp,
    onAskAnother,
    onPickClick,
    onPointerClick,
    onQueryChange,
    onSelectResult,
    onShrinkExpand,
    onStartDrag,
    onSubmit,
    onToggleCode,
    onVoiceClick,
    query,
    quickPicks,
    searchResults,
    tips,
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
                            expanded={expanded}
                            hasResults={searchResults.length > 0}
                            onAskAnother={onAskAnother}
                            onBackToResults={onBackToResults}
                            onClose={onClose}
                            onShrinkExpand={onShrinkExpand}
                        />
                        {expanded ? (
                            <div className={classNames(styles.body, 'no-drag')}>
                                {loading ? (
                                    <div className={styles.loading}>
                                        {'Finding tips'}
                                        <span className={styles.loadingDots} />
                                    </div>
                                ) : activeTip ? (
                                    <TipDisplay
                                        codeExpanded={codeExpanded}
                                        tip={activeTip}
                                        tips={tips}
                                        onAddToProject={onAddToProject}
                                        onFollowUp={onFollowUp}
                                        onPointerClick={onPointerClick}
                                        onToggleCode={onToggleCode}
                                    />
                                ) : searchResults.length > 0 ? (
                                    <SearchResults
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
                                ) : (
                                    <div className={styles.emptyState}>
                                        <div className={styles.promptText}>
                                            {'What do you need help with?'}
                                        </div>
                                        <QuickPicks
                                            picks={quickPicks}
                                            onPickClick={onPickClick}
                                        />
                                        <QueryInput
                                            listening={listening}
                                            query={query}
                                            voiceSupported={voiceSupported}
                                            onQueryChange={onQueryChange}
                                            onSubmit={onSubmit}
                                            onVoiceClick={onVoiceClick}
                                        />
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
    codeExpanded: PropTypes.bool,
    expanded: PropTypes.bool.isRequired,
    listening: PropTypes.bool,
    loading: PropTypes.bool.isRequired,
    onAddToProject: PropTypes.func.isRequired,
    onAskAnother: PropTypes.func.isRequired,
    onBackToResults: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    onDrag: PropTypes.func.isRequired,
    onEndDrag: PropTypes.func.isRequired,
    onFollowUp: PropTypes.func.isRequired,
    onPickClick: PropTypes.func.isRequired,
    onPointerClick: PropTypes.func.isRequired,
    onQueryChange: PropTypes.func.isRequired,
    onSelectResult: PropTypes.func.isRequired,
    onShrinkExpand: PropTypes.func.isRequired,
    onStartDrag: PropTypes.func.isRequired,
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
    voiceSupported: PropTypes.bool,
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired
};

export default UnstuckCard;
