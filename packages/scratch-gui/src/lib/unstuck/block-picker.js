/**
 * Resolves DOM-click events to picked Scratch blocks for the Tips block-picker.
 *
 * Symmetric with pointer-actions.js (opcode → DOM element):
 * this module is the inverse direction (DOM element → opcode + human text).
 */
import * as ScratchBlocks from 'scratch-blocks';

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
 * Build the visible / search query for a picked block.
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
    return `How do I use the ${text} block?`;
};

// Re-ranking constants. Boosts are additive on top of cosine-similarity
// scores (0–1) returned by the embedding provider, so a tip that matches
// the picked block on all signals can outscore a strong embedding-only hit.
const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'with', 'by', 'for'
]);
const TITLE_BOOST = 0.25;
const CODE_BOOST = 0.25;
const POINTER_BOOST = 0.20;
const DESC_BOOST = 0.10;
const TAG_BOOST = 0.05;

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

/**
 * Extract content tokens from the picked block, used for case-insensitive
 * substring matching against tip titles and descriptions.
 * @param {{opcode: string, humanText: string}} picked
 * @returns {string[]} lowercased tokens, ≥3 chars, not numbers, not stopwords
 */
const getMatchTokens = function (picked) {
    const source = (picked && picked.humanText && picked.humanText.trim()) ||
        ((picked && picked.opcode) || '').replace(/^[^_]+_/, '').replace(/_/g, ' ');
    return source.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
};

/**
 * Compute the deterministic boost for one tip given a picked block.
 * @param {object} tip - A tip from the tips library
 * @param {{opcode: string}} picked - The picked block info
 * @param {string[]} tokens - Pre-computed match tokens
 * @param {string} category - Pre-computed category prefix
 * @returns {number} Sum of applicable boosts, 0 if no signals match
 */
const scoreTipForPickedBlock = function (tip, picked, tokens, category) {
    if (!tip || !picked) return 0;
    let boost = 0;
    const opcode = picked.opcode;

    if (tip.title && tokens.some(tok => tip.title.toLowerCase().includes(tok))) {
        boost += TITLE_BOOST;
    }
    if (tip._capturedBlocks && tip._capturedBlocks.some(b => b.opcode === opcode)) {
        boost += CODE_BOOST;
    }
    if (tip.pointers && tip.pointers.some(p => p.blockOpcode === opcode)) {
        boost += POINTER_BOOST;
    }
    if (tip.text && tokens.some(tok => tip.text.toLowerCase().includes(tok))) {
        boost += DESC_BOOST;
    }
    if (category && tip.tags && tip.tags.includes(category)) {
        boost += TAG_BOOST;
    }
    return boost;
};

/**
 * Re-rank tip search results to bias toward tips that explicitly reference
 * the picked block. Merges the embedding-ranked results with deterministic
 * matches scanned across the full tip library (hybrid mode): tips with
 * strong block-specific signals can surface even if they weren't in the
 * embedding top-10.
 *
 * @param {Array<{tipId: string, score: number}>} embeddingResults
 * @param {Object<string, object>} allTips - tip id → tip
 * @param {{opcode: string, humanText: string}} picked
 * @returns {Array<{tipId: string, score: number}>} Top-10 final ranking
 */
const applyPickedBlockBoost = function (embeddingResults, allTips, picked) {
    if (!picked) return embeddingResults;
    const tokens = getMatchTokens(picked);
    const category = categoryFromOpcode(picked.opcode);

    const scoreMap = new Map();
    for (const r of embeddingResults || []) {
        scoreMap.set(r.tipId, {tipId: r.tipId, embedding: r.score, boost: 0});
    }
    if (allTips) {
        for (const tipId in allTips) {
            const boost = scoreTipForPickedBlock(allTips[tipId], picked, tokens, category);
            if (boost <= 0) continue;
            const existing = scoreMap.get(tipId);
            if (existing) {
                existing.boost = boost;
            } else {
                scoreMap.set(tipId, {tipId, embedding: 0, boost});
            }
        }
    }

    return Array.from(scoreMap.values())
        .map(e => ({tipId: e.tipId, score: e.embedding + e.boost}))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
};

export {
    resolveBlockFromEvent,
    getBlockHumanText,
    buildPickedBlockQuery,
    categoryFromOpcode,
    getMatchTokens,
    scoreTipForPickedBlock,
    applyPickedBlockBoost
};
