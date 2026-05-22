/**
 * Resolves DOM-click events to picked Scratch blocks for the Tips block-picker.
 *
 * Symmetric with pointer-actions.js (opcode → DOM element):
 * this module is the inverse direction (DOM element → opcode + human text).
 */
import * as ScratchBlocks from 'scratch-blocks';
import extensionsLibrary from '../libraries/extensions/index.jsx';

const OPCODE_CLASS_RE = /^[a-z][a-z0-9]*_[a-z0-9_]+$/i;

const findOpcodeFromClassList = function (el) {
    if (!el || !el.classList) return null;
    for (const cls of el.classList) {
        if (OPCODE_CLASS_RE.test(cls)) return cls;
    }
    return null;
};

const walkPastReporters = function (block) {
    // A clicked shadow value like the "10" inside `move 10 steps` is its own
    // block (e.g. math_number) with an output connection. We want the
    // enclosing statement block instead, so walk up while we're sitting on a
    // reporter/value block.
    let current = block;
    let safety = 8;
    while (current && current.outputConnection && safety-- > 0) {
        const parent = typeof current.getParent === 'function' ? current.getParent() : null;
        if (!parent) break;
        current = parent;
    }
    return current;
};

const looksLikeImageOrUrl = function (s) {
    if (!s) return false;
    return /\.svg|\.png|\.jpe?g|^https?:|^data:|^\.?\//i.test(s);
};

/**
 * Build a human-readable text representation for a block by walking its
 * inputList and recursing into any connected value blocks.
 * @param {object} block - ScratchBlocks Block instance
 * @param {number} [depth] - Recursion depth (internal)
 * @returns {string} Human-readable text for the block (e.g. "move 10 steps")
 */
const getBlockHumanText = function (block, depth) {
    if (!block) return '';
    const d = depth || 0;
    if (d > 3) return '';
    const parts = [];
    const inputs = block.inputList || [];
    for (const input of inputs) {
        const fields = input.fieldRow || [];
        for (const field of fields) {
            let text = '';
            if (typeof field.getText === 'function') {
                try {
                    text = field.getText() || '';
                } catch (_e) {
                    text = '';
                }
            }
            if (!text && typeof field.getValue === 'function') {
                try {
                    const v = field.getValue();
                    if (v !== null && typeof v !== 'undefined') text = String(v);
                } catch (_e) {
                    text = '';
                }
            }
            // Skip image/URL field values (e.g. icon fields use SVG paths as values),
            // which leak file paths into the search query.
            if (text && !looksLikeImageOrUrl(text)) {
                parts.push(text);
            }
        }
        const conn = input.connection;
        const childBlock = conn && typeof conn.targetBlock === 'function' ? conn.targetBlock() : null;
        if (childBlock) {
            const childText = getBlockHumanText(childBlock, d + 1);
            if (childText) parts.push(childText);
        }
    }
    const combined = parts.join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (combined.length > 120) return combined.slice(0, 120).trim();
    return combined;
};

const findDraggableFromTarget = function (target, clientX, clientY) {
    if (!target || typeof target.closest !== 'function') return null;
    const draggable = target.closest('.blocklyDraggable');
    if (draggable) return draggable;

    // Click landed on a Blockly widget (inline edit input, dropdown menu) that
    // sits over a block field. Look through the elements at the same point
    // (skipping widgets and overlays) to find the underlying draggable block.
    const widget = target.closest(
        '.blocklyWidgetDiv, .blocklyDropDownDiv, .blocklyHtmlInput, .blocklyToolboxDiv'
    );
    if (!widget) return null;
    if (typeof document === 'undefined' || typeof document.elementsFromPoint !== 'function') {
        return null;
    }
    if (typeof clientX !== 'number' || typeof clientY !== 'number') return null;

    const stack = document.elementsFromPoint(clientX, clientY);
    for (const el of stack) {
        if (!el || typeof el.closest !== 'function') continue;
        const d = el.closest('.blocklyDraggable');
        if (d) return d;
    }
    return null;
};

/**
 * Walk up from event.target to find a Blockly block and identify it.
 * @param {Event} event - A pointer event (mousedown/click)
 * @returns {{opcode: string, humanText: string, source: 'workspace'|'flyout', blockId: ?string}|null}
 *   Block info, or null if the event didn't land on a block.
 */
const resolveBlockFromEvent = function (event) {
    if (!event || !event.target || typeof event.target.closest !== 'function') return null;
    const draggable = findDraggableFromTarget(event.target, event.clientX, event.clientY);
    if (!draggable) return null;

    const source = draggable.closest('.blocklyFlyout') ? 'flyout' : 'workspace';
    const blockId = draggable.getAttribute('data-id') || null;

    const mainWs = typeof ScratchBlocks.getMainWorkspace === 'function' ?
        ScratchBlocks.getMainWorkspace() : null;
    let ws = null;
    if (mainWs) {
        if (source === 'flyout') {
            const flyout = typeof mainWs.getFlyout === 'function' ? mainWs.getFlyout() : null;
            ws = flyout && typeof flyout.getWorkspace === 'function' ? flyout.getWorkspace() : null;
        } else {
            ws = mainWs;
        }
    }

    let block = null;
    if (ws && blockId && typeof ws.getBlockById === 'function') {
        try {
            block = ws.getBlockById(blockId);
        } catch (_e) {
            block = null;
        }
    }

    if (block) {
        const resolved = walkPastReporters(block);
        return {
            opcode: resolved.type || block.type || '',
            humanText: getBlockHumanText(resolved),
            source,
            blockId
        };
    }

    // Fallback: read the opcode from the element's class list. Block elements
    // carry their opcode as a CSS class (see pointer-actions.js:74).
    const classOpcode = findOpcodeFromClassList(draggable);
    if (classOpcode) {
        return {
            opcode: classOpcode,
            humanText: classOpcode.replace(/_/g, ' '),
            source,
            blockId: null
        };
    }
    return null;
};

/**
 * Get the block's category prefix from its opcode, e.g.
 * `"motion_movesteps"` → `"motion"`.
 * @param {string} opcode
 * @returns {string}
 */
const categoryFromOpcode = function (opcode) {
    if (!opcode || typeof opcode !== 'string') return '';
    const idx = opcode.indexOf('_');
    return idx > 0 ? opcode.slice(0, idx) : '';
};

// Lazy-built map from extensionId → display name. Built-in categories
// (motion, looks, event, control, …) aren't in the extensions list, so
// they naturally return null and skip query augmentation.
let _extensionNameMap = null;
const getExtensionDisplayName = function (extensionId) {
    if (!extensionId) return null;
    if (!_extensionNameMap) {
        _extensionNameMap = new Map();
        for (const ext of extensionsLibrary) {
            if (!ext || !ext.extensionId) continue;
            const name = ext.name;
            if (typeof name === 'string') {
                _extensionNameMap.set(ext.extensionId, name);
            } else if (name && name.props && typeof name.props.defaultMessage === 'string') {
                _extensionNameMap.set(ext.extensionId, name.props.defaultMessage);
            }
        }
    }
    return _extensionNameMap.get(extensionId) || null;
};

/**
 * Build the visible / search query for a picked block. For extension blocks
 * (opcode prefix matches an extensionId), append the extension's display
 * name so the embedding pulls in tutorials/starters that describe themselves
 * by extension name rather than by individual block name.
 * @param {{opcode: string, humanText: string}} picked - The picked block info
 * @returns {string} The constructed natural-language query, or empty string
 */
const buildPickedBlockQuery = function (picked) {
    if (!picked) return '';
    const niceOpcode = (picked.opcode || '')
        .replace(/^[^_]+_/, '')
        .replace(/_/g, ' ')
        .trim();
    const text = picked.humanText && picked.humanText.trim() ? picked.humanText.trim() : niceOpcode;
    if (!text) return '';
    const extensionName = getExtensionDisplayName(categoryFromOpcode(picked.opcode));
    if (extensionName) {
        return `How do I use the ${text} block? (${extensionName})`;
    }
    return `How do I use the ${text} block?`;
};

// Bucket 1 cap — captured-block matches take at most this many slots so
// tutorials and starter projects (which never have _capturedBlocks) still
// reach the result list for heavily-used blocks like event_whenflagclicked.
const CAPTURED_BUCKET_CAP = 5;
const FINAL_RESULT_LIMIT = 10;

const countOpcodeInCaptures = function (tip, opcode) {
    if (!tip._capturedBlocks) return 0;
    let count = 0;
    for (const b of tip._capturedBlocks) {
        if (b.opcode === opcode) count++;
    }
    return count;
};

/**
 * Rank tip search results for a picked block using a two-bucket merge.
 *
 * Bucket 1 (capped at CAPTURED_BUCKET_CAP): tips where the picked opcode
 * appears in `_capturedBlocks` or `pointers`. Ranked by:
 *   - Tier A: opcode in `pointers[]` (author-declared "this tip is about
 *     this block"). Tier B: only in `_capturedBlocks`.
 *   - Within each tier: capture ratio (count / total captured blocks), so
 *     tips that focus on the picked block outrank tips that use it
 *     incidentally. Ties: lexicographic on tipId for determinism.
 *
 * Bucket 2: embedding results in their original order, skipping any
 * tipId already in bucket 1, until the combined list reaches the limit.
 *
 * @param {Array<{tipId: string, score: number}>} embeddingResults
 * @param {Object<string, object>} allTips - tip id → tip
 * @param {{opcode: string}} picked
 * @returns {Array<{tipId: string, score: number}>} Up to 10 ranked tips
 */
const rankTipsForPickedBlock = function (embeddingResults, allTips, picked) {
    if (!picked || !allTips) return (embeddingResults || []).slice(0, FINAL_RESULT_LIMIT);
    const opcode = picked.opcode;

    const capturedEntries = [];
    for (const tipId in allTips) {
        const tip = allTips[tipId];
        const inPointers = !!(tip.pointers && tip.pointers.some(p => p.blockOpcode === opcode));
        const captureCount = countOpcodeInCaptures(tip, opcode);
        if (!inPointers && captureCount === 0) continue;
        const totalCaptures = (tip._capturedBlocks && tip._capturedBlocks.length) || 0;
        const ratio = totalCaptures > 0 ? captureCount / totalCaptures : 0;
        capturedEntries.push({tipId, tier: inPointers ? 0 : 1, ratio});
    }
    capturedEntries.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        if (b.ratio !== a.ratio) return b.ratio - a.ratio;
        return a.tipId.localeCompare(b.tipId);
    });
    const bucket1 = capturedEntries.slice(0, CAPTURED_BUCKET_CAP);

    const usedIds = new Set(bucket1.map(e => e.tipId));
    const bucket2 = [];
    for (const r of embeddingResults || []) {
        if (usedIds.has(r.tipId)) continue;
        bucket2.push(r);
        if (bucket1.length + bucket2.length >= FINAL_RESULT_LIMIT) break;
    }

    // Assign synthetic scores that preserve final-list order if a downstream
    // consumer re-sorts. Bucket 1 entries sit above any cosine score (≤ 1).
    const final = [];
    for (let i = 0; i < bucket1.length; i++) {
        final.push({tipId: bucket1[i].tipId, score: 1.5 - (i / 1000)});
    }
    for (const r of bucket2) {
        final.push({tipId: r.tipId, score: r.score});
    }
    return final;
};

export {
    resolveBlockFromEvent,
    getBlockHumanText,
    buildPickedBlockQuery,
    categoryFromOpcode,
    getExtensionDisplayName,
    rankTipsForPickedBlock
};
