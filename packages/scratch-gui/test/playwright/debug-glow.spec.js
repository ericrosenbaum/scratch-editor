const {test, expect} = require('@playwright/test');

test('debug: does green flag cause glow error on fresh project?', async ({page}) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/');
    const webglOverlay = page.locator('.ReactModal__Overlay');
    if (await webglOverlay.isVisible({timeout: 3000}).catch(() => false)) {
        await page.evaluate(() => {
            document.querySelectorAll('.ReactModalPortal').forEach(el => el.remove());
        });
    }
    await page.waitForSelector('[class*="blocks_blocks"]', {timeout: 30000});
    await page.waitForTimeout(1000);

    await page.waitForFunction(() => window.__scratchStore, null, {timeout: 10000});

    // Green flag on fresh project (no tip blocks added)
    await page.evaluate(() => {
        const store = window.__scratchStore;
        const vm = store.getState().scratchGui.vm;
        vm.greenFlag();
    });
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
        const store = window.__scratchStore;
        const vm = store.getState().scratchGui.vm;
        vm.stopAll();
    });

    console.log('Errors on fresh project:', JSON.stringify(errors));
    expect(errors).toEqual([]);
});

test('debug: does green flag cause glow error AFTER adding tip blocks?', async ({page}) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/');
    const webglOverlay = page.locator('.ReactModal__Overlay');
    if (await webglOverlay.isVisible({timeout: 3000}).catch(() => false)) {
        await page.evaluate(() => {
            document.querySelectorAll('.ReactModalPortal').forEach(el => el.remove());
        });
    }
    await page.waitForSelector('[class*="blocks_blocks"]', {timeout: 30000});
    await page.waitForTimeout(1000);

    await page.waitForFunction(() => window.__scratchStore, null, {timeout: 10000});

    // Add tip blocks via the UI
    await page.evaluate(() => {
        const store = window.__scratchStore;
        store.dispatch({type: 'scratch-gui/unstuck/OPEN_UNSTUCK'});
        store.dispatch({type: 'scratch-gui/unstuck/SET_TIP', tipId: 'nothing-happens'});
    });
    await page.waitForSelector('[class*="unstuck-container"], [class*="unstuckContainer"]', {timeout: 5000});

    // The example code is shown directly now (no expand step needed); give the
    // block preview a moment to render.
    await page.waitForTimeout(400);

    const addButton = page.locator(
        'button[class*="add-button"], button[class*="addButton"], ' +
        'button[class*="add-to-project"], button[class*="addToProject"]'
    );
    await expect(addButton).toBeVisible({timeout: 5000});
    await addButton.click();
    await page.waitForTimeout(2000);

    // Check errors after adding
    const errorsAfterAdd = [...errors];
    console.log('Errors after add:', JSON.stringify(errorsAfterAdd));

    // Now green flag
    await page.evaluate(() => {
        const store = window.__scratchStore;
        const vm = store.getState().scratchGui.vm;
        vm.greenFlag();
    });
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
        const store = window.__scratchStore;
        const vm = store.getState().scratchGui.vm;
        vm.stopAll();
    });
    await page.waitForTimeout(500);

    console.log('All errors:', JSON.stringify(errors));
    const glowErrors = errors.filter(e => e.includes('glow'));
    expect(glowErrors, `Glow errors: ${JSON.stringify(glowErrors)}`).toEqual([]);
});
