# CLAUDE.md — Scratch Editor

## Project Overview

This is a monorepo for the Scratch editor, using Lerna to manage packages under `packages/`. The main GUI package is `packages/scratch-gui`.

## Build & Dev

- `npm install` at root to bootstrap all packages
- `npm start` runs webpack-dev-server on port 8601
- Playwright tests: `npx playwright test` from repo root (install browsers first with `npx playwright install chromium`)

## Lessons Learned

### Menu bar buttons must use `<img>` tags, not inline `<svg>`

Inline SVG elements in the menu bar render as invisible/zero-size even with explicit `width`/`height` attributes. The existing buttons (Tutorials, Debug) all use `<img className={styles.helpIcon} src={importedSvg} />`. Follow this pattern — create an external `.svg` file and import it.

**Location:** `packages/scratch-gui/src/components/menu-bar/menu-bar.jsx`

### Adding a modal/overlay to the GUI

To add a new modal:
1. Create component in `packages/scratch-gui/src/components/<name>/`
2. Wire state through Redux: add action type, reducer case, and action creator
3. Connect in `packages/scratch-gui/src/containers/gui.jsx` (mapStateToProps + mapDispatchToProps)
4. Render conditionally in `packages/scratch-gui/src/components/gui/gui.jsx`
5. Add the toggle button in `menu-bar.jsx` following existing patterns

### Redux state lives in `scratch-gui`

- Action types: `packages/scratch-gui/src/lib/actions/`
- Reducers: `packages/scratch-gui/src/reducers/`
- The GUI reducer is combined in `packages/scratch-gui/src/reducers/gui.js`

### CSS Modules

All CSS files use CSS Modules (camelCase in JS, kebab-case in CSS). Class names are accessed via `styles.className` after importing the `.css` file.

### Scratch VM / Block Utilities

- `vm.runtime.targets` gives all sprites/stage
- Each target has `.blocks._blocks` containing all block definitions
- `target.isStage` distinguishes the stage from sprites
- Block opcodes follow the pattern `category_blockname` (e.g., `motion_movesteps`, `event_whenflagclicked`)

### Testing

- Playwright config is at `playwright.config.js` in repo root
- Tests go in `tests/` directory
- The dev server must be running for integration tests (`npm start`)
- Use `page.waitForSelector` for elements that load asynchronously
