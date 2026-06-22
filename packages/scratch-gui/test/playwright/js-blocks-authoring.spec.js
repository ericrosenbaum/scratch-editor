// @ts-check
const {test, expect} = require('@playwright/test');

/**
 * End-to-end: author a JS-powered block through the real UI (Edit menu →
 * My Block Libraries → New library → + Block → edit document → Save), then
 * confirm via window.vm that the block was registered and actually runs.
 */
test('author a JS-powered reporter block and run it in the VM', async ({page}) => {
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.stack || err.message || String(err)));

    // window.prompt (library name) and window.confirm are answered automatically.
    page.on('dialog', dialog => {
        if (dialog.type() === 'prompt') return dialog.accept('Math Lib');
        return dialog.accept();
    });

    await page.goto('index.html');
    await expect(page.getByText('Backpack', {exact: true})).toBeVisible({timeout: 30000});

    // Open the Edit menu, then the libraries manager.
    await page.getByText('Edit', {exact: true}).click();
    await page.getByText('My Block Libraries…').click();

    // Create a library and start a new block.
    await page.getByTestId('js-new-library').click();
    await page.locator('[data-testid^="js-new-block-"]').first().click();

    // The code editor opens with a default template; replace it with a reporter.
    const editor = page.getByTestId('js-block-code-editor');
    await expect(editor).toBeVisible();
    const doc = [
        '---',
        'type: reporter',
        'text: "magic {n}"',
        'inputs:',
        '  n: number = 3',
        '---',
        'return Scratch.args.n + 4;'
    ].join('\n');

    await editor.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await page.keyboard.insertText(doc);

    // Static analysis (in-browser Babel) should report no problems.
    await expect(page.getByTestId('js-block-status-ok')).toBeVisible({timeout: 10000});

    // Save the block.
    await page.getByTestId('js-block-save').click();

    // UI verification: the new block now appears in the library card.
    await expect(page.getByText('magic (n)')).toBeVisible();

    // Execution verification: reach the VM via the React fiber's Redux store,
    // confirm the block registered, and run it.
    const result = await page.evaluate(() => {
        // eslint-disable-next-line no-undef
        const nodes = document.querySelectorAll('*');
        let store = null;
        for (const el of nodes) {
            const key = Object.keys(el).find(k => k.startsWith('__reactFiber'));
            if (!key) continue;
            let fiber = el[key];
            while (fiber) {
                if (fiber.memoizedProps && fiber.memoizedProps.store &&
                    fiber.memoizedProps.store.getState) {
                    store = fiber.memoizedProps.store;
                    break;
                }
                fiber = fiber.return;
            }
            if (store) break;
        }
        if (!store) return {error: 'could not find the Redux store'};
        const state = store.getState().scratchGui;
        const vm = state.vm;
        const libraries = vm.getCustomLibraries();
        if (libraries.length !== 1 || libraries[0].blocks.length !== 1) {
            return {error: `unexpected libraries: ${JSON.stringify(libraries.map(l => l.blocks.length))}`};
        }
        const library = libraries[0];
        const block = library.blocks[0];
        const opcode = `${library.id}_${block.opcode}`;
        const primitive = vm.runtime._primitives[opcode];
        if (!primitive) return {error: `no primitive for ${opcode}`};
        const target = {isStage: false, sprite: {costumes: [], sounds: [], clones: []}};
        const util = {
            runtime: vm.runtime,
            target,
            stackFrame: {},
            thread: {peekStackFrame: () => ({warpMode: false})},
            yield: () => {}
        };
        return {value: primitive({n: 3}, util), type: block.type};
    });

    expect(result.error).toBeUndefined();
    expect(result.type).toBe('reporter');
    expect(Number(result.value)).toBe(7);
    expect(pageErrors, 'uncaught exceptions during authoring').toEqual([]);
});

test('add a built-in example library and run one of its blocks', async ({page}) => {
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.stack || err.message || String(err)));

    await page.goto('index.html');
    await expect(page.getByText('Backpack', {exact: true})).toBeVisible({timeout: 30000});

    await page.getByText('Edit', {exact: true}).click();
    await page.getByText('My Block Libraries…').click();

    // Add the Text example library.
    await page.getByTestId('js-add-example-Text').click();
    await expect(page.getByTestId('js-library-jslib_ex_text')).toBeVisible();

    // Confirm one of its blocks works (reverse "scratch" -> "hctarcs").
    const result = await page.evaluate(() => {
        const nodes = document.querySelectorAll('*');
        let store = null;
        for (const el of nodes) {
            const key = Object.keys(el).find(k => k.startsWith('__reactFiber'));
            if (!key) continue;
            let fiber = el[key];
            while (fiber) {
                if (fiber.memoizedProps && fiber.memoizedProps.store &&
                    fiber.memoizedProps.store.getState) {
                    store = fiber.memoizedProps.store;
                    break;
                }
                fiber = fiber.return;
            }
            if (store) break;
        }
        const vm = store.getState().scratchGui.vm;
        const library = vm.getCustomLibraries().find(l => l.name === 'Text');
        if (!library) return {error: 'Text library not installed'};
        const backwards = library.blocks.find(b => b.signature.text.indexOf('backwards') !== -1);
        const opcode = `${library.id}_${backwards.opcode}`;
        const util = {
            runtime: vm.runtime,
            target: {isStage: false, sprite: {costumes: [], sounds: [], clones: []}},
            stackFrame: {},
            thread: {peekStackFrame: () => ({warpMode: false})},
            yield: () => {}
        };
        return {value: vm.runtime._primitives[opcode]({s: 'scratch'}, util), count: library.blocks.length};
    });

    expect(result.error).toBeUndefined();
    expect(result.count).toBe(5);
    expect(result.value).toBe('hctarcs');
    expect(pageErrors, 'uncaught exceptions adding example').toEqual([]);
});

test('load an example project and run it (Game of Life fills a grid on green flag)', async ({page}) => {
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.stack || err.message || String(err)));

    await page.goto('index.html');
    await expect(page.getByText('Backpack', {exact: true})).toBeVisible({timeout: 30000});

    await page.getByText('Edit', {exact: true}).click();
    await page.getByText('My Block Libraries…').click();
    await page.getByTestId('js-load-project-game-of-life').click();

    // The manager closes; the library is installed and the script is injected.
    const setup = await page.evaluate(() => {
        const nodes = document.querySelectorAll('*');
        let store = null;
        for (const el of nodes) {
            const key = Object.keys(el).find(k => k.startsWith('__reactFiber'));
            if (!key) continue;
            let fiber = el[key];
            while (fiber) {
                if (fiber.memoizedProps && fiber.memoizedProps.store &&
                    fiber.memoizedProps.store.getState) {
                    store = fiber.memoizedProps.store;
                    break;
                }
                fiber = fiber.return;
            }
            if (store) break;
        }
        window.__vmForTest = store.getState().scratchGui.vm;
        const vm = window.__vmForTest;
        const hasLib = vm.getCustomLibraries().some(l => l.name === 'Grids');
        const blocks = vm.editingTarget.blocks._blocks;
        const usesGridBlock = Object.keys(blocks).some(id => blocks[id].opcode.indexOf('jslib_ex_grids') === 0);
        vm.greenFlag();
        return {hasLib, usesGridBlock};
    });
    expect(setup.hasLib).toBe(true);
    expect(setup.usesGridBlock).toBe(true);

    // Let the script run a few frames, then check the grid was randomized.
    await page.waitForTimeout(800);
    const grid = await page.evaluate(() => {
        const vm = window.__vmForTest;
        const store = vm.runtime.getJsBlockStore('jslib_ex_grids');
        const world = store && store.world;
        let live = 0;
        if (world) {
            for (let r = 0; r < world.length; r++) {
                for (let c = 0; c < world[r].length; c++) live += Number(world[r][c]);
            }
        }
        return {rows: world ? world.length : 0, cols: world && world[0] ? world[0].length : 0, live};
    });
    expect(grid.rows).toBe(8);
    expect(grid.cols).toBe(8);
    expect(grid.live).toBeGreaterThan(0); // randomize actually populated cells
    expect(pageErrors, 'uncaught exceptions running project').toEqual([]);
});
