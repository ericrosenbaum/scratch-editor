# Song Library Taxonomy & Allocation (Phase 0)

Drives the `build-library` authoring pipeline and the GUI tag bar
(`src/lib/libraries/song-track-tags.js`). Derived from a Phase 0 deep-research
pass on Scratch-community + youth/game music. **Caveat from the research:** there
is *no* verified quantitative ranking of Scratch genre popularity, so the
per-item counts below are a **reasoned design judgment**, not research-backed
quotas. The qualitative findings that anchor them:

- **Context-first, genre-second.** Kids pick music for a *situation* (boss
  fight, dance scene, sad moment) more than for a genre.
- **Loops + stackable stems.** Game music uses looping + "vertical remixing"
  (layering parts), which is exactly our multi-track model — hence single-role
  track items *and* full-section items, all seamless loops.
- **Serve both cohorts.** 8–10 are "open-eared" (broad variety); 11+ narrow to
  sharper genres + contemporary/pop. Favor **balanced breadth**; do **not**
  over-index pop.
- **Scaffold simple → complex.** More single-role loops (melody/drums/bass)
  than full sections, so kids layer up gradually.
- **Honor the refutations.** Underwater/exploration must include **rhythmic**
  variants (not only ambient); boss is orchestral+rock-dominant but include an
  **EDM** variant. Chiptune is the one strongly Scratch-validated genre
  (BeepBox-loops-for-games pattern).

## Facets (the tag vocabulary)

- **Genre:** `chiptune` `lofi` `rock` `funk` `electronic` `ambient` `cinematic`
  `pop` `hiphop` `synthwave` `jingle`
- **Mood:** `happy` `epic` `chill` `spooky` `upbeat` `sad`
- **Context:** `platformer` `boss` `racing` `maze` `exploration` `underwater`
  `intro` `dance` `quiz` `story`
- **Role:** `melody` `bass` `pad` `lead` `drums` (+ `section` for multi-track items)

Each library item carries one tag from each applicable facet
(e.g. `['rock','epic','boss','melody']`). The GUI tag bar exposes a curated
subset; free-text search matches any tag.

## Recommended v1 allocation (~80 items)

Tracks (single-role loops) outnumber sections ~2:1 to support layering/scaffolding.

| Context | Sections | Track loops (roles) | Genres |
|---|---|---|---|
| platformer | 2 | melody, bass, drums, lead (4) | chiptune, pop |
| boss | 3 (incl. 1 EDM) | melody, bass, drums, lead (4) | rock, cinematic, electronic |
| racing | 2 | melody, bass, drums (3) | electronic, synthwave |
| maze / puzzle | 2 | melody, pad, drums (3) | chiptune, ambient |
| exploration / RPG | 3 | melody, pad, bass (3) | cinematic, ambient |
| underwater | 2 (1 ambient, 1 rhythmic) | pad, melody, drums (3) | ambient, electronic |
| intro / cutscene | 2 | melody, pad (2) | cinematic |
| dance | 3 | melody, bass, drums, lead (4) | funk, electronic, pop |
| quiz / jingle | 2 | melody, drums (2) | jingle, pop |
| story / storytelling | 3 | melody, pad, bass (3) | lofi, cinematic, sad |
| general / menu | 2 | melody, drums (2) | lofi, chiptune |
| **Totals** | **~28 sections** | **~33 tracks** | 11 genres covered |

Plus ~15–20 extra single-role variation loops (alternate keys/instruments per
popular context) to reach ~80 and give browse depth → **~50 tracks + ~28 sections**.

## Authoring guidelines (for `build-library` prompts + scoring gate)

- **Loopable:** every item must loop seamlessly (end leads back to start). Length
  16/32/64 steps (1/2/4 bars at stepsPerBeat 4).
- **Key/scale/tempo per context:** reuse the `settings.json` targets as the
  per-cell musical context (e.g. boss → E pentatonicMinor 160; lofi → D minor 80).
- **Role conventions:** melody/bass loops monophonic; `pad`/chord loops may stack
  (use the polyphonic synth or pad instruments); `drums` reference declared lanes.
- **Instrument fit:** map role→instrument index / synth preset / drum kit (e.g.
  bass → instrument 6 "Bass" or a sub-bass synth preset; pad → synth "Warm Pad"
  or instrument 21 "Synth Pad"; lead → "Synth Lead" / "Pluck Lead").
- **Quality gate:** score each candidate with `scoring/metrics.mjs`
  (scale conformance, harmonic alignment, register, density) and drop low scorers.

## Provenance & licensing

- Shipped items are **Opus-authored** wire-format JSON (original content).
- MIDI few-shot examples are an **authoring-time aid only**, never shipped: use
  only permissive sources (Groove MIDI CC-BY for drums; CC0/PD melodic) kept in a
  gitignored `eval/song-ai/corpus/`. **Needs a licensing sign-off before use.**
