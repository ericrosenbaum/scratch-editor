# CLAUDE.md — scratch-editor

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`scratch-editor` is an npm workspaces monorepo containing the packages that make up the Scratch editor (Scratch Foundation):

| Package | Path | Build | Tests |
|---------|------|-------|-------|
| `@scratch/scratch-gui` | `packages/scratch-gui` | webpack | Jest + Selenium WebDriver + Playwright |
| `@scratch/scratch-vm` | `packages/scratch-vm` | webpack | TAP |
| `@scratch/scratch-render` | `packages/scratch-render` | webpack | TAP + Playwright Chromium |
| `@scratch/scratch-svg-renderer` | `packages/scratch-svg-renderer` | webpack | TAP |
| `@scratch/task-herder` | `packages/task-herder` | Vite | Vitest |

Node **20.20.0** is required (see `.nvmrc`).

## Common Commands

### Monorepo root

```bash
npm run build          # build all packages (production)
npm test               # test all packages
npm run clean          # remove all build artifacts
```

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
npx playwright test test/playwright/my-test.spec.js
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

## Commit Conventions

This repo enforces conventional commits via commitlint + husky. Always use prefixes like `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`.

```
feat: add new costume picker animation
fix: resolve sprite drag offset on stage resize
chore(deps): update dependency scratch-paint to v4.1.48
```

## Architecture

### GUI ↔ VM Communication

The GUI instantiates a `scratch-vm` VM and passes it down via React props and Redux. The Redux store (`scratchGui.vm`) holds the VM instance. The GUI dispatches Redux actions; the VM fires events back to the GUI via Node `EventEmitter` (`vm.on(...)`). The `EditorState` class (`src/lib/editor-state.tsx`) creates and manages the Redux store.

### Redux State

- Action types: `packages/scratch-gui/src/lib/actions/`
- Reducers: `packages/scratch-gui/src/reducers/`
- The GUI reducer is combined in `packages/scratch-gui/src/reducers/gui.js`
- Action types follow the pattern: `scratch-gui/<reducer-name>/<ACTION_NAME>`

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

### ML / MediaPipe Extensions

Pattern used by `scratch3_face_sensing` (and followed by other on-device ML extensions on feature branches like `hand`, `teachable`):

1. **VM extension** at `packages/scratch-vm/src/extensions/scratch3_<name>/index.js` + `utils.js`
2. **Register** in `packages/scratch-vm/src/extension-support/extension-manager.js` (`builtinExtensions` map)
3. **GUI library entry** in `packages/scratch-gui/src/lib/libraries/extensions/index.jsx` with icons
4. **Icons** at `packages/scratch-gui/src/lib/libraries/extensions/<name>/`
5. **Webpack** copies MediaPipe WASM/model assets from `node_modules/@mediapipe/<package>` to `chunks/mediapipe/<package>` via `CopyWebpackPlugin` in `packages/scratch-gui/webpack.config.js`

ML libraries that webpack bundles (`@tensorflow/tfjs`, `@tensorflow-models/*`) belong in **scratch-gui**'s `package.json`, not scratch-vm, since webpack bundles everything from the GUI's `node_modules`.

**Model loading with local-first, CDN fallback:**

```js
const detectorConfig = {
    runtime: 'mediapipe',
    solutionPath: '/chunks/mediapipe/<package>',
    maxHands: 1
};
createDetector(model, detectorConfig)
    .catch(() => createDetector(model, {
        ...detectorConfig,
        solutionPath: `https://cdn.jsdelivr.net/npm/@mediapipe/<package>@${version}`
    }));
```

**Video frame access from an extension:**

```js
this.runtime.ioDevices.video.enableVideo();  // in getInfo() / constructor
this.runtime.ioDevices.video.getFrame({
    format: Video.FORMAT_IMAGE_DATA,
    dimensions: [480, 360],
    cacheTimeout: this.runtime.currentStepTime
});
```

**Detection smoothing:** use a 5-frame history and only flip the smoothed state when all recent frames agree — prevents flicker.

### Scratch VM / Block Internals

- `vm.runtime.targets` gives all sprites/stage
- Each target has `.blocks._blocks` containing all block definitions
- `target.isStage` distinguishes the stage from sprites
- Block opcodes follow the pattern `category_blockname` (e.g., `motion_movesteps`, `event_whenflagclicked`)
- Each block: `{id, opcode, inputs, fields, next, parent, topLevel, shadow, x, y}`
- Shadow blocks hold literal values (e.g., `math_number` with `fields.NUM.value`)
- Inputs reference blocks by ID: `{name, block, shadow}`
- Insert blocks via `vm.shareBlocksToTarget(blocks, targetId)` then `vm.refreshWorkspace()`
- **Block types**: `BlockType.HAT`, `BlockType.REPORTER`, `BlockType.COMMAND`, `BlockType.BUTTON` from `extension-support/block-type`
- **Scratch coordinates**: Stage is 480×360, center is (0,0), x increases right, y increases up

## Key UI Directories

```
packages/scratch-gui/src/
  components/        # Presentational React components (30+ subdirectories)
  containers/        # Redux-connected container components
  lib/               # Utilities, libraries, layout constants
  reducers/          # Redux state management
```

## Key Conventions

- **VM extensions**: CommonJS (`require`/`module.exports`). Use `format-message` for i18n strings.
- **GUI components**: ES modules with JSX. Use `react-intl` (`FormattedMessage`) for i18n.
- **Redux reducers**: `src/reducers/` — plain JS files exporting a default reducer and named action creators.
- **CSS Modules**: All CSS in scratch-gui uses CSS Modules with PostCSS. Kebab-case in CSS (`.preview-code`) becomes camelCase import in JS (`styles.previewCode`). Class names are locally scoped and hashed at build time. Use `classnames` for conditional CSS class composition.

## CSS Modules Selector Guide

Since CSS class names are hashed at build time (e.g., `stage_stage_1fD7k`):

**Prefer (stable):**
```ts
page.getByRole('tab', {name: /Costumes/i})     // Role + accessible name
page.getByText('Scratch Cat')                    // Visible text
page.getByTestId('stage-canvas')                 // data-testid attribute
```

**Use attribute-contains for CSS classes:**
```ts
page.locator('[class*="stage_stage_"]')          // Partial match — stable across builds
```

**Avoid (fragile):**
```ts
page.locator('.stage_stage_1fD7k')               // Full hashed class — breaks on rebuild
```

**Special case**: Kebab-case in CSS (`.preview-code`) maps to camelCase in JS (`styles.previewCode`), but the actual DOM class contains the original kebab-case string. For selectors: use `[class*="preview-code"]` (kebab-case), NOT `[class*="previewCode"]`.

**Exception**: Blockly elements use non-hashed class names directly: `.scratchCategoryMenuItem`, `[class*="blocklyFlyout"]`.

## Color Modes (Default / Dark / High Contrast)

The editor ships three selectable color modes, managed by the code under `packages/scratch-gui/src/lib/settings/color-mode/`:

- **`default`** — the light mint palette defined by `packages/scratch-gui/src/css/colors.css` (PostCSS `$vars` compiled at build time).
- **`dark`** — the app's default; a comprehensive dark palette defined in `packages/scratch-gui/src/css/colors-dark.css`.
- **`high-contrast`** — the accessibility-focused palette, picked automatically when the OS reports `prefers-contrast: more`.

**How runtime switching works:**
1. `state.scratchGui.settings.colorMode` holds the active mode.
2. `gui.jsx` has a `useEffect` that writes `document.documentElement.setAttribute('data-colormode', colorMode)` whenever it changes.
3. `colors-dark.css` is imported from `gui.css`, wraps all its rules in `:global { }` so CSS Modules doesn't hash them, and targets everything via `[data-colormode="dark"] [class*="…"]` selectors. Mint and high-contrast bypass these rules.
4. Blockly block colors come from `color-mode/<mode>/index.js` and are re-applied by `containers/blocks.jsx` when `colorMode` changes.

**Adding dark support to a new component:**
If your new component uses hardcoded or mint-specific colors, add a block at the bottom of `colors-dark.css` targeting its kebab-case class name:
```css
[data-colormode="dark"] [class*="my-component_container"] {
    background: #1E1E2E;
    color: #E5E5E5;
    border-color: #3A3A4A;
}
```
Dark surfaces use this palette: page bg `#14141A`, panels `#1E1E2E`, inputs/cards `#2A2A3E`, hover/selected `#35354A`, borders `#3A3A4A`, text `#E5E5E5`, secondary text `#A0A0B0`, Scratch purple accent `#855CD6`. Keep Blockly block category hues bright (readable on dark) — only tint the chrome around them.

**Default behavior:** On fresh load with no `scratchtheme` cookie, `persistence.js` returns `dark` (overriding historical default). `prefers-contrast: more` still wins and produces high-contrast.

**Testing:** Mirror `test/playwright/dark-theme.spec.js` — assert `documentElement` `data-colormode`, inspect computed backgrounds on key surfaces, check that block fills stay bright.

## Testing Priorities

**Prefer full end-to-end Playwright tests over unit tests when a feature involves blocks, the stage, or editor UI interactions.** Unit tests are fine for pure utilities and reducers, but anything user-visible should be verified by driving the real editor and observing the real result.

An end-to-end test for an editor feature should:

1. **Drive the editor through UI actions**, not by dispatching Redux actions or mutating VM state directly. Click toolbox categories, drag blocks, open modals, use menu bar buttons, type in fields — the same paths a user would take.
2. **Cover each affected feature comprehensively**: every new block, every new menu item, every new modal control. One "happy path smoke test" is not enough when you've added or changed a surface area with multiple cases.
3. **Validate the result with whichever signal is closest to what the user/developer cares about**:
   - **UI-visible changes** (sprite moved, costume switched, modal opened, block appeared in workspace): take a screenshot after a short settle delay and assert against it, or assert on visible text/roles with `expect(locator).toBeVisible()`.
   - **VM state changes** (variable updated, sprite position, block inserted into a target, extension state): read from `window.vm` via `page.evaluate()` and assert on the values. This is usually more robust than a screenshot when the expected change is a data mutation rather than a visual one.
   - **Both**, when a feature has a UI affordance backed by VM state — assert VM state first (fast, precise) and use a screenshot as a secondary check that the rendering matches.
4. **Use short, explicit waits for settle** when the change is async (block rendering, WebGL redraw, model inference): prefer `await expect(...).toBeVisible()` or `await page.waitForFunction(() => vmCondition)` over fixed `waitForTimeout`. Fall back to a short `waitForTimeout` only when there is no observable condition to wait on (e.g., waiting for a canvas to repaint before screenshotting).

When adding a new extension, new block, or new modal, the PR should land with at least one Playwright test per user-facing case. "I ran `npm start` and clicked around" is not a substitute — if a test didn't run it, a regression can silently ship.

## Playwright Testing

Config: `packages/scratch-gui/playwright.config.js` — tests run against `http://localhost:8601`, auto-starting `npm start` if not already running.

### Running tests

```bash
cd packages/scratch-gui

# Run all Playwright tests
npx playwright test

# Run a single test file
npx playwright test test/playwright/my-test.spec.js

# Run tests matching a pattern
npx playwright test --grep "modal"

# Headed mode (see browser)
npx playwright test --headed

# Interactive UI mode
npx playwright test --ui

# Debug with breakpoints
PWDEBUG=1 npx playwright test
```

If `npm start` is already running, tests reuse it (faster iteration) — start the server manually before running tests to avoid the 120s startup wait each time.

### Inspecting app state from tests

The dev server exposes `window.__scratchStore` (Redux store) and `window.vm` for test inspection:

```js
// Access VM state
await page.waitForFunction(() => {
    const vm = (window as any).vm;
    return vm && vm.runtime && vm.runtime.targets.length > 0;
}, {timeout: 30_000});

const spriteCount = await page.evaluate(() => {
    const vm = (window as any).vm;
    return vm.runtime.targets.filter(t => !t.isStage).length;
});

// Access extension state
// vm.runtime.ext_<extensionId> (e.g., ext_teachableClassifier)
```

### Timeouts

- Global test timeout: 60s. Default `expect` timeout: 10s (set in `playwright.config.js`).
- Override per-assertion: `await expect(locator).toBeVisible({timeout: 30000})`.
- Prefer `expect(...).toBeVisible()` over `waitForSelector` / `waitForTimeout`.

### Redux Store Access via React Fiber

When `window.__scratchStore` is unavailable, access the Redux store via the React fiber tree:

```js
const guiEl = document.querySelector('[class*="gui"]');
const fiberKey = Object.keys(guiEl).find(k => k.startsWith('__reactFiber'));
let fiber = guiEl[fiberKey];
while (fiber) {
    if (fiber.memoizedProps?.store) return fiber.memoizedProps.store;
    fiber = fiber.return;
}
```

### When headless isn't enough — fall back to CDP against a real browser

Some editor behavior cannot be verified reliably in headless Chromium. Symptoms that indicate you've hit this:

- **WebGL/stage rendering differs or is missing** — SwiftShader (software WebGL) produces visibly different pixels than real GPU rendering, so screenshot diffs explode. Canvas-based features (pen trails, video sensing preview, costume effects) may not composite at all.
- **WebGPU-dependent features fail** — on-device LLM inference (`@mediapipe/tasks-genai`), any `navigator.gpu` path. SwiftShader often exposes a WebGPU adapter that then times out during real work (see the 5-min `DEADLINE_EXCEEDED` in the AI Model Infrastructure section).
- **Camera/microphone features behave oddly** even with `--use-fake-device-for-media-stream` — the fake stream is a green test pattern, so ML detectors trained on real imagery (hand-pose, face mesh) produce nonsense output that doesn't match real-use assertions.
- **Test passes in `--headed` locally but fails in CI/headless**, with no Playwright-level explanation. That's the signal.

When you hit one of these, do **not** paper over it by loosening the assertion. Instead:

1. **First try `channel: 'chromium'` with `headless: false`** locally — confirms the feature works in real Chrome so you know what "correct" looks like.
2. **If a display isn't available** (remote dev box, CI, Claude Code iOS), switch that test to drive a real user-side Chrome over CDP instead of launching its own browser:

   ```js
   // Launch real Chrome once, e.g., from a shell:
   //   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
   //     --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-cdp
   //
   // Then in the test:
   import {chromium} from '@playwright/test';

   const browser = await chromium.connectOverCDP('http://localhost:9222');
   const context = browser.contexts()[0];
   const page = await context.newPage();
   await page.goto('http://localhost:8601');
   // ... run real assertions against real GPU / real camera
   ```

3. **Mark these tests separately** (e.g. a `@cdp` tag or a dedicated `playwright.cdp.config.js`) so they're skipped in the default headless run and only executed when a CDP endpoint is available. The default suite should stay green on a plain `npx playwright test`.
4. **Document the reason** in a comment on the test: which capability forced the CDP path (WebGL pixel accuracy, WebGPU, real camera, etc.). This prevents future cleanup from mistakenly reverting it to headless.

The goal is to preserve full end-to-end verification for features that matter visually or depend on real GPU/hardware — never downgrade to "tested the Redux state and called it done" just because headless rendering is unreliable.

## Common Build Problems and Solutions

### Native dependency failures (canvas module)
The `canvas` npm package requires system libraries:

**Linux / CI:**
```bash
sudo apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev libpixman-1-dev libssl-dev
```

**macOS:**
```bash
brew install pkg-config cairo pango libpng jpeg giflib pixman
```

### npm workspace resolution failures
- Always run `npm ci` (or `npm install`) from the **repo root**, never inside individual packages.
- To run a script in a specific package: `npm run start --workspace=packages/scratch-gui`
- If you see "could not resolve dependency" errors, delete `node_modules` at root and all packages, then `npm ci` again.

### Node version mismatch
```bash
nvm use   # reads .nvmrc → 20.20.0
```

### Webpack build failures
Packages must build in dependency order. The workspace list in `package.json` is already ordered correctly:
1. task-herder → 2. scratch-svg-renderer → 3. scratch-render → 4. scratch-vm → 5. scratch-gui

If a single package fails, build it individually: `npm run build --workspace=packages/scratch-render`

### Stale build artifacts
```bash
npm run clean && npm ci && npm run build
```

### `npm install` fails due to `prepare` scripts
- `packages/scratch-gui/package.json`'s `prepare` script downloads a microbit hex from `downloads.scratch.mit.edu`. If that host is unreachable, the whole install fails — even with `--ignore-scripts` at the root, because npm still runs workspace `prepare` scripts.
- Workaround: temporarily remove the `prepare` script from `packages/scratch-gui/package.json`, run `npm install --ignore-scripts`, then restore. Stub `packages/scratch-gui/src/generated/microbit-hex-url.cjs` and `packages/scratch-gui/static/microbit/scratch-microbit.hex` so later builds don't fail.
- The root `package.json` also has a `prepare` script (`husky install`) that fails without the husky binary — use `--ignore-scripts` at the root level too.

### Webpack emits despite TS2307 for `@scratch/scratch-vm`
The `scratch-gui` webpack build emits a TS2307 error because the VM package has no type declarations. Webpack still produces working output in `build/` — the error is non-blocking.

### Browser not installed (Playwright)
```bash
npx playwright install chromium
# On Linux, also install system deps:
npx playwright install-deps chromium
```

## AI Model Infrastructure (feature branches only)

Not present on `lab`/`develop`. Feature branches (`gemma4`, `on-device-ai`, etc.) use an `ai-model-manager.js` singleton under `packages/scratch-gui/src/lib/` for Gemma 3n via `@mediapipe/tasks-genai`. Notes when working in those branches:

- Model URL: `https://storage.googleapis.com/gemma-3n/gemma-3n-E2B-it-int4-Web.litertlm` (~3GB)
- WASM from CDN: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.26/wasm`
- OPFS (Origin Private File System) is used for model caching but is unavailable in headless Chromium — the model manager has a fallback to load directly from URL
- MediaPipe `LlmInference` requires WebGPU; SwiftShader (CPU-emulated) hits a 5-minute internal DEADLINE_EXCEEDED timeout with a 3B param model
- GPU detection: check `navigator.gpu.requestAdapter()` and inspect adapter info for SwiftShader. Use both `adapter.requestAdapterInfo()` (newer API) and `adapter.info` (older Chromium fallback)
- The `@mediapipe/tasks-genai` package may disappear after npm operations — reinstall with `npm install --no-save @mediapipe/tasks-genai@0.10.26`

## Playwright Gotchas

- **`workers: 1`** is required in `playwright.config.js` when tests patch shared build artifacts (e.g., `gui.js`)
- **WebGPU flags** for Chromium: `--enable-unsafe-webgpu`, `--enable-features=Vulkan`, `--use-vulkan=swiftshader`, `--enable-gpu-rasterization`, `--disable-gpu-sandbox`
- **`test.skip()`**: Must be called inside each test callback, not at describe level
- **`route.fulfill` has a 2GB limit** — cannot serve files >2GB via Playwright route interception. Use a local HTTP server instead.
- **`route.continue` protocol mismatch**: Cannot redirect HTTPS to HTTP. Use `route.fulfill` or patch URLs in the built source.
- **Dynamic port allocation**: Use `server.listen(0)` to avoid EADDRINUSE conflicts between test runs
- **Menu bar buttons must use `<img>` tags, not inline `<svg>`** — inline SVG elements render as invisible/zero-size. Existing buttons use `<img className={styles.helpIcon} src={importedSvg} />`.
- **Browser version mismatches**: Playwright releases are tightly coupled to specific chromium builds. If tests fail with "Executable doesn't exist", reinstall with `npx playwright install chromium`. Symlinking between version directories can work only if the internal naming matches (e.g., `chrome-linux/headless_shell` vs `chrome-headless-shell-linux64/chrome-headless-shell`).
- **Selector ambiguity with `.first()`** — `[class*="header"].first()` may match the menu bar before a modal header. Prefer text-based or structural selectors like `page.locator('text=Modal Title').locator('..')`.

### Useful scratch-gui selectors for Playwright

- Extension button: `[class*="extension-button-container"]`
- Extension library modal: `[class*="modal_modal-overlay"]`
- Library items (disambiguate with tag): `button[class*="library-item"]:has-text("Name")`
- Block category: `[class*="scratchCategoryId-<extensionId>"]`
- Sprite selector: `[class*="sprite-selector"]`
- Blockly elements use non-hashed class names directly: `.scratchCategoryMenuItem`, `[class*="blocklyFlyout"]`

## Front-End Design

When working on scratch-gui UI components:

- After making any visual/UI change, take a screenshot and verify it looks correct
- Match existing Scratch design language: rounded corners, consistent color palette, accessible contrast ratios
- Check neighboring components for spacing, font sizes, and interaction patterns before inventing new ones
- Components live in `packages/scratch-gui/src/components/` (each in its own directory with `.jsx` and `.css`)
- Containers (Redux-connected) live in `packages/scratch-gui/src/containers/`
