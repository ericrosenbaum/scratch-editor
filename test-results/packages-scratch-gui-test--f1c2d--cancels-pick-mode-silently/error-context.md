# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: packages/scratch-gui/test/playwright/tips-block-picker.spec.js >> Tips Block Picker >> clicking on a non-block (stage) cancels pick mode silently
- Location: packages/scratch-gui/test/playwright/tips-block-picker.spec.js:239:5

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/", waiting until "load"

```

# Test source

```ts
  1   | const {test, expect} = require('@playwright/test');
  2   | 
  3   | const waitForEditor = async page => {
> 4   |     await page.goto('/');
      |                ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  5   |     const webglOverlay = page.locator('.ReactModal__Overlay');
  6   |     if (await webglOverlay.isVisible({timeout: 3000}).catch(() => false)) {
  7   |         await page.evaluate(() => {
  8   |             document.querySelectorAll('.ReactModalPortal').forEach(el => el.remove());
  9   |         });
  10  |     }
  11  |     await page.waitForSelector('[class*="blocks_blocks"]', {timeout: 30000});
  12  |     await page.waitForTimeout(1000);
  13  |     await page.evaluate(() => {
  14  |         const wdsOverlay = document.getElementById('webpack-dev-server-client-overlay');
  15  |         if (wdsOverlay) wdsOverlay.remove();
  16  |     });
  17  | };
  18  | 
  19  | const openUnstuck = async page => {
  20  |     await page.waitForFunction(() => window.__scratchStore, null, {timeout: 10000});
  21  |     await page.evaluate(() => {
  22  |         window.__scratchStore.dispatch({type: 'scratch-gui/unstuck/OPEN_UNSTUCK'});
  23  |     });
  24  |     await page.waitForSelector(
  25  |         '[class*="unstuck-container"], [class*="unstuckContainer"]',
  26  |         {timeout: 5000}
  27  |     );
  28  | };
  29  | 
  30  | const getUnstuckState = page => page.evaluate(() => {
  31  |     const s = window.__scratchStore.getState().scratchGui.unstuck;
  32  |     return {
  33  |         pickMode: s.pickMode,
  34  |         query: s.query,
  35  |         loading: s.loading,
  36  |         searchResults: s.searchResults,
  37  |         activeTipId: s.activeTipId
  38  |     };
  39  | });
  40  | 
  41  | test.describe('Tips Block Picker', () => {
  42  | 
  43  |     test('clicking pick button enters pick mode and adds body class', async ({page}) => {
  44  |         await waitForEditor(page);
  45  |         await openUnstuck(page);
  46  | 
  47  |         const pickButton = page.locator(
  48  |             'button[class*="pick-button"], button[class*="pickButton"]'
  49  |         ).first();
  50  |         await expect(pickButton).toBeVisible({timeout: 5000});
  51  |         await pickButton.click();
  52  | 
  53  |         const state = await getUnstuckState(page);
  54  |         expect(state.pickMode).toBe(true);
  55  | 
  56  |         const hasBodyClass = await page.evaluate(() =>
  57  |             document.body.classList.contains('tip-pick-mode')
  58  |         );
  59  |         expect(hasBodyClass).toBe(true);
  60  | 
  61  |         const banner = page.locator(
  62  |             '[class*="pick-hint-banner"], [class*="pickHintBanner"]'
  63  |         );
  64  |         await expect(banner).toBeVisible();
  65  |     });
  66  | 
  67  |     test('pressing Escape exits pick mode and removes body class', async ({page}) => {
  68  |         await waitForEditor(page);
  69  |         await openUnstuck(page);
  70  | 
  71  |         const pickButton = page.locator(
  72  |             'button[class*="pick-button"], button[class*="pickButton"]'
  73  |         ).first();
  74  |         await pickButton.click();
  75  |         expect((await getUnstuckState(page)).pickMode).toBe(true);
  76  |         // Wait for componentDidUpdate to have attached the document listeners
  77  |         // (body class is set immediately after attaching).
  78  |         await page.waitForFunction(() => document.body.classList.contains('tip-pick-mode'));
  79  |         await page.waitForTimeout(300);
  80  | 
  81  |         await page.keyboard.press('Escape');
  82  |         await page.waitForTimeout(100);
  83  | 
  84  |         expect((await getUnstuckState(page)).pickMode).toBe(false);
  85  |         const hasBodyClass = await page.evaluate(() =>
  86  |             document.body.classList.contains('tip-pick-mode')
  87  |         );
  88  |         expect(hasBodyClass).toBe(false);
  89  |     });
  90  | 
  91  |     test('clicking a flyout block sets query and kicks off search', async ({page}) => {
  92  |         const errors = [];
  93  |         page.on('pageerror', err => errors.push(err.message));
  94  | 
  95  |         await waitForEditor(page);
  96  |         await openUnstuck(page);
  97  | 
  98  |         // Activate the picker
  99  |         const pickButton = page.locator(
  100 |             'button[class*="pick-button"], button[class*="pickButton"]'
  101 |         ).first();
  102 |         await pickButton.click();
  103 |         expect((await getUnstuckState(page)).pickMode).toBe(true);
  104 |         // Wait for componentDidUpdate to have attached the document listeners
```