/**
 * LayoutEngine — Computes spatial positions for the structure view diagram.
 *
 * Three horizontal zones:
 *   Top:    Events (hat blocks)
 *   Middle: Sprites
 *   Bottom: Shared state (global variables/lists)
 *
 * Sprites use force-directed placement for medium+ projects.
 */

const PADDING = 40;
const EVENT_ZONE_Y = 40;
const SPRITE_ZONE_Y_START = 160;
const SHARED_STATE_ZONE_Y_OFFSET = 180; // below sprite zone center
const SPRITE_NODE_WIDTH = 80;
const SPRITE_NODE_HEIGHT = 90;
const EVENT_BUBBLE_WIDTH = 60;
const EVENT_BUBBLE_HEIGHT = 32;
const GLOBAL_BUBBLE_WIDTH = 90;
const GLOBAL_BUBBLE_HEIGHT = 32;
const MIN_VIEWBOX_WIDTH = 600;
const MIN_VIEWBOX_HEIGHT = 420;

/**
 * Compute layout positions for all elements in the structure view.
 *
 * @param {object} structure - ProjectStructure from analyzeProject()
 * @param {object} options - {width, height} container size hints
 * @returns {object} LayoutResult with positions and viewBox
 */
function computeLayout (structure, options = {}) {
    const {sprites, events, globals, broadcasts} = structure;

    // Determine viewBox dimensions based on content
    const spriteCount = sprites.length;
    const eventCount = events.length;
    const globalCount = globals.length;

    const contentWidth = Math.max(
        MIN_VIEWBOX_WIDTH,
        (eventCount * (EVENT_BUBBLE_WIDTH + 20)) + PADDING * 2,
        (spriteCount * (SPRITE_NODE_WIDTH + 40)) + PADDING * 2,
        (globalCount * (GLOBAL_BUBBLE_WIDTH + 16)) + PADDING * 2
    );

    const spriteZoneCenter = SPRITE_ZONE_Y_START + SPRITE_NODE_HEIGHT / 2;
    const sharedStateY = spriteZoneCenter + SHARED_STATE_ZONE_Y_OFFSET;
    const contentHeight = Math.max(MIN_VIEWBOX_HEIGHT, sharedStateY + 80);

    const viewBox = {
        x: 0,
        y: 0,
        width: contentWidth,
        height: contentHeight
    };

    // --- Layout events across the top ---
    const eventPositions = layoutHorizontalRow(
        events, contentWidth, EVENT_ZONE_Y, EVENT_BUBBLE_WIDTH, 20
    );

    // --- Layout sprites in the middle zone ---
    const spritePositions = layoutSprites(
        sprites, broadcasts, structure.globals, contentWidth, SPRITE_ZONE_Y_START
    );

    // --- Layout shared state across the bottom ---
    const globalPositions = layoutHorizontalRow(
        globals, contentWidth, sharedStateY, GLOBAL_BUBBLE_WIDTH, 16
    );

    return {
        viewBox,
        eventPositions: mapPositions(events, eventPositions, EVENT_BUBBLE_WIDTH, EVENT_BUBBLE_HEIGHT),
        spritePositions: mapPositions(sprites, spritePositions, SPRITE_NODE_WIDTH, SPRITE_NODE_HEIGHT),
        globalPositions: mapPositions(globals, globalPositions, GLOBAL_BUBBLE_WIDTH, GLOBAL_BUBBLE_HEIGHT),
        zones: {
            eventY: EVENT_ZONE_Y,
            spriteY: SPRITE_ZONE_Y_START,
            sharedStateY
        },
        dimensions: {
            spriteNodeWidth: SPRITE_NODE_WIDTH,
            spriteNodeHeight: SPRITE_NODE_HEIGHT,
            eventBubbleWidth: EVENT_BUBBLE_WIDTH,
            eventBubbleHeight: EVENT_BUBBLE_HEIGHT,
            globalBubbleWidth: GLOBAL_BUBBLE_WIDTH,
            globalBubbleHeight: GLOBAL_BUBBLE_HEIGHT
        }
    };
}

/**
 * Lay out items in a horizontal row centered in the available width.
 */
function layoutHorizontalRow (items, totalWidth, y, itemWidth, gap) {
    if (items.length === 0) return [];
    const totalItemsWidth = items.length * itemWidth + (items.length - 1) * gap;
    const startX = Math.max(PADDING, (totalWidth - totalItemsWidth) / 2);

    return items.map((item, i) => ({
        x: startX + i * (itemWidth + gap),
        y
    }));
}

/**
 * Lay out sprites using a simple force-directed approach for interactive projects,
 * or a horizontal row for small projects.
 */
function layoutSprites (sprites, broadcasts, globals, totalWidth, yStart) {
    if (sprites.length === 0) return [];
    if (sprites.length <= 6) {
        return layoutHorizontalRow(sprites, totalWidth, yStart, SPRITE_NODE_WIDTH, 40);
    }

    // Force-directed layout for 7+ sprites
    return forceDirectedLayout(sprites, broadcasts, globals, totalWidth, yStart);
}

/**
 * Simple force-directed layout.
 * Runs a fixed number of iterations to compute stable positions.
 */
function forceDirectedLayout (sprites, broadcasts, globals, totalWidth, yStart) {
    const n = sprites.length;
    const spriteNames = sprites.map(s => s.name);

    // Build adjacency: how many connections between each pair of sprites
    const connections = buildConnectionMatrix(spriteNames, broadcasts, globals);

    // Initialize positions in a grid
    const cols = Math.ceil(Math.sqrt(n));
    const cellW = Math.min(SPRITE_NODE_WIDTH + 50, (totalWidth - PADDING * 2) / cols);
    const cellH = SPRITE_NODE_HEIGHT + 30;

    const positions = sprites.map((s, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        return {
            x: PADDING + col * cellW + cellW / 2 - SPRITE_NODE_WIDTH / 2,
            y: yStart + row * cellH,
            vx: 0,
            vy: 0
        };
    });

    // Run force simulation
    const iterations = 80;
    const repulsionStrength = 3000;
    const attractionStrength = 0.005;
    const damping = 0.9;
    const centerX = totalWidth / 2 - SPRITE_NODE_WIDTH / 2;
    const centerY = yStart + (Math.ceil(n / cols) * cellH) / 2;

    for (let iter = 0; iter < iterations; iter++) {
        const alpha = 1 - (iter / iterations);

        for (let i = 0; i < n; i++) {
            let fx = 0;
            let fy = 0;

            // Repulsion from all other nodes
            for (let j = 0; j < n; j++) {
                if (i === j) continue;
                const dx = positions[i].x - positions[j].x;
                const dy = positions[i].y - positions[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = repulsionStrength / (dist * dist);
                fx += (dx / dist) * force * alpha;
                fy += (dy / dist) * force * alpha;
            }

            // Attraction to connected nodes
            for (let j = 0; j < n; j++) {
                if (i === j) continue;
                const conn = connections[i][j];
                if (conn > 0) {
                    const dx = positions[j].x - positions[i].x;
                    const dy = positions[j].y - positions[i].y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    fx += dx * attractionStrength * conn * alpha;
                    fy += dy * attractionStrength * conn * alpha;
                }
            }

            // Gentle pull toward center
            fx += (centerX - positions[i].x) * 0.001 * alpha;
            fy += (centerY - positions[i].y) * 0.001 * alpha;

            positions[i].vx = (positions[i].vx + fx) * damping;
            positions[i].vy = (positions[i].vy + fy) * damping;
        }

        // Apply velocities
        for (let i = 0; i < n; i++) {
            positions[i].x += positions[i].vx;
            positions[i].y += positions[i].vy;
        }
    }

    // Normalize: ensure all positions are within bounds
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of positions) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    }

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const availW = totalWidth - PADDING * 2 - SPRITE_NODE_WIDTH;
    const rows = Math.ceil(n / cols);
    const availH = Math.max(rows * (SPRITE_NODE_HEIGHT + 20), 150);

    return positions.map(p => ({
        x: PADDING + ((p.x - minX) / rangeX) * availW,
        y: yStart + ((p.y - minY) / rangeY) * availH
    }));
}

/**
 * Build a matrix of connection counts between sprite pairs.
 */
function buildConnectionMatrix (spriteNames, broadcasts, globals) {
    const n = spriteNames.length;
    const nameIndex = new Map(spriteNames.map((name, i) => [name, i]));
    const matrix = Array.from({length: n}, () => new Array(n).fill(0));

    // Broadcast connections
    for (const bc of broadcasts) {
        for (const sender of bc.senders) {
            const si = nameIndex.get(sender.sprite);
            if (si === undefined) continue;
            for (const receiver of bc.receivers) {
                const ri = nameIndex.get(receiver);
                if (ri === undefined || ri === si) continue;
                matrix[si][ri]++;
                matrix[ri][si]++;
            }
        }
    }

    // Shared global variable connections
    for (const g of globals) {
        const allSprites = [...new Set([...g.writers, ...g.readers])];
        for (let i = 0; i < allSprites.length; i++) {
            for (let j = i + 1; j < allSprites.length; j++) {
                const ai = nameIndex.get(allSprites[i]);
                const bi = nameIndex.get(allSprites[j]);
                if (ai !== undefined && bi !== undefined) {
                    matrix[ai][bi]++;
                    matrix[bi][ai]++;
                }
            }
        }
    }

    return matrix;
}

/**
 * Map array of positions to a dict keyed by item id/name.
 */
function mapPositions (items, positions, width, height) {
    const result = {};
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const key = item.id || item.name || `item_${i}`;
        result[key] = {
            x: positions[i] ? positions[i].x : 0,
            y: positions[i] ? positions[i].y : 0,
            width,
            height,
            centerX: (positions[i] ? positions[i].x : 0) + width / 2,
            centerY: (positions[i] ? positions[i].y : 0) + height / 2
        };
    }
    return result;
}

export {computeLayout};
export default computeLayout;
