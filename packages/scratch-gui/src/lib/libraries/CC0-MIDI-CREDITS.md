# CC0 MIDI sections

The song-library "section" items in `song-tracks.json` tagged with
`"source": "cc0-midi"` are derived from human-authored MIDI files released
under the [Creative Commons Zero v1.0 Universal (CC0)][cc0] public-domain
dedication. CC0 reserves no rights and requires no attribution; these credits
are included as good practice, not as a license obligation.

## Sources

- **General-MIDI game themes** — <https://github.com/m-malandro/CC0-midis>
  (`midis/` directory).
- **"Original MIDI Album"** by Roppy Chop Studios (roppychop) — chill/ambient
  pieces. <https://opengameart.org/content/original-midi-album>
- **"Helice Incredible Adventure"** by Komiku / Loyalty Freak Music — a
  disco/funk RPG soundtrack.
  <https://opengameart.org/content/helice-incredible-adventure-fantasy-disco-rpg-battle-music-and-midi-files-pack>

## Conversion

Each original MIDI is a full multi-minute arrangement. To fit Song Maker's
capabilities the conversion (see `src/lib/song-library/tools/midi_to_song.py`)
does the following:

- Picks the densest 8-bar window (≤ 128 steps) and quantizes it to a
  16th-note grid (`stepsPerBeat: 4`).
- Reduces the arrangement to at most 4 tracks (drums + bass + the two busiest
  melodic parts, skipping doubled parts).
- Maps each part to the 21 sampled instruments and 18 sampled drums. GM files
  are read by channel/program; track-distributed files (e.g. the Komiku/LMMS
  exports, where each instrument is a named track on one channel with no
  program change) are read by track name, and their LMMS beat/bassline drum
  kits (pitches 48–51) are mapped to kick/snare/closed-hat/open-hat.
- Emits `scale: "chromatic"` so the importer's scale-snapping is a no-op and
  the original pitches are preserved exactly.

Because CC0 imposes no naming obligation and Song Maker targets young learners,
some display names are friendly renames of the originals; the source file names
are preserved in the converter's curated lists for provenance.

[cc0]: https://creativecommons.org/publicdomain/zero/1.0/
