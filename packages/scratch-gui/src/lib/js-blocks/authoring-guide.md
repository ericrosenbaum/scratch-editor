# Authoring JS-powered blocks — full guide & API reference

> A single reference for writing **JS-powered custom blocks** in this Scratch editor.
> It is written to be pasted into an LLM as context for generating new blocks. It is
> self-contained: the document format, every rule that keeps a block valid, the
> complete `Scratch.*` API, the execution limits, the coordinate systems, and worked
> examples for all six block types.
>
> Source of truth in the repo (keep this file in sync if those change):
> - Document format & parser — `block-spec.js`
> - Validation / lint / transpile — `static-analysis.js`
> - The `Scratch.*` API reference panel — `api-reference.js`
> - The runtime that installs the API — `scratch-vm/.../js-blocks/{api-bridge,vm-data-api,data-store,canvas-store}.js`
> - Runnable examples — `example-libraries.js`, `example-projects.md`

---

## 1. What a JS-powered block is

A JS-powered block looks and behaves like any other Scratch block in the palette, but
its behavior is written in JavaScript instead of being composed from other blocks. You
author it as a small **block document**: a `---`-fenced header describing the block
(its shape, label, and inputs) followed by a JavaScript **body**.

Blocks are grouped into **libraries**. A library is just a named, colored category
(like "Text" or "Pixels") holding one or more blocks. For generation you almost always
work one block document at a time; a library is a collection of these documents plus a
name and a 3-color palette.

The body runs in a **sandbox**: it sees a single injected global, `Scratch`, plus a
short list of standard JavaScript built-ins. It has no access to the DOM, the network,
timers, or the real VM — only what the `Scratch` object grants. Referencing a blocked
global is a compile-time error (see §7).

The body is **transpiled to ES5 by Babel** before it runs, so you may write modern
JavaScript (`let`/`const`, arrow functions, template literals, destructuring, etc.).
The built-in examples use `var` and `function` for readability, but ES6+ is fine.

---

## 2. The block document format

Exact shape (this is what the parser expects):

```
---
type: reporter
text: "{a} plus {b}"
inputs:
  a: number = 3
  b: number = 4
color: "#59C059"
warp: false
---
return Scratch.args.a + Scratch.args.b;
```

Rules:

- **Line 1 must be exactly `---`.** The header ends at the next line that is exactly
  `---`. Everything after that closing fence is the JavaScript body.
- Blank lines and `#` comment lines inside the header are ignored.
- Output **only** the document — no surrounding Markdown code fences, no prose before
  the opening `---` or after the body.

### Header fields

| Field | Required | Value |
|---|---|---|
| `type` | **yes** | One of `command`, `reporter`, `boolean`, `c-loop`, `c-if`, `hat`. |
| `text` | **yes** | The block label. Every input is referenced with a `{name}` placeholder. |
| `inputs` | yes (may be empty) | Each input on its own **indented** line: `name: type = default`. |
| `color` | no | A hex category color, e.g. `"#59C059"`. Defaults to Scratch purple. |
| `warp` | no | `true` to "run without screen refresh" (see §8). Defaults to `false`. |

Any other header field name is an error. If a block takes no inputs, still write the
`inputs:` line with nothing under it, and use a label with no `{placeholders}`.

### Inputs and the label

- Input types: **`number`**, **`text`**, **`boolean`**.
- Defaults: quote text defaults (`s: text = "hello"`). Omitting a default gives `0`
  for number, `""` for text, `false` for boolean.
- Input names must match `^[A-Za-z_][A-Za-z0-9_]*$`.
- **Placeholder ↔ input agreement (enforced):**
  - Every `{name}` in the label must have a matching declared input.
  - Every declared input must appear in the label.
  - Each `{name}` may appear in the label **at most once** (a repeated placeholder
    renders as a broken/empty field).
- The order of `{name}` placeholders in the label is the order the input slots appear
  on the block.

Read an input in the body with `Scratch.args.NAME`. It is already coerced to the
declared type (numbers via Scratch's number cast, booleans via its boolean cast, text
via its string cast), so you rarely need to convert it yourself.

---

## 3. Block types

| Type | Shape | Body must… | May call `runBranch`? |
|---|---|---|---|
| `command` | Stack block (does something) | Do its work; **no return needed** | no |
| `reporter` | Rounded value block | **`return` a value** (number/text) | no (keep it quick) |
| `boolean` | Hexagon value block | **`return` a value** (true/false) | no (keep it quick) |
| `c-loop` | C block that wraps a stack | Call `Scratch.runBranch()`, usually in a loop | **yes** |
| `c-if` | C block that wraps a stack | Call `Scratch.runBranch()` (conditionally) | **yes** |
| `hat` | Top-of-script trigger | **`return` a boolean**, checked every frame | **no — must not wait** |

Details:

- **command** — a plain action block. It just runs its statements. Movement, looks,
  data, and canvas commands live here.
- **reporter / boolean** — value blocks. The top-level body **must** end by returning a
  value (`return ...;` at the top level of the body, not only inside a nested
  function). Return a **number, string, or boolean**; complex values are converted to
  text when shown in Scratch. Reporters should be fast — do not call `runBranch` (it is
  a warning) and do not spin long loops.
- **c-loop / c-if** — C-shaped blocks that wrap a substack. Call `Scratch.runBranch()`
  to run the wrapped blocks **once**; call it inside a loop to repeat. They need no
  return. A `c-if` typically calls `runBranch()` inside an `if`; a `c-loop` inside a
  `for`/`while`.
- **hat** — an edge-triggered trigger block (like "when timer >"). It is evaluated
  every frame and **fires the moment its condition becomes true** (a false→true edge).
  It **must return a boolean** and **must not** call `runBranch()` or otherwise wait —
  doing so is a hard error.

---

## 4. Quick reference: the six starter shapes

```
---
type: command
text: "do something with {value}"
inputs:
  value: number = 10
---
Scratch.changeX(Scratch.args.value);
```

```
---
type: reporter
text: "double {n}"
inputs:
  n: number = 5
---
return Scratch.args.n * 2;
```

```
---
type: boolean
text: "is {n} big?"
inputs:
  n: number = 0
---
return Scratch.args.n > 10;
```

```
---
type: c-loop
text: "repeat fancy {n}"
inputs:
  n: number = 4
---
for (var i = 0; i < Scratch.args.n; i++) {
    Scratch.runBranch();
}
```

```
---
type: c-if
text: "maybe {chance}%"
inputs:
  chance: number = 50
---
if ((Math.random() * 100) < Scratch.args.chance) {
    Scratch.runBranch();
}
```

```
---
type: hat
text: "when timer passes {n}"
inputs:
  n: number = 10
---
return Scratch.timer > Scratch.args.n;
```

---

## 5. The complete `Scratch.*` API

This is the entire surface the body can use. There is **no** `Scratch.say`,
`Scratch.broadcast`, `Scratch.playSound`, `Scratch.ask`, or `Scratch.wait` — do not
invent APIs. JS blocks **read** state and **move/look/draw/store**; they cannot speak,
broadcast, play sounds, or sleep.

### 5.1 Inputs & output

| Expression | Meaning |
|---|---|
| `Scratch.args.NAME` | The value of a declared input, already cast to its type. |
| `return value;` | How a `reporter`/`boolean`/`hat` block yields its value. Commands need no return. |

### 5.2 Read the sprite & stage (live getters — re-read each access)

| Expression | Value |
|---|---|
| `Scratch.sprite` | `{ name, x, y, direction, size, visible, draggable, rotationStyle, costumeNumber, costumeName, costumeCount, costumeWidth, costumeHeight, volume, layerOrder, isStage }` |
| `Scratch.effects` | `{ color, fisheye, whirl, pixelate, mosaic, brightness, ghost }` — current effect values. |
| `Scratch.clone` | `{ isClone, cloneCount }` for this sprite. |
| `Scratch.stage` | `{ width, height, backdropNumber, backdropName, backdropCount }` (width 480, height 360). |
| `Scratch.mouse` | `{ x, y, down }` — pointer in Scratch coordinates. |
| `Scratch.timer` | The project timer, in seconds. |
| `Scratch.costumes` | Array of `{ name, dataFormat, isVector, bitmapResolution, rotationCenterX, rotationCenterY }`. |

These are snapshots: reading them gives current values, and mutating a returned object
does nothing to the VM.

### 5.3 Read pixels & sound

| Call | Returns |
|---|---|
| `Scratch.pixelColor(x, y)` | Hex color (`'#ff8800'`) of a pixel in the sprite's **own rendered costume**. `(0,0)` is top-left, in costume pixel space. Out of range → `'#000000'`. |
| `Scratch.colorAtStage(x, y)` | Hex color composited on the **stage** at a Scratch coordinate. |
| `Scratch.costumePixels()` | `{ width, height, data }` — `data` is a flat `[r,g,b,a, …]` array of the rendered sprite. `width` is `0` when unavailable. |
| `Scratch.costumeSVG(indexOrName)` | The SVG source of a vector costume (`''` if not vector/unavailable). |
| `Scratch.soundLoudness(indexOrName)` | A sound's overall loudness, `0–100` (RMS). |
| `Scratch.soundDuration(indexOrName)` | A sound's length in seconds. |
| `Scratch.soundSamples(indexOrName)` | A sound's waveform as an array of samples (`-1…1`), capped at 8000. |
| `Scratch.audioOutputSamples(count)` | The most recent samples (`-1…1`) of the project's **live audio output** — everything currently playing, not the mic. Up to 2048; newest last. |
| `Scratch.audioSampleRate()` | Samples per second of the audio output (usually 44100/48000). `0` when unavailable. |

`indexOrName` accepts a 1-based number or the costume/sound name. Pixel and audio reads
require the renderer / audio engine (browser); they return empty/zero results headless.

### 5.4 Move & look (command blocks only)

| Call | Effect |
|---|---|
| `Scratch.setX(n)` / `Scratch.changeX(n)` | Set or change x. |
| `Scratch.setY(n)` / `Scratch.changeY(n)` | Set or change y. |
| `Scratch.goToXY(x, y)` | Move to a point. |
| `Scratch.move(steps)` | Move forward in the current direction. |
| `Scratch.setDirection(n)` / `turnRight(n)` / `turnLeft(n)` | Point or turn. |
| `Scratch.setSize(n)` / `changeSize(n)` | Set or change size (percent). |
| `Scratch.show()` / `hide()` | Show or hide the sprite. |
| `Scratch.setEffect(name, n)` / `changeEffect(name, n)` | `name`: `'color'`,`'fisheye'`,`'whirl'`,`'pixelate'`,`'mosaic'`,`'brightness'`,`'ghost'`. |
| `Scratch.clearEffects()` | Remove all graphic effects. |
| `Scratch.setCostume(indexOrName)` / `nextCostume()` | Switch costume. |
| `Scratch.setVolume(n)` / `changeVolume(n)` | Set or change volume (0–100). |

Movement/turn/costume calls are no-ops on the Stage (it can't move). These delegate to
the same target methods the native blocks use, so fencing and redraws stay correct.

### 5.5 Your library's data — `Scratch.data.*`

A private key/value store scoped to the **library** (shared across that library's
blocks on a sprite). It never touches real Scratch variables/lists and is **cleared on
green flag / stop**. Values may be scalars, lists (arrays), or maps (objects). List and
grid indices are **1-based** and never throw on out-of-range access.

| Call | Effect |
|---|---|
| `Scratch.data.set(name, value)` / `get(name)` | Store / read a named value (missing → `''`). |
| `Scratch.data.has(name)` / `delete(name)` / `keys()` / `clear()` | Test / remove / list / clear names. |
| `Scratch.data.push(name, v)` / `itemAt(name, i)` / `setItem(name, i, v)` | Named lists (1-based). |
| `Scratch.data.insertAt(name, i, v)` / `removeAt(name, i)` / `length(name)` / `contains(name, v)` | More list ops. |
| `Scratch.data.newMap(name)` / `mapSet(name, k, v)` / `mapGet(name, k)` | Named maps (dictionaries). |
| `Scratch.data.mapHas(name, k)` / `mapDelete(name, k)` / `mapKeys(name)` | More map ops. |
| `Scratch.data.new2DArray(name, rows, cols, fill)` | Make a grid filled with a value. |
| `Scratch.data.cell(name, r, c)` / `setCell(name, r, c, v)` | Read / write a grid cell (1-based). |

### 5.6 Draw your own layer — `Scratch.canvas.*`

A writable RGBA pixel buffer rendered on the stage as its **own drawable layer**. The
sprite's real costume is never read or modified. The canvas is private to a
`(library, sprite)` pair, is **not saved** with the project, and is disposed on green
flag / stop, clone deletion, or library removal (like `Scratch.data`).

| Call | Effect |
|---|---|
| `Scratch.canvas.resize(width, height)` | Size the canvas (up to 512×512). Starts as the full stage, fully transparent. |
| `Scratch.canvas.setPixel(x, y, color)` | Set one pixel. `color` is `[r,g,b]` / `[r,g,b,a]` (0–255) or a hex string. `(0,0)` is top-left. |
| `Scratch.canvas.getPixel(x, y)` | Read one pixel as `[r, g, b, a]`. |
| `Scratch.canvas.fill(color)` / `clear()` | Fill the whole canvas, or clear to transparent. |
| `Scratch.canvas.write(flatRGBA)` | Write a whole `[r,g,b,a, …]` array at once (fast for full-frame drawing). |
| `Scratch.canvas.width()` / `height()` | Current canvas size in pixels. |
| `Scratch.canvas.goToXY(x, y)` | Move the canvas layer on the stage (Scratch coordinates; centered on this point). |
| `Scratch.canvas.show()` / `hide()` / `goToFront()` / `goToBack()` | Show/hide, or move in front of / behind sprites. |
| `Scratch.canvas.update()` | Optional: show changes immediately (it also refreshes once per frame). |

### 5.7 Text helpers — `Scratch.text.*`

| Call | Effect |
|---|---|
| `Scratch.text.split(s, sep)` / `join(list, sep)` | String ↔ list. |
| `Scratch.text.replaceAll(s, find, repl)` | Replace every occurrence. |
| `Scratch.text.upper(s)` / `lower(s)` / `reverse(s)` / `trim(s)` | Transform a string. |
| `Scratch.text.contains(s, sub)` | True if `s` contains `sub`. |
| `Scratch.text.repeat(s, n)` | Repeat `s` `n` times. |

(You can also use native `String`/`Array` methods; these helpers exist for convenience
and to keep authored code readable.)

### 5.8 Control & cleanup

| Call | Effect |
|---|---|
| `Scratch.runBranch()` | In a C-block, run the wrapped blocks once. Call it in a loop to repeat. (C-blocks only.) |
| `Scratch.onStop(function () { … })` | Register cleanup that runs when the project stops or the green flag is pressed. |

### 5.9 Standard JavaScript built-ins available

`Math`, `JSON`, `String`, `Number`, `Array`, `Object`, `Boolean`, `Date`, `RegExp`,
`isNaN`, `isFinite`, `parseInt`, `parseFloat`, plus `undefined`, `NaN`, `Infinity`.

Everything else — `window`, `document`, `fetch`, `eval`, `Function`, `setTimeout`,
`require`, `Promise`, `Symbol`, `Proxy`, etc. — is **blocked** (see §7).

---

## 6. Body rules by block type (validation)

The body is parsed, linted, and transpiled at author time. A block only compiles if it
has **no errors**. Warnings compile but flag likely mistakes.

- `reporter`, `boolean`, `hat` → **error** if there is no top-level `return <value>;`.
  A `return` only inside a nested function does not count.
- `hat` → **error** if it calls `Scratch.runBranch()` (hats cannot wait).
- `command`, `c-loop`, `c-if` → no return required.
- `reporter`/`boolean` calling `runBranch()` → **warning** (keep value blocks quick).
- `while (true)` / `do…while (true)` → **warning** ("never ends on its own").
- `for (;;)` with no test → **warning** ("no exit condition").
- Always give loops a real exit condition. An accidental infinite loop is force-stopped
  at the hard step cap (§8) with "exceeded the instruction limit".

---

## 7. Sandbox rules — what the body may and may not reference

**Allowed globals** (besides your own declared variables and `Scratch`):
`Scratch`, `Math`, `JSON`, `String`, `Number`, `Array`, `Object`, `Boolean`, `Date`,
`RegExp`, `isNaN`, `isFinite`, `parseInt`, `parseFloat`, `undefined`, `NaN`,
`Infinity`, `arguments`.

**Forbidden — referencing any of these is a compile error:**
`window`, `document`, `globalThis`, `self`, `top`, `parent`, `frames`, `eval`,
`Function`, `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `importScripts`,
`localStorage`, `sessionStorage`, `indexedDB`, `caches`, `setTimeout`, `setInterval`,
`setImmediate`, `requestAnimationFrame`, `queueMicrotask`, `require`, `module`,
`exports`, `process`, `global`, `Reflect`, `Proxy`, `Symbol`, `WeakMap`, `WeakSet`,
`WeakRef`, `navigator`, `location`, `history`, `alert`, `prompt`, `confirm`, `Worker`,
`SharedWorker`, `Notification`, `crypto`.

**Forbidden member access — a compile error:** `.constructor`, `.__proto__`,
`.prototype` (also via `["constructor"]` etc.). These are sandbox-escape vectors.

---

## 8. Execution model & limits

The body runs inside a stepped JavaScript interpreter (`js-interpreter`), driven by the
Scratch sequencer so it shares the per-tick time budget with everything else.

- **Normal mode** yields after **4,000** interpreter steps per slice, so long work
  spreads across frames.
- **Warp mode** (`warp: true`) runs **50,000** steps per slice and finishes the whole
  command/C-block **in a single frame** without yielding — it overrides the redraws its
  blocks would request. Use it for per-frame work that must complete at once, e.g. a
  C-block that stamps a whole grid every frame, or a command that computes and draws a
  full canvas frame. All of `example-libraries.js`'s canvas/grid/FFT blocks use it.
- **Hard cap:** one invocation is force-stopped after **5,000,000** steps
  ("exceeded the instruction limit (possible infinite loop)"). This is the safety net
  for runaway loops — don't rely on it; give loops real bounds.
- **Hats** get up to **200,000** steps per tick and must not yield.
- There is no `wait`/sleep. To animate over time, do a little work per call and let the
  surrounding Scratch script (`forever`, `wait`) or the sprite's own loop drive the
  cadence — or use a hat/timer.

> **Experimental "direct execution" mode.** The library manager has a toggle,
> *"Run JavaScript directly (no interpreter)"*, that runs the compiled body as real JS
> via the `Function` constructor for speed (~100×+). It is **unsafe by design** — no
> sandbox and **no infinite-loop guard** — and off by default. Author blocks to be
> correct under the normal interpreter; direct mode reuses the exact same `Scratch.*`
> API, so no code changes are needed.

---

## 9. Coordinate systems (a common source of bugs)

Three different coordinate spaces are in play. Keep them straight:

| Space | Origin | Range / units | Used by |
|---|---|---|---|
| **Scratch stage** | center `(0,0)`, **y up** | x `-240…240`, y `-180…180` | `Scratch.sprite.x/y`, `mouse.x/y`, `goToXY`, `colorAtStage`, `canvas.goToXY` |
| **Canvas pixels** | top-left `(0,0)`, **y down** | `0…width-1`, `0…height-1` (≤512) | `canvas.setPixel/getPixel` |
| **Costume pixels** | top-left `(0,0)`, **y down** | `0…costumeWidth/Height-1` | `pixelColor`, `costumePixels().data` |

Convert the mouse (Scratch coords) to canvas-pixel coords for a full-stage canvas:

```js
var cx = Math.round(Scratch.mouse.x + 240);   // -240..240  ->  0..480
var cy = Math.round(180 - Scratch.mouse.y);    //  180..-180 ->  0..360
```

A flat RGBA buffer is indexed `i = ((y * width) + x) * 4`, with
`data[i], data[i+1], data[i+2], data[i+3]` = R, G, B, A.

---

## 10. Best practices

- **Match the type to the job:** value → `reporter`/`boolean`; action → `command`;
  wraps a stack → `c-loop`/`c-if`; triggers a script → `hat`.
- **Every input appears once in the label; every `{name}` has an input.**
- **Reporters/booleans return; commands/C-blocks don't.** Hats return a boolean and
  never wait.
- **Bound your loops.** Use real exit conditions; never `while (true)`.
- **Use `warp: true`** for command/C-blocks that must complete heavy per-frame work
  (canvas drawing, whole-grid stamping, FFT) in one frame.
- **Persist state in `Scratch.data`,** not in module/global variables — the body's
  locals don't survive between calls, and there are no real globals. `Scratch.data` is
  cleared on green flag/stop, which is usually what you want.
- **Clean up with `Scratch.onStop`** if you start something that needs tearing down.
- **Stay inside the API.** Don't reference blocked globals or invent `Scratch.*` calls
  that aren't listed in §5. There is no sound-playing, broadcasting, or asking.
- **Keep the "wide walls" open** — small, composable blocks that do one clear thing and
  invite remixing beat one giant do-everything block.

---

## 11. Worked examples

Each is a complete, valid block document (verbatim from the built-in libraries where
noted). These are good few-shot targets.

### Reporter — Caesar cipher (per-character string work)

```
---
type: reporter
text: "shift letters of {s} by {n}"
inputs:
  s: text = "hello"
  n: number = 3
---
var s = Scratch.args.s;
var n = ((Scratch.args.n % 26) + 26) % 26;
var out = "";
for (var i = 0; i < s.length; i++) {
  var c = s.charCodeAt(i);
  if (c >= 65 && c <= 90) out += String.fromCharCode(((c - 65 + n) % 26) + 65);
  else if (c >= 97 && c <= 122) out += String.fromCharCode(((c - 97 + n) % 26) + 97);
  else out += s.charAt(i);
}
return out;
```

### Boolean — string contains

```
---
type: boolean
text: "{s} contains {sub}?"
inputs:
  s: text = "apple"
  sub: text = "pp"
---
return Scratch.text.contains(Scratch.args.s, Scratch.args.sub);
```

### Command — true 2D grid + neighbor counting (Game of Life)

```
---
type: reporter
text: "living neighbors in {name} at {r} {c}"
inputs:
  name: text = "world"
  r: number = 1
  c: number = 1
---
var name = Scratch.args.name;
var r = Scratch.args.r;
var c = Scratch.args.c;
var count = 0;
for (var dr = -1; dr <= 1; dr++) {
  for (var dc = -1; dc <= 1; dc++) {
    if (dr === 0 && dc === 0) continue;
    if (Number(Scratch.data.cell(name, r + dr, c + dc)) === 1) count++;
  }
}
return count;
```

### Reporter — read a rendered stage color (Color Chameleon)

```
---
type: reporter
text: "color at x {x} y {y}"
inputs:
  x: number = 0
  y: number = 0
---
return Scratch.colorAtStage(Scratch.args.x, Scratch.args.y);
```

### Command + warp — draw into your own pixel layer

```
---
type: command
text: "paint at the mouse, size {size} color {color}"
inputs:
  size: number = 6
  color: text = "#ff3355"
---
var cx = Math.round(Scratch.mouse.x + 240);
var cy = Math.round(180 - Scratch.mouse.y);
var rad = Math.max(1, Math.round(Scratch.args.size));
var color = Scratch.args.color;
for (var dy = -rad; dy <= rad; dy++) {
  for (var dx = -rad; dx <= rad; dx++) {
    if ((dx * dx) + (dy * dy) <= rad * rad) Scratch.canvas.setPixel(cx + dx, cy + dy, color);
  }
}
```

### C-loop + warp — a custom "for each cell of a grid" that positions the sprite

```
---
type: c-loop
text: "for each cell of a {cols} by {rows} grid, {size} apart"
warp: true
inputs:
  cols: number = 12
  rows: number = 12
  size: number = 26
---
var cols = Math.max(1, Math.round(Scratch.args.cols));
var rows = Math.max(1, Math.round(Scratch.args.rows));
var size = Scratch.args.size;
var startX = -((cols - 1) * size) / 2;
var startY = ((rows - 1) * size) / 2;
for (var r = 1; r <= rows; r++) {
  for (var c = 1; c <= cols; c++) {
    Scratch.data.set("col", c);
    Scratch.data.set("row", r);
    Scratch.goToXY(startX + ((c - 1) * size), startY - ((r - 1) * size));
    Scratch.runBranch();
  }
}
```

### C-if — run the wrapped blocks with a probability

```
---
type: c-if
text: "maybe {chance}%"
inputs:
  chance: number = 50
---
if ((Math.random() * 100) < Scratch.args.chance) {
    Scratch.runBranch();
}
```

### Hat — fire once the timer passes a threshold

```
---
type: hat
text: "when timer passes {n}"
inputs:
  n: number = 10
---
return Scratch.timer > Scratch.args.n;
```

### Command + onStop — persistent state with cleanup

```
---
type: command
text: "count up and remember it"
inputs:
---
var n = Number(Scratch.data.get("count")) || 0;
n = n + 1;
Scratch.data.set("count", n);
Scratch.setSize(50 + n);
Scratch.onStop(function () {
  Scratch.data.set("count", 0);
});
```

---

## 12. Compact spec for an LLM (paste this as the system instruction)

> You write a single **block document** for Scratch's JS-powered custom blocks: a
> `---` header, a `---` line, then a JavaScript body. Output **only** the document — no
> code fences, no explanation.
>
> ```
> ---
> type: <command | reporter | boolean | c-loop | c-if | hat>
> text: "label with {name} placeholders"
> inputs:
>   name: <number | text | boolean> = <default>
> ---
> <JavaScript body>
> ```
>
> **Header:** `type` and `text` are required. Every `{name}` in `text` must have a
> matching input and every input must appear once in `text`. Quote text defaults.
> `inputs:` may be empty. `color:` and `warp:` are optional.
>
> **Body:**
> - Read inputs with `Scratch.args.NAME` (already cast to type).
> - `reporter`/`boolean`/`hat` **must** end with `return <value>;` at the top level.
> - `command` needs no return.
> - `c-loop`/`c-if` call `Scratch.runBranch()` to run wrapped blocks (in a loop to
>   repeat); no return.
> - `hat` is checked every frame, returns true to fire, and must **not** call
>   `runBranch` or wait.
> - Give every loop a real exit condition (no `while (true)`).
> - Use only the `Scratch.*` API and standard built-ins (`Math`, `JSON`, `String`,
>   `Number`, `Array`, `Object`, `Boolean`, `Date`, `RegExp`, `parseInt`,
>   `parseFloat`, `isNaN`, `isFinite`). Do **not** use `window`, `document`, `fetch`,
>   `eval`, `Function`, `setTimeout`, `require`, `Promise`, `Symbol`, `Proxy`, or any
>   host/network API — they are blocked. There is no `Scratch.say`, `broadcast`,
>   `playSound`, `ask`, or `wait`.
>
> Then include the API tables from §5 above.

---

*Generated as LLM context for authoring new JS-powered blocks. Verified against the
`js-blocks` branch implementation.*
