# CLAUDE.md — scratch-editor

## Project Overview

This is the **Scratch Editor monorepo** (Scratch Foundation). It contains 5 npm workspace packages:

| Package | Path | Build | Tests |
|---------|------|-------|-------|
| `@scratch/scratch-gui` | `packages/scratch-gui` | webpack | Jest + Selenium WebDriver |
| `@scratch/scratch-vm` | `packages/scratch-vm` | webpack | TAP |
| `@scratch/scratch-render` | `packages/scratch-render` | webpack | TAP + Playwright Chromium |
| `@scratch/scratch-svg-renderer` | `packages/scratch-svg-renderer` | webpack | TAP |
| `@scratch/task-herder` | `packages/task-herder` | Vite | Vitest |

**Key commands:**
- `npm run build` — production build of all packages (from root)
- `npm start` — dev server (run inside `packages/scratch-gui`)
- `npm test` — run all tests (from root)
- `npm run clean` — remove all build artifacts
- Node **20.20.0** is required (see `.nvmrc`)

**Commit conventions:** This repo enforces conventional commits via commitlint + husky. Always use prefixes like `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`.

---

## Common Build Problems and Solutions

### Native dependency failures (canvas module)
The `canvas` npm package requires system libraries. If `npm ci` fails with compilation errors:

**Linux / CI:**
```bash
sudo apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev libpixman-1-dev libssl-dev
```

**macOS:**
```bash
brew install pkg-config cairo pango libpng jpeg giflib pixman
```

Then re-run `npm ci` from the repo root.

### npm workspace resolution failures
- Always run `npm ci` (or `npm install`) from the **repo root**, never inside individual packages.
- To run a script in a specific package: `npm run start --workspace=packages/scratch-gui`
- If you see "could not resolve dependency" errors, delete `node_modules` at root and all packages, then `npm ci` again.

### Node version mismatch
```bash
nvm use   # reads .nvmrc → 20.20.0
```
If builds fail with syntax errors or unexpected API issues, check `node --version` first.

### Webpack build failures
Packages must build in dependency order. The workspace list in `package.json` is already ordered correctly:
1. task-herder
2. scratch-svg-renderer
3. scratch-render
4. scratch-vm
5. scratch-gui

If a single package fails, build it individually: `npm run build --workspace=packages/scratch-render`

### Stale build artifacts
When switching branches or after major dependency changes:
```bash
npm run clean && npm ci && npm run build
```

### Commitlint rejecting your commit
Use conventional commit format:
```
feat: add new costume picker animation
fix: resolve sprite drag offset on stage resize
chore(deps): update dependency scratch-paint to v4.1.48
```

---

## Front-End Design Skill

**Always use the front-end design skill when working on scratch-gui UI components.** This means:

### Screenshot-driven iteration
1. After making any visual/UI change, take a screenshot of the result
2. Evaluate whether the change looks correct and consistent with the surrounding UI
3. Iterate — adjust styles, spacing, colors, layout — until the result is visually polished
4. Do not consider a UI task done until you have visually verified it via screenshot

### Match existing design patterns
Before making UI changes, always study the existing component and its styles:
- **Components** live in `packages/scratch-gui/src/components/` — each in its own directory with a `.jsx` and `.css` file
- **Containers** (Redux-connected) live in `packages/scratch-gui/src/containers/`
- **CSS Modules** with PostCSS: styles use `.css` files imported as `styles` objects. Class names are locally scoped.
- Follow the existing Scratch design language: rounded corners, consistent color palette, accessible contrast ratios
- Check neighboring components for spacing, font sizes, and interaction patterns before inventing new ones
- The project uses `classnames` for conditional CSS class composition

### Key UI directories to know
```
packages/scratch-gui/src/
  components/        # Presentational React components (30+ subdirectories)
  containers/        # Redux-connected container components
  lib/               # Utilities, libraries, layout constants
  reducers/          # Redux state management
```

---

## Playwright Integration Test Strategies

The repo currently uses Selenium WebDriver for scratch-gui integration tests and TAP + playwright-chromium for scratch-render tests. When writing new Playwright-based integration tests, follow these strategies.

### Setup: playwright.config.ts

Place this in the package you're testing (e.g., `packages/scratch-gui/playwright.config.ts`):

```ts
import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
    testDir: './test/e2e',
    timeout: 60_000,
    retries: 1,
    use: {
        baseURL: 'http://localhost:8601',
        screenshot: 'only-on-failure',
        trace: 'on-first-retry',
        actionTimeout: 15_000,
    },
    projects: [
        {
            name: 'chromium',
            use: {...devices['Desktop Chrome']},
        },
    ],
    webServer: {
        command: 'npm start -- --port 8601',
        port: 8601,
        reuseExistingServer: true,
        timeout: 120_000,
    },
});
```

### Test loop workflow

The core workflow is: write a test, run it, read the output, fix, re-run.

```bash
# Run a single test file for fast feedback
npx playwright test test/e2e/my-test.spec.ts --reporter=line

# Run with headed browser to watch what happens (VS Code / macOS only)
npx playwright test test/e2e/my-test.spec.ts --headed

# Update visual snapshots after intentional UI changes
npx playwright test --update-snapshots
```

When iterating in a loop:
1. Write or modify the test
2. Run it: `npx playwright test path/to/test.spec.ts --reporter=line`
3. Read the terminal output — Playwright reports which assertions failed and why
4. Fix the test or the application code
5. Re-run. Repeat until green.

### Verifying scratch-vm state

The standalone scratch-gui build exposes the VM instance on `window.vm`. Use `page.evaluate()` to inspect VM state:

```ts
import {test, expect} from '@playwright/test';

test('verify VM sprite state after loading project', async ({page}) => {
    // Load a project via URL param or direct navigation
    await page.goto('/?project_url=test/fixtures/my-project.sb3');

    // Wait for the VM to be ready
    await page.waitForFunction(() => {
        const vm = (window as any).vm;
        return vm && vm.runtime && vm.runtime.targets.length > 0;
    }, {timeout: 30_000});

    // Check sprite count
    const spriteCount = await page.evaluate(() => {
        const vm = (window as any).vm;
        return vm.runtime.targets.filter((t: any) => !t.isStage).length;
    });
    expect(spriteCount).toBe(2);

    // Check a variable value
    const score = await page.evaluate(() => {
        const vm = (window as any).vm;
        const stage = vm.runtime.getTargetForStage();
        const variable = Object.values(stage.variables).find(
            (v: any) => v.name === 'score'
        ) as any;
        return variable?.value;
    });
    expect(score).toBe(0);

    // Run the project and verify state changes
    await page.evaluate(() => (window as any).vm.greenFlag());
    await page.waitForTimeout(2000); // Let blocks execute
    await page.evaluate(() => (window as any).vm.stopAll());

    const updatedScore = await page.evaluate(() => {
        const vm = (window as any).vm;
        const stage = vm.runtime.getTargetForStage();
        const variable = Object.values(stage.variables).find(
            (v: any) => v.name === 'score'
        ) as any;
        return variable?.value;
    });
    expect(updatedScore).toBeGreaterThan(0);
});
```

### Verifying scratch-gui state

Use Playwright's built-in locator strategies. Prefer role-based and text-based selectors over CSS classes (CSS Modules generate dynamic class names):

```ts
test('can switch to costumes tab and see costume list', async ({page}) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Use role-based selectors — stable across CSS module hash changes
    await page.getByRole('tab', {name: /Costumes/i}).click();

    // Verify costume list is visible
    await expect(page.getByRole('tabpanel')).toBeVisible();

    // Check for specific costume names in the list
    await expect(page.getByText('costume1')).toBeVisible();
});

test('green flag starts project execution', async ({page}) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click the green flag button
    await page.getByRole('button', {name: /green flag/i}).click();

    // Verify the stage is running (check VM state)
    const isRunning = await page.evaluate(() => {
        const vm = (window as any).vm;
        return vm?.runtime?.sequencer?.activeThread?.length > 0;
    });
    // Project may or may not have threads depending on blocks
});
```

### Visual snapshot tests

Use Playwright's built-in screenshot comparison for visual regression testing:

```ts
test('stage renders correctly with default project', async ({page}) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for WebGL canvas to render
    await page.waitForTimeout(2000);

    // Full page snapshot
    await expect(page).toHaveScreenshot('default-project.png', {
        maxDiffPixelRatio: 0.01,  // Allow 1% pixel difference
    });

    // Snapshot of just the stage area
    const stage = page.locator('[class*="stage_stage_"]');
    await expect(stage).toHaveScreenshot('stage-area.png', {
        maxDiffPixelRatio: 0.02,  // WebGL rendering can vary slightly
    });
});

test('costume editor renders SVG correctly', async ({page}) => {
    await page.goto('/');
    await page.getByRole('tab', {name: /Costumes/i}).click();

    const editor = page.locator('[class*="paint-editor"]');
    await expect(editor).toHaveScreenshot('costume-editor.png', {
        maxDiffPixelRatio: 0.01,
    });
});
```

Snapshot files are stored in a `*.spec.ts-snapshots/` directory next to the test file. Commit these to the repo as baselines.

---

## Using Playwright from Claude Code App for iOS

When running tests from the Claude Code iOS app, you are executing on a **remote server** with no display. Key considerations:

### All tests run headless
This is Playwright's default — no configuration change needed. Never use `--headed` or `--ui` from iOS (there is no display to connect to).

### Install browser binaries on the remote
```bash
npx playwright install chromium
```

If system dependencies are missing (common on fresh Linux servers):
```bash
npx playwright install-deps chromium
```

### Use terminal-friendly reporters
```bash
# Clean line-by-line output — best for reading in the iOS app
npx playwright test --reporter=line

# Or for more detail on failures
npx playwright test --reporter=list
```

Do not use `--reporter=html` — there's no browser to view it. If you need detailed failure info, use:
```bash
npx playwright test --reporter=json > test-results.json
```

### Inspecting visual test results
Since you can't open a browser to view screenshots, read the files directly:
- On failure, screenshots are saved to `test-results/` by default
- Read the screenshot image files directly to inspect visual differences
- Diff images are generated automatically and saved alongside expected/actual screenshots

### Timeout adjustments
Remote environments may be slower. Increase timeouts in your config:
```ts
export default defineConfig({
    timeout: 90_000,           // Overall test timeout
    expect: {
        timeout: 15_000,       // Assertion timeout
        toHaveScreenshot: {
            timeout: 30_000,   // Screenshot comparison timeout
        },
    },
    use: {
        actionTimeout: 20_000, // Click/fill/etc timeout
        navigationTimeout: 45_000,
    },
});
```

### Workflow pattern for iOS
1. Write/edit the test file
2. Run: `npx playwright test path/to/test.spec.ts --reporter=line`
3. Read terminal output for pass/fail
4. If visual test fails, read the diff screenshot from `test-results/`
5. Fix and re-run

---

## Using Playwright from VS Code on macOS

### Install the Playwright VS Code extension
Install `ms-playwright.playwright` from the VS Code extensions marketplace. This adds a Testing sidebar panel.

### Install browsers (one-time)
```bash
npx playwright install
```
No extra system dependencies are needed on macOS.

### Running tests
- **Testing sidebar**: Click the play button next to any test to run it. Click the debug icon to run with breakpoints.
- **Headed mode** for visual debugging:
  ```bash
  npx playwright test --headed
  ```
- **UI mode** for interactive exploration:
  ```bash
  npx playwright test --ui
  ```
  This opens a browser window where you can run, re-run, and inspect tests with time-travel debugging.

### Debugging
- Set breakpoints in your test files and use "Debug Test" from the Testing sidebar
- Use `await page.pause()` in your test to open the Playwright Inspector at that point
- View traces after a failed test:
  ```bash
  npx playwright show-trace test-results/my-test-chromium/trace.zip
  ```

### Recommended VS Code settings
Add to `.vscode/settings.json`:
```json
{
    "playwright.reuseBrowser": true,
    "playwright.showTrace": true
}
```

---

## Preventing and Solving Common Playwright Issues

### Browser not installed
```
Error: browserType.launch: Executable doesn't exist
```
**Fix:**
```bash
npx playwright install chromium
# On Linux, also install system deps:
npx playwright install-deps chromium
```

### Flaky tests from timing issues
- Use auto-waiting locators (`getByRole`, `getByText`) — they automatically wait for elements
- Use `await expect(locator).toBeVisible()` before interacting
- Avoid `page.waitForTimeout()` for synchronization — use `page.waitForFunction()` or `expect` polling instead:
  ```ts
  // Bad: arbitrary wait
  await page.waitForTimeout(3000);

  // Good: wait for actual condition
  await expect(page.getByText('Project loaded')).toBeVisible();

  // Good: wait for VM state
  await page.waitForFunction(() => (window as any).vm?.runtime?.targets.length > 0);
  ```

### CSS Module selector instability
CSS Modules generate hashed class names (e.g., `stage_stage_1fD7k`). These change when styles are modified.

**Prefer:**
```ts
page.getByRole('tab', {name: /Costumes/i})     // Role + accessible name
page.getByText('Scratch Cat')                    // Visible text
page.getByTestId('stage-canvas')                 // data-testid attribute
```

**Avoid:**
```ts
page.locator('.stage_stage_1fD7k')               // Fragile hashed class
```

If you must use CSS classes, use a partial match: `page.locator('[class*="stage_stage_"]')`

### Timeout errors
Increase specific timeouts rather than the global one:
```ts
// For a slow-loading page
await page.goto('/', {timeout: 60_000});

// For a slow assertion
await expect(page.getByText('loaded')).toBeVisible({timeout: 30_000});
```

### Visual snapshot diffs across platforms
Screenshots can differ between macOS, Linux, and CI. Solutions:
- Generate baselines on the **same platform** that CI uses (Linux)
- Use `maxDiffPixelRatio: 0.01` to tolerate minor rendering differences
- Use `maxDiffPixels` for a fixed pixel tolerance
- Run snapshots in Docker for reproducible baselines:
  ```bash
  npx playwright test --update-snapshots --project=chromium
  ```

### WebGL / Canvas rendering issues
scratch-render uses WebGL. In headless Chromium:
- WebGL is supported but may use software rendering (SwiftShader)
- Rendering may differ slightly from headed mode — use `maxDiffPixelRatio` in screenshot assertions
- If WebGL fails entirely, add launch args:
  ```ts
  use: {
      launchOptions: {
          args: ['--enable-webgl', '--ignore-gpu-blocklist'],
      },
  },
  ```

### Port conflicts
If the dev server port is already in use:
```ts
webServer: {
    command: 'npm start -- --port 8602',  // Use a different port
    port: 8602,
    reuseExistingServer: true,            // Don't fail if already running
},
```

### Stale state between tests
Each test should start fresh:
```ts
test.beforeEach(async ({page}) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
});
```

Avoid test interdependence — never rely on state from a previous test. If you need shared setup, use `test.describe` with a shared `beforeAll` that loads a project file.
