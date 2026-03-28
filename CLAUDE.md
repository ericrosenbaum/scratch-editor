# Scratch Editor — Lessons Learned

## Repository Structure

- Monorepo with key packages: `scratch-gui` (React+Redux UI), `scratch-vm` (execution engine)
- Node modules may be hoisted to repo root — always check both `packages/*/node_modules/` and root `node_modules/`

## CSS Modules Gotchas

- CSS class names are mangled by CSS Modules
- Kebab-case in CSS (`.preview-code`) becomes camelCase import in JS (`styles.previewCode`), but the actual DOM class contains the original kebab-case string (`preview-code`)
- For Playwright selectors: use `[class*="preview-code"]` (kebab-case from CSS file), NOT `[class*="previewCode"]`
- Exception: if the CSS class itself is already camelCase (`.errorText`), then `[class*="errorText"]` works

## Redux Store Access in Tests

Access the Redux store via the React fiber tree:

```js
const guiEl = document.querySelector('[class*="gui"]');
const fiberKey = Object.keys(guiEl).find(k => k.startsWith('__reactFiber'));
let fiber = guiEl[fiberKey];
while (fiber) {
    if (fiber.memoizedProps?.store) return fiber.memoizedProps.store;
    fiber = fiber.return;
}
```

Action types follow the pattern: `scratch-gui/<reducer-name>/<ACTION_NAME>`

## Block Format (VM Internal)

- Each block: `{id, opcode, inputs, fields, next, parent, topLevel, shadow, x, y}`
- Shadow blocks hold literal values (e.g., `math_number` with `fields.NUM.value`)
- Inputs reference blocks by ID: `{name, block, shadow}`
- Insert blocks via `vm.shareBlocksToTarget(blocks, targetId)` then `vm.refreshWorkspace()`

## AI Model Infrastructure

- `packages/scratch-gui/src/lib/ai-model-manager.js` is the singleton for Gemma 3n via `@mediapipe/tasks-genai`
- Model URL: `https://storage.googleapis.com/gemma-3n/gemma-3n-E2B-it-int4-Web.litertlm` (~3GB)
- WASM from CDN: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.26/wasm`
- OPFS (Origin Private File System) is used for model caching but is unavailable in headless Chromium — the model manager has a fallback to load directly from URL
- MediaPipe LlmInference requires WebGPU; SwiftShader (CPU-emulated) hits a 5-minute internal DEADLINE_EXCEEDED timeout with a 3B param model

## Playwright Testing Lessons

- **Browser version**: Must match `@playwright/test` version to installed chromium. Check `npx playwright --version` and installed browser revisions.
- **`workers: 1`** is required in `playwright.config.js` when tests patch shared build artifacts (e.g., `gui.js`)
- **WebGPU flags** for Chromium: `--enable-unsafe-webgpu`, `--enable-features=Vulkan`, `--use-vulkan=swiftshader`, `--enable-gpu-rasterization`, `--disable-gpu-sandbox`
- **GPU detection**: Check `navigator.gpu.requestAdapter()` and inspect adapter info for SwiftShader. Use both `adapter.requestAdapterInfo()` (newer API) and `adapter.info` (older Chromium fallback).
- **`test.skip()`**: Must be called inside each test callback, not at describe level
- **`route.fulfill` has a 2GB limit** — cannot serve files >2GB via Playwright route interception. Use a local HTTP server instead.
- **`route.continue` protocol mismatch**: Cannot redirect HTTPS to HTTP. Use `route.fulfill` or patch URLs in the built source.
- **Dynamic port allocation**: Use `server.listen(0)` to avoid EADDRINUSE conflicts between test runs
- **CSS selector pitfalls**: `[class*="header"].first()` may match the menu bar before a modal header. Prefer text-based or structural selectors like `page.locator('text=Modal Title').locator('..')`.

## Build System

- `npm run build` in `packages/scratch-gui/` produces a `build/` directory with `gui.js`
- Playwright tests serve from this build directory via a static file server
- The `@mediapipe/tasks-genai` package may disappear after npm operations — reinstall with `npm install --no-save @mediapipe/tasks-genai@0.10.26`

## Testing Commands

```sh
# Run all Playwright tests
cd packages/scratch-gui && npx playwright test

# Run a specific test file
npx playwright test test/playwright/ai-code-suggestions.spec.js

# Run with visible browser
npx playwright test --headed
```
