# Baseline status & Phase C results

**Dataset:** 12 settings, 35 cases, 10 seed songs, 35 Opus goldens — all committed.

**Baseline files:**
- `magenta.baseline.json` — current anchor: improved provider (Coconet + MusicVAE
  + expanded vibe parsing), 35 cases, `--samples 2`, with `--judge` scores.
- `magenta.musicrnn-only.before.json` — pre-Phase-C (MusicRNN-only), same settings.
- `phase-c-improvement-report.txt` — the full before→after delta report.
- `loudness.baseline.json` — per-instrument loudness (LUFS) + sample peak of every
  Song Maker instrument/synth/drum preset, rendered through the real scheduler
  (`measure-loudness`). The regression anchor for the mix calibration in
  scratch-vm `instrument-gain.js`.

## Loudness calibration (mix balance)

Every instrument is trimmed toward **−20 LUFS** (EBU R128) at velocity 100 / unity
fader, so a fresh multi-track song is balanced by default. Trims live in scratch-vm
`src/extensions/scratch3_songs/instrument-gain.js`. Boosts are clamped to keep the
full-velocity sample peak below −1 dBFS, so high-crest-factor transients
(woodblock, clap, closed hat, music box) sit a few LU under target — that is
correct, not a failure; the song master limiter handles summed peaks.

Reproduce / verify (needs a real Chrome — `OfflineAudioContext` is browser-only):

```sh
cd packages/scratch-gui && npm start                 # serves /song-loudness.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9222
node packages/scratch-gui/eval/song-ai/launch.cjs measure-loudness --selftest   # lufs.mjs sanity
node packages/scratch-gui/eval/song-ai/launch.cjs measure-loudness              # measure → trims
#   add --baseline to (re)write loudness.baseline.json
```

A verify run (trims committed) should show most targets at −20 ±1 LU and the rest
flagged `ok(pk-lim)`. Note: noise-heavy synth-drum presets vary ~0.5 LU run-to-run
(random noise buffer), so compare with tolerance.

## Phase C result (before → after, `--samples 2`)

| category | before | after | Δ | note |
|---|---|---|---|---|
| multitrack-song | 0.778 | 0.821 | **+0.043** | expanded vibe parsing (honors "130 bpm", more genres) |
| harmonize * | 0.608 | 0.647 | **+0.039** | Coconet `infill` (was continuation fallback) |
| infill * | 0.733 | 0.803 | **+0.070** | Coconet masked `infill` |
| single-track-gen | 0.750 | 0.743 | −0.007 | ~flat (`composeTrack` already inherits key/scale) |
| single-track-edit | 0.735 | 0.681 | **−0.054** | MusicVAE `vary` regressed — see below |

\* previously-unsupported "known gap" categories.

## The loop caught a regression: MusicVAE `vary`

Routing variation edits through MusicVAE `similar` scored **worse** than the
MusicRNN continuation it replaced — and the `--judge` confirmed it, not just the
deterministic metrics:

- continuation edits: judge `mus72–78 / adh75–85` (Opus rates them good)
- MusicVAE vary edits: judge `mus35–62 / adh20–55` (Opus agrees they're weaker)

So both signals agree MusicVAE `similar` (full-melody resample) is not yet a net
win for variation. It is **wired in and reachable** (`editParams.mode: 'vary'`,
with a rhythm-preserving re-pitch + density guard), but the data says the next
iteration should improve or gate it before it becomes the default. This is the
harness working as intended — a real eval that surfaces a real regression.

Coconet (harmonize/infill) is the clear Phase C win; MusicVAE `vary` is the open
item the loop flagged.

## Reproduce

```sh
ANTHROPIC_API_KEY=...   # for goldens / --judge
# fair before/after: MusicRNN-only is git-stash of providers/magenta.js
MAGENTA_COCONET_ITERS=8 node packages/scratch-gui/eval/song-ai/launch.cjs run --samples 2 --judge
```

`MAGENTA_COCONET_ITERS` lowers Coconet's Gibbs iterations for the Node CPU
backend (default 32 in-browser on WebGL); the harness uses 8 to stay tractable.
