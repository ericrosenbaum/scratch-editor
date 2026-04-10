# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: packages/scratch-gui/test/playwright/audio-classifier.spec.js >> Audio Classifier Extension >> modal opens via openTrainer block
- Location: packages/scratch-gui/test/playwright/audio-classifier.spec.js:99:5

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
  3   | /**
  4   |  * Access the Redux store via the React fiber tree, then get the VM.
  5   |  * Exposes window.vm for convenience.
  6   |  */
  7   | const exposeVM = async page => {
  8   |     await page.waitForFunction(() => {
  9   |         const guiEl = document.querySelector('[class*="gui_body-wrapper"]');
  10  |         if (!guiEl) return false;
  11  |         const fiberKey = Object.keys(guiEl).find(k => k.startsWith('__reactFiber'));
  12  |         if (!fiberKey) return false;
  13  |         let fiber = guiEl[fiberKey];
  14  |         while (fiber) {
  15  |             if (fiber.memoizedProps && fiber.memoizedProps.store) {
  16  |                 const store = fiber.memoizedProps.store;
  17  |                 const state = store.getState();
  18  |                 if (state && state.scratchGui && state.scratchGui.vm) {
  19  |                     window.vm = state.scratchGui.vm;
  20  |                     return true;
  21  |                 }
  22  |             }
  23  |             fiber = fiber.return;
  24  |         }
  25  |         return false;
  26  |     }, {timeout: 30000});
  27  | };
  28  | 
  29  | /**
  30  |  * Wait for the Scratch VM to be initialized and ready.
  31  |  */
  32  | const waitForVM = async page => {
  33  |     await exposeVM(page);
  34  |     await page.waitForFunction(() => {
  35  |         const vm = window.vm;
  36  |         return vm && vm.runtime && vm.runtime.targets && vm.runtime.targets.length > 0;
  37  |     }, {timeout: 30000});
  38  | };
  39  | 
  40  | /**
  41  |  * Load the audio classification extension by opening the extension library
  42  |  * and clicking the Audio Classifier entry.
  43  |  */
  44  | const loadAudioClassifierExtension = async page => {
  45  |     // Click the extensions button (bottom-left)
  46  |     await page.locator('[class*="extension-button_extension-button_"]').click();
  47  | 
  48  |     // Wait for the extension library modal
  49  |     await expect(page.locator('[class*="library_library-scroll-grid"]')).toBeVisible({timeout: 10000});
  50  | 
  51  |     // Find and click the Audio Classifier extension
  52  |     const extensionItem = page.locator('[class*="library-item_library-item_"]')
  53  |         .filter({hasText: 'Audio Classifier'});
  54  |     await expect(extensionItem).toBeVisible();
  55  |     await extensionItem.click();
  56  | 
  57  |     // Wait for the extension library to close
  58  |     await expect(page.locator('[class*="library_library-scroll-grid"]')).not.toBeVisible({timeout: 10000});
  59  | 
  60  |     // Wait for blocks to appear — verify the extension category is present
  61  |     await page.waitForFunction(() => {
  62  |         const vm = window.vm;
  63  |         return vm && vm.extensionManager.isExtensionLoaded('audioClassification');
  64  |     }, {timeout: 10000});
  65  | };
  66  | 
  67  | test.describe('Audio Classifier Extension', () => {
  68  | 
  69  |     test.beforeEach(async ({page}) => {
  70  |         // Intercept page creation to block webpack dev server overlay
  71  |         await page.addInitScript(() => {
  72  |             // Continuously remove the webpack overlay iframe that intercepts clicks
  73  |             const observer = new MutationObserver(() => {
  74  |                 const overlay = document.getElementById('webpack-dev-server-client-overlay');
  75  |                 if (overlay) overlay.remove();
  76  |             });
  77  |             if (document.body) {
  78  |                 observer.observe(document.body, {childList: true, subtree: true});
  79  |             } else {
  80  |                 document.addEventListener('DOMContentLoaded', () => {
  81  |                     observer.observe(document.body, {childList: true, subtree: true});
  82  |                 });
  83  |             }
  84  |         });
> 85  |         await page.goto('/');
      |                    ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  86  |         await waitForVM(page);
  87  |     });
  88  | 
  89  |     test('extension loads from library', async ({page}) => {
  90  |         await loadAudioClassifierExtension(page);
  91  | 
  92  |         // Verify the extension is registered on the runtime
  93  |         const isLoaded = await page.evaluate(() =>
  94  |             !!window.vm.runtime.ext_audioClassification
  95  |         );
  96  |         expect(isLoaded).toBe(true);
  97  |     });
  98  | 
  99  |     test('modal opens via openTrainer block', async ({page}) => {
  100 |         await loadAudioClassifierExtension(page);
  101 | 
  102 |         // Trigger the modal via the extension's openTrainer method
  103 |         await page.evaluate(() => {
  104 |             window.vm.runtime.ext_audioClassification.openTrainer();
  105 |         });
  106 | 
  107 |         // Verify the modal is visible
  108 |         const modal = page.locator('[class*="audio-classifier-modal_modal"]');
  109 |         await expect(modal).toBeVisible({timeout: 10000});
  110 | 
  111 |         // Verify the modal title (scoped to modal to avoid matching block labels)
  112 |         await expect(modal.locator('span').filter({hasText: 'Audio Classifier'})).toBeVisible();
  113 |     });
  114 | 
  115 |     test('modal has correct initial UI elements', async ({page}) => {
  116 |         await loadAudioClassifierExtension(page);
  117 | 
  118 |         // Open modal
  119 |         await page.evaluate(() => {
  120 |             window.vm.runtime.ext_audioClassification.openTrainer();
  121 |         });
  122 |         const modal = page.locator('[class*="audio-classifier-modal_modal"]');
  123 |         await expect(modal).toBeVisible({timeout: 10000});
  124 | 
  125 |         // Should have 2 default classes
  126 |         const classInputs = modal.locator('[class*="class-name-input"]');
  127 |         await expect(classInputs).toHaveCount(2);
  128 | 
  129 |         // Check default class names
  130 |         await expect(classInputs.nth(0)).toHaveValue('Class 1');
  131 |         await expect(classInputs.nth(1)).toHaveValue('Class 2');
  132 | 
  133 |         // Should have Record buttons
  134 |         const recordButtons = modal.locator('[class*="record-button"]');
  135 |         await expect(recordButtons).toHaveCount(2);
  136 | 
  137 |         // Should have Add Class button
  138 |         await expect(modal.getByText('+ Add Class')).toBeVisible();
  139 | 
  140 |         // Should have Train button
  141 |         await expect(modal.getByText('Train')).toBeVisible();
  142 |     });
  143 | 
  144 |     test('can add and remove classes', async ({page}) => {
  145 |         await loadAudioClassifierExtension(page);
  146 | 
  147 |         // Open modal
  148 |         await page.evaluate(() => {
  149 |             window.vm.runtime.ext_audioClassification.openTrainer();
  150 |         });
  151 |         const modal = page.locator('[class*="audio-classifier-modal_modal"]');
  152 |         await expect(modal).toBeVisible({timeout: 10000});
  153 | 
  154 |         // Add a new class
  155 |         await modal.getByText('+ Add Class').click();
  156 |         const classInputs = modal.locator('[class*="class-name-input"]');
  157 |         await expect(classInputs).toHaveCount(3);
  158 |         await expect(classInputs.nth(2)).toHaveValue('Class 3');
  159 | 
  160 |         // Now we have 3 classes, delete buttons should appear
  161 |         const deleteButtons = modal.locator('[class*="delete-button"]');
  162 |         await expect(deleteButtons.first()).toBeVisible();
  163 | 
  164 |         // Remove the third class
  165 |         await deleteButtons.last().click();
  166 |         await expect(classInputs).toHaveCount(2);
  167 |     });
  168 | 
  169 |     test('can rename classes', async ({page}) => {
  170 |         await loadAudioClassifierExtension(page);
  171 | 
  172 |         // Open modal
  173 |         await page.evaluate(() => {
  174 |             window.vm.runtime.ext_audioClassification.openTrainer();
  175 |         });
  176 |         const modal = page.locator('[class*="audio-classifier-modal_modal"]');
  177 |         await expect(modal).toBeVisible({timeout: 10000});
  178 | 
  179 |         // Rename first class
  180 |         const firstInput = modal.locator('[class*="class-name-input"]').first();
  181 |         await firstInput.fill('Dog Bark');
  182 | 
  183 |         // Verify the extension state is synced — close and check
  184 |         // Use the modal close button
  185 |         await modal.locator('[class*="close-button_close-button_"]').click();
```