# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: packages/scratch-gui/test/playwright/tips-checkbox-pointer.spec.js >> Block checkbox pointer >> Checkbox bubbles are aligned next to their reporter blocks
- Location: packages/scratch-gui/test/playwright/tips-checkbox-pointer.spec.js:45:5

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
  3  | const waitForEditor = async page => {
> 4  |     await page.goto('/');
     |                ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  5  |     await page.waitForSelector('[class*="blocks_blocks"]', {timeout: 30000});
  6  |     await page.waitForTimeout(1000);
  7  |     await page.evaluate(() => {
  8  |         const wdsOverlay = document.getElementById('webpack-dev-server-client-overlay');
  9  |         if (wdsOverlay) wdsOverlay.remove();
  10 |     });
  11 | };
  12 | 
  13 | test.describe('Block checkbox pointer', () => {
  14 |     test('Motion flyout renders checkbox bubbles for reporter blocks', async ({page}) => {
  15 |         await waitForEditor(page);
  16 | 
  17 |         // Motion is the default open category, so motion_xposition's checkbox
  18 |         // bubble should already be in the bubble canvas.
  19 |         const checkboxes = await page.locator('.blocklyFlyout .blocklyFlyoutCheckbox').count();
  20 |         expect(checkboxes).toBeGreaterThanOrEqual(3); // x, y, direction
  21 | 
  22 |         const blockLocator = page.locator('.blocklyFlyout .motion_xposition.blocklyDraggable')
  23 |             .first();
  24 |         const motionBlockBox = await blockLocator.boundingBox();
  25 |         expect(motionBlockBox).not.toBeNull();
  26 | 
  27 |         // At least one of the checkbox bubbles should sit to the left of the
  28 |         // motion_xposition block at roughly the same vertical center — this is
  29 |         // how findFlyoutCheckboxElement will identify the right one in prod.
  30 |         const candidate = await page.evaluate(rect => {
  31 |             const checks = Array.from(document.querySelectorAll(
  32 |                 '.blocklyFlyout .blocklyFlyoutCheckbox'
  33 |             ));
  34 |             const targetY = rect.y + (rect.height / 2);
  35 |             const aligned = checks.find(c => {
  36 |                 const r = c.getBoundingClientRect();
  37 |                 return Math.abs((r.y + (r.height / 2)) - targetY) < 6 &&
  38 |                     r.right <= rect.x + 2;
  39 |             });
  40 |             return aligned ? aligned.getBoundingClientRect() : null;
  41 |         }, motionBlockBox);
  42 |         expect(candidate).not.toBeNull();
  43 |     });
  44 | 
  45 |     test('Checkbox bubbles are aligned next to their reporter blocks', async ({page}) => {
  46 |         await waitForEditor(page);
  47 | 
  48 |         // Each checkbox in the flyout should be aligned with exactly one
  49 |         // reporter block at the same vertical center. This is the property
  50 |         // findFlyoutCheckboxElement relies on indirectly (it locates the
  51 |         // bubble via Blockly's block.getIcon('checkbox') API).
  52 |         const checks = await page.evaluate(() => {
  53 |             const reporters = ['motion_xposition', 'motion_yposition', 'motion_direction'];
  54 |             return reporters.map(opcode => {
  55 |                 const block = document.querySelector(`.blocklyFlyout .${opcode}.blocklyDraggable`);
  56 |                 if (!block) return {opcode, ok: false, reason: 'no block'};
  57 |                 const blockRect = block.getBoundingClientRect();
  58 |                 const targetY = blockRect.y + (blockRect.height / 2);
  59 |                 const checkbox = Array.from(document.querySelectorAll(
  60 |                     '.blocklyFlyout .blocklyFlyoutCheckbox'
  61 |                 )).find(c => {
  62 |                     const r = c.getBoundingClientRect();
  63 |                     return Math.abs((r.y + (r.height / 2)) - targetY) < 8 &&
  64 |                         r.right <= blockRect.x + 2;
  65 |                 });
  66 |                 return {opcode, ok: !!checkbox};
  67 |             });
  68 |         });
  69 | 
  70 |         for (const c of checks) {
  71 |             expect(c.ok, `${c.opcode} has aligned checkbox`).toBe(true);
  72 |         }
  73 |     });
  74 | });
  75 | 
```