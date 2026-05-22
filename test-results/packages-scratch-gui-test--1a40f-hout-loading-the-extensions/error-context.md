# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: packages/scratch-gui/test/playwright/tips-camera-extension-preview.spec.js >> Tip preview with camera-using extensions >> renders videoSensing/faceSensing blocks without loading the extensions
- Location: packages/scratch-gui/test/playwright/tips-camera-extension-preview.spec.js:53:5

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/", waiting until "load"

```

# Test source

```ts
  1  | const {test, expect} = require('@playwright/test');
  2  | 
  3  | // Verifies the fix for the bug where opening a tip whose block preview
  4  | // references a webcam-using extension (videoSensing, faceSensing) would
  5  | // turn the camera on as a side effect of loading the extension.
  6  | //
  7  | // The video-sensing-extension tip's `_capturedBlocks` contain both
  8  | // `videoSensing_whenMotionGreaterThan` and `faceSensing_goToPart`. After
  9  | // opening it:
  10 | //   - Both blocks should render with the extension green styling and icons.
  11 | //   - Neither extension should be marked as loaded (so a later user-initiated
  12 | //     add via the extension library still runs the full real load and turns
  13 | //     the camera on).
  14 | //   - Neither extension should appear in the editor's `_blockInfo` toolbox
  15 | //     palette.
  16 | 
  17 | const waitForEditor = async page => {
> 18 |     await page.goto('/');
     |                ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  19 |     const webglOverlay = page.locator('.ReactModal__Overlay');
  20 |     if (await webglOverlay.isVisible({timeout: 3000}).catch(() => false)) {
  21 |         await page.evaluate(() => {
  22 |             document.querySelectorAll('.ReactModalPortal').forEach(el => el.remove());
  23 |         });
  24 |     }
  25 |     await page.waitForSelector('[class*="blocks_blocks"]', {timeout: 30000});
  26 |     await page.waitForTimeout(1000);
  27 |     await page.evaluate(() => {
  28 |         const wdsOverlay = document.getElementById('webpack-dev-server-client-overlay');
  29 |         if (wdsOverlay) wdsOverlay.remove();
  30 |     });
  31 | };
  32 | 
  33 | const openTip = async (page, tipId) => {
  34 |     await page.waitForFunction(() => window.__scratchStore, null, {timeout: 10000});
  35 |     await page.evaluate(id => {
  36 |         const store = window.__scratchStore;
  37 |         store.dispatch({type: 'scratch-gui/unstuck/OPEN_UNSTUCK'});
  38 |         store.dispatch({type: 'scratch-gui/unstuck/SET_TIP', tipId: id});
  39 |     }, tipId);
  40 |     await page.waitForSelector(
  41 |         '[class*="unstuck-container"], [class*="unstuckContainer"]',
  42 |         {timeout: 5000}
  43 |     );
  44 |     const codeHeader = page.locator(
  45 |         '[class*="code-section-header"], [class*="codeSectionHeader"]'
  46 |     );
  47 |     await expect(codeHeader).toBeVisible({timeout: 5000});
  48 |     await codeHeader.click();
  49 |     await page.waitForTimeout(400);
  50 | };
  51 | 
  52 | test.describe('Tip preview with camera-using extensions', () => {
  53 |     test('renders videoSensing/faceSensing blocks without loading the extensions', async ({page}) => {
  54 |         await waitForEditor(page);
  55 |         await openTip(page, 'video-sensing-extension');
  56 | 
  57 |         // Block preview workspace renders something.
  58 |         const blockCount = await page.evaluate(() => {
  59 |             const container = document.querySelector(
  60 |                 '[class*="workspace-container"], [class*="workspaceContainer"]'
  61 |             );
  62 |             if (!container) return 0;
  63 |             const canvas = container.querySelector('.blocklyBlockCanvas');
  64 |             if (!canvas) return 0;
  65 |             return canvas.querySelectorAll(':scope > g').length;
  66 |         });
  67 |         expect(blockCount, 'block preview should render at least one block').toBeGreaterThan(0);
  68 | 
  69 |         // Neither camera extension was actually loaded.
  70 |         const loadedStatus = await page.evaluate(() => {
  71 |             const store = window.__scratchStore;
  72 |             const vm = store.getState().scratchGui.vm;
  73 |             return {
  74 |                 videoSensing: vm.extensionManager.isExtensionLoaded('videoSensing'),
  75 |                 faceSensing: vm.extensionManager.isExtensionLoaded('faceSensing')
  76 |             };
  77 |         });
  78 |         expect(loadedStatus.videoSensing, 'videoSensing must not be fully loaded').toBe(false);
  79 |         expect(loadedStatus.faceSensing, 'faceSensing must not be fully loaded').toBe(false);
  80 | 
  81 |         // Neither category appears in the editor's toolbox/blocks palette.
  82 |         const toolboxIds = await page.evaluate(() => {
  83 |             const store = window.__scratchStore;
  84 |             const vm = store.getState().scratchGui.vm;
  85 |             return vm.runtime._blockInfo.map(c => c.id);
  86 |         });
  87 |         expect(toolboxIds).not.toContain('videoSensing');
  88 |         expect(toolboxIds).not.toContain('faceSensing');
  89 |     });
  90 | });
  91 | 
```