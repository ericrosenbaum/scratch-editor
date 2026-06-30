# CC0 MIDI sections

The song-library "section" items in `song-tracks.json` tagged with
`"source": "cc0-midi"` are derived from human-authored MIDI files released
under the [Creative Commons Zero v1.0 Universal (CC0)][cc0] public-domain
dedication.

- **Source:** <https://github.com/m-malandro/CC0-midis> (`midis/` directory)
- **License:** CC0 1.0 Universal — no rights reserved, no attribution required.
  This credit is included as good practice, not as a license obligation.

Each original MIDI is a full multi-minute, multi-channel arrangement. To fit
Song Maker's capabilities the conversion (see
`src/lib/song-library/tools/midi_to_song.py`) does the following:

- Picks the densest 8-bar window (≤ 128 steps) and quantizes it to a
  16th-note grid (`stepsPerBeat: 4`).
- Reduces the arrangement to at most 4 tracks (drums + bass + the two busiest
  melodic parts, skipping doubled parts).
- Maps General-MIDI programs to the 21 sampled instruments and GM percussion
  notes to the 18 sampled drums.
- Emits `scale: "chromatic"` so the importer's scale-snapping is a no-op and
  the original pitches are preserved exactly.

[cc0]: https://creativecommons.org/publicdomain/zero/1.0/
