# Song-Maker AI eval harness

An iterative-improvement loop for the on-device music providers in
`src/lib/song-ai/`. It runs a provider (default **magenta**) over a committed set
of musical cases, scores each result against an **Opus-generated golden**, and
reports per-category scores with deltas vs a committed baseline — so you can
change the provider, re-run, and see exactly what moved.

Built for magenta first; the runner goes through the real `index.js`
orchestration, so pointing it at another provider id is a one-line change.

## How it runs (headless magenta in Node)

The song-ai source and `@magenta/music`'s `esm/*` entry points aren't
Node-importable as-is, so [`launch.cjs`](launch.cjs) bundles
[`cli.mjs`](cli.mjs) with esbuild (the copy inside `tsx`, no extra install) into
a single Node-runnable file and runs it. magenta runs on the tfjs **CPU**
backend and fetches checkpoints from the Google CDN (so a run needs network).
`continueSequence`/`sample`/`infill` are stochastic, so each case is run **N
times** (default 5) and aggregated (mean / best / std).

## Commands

```sh
# from the repo root; ANTHROPIC_API_KEY must be set for seeds/goldens/--judge
node packages/scratch-gui/eval/song-ai/launch.cjs <command>

  seeds [--force]      # generate the base seed songs via Opus (commit them)
  goldens [--force]    # generate golden reference outputs via Opus (commit them)
  run [--baseline]     # run magenta over all cases, score, report
      [--judge]        #   + Opus LLM-judge scores (reported, not gated)
      [--samples N]    #   samples per case (default 5)
      [--only <id>]    #   a single case
      [--category <id>]#   one category
  fetch-checkpoints    # pre-download checkpoints into checkpoints/ (optional)
```

`run --baseline` writes `baselines/magenta.baseline.json`; a normal `run` diffs
against it. Per-run output (gitignored) lands in `results/<runId>/`.

Coconet runs slowly on the Node CPU backend. Set `MAGENTA_COCONET_ITERS=8` (the
provider defaults to 32 for in-browser WebGL) to keep harmonize/infill runs
tractable:

```sh
MAGENTA_COCONET_ITERS=8 node packages/scratch-gui/eval/song-ai/launch.cjs run --samples 2
```

See [baselines/STATUS.md](baselines/STATUS.md) for the latest before→after
results (Coconet harmonize/infill and the vibe-parse multitrack win; the MusicVAE
`vary` regression the loop surfaced).

## Layout

```
settings/settings.json   genre × kid-project-type matrix
cases/<category>/*.json   one case per file (operation + prompt + intent + goldenRef)
seeds/*.seed.json         Opus base songs (internal shape); cases derive partial seeds
goldens/<caseId>/         golden.json (wire shape) + meta.json (provenance)
baselines/                committed regression anchor
scoring/                  metrics.mjs, score.mjs, llm-judge.mjs, weights.json
results/                  per-run output (gitignored)
tools/build-dataset.cjs   source of truth for settings + cases (re-emit with node)
```

## Categories

| category | engine | notes |
|---|---|---|
| `single-track-gen` | MusicRNN | add a melody/drum/synth track |
| `single-track-edit` | MusicRNN continue / **MusicVAE** `similar` | continuation + variation |
| `multitrack-song` | MusicRNN + rule-based template | whole song |
| `harmonize` | **Coconet** `infill` | fill harmony under a melody |
| `infill` | **Coconet** `infill` (masked) | fill a blanked middle section |

`harmonize`/`infill` were the "known gaps" of the MusicRNN-only provider; Phase C
wired in Coconet (harmonization/infill) and MusicVAE (variation), routed via
`editParams.mode` (`continue` | `vary` | `harmonize` | `infill`).

## Scoring

Deterministic music-theory metrics (`scoring/metrics.mjs`), each 0–1, weighted
by `scoring/weights.json`, form the committed anchor:
scale conformance, harmonic alignment to the setting's chord progression,
constraint adherence (requested key/scale/tempo/length), track count/kind match,
note-density vs golden, register match, rhythm-grid alignment, infill boundary
continuity, and a low-weight transposition-tolerant golden-similarity. The
optional `--judge` adds Opus ratings (musicality / prompt-adherence /
similarity-to-golden), reported alongside but never folded into the anchor.

## Improvement loop

1. `goldens` (once) → commit goldens.
2. `run --baseline` → commit the baseline.
3. Change the provider in `src/lib/song-ai/providers/magenta.js`.
4. `run` → read `results/<runId>/report.txt` deltas; confirm no non-gap
   regression.
5. Re-commit `baselines/magenta.baseline.json` in the same PR as the change.
