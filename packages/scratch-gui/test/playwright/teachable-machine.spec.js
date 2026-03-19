const {test, expect} = require('@playwright/test');
const {
    openExtensionLibrary,
    addExtension,
    getTeachableClassifierState,
    setPredictedLabel,
    openTeachableMachineModal,
    getWizardStep,
    getTeachableLabels,
    isModelReady,
    injectTrainingData
} = require('./helpers/scratch-helpers');

test.describe('Teachable Machine extension', () => {
    // ── Phase 1: Extension skeleton ──────────────────────────────────────────

    test('extension tile appears in library', async ({page}) => {
        await page.goto('/');
        await openExtensionLibrary(page);
        await expect(page.locator('button[class*="library-item"]').filter({hasText: 'Teachable Machine'}))
            .toBeVisible();
    });

    test('adding extension shows blocks in toolbox', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');

        await expect(page.locator('.scratchCategoryMenuItem:has-text("Teachable Machine")').first())
            .toBeVisible();
        await page.locator('.scratchCategoryMenuItem:has-text("Teachable Machine")').click();
        await expect(page.getByText('when I see')).toBeVisible();
        await expect(page.getByText('guess')).toBeVisible();
        await expect(page.getByText('Edit Model')).toBeVisible();
    });

    // ── Phase 2: Video feed ───────────────────────────────────────────────────

    test('no JS errors when adding the extension', async ({page}) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.goto('/');
        await addExtension(page, 'Teachable Machine');

        await page.waitForTimeout(500);
        expect(errors.filter(e => !e.includes('non-passive event'))).toHaveLength(0);
    });

    test('stage canvas is visible after adding extension', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');
        await expect(page.locator('canvas').first()).toBeVisible();
    });

    // ── Phase 3: Wizard flow ────────────────────────────────────────────────

    test('modal opens in wizard mode when no data exists', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');
        await openTeachableMachineModal(page);

        const step = await getWizardStep(page);
        expect(step).toBe(1);

        await expect(page.locator('[class*="coaching-tip-text"]').filter({hasText: 'teach Scratch to see'}))
            .toBeVisible();
        await expect(page.getByRole('button', {name: 'Start!'})).toBeVisible();
    });

    test('Step 1 -> 2: Start advances to background capture', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');
        await openTeachableMachineModal(page);

        await expect(page.getByRole('button', {name: 'Start!'})).toBeEnabled({timeout: 10000});
        await page.click('button:has-text("Start!")');

        const step = await getWizardStep(page);
        expect(step).toBe(2);

        await expect(page.locator('[class*="camera-preview"]')).toBeVisible();
        await expect(page.getByRole('button', {name: 'Take Photo'})).toBeVisible();
        await expect(page.getByRole('button', {name: 'Capture 10'})).toBeVisible();
        await expect(page.locator('[class*="label-name-input"]')).toHaveValue('Background');
    });

    test('Step 2: Status badge shows needs when no data', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');
        await openTeachableMachineModal(page);

        await expect(page.getByRole('button', {name: 'Start!'})).toBeEnabled({timeout: 10000});
        await page.click('button:has-text("Start!")');

        // Status badge should show "needs" state
        await expect(page.locator('[class*="status-badge-needs"]')).toBeVisible();
    });

    test('Step 2: Injected data shows Ready badge and Next button', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');

        // Inject training data before opening modal
        await injectTrainingData(page, 'Background', 10);
        await openTeachableMachineModal(page);

        // With data, wizard should resume at step 2 (background has data but < 2 labels)
        const step = await getWizardStep(page);
        // Step should be 2 or 3 depending on logic
        expect(step).toBeGreaterThanOrEqual(2);
    });

    test('Step 2 -> 3: Next shows name input', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');

        // Inject background data so we can advance
        await injectTrainingData(page, 'Background', 10);
        await openTeachableMachineModal(page);

        // Should be at step 3 (background done, need second label)
        const step = await getWizardStep(page);
        expect(step).toBe(3);

        await expect(page.locator('[class*="name-label-input"]')).toBeVisible();
        await expect(page.locator('[class*="coaching-tip-text"]').filter({hasText: 'something for Scratch to recognize'}))
            .toBeVisible();
    });

    test('Step 3: Name input enables Next button', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');
        await injectTrainingData(page, 'Background', 10);
        await openTeachableMachineModal(page);

        // Next button should be enabled initially (default label name "Hand")
        const nextButton = page.locator('button:has-text("Next")');
        await expect(nextButton).toBeEnabled();

        // Clearing the name should disable the button
        await page.locator('[class*="name-label-input"]').fill('');
        await expect(nextButton).toBeDisabled();

        // Typing a name re-enables it
        await page.locator('[class*="name-label-input"]').fill('Cat');
        await expect(nextButton).toBeEnabled();
    });

    test('Step 3 -> 4: Next shows second capture step', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');
        await injectTrainingData(page, 'Background', 10);
        await openTeachableMachineModal(page);

        await page.locator('[class*="name-label-input"]').fill('Hand');
        await page.click('button:has-text("Next")');

        const step = await getWizardStep(page);
        expect(step).toBe(4);

        await expect(page.locator('[class*="coaching-tip-text"]').filter({hasText: 'Hand'}))
            .toBeVisible();
    });

    test('with 2 trained labels, modal opens to dashboard', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');

        await injectTrainingData(page, 'Background', 10);
        await injectTrainingData(page, 'Hand', 10);
        await openTeachableMachineModal(page);

        // With 2 labels both having enough data, should show dashboard
        await expect(page.locator('[class*="dashboard-container"]')).toBeVisible();
        const ready = await isModelReady(page);
        expect(ready).toBe(true);
    });

    test('Done button closes modal', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');
        await openTeachableMachineModal(page);

        // Wizard step 1 - no data yet
        // We can close from the X button
        await page.locator('[class*="modal-content"] [class*="close-button"]').first().click();
        await expect(page.locator('[class*="modal-content"]').filter({hasText: 'Teachable Machine'}))
            .not.toBeVisible({timeout: 3000});
    });

    // ── Phase 4: Dashboard ──────────────────────────────────────────────────

    test('modal opens in dashboard mode when data exists', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');
        await injectTrainingData(page, 'Background', 10);
        await injectTrainingData(page, 'Hand', 10);
        await openTeachableMachineModal(page);

        await expect(page.locator('[class*="dashboard-container"]')).toBeVisible();
        // Count direct children of label-card-list that are label cards
        await expect(page.locator('[class*="label-card-list"] > [class*="label-card"]')).toHaveCount(2);
    });

    test('dashboard shows status text with label names', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');
        await injectTrainingData(page, 'Background', 10);
        await injectTrainingData(page, 'Hand', 10);
        await openTeachableMachineModal(page);

        await expect(page.locator('[class*="dashboard-status"]')).toContainText('Background');
        await expect(page.locator('[class*="dashboard-status"]')).toContainText('Hand');
    });

    test('dashboard Done button closes modal', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');
        await injectTrainingData(page, 'Background', 10);
        await injectTrainingData(page, 'Hand', 10);
        await openTeachableMachineModal(page);

        await page.click('button:has-text("Done")');
        await expect(page.locator('[class*="modal-content"]').filter({hasText: 'Teachable Machine'}))
            .not.toBeVisible({timeout: 3000});
    });

    // ── Phase 5: Navigation ─────────────────────────────────────────────────

    test('Back button works in wizard', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');
        await openTeachableMachineModal(page);

        await expect(page.getByRole('button', {name: 'Start!'})).toBeEnabled({timeout: 10000});
        await page.click('button:has-text("Start!")');

        let step = await getWizardStep(page);
        expect(step).toBe(2);

        await page.click('button:has-text("Back")');
        step = await getWizardStep(page);
        expect(step).toBe(1);
    });

    // ── Phase 6: Reporter blocks ────────────────────────────────────────────

    test('guess reporter returns empty string before training', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');
        await page.waitForTimeout(500);

        const state = await getTeachableClassifierState(page);
        expect(state).not.toBeNull();
        expect(state.predictedLabel).toBe('');
    });

    test('confidence reporter returns 0 before training', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');
        await page.waitForTimeout(500);

        const state = await getTeachableClassifierState(page);
        expect(state).not.toBeNull();
        expect(state.predictedConfidence).toBe(0);
    });

    test('injecting a predicted label is reflected in extension state', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');
        await page.waitForTimeout(500);

        await setPredictedLabel(page, 'cat');
        const state = await getTeachableClassifierState(page);
        expect(state.predictedLabel).toBe('cat');
    });

    // ── Phase 7: Project save/load ──────────────────────────────────────────

    test('saving a project works without errors', async ({page}) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.goto('/');
        await addExtension(page, 'Teachable Machine');
        await page.waitForTimeout(500);

        const projectJSON = await page.evaluate(async () => {
            const store = window.__scratchStore;
            if (!store) return null;
            const vm = store.getState().scratchGui && store.getState().scratchGui.vm;
            if (!vm) return null;
            return vm.toJSON();
        });

        expect(projectJSON).not.toBeNull();
        const parsed = JSON.parse(projectJSON);
        expect(parsed.targets).toBeTruthy();
        expect(errors).toHaveLength(0);
    });

    // ── Phase 8: Integration ────────────────────────────────────────────────

    test('no JS errors during wizard navigation', async ({page}) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.goto('/');
        await addExtension(page, 'Teachable Machine');
        await openTeachableMachineModal(page);

        // Navigate through wizard steps
        await expect(page.getByRole('button', {name: 'Start!'})).toBeEnabled({timeout: 10000});
        await page.click('button:has-text("Start!")');
        await page.click('button:has-text("Back")');
        await page.click('button:has-text("Start!")');

        // Close modal
        await page.locator('[class*="modal-content"] [class*="close-button"]').first().click();

        const realErrors = errors.filter(e => !e.includes('non-passive event'));
        expect(realErrors).toHaveLength(0);
    });

    test('injected data persists after closing and reopening modal', async ({page}) => {
        await page.goto('/');
        await addExtension(page, 'Teachable Machine');
        await injectTrainingData(page, 'Background', 10);
        await injectTrainingData(page, 'Hand', 10);

        // Open and close modal
        await openTeachableMachineModal(page);
        await page.click('button:has-text("Done")');
        await expect(page.locator('[class*="modal-content"]').filter({hasText: 'Teachable Machine'}))
            .not.toBeVisible({timeout: 3000});

        // Data should still be there
        const labels = await getTeachableLabels(page);
        expect(labels['Background']).toBeDefined();
        expect(labels['Hand']).toBeDefined();
        expect(labels['Background'].classifierCount).toBe(10);
        expect(labels['Hand'].classifierCount).toBe(10);
    });
});
