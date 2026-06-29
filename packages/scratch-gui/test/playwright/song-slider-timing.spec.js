// @ts-check
// Issue 4 — parameter sliders used to hitch playback because every drag pixel
// committed the whole song to Redux (undo push + re-render) and a BPM change
// tore down and rebuilt the scheduler. Now: a slider drag applies only a cheap
// live audio update and commits ONCE on release, and a BPM change is applied
// live (no transport restart). These specs assert that behavior.
const {test, expect} = require('@playwright/test');
const {openSongMaker} = require('./song-test-helpers');

// Drive a controlled range input through N values as a drag would (React's
// onChange fires on the native 'input' event), then release with a pointerup.
const dragRange = (page, ariaLabel, values) => page.evaluate(arg => {
    const input = document.querySelector(`input[aria-label="${arg.ariaLabel}"]`);
    if (!input) throw new Error(`no slider ${arg.ariaLabel}`);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    for (const v of arg.values) {
        setter.call(input, String(v));
        input.dispatchEvent(new Event('input', {bubbles: true}));
    }
    // Release ends the drag → the editor commits the final value once.
    window.dispatchEvent(new Event('pointerup'));
}, {ariaLabel, values});

test('a volume-slider drag commits to the song exactly once (on release)', async ({page}) => {
    await openSongMaker(page);
    await page.evaluate(() => {
        window.__songsChanged = 0;
        window.__SONG_TEST__.vm.runtime.on('SONGS_CHANGED', () => {
            window.__songsChanged++;
        });
    });

    // Many input events (the "drag"), then one release.
    await dragRange(page, 'Volume', [70, 60, 50, 40, 35, 30]);

    // The heavy song commit happened once, not once per drag step.
    expect(await page.evaluate(() => window.__songsChanged)).toBe(1);
    // The final value is what got persisted.
    expect(await page.evaluate(() => window.__SONG_TEST__.vm.runtime.song.tracks[0].volume)).toBe(30);
});

test('a volume drag during playback updates audio live without restarting the transport', async ({page}) => {
    await openSongMaker(page);
    await page.evaluate(() => {
        window.__starts = 0;
        window.__SONG_TEST__.vm.runtime.songPlayback.on('start', () => {
            window.__starts++;
        });
    });

    await page.locator('.song-editor-transport .transport-btn.play').click();
    await expect(page.locator('.transport-btn.play.is-playing')).toHaveCount(1);

    const trackId = await page.evaluate(() => window.__SONG_TEST__.vm.runtime.song.tracks[0].trackId);
    await dragRange(page, 'Volume', [80, 65, 50, 40]);

    // Live audio responded mid-drag: the scheduler's per-track volume cache
    // (fader position 0..1) reflects the dragged value…
    const cached = await page.evaluate(id => {
        const s = window.__SONG_TEST__.vm.runtime.songPlayback._scheduler;
        return s ? s._volumeCache[id] : null;
    }, trackId);
    expect(cached).not.toBeNull();
    expect(cached).toBeLessThan(0.7); // dragged down toward 40/100

    // …and the transport was never restarted (a restart === audible glitch).
    expect(await page.evaluate(() => window.__starts)).toBe(1);
    await expect(page.locator('.transport-btn.play.is-playing')).toHaveCount(1);

    await page.locator('.song-editor-transport .transport-btn.play').click();
});

test('a BPM change during playback applies live (override set, no restart)', async ({page}) => {
    await openSongMaker(page);
    await page.evaluate(() => {
        window.__starts = 0;
        window.__SONG_TEST__.vm.runtime.songPlayback.on('start', () => {
            window.__starts++;
        });
    });

    await page.locator('.song-editor-transport .transport-btn.play').click();
    await expect(page.locator('.transport-btn.play.is-playing')).toHaveCount(1);

    const bpm = page.getByLabel('BPM', {exact: true});
    await bpm.fill('160');
    await bpm.press('Enter'); // Enter commits (Tab would focus the popover slider, not commit)

    // The running scheduler picked up the tempo via the live override path…
    expect(await page.evaluate(() =>
        window.__SONG_TEST__.vm.runtime.songPlayback.getTempo())).toBe(160);
    // …and the song persisted the new tempo…
    expect(await page.evaluate(() => window.__SONG_TEST__.vm.runtime.song.tempo)).toBe(160);
    // …with no transport restart.
    expect(await page.evaluate(() => window.__starts)).toBe(1);

    await page.locator('.song-editor-transport .transport-btn.play').click();
});
