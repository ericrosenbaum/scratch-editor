# @scratch/vibe-editor (prototype)

A Scratch-**inspired** (not Scratch-compatible) "vibe coding" environment that pairs
direct-manipulation media tools with an iterative AI chat that **generates JavaScript**
running on a small, purpose-built runtime.

> Status: early prototype / vertical slice. The code generator is mocked and the only
> real media editor so far is the paint (draw) editor.

## What's here

- **Stage** — a `<canvas>` driven by a lifecycle + `requestAnimationFrame` runtime.
- **Hierarchical tree** — scenes/groups → sprites → nested sprites, with each sprite's
  costumes/sounds as leaf rows.
- **Vibe chat** — prompt the whole project or a selected sprite. The (mock) generator
  returns JavaScript plus a human-readable summary; changes are applied to the sprite
  and hot-swapped into the runtime while it runs.
- **Code view** — the generated summary plus the editable JavaScript source.
- **Paint editor** — the real **scratch-paint** editor, embedded and lazy-loaded.

## How generated code works

A sprite's behavior is JavaScript that receives a single `api` object and registers
lifecycle handlers:

```js
api.onFrame(() => api.move(3)) // runs every animation frame
api.onClick(() => api.say('Hi!', 2)) // runs when the sprite is clicked
api.onKey('ArrowRight', () => api.changeX(10))
```

The full helper surface lives in [`src/runtime/sprite-api.ts`](src/runtime/sprite-api.ts).
Code is compiled with `new Function` — a deliberate simplicity tradeoff for the
prototype; sandboxing (Web Worker / iframe) is future work.

## Architecture

| Layer                                  | Path                             |
| -------------------------------------- | -------------------------------- |
| Project model + tree helpers           | `src/model/project.ts`           |
| State container (useReducer + context) | `src/model/store.tsx`            |
| Runtime (lifecycle + RAF)              | `src/runtime/`                   |
| Code generation interface + mock       | `src/codegen/`                   |
| UI shell                               | `src/components/`, `src/App.tsx` |

The generator is hidden behind the `CodeGenerator` interface
([`src/codegen/types.ts`](src/codegen/types.ts)). Replacing the mock with a real
LLM-backed implementation requires no other changes.

### scratch-paint embed

The paint tab embeds the real [`scratch-paint`](https://github.com/scratchfoundation/scratch-paint)
`<PaintEditor>` (`src/paint/scratch-paint-editor.tsx`), wrapped in its required Redux
store (`ScratchPaintReducer`) + `IntlProvider`, mirroring how scratch-gui mounts it.
`PaintEditorPanel` adapts between our lightweight `Asset` model (a costume is a data URL
+ format) and scratch-paint's `image`/`imageFormat` in, `onUpdateImage` out contract.

Two integration notes:

- It's **lazy-loaded** (`React.lazy` + dynamic `import`) so paper.js / canvas are only
  evaluated in the browser when the paint tab is opened — never in the jsdom test path.
- `scratch-paint`'s `package.json` sets `"browser": "./src/index.js"`, which would make
  vite bundle its raw source (PostCSS simple-vars + CSS modules — a toolchain we don't
  reproduce). `vite.config.ts` aliases `scratch-paint` to its prebuilt UMD
  (`dist/scratch-paint.js`), which injects its own compiled CSS at runtime.

## Commands

```bash
# from the repo root
npm run dev   --workspace=packages/vibe-editor   # dev server on http://localhost:8602
npm test      --workspace=packages/vibe-editor   # vitest unit + integration tests
npm run build --workspace=packages/vibe-editor   # type-check + production build
npm run lint  --workspace=packages/vibe-editor
```
