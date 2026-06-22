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

## Notes for the generator

- Each project embeds only its own library in `customLibraries`.
- Assets: a rainbow-gradient backdrop SVG (Chameleon), a small square costume
  (Game of Life cells / Sound bars), the default cat (Secret Decoder). Kept
  minimal and shared where possible.
- Scripts are intentionally short — the "wide walls" are left open for kids to
  extend, per the extension design guide's "invite modification" guidance.
