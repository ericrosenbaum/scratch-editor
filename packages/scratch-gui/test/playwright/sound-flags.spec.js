import {test, expect} from '@playwright/test';

const loadEditor = async page => {
    await page.goto('http://localhost:8601/');
    // Wait for the VM to load the default project (cat sprite with a Meow sound).
    await page.waitForFunction(() => {
        const vm = window.vm;
        return vm && vm.editingTarget && vm.editingTarget.sprite &&
            vm.editingTarget.sprite.sounds.length > 0;
    }, {timeout: 30000});
};

const openSoundEditor = async page => {
    await page.getByText('Sounds', {exact: true}).click();
    await expect(page.getByRole('button', {name: 'Add flag'})).toBeVisible({timeout: 15000});
};

const stageBroadcastNames = async page => page.evaluate(() => {
    const stage = window.vm.runtime.getTargetForStage();
    return Object.values(stage.variables)
        .filter(v => v.type === 'broadcast_msg')
        .map(v => v.name);
});

const soundMarkers = async page => page.evaluate(() =>
    (window.vm.editingTarget.sprite.sounds[0].markers || []).map(m => ({
        time: m.time,
        broadcastId: m.broadcastId
    }))
);

test.describe('Sound flags', () => {
    test('add a flag creates a marker and a collision-free broadcast', async ({page}) => {
        await loadEditor(page);
        await openSoundEditor(page);

        expect(await soundMarkers(page)).toHaveLength(0);

        await page.getByRole('button', {name: 'Add flag'}).click();
        await expect.poll(() => soundMarkers(page)).toHaveLength(1);

        const names = await stageBroadcastNames(page);
        expect(names).toContain('Meow flag 1');

        // Adding another flag must not collide with the first broadcast.
        await page.getByRole('button', {name: 'Add flag'}).click();
        await expect.poll(() => soundMarkers(page)).toHaveLength(2);
        const names2 = await stageBroadcastNames(page);
        expect(names2).toContain('Meow flag 1');
        expect(names2).toContain('Meow flag 2');
    });

    test('flag broadcast survives a workspace refresh (Risk 1) and persists across save/load', async ({page}) => {
        await loadEditor(page);
        await openSoundEditor(page);
        await page.getByRole('button', {name: 'Add flag'}).click();
        await expect.poll(() => soundMarkers(page)).toHaveLength(1);

        // refreshWorkspace() garbage-collects unreferenced broadcasts; a flag's
        // broadcast (with no `when I receive` block) must NOT be deleted.
        await page.evaluate(() => window.vm.refreshWorkspace());
        expect(await stageBroadcastNames(page)).toContain('Meow flag 1');

        // Save to JSON and reload into a fresh VM-equivalent; markers + broadcast survive.
        const survived = await page.evaluate(async () => {
            const json = window.vm.toJSON();
            await window.vm.loadProject(json);
            const stage = window.vm.runtime.getTargetForStage();
            const broadcastNames = Object.values(stage.variables)
                .filter(v => v.type === 'broadcast_msg').map(v => v.name);
            const markers = window.vm.editingTarget.sprite.sounds[0].markers || [];
            return {broadcastNames, markerCount: markers.length, markerBroadcastId: markers[0] && markers[0].broadcastId};
        });
        expect(survived.markerCount).toBe(1);
        expect(survived.broadcastNames).toContain('Meow flag 1');
        // The marker still links to a real broadcast variable.
        const linked = await page.evaluate(id => {
            const v = window.vm.runtime.getTargetForStage().variables[id];
            return v && v.name;
        }, survived.markerBroadcastId);
        expect(linked).toBe('Meow flag 1');
    });

    test('rename a flag broadcast updates the variable (Risk 2)', async ({page}) => {
        await loadEditor(page);
        await openSoundEditor(page);
        await page.getByRole('button', {name: 'Add flag'}).click();
        await expect.poll(() => soundMarkers(page)).toHaveLength(1);

        const broadcastId = (await soundMarkers(page))[0].broadcastId;
        await page.evaluate(id => window.vm.renameSoundMarkerBroadcast(id, 'middle'), broadcastId);

        const names = await stageBroadcastNames(page);
        expect(names).toContain('middle');
        expect(names).not.toContain('Meow flag 1');
        // The marker still points at the same (now-renamed) broadcast id.
        expect((await soundMarkers(page))[0].broadcastId).toBe(broadcastId);
    });

    test('delete a flag removes the marker and reclaims the broadcast', async ({page}) => {
        await loadEditor(page);
        await openSoundEditor(page);
        await page.getByRole('button', {name: 'Add flag'}).click();
        await expect.poll(() => soundMarkers(page)).toHaveLength(1);
        const broadcastId = (await soundMarkers(page))[0].broadcastId;

        await page.evaluate(id => window.vm.deleteSoundMarker(0, id), broadcastId);
        await expect.poll(() => soundMarkers(page)).toHaveLength(0);
        // Unreferenced broadcast is garbage-collected.
        expect(await stageBroadcastNames(page)).not.toContain('Meow flag 1');
    });

    test('playback crossing a flag fires its broadcast (Risk 3)', async ({page}) => {
        await loadEditor(page);
        await openSoundEditor(page);
        await page.getByRole('button', {name: 'Add flag'}).click();
        await expect.poll(() => soundMarkers(page)).toHaveLength(1);

        const fired = await page.evaluate(async () => {
            const vm = window.vm;
            // Put the marker very early so it fires shortly after playback starts.
            const marker = vm.editingTarget.sprite.sounds[0].markers[0];
            vm.setSoundMarkerTime(0, marker.broadcastId, 0.02);
            const expectedName = vm.runtime.getTargetForStage().variables[marker.broadcastId].name;

            // Spy on the broadcast-hat trigger.
            const received = [];
            const originalStartHats = vm.runtime.startHats.bind(vm.runtime);
            vm.runtime.startHats = (opcode, fields, target) => {
                if (opcode === 'event_whenbroadcastreceived' && fields && fields.BROADCAST_OPTION) {
                    received.push(fields.BROADCAST_OPTION);
                }
                return originalStartHats(opcode, fields, target);
            };

            // Resume audio (headless contexts can start suspended) and play the sound
            // through the real block primitive so the marker watcher is registered.
            if (vm.runtime.audioEngine && vm.runtime.audioEngine.audioContext &&
                vm.runtime.audioEngine.audioContext.resume) {
                try {
                    await vm.runtime.audioEngine.audioContext.resume();
                } catch (e) { /* ignore */ }
            }
            vm.runtime._primitives.sound_play({SOUND_MENU: 'Meow'}, {target: vm.editingTarget});

            // Wait up to ~2s of real time for the marker to be crossed.
            const start = Date.now();
            while (Date.now() - start < 2000) {
                if (received.includes(expectedName)) break;
                await new Promise(r => setTimeout(r, 50));
            }
            vm.runtime.startHats = originalStartHats;
            return {received, expectedName};
        });

        expect(fired.received).toContain(fired.expectedName);
    });
});
