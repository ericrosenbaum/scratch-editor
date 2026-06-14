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
- **Paint editor** — a minimal direct-manipulation costume editor (brush/eraser/color).

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

The paint editor is the approved fallback for embedding `scratch-paint`; it keeps a
narrow "selected costume in / updated costume out" contract so the richer editor can be
dropped in later.

## Commands

```bash
# from the repo root
npm run dev   --workspace=packages/vibe-editor   # dev server on http://localhost:8602
npm test      --workspace=packages/vibe-editor   # vitest unit + integration tests
npm run build --workspace=packages/vibe-editor   # type-check + production build
npm run lint  --workspace=packages/vibe-editor
```
