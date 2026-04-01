/* eslint-disable react/prop-types, react/jsx-no-bind,
   arrow-parens, @stylistic/max-len, no-undefined */
import React from 'react';
import BlockPreview from '../unstuck-card/block-preview.jsx';
import blockTemplates from '../../lib/unstuck/block-templates.js';
import {
    uiTargets,
    blockOpcodesByCategory,
    preActions,
    sideOptions,
    categoryNames
} from '../../lib/unstuck/pointer-targets.js';
import {captureWorkspaceBlocks, blocksToXml} from '../../lib/unstuck/workspace-capture.js';
import {saveOverride, hasOverride, clearOverride, saveBlockTemplate, getCustomBlockTemplates} from '../../lib/unstuck/tip-overrides.js';

import styles from './tips-review.css';

const ALL_TAGS = [
    'events', 'motion', 'looks', 'sound', 'control', 'sensing',
    'operators', 'variables', 'pen', 'beginner', 'debugging', 'start', 'hat',
    'movement', 'animation', 'costume', 'effect', 'game', 'clone',
    'broadcast', 'keyboard', 'mouse', 'direction', 'coordinate'
];

class TipEditor extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            draft: this.cloneTip(props.tip),
            capturedScripts: null,
            showCapturePreview: false,
            dirty: false
        };
    }

    componentDidMount () {
        if (this.props.pendingCapture) {
            this.performCapture();
            if (this.props.onCaptureConsumed) {
                this.props.onCaptureConsumed();
            }
        }
    }

    componentDidUpdate (prevProps) {
        if (prevProps.tipId !== this.props.tipId) {
            this.setState({
                draft: this.cloneTip(this.props.tip),
                capturedScripts: null,
                showCapturePreview: false,
                dirty: false
            });
        }
    }

    cloneTip (tip) {
        return JSON.parse(JSON.stringify(tip));
    }

    updateDraft (updater) {
        this.setState(prev => ({
            draft: {...prev.draft, ...updater(prev.draft)},
            dirty: true
        }));
    }

    handleSave () {
        const {tipId, onSave} = this.props;
        const tip = this.state.draft;
        tip.id = tipId;
        saveOverride(tipId, tip);
        this.setState({dirty: false});
        if (onSave) onSave(tipId, tip);
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
        this.setState({capturedScripts: scripts, showCapturePreview: true});
    }

    handleUseCapturedScript (script) {
        const templateName = `captured_${this.props.tipId}_${Date.now()}`;
        saveBlockTemplate(templateName, script.blocks);
        this.updateDraft(() => ({
            blockExample: templateName,
            _capturedBlocks: script.blocks
        }));
        this.setState({showCapturePreview: false});
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
            pointers: [...(draft.pointers || []), {label: '', target: '', side: 'right'}]
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
            // If selecting a block opcode, set category too
            if (field === 'blockOpcode') {
                for (const [cat, opcodes] of Object.entries(blockOpcodesByCategory)) {
                    if (opcodes.find(o => o.opcode === value)) {
                        arr[index].category = cat;
                        delete arr[index].target;
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

    // --- Relevance helpers ---
    updateKeywords (index, value) {
        this.updateDraft(draft => {
            const kw = [...((draft.relevance && draft.relevance.keywords) || [])];
            kw[index] = value;
            return {relevance: {...(draft.relevance || {}), keywords: kw}};
        });
    }

    addKeyword () {
        this.updateDraft(draft => {
            const kw = [...((draft.relevance && draft.relevance.keywords) || []), ''];
            return {relevance: {...(draft.relevance || {}), keywords: kw}};
        });
    }

    removeKeyword (index) {
        this.updateDraft(draft => {
            const kw = [...((draft.relevance && draft.relevance.keywords) || [])];
            kw.splice(index, 1);
            return {relevance: {...(draft.relevance || {}), keywords: kw}};
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
        const isBlockType = !!pointer.blockOpcode;
        const isUiType = !!pointer.target;

        return (
            <div className={styles.editorPointerTarget}>
                <select
                    className={styles.editorSelect}
                    value={isBlockType ? 'block' : (isUiType ? 'ui' : 'custom')}
                    onChange={e => {
                        if (e.target.value === 'block') {
                            this.updatePointer(index, 'blockOpcode', '');
                        } else if (e.target.value === 'ui') {
                            this.updatePointer(index, 'target', '');
                        }
                    }}
                >
                    <option value="ui">{'UI Element'}</option>
                    <option value="block">{'Block'}</option>
                    <option value="custom">{'Custom CSS'}</option>
                </select>

                {isBlockType || (!isUiType && !pointer.target) ? null : (
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
                ) : null}

                {!isBlockType && !isUiType ? (
                    <input
                        className={styles.editorInput}
                        placeholder="CSS selector"
                        value={pointer.target || ''}
                        onChange={e => this.updatePointer(index, 'target', e.target.value)}
                    />
                ) : null}
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
                        <div className={styles.editorPointerRow}>
                            <div className={styles.editorField}>
                                <label className={styles.editorLabelSmall}>{'Pre-action'}</label>
                                <select
                                    className={styles.editorSelect}
                                    value={pointer.preAction || ''}
                                    onChange={e => this.updatePointer(i, 'preAction', e.target.value || undefined)}
                                >
                                    <option value="">{'None'}</option>
                                    {preActions.map(pa => (
                                        <option
                                            key={pa.value}
                                            value={pa.value}
                                        >{pa.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className={styles.editorField}>
                                <label className={styles.editorLabelSmall}>{'Side'}</label>
                                <select
                                    className={styles.editorSelect}
                                    value={pointer.side || 'right'}
                                    onChange={e => this.updatePointer(i, 'side', e.target.value)}
                                >
                                    {sideOptions.map(s => (
                                        <option
                                            key={s}
                                            value={s}
                                        >{s}</option>
                                    ))}
                                </select>
                            </div>
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
        const {draft, capturedScripts, showCapturePreview} = this.state;
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
                                `Found ${capturedScripts.length} script(s) — click one to use it:`
                            }
                        </div>
                        {capturedScripts.map((script, i) => (
                            <button
                                className={styles.editorCaptureItem}
                                key={i}
                                onClick={() => this.handleUseCapturedScript(script)}
                            >
                                <span className={styles.opcodeChain}>
                                    {script.opcodeChain.join(' \u2192 ')}
                                </span>
                                <span className={styles.editorCaptureBlocks}>
                                    {`${script.blocks.length} blocks`}
                                </span>
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>
        );
    }

    renderKeywordsEditor () {
        const {draft} = this.state;
        const keywords = (draft.relevance && draft.relevance.keywords) || [];

        return (
            <div className={styles.editorField}>
                <label className={styles.editorLabel}>{'Keywords'}</label>
                <div className={styles.editorKeywordList}>
                    {keywords.map((kw, i) => (
                        <div
                            className={styles.editorListRow}
                            key={i}
                        >
                            <input
                                className={styles.editorInputSmall}
                                value={kw}
                                onChange={e => this.updateKeywords(i, e.target.value)}
                            />
                            <button
                                className={styles.editorRemoveButton}
                                onClick={() => this.removeKeyword(i)}
                            >
                                {'\u00d7'}
                            </button>
                        </div>
                    ))}
                </div>
                <button
                    className={styles.editorAddButton}
                    onClick={() => this.addKeyword()}
                >
                    {'+ Add keyword'}
                </button>
            </div>
        );
    }

    render () {
        const {tipId} = this.props;
        const {dirty} = this.state;
        const isOverridden = hasOverride(tipId);

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
                            disabled={!dirty}
                            onClick={() => this.handleSave()}
                        >
                            {'Save'}
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

                <div className={styles.editorForm}>
                    {this.renderTextField('Follow-up Label', 'followUpLabel')}
                    {this.renderTextArea('Text', 'text')}
                    {this.renderTagsEditor()}
                    {this.renderListEditor('Queries', 'queries', 'e.g. how do I make my sprite move')}
                    {this.renderFollowUpsEditor()}
                    {this.renderBlockExampleEditor()}
                    {this.renderPointersEditor()}
                    {this.renderKeywordsEditor()}
                </div>
            </div>
        );
    }
}

export default TipEditor;
