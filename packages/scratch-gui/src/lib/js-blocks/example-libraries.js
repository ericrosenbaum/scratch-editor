import {buildLibraryBlock} from './library-model';

/**
 * @file Built-in example libraries for JS-powered blocks. Each library is paired
 * with an example project (see ./projects) that does something clearly outside
 * vanilla Scratch's reach — reading pixel colors, reading sound samples, real
 * string manipulation, and true 2D grids — while staying simple and playful.
 * Blocks are authored as documents and compiled through the same static-analysis
 * path as user blocks.
 */

/* eslint-disable @stylistic/indent */
// Block documents are multi-line template literals; their interior lines are the
// authored text and must not be re-indented by the linter.

/** Text — ciphers and word play (Secret Decoder Ring project). */
const TEXT = {
    name: 'Text',
    color1: '#59C059',
    color2: '#46B946',
    color3: '#389438',
    docs: [
`---
type: reporter
text: "{s} backwards"
inputs:
  s: text = "scratch"
---
return Scratch.text.reverse(Scratch.args.s);`,
`---
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
return out;`,
`---
type: reporter
text: "uppercase {s}"
inputs:
  s: text = "hello"
---
return Scratch.text.upper(Scratch.args.s);`,
`---
type: reporter
text: "word {n} of {s}"
inputs:
  n: number = 1
  s: text = "the quick fox"
---
var words = Scratch.text.split(Scratch.args.s, " ");
var i = Math.max(1, Math.min(Scratch.args.n, words.length));
return words[i - 1];`,
`---
type: boolean
text: "{s} contains {sub}?"
inputs:
  s: text = "apple"
  sub: text = "pp"
---
return Scratch.text.contains(Scratch.args.s, Scratch.args.sub);`
    ]
};

/** Grids — true 2D arrays (Game of Life project). */
const GRIDS = {
    name: 'Grids',
    color1: '#FF8C1A',
    color2: '#FF8000',
    color3: '#DB6E00',
    docs: [
`---
type: command
text: "new grid {name} size {n}"
inputs:
  name: text = "world"
  n: number = 10
---
Scratch.data.new2DArray(Scratch.args.name, Scratch.args.n, Scratch.args.n, 0);`,
`---
type: command
text: "randomize grid {name} size {n}"
inputs:
  name: text = "world"
  n: number = 10
---
var name = Scratch.args.name;
var n = Scratch.args.n;
Scratch.data.new2DArray(name, n, n, 0);
for (var r = 1; r <= n; r++) {
  for (var c = 1; c <= n; c++) {
    Scratch.data.setCell(name, r, c, Math.random() < 0.35 ? 1 : 0);
  }
}`,
`---
type: command
text: "set grid {name} {r} {c} to {v}"
inputs:
  name: text = "world"
  r: number = 1
  c: number = 1
  v: number = 1
---
Scratch.data.setCell(Scratch.args.name, Scratch.args.r, Scratch.args.c, Scratch.args.v);`,
`---
type: reporter
text: "grid {name} {r} {c}"
inputs:
  name: text = "world"
  r: number = 1
  c: number = 1
---
return Scratch.data.cell(Scratch.args.name, Scratch.args.r, Scratch.args.c);`,
`---
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
return count;`,
`---
type: command
text: "copy grid {from} to {to} size {n}"
inputs:
  from: text = "next"
  to: text = "world"
  n: number = 10
---
var from = Scratch.args.from;
var to = Scratch.args.to;
var n = Scratch.args.n;
for (var r = 1; r <= n; r++) {
  for (var c = 1; c <= n; c++) {
    Scratch.data.setCell(to, r, c, Scratch.data.cell(from, r, c));
  }
}`
    ]
};

/** Pixels — read actual costume/stage colors (Color Chameleon project). */
const PIXELS = {
    name: 'Pixels',
    color1: '#9966FF',
    color2: '#855CD6',
    color3: '#774DCB',
    docs: [
`---
type: reporter
text: "color at x {x} y {y}"
inputs:
  x: number = 0
  y: number = 0
---
return Scratch.colorAtStage(Scratch.args.x, Scratch.args.y);`,
`---
type: reporter
text: "my pixel {x} {y}"
inputs:
  x: number = 0
  y: number = 0
---
return Scratch.pixelColor(Scratch.args.x, Scratch.args.y);`,
`---
type: reporter
text: "red of {color}"
inputs:
  color: text = "#ff8800"
---
return parseInt(Scratch.args.color.substring(1, 3), 16) || 0;`,
`---
type: reporter
text: "green of {color}"
inputs:
  color: text = "#ff8800"
---
return parseInt(Scratch.args.color.substring(3, 5), 16) || 0;`,
`---
type: reporter
text: "blue of {color}"
inputs:
  color: text = "#ff8800"
---
return parseInt(Scratch.args.color.substring(5, 7), 16) || 0;`,
`---
type: reporter
text: "costume width"
inputs:
---
return Scratch.sprite.costumeWidth;`,
`---
type: reporter
text: "costume height"
inputs:
---
return Scratch.sprite.costumeHeight;`
    ]
};

/** Sound — read sound samples and loudness (Sound Bars project). */
const SOUND = {
    name: 'Sound',
    color1: '#4C97FF',
    color2: '#3373CC',
    color3: '#2E5EAC',
    docs: [
`---
type: reporter
text: "loudness of sound {n}"
inputs:
  n: number = 1
---
return Scratch.soundLoudness(Scratch.args.n);`,
`---
type: reporter
text: "seconds in sound {n}"
inputs:
  n: number = 1
---
return Scratch.soundDuration(Scratch.args.n);`,
`---
type: reporter
text: "samples in sound {n}"
inputs:
  n: number = 1
---
return Scratch.soundSamples(Scratch.args.n).length;`,
`---
type: reporter
text: "sample {i} of sound {n}"
inputs:
  i: number = 1
  n: number = 1
---
var s = Scratch.soundSamples(Scratch.args.n);
var i = Math.max(1, Math.min(Scratch.args.i, s.length));
return Math.round(Math.abs(s[i - 1]) * 100);`
    ]
};

const FAMILIES = [TEXT, GRIDS, PIXELS, SOUND];

/**
 * Build a fully-compiled example library ready for installCustomLibrary.
 * @param {object} family - one of the example family descriptors.
 * @returns {object} a library object with compiled blocks.
 */
const buildExampleLibrary = family => {
    const blocks = [];
    family.docs.forEach((source, index) => {
        const built = buildLibraryBlock(source, `ex${index}`);
        if (built.ok) blocks.push(built.block);
    });
    return {
        id: `jslib_ex_${family.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`,
        name: family.name,
        color1: family.color1,
        color2: family.color2,
        color3: family.color3,
        blocks
    };
};

/**
 * The example libraries available to add, as {name, build} entries.
 * @returns {Array.<object>} example descriptors.
 */
const exampleLibraryList = () => FAMILIES.map(family => ({
    name: family.name,
    build: () => buildExampleLibrary(family)
}));

export {exampleLibraryList, buildExampleLibrary, FAMILIES};
