# JS-powered blocks — example projects

Four small, playful starter projects, each paired with one example library. Every
project does something **clearly outside vanilla Scratch's reach** — yet the
*resulting blocks* are simple to read and use. Each is generated as a loadable
`.sb3` by `scripts/build-js-block-projects.js` (which embeds the library and the
script below), and offered in the **My Block Libraries** manager under "Load an
example project".

The "why it's beyond Scratch" note matters: these are not re-skins of things you
can already do — they expose capabilities the block palette deliberately omits.

---

## 1. Secret Decoder Ring — library: **Text**

**What it does:** Ask the user for a message, show it enciphered (Caesar shift + a
reversal); ask for a secret code, show it deciphered. A playful spy toy.

**Beyond Scratch:** real per-character string manipulation. Vanilla Scratch can
read "letter N of" and "length of" but cannot shift letters, split words, or
reverse a string without a painful per-letter loop.

**Script (Sprite1):**
```
when green flag clicked
ask [Type a secret message:] and wait
set [coded] to ( shift letters of (answer) by (3) )      // Text block
set [coded] to ( (coded) backwards )                      // Text block
say (join [Coded: ] (coded)) for (3) seconds
ask [Paste a code to decode:] and wait
set [plain] to ( (answer) backwards )
set [plain] to ( shift letters of (plain) by (-3) )
say (join [Decoded: ] (plain)) for (3) seconds
```

**Blocks used:** `shift letters of () by ()`, `() backwards`. Invites tinkering:
change the shift amount; add `uppercase`.

---

## 2. Game of Life — library: **Grids**

**What it does:** Conway's Game of Life on a 10×10 grid. Cells are stamped squares;
the pattern evolves every tick — gliders, blinkers, still lifes.

**Beyond Scratch:** true 2D arrays and neighbor counting. Doing this with flat
Scratch lists (index math `(row-1)*W+col`, eight neighbor lookups, edge handling)
is the canonical "you can't really do this in Scratch" task. The
`living neighbors in () at () ()` block collapses it to one block.

**Script (Cell sprite, hidden; drawn with stamp):**
```
when green flag clicked
randomize grid [world] size (10)                          // Grids block
forever
  // draw current generation
  erase all
  set [r] to (1)
  repeat (10)
    set [c] to (1)
    repeat (10)
      if < (grid [world] (r) (c)) = (1) >                 // Grids reporter
        go to x:((c)*20 - 100) y:(100 - (r)*20)
        stamp
      change [c] by (1)
    change [r] by (1)
  // compute next generation into grid [next]
  new grid [next] size (10)                               // Grids block
  set [r] to (1)
  repeat (10)
    set [c] to (1)
    repeat (10)
      set [n] to ( living neighbors in [world] at (r) (c) )
      if <<(n) = (3)> or <<(n) = (2)> and <(grid [world] (r) (c)) = (1)>>>
        set grid [next] (r) (c) to (1)
      else
        set grid [next] (r) (c) to (0)
      change [c] by (1)
    change [r] by (1)
  copy grid [next] to [world] size (10)                   // Grids block
  wait (0.1) seconds
```

**Blocks used:** `randomize grid`, `grid () ()`, `living neighbors`, `new grid`,
`set grid`, `copy grid`. Invites tinkering: change density, grid size, the rules.

---

## 3. Color Chameleon — library: **Pixels**

**What it does:** A chameleon follows the mouse over a rainbow backdrop and turns
the color of whatever is beneath it — it literally samples the stage.

**Beyond Scratch:** reading the actual rendered color at a point. Vanilla Scratch
can only ask "touching color?" (a yes/no for a color you pick in advance); it can
never *read* a color value to react to.

**Script (Chameleon sprite):**
```
when green flag clicked
forever
  go to (mouse-pointer)
  set [c] to ( color at x (x position) y (y position) )   // Pixels reporter (hex)
  set color effect to ( ( (red of (c)) - (blue of (c)) ) )  // react to the color
  say (c)
```

**Blocks used:** `color at x () y ()`, `red of ()`, `blue of ()`. Invites
tinkering: drive size from brightness; trigger sounds on certain colors.

---

## 4. Sound Bars — library: **Sound**

**What it does:** Eight bars (clones) form a little equalizer that reads a sound's
waveform — each bar's height comes from a different sample of the sound.

**Beyond Scratch:** reading sound sample/loudness data. Vanilla Scratch can play
sounds and read the live mic "loudness", but has no access to a *sound's* own
samples or duration.

**Script (Bar sprite):**
```
when green flag clicked
delete this clone? no — set up 8 bars:
set [i] to (1)
repeat (8)
  create clone of (myself)
  change [i] by (1)

when I start as a clone
set x to ((i) * 30 - 120)
forever
  set [pos] to ( ((i) / 8) * (samples in sound (1)) )      // Sound reporter
  set size to ( 50 + ( sample (pos) of sound (1) ) )       // Sound reporter (0..100)
  // (or: set size to (50 + loudness of sound (1)))
```

**Blocks used:** `samples in sound ()`, `sample () of sound ()`,
`loudness of sound ()`, `seconds in sound ()`. Invites tinkering: animate the
read position over time so the bars "scrub" through the sound.

---

## 5. Pixel Paint — library: **Canvas**

**What it does:** Hold the mouse button to paint into your own pixel layer; the
brush color cycles through the rainbow as you draw. A tiny paint program.

**Beyond Scratch:** *writing* arbitrary pixels to the screen. The pen can draw
lines and stamps, but nothing in vanilla Scratch lets you set individual pixels of
a layer — and crucially, the sprite's costume asset is never read or modified, so
the project saves and reopens unchanged. The canvas is a brand-new drawable that
clears itself on green flag / stop, just like `Scratch.data`.

**Script (Sprite1):**
```
when green flag clicked
forever
  if <mouse down?>
    paint at the mouse, size (6) color ( rainbow color ((timer) * (60)) )   // Canvas blocks
```

**Blocks used:** `paint at the mouse, size () color ()`, `rainbow color ()`, plus
`set up a () by () canvas`, `clear the canvas`, `fill the canvas with ()`,
`paint a dot at x () y () size () color ()`. Invites tinkering: drive brush size
from loudness; clear on a key press; paint a procedural pattern with
`Scratch.canvas.setPixel` in a loop.

---

## 6. Game of Life (Pen) — libraries: **Life** + **Grid**

**What it does:** Conway's Game of Life on a 12×12 board. Each generation, a grid
C block walks the sprite to every cell and stamps the living ones with the pen; the
**Life** library computes the next generation. The random soup settles into the
familiar still lifes, blinkers, and gliders.

**Beyond Scratch:** two things at once. (1) The **Life** library does real 2D
neighbor counting — the canonical "hard in Scratch" task. (2) The **Grid** library
is a *custom C block* (`for each cell of an n×n grid …`) that positions the sprite
and runs its wrapped blocks at every cell — and it's marked **warp**, so all 144
cells render in a single frame instead of 144. (Marking a JS block `warp: true`
now actually runs it without screen refresh.)

**Script (Sprite1):**
```
when green flag clicked
hide
erase all
set pen size to (18)
set pen color to (green)
new (12) by (12) life world                  // Life
randomize the life world                      // Life
forever
  erase all
  for each cell of a (12) by (12) grid, (26) apart {   // Grid (C block, warp)
    if < life cell (grid column) (grid row) is alive? > {  // Life + Grid reporters
      pen down
      pen up
    }
  }
  step the life world                         // Life
  wait (0.15) seconds
```

**Blocks used:** `new () by () life world`, `randomize`, `step`,
`life cell () () is alive?`, `for each cell of a () by () grid, () apart`,
`grid column`, `grid row`. Uses the **pen** extension (loaded automatically).
Invites tinkering: seed a glider by hand; change the rules; color cells by age.

---

## 7. Costume Inverter — library: **Image**

**What it does:** Copies the sprite's costume, inverts its colors, and stamps the
result on the canvas beside the original. (The library also has grayscale and
mirror.)

**Beyond Scratch:** a transform the graphic effects *can't* do. The color effect is
a hue rotation; there is no "invert", "grayscale", or "mirror" effect. This reads
the costume's actual rendered pixels (`Scratch.costumePixels()`), transforms them in
JS, and writes them to a canvas layer — the costume asset is never modified.

**Script (Sprite1):**
```
when green flag clicked
set size to (100) %
clear graphic effects
stamp my costume, colors inverted, at x (-130) y (0)   // Image
```

**Blocks used:** `stamp my costume, colors inverted/grayscale/mirrored, at x () y ()`,
`clear the stamp`. Invites tinkering: swap in grayscale or mirror; animate the
transform; posterize or threshold the pixels yourself.

---

## 8. Sound Visualizer — library: **Scope**

**What it does:** A real-time oscilloscope. The microphone's live level sweeps
across your own canvas layer left-to-right, drawing a mirrored waveform that's
greener when it's loud — like a heart monitor.

**Beyond Scratch:** drawing a live, per-frame visualization into a pixel layer.
Vanilla Scratch can read the mic "loudness" but has nowhere to *draw* a history of
it; this sweeps a cheap one-column-per-frame trace across a `Scratch.canvas` layer.

**Script (Sprite1):**
```
when green flag clicked
reset the scope                               // Scope
forever
  show level (loudness) on the scope          // Scope, fed the mic loudness
```

**Blocks used:** `show level () on the scope`, `reset the scope`. Invites tinkering:
feed it a sound's samples instead of the mic; change the sweep speed or palette;
trigger events when the level crosses a threshold.

---

## 9. Audio Spectrum (FFT) — library: **Spectrum**

**What it does:** A dancing frequency-bar visualizer. One script loops the Meow
sound; the other grabs the project's live audio output every frame, runs a real
FFT (fast Fourier transform) on it, and draws 32 bars on a canvas strip along the
bottom of the stage — bass on the left, treble on the right.

**Beyond Scratch:** hearing the project's *own* output. Vanilla Scratch's
"loudness" reads only the microphone; nothing can observe the audio the project
itself is playing, let alone split it into frequencies. The new
`Scratch.audioOutputSamples()` taps the audio engine's output mix (an
AnalyserNode on the node every sound flows through), and the block's JS runs a
textbook radix-2 Cooley-Tukey FFT — with a Hann window and all — right in the
authored code.

**Script (Sprite1, two stacks):**
```
when green flag clicked
forever
  play sound [Meow v] until done

when green flag clicked
reset the spectrum                            // Spectrum
forever
  draw the audio spectrum                     // Spectrum (warp: FFT + draw, once per frame)
```

**Blocks used:** `draw the audio spectrum`, `reset the spectrum`,
`loudest frequency in Hz` (peak bin with parabolic interpolation — play a note,
see its pitch), `audio output level` (RMS of the live output). Invites tinkering:
swap in your own music; drive a sprite's size from `audio output level`; say the
`loudest frequency in Hz` while whistling into a Play Note block; change the
number of bars or the colors.

---

## 10. Silly Sentences — library: **Markov**

**What it does:** The cat babbles an endless stream of silly sentences, each one
freshly assembled by a Markov chain from a built-in corpus of nonsense ("The
wobbly wombat wore a tiny hat to the pancake party…"). No two runs are alike.

**Beyond Scratch:** real generative text. Vanilla Scratch can `join` and pick
`letter N of`, but it has no way to learn which words tend to follow which and
remix them — building a word-transition table and walking it needs true string
tokenization plus a keyed map of successor lists.

**Script (Sprite1):**
```
when green flag clicked
forever
  say ( a silly sentence ) for (3) seconds        // Markov reporter
```

**Blocks used:** `a silly sentence`, `make up () silly words`,
`silly word after ()` (all read the built-in corpus), plus `learn from ()` and
`remix () words` (the "wide wall": teach it your *own* text — the chain lives in
`Scratch.data`, cleared on green flag — and remix that instead). Invites
tinkering: `learn from` your favorite book or your friends' names, then `remix`;
build your own chain by hand with `silly word after ()` in a loop; drive the say
time or a sprite from the sentence length.

---

## Notes for the generator

- Each project embeds only its own library in `customLibraries`.
- Assets: a rainbow-gradient backdrop SVG (Chameleon), a small square costume
  (Game of Life cells / Sound bars), the default cat (Secret Decoder). Kept
  minimal and shared where possible.
- Scripts are intentionally short — the "wide walls" are left open for kids to
  extend, per the extension design guide's "invite modification" guidance.
