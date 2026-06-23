# Starter project assets

The `.sb3` files here are real, self-contained Scratch projects (blocks +
bundled costumes/sounds) and the `.png` files are their stage thumbnails. They
are shown in the "Get Started" welcome modal for the Speech to Text / Q&A
extensions.

## Hand-authored vs. generated

Most starters are **hand-authored** in the Scratch editor and exported here
directly — edit them by opening the `.sb3` in the editor and re-exporting:

- `magic-words`, `maze-starter`, `echo-parrot` (Speech to Text, some with
  Text to Speech)
- `pong-with-faq`, `space-adventure` (Q&A)
- `talk-to-the-axolotl` (Speech to Text + Text to Speech + Q&A)

`space-adventure` and `talk-to-the-axolotl` were converted from an older Q&A
extension: their response lists became `qna` datasets (stored in the project's
`extensionData`).

Only **`scratch-helper`** is still generated from the block-builder DSL in
[`../../../../scripts/generate-starter-projects.js`](../../../../scripts/generate-starter-projects.js).
Do **not** re-add the hand-authored projects to that script — a regen would
overwrite them. To regenerate `scratch-helper`:

```
node packages/scratch-gui/scripts/generate-starter-projects.js
```

It fetches the referenced library assets from the Scratch CDN (cached under
`/tmp/scratch-asset-cache`) and writes `scratch-helper.sb3` here.

## Thumbnails

Thumbnails are 240×179 PNGs of the stage. They're produced by loading a project
in the editor and snapshotting the stage with the renderer's
`requestSnapshot` (the same path Scratch uses for project thumbnails), then
scaling to 240×179.
