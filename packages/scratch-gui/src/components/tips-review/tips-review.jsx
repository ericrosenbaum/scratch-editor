/* eslint-disable react/no-multi-comp, react/prop-types, func-style,
   jsdoc/require-returns, jsdoc/require-param, react/jsx-no-bind,
   react/jsx-handler-names, no-negated-condition, arrow-parens */
import React from 'react';
import tips, {quickPicks} from '../../lib/libraries/tips/index.js';
import blockTemplates from '../../lib/unstuck/block-templates.js';
import BlockPreview from '../unstuck-card/block-preview.jsx';
import TipEditor from './tip-editor.jsx';
import {loadMergedTips, hasOverride, deleteOverride, exportAllTips, importTips} from '../../lib/unstuck/tip-overrides.js';

const CAPTURE_STATE_KEY = 'scratch-tips-editor-capture-state';

const saveCaptureState = function (tipId) {
    sessionStorage.setItem(CAPTURE_STATE_KEY, JSON.stringify({tipId}));
};

const loadCaptureState = function () {
    try {
        const stored = sessionStorage.getItem(CAPTURE_STATE_KEY);
        if (stored) {
            sessionStorage.removeItem(CAPTURE_STATE_KEY);
            return JSON.parse(stored);
        }
    } catch (e) { /* ignore */ }
    return null;
};

import styles from './tips-review.css';

// Tag colors — loosely matching Scratch block category colors
const TAG_COLORS = {
    events: {bg: '#FFBF00', fg: '#333'},
    motion: {bg: '#4C97FF', fg: '#fff'},
    looks: {bg: '#9966FF', fg: '#fff'},
    sound: {bg: '#CF63CF', fg: '#fff'},
    control: {bg: '#FFAB19', fg: '#333'},
    sensing: {bg: '#5CB1D6', fg: '#fff'},
    operators: {bg: '#59C059', fg: '#fff'},
    variables: {bg: '#FF8C1A', fg: '#fff'},
    pen: {bg: '#0FBD8C', fg: '#fff'},
    beginner: {bg: '#e8f0fe', fg: '#1a73e8'},
    debugging: {bg: '#fce8e6', fg: '#d93025'},
    start: {bg: '#fff3cd', fg: '#856404'},
    hat: {bg: '#fff3cd', fg: '#856404'}
};

const DEFAULT_TAG_COLOR = {bg: '#f0f2f5', fg: '#333'};

/**
 * Compute validation warnings and metadata for all tips.
 */
function computeAnalysis () {
    const allTipIds = new Set(Object.keys(tips));
    const warnings = {};
    const referencedIds = new Set();
    const referencedByMap = {};
    const tagCounts = {};

    for (const tipId of allTipIds) {
        referencedByMap[tipId] = [];
    }

    for (const [tipId, tip] of Object.entries(tips)) {
        const tipWarnings = [];

        if (tip.tags) {
            for (const tag of tip.tags) {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            }
        }

        if (tip.id !== tipId) {
            tipWarnings.push(`ID mismatch: key is '${tipId}' but tip.id is '${tip.id}'`);
        }

        if (!tip.followUps || tip.followUps.length === 0) {
            tipWarnings.push('No follow-ups (dead end)');
        } else {
            for (const fid of tip.followUps) {
                referencedIds.add(fid);
                if (referencedByMap[fid]) {
                    referencedByMap[fid].push(tipId);
                }
                if (!allTipIds.has(fid)) {
                    tipWarnings.push(`Follow-up '${fid}' does not exist`);
                }
            }
        }

        if (tip.blockExample && !blockTemplates[tip.blockExample]) {
            tipWarnings.push(`Block template '${tip.blockExample}' not found`);
        }

        if (tipWarnings.length > 0) {
            warnings[tipId] = tipWarnings;
        }
    }

    for (const tipId of allTipIds) {
        if (!referencedIds.has(tipId)) {
            if (!warnings[tipId]) warnings[tipId] = [];
            warnings[tipId].push('Orphaned: no other tip references this one');
        }
    }

    const tipEntries = Object.entries(tips);
    const stats = {
        total: tipEntries.length,
        withBlocks: tipEntries.filter(([, t]) => t.blockExample).length,
        withPointers: tipEntries.filter(([, t]) => t.pointers && t.pointers.length > 0).length,
        withKeywords: tipEntries.filter(([, t]) => t.relevance && t.relevance.keywords).length,
        warningCount: Object.keys(warnings).length
    };

    return {warnings, referencedByMap, tagCounts, stats};
}

/**
 * Extract opcode chain from a block template array.
 */
function getOpcodeChain (templateBlocks) {
    if (!templateBlocks) return [];
    const byId = {};
    for (const b of templateBlocks) {
        byId[b.id] = b;
    }
    const topBlock = templateBlocks.find(b => b.topLevel && !b.shadow);
    if (!topBlock) return [];

    const chain = [];
    let current = topBlock;
    while (current) {
        if (!current.shadow) {
            chain.push(current.opcode);
        }
        current = current.next ? byId[current.next] : null;
    }
    return chain;
}

function tipMatchesFilter (tipId, tip, searchQuery, activeTag, warningsOnly, orphansOnly, warnings) {
    if (activeTag && !(tip.tags && tip.tags.includes(activeTag))) return false;
    if (warningsOnly && !warnings[tipId]) return false;
    if (orphansOnly) {
        const isOrphan = warnings[tipId] &&
            warnings[tipId].some(w => w.startsWith('Orphaned'));
        if (!isOrphan) return false;
    }

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const haystack = [
            tipId,
            tip.text,
            tip.followUpLabel,
            ...(tip.tags || []),
            ...(tip.relevance && tip.relevance.keywords ? tip.relevance.keywords : [])
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
    }

    return true;
}

/* ===== TIP CARD ===== */
class TipCard extends React.Component {
    constructor (props) {
        super(props);
        this.state = {copied: false, showBlocks: false, showJson: false, showTipJson: false};
        this.handleCopyId = this.handleCopyId.bind(this);
        this.handleShowBlocks = this.handleShowBlocks.bind(this);
        this.handleShowJson = this.handleShowJson.bind(this);
        this.handleShowTipJson = this.handleShowTipJson.bind(this);
    }
    handleCopyId () {
        const searchString = `'${this.props.tipId}': {`;
        navigator.clipboard.writeText(searchString).then(() => {
            this.setState({copied: true});
            setTimeout(() => this.setState({copied: false}), 1500);
        });
    }
    handleShowBlocks () {
        this.setState(prev => ({showBlocks: !prev.showBlocks}));
    }
    handleShowJson () {
        this.setState(prev => ({showJson: !prev.showJson}));
    }
    handleShowTipJson () {
        this.setState(prev => ({showTipJson: !prev.showTipJson}));
    }
    render () {
        const {tipId, tip, warnings, referencedBy, onTagClick} = this.props;
        const tipWarnings = warnings[tipId];
        const hasPointers = tip.pointers && tip.pointers.length > 0;
        const hasBlocks = !!tip.blockExample;
        const hasFollowUps = tip.followUps && tip.followUps.length > 0;
        const hasKeywords = tip.relevance && tip.relevance.keywords;
        const hasSignals = tip.relevance && tip.relevance.projectSignals;
        const refs = referencedBy[tipId] || [];

        const opcodeChain = hasBlocks ? getOpcodeChain(blockTemplates[tip.blockExample]) : [];

        return (
            <div
                className={styles.card}
                id={tipId}
            >
                {tipWarnings ? (
                    <div className={styles.cardWarnings}>
                        {tipWarnings.map((w, i) => (
                            <div
                                className={styles.warningItem}
                                key={i}
                            >
                                <span className={styles.warningIcon}>{'⚠'}</span>
                                {w}
                            </div>
                        ))}
                    </div>
                ) : null}

                <div>
                    <span
                        className={styles.tipId}
                        title="Click to copy search string"
                        onClick={this.handleCopyId}
                    >
                        {tipId}
                    </span>
                    {this.state.copied ? (
                        <span className={styles.copiedToast}>{'Copied!'}</span>
                    ) : null}
                    {tip.followUpLabel ? (
                        <span className={styles.followUpLabel}>
                            {tip.followUpLabel}
                        </span>
                    ) : null}
                    <button
                        className={styles.tipJsonButton}
                        onClick={this.handleShowTipJson}
                    >
                        {this.state.showTipJson ? 'Hide JSON' : 'JSON'}
                    </button>
                </div>

                {this.state.showTipJson ? (
                    <pre className={styles.jsonBlock}>
                        {JSON.stringify(tip, null, 2)}
                    </pre>
                ) : null}

                <div className={styles.tipText}>{tip.text}</div>

                {tip.tags && tip.tags.length > 0 ? (
                    <div className={styles.section}>
                        <div className={styles.sectionLabel}>{'Tags'}</div>
                        <div className={styles.tags}>
                            {tip.tags.map(tag => {
                                const colors = TAG_COLORS[tag] || DEFAULT_TAG_COLOR;
                                return (
                                    <button
                                        className={styles.tag}
                                        key={tag}
                                        style={{
                                            background: colors.bg,
                                            color: colors.fg
                                        }}
                                        onClick={() => onTagClick(tag)}
                                    >
                                        {tag}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : null}

                {hasBlocks ? (
                    <div className={styles.section}>
                        <div className={styles.sectionLabel}>{'Block Example'}</div>
                        <div className={styles.blockRow}>
                            <code className={styles.blockExample}>{tip.blockExample}</code>
                            <button
                                className={styles.renderBlocksButton}
                                onClick={this.handleShowBlocks}
                            >
                                {this.state.showBlocks ? 'Hide blocks' : 'Show blocks'}
                            </button>
                            <button
                                className={styles.renderBlocksButton}
                                onClick={this.handleShowJson}
                            >
                                {this.state.showJson ? 'Hide JSON' : 'Show JSON'}
                            </button>
                        </div>
                        {opcodeChain.length > 0 ? (
                            <div className={styles.opcodeChain}>
                                {opcodeChain.map((op, i) => (
                                    <span key={i}>
                                        {i > 0 ? (
                                            <span className={styles.opcodeArrow}>{'\u2192'}</span>
                                        ) : null}
                                        {op}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                        {this.state.showBlocks ? (
                            <div className={styles.blockPreviewWrapper}>
                                <BlockPreview templateName={tip.blockExample} />
                            </div>
                        ) : null}
                        {this.state.showJson ? (
                            <pre className={styles.jsonBlock}>
                                {JSON.stringify(blockTemplates[tip.blockExample], null, 2)}
                            </pre>
                        ) : null}
                    </div>
                ) : null}

                {hasPointers ? (
                    <div className={styles.section}>
                        <div className={styles.sectionLabel}>{'Pointers'}</div>
                        <table className={styles.pointerTable}>
                            <thead>
                                <tr>
                                    <th>{'Label'}</th>
                                    <th>{'Target'}</th>
                                    <th>{'Pre-action'}</th>
                                    <th>{'Side'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tip.pointers.map((p, i) => (
                                    <tr key={i}>
                                        <td>{p.label}</td>
                                        <td>{p.target}</td>
                                        <td>{p.preAction || '\u2014'}</td>
                                        <td>{p.side || '\u2014'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : null}

                {hasFollowUps ? (
                    <div className={styles.section}>
                        <div className={styles.sectionLabel}>{'Follow-ups'}</div>
                        <div className={styles.followUpLinks}>
                            {tip.followUps.map(fid => {
                                const exists = !!tips[fid];
                                return (
                                    <a
                                        className={`${styles.followUpLink} ${exists ? '' : styles.brokenLink}`}
                                        href={`#${fid}`}
                                        key={fid}
                                    >
                                        {exists ? (tips[fid].followUpLabel || fid) : `${fid} (missing!)`}
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                ) : null}

                {refs.length > 0 ? (
                    <div className={styles.section}>
                        <div className={styles.sectionLabel}>{`Referenced by (${refs.length})`}</div>
                        <div className={styles.followUpLinks}>
                            {refs.map(refId => (
                                <a
                                    className={styles.refLink}
                                    href={`#${refId}`}
                                    key={refId}
                                >
                                    {refId}
                                </a>
                            ))}
                        </div>
                    </div>
                ) : null}

                {hasKeywords ? (
                    <div className={styles.section}>
                        <div className={styles.sectionLabel}>{'Keywords'}</div>
                        <div className={styles.keywords}>
                            {tip.relevance.keywords.map(kw => (
                                <span
                                    className={styles.keyword}
                                    key={kw}
                                >
                                    {kw}
                                </span>
                            ))}
                        </div>
                    </div>
                ) : null}

                {hasSignals ? (
                    <div className={styles.section}>
                        <div className={styles.sectionLabel}>{'Project Signals'}</div>
                        <pre className={styles.signals}>
                            {JSON.stringify(tip.relevance.projectSignals, null, 2)}
                        </pre>
                    </div>
                ) : null}
            </div>
        );
    }
}

/* ===== MAIN COMPONENT ===== */
class TipsReview extends React.Component {
    constructor (props) {
        super(props);
        const pendingCapture = loadCaptureState();
        this.state = {
            mode: pendingCapture ? 'edit' : 'review',
            searchQuery: '',
            activeTag: null,
            warningsOnly: false,
            orphansOnly: false,
            // Edit mode state
            editSearchQuery: '',
            selectedTipId: pendingCapture ? pendingCapture.tipId : null,
            pendingCapture: !!pendingCapture,
            workingTips: loadMergedTips()
        };
        this.analysis = computeAnalysis();
        this.handleSearchChange = this.handleSearchChange.bind(this);
        this.handleTagClick = this.handleTagClick.bind(this);
        this.clearTag = this.clearTag.bind(this);
        this.handleExport = this.handleExport.bind(this);
        this.handleImport = this.handleImport.bind(this);
        this.handleTipSave = this.handleTipSave.bind(this);
        this.handleTipRevert = this.handleTipRevert.bind(this);
        this.handleTipDelete = this.handleTipDelete.bind(this);
        this.handleRequestCapture = this.handleRequestCapture.bind(this);
        this.importInputRef = React.createRef();
    }

    handleSearchChange (e) {
        this.setState({searchQuery: e.target.value});
    }

    handleTagClick (tag) {
        this.setState(prev => ({
            activeTag: prev.activeTag === tag ? null : tag
        }));
    }

    clearTag () {
        this.setState({activeTag: null});
    }

    handleExport () {
        const json = exportAllTips();
        const blob = new Blob([json], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tips-export.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    handleImport () {
        this.importInputRef.current.click();
    }

    handleImportFile (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = event => {
            try {
                importTips(event.target.result);
                this.setState({workingTips: loadMergedTips()});
            } catch (err) {
                // eslint-disable-next-line no-alert
                alert(`Import failed: ${err.message}`);
            }
        };
        reader.readAsText(file);
        // Reset so same file can be re-imported
        e.target.value = '';
    }

    handleTipSave (tipId, tipData) {
        this.setState({workingTips: loadMergedTips()});
    }

    handleTipRevert (tipId) {
        this.setState({workingTips: loadMergedTips()});
    }

    handleTipDelete (tipId) {
        deleteOverride(tipId);
        this.setState({
            selectedTipId: null,
            workingTips: loadMergedTips()
        });
    }

    handleRequestCapture () {
        const {selectedTipId} = this.state;
        saveCaptureState(selectedTipId);
        this.props.onClose();
    }

    renderReviewMode () {
        const {warnings, referencedByMap, tagCounts, stats} = this.analysis;
        const {searchQuery, activeTag, warningsOnly, orphansOnly} = this.state;

        const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

        const filteredTips = Object.entries(tips).filter(
            ([tipId, tip]) => tipMatchesFilter(
                tipId, tip, searchQuery, activeTag, warningsOnly, orphansOnly, warnings
            )
        );

        return (
            <React.Fragment>
                <div className={styles.layout}>
                    <div className={styles.sidebar}>
                        <div className={styles.sidebarTitle}>{'Tags'}</div>
                        <button
                            className={`${styles.tagListItem} ${!activeTag ? styles.tagListItemActive : ''}`}
                            onClick={this.clearTag}
                        >
                            <span>{'All'}</span>
                            <span className={styles.tagCount}>{stats.total}</span>
                        </button>
                        {sortedTags.map(([tag, count]) => (
                            <button
                                className={`${styles.tagListItem} ${activeTag === tag ? styles.tagListItemActive : ''}`}
                                key={tag}
                                onClick={() => this.handleTagClick(tag)}
                            >
                                <span>{tag}</span>
                                <span className={styles.tagCount}>{count}</span>
                            </button>
                        ))}
                    </div>

                    <div className={styles.main}>
                        <div className={styles.statsBar}>
                            <div className={styles.stat}>
                                <div className={styles.statValue}>{stats.total}</div>
                                <div className={styles.statLabel}>{'Total tips'}</div>
                            </div>
                            <div className={styles.stat}>
                                <div className={styles.statValue}>{stats.withBlocks}</div>
                                <div className={styles.statLabel}>{'With blocks'}</div>
                            </div>
                            <div className={styles.stat}>
                                <div className={styles.statValue}>{stats.withPointers}</div>
                                <div className={styles.statLabel}>{'With pointers'}</div>
                            </div>
                            <div className={styles.stat}>
                                <div className={styles.statValue}>{stats.withKeywords}</div>
                                <div className={styles.statLabel}>{'With keywords'}</div>
                            </div>
                            <div className={styles.warningsStat}>
                                <div className={styles.statValue}>{stats.warningCount}</div>
                                <div className={styles.statLabel}>{'Warnings'}</div>
                            </div>
                        </div>

                        {filteredTips.length === 0 ? (
                            <div className={styles.noResults}>{'No tips match your filters.'}</div>
                        ) : (
                            filteredTips.map(([tipId, tip]) => (
                                <TipCard
                                    key={tipId}
                                    onTagClick={this.handleTagClick}
                                    referencedBy={referencedByMap}
                                    tip={tip}
                                    tipId={tipId}
                                    warnings={warnings}
                                />
                            ))
                        )}

                        <div className={styles.quickPicksSection}>
                            <div className={styles.quickPicksTitle}>{'Quick Picks'}</div>
                            <div className={styles.quickPicksGrid}>
                                {quickPicks.map(pick => (
                                    <div
                                        className={styles.quickPickItem}
                                        key={pick.query}
                                    >
                                        <span
                                            className={styles.quickPickDot}
                                            style={{backgroundColor: pick.color}}
                                        />
                                        <span>{pick.label}</span>
                                        <span className={styles.quickPickQuery}>{pick.query}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </React.Fragment>
        );
    }

    renderEditMode () {
        const {editSearchQuery, selectedTipId, pendingCapture, workingTips} = this.state;
        const {vm} = this.props;
        const allTipIds = Object.keys(workingTips);

        const filteredIds = allTipIds.filter(id => {
            if (!editSearchQuery) return true;
            const q = editSearchQuery.toLowerCase();
            const tip = workingTips[id];
            const haystack = [
                id,
                tip.followUpLabel || '',
                tip.text || ''
            ].join(' ').toLowerCase();
            return haystack.includes(q);
        });

        const selectedTip = selectedTipId ? workingTips[selectedTipId] : null;

        return (
            <div className={styles.editLayout}>
                <div className={styles.editTipList}>
                    <div className={styles.editTipListHeader}>
                        <input
                            className={styles.editTipSearch}
                            placeholder="Filter tips..."
                            value={editSearchQuery}
                            onChange={e => this.setState({editSearchQuery: e.target.value})}
                        />
                    </div>
                    {filteredIds.map(id => {
                        const tip = workingTips[id];
                        const isModified = hasOverride(id);
                        const isActive = id === selectedTipId;
                        return (
                            <button
                                className={
                                    `${isModified ? styles.editTipItemModified : styles.editTipItem} ` +
                                    `${isActive ? styles.editTipItemActive : ''}`
                                }
                                key={id}
                                onClick={() => this.setState({selectedTipId: id})}
                            >
                                <span className={styles.editTipItemId}>{id}</span>
                                <span className={styles.editTipItemLabel}>
                                    {tip.followUpLabel || tip.text}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {selectedTip ? (
                    <TipEditor
                        allTipIds={allTipIds}
                        key={selectedTipId}
                        onCaptureConsumed={() => this.setState({pendingCapture: false})}
                        onDelete={this.handleTipDelete}
                        onRequestCapture={this.handleRequestCapture}
                        onRevert={this.handleTipRevert}
                        onSave={this.handleTipSave}
                        pendingCapture={pendingCapture}
                        tip={selectedTip}
                        tipId={selectedTipId}
                        vm={vm}
                    />
                ) : (
                    <div className={styles.editorPanel}>
                        <div className={styles.editorNoSelection}>
                            {'Select a tip from the list to edit it'}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    render () {
        const {mode, searchQuery} = this.state;
        const {stats} = this.analysis;

        return (
            <div className={styles.overlay}>
                <div className={styles.header}>
                    <div className={styles.title}>
                        {mode === 'review' ? 'Tips Review' : 'Tips Editor'}
                    </div>

                    <div className={styles.modeToggle}>
                        <button
                            className={`${styles.modeButton} ${mode === 'review' ? styles.modeButtonActive : ''}`}
                            onClick={() => this.setState({mode: 'review'})}
                        >
                            {'Review'}
                        </button>
                        <button
                            className={`${styles.modeButton} ${mode === 'edit' ? styles.modeButtonActive : ''}`}
                            onClick={() => this.setState({mode: 'edit', workingTips: loadMergedTips()})}
                        >
                            {'Edit'}
                        </button>
                    </div>

                    {mode === 'review' ? (
                        <React.Fragment>
                            <input
                                className={styles.searchInput}
                                placeholder="Search by ID, text, tag, keyword..."
                                value={searchQuery}
                                onChange={this.handleSearchChange}
                            />
                            <button
                                className={`${styles.toggleButton} ${
                                    this.state.warningsOnly ? styles.toggleButtonActive : ''
                                }`}
                                onClick={() => this.setState(prev => ({warningsOnly: !prev.warningsOnly}))}
                            >
                                {`Warnings (${stats.warningCount})`}
                            </button>
                            <button
                                className={`${styles.toggleButton} ${
                                    this.state.orphansOnly ? styles.toggleButtonActive : ''
                                }`}
                                onClick={() => this.setState(prev => ({orphansOnly: !prev.orphansOnly}))}
                            >
                                {'Orphans'}
                            </button>
                        </React.Fragment>
                    ) : (
                        <React.Fragment>
                            <button
                                className={styles.exportButton}
                                onClick={this.handleExport}
                            >
                                {'Export JSON'}
                            </button>
                            <button
                                className={styles.importButton}
                                onClick={this.handleImport}
                            >
                                {'Import JSON'}
                            </button>
                            <input
                                accept=".json"
                                ref={this.importInputRef}
                                style={{display: 'none'}}
                                type="file"
                                onChange={e => this.handleImportFile(e)}
                            />
                        </React.Fragment>
                    )}

                    <button
                        className={styles.closeButton}
                        onClick={this.props.onClose}
                    >
                        {'Close'}
                    </button>
                </div>

                {mode === 'review' ? this.renderReviewMode() : this.renderEditMode()}
            </div>
        );
    }
}

export default TipsReview;
