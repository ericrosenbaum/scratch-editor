# Lessons Learned: Hand Sensing Extension

## Build System

### npm install in this monorepo is fragile
- The `prepare` script in `packages/scratch-gui/package.json` downloads a microbit hex file from `downloads.scratch.mit.edu`. If that host is unreachable, `npm install` fails entirely — even with `--ignore-scripts`, because npm still runs workspace `prepare` scripts.
- **Workaround**: Temporarily remove the `prepare` script from `packages/scratch-gui/package.json`, run `npm install --ignore-scripts`, then restore it. You also need to create stub files at `packages/scratch-gui/src/generated/microbit-hex-url.cjs` and `packages/scratch-gui/static/microbit/scratch-microbit.hex` so the build doesn't fail when prepare hasn't run.
- The root `package.json` also has a `prepare` script (`husky install`) that fails without the husky binary. Use `--ignore-scripts` at the root level too.

### Adding new npm packages when install is broken
If `npm install` fails due to network issues with non-registry hosts, you can manually install packages:
```bash
npm pack @some/package@version --pack-destination /tmp
mkdir -p node_modules/@some/package
tar xzf /tmp/some-package-version.tgz -C node_modules/@some/package --strip-components=1
```

### Webpack build produces output despite TS errors
The `scratch-gui` webpack build emits a TS2307 error for `@scratch/scratch-vm` types (the VM package has no type declarations). Despite this error, webpack still produces working output in `build/`. The error is non-blocking.

### MediaPipe assets must be copied via webpack
Extensions using MediaPipe load WASM/model files at runtime from a `solutionPath`. These files must be copied from `node_modules/@mediapipe/<package>` to `chunks/mediapipe/<package>` via `CopyWebpackPlugin` in `packages/scratch-gui/webpack.config.js`.

## Extension Architecture

### Pattern for on-device ML extensions
Follow `scratch3_face_sensing` exactly:
1. **VM extension** at `packages/scratch-vm/src/extensions/scratch3_<name>/index.js` + `utils.js`
2. **Register** in `packages/scratch-vm/src/extension-support/extension-manager.js` (`builtinExtensions` map)
3. **GUI library entry** in `packages/scratch-gui/src/lib/libraries/extensions/index.jsx` with icons
4. **Icons** at `packages/scratch-gui/src/lib/libraries/extensions/<name>/`
5. **Webpack** copy of MediaPipe assets

### ML model loading pattern
```js
const detectorConfig = {
    runtime: 'mediapipe',
    solutionPath: '/chunks/mediapipe/<package>',  // local first
    maxHands: 1  // or maxFaces, etc.
};
createDetector(model, detectorConfig)
    .catch(() => {
        // CDN fallback
        return createDetector(model, {
            ...detectorConfig,
            solutionPath: `https://cdn.jsdelivr.net/npm/@mediapipe/<package>@${version}`
        });
    });
```

### Video frame access
All camera-based extensions get frames via:
```js
this.runtime.ioDevices.video.getFrame({
    format: Video.FORMAT_IMAGE_DATA,
    dimensions: [480, 360],
    cacheTimeout: this.runtime.currentStepTime
});
```
Call `this.runtime.ioDevices.video.enableVideo()` in `getInfo()`.

### Detection smoothing
Use a 5-frame history array. Only flip the smoothed state when ALL recent frames agree. This prevents flicker.

### Hand-pose-detection keypoints
The `@tensorflow-models/hand-pose-detection` model outputs 21 named keypoints per hand. Key names: `wrist`, `thumb_tip` (not `thumb_finger_tip`), `index_finger_tip`, `middle_finger_tip`, `ring_finger_tip`, `pinky_finger_tip`. Full list with joint indices is in `@tensorflow-models/hand-pose-detection/dist/constants.js`.

### Finger-up detection heuristic
- For non-thumb fingers: tip y < PIP y (in image coords, lower y = higher on screen)
- For thumb: compare tip x vs MCP x, direction depends on handedness (`hand.handedness`)

## Testing

### Playwright setup
- No Playwright was previously in this project; it was added alongside the existing Selenium/Jest tests
- Config file: `packages/scratch-gui/playwright.config.js`
- Tests: `packages/scratch-gui/test/playwright/`
- The existing build output at `packages/scratch-gui/build/index.html` can be loaded via `file://` protocol

### Playwright browser version mismatches
Playwright versions are tightly coupled to specific browser builds. If you have browsers cached from one version (e.g. build 1194 from v1.57-alpha) but install a different playwright-core (wanting build 1200), tests fail. Symlinks between version directories can work if the internal directory structure matches, but naming conventions changed between versions (e.g. `chrome-linux/headless_shell` vs `chrome-headless-shell-linux64/chrome-headless-shell`).

### Key selectors for Scratch GUI testing
- Extension button: `[class*="extension-button-container"]`
- Extension library modal: `[class*="modal_modal-overlay"]`
- Library items: `[class*="library-item"]`
- Block category: `[class*="scratchCategoryId-<extensionId>"]`
- Sprite selector: `[class*="sprite-selector"]`
