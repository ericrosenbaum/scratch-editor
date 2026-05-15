// Shared horizontal-sizing constants for the editing grids. Keeping them in
// one place avoids the piano-roll, drum-grid, and velocity-strip drifting out
// of pixel-alignment with each other.

// Left gutter width for pitch / track labels. Must be the same in every grid
// so the time-step columns line up across them.
export const LABEL_W = 32;

// Bounds on the computed per-step column width. The default 32-step song
// should fit without a horizontal scrollbar at typical viewport widths.
// 14px keeps notes large enough to click reliably; 26px caps growth so a
// very short song doesn't blow up cells to a comic size.
export const MIN_CELL_W = 14;
export const MAX_CELL_W = 26;
export const DEFAULT_CELL_W = 22;

/**
 * Pick a per-step column width for a grid given the visible width of the
 * scroll container and how many steps the song is. Returns DEFAULT_CELL_W
 * until the container has measured non-zero width (first render).
 *
 * @param {number} containerWidth - clientWidth of the grid's scroll container
 * @param {number} lengthSteps - song length in steps
 * @returns {number} CELL_W in CSS pixels
 */
export const computeCellWidth = (containerWidth, lengthSteps) => {
    if (!containerWidth || !lengthSteps) return DEFAULT_CELL_W;
    const available = containerWidth - LABEL_W;
    if (available <= 0) return DEFAULT_CELL_W;
    const ideal = Math.floor(available / lengthSteps);
    return Math.max(MIN_CELL_W, Math.min(MAX_CELL_W, ideal));
};
