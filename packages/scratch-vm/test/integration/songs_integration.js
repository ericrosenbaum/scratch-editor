/**
 * End-to-end integration tests for the Song Maker data model.
 *
 * These tests exercise the full save/load pipeline through `VirtualMachine`
 * (the same path the GUI uses): JSON → scratch-parser validate → sb3.deserialize
 * → installTargets → handleProjectLoaded; and the inverse: vm.toJSON() →
 * project.json.
 *
 * They cover the bugs reported after the songs-go-global refactor:
 *   - Saving and re-loading a project preserves songs.
 *   - Loading a project that uses the old per-sprite `songs` shape hoists those
 *     songs onto the global project list (with dedupe on songId).
 *   - Importing a .sprite3 does NOT wipe out an existing project's songs.
 *   - PROJECT_LOADED fires SONGS_CHANGED so the Songs extension's menus (which
 *     drive the dropdown displays in the workspace) get rebuilt from the
 *     freshly-loaded songs — otherwise blocks fall back to showing songIds.
 *   - Switching the editing target does not change the global songs list.
 */

const path = require('path');
const tap = require('tap');
const fs = require('fs');

const VirtualMachine = require('../../src/index');
const makeTestStorage = require('../fixtures/make-test-storage');

const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/songs');
const projectWithSongs = JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, 'project-with-songs.json'), 'utf8')
);
const projectLegacy = JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, 'project-legacy-per-sprite-songs.json'), 'utf8')
);
const spriteWithLegacySongs = JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, 'sprite-with-legacy-songs.json'), 'utf8')
);

const makeVm = () => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());
    return vm;
};

const loadProjectJson = (vm, projectJson) =>
    // Pass as JSON string — vm.loadProject runs it through scratch-parser, the
    // exact same path used in the browser.
    vm.loadProject(JSON.stringify(projectJson));

tap.test('load → runtime.songs is populated from top-level project songs', t => {
    const vm = makeVm();
    loadProjectJson(vm, projectWithSongs).then(() => {
        t.equal(vm.runtime.songs.length, 2, 'two songs loaded');
        t.equal(vm.runtime.songs[0].name, 'Verse', 'first song name preserved');
        t.equal(vm.runtime.songs[0].tempo, 110, 'tempo preserved');
        t.equal(vm.runtime.songs[1].name, 'Bridge', 'second song name preserved');
        t.equal(vm.runtime.songs[1].tracks[0].drumLanes.length, 2, 'drumLanes preserved');
        t.notOk(vm.editingTarget.sprite.songs, 'sprite has no per-sprite songs array');
        t.end();
    }).catch(e => { t.fail(e.message || e); t.end(); });
});

tap.test('save → project JSON serializes songs at the top level (not per-target)', t => {
    const vm = makeVm();
    loadProjectJson(vm, projectWithSongs).then(() => {
        const serialized = JSON.parse(vm.toJSON());
        t.ok(Array.isArray(serialized.songs), 'top-level songs array present');
        t.equal(serialized.songs.length, 2, 'both songs serialized');
        const names = serialized.songs.map(s => s.name).sort();
        t.same(names, ['Bridge', 'Verse'], 'both song names round-trip');
        const targetHasSongs = serialized.targets.some(target => Array.isArray(target.songs));
        t.notOk(targetHasSongs, 'no target carries a songs array');
        t.end();
    }).catch(e => { t.fail(e.message || e); t.end(); });
});

tap.test('save → load round-trip preserves songs', t => {
    const vm1 = makeVm();
    loadProjectJson(vm1, projectWithSongs).then(() => {
        const savedJson = vm1.toJSON();
        const vm2 = makeVm();
        return vm2.loadProject(savedJson).then(() => {
            t.equal(vm2.runtime.songs.length, 2, 'songs survived round-trip');
            t.equal(vm2.runtime.songs[0].name, 'Verse', 'first song name');
            t.equal(vm2.runtime.songs[0].tracks[0].notes.length, 2, 'piano notes');
            t.equal(vm2.runtime.songs[0].tracks[0].notes[0].pitch, 60, 'pitch preserved');
            t.equal(vm2.runtime.songs[0].tracks[0].notes[0].velocity, 100, 'velocity preserved');
            t.equal(vm2.runtime.songs[1].tracks[0].kind, 'drum', 'drum kind preserved');
            t.end();
        });
    }).catch(e => { t.fail(e.message || e); t.end(); });
});

tap.test('legacy per-sprite songs are hoisted to runtime.songs on load (dedup)', t => {
    const vm = makeVm();
    loadProjectJson(vm, projectLegacy).then(() => {
        // Stage carries song-legacy-stage; Sprite1 carries song-legacy-sprite
        // and a duplicate of song-legacy-stage. Dedupe by songId → 2 entries.
        t.equal(vm.runtime.songs.length, 2, 'both unique songs hoisted, dupes deduped');
        const ids = vm.runtime.songs.map(s => s.songId).sort();
        t.same(ids, ['song-legacy-sprite', 'song-legacy-stage'], 'correct songIds');
        t.notOk(vm.runtime.targets[0].sprite.songs, 'stage no longer carries songs');
        t.notOk(vm.runtime.targets[1].sprite.songs, 'sprite no longer carries songs');
        t.end();
    }).catch(e => { t.fail(e.message || e); t.end(); });
});

tap.test('importing a .sprite3 does not wipe project songs', t => {
    const vm = makeVm();
    loadProjectJson(vm, projectWithSongs).then(() => {
        t.equal(vm.runtime.songs.length, 2, 'project starts with 2 songs');
        // Import a sprite that carries legacy per-sprite songs of its own.
        // Those should be dropped on import (they belong to the source
        // project), and the existing project songs must not be wiped.
        return vm.addSprite(JSON.stringify(spriteWithLegacySongs)).then(() => {
            t.equal(vm.runtime.songs.length, 2, 'project songs preserved after sprite import');
            const ids = vm.runtime.songs.map(s => s.songId).sort();
            t.same(ids, ['song-bridge', 'song-verse'], 'still the original two songs');
            // The newly-imported sprite must not carry a per-sprite songs field
            // (we strip on import so it doesn't re-emit on next serialize).
            const importedTarget = vm.runtime.targets.find(target =>
                target.sprite && target.sprite.name && target.sprite.name.indexOf('ImportedSprite') === 0);
            t.ok(importedTarget, 'imported sprite is present');
            t.notOk(importedTarget.sprite.songs, 'imported sprite has no songs field');
            t.end();
        });
    }).catch(e => { t.fail(e.message || e); t.end(); });
});

tap.test('PROJECT_LOADED triggers SONGS_CHANGED so menus refresh', t => {
    const vm = makeVm();
    let songsChangedFired = 0;
    let lastSongsAtEmit = null;
    vm.runtime.on('SONGS_CHANGED', () => {
        songsChangedFired++;
        lastSongsAtEmit = vm.runtime.songs.slice();
    });
    loadProjectJson(vm, projectWithSongs).then(() => {
        t.ok(songsChangedFired >= 1,
            `SONGS_CHANGED fired at least once after PROJECT_LOADED (got ${songsChangedFired})`);
        t.equal(lastSongsAtEmit.length, 2,
            'runtime.songs already reflects loaded project when SONGS_CHANGED fires');
        t.end();
    }).catch(e => { t.fail(e.message || e); t.end(); });
});

tap.test('Songs extension menus reflect loaded project songs (no stale ID display)', t => {
    const vm = makeVm();
    // Pre-load the songs extension before loading the project, simulating the
    // GUI scenario where the user previously used Songs in another project.
    vm.runtime.extensionManager.loadExtensionIdSync('songs');
    loadProjectJson(vm, projectWithSongs).then(() => {
        // After PROJECT_LOADED, the extension's menu items must include the
        // freshly loaded songs by NAME (not just by ID). When the menu omits
        // a songId, scratch-blocks falls back to displaying the raw songId,
        // which looks like garbage to the user.
        const Scratch3SongsBlocks = require('../../src/extensions/scratch3_songs');
        const ext = new Scratch3SongsBlocks(vm.runtime);
        const info = ext.getInfo();
        const songMenuItems = info.menus.SONG.items;
        const names = songMenuItems.map(item => item.text);
        const values = songMenuItems.map(item => item.value);
        t.ok(names.indexOf('Verse') >= 0, 'menu contains "Verse" by name');
        t.ok(names.indexOf('Bridge') >= 0, 'menu contains "Bridge" by name');
        t.ok(values.indexOf('song-verse') >= 0, 'menu has the verse songId');
        t.ok(values.indexOf('song-bridge') >= 0, 'menu has the bridge songId');
        // Critical: the text of each entry should be the NAME, not the songId.
        // The previous bug was that menu text and value coincided (both songId).
        for (const item of songMenuItems) {
            if (item.value && item.value !== '') {
                t.not(item.text, item.value,
                    `menu text "${item.text}" is the song name, not the songId`);
            }
        }
        t.end();
    }).catch(e => { t.fail(e.message || e); t.end(); });
});

tap.test('Songs extension requests a toolbox refresh after a project loads', t => {
    const vm = makeVm();
    vm.runtime.extensionManager.loadExtensionIdSync('songs');
    let toolboxRefreshes = 0;
    vm.runtime.on('TOOLBOX_EXTENSIONS_NEED_UPDATE', () => toolboxRefreshes++);
    loadProjectJson(vm, projectWithSongs).then(() => {
        t.ok(toolboxRefreshes >= 1,
            `toolbox refresh requested after project load (got ${toolboxRefreshes})`);
        // After the refresh, the menus should reflect the new songs.
        const info = vm.runtime._blockInfo.find(b => b.id === 'songs');
        t.ok(info, 'songs categoryInfo present in runtime');
        t.end();
    }).catch(e => { t.fail(e.message || e); t.end(); });
});

tap.test('switching editing target does not change the global songs list', t => {
    const vm = makeVm();
    loadProjectJson(vm, projectWithSongs).then(() => {
        const stage = vm.runtime.targets.find(target => target.isStage);
        const sprite = vm.runtime.targets.find(target => !target.isStage);
        t.ok(stage && sprite, 'have both stage and a sprite');

        const before = vm.runtime.songs.slice();
        // Switch from default editing target to stage and back. Whichever sprite
        // is being edited, runtime.songs is always the same global list.
        vm.setEditingTarget(stage.id);
        t.same(vm.runtime.songs, before, 'songs unchanged when stage becomes editing target');
        vm.setEditingTarget(sprite.id);
        t.same(vm.runtime.songs, before, 'songs unchanged when sprite becomes editing target');

        // The Songs extension's _findSong should still find any song by id
        // regardless of which target is editing.
        const Scratch3SongsBlocks = require('../../src/extensions/scratch3_songs');
        const ext = new Scratch3SongsBlocks(vm.runtime);
        t.ok(ext._findSong('song-verse'), 'verse findable from sprite');
        vm.setEditingTarget(stage.id);
        t.ok(ext._findSong('song-verse'), 'verse still findable from stage');
        t.end();
    }).catch(e => { t.fail(e.message || e); t.end(); });
});

tap.test('add / rename / delete songs via VM API mutate the global list (not a sprite)', t => {
    const vm = makeVm();
    loadProjectJson(vm, projectWithSongs).then(() => {
        const initialCount = vm.runtime.songs.length;
        let songsChangedCount = 0;
        vm.runtime.on('SONGS_CHANGED', () => songsChangedCount++);

        vm.addSong({
            songId: 'song-new',
            name: 'Outro',
            tempo: 80,
            lengthSteps: 8,
            stepsPerBeat: 4,
            tracks: []
        });
        t.equal(vm.runtime.songs.length, initialCount + 1, 'addSong appends');
        t.ok(songsChangedCount >= 1, 'addSong fires SONGS_CHANGED');

        vm.renameSong(vm.runtime.songs.length - 1, 'Outro v2');
        t.equal(vm.runtime.songs[vm.runtime.songs.length - 1].name, 'Outro v2',
            'rename applied to global list');

        vm.deleteSong(vm.runtime.songs.length - 1);
        t.equal(vm.runtime.songs.length, initialCount, 'deleteSong removes');

        // Confirm no sprite ended up with a songs array as a side-effect.
        for (const target of vm.runtime.targets) {
            t.notOk(target.sprite.songs,
                `sprite ${target.sprite.name} carries no per-sprite songs`);
        }
        t.end();
    }).catch(e => { t.fail(e.message || e); t.end(); });
});

tap.test('loading a different project replaces runtime.songs entirely', t => {
    const vm = makeVm();
    loadProjectJson(vm, projectWithSongs).then(() => {
        t.equal(vm.runtime.songs.length, 2, 'first project has 2 songs');
        // Load a project with no songs — runtime.songs should reset.
        const noSongsProject = JSON.parse(JSON.stringify(projectWithSongs));
        delete noSongsProject.songs;
        return vm.loadProject(JSON.stringify(noSongsProject)).then(() => {
            t.equal(vm.runtime.songs.length, 0,
                'loading a no-songs project clears runtime.songs');
            t.end();
        });
    }).catch(e => { t.fail(e.message || e); t.end(); });
});

tap.test('binary .sb3 round-trip via saveProjectSb3 preserves songs', t => {
    const vm = makeVm();
    loadProjectJson(vm, projectWithSongs).then(() => {
        // saveProjectSb3 returns the same zip blob the GUI download button
        // produces. Loading it back through loadProject is the round-trip
        // that real users perform with the Save / Open project flow.
        return vm.saveProjectSb3();
    }).then(blob => {
        // In node, JSZip returns a Buffer-like for type:'nodebuffer', but
        // 'blob' returns a Blob-shim with arrayBuffer(). Normalise to a
        // buffer either way for re-loading.
        const asArrayBuffer = blob.arrayBuffer ?
            blob.arrayBuffer() :
            Promise.resolve(blob);
        return asArrayBuffer.then(buf => {
            const vm2 = makeVm();
            return vm2.loadProject(buf).then(() => {
                t.equal(vm2.runtime.songs.length, 2,
                    'songs survived a .sb3 zip round-trip');
                const ids = vm2.runtime.songs.map(s => s.songId).sort();
                t.same(ids, ['song-bridge', 'song-verse'],
                    'both songIds round-trip');
                t.equal(vm2.runtime.songs[0].tracks[0].notes[0].pitch, 60,
                    'note pitch round-trips through zip');
                t.end();
            });
        });
    }).catch(e => { t.fail(e.message || e); t.end(); });
});
