// @ts-check
// Drag across the stage canvas to orbit the 3D Pop-Up camera (drag mode). The
// pointer is held down across several moves so the extension's frame loop samples
// the motion and accumulates the rotation.
const dragStage = async (page, stage, fromFrac, toFrac) => {
    const box = await stage.boundingBox();
    const y = box.y + (box.height * 0.5);
    await page.mouse.move(box.x + (box.width * fromFrac), y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
        const f = fromFrac + ((toFrac - fromFrac) * (i / 12));
        await page.mouse.move(box.x + (box.width * f), y);
        await page.waitForTimeout(40);
    }
    await page.waitForTimeout(80);
    await page.mouse.up();
};

// Click a block in the palette by (partial) text. Clicking a palette block runs it.
// Blockly's flyout scrolls with its own SVG scrollbars, which Playwright's automatic
// scroll-into-view can't drive, so wheel-scroll the flyout until the block is inside
// its visible area first (a no-op when it already is).
const clickBlock = async (page, text) => {
    const target = page.getByText(text, {exact: false}).first();
    const flyout = page.locator('.blocklyFlyout').first();
    const fb = await flyout.boundingBox();
    if (fb) {
        await page.mouse.move(fb.x + (fb.width / 2), fb.y + (fb.height / 2));
        for (let i = 0; i < 60; i++) {
            const bb = await target.boundingBox();
            if (bb && bb.y >= fb.y && bb.y + bb.height <= fb.y + fb.height) break;
            const centreDelta = bb ? (bb.y + (bb.height / 2)) - (fb.y + (fb.height / 2)) : 1;
            await page.mouse.wheel(0, Math.sign(centreDelta) * 100);
            await page.waitForTimeout(50);
        }
    }
    await target.click();
};

// Dismiss the "3D Pop-Up" welcome modal that opens when the extension is added.
const dismissExamplesModal = async page => {
    const prompt = page.getByText('Open an example to get started:', {exact: false});
    await prompt.waitFor({timeout: 6000}).catch(() => {});
    const close = page.getByRole('button', {name: 'Close'});
    if (await close.count()) {
        await close.first().click();
        await prompt.waitFor({state: 'detached'}).catch(() => {});
    }
};

module.exports = {dragStage, dismissExamplesModal, clickBlock};
