// Workspace units between adjacent top-level stacks when a tip contains
// more than one script.
const STACK_X_GAP = 280;

// Pixel margin between the viewport edge and inserted blocks.
const VIEWPORT_MARGIN = 30;

// Workspace-unit margin below existing scripts when shifting an insertion
// to avoid overlap.
const BELOW_EXISTING_MARGIN = 40;

/**
 * Choose positions for the top-level blocks of a tip's captured-blocks array
 * before sharing them into a target. Mutates `prepared` in place.
 *
 * Picks a base position from the current workspace scroll so the insertion
 * lands inside the visible viewport. If the workspace already has scripts
 * whose bounding box overlaps that base position, drops the insertion below
 * existing content so nothing is hidden. Multiple top-level stacks are laid
 * out horizontally with a fixed gap.
 * @param {Array} prepared - block objects (mutated in place)
 * @param {object} workspace - ScratchBlocks workspace (may be null)
 * @param {{scrollX:number, scrollY:number, scale:number}} metrics - workspace scroll/scale
 * @param {boolean} isRtl - true for right-to-left locales
 * @returns {{baseX:number, baseY:number, shiftedBelow:boolean}} chosen anchor and whether overlap was avoided
 */
const layoutInsertedBlocks = function (prepared, workspace, metrics, isRtl) {
    const {scrollX, scrollY, scale} = metrics;
    const safeScale = scale || 1;

    const posYpx = -scrollY + VIEWPORT_MARGIN;
    const posXpx = isRtl ? scrollX + VIEWPORT_MARGIN : -scrollX + VIEWPORT_MARGIN;
    let baseX = posXpx / safeScale;
    let baseY = posYpx / safeScale;

    let shiftedBelow = false;
    if (workspace && typeof workspace.getTopBlocks === 'function') {
        const existing = workspace.getTopBlocks(false);
        if (existing && existing.length > 0 && typeof workspace.getBlocksBoundingBox === 'function') {
            const bbox = workspace.getBlocksBoundingBox();
            // bbox is in workspace coords: {top, bottom, left, right}
            const slack = 20;
            const inside =
                baseX >= bbox.left - slack && baseX <= bbox.right + slack &&
                baseY >= bbox.top - slack && baseY <= bbox.bottom + slack;
            if (inside) {
                baseY = bbox.bottom + BELOW_EXISTING_MARGIN;
                baseX = Math.max(baseX, bbox.left);
                shiftedBelow = true;
            }
        }
    }

    const topBlocks = prepared.filter(b => b.topLevel);
    topBlocks.forEach((block, i) => {
        block.x = baseX + (i * STACK_X_GAP);
        block.y = baseY;
    });

    return {baseX, baseY, shiftedBelow};
};

export {
    layoutInsertedBlocks as default,
    STACK_X_GAP,
    VIEWPORT_MARGIN,
    BELOW_EXISTING_MARGIN
};
