/* eslint-disable react/no-multi-comp */
import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import Draggable from 'react-draggable';

import styles from './unstuck-card.css';

import closeIcon from '../cards/icon--close.svg';
import shrinkIcon from '../cards/icon--shrink.svg';
import expandIcon from '../cards/icon--expand.svg';

const UnstuckCardHeader = ({onClose, onShrinkExpand, expanded}) => (
    <div className={expanded ? styles.headerButtons : classNames(styles.headerButtons, styles.headerButtonsHidden)}>
        <div className={styles.headerTitle}>
            {'Get Unstuck'}
        </div>
        <div className={styles.headerButtonsRight}>
            <div
                className={styles.shrinkExpandButton}
                onClick={onShrinkExpand}
            >
                <img
                    draggable={false}
                    src={expanded ? shrinkIcon : expandIcon}
                />
            </div>
            <div
                className={styles.removeButton}
                onClick={onClose}
            >
                <img
                    className={styles.closeIcon}
                    draggable={false}
                    src={closeIcon}
                />
            </div>
        </div>
    </div>
);

UnstuckCardHeader.propTypes = {
    expanded: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onShrinkExpand: PropTypes.func.isRequired
};

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
                    autoFocus
                    className={styles.queryInput}
                    placeholder="What do you need help with?"
                    value={this.props.query}
                    onChange={this.props.onQueryChange}
                    onKeyDown={this.handleKeyDown}
                />
                <button
                    className={styles.submitButton}
                    disabled={!this.props.query.trim()}
                    onClick={this.props.onSubmit}
                >
                    {'Ask'}
                </button>
            </div>
        );
    }
}

QueryInput.propTypes = {
    onQueryChange: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired,
    query: PropTypes.string.isRequired
};

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
                {this.props.picks.map(pick => (
                    <button
                        className={styles.quickPick}
                        data-query={pick.query}
                        key={pick.query}
                        onClick={this.handleClick}
                    >
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
        label: PropTypes.string.isRequired,
        query: PropTypes.string.isRequired
    })).isRequired
};

class TipDisplay extends React.Component {
    constructor (props) {
        super(props);
        this.handleFollowUp = this.handleFollowUp.bind(this);
    }
    handleFollowUp (e) {
        this.props.onFollowUp(e.currentTarget.dataset.tipId);
    }
    render () {
        const {tip, tips, onAskAnother} = this.props;
        return (
            <div>
                <div className={styles.tipText}>
                    {tip.text}
                </div>
                {tip.followUps && tip.followUps.length > 0 ? (
                    <div className={styles.followUps}>
                        <div className={styles.followUpLabel}>{'Related tips'}</div>
                        {tip.followUps
                            .filter(id => tips[id])
                            .map(followUpId => {
                                const followUpText = tips[followUpId].text;
                                const label = followUpText.length > 50 ?
                                    `${followUpText.substring(0, 47)}...` :
                                    followUpText;
                                return (
                                    <button
                                        className={styles.followUp}
                                        data-tip-id={followUpId}
                                        key={followUpId}
                                        onClick={this.handleFollowUp}
                                    >
                                        {label}
                                    </button>
                                );
                            })
                        }
                    </div>
                ) : null}
                <button
                    className={styles.askAnother}
                    onClick={onAskAnother}
                >
                    {'Ask another question'}
                </button>
            </div>
        );
    }
}

TipDisplay.propTypes = {
    onAskAnother: PropTypes.func.isRequired,
    onFollowUp: PropTypes.func.isRequired,
    tip: PropTypes.shape({
        text: PropTypes.string.isRequired,
        followUps: PropTypes.arrayOf(PropTypes.string)
    }).isRequired,
    // eslint-disable-next-line react/forbid-prop-types
    tips: PropTypes.object.isRequired
};

const UnstuckCard = ({
    activeTip,
    expanded,
    loading,
    onClose,
    onDrag,
    onEndDrag,
    onFollowUp,
    onAskAnother,
    onPickClick,
    onQueryChange,
    onShrinkExpand,
    onStartDrag,
    onSubmit,
    query,
    quickPicks,
    tips,
    x,
    y
}) => {
    const cardHorizontalDragOffset = 300;
    const cardVerticalDragOffset = expanded ? 200 : 0;
    const menuBarHeight = 48;

    if (x === 0 && y === 0) {
        // Default position: right side, near the top
        x = window.innerWidth - 440;
        y = 8;
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
                            expanded={expanded}
                            onClose={onClose}
                            onShrinkExpand={onShrinkExpand}
                        />
                        {expanded ? (
                            <div className={classNames(styles.body, 'no-drag')}>
                                {loading ? (
                                    <div className={styles.loading}>{'Finding a tip...'}</div>
                                ) : activeTip ? (
                                    <TipDisplay
                                        tip={activeTip}
                                        tips={tips}
                                        onAskAnother={onAskAnother}
                                        onFollowUp={onFollowUp}
                                    />
                                ) : (
                                    <div className={styles.emptyState}>
                                        <div className={styles.promptText}>
                                            {'What are you trying to do?'}
                                        </div>
                                        <div className={styles.promptSubtext}>
                                            {'Ask a question or pick one below'}
                                        </div>
                                        <QueryInput
                                            query={query}
                                            onQueryChange={onQueryChange}
                                            onSubmit={onSubmit}
                                        />
                                        <QuickPicks
                                            picks={quickPicks}
                                            onPickClick={onPickClick}
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
    expanded: PropTypes.bool.isRequired,
    loading: PropTypes.bool.isRequired,
    onAskAnother: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    onDrag: PropTypes.func.isRequired,
    onEndDrag: PropTypes.func.isRequired,
    onFollowUp: PropTypes.func.isRequired,
    onPickClick: PropTypes.func.isRequired,
    onQueryChange: PropTypes.func.isRequired,
    onShrinkExpand: PropTypes.func.isRequired,
    onStartDrag: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired,
    query: PropTypes.string.isRequired,
    quickPicks: PropTypes.array.isRequired,
    tips: PropTypes.object.isRequired,
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired
};

export default UnstuckCard;
