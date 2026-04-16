/* eslint-disable react/prop-types, react/jsx-no-bind,
   arrow-parens, @stylistic/max-len, no-undefined */
import React from 'react';
import BlockPreview from '../unstuck-card/block-preview.jsx';
import {TipDisplay} from '../unstuck-card/unstuck-card.jsx';
import allTips from '../../lib/libraries/tips/index.js';
import blockTemplates from '../../lib/unstuck/block-templates.js';
import {
    uiTargets,
    blockOpcodesByCategory,
    categoryNames
} from '../../lib/unstuck/pointer-targets.js';
import {captureWorkspaceBlocks, blocksToXml, combineScripts} from '../../lib/unstuck/workspace-capture.js';
import {saveOverride, hasOverride, clearOverride, saveBlockTemplate, getCustomBlockTemplates} from '../../lib/unstuck/tip-overrides.js';

import styles from './tips-review.css';
import unstuckStyles from '../unstuck-card/unstuck-card.css';

const ALL_TAGS = [
    'events', 'motion', 'looks', 'sound', 'control', 'sensing',
    'operators', 'variables', 'pen', 'beginner', 'debugging', 'start', 'hat',
    'movement', 'animation', 'costume', 'effect', 'game', 'clone',
    'broadcast', 'keyboard', 'mouse', 'direction', 'coordinate'
];

const AUTOSAVE_DELAY_MS = 500;

class TipEditor extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            draft: this.cloneTip(props.tip),
            capturedScripts: null,
            selectedScriptIndexes: null,
            showCapturePreview: false,
            dirty: false,
            previewCodeExpanded: true,
            lastSavedAt: null
        };
        this.autosaveTimer = null;
        this._mounted = false;
        this.flushAutosave = this.flushAutosave.bind(this);
    }

    componentDidMount () {
        this._mounted = true;
        if (this.props.pendingCapture) {
            this.performCapture();
            if (this.props.onCaptureConsumed) {
                this.props.onCaptureConsumed();
            }
        }
    }

    componentWillUnmount () {
        this._mounted = false;
        // Flush pending edits so switching tips / closing the modal
        // never loses work.
        this.flushAutosave();
    }

    cloneTip (tip) {
        return JSON.parse(JSON.stringify(tip));
    }

    updateDraft (updater) {
        this.setState(
            prev => ({
                draft: {...prev.draft, ...updater(prev.draft)},
                dirty: true
            }),
            () => this.scheduleAutosave()
        );
    }

    scheduleAutosave () {
        if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
        this.autosaveTimer = setTimeout(() => {
            this.autosaveTimer = null;
            this.flushAutosave();
        }, AUTOSAVE_DELAY_MS);
    }

    flushAutosave () {
        if (this.autosaveTimer) {
            clearTimeout(this.autosaveTimer);
            this.autosaveTimer = null;
        }
        if (!this.state.dirty) return;
        const {tipId, onSave} = this.props;
        const tip = {...this.state.draft, id: tipId};
        saveOverride(tipId, tip);
        if (this._mounted) {
            this.setState({dirty: false, lastSavedAt: Date.now()});
        }
        if (onSave) onSave(tipId, tip);
    }

    handleSave () {
        this.flushAutosave();
    }

    handleRevert () {
        const {tipId, onRevert} = this.props;
        clearOverride(tipId);
        this.setState({dirty: false});
        if (onRevert) onRevert(tipId);
    }

    handleCapture () {
        const {onRequestCapture} = this.props;
        if (onRequestCapture) {
            // Close the overlay so user can build blocks in the workspace
            onRequestCapture();
        }
    }

    performCapture () {
        const {vm} = this.props;
        const scripts = captureWorkspaceBlocks(vm);
        const selected = new Set(scripts.map((_, i) => i));
        this.setState({
            capturedScripts: scripts,
            selectedScriptIndexes: selected,
            showCapturePreview: true
        });
    }

    toggleScriptSelection (index) {
        this.setState(prev => {
            const next = new Set(prev.selectedScriptIndexes);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return {selectedScriptIndexes: next};
        });
    }

    handleUseSelectedScripts () {
        const {capturedScripts, selectedScriptIndexes} = this.state;
        if (!capturedScripts || !selectedScriptIndexes) return;
        const picked = capturedScripts.filter((_, i) => selectedScriptIndexes.has(i));
        if (picked.length === 0) return;
        const combined = combineScripts(picked);
        const templateName = `captured_${this.props.tipId}_${Date.now()}`;
        saveBlockTemplate(templateName, combined);
        this.updateDraft(() => ({
            blockExample: templateName,
            _capturedBlocks: combined
        }));
        this.setState({
            showCapturePreview: false,
            selectedScriptIndexes: null
        });
    }

    // --- List field helpers ---
    addListItem (field, defaultValue = '') {
        this.updateDraft(draft => {
            const arr = [...(draft[field] || []), defaultValue];
            return {[field]: arr};
        });
    }

    removeListItem (field, index) {
        this.updateDraft(draft => {
            const arr = [...(draft[field] || [])];
            arr.splice(index, 1);
            return {[field]: arr};
        });
    }

    updateListItem (field, index, value) {
        this.updateDraft(draft => {
            const arr = [...(draft[field] || [])];
            arr[index] = value;
            return {[field]: arr};
        });
    }

    // --- Pointer helpers ---
    addPointer () {
        this.updateDraft(draft => ({
            pointers: [...(draft.pointers || []), {label: '', target: ''}]
        }));
    }

    removePointer (index) {
        this.updateDraft(draft => {
            const arr = [...(draft.pointers || [])];
            arr.splice(index, 1);
            return {pointers: arr};
        });
    }

    updatePointer (index, field, value) {
        this.updateDraft(draft => {
            const arr = [...(draft.pointers || [])];
            arr[index] = {...arr[index], [field]: value};
            // If selecting a block opcode, set category and clear UI target
            if (field === 'blockOpcode') {
                delete arr[index].target;
                delete arr[index].category;
                for (const [cat, opcodes] of Object.entries(blockOpcodesByCategory)) {
                    if (opcodes.find(o => o.opcode === value)) {
                        arr[index].category = cat;
                        break;
                    }
                }
            }
            // If selecting a UI target, set target and clear block fields
            if (field === 'target') {
                delete arr[index].blockOpcode;
                delete arr[index].category;
            }
            return {pointers: arr};
        });
    }

    renderTextField (label, field) {
        const {draft} = this.state;
        return (
            <div className={styles.editorField}>
                <label className={styles.editorLabel}>{label}</label>
                <input
                    className={styles.editorInput}
                    value={draft[field] || ''}
                    onChange={e => this.updateDraft(() => ({[field]: e.target.value}))}
                />
            </div>
        );
    }

    renderTextArea (label, field) {
        const {draft} = this.state;
        return (
            <div className={styles.editorField}>
                <label className={styles.editorLabel}>{label}</label>
                <textarea
                    className={styles.editorTextarea}
                    rows={3}
                    value={draft[field] || ''}
                    onChange={e => this.updateDraft(() => ({[field]: e.target.value}))}
                />
            </div>
        );
    }

    renderTagsEditor () {
        const {draft} = this.state;
        const currentTags = draft.tags || [];
        const availableTags = ALL_TAGS.filter(t => !currentTags.includes(t));

        return (
            <div className={styles.editorField}>
                <label className={styles.editorLabel}>{'Tags'}</label>
                <div className={styles.editorTagList}>
                    {currentTags.map((tag, i) => (
                        <span
                            className={styles.editorTag}
                            key={tag}
                        >
                            {tag}
                            <button
                                className={styles.editorTagRemove}
                                onClick={() => this.removeListItem('tags', i)}
                            >
                                {'\u00d7'}
                            </button>
                        </span>
                    ))}
                    <select
                        className={styles.editorTagAdd}
                        value=""
                        onChange={e => {
                            if (e.target.value) {
                                this.updateDraft(d => ({tags: [...(d.tags || []), e.target.value]}));
                            }
                        }}
                    >
                        <option value="">{'+ Add tag'}</option>
                        {availableTags.map(tag => (
                            <option
                                key={tag}
                                value={tag}
                            >{tag}</option>
                        ))}
                    </select>
                </div>
            </div>
        );
    }

    renderListEditor (label, field, placeholder = '') {
        const {draft} = this.state;
        const items = draft[field] || [];

        return (
            <div className={styles.editorField}>
                <label className={styles.editorLabel}>{label}</label>
                {items.map((item, i) => (
                    <div
                        className={styles.editorListRow}
                        key={i}
                    >
                        <input
                            className={styles.editorInput}
                            placeholder={placeholder}
                            value={item}
                            onChange={e => this.updateListItem(field, i, e.target.value)}
                        />
                        <button
                            className={styles.editorRemoveButton}
                            onClick={() => this.removeListItem(field, i)}
                        >
                            {'\u00d7'}
                        </button>
                    </div>
                ))}
                <button
                    className={styles.editorAddButton}
                    onClick={() => this.addListItem(field)}
                >
                    {`+ Add ${label.toLowerCase().replace(/s$/, '')}`}
                </button>
            </div>
        );
    }

    renderFollowUpsEditor () {
        const {draft} = this.state;
        const {allTipIds} = this.props;
        const followUps = draft.followUps || [];

        return (
            <div className={styles.editorField}>
                <label className={styles.editorLabel}>{'Follow-ups'}</label>
                {followUps.map((fid, i) => (
                    <div
                        className={styles.editorListRow}
                        key={i}
                    >
                        <select
                            className={styles.editorSelect}
                            value={fid}
                            onChange={e => this.updateListItem('followUps', i, e.target.value)}
                        >
                            <option value="">{'Select a tip...'}</option>
                            {allTipIds.map(id => (
                                <option
                                    key={id}
                                    value={id}
                                >{id}</option>
                            ))}
                        </select>
                        <button
                            className={styles.editorRemoveButton}
                            onClick={() => this.removeListItem('followUps', i)}
                        >
                            {'\u00d7'}
                        </button>
                    </div>
                ))}
                <button
                    className={styles.editorAddButton}
                    onClick={() => this.addListItem('followUps')}
                >
                    {'+ Add follow-up'}
                </button>
            </div>
        );
    }

    renderPointerTargetSelect (pointer, index) {
        const isBlockType = 'blockOpcode' in pointer;

        return (
            <div className={styles.editorPointerTarget}>
                <select
                    className={styles.editorSelect}
                    value={isBlockType ? 'block' : 'ui'}
                    onChange={e => {
                        if (e.target.value === 'block') {
                            this.updatePointer(index, 'blockOpcode', '');
                        } else {
                            this.updatePointer(index, 'target', '');
                        }
                    }}
                >
                    <option value="ui">{'UI Element'}</option>
                    <option value="block">{'Block'}</option>
                </select>

                {isBlockType ? (
                    <select
                        className={styles.editorSelect}
                        value={pointer.blockOpcode || ''}
                        onChange={e => this.updatePointer(index, 'blockOpcode', e.target.value)}
                    >
                        <option value="">{'Select block...'}</option>
                        {Object.entries(blockOpcodesByCategory).map(([cat, opcodes]) => (
                            <optgroup
                                key={cat}
                                label={categoryNames[cat]}
                            >
                                {opcodes.map(o => (
                                    <option
                                        key={o.opcode}
                                        value={o.opcode}
                                    >{o.label}</option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                ) : (
                    <select
                        className={styles.editorSelect}
                        value={pointer.target || ''}
                        onChange={e => this.updatePointer(index, 'target', e.target.value)}
                    >
                        <option value="">{'Select target...'}</option>
                        {uiTargets.map(t => (
                            <option
                                key={t.selector}
                                value={t.selector}
                            >{t.label}</option>
                        ))}
                    </select>
                )}
            </div>
        );
    }

    renderPointersEditor () {
        const {draft} = this.state;
        const pointers = draft.pointers || [];

        return (
            <div className={styles.editorField}>
                <label className={styles.editorLabel}>{'Pointers'}</label>
                {pointers.map((pointer, i) => (
                    <div
                        className={styles.editorPointerCard}
                        key={i}
                    >
                        <div className={styles.editorPointerHeader}>
                            <span>{`Pointer ${i + 1}`}</span>
                            <button
                                className={styles.editorRemoveButton}
                                onClick={() => this.removePointer(i)}
                            >
                                {'\u00d7'}
                            </button>
                        </div>
                        <div className={styles.editorField}>
                            <label className={styles.editorLabelSmall}>{'Label'}</label>
                            <input
                                className={styles.editorInput}
                                value={pointer.label || ''}
                                onChange={e => this.updatePointer(i, 'label', e.target.value)}
                            />
                        </div>
                        <div className={styles.editorField}>
                            <label className={styles.editorLabelSmall}>{'Target'}</label>
                            {this.renderPointerTargetSelect(pointer, i)}
                        </div>
                    </div>
                ))}
                <button
                    className={styles.editorAddButton}
                    onClick={() => this.addPointer()}
                >
                    {'+ Add pointer'}
                </button>
            </div>
        );
    }

    renderBlockExampleEditor () {
        const {draft, capturedScripts, selectedScriptIndexes, showCapturePreview} = this.state;
        const {vm} = this.props;
        const allTemplateNames = Object.keys(blockTemplates);
        const customTemplates = getCustomBlockTemplates();
        const customNames = Object.keys(customTemplates);

        return (
            <div className={styles.editorField}>
                <label className={styles.editorLabel}>{'Block Example'}</label>
                <div className={styles.editorListRow}>
                    <select
                        className={styles.editorSelect}
                        value={draft.blockExample || ''}
                        onChange={e => this.updateDraft(() => ({blockExample: e.target.value || undefined}))}
                    >
                        <option value="">{'None'}</option>
                        <optgroup label="Built-in Templates">
                            {allTemplateNames.map(name => (
                                <option
                                    key={name}
                                    value={name}
                                >{name}</option>
                            ))}
                        </optgroup>
                        {customNames.length > 0 ? (
                            <optgroup label="Captured Templates">
                                {customNames.map(name => (
                                    <option
                                        key={name}
                                        value={name}
                                    >{name}</option>
                                ))}
                            </optgroup>
                        ) : null}
                    </select>
                    {vm ? (
                        <button
                            className={styles.editorCaptureButton}
                            onClick={() => this.handleCapture()}
                        >
                            {'Capture from Workspace'}
                        </button>
                    ) : null}
                </div>

                {draft.blockExample && (blockTemplates[draft.blockExample] || customTemplates[draft.blockExample]) ? (
                    <div className={styles.blockPreviewWrapper}>
                        {customTemplates[draft.blockExample] ? (
                            <BlockPreview
                                blockXml={blocksToXml(customTemplates[draft.blockExample])}
                            />
                        ) : (
                            <BlockPreview templateName={draft.blockExample} />
                        )}
                    </div>
                ) : null}

                {showCapturePreview && capturedScripts ? (
                    <div className={styles.editorCapturePreview}>
                        <div className={styles.editorLabel}>
                            {capturedScripts.length === 0 ?
                                'No scripts found in workspace' :
                                `Found ${capturedScripts.length} script(s) — check which to include:`
                            }
                        </div>
                        {capturedScripts.map((script, i) => {
                            const checked = selectedScriptIndexes ? selectedScriptIndexes.has(i) : false;
                            return (
                                <label
                                    className={styles.editorCaptureItem}
                                    key={i}
                                    style={{cursor: 'pointer'}}
                                >
                                    <span style={{display: 'flex', alignItems: 'center', gap: 8, minWidth: 0}}>
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => this.toggleScriptSelection(i)}
                                        />
                                        <span className={styles.opcodeChain}>
                                            {script.opcodeChain.join(' \u2192 ')}
                                        </span>
                                    </span>
                                    <span className={styles.editorCaptureBlocks}>
                                        {`${script.blocks.length} blocks`}
                                    </span>
                                </label>
                            );
                        })}
                        {capturedScripts.length > 0 ? (
                            <div style={{marginTop: 10, display: 'flex', gap: 8}}>
                                <button
                                    className={styles.editorCaptureButton}
                                    disabled={!selectedScriptIndexes || selectedScriptIndexes.size === 0}
                                    onClick={() => this.handleUseSelectedScripts()}
                                >
                                    {`Use selected (${selectedScriptIndexes ? selectedScriptIndexes.size : 0})`}
                                </button>
                                <button
                                    className={styles.editorCaptureButton}
                                    onClick={() => this.setState({showCapturePreview: false, selectedScriptIndexes: null})}
                                >
                                    {'Cancel'}
                                </button>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        );
    }

    renderPreview () {
        const {draft, previewCodeExpanded} = this.state;
        const noop = () => {};
        return (
            <div className={styles.previewPanel}>
                <div className={styles.previewHeader}>{'Preview'}</div>
                <div className={styles.previewStage}>
                    <div className={unstuckStyles.card}>
                        <div className={unstuckStyles.body}>
                            <TipDisplay
                                codeExpanded={previewCodeExpanded}
                                tip={draft}
                                tips={allTips}
                                onAddToProject={noop}
                                onFollowUp={noop}
                                onPointerClick={noop}
                                onToggleCode={() => this.setState(s => ({
                                    previewCodeExpanded: !s.previewCodeExpanded
                                }))}
                            />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    render () {
        const {tipId} = this.props;
        const {dirty, lastSavedAt} = this.state;
        const isOverridden = hasOverride(tipId);
        const saveLabel = dirty ?
            'Saving…' :
            (lastSavedAt ? 'Saved ✓' : 'Saved');

        return (
            <div className={styles.editorPanel}>
                <div className={styles.editorHeader}>
                    <span className={styles.editorTipId}>{tipId}</span>
                    {isOverridden ? (
                        <span className={styles.editorOverrideBadge}>{'Modified'}</span>
                    ) : null}
                    <div className={styles.editorActions}>
                        {isOverridden ? (
                            <button
                                className={styles.editorRevertButton}
                                onClick={() => this.handleRevert()}
                            >
                                {'Revert'}
                            </button>
                        ) : null}
                        <button
                            className={`${styles.editorSaveButton} ${dirty ? styles.editorSaveButtonDirty : ''}`}
                            title="Edits autosave locally. Click to flush immediately."
                            onClick={() => this.handleSave()}
                        >
                            {saveLabel}
                        </button>
                        <button
                            className={styles.editorDeleteButton}
                            onClick={() => {
                                if (this.props.onDelete) {
                                    this.props.onDelete(tipId);
                                }
                            }}
                        >
                            {'Delete'}
                        </button>
                    </div>
                </div>

                <div className={styles.editorBody}>
                    <div className={styles.editorForm}>
                        {this.renderTextField('Title', 'title')}
                        {this.renderTextArea('Text', 'text')}
                        {this.renderTagsEditor()}
                        {this.renderFollowUpsEditor()}
                        {this.renderBlockExampleEditor()}
                        {this.renderPointersEditor()}
                    </div>
                    {this.renderPreview()}
                </div>
            </div>
        );
    }
}

export default TipEditor;
