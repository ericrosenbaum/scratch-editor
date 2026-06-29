/**
 * End-to-end integration tests for the Song Maker data model.
 *
 * The Song Maker stores a single, project-wide song at `runtime.song` (not a
 * per-sprite list). These tests exercise the full save/load pipeline through
 * `VirtualMachine` — the same path the GUI uses: JSON → scratch-parser validate
 * → sb3.deserialize → installTargets → handleProjectLoaded, and the inverse
 * vm.toJSON() → project.json — plus the legacy-migration paths that hoist older
 * multi-song / per-sprite shapes onto the single project song.
 *
 * They cover:
 *   - Saving and re-loading a project preserves the song (JSON and binary .sb3).
 *   - A legacy top-level `songs[]` array migrates to the first song.
 *   - Legacy per-sprite `songs` arrays migrate to the project song (and no
 *     target keeps a per-sprite songs/song field afterward).
 *   - Importing a .sprite3 does NOT wipe the project song.
 *   - PROJECT_LOADED fires SONGS_CHANGED so the Song Maker tab re-reads the song.
 *   - Switching the editing target does not change the project song.
 *   - The vm.setSong / vm.updateSong API and the events they emit.
 */

const path = require('path');
const tap = require('tap');
const fs = require('fs');

const VirtualMachine = require('../../src/index');
const makeTestStorage = require('../fixtures/make-test-storage');

const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/songs');
const readFixture = name => fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8');

const projectSingleSong = readFixture('project-single-song.json'); // top-level singular `song`
const projectLegacyPlural = readFixture('project-with-songs.json'); // legacy top-level `songs[]`
const projectLegacyPerSprite = readFixture('project-legacy-per-sprite-songs.json');
const spriteWithLegacySongs = JSON.parse(readFixture('sprite-with-legacy-songs.json'));

const makeVm = () => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());
    return vm;
};

const noTargetCarriesSong = vm => vm.runtime.targets.every(target =>
    !target.sprite.song && !Array.isArray(target.sprite.songs));

tap.test('load → runtime.song is populated from the top-level project song', t => {
    const vm = makeVm();
    vm.loadProject(projectSingleSong).then(() => {
        t.ok(vm.runtime.song, 'runtime.song set');
        t.equal(vm.runtime.song.name, 'Main Theme', 'song name preserved');
        t.equal(vm.runtime.song.tempo, 128, 'tempo preserved');
        t.equal(vm.runtime.song.tracks.length, 4, 'all tracks loaded');
        t.notOk(vm.runtime.songs, 'no legacy plural runtime.songs array');
        t.ok(noTargetCarriesSong(vm), 'no target carries per-sprite song data');
        t.end();
    })
        .catch(e => {
            t.fail(e.message || e); t.end();
        });
});

tap.test('save → project JSON serializes the song at the top level (not per-target)', t => {
    const vm = makeVm();
    vm.loadProject(projectSingleSong).then(() => {
        const serialized = JSON.parse(vm.toJSON());
        t.ok(serialized.song, 'top-level song object present');
        t.notOk(Array.isArray(serialized.songs), 'no legacy songs[] array');
        const targetHasSong = serialized.targets.some(target => target.song || Array.isArray(target.songs));
        t.notOk(targetHasSong, 'no target carries song data');
        t.end();
    })
        .catch(e => {
            t.fail(e.message || e); t.end();
        });
});

tap.test('save → load round-trip preserves the song', t => {
    const vm1 = makeVm();
    vm1.loadProject(projectSingleSong).then(() => {
        const savedJson = vm1.toJSON();
        const vm2 = makeVm();
        return vm2.loadProject(savedJson).then(() => {
            t.ok(vm2.runtime.song, 'song survived round-trip');
            t.equal(vm2.runtime.song.name, 'Main Theme', 'name');
            t.equal(vm2.runtime.song.tracks[0].notes[0].pitch, 62, 'pitch preserved');
            t.equal(vm2.runtime.song.tracks[0].notes[0].velocity, 100, 'velocity preserved');
            t.end();
        });
    })
        .catch(e => {
            t.fail(e.message || e); t.end();
        });
});

tap.test('legacy top-level songs[] migrates to the first song', t => {
    const vm = makeVm();
    vm.loadProject(projectLegacyPlural).then(() => {
        t.ok(vm.runtime.song, 'a single song is hoisted');
        t.equal(vm.runtime.song.songId, 'song-verse', 'first song in the legacy array is taken');
        t.notOk(vm.runtime.songs, 'no plural runtime.songs array left behind');
        t.end();
    })
        .catch(e => {
            t.fail(e.message || e); t.end();
        });
});

tap.test('legacy per-sprite songs migrate to runtime.song and are stripped from targets', t => {
    const vm = makeVm();
    vm.loadProject(projectLegacyPerSprite).then(() => {
        t.ok(vm.runtime.song, 'a project song is hoisted from the per-sprite shape');
        t.equal(vm.runtime.song.songId, 'song-legacy-stage', 'first song found (stage) is taken');
        t.ok(noTargetCarriesSong(vm), 'no target retains a per-sprite songs/song field');
        t.end();
    })
        .catch(e => {
            t.fail(e.message || e); t.end();
        });
});

tap.test('importing a .sprite3 does not wipe the project song', t => {
    const vm = makeVm();
    vm.loadProject(projectSingleSong).then(() => {
        t.equal(vm.runtime.song.songId, 'song-main', 'project starts with its song');
        return vm.addSprite(JSON.stringify(spriteWithLegacySongs)).then(() => {
            t.equal(vm.runtime.song.songId, 'song-main', 'project song preserved after sprite import');
            const imported = vm.runtime.targets.find(target =>
                target.sprite && target.sprite.name && target.sprite.name.indexOf('ImportedSprite') === 0);
            t.ok(imported, 'imported sprite present');
            t.notOk(imported.sprite.songs, 'imported sprite has no per-sprite songs field');
            t.end();
        });
    })
        .catch(e => {
            t.fail(e.message || e); t.end();
        });
});

tap.test('PROJECT_LOADED triggers SONGS_CHANGED with runtime.song already set', t => {
    const vm = makeVm();
    let fired = 0;
    let songAtEmit = null;
    vm.runtime.on('SONGS_CHANGED', () => {
        fired++;
        songAtEmit = vm.runtime.song;
    });
    vm.loadProject(projectSingleSong).then(() => {
        t.ok(fired >= 1, `SONGS_CHANGED fired at least once (got ${fired})`);
        t.ok(songAtEmit, 'runtime.song already reflects the loaded project when SONGS_CHANGED fires');
        t.end();
    })
        .catch(e => {
            t.fail(e.message || e); t.end();
        });
});

tap.test('Songs extension requests a toolbox refresh after a project loads', t => {
    const vm = makeVm();
    vm.runtime.extensionManager.loadExtensionIdSync('songs');
    let toolboxRefreshes = 0;
    vm.runtime.on('TOOLBOX_EXTENSIONS_NEED_UPDATE', () => toolboxRefreshes++);
    vm.loadProject(projectSingleSong).then(() => {
        t.ok(toolboxRefreshes >= 1, `toolbox refresh requested after project load (got ${toolboxRefreshes})`);
        const info = vm.runtime._blockInfo.find(b => b.id === 'songs');
        t.ok(info, 'songs categoryInfo present in runtime');
        t.end();
    })
        .catch(e => {
            t.fail(e.message || e); t.end();
        });
});

tap.test('switching editing target does not change the project song', t => {
    const vm = makeVm();
    vm.loadProject(projectSingleSong).then(() => {
        const stage = vm.runtime.targets.find(target => target.isStage);
        const sprite = vm.runtime.targets.find(target => !target.isStage);
        t.ok(stage && sprite, 'have both stage and a sprite');
        const before = vm.runtime.song;
        vm.setEditingTarget(stage.id);
        t.equal(vm.runtime.song, before, 'song unchanged when stage becomes editing target');
        vm.setEditingTarget(sprite.id);
        t.equal(vm.runtime.song, before, 'song unchanged when sprite becomes editing target');
        t.end();
    })
        .catch(e => {
            t.fail(e.message || e); t.end();
        });
});

tap.test('loading a project with no song clears runtime.song', t => {
    const vm = makeVm();
    vm.loadProject(projectSingleSong).then(() => {
        t.ok(vm.runtime.song, 'first project has a song');
        const noSong = JSON.parse(projectSingleSong);
        delete noSong.song;
        return vm.loadProject(JSON.stringify(noSong)).then(() => {
            t.notOk(vm.runtime.song, 'loading a no-song project clears runtime.song');
            t.end();
        });
    })
        .catch(e => {
            t.fail(e.message || e); t.end();
        });
});

tap.test('binary .sb3 round-trip via saveProjectSb3 preserves the song', t => {
    const vm = makeVm();
    vm.loadProject(projectSingleSong).then(() =>
        vm.saveProjectSb3()
    )
        .then(blob => {
            const asArrayBuffer = blob.arrayBuffer ? blob.arrayBuffer() : Promise.resolve(blob);
            return asArrayBuffer.then(buf => {
                const vm2 = makeVm();
                return vm2.loadProject(buf).then(() => {
                    t.ok(vm2.runtime.song, 'song survived a .sb3 zip round-trip');
                    t.equal(vm2.runtime.song.songId, 'song-main', 'songId round-trips');
                    t.equal(vm2.runtime.song.tracks[0].notes[0].pitch, 62, 'note pitch round-trips through zip');
                    t.end();
                });
            });
        })
        .catch(e => {
            t.fail(e.message || e); t.end();
        });
});

tap.test('vm.setSong / vm.updateSong store on runtime.song and emit SONGS_CHANGED', t => {
    const vm = makeVm();
    vm.loadProject(projectSingleSong).then(() => {
        let changed = 0;
        vm.runtime.on('SONGS_CHANGED', () => changed++);
        const newSong = {songId: 'song-x', name: 'X', tempo: 90, lengthSteps: 8, stepsPerBeat: 4, tracks: []};
        vm.setSong(newSong);
        t.equal(vm.runtime.song.songId, 'song-x', 'setSong replaces runtime.song');
        t.ok(changed >= 1, 'setSong emits SONGS_CHANGED');

        const edited = Object.assign({}, newSong, {name: 'X edited'});
        vm.updateSong(edited);
        t.equal(vm.runtime.song.name, 'X edited', 'updateSong updates runtime.song');
        t.ok(changed >= 2, 'updateSong emits SONGS_CHANGED');

        vm.setSong(null);
        t.notOk(vm.runtime.song, 'setSong(null) clears the song');
        t.end();
    })
        .catch(e => {
            t.fail(e.message || e); t.end();
        });
});
