/**
 * Unit tests for the multi-song VM API: the runtime.songs list + active-song
 * accessor, and the song CRUD methods on VirtualMachine (add / delete /
 * duplicate / rename / reorder / setActiveSong), including the block-field
 * rewrites song renames perform and the cross-song guard on renameTrack.
 */

const test = require('tap').test;
const VirtualMachine = require('../../src/index');
const Sprite = require('../../src/sprites/sprite.js');

const makeSong = (songId, name, tracks) => ({
    songId,
    name,
    tempo: 120,
    lengthSteps: 32,
    stepsPerBeat: 4,
    tracks: tracks || [{trackId: `${songId}-t1`, kind: 'instrument', instrument: 1, name: 'Lead', notes: []}]
});

test('runtime.song accessor reads/writes the active entry of runtime.songs', t => {
    const vm = new VirtualMachine();
    const rt = vm.runtime;
    t.same(rt.songs, [], 'starts with no songs');
    t.equal(rt.song, null, 'active song is null when empty');

    // Setter pushes on an empty list.
    const a = makeSong('a', 'A');
    rt.song = a;
    t.equal(rt.songs.length, 1, 'setter pushed onto the empty list');
    t.equal(rt.song, a, 'getter returns the active song');

    // Setter replaces the active entry.
    rt.songs.push(makeSong('b', 'B'));
    rt.activeSongIndex = 1;
    const b2 = makeSong('b2', 'B2');
    rt.song = b2;
    t.equal(rt.songs[1], b2, 'setter replaced the active entry');
    t.equal(rt.songs[0], a, 'other entries untouched');

    // null clears the whole list (pre-multi-song "no song" semantics).
    rt.song = null;
    t.same(rt.songs, [], 'null clears the list');
    t.equal(rt.activeSongIndex, 0, 'index reset');
    t.end();
});

test('addSong appends, de-duplicates the name, and activates the new song', t => {
    const vm = new VirtualMachine();
    const first = vm.addSong(makeSong('a', 'Song'));
    t.equal(vm.runtime.song, first, 'first song active');
    const second = vm.addSong(makeSong('b', 'Song'));
    t.equal(second.name, 'Song2', 'duplicate name de-duplicated');
    t.equal(vm.runtime.song, second, 'new song becomes active');
    t.equal(vm.runtime.songs.length, 2, 'both stored');
    t.end();
});

test('deleteSong removes the song, fixes the selection, and can restore', t => {
    const vm = new VirtualMachine();
    const a = vm.addSong(makeSong('a', 'A'));
    const b = vm.addSong(makeSong('b', 'B'));
    const c = vm.addSong(makeSong('c', 'C'));
    vm.setActiveSong('b');
    t.equal(vm.runtime.song, b, 'B selected');

    // Deleting a non-active song keeps the selection on the same song object.
    vm.deleteSong('a');
    t.equal(vm.runtime.song, b, 'selection follows B after deleting A');
    t.equal(vm.runtime.songs.length, 2, 'A removed');

    // Deleting the active song moves the selection to the adjacent song.
    const restore = vm.deleteSong('b');
    t.equal(vm.runtime.song, c, 'selection lands on the song filling the slot');
    t.type(restore, 'function', 'restore function returned');

    restore();
    t.equal(vm.runtime.songs.length, 2, 'B restored');
    t.equal(vm.runtime.song.songId, 'b', 'restored song is active again');
    t.equal(vm.runtime.songs[0].songId, 'b', 'restored at its old index');

    t.equal(vm.deleteSong('nope'), null, 'unknown songId returns null');
    t.equal(a.songId, 'a', 'a still intact (sanity)');
    t.end();
});

test('duplicateSong deep-copies with fresh songId and fresh trackIds', t => {
    const vm = new VirtualMachine();
    const a = vm.addSong(makeSong('a', 'Groove', [
        {trackId: 'a-drums', kind: 'drum', name: 'Drums', notes: [{step: 0, durationSteps: 1, drum: 1}]},
        {trackId: 'a-bass', kind: 'instrument', instrument: 6, name: 'Bass', notes: []}
    ]));
    const copy = vm.duplicateSong('a');
    t.ok(copy, 'copy returned');
    t.not(copy.songId, a.songId, 'fresh songId');
    t.equal(copy.name, 'Groove2', 'name de-duplicated');
    t.equal(vm.runtime.songs[1], copy, 'inserted right after the original');
    t.equal(vm.runtime.song, copy, 'copy becomes active');
    t.equal(copy.tracks.length, 2, 'tracks copied');
    for (let i = 0; i < copy.tracks.length; i++) {
        t.not(copy.tracks[i].trackId, a.tracks[i].trackId,
            `track ${i} got a fresh trackId (overrides/chains are trackId-keyed)`);
        t.equal(copy.tracks[i].name, a.tracks[i].name, `track ${i} keeps its display name`);
    }
    copy.tracks[0].notes.push({step: 4, durationSteps: 1, drum: 2});
    t.equal(a.tracks[0].notes.length, 1, 'deep copy — editing the copy leaves the original alone');
    t.end();
});

test('renameSong enforces unique names and rewrites SONG block fields', t => {
    const vm = new VirtualMachine();
    const spr = new Sprite(null, vm.runtime);
    const target = spr.createClone();
    target.blocks.createBlock({
        id: 'sw1',
        opcode: 'songs_switchToSong',
        fields: {SONG: {name: 'SONG', value: 'Verse'}}
    });
    vm.runtime.targets = [target];
    vm.addSong(makeSong('a', 'Verse'));
    vm.addSong(makeSong('b', 'Chorus'));

    vm.renameSong('a', 'Drop');
    t.equal(vm.runtime.songs[0].name, 'Drop', 'song renamed');
    t.equal(target.blocks.getBlock('sw1').fields.SONG.value, 'Drop', 'switch block rewritten');

    vm.renameSong('b', 'Drop');
    t.equal(vm.runtime.songs[1].name, 'Drop2', 'name de-duplicated against other songs');

    vm.renameSong('a', '   ');
    t.equal(vm.runtime.songs[0].name, 'Drop', 'empty name rejected');
    t.end();
});

test('reorderSong moves a song and the active selection follows its song', t => {
    const vm = new VirtualMachine();
    vm.addSong(makeSong('a', 'A'));
    vm.addSong(makeSong('b', 'B'));
    vm.addSong(makeSong('c', 'C'));
    vm.setActiveSong('b');

    t.ok(vm.reorderSong(0, 2), 'reorder happened');
    t.same(vm.runtime.songs.map(s => s.songId), ['b', 'c', 'a'], 'order updated');
    t.equal(vm.runtime.song.songId, 'b', 'active selection followed the song');

    t.notOk(vm.reorderSong(1, 1), 'same-index reorder is a no-op');
    t.end();
});

test('setActiveSong switches selection and emits ACTIVE_SONG_CHANGED', t => {
    const vm = new VirtualMachine();
    vm.addSong(makeSong('a', 'A'));
    vm.addSong(makeSong('b', 'B'));
    let events = 0;
    vm.runtime.on('ACTIVE_SONG_CHANGED', () => events++);

    vm.setActiveSong('a');
    t.equal(vm.runtime.song.songId, 'a', 'selection moved');
    t.equal(events, 1, 'event fired');

    vm.setActiveSong('a');
    t.equal(events, 1, 'selecting the already-active song is a no-op');

    vm.setActiveSong('nope');
    t.equal(vm.runtime.song.songId, 'a', 'unknown songId ignored');
    t.end();
});

test('renameTrack does not rewrite blocks when another SONG still uses the old name', t => {
    const vm = new VirtualMachine();
    const spr = new Sprite(null, vm.runtime);
    const target = spr.createClone();
    target.blocks.createBlock({
        id: 'b1',
        opcode: 'songs_playTrack',
        fields: {TRACK: {name: 'TRACK', value: 'Drums'}}
    });
    vm.runtime.targets = [target];
    // "Drums" exists in both songs — TRACK menus are a union across songs, so
    // renaming song A's "Drums" must leave the block referencing song B's.
    vm.addSong(makeSong('a', 'A', [
        {trackId: 'a-drums', kind: 'drum', name: 'Drums', notes: []}
    ]));
    vm.addSong(makeSong('b', 'B', [
        {trackId: 'b-drums', kind: 'drum', name: 'Drums', notes: []}
    ]));
    vm.setActiveSong('a');

    vm.renameTrack('a-drums', 'Percussion');
    t.equal(vm.runtime.songs[0].tracks[0].name, 'Percussion', 'track renamed');
    t.equal(target.blocks.getBlock('b1').fields.TRACK.value, 'Drums',
        'block reference left alone — song B still has a "Drums"');

    // With no other song using the old name, the rewrite happens as before.
    vm.renameTrack('a-drums', 'Perc2');
    t.equal(vm.runtime.songs[0].tracks[0].name, 'Perc2', 'renamed again');
    vm.setActiveSong('b');
    vm.renameTrack('b-drums', 'Beat');
    t.equal(target.blocks.getBlock('b1').fields.TRACK.value, 'Beat',
        'block rewritten once the old name is unambiguous project-wide');
    t.end();
});
