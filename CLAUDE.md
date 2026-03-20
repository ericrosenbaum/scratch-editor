# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

`scratch-editor` is an npm workspaces monorepo containing the packages that make up the Scratch editor:

- **`packages/scratch-gui`** – React/Redux UI, extension library modal, all modals, webpack dev server
- **`packages/scratch-vm`** – Virtual machine that executes Scratch projects and hosts extensions
- **`packages/scratch-render`** – WebGL renderer for the stage
- **`packages/scratch-svg-renderer`** – SVG processing for costumes/backdrops
- **`packages/task-herder`** – Build tooling helper

## Common Commands

All commands should be run from within the relevant package directory unless noted.

### scratch-gui

```bash
cd packages/scratch-gui
npm start              # webpack-dev-server on port 8601
npm run build          # full production build (clean + dev + dist + dist-standalone)
npm run test:unit      # Jest unit tests
npm run test:integration  # Jest integration tests
npm run test:lint      # ESLint
npm run test           # lint + unit + integration
npm run test:playwright   # Playwright e2e tests (requires server running or auto-starts it)
```

Run a single Jest test file:
```bash
npx jest test/unit/my-test.js
```

Run a single Playwright test:
```bash
npx playwright test test/playwright/teachable-machine.spec.js
```

### scratch-vm

```bash
cd packages/scratch-vm
npm run tap            # run all tap tests
npm run tap:unit       # unit tests only
npm run tap:integration  # integration tests only
npm run lint           # ESLint + format-message lint
npm run test           # lint + tap
```

### Monorepo root

```bash
npm run build          # build all packages
npm test               # test all packages
```

## Architecture

### GUI ↔ VM Communication

The GUI instantiates a `scratch-vm` VM and passes it down via React props and Redux. The Redux store (`scratchGui.vm`) holds the VM instance. The GUI dispatches Redux actions; the VM fires events back to the GUI via Node `EventEmitter` (`vm.on(...)`). The `EditorState` class (`src/lib/editor-state.tsx`) creates and manages the Redux store.

### Extension System

**Adding a new extension requires changes in two places:**

1. **VM** (`packages/scratch-vm/src/extension-support/extension-manager.js`): Add an entry to `builtinExtensions` map with the extension ID as key and a `require()` factory as value.

2. **GUI** (`packages/scratch-gui/src/lib/libraries/extensions/index.jsx`): Add an object to the exported array with `name`, `extensionId`, `iconURL`, `insetIconURL`, `description`, and `tags`.

Each extension lives in `packages/scratch-vm/src/extensions/scratch3_<name>/index.js` and exports a class with `getInfo()` returning block metadata, plus block implementation methods.

### Video/Camera Extensions

Extensions that use the webcam (`videoSensing`, `faceSensing`, `teachableClassifier`) use `packages/scratch-vm/src/io/video.js` (the VM's IO layer). The GUI side has `src/lib/video/` for camera access in modals. The Playwright config passes `--use-fake-device-for-media-stream` and `--use-fake-ui-for-media-stream` to Chromium so camera tests run headlessly without real hardware.

### Modal Pattern

Modals are registered in `packages/scratch-gui/src/reducers/modals.js` with `OPEN_MODAL`/`CLOSE_MODAL` actions. Each modal needs:
- A constant key (e.g., `MODAL_TEACHABLE_MACHINE = 'teachableMachineModal'`)
- Open/close action creators exported from `modals.js`
- A container component in `src/containers/`
- A presentational component in `src/components/`
- Wired into `src/components/gui/gui.jsx`

### Extension-to-Modal Communication

Extensions register themselves on the runtime so the GUI can access their state:
```js
this.runtime.ext_myExtension = this;
```
The modal container reads `props.vm.runtime.ext_myExtension` directly to get/set extension state.

### TensorFlow Extensions (teachableClassifier)

The `scratch3_teachable_classifier` extension uses MobileNet + KNN classifier (TF.js) loaded lazily on first use. The ML libraries (`@tensorflow/tfjs`, `@tensorflow-models/mobilenet`, `@tensorflow-models/knn-classifier`) are declared as dependencies in **scratch-gui**'s `package.json` (not scratch-vm), since webpack bundles everything from the GUI's `node_modules`.

### Playwright Tests

Config: `packages/scratch-gui/playwright.config.js` — tests run against `http://localhost:8601`, auto-starting `npm start` if not already running. Camera permissions are pre-granted. Test helpers in `test/playwright/helpers/scratch-helpers.js` expose `openExtensionLibrary`, `addExtension`, `getTeachableClassifierState`, `setPredictedLabel`. The dev server exposes `window.__scratchStore` (Redux store) for test inspection.

**Running tests efficiently:**
- Run a single test file: `npx playwright test test/playwright/teachable-machine.spec.js`
- Run tests matching a pattern: `npx playwright test --grep "modal"`
- Run headed (see browser): `npx playwright test --headed`
- Interactive UI mode: `npx playwright test --ui`
- Debug with breakpoints: `PWDEBUG=1 npx playwright test`
- If `npm start` is already running, tests reuse it (faster iteration) — start the server manually before running tests to avoid the 120s startup wait each time.

**Inspecting app state from tests:**
- Access the Redux store and VM via `window.__scratchStore` (only in non-production/dev builds):
  ```js
  const vm = await page.evaluate(() => {
      const store = window.__scratchStore;
      return store?.getState().scratchGui?.vm;
  });
  ```
- Access extension state via `vm.runtime.ext_<extensionId>` (e.g., `ext_teachableClassifier`).
- Catch JS errors by registering `page.on('pageerror', err => errors.push(err.message))` before navigation.

**Selector tips (CSS Modules):**
- Class names are hashed at build time — always use attribute-contains selectors: `[class*="modal-content"]`.
- Avoid strict-mode violations from nested elements sharing a class: prefer `button[class*="library-item"]:has-text("Name")` over `.library-item:has-text("Name")`.
- Blockly elements use non-hashed class names directly: `.scratchCategoryMenuItem`, `[class*="blocklyFlyout"]`.

**Timeouts:**
- Global test timeout: 60 s. Default `expect` timeout: 10 s (both set in `playwright.config.js`).
- Override per-assertion: `await expect(locator).toBeVisible({timeout: 30000})`.
- Prefer `waitForSelector` / `waitForTimeout` sparingly — lean on `expect(...).toBeVisible()` assertions instead.

### CSS Modules

All CSS in scratch-gui uses CSS Modules. Class names in JSX use `styles.foo` and are referenced in Playwright/tests with the attribute selector `[class*="foo"]` since the compiled class name includes a hash.

## Key Conventions

- **VM extensions**: CommonJS (`require`/`module.exports`). Use `format-message` for i18n strings.
- **GUI components**: ES modules with JSX. Use `react-intl` (`FormattedMessage`) for i18n.
- **Redux reducers**: `src/reducers/` — plain JS files exporting a default reducer and named action creators.
- **Block types**: `BlockType.HAT`, `BlockType.REPORTER`, `BlockType.COMMAND`, `BlockType.BUTTON` from `extension-support/block-type`.
- **Scratch coordinates**: Stage is 480×360, center is (0,0), x increases right, y increases up.
