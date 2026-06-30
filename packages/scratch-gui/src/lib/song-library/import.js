// Pure helpers for the song-maker track/section library. A library "item"
// wraps a wire-format payload (a single track, or a whole song) plus the
// metadata needed to browse, preview, and reconcile it into a song:
//
//   {
//     name, itemType: 'track' | 'song', kind?, tags: [...],
//     tempo, rootPitch, scaleType, lengthSteps, stepsPerBeat,
//     instrumentName, payload: <wire track | wire song>
//   }
//
// The payload is byte-identical to an eval/song-ai golden (see
// stripIdsFromSong / the generate-goldens output). Every import routes through
// sanitizeTrack/sanitizeSong so an added item is a fully valid, editable
// track/song indistinguishable from an AI-generated or hand-built one.

import {createBlankSong, INSTRUMENT_NAMES} from '../song-defaults.js';
import {sanitizeTrack, sanitizeSong} from '../song-ai/sanitize.js';
import {transposeNotes, snapNotesToScale, DEFAULT_ROOT_PITCH} from '../scale-utils.js';

// Drum/synthDrum tracks are unpitched (lane-based) — key/scale reconciliation
// must leave their notes alone. Mirrors scale-utils' internal _isPitched.
const isPitchedKind = kind => kind !== 'drum' && kind !== 'synthDrum';

const rootPitchOf = (obj, fallback) =>
    (typeof obj?.rootPitch === 'number' ? obj.rootPitch : fallback);

/**
 * Reconcile a single-track library item into the host song's key, scale, and
 * length. Returns a fresh, fully-sanitized, editable track (with a new
 * trackId). For pitched kinds the notes are transposed by the difference
 * between the song's key and the item's authored key, then snapped to the
 * song's scale — the same machinery SongEditor uses when the user changes the
 * song key. Drum/synthDrum tracks pass through unchanged.
 * @param {object} item - a library item with itemType 'track'.
 * @param {object} song - the host song (for lengthSteps / rootPitch / scaleType).
 * @returns {object} a sanitized track ready to append to song.tracks.
 */
const reconcileTrackForSong = (item, song) => {
    const lengthSteps = (song && song.lengthSteps) || 32;
    let track = sanitizeTrack(item.payload, lengthSteps);
    if (isPitchedKind(track.kind)) {
        const songRoot = rootPitchOf(song, DEFAULT_ROOT_PITCH);
        const itemRoot = rootPitchOf(item, songRoot);
        const delta = songRoot - itemRoot;
        if (delta !== 0) {
            [track] = transposeNotes([track], delta);
        }
        [track] = snapNotesToScale([track], songRoot, (song && song.scaleType) || 'major');
    }
    return track;
};

/**
 * Build a full, sanitized song from a multi-track ('song') library item. Used
 * when the user starts a new arrangement from a Section — the song adopts the
 * item's authored key/scale/tempo/length, which is musically correct (snapping
 * a whole arrangement to an unrelated host key would mangle it). Fresh
 * songId/trackIds are assigned by sanitizeSong.
 * @param {object} item - a library item with itemType 'song'.
 * @returns {object} a sanitized song.
 */
const songFromLibraryItem = item =>
    sanitizeSong(item.payload, item.name || 'Song');

/**
 * Build a standalone, playable song from any library item for hover preview.
 * Single-track items are wrapped in a one-track song at their authored
 * tempo/key/scale/length so the preview sounds the way the track was authored;
 * 'song' items are sanitized directly.
 * @param {object} item - any library item.
 * @returns {object} a sanitized, playable song.
 */
const previewSongForItem = item => {
    if (item.itemType === 'song') {
        return sanitizeSong(item.payload, item.name || 'Preview');
    }
    const lengthSteps = item.lengthSteps || 32;
    const track = sanitizeTrack(item.payload, lengthSteps);
    const song = createBlankSong(item.name || 'Preview');
    song.tempo = item.tempo || 120;
    song.lengthSteps = lengthSteps;
    song.stepsPerBeat = item.stepsPerBeat || 4;
    song.rootPitch = rootPitchOf(item, song.rootPitch);
    song.scaleType = item.scaleType || song.scaleType;
    song.tracks = [track];
    return song;
};

// Human-readable label for a single wire-format track. Mirrors
// displayNameForTrack (song-defaults.js) but reads the wire shape, where a
// synth track carries its preset name on `synthPreset` rather than
// `synth.preset`. Used to annotate library thumbnails with their instrumentation.
const wireTrackLabel = track => {
    if (!track) return 'Track';
    if (track.kind === 'drum') return 'Drums';
    if (track.kind === 'synthDrum') return 'Synth Drums';
    if (track.kind === 'synth') {
        return track.synthPreset || (track.synth && track.synth.preset) || 'Synth';
    }
    const idx = (track.instrument || 1) - 1;
    return INSTRUMENT_NAMES[idx] || 'Track';
};

/**
 * The list of instrument/track labels for a library item, for display on its
 * thumbnail (e.g. ['Piano', 'Bass', 'Drums']). A 'song' item lists every track
 * in its payload; a single-track item returns its one label.
 * @param {object} item - any library item.
 * @returns {Array<string>} ordered track labels.
 */
const trackLabelsForItem = item => {
    if (!item || !item.payload) return [];
    if (item.itemType === 'song') {
        return ((item.payload.tracks) || []).map(wireTrackLabel);
    }
    return [wireTrackLabel(item.payload)];
};

export {
    reconcileTrackForSong,
    songFromLibraryItem,
    previewSongForItem,
    trackLabelsForItem
};
