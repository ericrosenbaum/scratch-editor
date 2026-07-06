import {buildLibraryBlock} from './library-model';

/**
 * @file Built-in example libraries for JS-powered blocks. Each library is paired
 * with an example project (see ./projects) that does something clearly outside
 * vanilla Scratch's reach — reading pixel colors, reading sound samples, real
 * string manipulation, true 2D grids, and drawing into a pixel layer of your
 * own — while staying simple and playful.
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

/** Canvas — draw into a pixel layer of your own (Pixel Paint project). */
const CANVAS = {
    name: 'Canvas',
    color1: '#CF63CF',
    color2: '#C94FC9',
    color3: '#BD42BD',
    docs: [
`---
type: command
text: "set up a {w} by {h} canvas"
inputs:
  w: number = 480
  h: number = 360
---
Scratch.canvas.resize(Scratch.args.w, Scratch.args.h);`,
`---
type: command
text: "clear the canvas"
inputs:
---
Scratch.canvas.clear();`,
`---
type: command
text: "fill the canvas with {color}"
inputs:
  color: text = "#000000"
---
Scratch.canvas.fill(Scratch.args.color);`,
`---
type: command
text: "paint a dot at x {x} y {y} size {size} color {color}"
inputs:
  x: number = 240
  y: number = 180
  size: number = 8
  color: text = "#ff3355"
---
var cx = Math.round(Scratch.args.x);
var cy = Math.round(Scratch.args.y);
var rad = Math.max(1, Math.round(Scratch.args.size));
var color = Scratch.args.color;
for (var dy = -rad; dy <= rad; dy++) {
  for (var dx = -rad; dx <= rad; dx++) {
    if ((dx * dx) + (dy * dy) <= rad * rad) Scratch.canvas.setPixel(cx + dx, cy + dy, color);
  }
}`,
`---
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
}`,
`---
type: reporter
text: "rainbow color {t}"
inputs:
  t: number = 0
---
var h = ((((Scratch.args.t % 360) + 360) % 360)) / 60;
var x = 1 - Math.abs((h % 2) - 1);
var r = 0, g = 0, b = 0;
if (h < 1) { r = 1; g = x; }
else if (h < 2) { r = x; g = 1; }
else if (h < 3) { g = 1; b = x; }
else if (h < 4) { g = x; b = 1; }
else if (h < 5) { r = x; b = 1; }
else { r = 1; b = x; }
var packed = 0x1000000 + (Math.round(r * 255) << 16) + (Math.round(g * 255) << 8) + Math.round(b * 255);
return "#" + packed.toString(16).slice(1);`
    ]
};

/** Life — Conway's Game of Life simulation, rules only (Game of Life with Pen project). */
const LIFE = {
    name: 'Life',
    color1: '#0FBD8C',
    color2: '#0DA57A',
    color3: '#0B8E69',
    docs: [
`---
type: command
text: "new {cols} by {rows} life world"
inputs:
  cols: number = 12
  rows: number = 12
---
var cols = Math.max(2, Math.round(Scratch.args.cols));
var rows = Math.max(2, Math.round(Scratch.args.rows));
Scratch.data.set("cols", cols);
Scratch.data.set("rows", rows);
Scratch.data.new2DArray("cells", rows, cols, 0);`,
`---
type: command
text: "randomize the life world"
inputs:
---
var cols = Number(Scratch.data.get("cols"));
var rows = Number(Scratch.data.get("rows"));
for (var r = 1; r <= rows; r++) {
  for (var c = 1; c <= cols; c++) {
    Scratch.data.setCell("cells", r, c, Math.random() < 0.33 ? 1 : 0);
  }
}`,
`---
type: command
text: "step the life world"
warp: true
inputs:
---
var cols = Number(Scratch.data.get("cols"));
var rows = Number(Scratch.data.get("rows"));
Scratch.data.new2DArray("next", rows, cols, 0);
for (var r = 1; r <= rows; r++) {
  for (var c = 1; c <= cols; c++) {
    var live = 0;
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        var rr = r + dr;
        var cc = c + dc;
        if (rr >= 1 && rr <= rows && cc >= 1 && cc <= cols && Number(Scratch.data.cell("cells", rr, cc)) === 1) live++;
      }
    }
    var alive = Number(Scratch.data.cell("cells", r, c)) === 1;
    var born = (alive && (live === 2 || live === 3)) || (!alive && live === 3);
    Scratch.data.setCell("next", r, c, born ? 1 : 0);
  }
}
for (var r2 = 1; r2 <= rows; r2++) {
  for (var c2 = 1; c2 <= cols; c2++) {
    Scratch.data.setCell("cells", r2, c2, Scratch.data.cell("next", r2, c2));
  }
}`,
`---
type: boolean
text: "life cell {col} {row} is alive?"
inputs:
  col: number = 1
  row: number = 1
---
return Number(Scratch.data.cell("cells", Scratch.args.row, Scratch.args.col)) === 1;`,
`---
type: reporter
text: "life world columns"
inputs:
---
return Number(Scratch.data.get("cols"));`
    ]
};

/** Grid — a C block that visits every cell of a grid, positioning the sprite to draw it. */
const GRID = {
    name: 'Grid',
    color1: '#CF8B17',
    color2: '#B87914',
    color3: '#A06811',
    docs: [
`---
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
}`,
`---
type: reporter
text: "grid column"
inputs:
---
return Number(Scratch.data.get("col"));`,
`---
type: reporter
text: "grid row"
inputs:
---
return Number(Scratch.data.get("row"));`
    ]
};

/** Image — copy the sprite's rendered costume and redraw it on the canvas, transformed. */
const IMAGE = {
    name: 'Image',
    color1: '#FF4D6A',
    color2: '#F03355',
    color3: '#D81E45',
    docs: [
`---
type: command
text: "stamp my costume, colors inverted, at x {x} y {y}"
warp: true
inputs:
  x: number = -120
  y: number = 0
---
var img = Scratch.costumePixels();
if (img.width < 1) return;
var src = img.data;
Scratch.canvas.resize(img.width, img.height);
var out = [];
for (var i = 0; i < src.length; i += 4) {
  out.push(255 - src[i], 255 - src[i + 1], 255 - src[i + 2], src[i + 3]);
}
Scratch.canvas.write(out);
Scratch.canvas.goToXY(Scratch.args.x, Scratch.args.y);`,
`---
type: command
text: "stamp my costume, grayscale, at x {x} y {y}"
warp: true
inputs:
  x: number = 120
  y: number = 0
---
var img = Scratch.costumePixels();
if (img.width < 1) return;
var src = img.data;
Scratch.canvas.resize(img.width, img.height);
var out = [];
for (var i = 0; i < src.length; i += 4) {
  var g = Math.round((src[i] * 0.3) + (src[i + 1] * 0.59) + (src[i + 2] * 0.11));
  out.push(g, g, g, src[i + 3]);
}
Scratch.canvas.write(out);
Scratch.canvas.goToXY(Scratch.args.x, Scratch.args.y);`,
`---
type: command
text: "stamp my costume, mirrored, at x {x} y {y}"
warp: true
inputs:
  x: number = 0
  y: number = 0
---
var img = Scratch.costumePixels();
if (img.width < 1) return;
var w = img.width;
var h = img.height;
var src = img.data;
Scratch.canvas.resize(w, h);
var out = new Array(src.length);
for (var y = 0; y < h; y++) {
  for (var x = 0; x < w; x++) {
    var s = ((y * w) + x) * 4;
    var d = ((y * w) + (w - 1 - x)) * 4;
    out[d] = src[s];
    out[d + 1] = src[s + 1];
    out[d + 2] = src[s + 2];
    out[d + 3] = src[s + 3];
  }
}
Scratch.canvas.write(out);
Scratch.canvas.goToXY(Scratch.args.x, Scratch.args.y);`,
`---
type: command
text: "clear the stamp"
inputs:
---
Scratch.canvas.clear();`
    ]
};

/** Scope — a real-time sweeping oscilloscope drawn on the canvas (Sound Visualizer project). */
const SCOPE = {
    name: 'Scope',
    color1: '#0FBDBD',
    color2: '#0DA5A5',
    color3: '#0B8E8E',
    docs: [
`---
type: command
text: "show level {v} on the scope"
warp: true
inputs:
  v: number = 0
---
var W = 480;
var H = 180;
var mid = 90;
if (Number(Scratch.data.get("ready")) !== 1) {
  Scratch.canvas.resize(W, H);
  Scratch.canvas.goToXY(0, 0);
  Scratch.canvas.fill([10, 12, 28, 255]);
  Scratch.data.set("x", 0);
  Scratch.data.set("ready", 1);
}
var x = Number(Scratch.data.get("x"));
var v = Math.max(0, Math.min(100, Scratch.args.v));
var half = Math.round((v / 100) * (mid - 2));
for (var y = 0; y < H; y++) {
  Scratch.canvas.setPixel(x, y, [10, 12, 28, 255]);
  Scratch.canvas.setPixel((x + 1) % W, y, [44, 48, 78, 255]);
}
var col = [60 + Math.round(v * 1.9), 235 - Math.round(v * 1.2), 110, 255];
for (var d = 0; d <= half; d++) {
  Scratch.canvas.setPixel(x, mid - d, col);
  Scratch.canvas.setPixel(x, mid + d, col);
}
Scratch.data.set("x", (x + 1) % W);`,
`---
type: command
text: "reset the scope"
inputs:
---
Scratch.canvas.clear();
Scratch.data.set("ready", 0);`
    ]
};

/** Spectrum — a real FFT over the project's live audio output (Audio Spectrum project). */
const SPECTRUM = {
    name: 'Spectrum',
    color1: '#7C4DFF',
    color2: '#6A3DF0',
    color3: '#5B32D6',
    docs: [
`---
type: command
text: "draw the audio spectrum"
warp: true
inputs:
---
var N = 256;
var W = 480;
var H = 120;
var BANDS = 32;
if (Number(Scratch.data.get("ready")) !== 1) {
  Scratch.canvas.resize(W, H);
  Scratch.canvas.goToXY(0, -120);
  Scratch.data.set("ready", 1);
}
Scratch.canvas.fill([10, 12, 28, 255]);
var samples = Scratch.audioOutputSamples(N);
if (samples.length < N) return;
// FFT (radix-2 Cooley-Tukey) over a Hann-windowed slice of the live output.
var re = new Array(N);
var im = new Array(N);
for (var i = 0; i < N; i++) {
  var w = 0.5 - (0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  re[i] = samples[i] * w;
  im[i] = 0;
}
var j = 0;
for (var k = 0; k < N; k++) {
  if (k < j) {
    var t = re[j]; re[j] = re[k]; re[k] = t;
    t = im[j]; im[j] = im[k]; im[k] = t;
  }
  var m = N >> 1;
  while (m >= 1 && j >= m) { j -= m; m >>= 1; }
  j += m;
}
for (var size = 2; size <= N; size *= 2) {
  var wr = Math.cos((2 * Math.PI) / size);
  var wi = -Math.sin((2 * Math.PI) / size);
  for (var start = 0; start < N; start += size) {
    var cr = 1;
    var ci = 0;
    for (var p = 0; p < size / 2; p++) {
      var a = start + p;
      var b = a + (size / 2);
      var tr = (cr * re[b]) - (ci * im[b]);
      var ti = (cr * im[b]) + (ci * re[b]);
      re[b] = re[a] - tr;
      im[b] = im[a] - ti;
      re[a] += tr;
      im[a] += ti;
      var nc = (cr * wr) - (ci * wi);
      ci = (cr * wi) + (ci * wr);
      cr = nc;
    }
  }
}
re[0] = 0;
im[0] = 0;
// Group the N/2 magnitude bins into bars: bass on the left, treble on the right.
var perBand = (N / 2) / BANDS;
var barW = W / BANDS;
for (var band = 0; band < BANDS; band++) {
  var sum = 0;
  for (var q = 0; q < perBand; q++) {
    var bin = (band * perBand) + q;
    sum += Math.sqrt((re[bin] * re[bin]) + (im[bin] * im[bin]));
  }
  var level = Math.min(1, (sum / perBand) / (N / 8));
  var barH = Math.round(Math.sqrt(level) * (H - 2));
  var f = band / BANDS;
  var col = [70 + Math.round(f * 185), 230 - Math.round(f * 150), 140, 255];
  var x0 = Math.round(band * barW) + 1;
  var x1 = Math.round((band + 1) * barW) - 1;
  for (var x = x0; x < x1; x++) {
    for (var y = 0; y < barH; y++) {
      Scratch.canvas.setPixel(x, H - 1 - y, col);
    }
  }
}`,
`---
type: reporter
text: "loudest frequency in Hz"
inputs:
---
var N = 256;
var samples = Scratch.audioOutputSamples(N);
var rate = Scratch.audioSampleRate();
if (samples.length < N || rate < 1) return 0;
var re = new Array(N);
var im = new Array(N);
for (var i = 0; i < N; i++) {
  var w = 0.5 - (0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  re[i] = samples[i] * w;
  im[i] = 0;
}
var j = 0;
for (var k = 0; k < N; k++) {
  if (k < j) {
    var t = re[j]; re[j] = re[k]; re[k] = t;
    t = im[j]; im[j] = im[k]; im[k] = t;
  }
  var m = N >> 1;
  while (m >= 1 && j >= m) { j -= m; m >>= 1; }
  j += m;
}
for (var size = 2; size <= N; size *= 2) {
  var wr = Math.cos((2 * Math.PI) / size);
  var wi = -Math.sin((2 * Math.PI) / size);
  for (var start = 0; start < N; start += size) {
    var cr = 1;
    var ci = 0;
    for (var p = 0; p < size / 2; p++) {
      var a = start + p;
      var b = a + (size / 2);
      var tr = (cr * re[b]) - (ci * im[b]);
      var ti = (cr * im[b]) + (ci * re[b]);
      re[b] = re[a] - tr;
      im[b] = im[a] - ti;
      re[a] += tr;
      im[a] += ti;
      var nc = (cr * wr) - (ci * wi);
      ci = (cr * wi) + (ci * wr);
      cr = nc;
    }
  }
}
var mags = new Array(N / 2);
var best = 1;
var bestMag = 0;
for (var bin = 1; bin < N / 2; bin++) {
  mags[bin] = Math.sqrt((re[bin] * re[bin]) + (im[bin] * im[bin]));
  if (mags[bin] > bestMag) {
    bestMag = mags[bin];
    best = bin;
  }
}
if (bestMag < 0.5) return 0;
// Parabolic interpolation between neighboring bins for sub-bin precision.
var shift = 0;
if (best > 1 && best < (N / 2) - 1) {
  var l = mags[best - 1];
  var r = mags[best + 1];
  var d = l - (2 * bestMag) + r;
  if (d !== 0) shift = (0.5 * (l - r)) / d;
}
return Math.round(((best + shift) * rate) / N);`,
`---
type: reporter
text: "audio output level"
inputs:
---
var samples = Scratch.audioOutputSamples(256);
if (samples.length < 1) return 0;
var sum = 0;
for (var i = 0; i < samples.length; i++) {
  sum += samples[i] * samples[i];
}
return Math.round(Math.min(100, Math.sqrt(sum / samples.length) * 100));`,
`---
type: command
text: "reset the spectrum"
inputs:
---
Scratch.canvas.clear();
Scratch.data.set("ready", 0);`
    ]
};

/** Sign — rewrite the text painted on a costume, live (Talking Sign project). */
const SIGN = {
    name: 'Sign',
    color1: '#2AA898',
    color2: '#209183',
    color3: '#1B7A6E',
    docs: [
`---
type: command
text: "write {text} on sign line {line}"
inputs:
  text: text = "HELLO"
  line: number = 1
---
var line = Math.max(1, Math.round(Scratch.args.line));
Scratch.svg.setText("line" + line, Scratch.args.text);`,
`---
type: command
text: "color sign line {line} {color}"
inputs:
  line: number = 1
  color: text = "#c0392b"
---
var line = Math.max(1, Math.round(Scratch.args.line));
Scratch.svg.set("line" + line, "fill", Scratch.args.color);`,
`---
type: command
text: "reset the sign"
inputs:
---
Scratch.svg.reset();`
    ]
};

/** Puppet — move, turn, recolor and swap the named parts of a costume (Robot Puppet project). */
const PUPPET = {
    name: 'Puppet',
    color1: '#8E5BE8',
    color2: '#7C49D6',
    color3: '#6A3BC0',
    docs: [
`---
type: command
text: "turn part {id} to {deg} degrees"
inputs:
  id: text = "arm-left"
  deg: number = 20
---
Scratch.svg.rotate(Scratch.args.id, Scratch.args.deg);`,
`---
type: command
text: "slide part {id} by x {dx} y {dy}"
inputs:
  id: text = "pupil-left"
  dx: number = 0
  dy: number = 0
---
Scratch.svg.move(Scratch.args.id, Scratch.args.dx, Scratch.args.dy);`,
`---
type: command
text: "show part {id}"
inputs:
  id: text = "mouth-open"
---
Scratch.svg.show(Scratch.args.id);`,
`---
type: command
text: "hide part {id}"
inputs:
  id: text = "mouth-open"
---
Scratch.svg.hide(Scratch.args.id);`,
`---
type: command
text: "color part {id} {color}"
inputs:
  id: text = "light"
  color: text = "#e74c3c"
---
Scratch.svg.setFill(Scratch.args.id, Scratch.args.color);`,
`---
type: reporter
text: "costume part ids"
inputs:
---
return Scratch.svg.ids().join(", ");`,
`---
type: command
text: "reset my costume"
inputs:
---
Scratch.svg.reset();`
    ]
};

const FAMILIES = [TEXT, GRIDS, PIXELS, SOUND, CANVAS, LIFE, GRID, IMAGE, SCOPE, SPECTRUM, SIGN, PUPPET];

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
