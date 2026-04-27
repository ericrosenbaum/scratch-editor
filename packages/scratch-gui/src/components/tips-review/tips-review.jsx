/* eslint-disable react/no-multi-comp, react/prop-types, func-style,
   jsdoc/require-returns, jsdoc/require-param, react/jsx-no-bind,
   react/jsx-handler-names, no-negated-condition, arrow-parens */
import React from 'react';
import {quickPicks} from '../../lib/libraries/tips/index.js';
import blockTemplates from '../../lib/unstuck/block-templates.js';
import TipEditor from './tip-editor.jsx';
import {
    loadMergedTips, hasOverride, deleteOverride,
    exportTipsJson, exportBlockTemplatesJson, importTips,
    persistToSource, clearAllOverrides, getCustomBlockTemplates,
    getReviewedSet, setReviewed
} from '../../lib/unstuck/tip-overrides.js';

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
function computeAnalysis (workingTips) {
    const allTipIds = new Set(Object.keys(workingTips));
    const warnings = {};
    const referencedIds = new Set();
    const referencedByMap = {};
    const tagCounts = {};

    for (const tipId of allTipIds) {
        referencedByMap[tipId] = [];
    }

    for (const [tipId, tip] of Object.entries(workingTips)) {
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

    const orphanIds = new Set();
    for (const tipId of allTipIds) {
        if (!referencedIds.has(tipId)) {
            orphanIds.add(tipId);
            if (!warnings[tipId]) warnings[tipId] = [];
            warnings[tipId].push('Orphaned: no other tip references this one');
        }
    }

    const tipEntries = Object.entries(workingTips);
    const stats = {
        total: tipEntries.length,
        withBlocks: tipEntries.filter(([, t]) => t.blockExample).length,
        withPointers: tipEntries.filter(([, t]) => t.pointers && t.pointers.length > 0).length,
        warningCount: Object.keys(warnings).length,
        orphanCount: orphanIds.size
    };

    return {warnings, referencedByMap, tagCounts, stats, orphanIds};
}

/* ===== MAIN COMPONENT ===== */
class TipsReview extends React.Component {
    constructor (props) {
        super(props);
        const pendingCapture = loadCaptureState();
        const workingTips = loadMergedTips();
        this.state = {
            editSearchQuery: '',
            selectedTipId: pendingCapture ? pendingCapture.tipId : null,
            pendingCapture: !!pendingCapture,
            workingTips,
            saveToSourceStatus: null, // null | 'saving' | 'saved' | 'error'
            activeTag: null,
            warningsOnly: false,
            orphansOnly: false,
            reviewedFilter: null, // null | 'reviewed' | 'unreviewed'
            reviewedSet: getReviewedSet()
        };
        this.analysis = computeAnalysis(workingTips);
        this.handleExportTips = this.handleExportTips.bind(this);
        this.handleExportBlocks = this.handleExportBlocks.bind(this);
        this.handleImport = this.handleImport.bind(this);
        this.handleTipSave = this.handleTipSave.bind(this);
        this.handleTipRevert = this.handleTipRevert.bind(this);
        this.handleTipDelete = this.handleTipDelete.bind(this);
        this.handleRequestCapture = this.handleRequestCapture.bind(this);
        this.handleSaveToSource = this.handleSaveToSource.bind(this);
        this.handleTagClick = this.handleTagClick.bind(this);
        this.importInputRef = React.createRef();
        this.tipEditorRef = React.createRef();
    }

    handleTagClick (tag) {
        this.setState(prev => ({
            activeTag: prev.activeTag === tag ? null : tag
        }));
    }

    handleExportTips () {
        const json = exportTipsJson(quickPicks);
        const blob = new Blob([json], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tips.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    handleExportBlocks () {
        const json = exportBlockTemplatesJson(blockTemplates);
        const blob = new Blob([json], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'block-templates.json';
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
                const workingTips = loadMergedTips();
                this.analysis = computeAnalysis(workingTips);
                this.setState({workingTips});
            } catch (err) {
                // eslint-disable-next-line no-alert
                alert(`Import failed: ${err.message}`);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    handleTipSave () {
        const workingTips = loadMergedTips();
        this.analysis = computeAnalysis(workingTips);
        this.setState({workingTips});
    }

    handleTipRevert () {
        const workingTips = loadMergedTips();
        this.analysis = computeAnalysis(workingTips);
        this.setState({workingTips});
    }

    handleTipDelete (tipId) {
        deleteOverride(tipId);
        const workingTips = loadMergedTips();
        this.analysis = computeAnalysis(workingTips);
        this.setState({
            selectedTipId: null,
            workingTips
        });
    }

    handleRequestCapture () {
        const {selectedTipId} = this.state;
        saveCaptureState(selectedTipId);
        this.props.onClose();
    }

    handleToggleReviewed (tipId) {
        const {reviewedSet} = this.state;
        const isCurrentlyReviewed = reviewedSet.has(tipId);
        setReviewed(tipId, !isCurrentlyReviewed);
        this.setState({reviewedSet: getReviewedSet()});
    }

    async handleSaveToSource () {
        if (this.tipEditorRef.current) {
            this.tipEditorRef.current.flushAutosave();
        }
        this.setState({saveToSourceStatus: 'saving'});
        try {
            const mergedTips = loadMergedTips();
            const mergedBlockTemplates = {
                ...blockTemplates,
                ...getCustomBlockTemplates()
            };
            await persistToSource({
                tips: mergedTips,
                quickPicks,
                blockTemplates: mergedBlockTemplates
            });
            clearAllOverrides();
            const workingTips = loadMergedTips();
            this.analysis = computeAnalysis(workingTips);
            this.setState({
                saveToSourceStatus: 'saved',
                workingTips
            });
            setTimeout(() => this.setState({saveToSourceStatus: null}), 2000);
        } catch (err) {
            // eslint-disable-next-line no-alert
            alert(`Save to source failed: ${err.message}`);
            this.setState({saveToSourceStatus: 'error'});
            setTimeout(() => this.setState({saveToSourceStatus: null}), 3000);
        }
    }

    render () {
        const {
            editSearchQuery, selectedTipId, pendingCapture, workingTips,
            activeTag, warningsOnly, orphansOnly, reviewedFilter, reviewedSet
        } = this.state;
        const {vm} = this.props;
        const {warnings, tagCounts, stats, orphanIds} = this.analysis;
        const allTipIds = Object.keys(workingTips);
        const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

        const reviewedCount = allTipIds.filter(id => reviewedSet.has(id)).length;

        const filteredIds = allTipIds.filter(id => {
            const tip = workingTips[id];

            // Tag filter
            if (activeTag && !(tip.tags && tip.tags.includes(activeTag))) return false;

            // Warnings filter
            if (warningsOnly && !warnings[id]) return false;

            // Orphans filter
            if (orphansOnly && !orphanIds.has(id)) return false;

            // Reviewed filter
            if (reviewedFilter === 'reviewed' && !reviewedSet.has(id)) return false;
            if (reviewedFilter === 'unreviewed' && reviewedSet.has(id)) return false;

            // Text search
            if (editSearchQuery) {
                const q = editSearchQuery.toLowerCase();
                const haystack = [
                    id,
                    tip.title || '',
                    tip.text || '',
                    ...(tip.tags || [])
                ].join(' ').toLowerCase();
                if (!haystack.includes(q)) return false;
            }

            return true;
        });

        const selectedTip = selectedTipId ? workingTips[selectedTipId] : null;

        return (
            <div className={styles.overlay}>
                <div className={styles.header}>
                    <div className={styles.title}>
                        {'Tips Editor'}
                    </div>

                    <button
                        className={styles.exportButton}
                        disabled={this.state.saveToSourceStatus === 'saving'}
                        onClick={this.handleSaveToSource}
                    >
                        {this.state.saveToSourceStatus === 'saving' ? 'Saving\u2026' :
                            this.state.saveToSourceStatus === 'saved' ? 'Saved \u2713' :
                                'Save to source'}
                    </button>
                    <button
                        className={styles.exportButton}
                        onClick={this.handleExportTips}
                    >
                        {'Export tips.json'}
                    </button>
                    <button
                        className={styles.exportButton}
                        onClick={this.handleExportBlocks}
                    >
                        {'Export block-templates.json'}
                    </button>
                    <button
                        className={styles.importButton}
                        onClick={this.handleImport}
                    >
                        {'Import'}
                    </button>
                    <input
                        accept=".json"
                        ref={this.importInputRef}
                        style={{display: 'none'}}
                        type="file"
                        onChange={e => this.handleImportFile(e)}
                    />

                    <button
                        className={styles.closeButton}
                        onClick={this.props.onClose}
                    >
                        {'Close'}
                    </button>
                </div>

                <div className={styles.editLayout}>
                    {/* Tag sidebar */}
                    <div className={styles.sidebar}>
                        <div className={styles.sidebarTitle}>{'Tags'}</div>
                        <button
                            className={`${styles.tagListItem} ${!activeTag ? styles.tagListItemActive : ''}`}
                            onClick={() => this.setState({activeTag: null})}
                        >
                            <span>{'All'}</span>
                            <span className={styles.tagCount}>{stats.total}</span>
                        </button>
                        {sortedTags.map(([tag, count]) => {
                            const colors = TAG_COLORS[tag] || DEFAULT_TAG_COLOR;
                            return (
                                <button
                                    className={`${styles.tagListItem} ${activeTag === tag ? styles.tagListItemActive : ''}`}
                                    key={tag}
                                    onClick={() => this.handleTagClick(tag)}
                                >
                                    <span
                                        className={styles.tagDot}
                                        style={{backgroundColor: colors.bg}}
                                    />
                                    <span className={styles.tagName}>{tag}</span>
                                    <span className={styles.tagCount}>{count}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Tip list */}
                    <div className={styles.editTipList}>
                        <div className={styles.editTipListHeader}>
                            <input
                                className={styles.editTipSearch}
                                placeholder="Search tips..."
                                value={editSearchQuery}
                                onChange={e => this.setState({editSearchQuery: e.target.value})}
                            />
                            <div className={styles.filterBar}>
                                <button
                                    className={`${styles.filterButton} ${warningsOnly ? styles.filterButtonActive : ''}`}
                                    onClick={() => this.setState(prev => ({warningsOnly: !prev.warningsOnly}))}
                                >
                                    {`Warnings (${stats.warningCount})`}
                                </button>
                                <button
                                    className={`${styles.filterButton} ${orphansOnly ? styles.filterButtonActive : ''}`}
                                    onClick={() => this.setState(prev => ({orphansOnly: !prev.orphansOnly}))}
                                >
                                    {`Orphans (${stats.orphanCount})`}
                                </button>
                                <button
                                    className={`${styles.filterButton} ${reviewedFilter === 'reviewed' ? styles.filterButtonActive : ''}`}
                                    onClick={() => this.setState(prev => ({
                                        reviewedFilter: prev.reviewedFilter === 'reviewed' ? null : 'reviewed'
                                    }))}
                                >
                                    {`Reviewed (${reviewedCount})`}
                                </button>
                                <button
                                    className={`${styles.filterButton} ${reviewedFilter === 'unreviewed' ? styles.filterButtonActive : ''}`}
                                    onClick={() => this.setState(prev => ({
                                        reviewedFilter: prev.reviewedFilter === 'unreviewed' ? null : 'unreviewed'
                                    }))}
                                >
                                    {`Unreviewed (${stats.total - reviewedCount})`}
                                </button>
                            </div>
                            <div className={styles.statsRow}>
                                <span className={styles.statChip}>{`${stats.total} tips`}</span>
                                <span className={styles.statChip}>{`${stats.withBlocks} blocks`}</span>
                                <span className={styles.statChip}>{`${stats.withPointers} pointers`}</span>
                            </div>
                        </div>
                        <div className={styles.editTipListCount}>
                            {`Showing ${filteredIds.length} of ${stats.total}`}
                        </div>
                        {filteredIds.map(id => {
                            const tip = workingTips[id];
                            const isModified = hasOverride(id);
                            const isActive = id === selectedTipId;
                            const isItemReviewed = reviewedSet.has(id);
                            const hasWarnings = !!warnings[id];
                            return (
                                <div
                                    className={
                                        `${styles.editTipItem} ` +
                                        `${isActive ? styles.editTipItemActive : ''} ` +
                                        `${isModified ? styles.editTipItemModified : ''} ` +
                                        `${isItemReviewed ? styles.editTipItemReviewed : ''}`
                                    }
                                    key={id}
                                >
                                    <button
                                        className={styles.editTipItemContent}
                                        onClick={() => this.setState({selectedTipId: id})}
                                    >
                                        <span className={styles.editTipItemId}>
                                            {hasWarnings ? (
                                                <span className={styles.warningDot} />
                                            ) : null}
                                            {id}
                                        </span>
                                        <span className={styles.editTipItemLabel}>
                                            {tip.title || tip.text}
                                        </span>
                                    </button>
                                    <button
                                        className={`${styles.reviewedCheckbox} ${isItemReviewed ? styles.reviewedCheckboxChecked : ''}`}
                                        title={isItemReviewed ? 'Mark as unreviewed' : 'Mark as reviewed'}
                                        onClick={() => this.handleToggleReviewed(id)}
                                    >
                                        {isItemReviewed ? '\u2713' : ''}
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {/* Editor panel */}
                    {selectedTip ? (
                        <TipEditor
                            allTipIds={allTipIds}
                            isReviewed={reviewedSet.has(selectedTipId)}
                            key={selectedTipId}
                            ref={this.tipEditorRef}
                            onCaptureConsumed={() => this.setState({pendingCapture: false})}
                            onDelete={this.handleTipDelete}
                            onRequestCapture={this.handleRequestCapture}
                            onRevert={this.handleTipRevert}
                            onSave={this.handleTipSave}
                            onToggleReviewed={() => this.handleToggleReviewed(selectedTipId)}
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
            </div>
        );
    }
}

export default TipsReview;
