/**
 * ProcessSummarizer — heuristic chunk detection, classification, and label generation.
 *
 * Groups a session's events into chunks based on activity gaps, sprite switches,
 * mode switches, and test cycle boundaries. Classifies each chunk and generates
 * human-readable labels.
 */

import {generateId} from './snapshot-utils';
import {getBlockName} from './block-summary';

const CHUNK_GAP_MS = 30000; // 30s gap → chunk boundary
const SPRITE_SWITCH_GAP_MS = 5000; // 5s gap + sprite change → boundary

/**
 * Detect chunk boundaries in a list of events and return Chunk objects.
 * @param {string} sessionId
 * @param {Array} events — sorted by timestamp
 * @returns {Array} chunks
 */
const detectChunks = (sessionId, events) => {
    // Filter out snapshot events — they're not user actions
    const actionEvents = events.filter(e =>
        e.type !== 'stage_snapshot' && e.type !== 'project_snapshot'
    );

    if (actionEvents.length === 0) return [];

    const chunks = [];
    let currentChunkEvents = [actionEvents[0]];

    for (let i = 1; i < actionEvents.length; i++) {
        const prev = actionEvents[i - 1];
        const curr = actionEvents[i];
        const gap = curr.timestamp - prev.timestamp;

        let shouldSplit = false;

        // Activity gap > 30s
        if (gap > CHUNK_GAP_MS) {
            shouldSplit = true;
        }

        // Sprite switch with gap > 5s
        if (!shouldSplit && gap > SPRITE_SWITCH_GAP_MS &&
            prev.sprite && curr.sprite && prev.sprite !== curr.sprite) {
            shouldSplit = true;
        }

        // Mode switch (block events → costume events or vice versa)
        if (!shouldSplit && gap > SPRITE_SWITCH_GAP_MS) {
            const prevCategory = getEventCategory(prev.type);
            const currCategory = getEventCategory(curr.type);
            if (prevCategory !== currCategory && prevCategory !== 'execution' && currCategory !== 'execution') {
                shouldSplit = true;
            }
        }

        // Test cycle boundary: execution_stopped followed by block editing
        if (!shouldSplit &&
            prev.type === 'execution_stopped' &&
            curr.type === 'blocks_changed') {
            shouldSplit = true;
        }

        if (shouldSplit) {
            chunks.push(buildChunk(sessionId, currentChunkEvents, events));
            currentChunkEvents = [curr];
        } else {
            currentChunkEvents.push(curr);
        }
    }

    // Final chunk
    if (currentChunkEvents.length > 0) {
        chunks.push(buildChunk(sessionId, currentChunkEvents, events));
    }

    return chunks;
};

const getEventCategory = type => {
    if (type.startsWith('blocks_')) return 'blocks';
    if (type.startsWith('costume_') || type.startsWith('backdrop_')) return 'costumes';
    if (type.startsWith('sound_')) return 'sounds';
    if (type.startsWith('sprite_')) return 'sprites';
    if (type.startsWith('variable_') || type.startsWith('comment_')) return 'blocks';
    if (type === 'extension_added') return 'blocks';
    if (type === 'tab_switched') return 'other';
    if (type === 'execution_started' || type === 'execution_stopped' ||
        type === 'ui_green_flag' || type === 'ui_stop_button' || type === 'ui_stack_click') {
        return 'execution';
    }
    return 'other';
};

const buildChunk = (sessionId, chunkEvents, allEvents) => {
    const classification = classifyChunk(chunkEvents);
    const label = generateLabel(classification, chunkEvents);

    // Find nearest stage snapshot
    const midTime = (chunkEvents[0].timestamp + chunkEvents[chunkEvents.length - 1].timestamp) / 2;
    const nearestSnapshot = allEvents
        .filter(e => e.type === 'stage_snapshot' && e.thumbnail)
        .reduce((closest, e) => {
            if (!closest) return e;
            return Math.abs(e.timestamp - midTime) < Math.abs(closest.timestamp - midTime) ? e : closest;
        }, null);

    return {
        id: generateId(),
        sessionId,
        startTime: chunkEvents[0].timestamp,
        endTime: chunkEvents[chunkEvents.length - 1].timestamp,
        eventIds: chunkEvents.map(e => e.id),
        stageSnapshot: nearestSnapshot ? nearestSnapshot.thumbnail : null,
        classification,
        heuristicLabel: label,
        aiLabel: null,
        aiDescription: null
    };
};

/**
 * Classify a chunk based on event type distribution.
 * @param {Array} events
 * @returns {string} classification
 */
const classifyChunk = events => {
    const counts = {blocks: 0, costumes: 0, sounds: 0, execution: 0, sprites: 0};

    for (const e of events) {
        if (e.type.startsWith('blocks_') || e.type.startsWith('variable_') ||
            e.type.startsWith('comment_') || e.type === 'extension_added') counts.blocks++;
        if (e.type.startsWith('costume_') || e.type.startsWith('backdrop_')) counts.costumes++;
        if (e.type.startsWith('sound_')) counts.sounds++;
        if (e.type === 'execution_started' || e.type === 'execution_stopped') counts.execution++;
        if (e.type.startsWith('sprite_')) counts.sprites++;
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return 'exploring';

    // High execution ratio with few block changes = testing
    if (counts.execution > total * 0.4) return 'testing';

    // Net blocks deleted > blocks added = debugging/refactoring
    const netBlocks = events
        .filter(e => e.type === 'blocks_changed')
        .reduce((n, e) => n + (e.data.blockCount || 0), 0);
    if (netBlocks < 0) return 'debugging';

    // Rapid test cycles (many short execution runs) = debugging
    const execDurations = events
        .filter(e => e.type === 'execution_stopped')
        .map(e => e.data.durationMs);
    if (execDurations.length >= 3 && execDurations.every(d => d < 5000)) return 'debugging';

    // Dominant activity
    if (counts.costumes > counts.blocks && counts.costumes > counts.sounds) return 'drawing';
    if (counts.sounds > counts.blocks) return 'sound';
    if (counts.blocks > 0) return 'coding';
    if (counts.sprites > 0) return 'exploring';

    return 'exploring';
};

/**
 * Generate a human-readable label for a chunk.
 * @param {string} classification
 * @param {Array} events
 * @returns {string}
 */
const generateLabel = (classification, events) => {
    const sprites = [...new Set(events.map(e => e.sprite).filter(Boolean))];
    const spriteStr = sprites.length === 0 ? 'project' :
        sprites.length === 1 ? sprites[0] :
            `${sprites.length} sprites`;

    switch (classification) {
    case 'coding': {
        // Collect opcodes from rich block events for a better label
        const blockEvents = events.filter(e => e.type === 'blocks_changed');
        const allOpcodes = blockEvents
            .flatMap(e => (e.data.opcodes || []))
            .filter((v, i, a) => a.indexOf(v) === i);
        const netBlocks = blockEvents
            .reduce((n, e) => n + Math.abs(e.data.blockCount || 0), 0);

        if (allOpcodes.length > 0 && allOpcodes.length <= 3) {
            const names = allOpcodes.map(o => getBlockName(o));
            return `Coded "${names.join('", "')}" on ${spriteStr}`;
        }
        return `Added ${netBlocks} block${netBlocks !== 1 ? 's' : ''} to ${spriteStr}`;
    }
    case 'drawing': {
        const edits = events.filter(e =>
            e.type === 'costume_edited' || e.type === 'backdrop_edited'
        ).length;
        const adds = events.filter(e =>
            e.type === 'costume_added' || e.type === 'backdrop_added'
        ).length;
        if (adds > 0) return `Added ${adds} costume${adds > 1 ? 's' : ''} to ${spriteStr}`;
        return `Edited costumes on ${spriteStr}`;
    }
    case 'testing': {
        const runs = events.filter(e => e.type === 'execution_started').length;
        return `Tested project ${runs} time${runs !== 1 ? 's' : ''}`;
    }
    case 'debugging':
        return `Debugging ${spriteStr}`;
    case 'sound': {
        const soundAdds = events.filter(e => e.type === 'sound_added').length;
        if (soundAdds > 0) return `Added ${soundAdds} sound${soundAdds > 1 ? 's' : ''} to ${spriteStr}`;
        return `Worked on sounds for ${spriteStr}`;
    }
    default:
        return `Worked on ${spriteStr}`;
    }
};

/**
 * Generate a session-level summary label.
 * @param {Array} chunks
 * @param {Array} events
 * @returns {string}
 */
const generateSessionLabel = (chunks, events) => {
    if (chunks.length === 0) return 'Empty session';

    const classificationCounts = {};
    for (const chunk of chunks) {
        classificationCounts[chunk.classification] =
            (classificationCounts[chunk.classification] || 0) + 1;
    }

    const dominant = Object.entries(classificationCounts)
        .sort((a, b) => b[1] - a[1])[0][0];

    const sprites = [...new Set(events.map(e => e.sprite).filter(Boolean))];
    const spriteStr = sprites.length === 0 ? 'project' :
        sprites.length <= 2 ? sprites.join(' and ') :
            `${sprites.length} sprites`;

    switch (dominant) {
    case 'coding':
        return `Coded on ${spriteStr}`;
    case 'drawing':
        return `Drew costumes for ${spriteStr}`;
    case 'testing':
        return `Tested ${spriteStr}`;
    case 'debugging':
        return `Debugged ${spriteStr}`;
    case 'sound':
        return `Added sounds to ${spriteStr}`;
    default:
        return `Worked on ${spriteStr}`;
    }
};

export {
    detectChunks,
    classifyChunk,
    generateLabel,
    generateSessionLabel,
    getEventCategory
};
