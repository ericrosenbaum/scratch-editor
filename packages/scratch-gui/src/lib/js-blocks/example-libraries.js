import {buildLibraryBlock} from './library-model';

/**
 * @file Built-in example libraries for JS-powered blocks, one per "high ceiling"
 * family. Each block is authored as a full document (header + JS); they are
 * compiled on demand through the same static-analysis path as user blocks. The
 * manager offers these so people can see what JS blocks make possible and tinker.
 */

/* eslint-disable @stylistic/indent */
// Block documents are multi-line template literals; their interior lines are the
// authored text and must not be re-indented by the linter.

/** A. Strings & text — word games, mad-libs, secret messages. */
const STRINGS = {
    name: 'Strings',
    color1: '#59C059',
    color2: '#46B946',
    color3: '#389438',
    docs: [
`---
type: reporter
text: "join {a} and {b}"
inputs:
  a: text = "hello "
  b: text = "world"
---
return Scratch.args.a + Scratch.args.b;`,
`---
type: reporter
text: "{s} backwards"
inputs:
  s: text = "scratch"
---
return Scratch.text.reverse(Scratch.args.s);`,
`---
type: reporter
text: "uppercase {s}"
inputs:
  s: text = "hello"
---
return Scratch.text.upper(Scratch.args.s);`,
`---
type: reporter
text: "letters in {s}"
inputs:
  s: text = "scratch"
---
return Scratch.args.s.length;`,
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

/** B. Data structures — maps: leaderboards, board games, lookups. */
const DATA_STRUCTURES = {
    name: 'Maps',
    color1: '#FF8C1A',
    color2: '#FF8000',
    color3: '#DB6E00',
    docs: [
`---
type: command
text: "new map {name}"
inputs:
  name: text = "scores"
---
Scratch.data.newMap(Scratch.args.name);`,
`---
type: command
text: "set {key} in {name} to {value}"
inputs:
  key: text = "alice"
  name: text = "scores"
  value: text = "10"
---
Scratch.data.mapSet(Scratch.args.name, Scratch.args.key, Scratch.args.value);`,
`---
type: reporter
text: "{key} in {name}"
inputs:
  key: text = "alice"
  name: text = "scores"
---
return Scratch.data.mapGet(Scratch.args.name, Scratch.args.key);`,
`---
type: boolean
text: "{name} has {key}?"
inputs:
  name: text = "scores"
  key: text = "alice"
---
return Scratch.data.mapHas(Scratch.args.name, Scratch.args.key);`,
`---
type: reporter
text: "keys of {name}"
inputs:
  name: text = "scores"
---
return Scratch.data.mapKeys(Scratch.args.name).join(", ");`
    ]
};

/** C. Dynamic named data — generative / "meta" projects that build their own state. */
const DYNAMIC = {
    name: 'Memory',
    color1: '#9966FF',
    color2: '#855CD6',
    color3: '#774DCB',
    docs: [
`---
type: command
text: "remember {name} as {value}"
inputs:
  name: text = "score"
  value: text = "0"
---
Scratch.data.set(Scratch.args.name, Scratch.args.value);`,
`---
type: command
text: "change remembered {name} by {amount}"
inputs:
  name: text = "score"
  amount: number = 1
---
var cur = Number(Scratch.data.get(Scratch.args.name)) || 0;
Scratch.data.set(Scratch.args.name, cur + Scratch.args.amount);`,
`---
type: reporter
text: "recall {name}"
inputs:
  name: text = "score"
---
return Scratch.data.get(Scratch.args.name);`,
`---
type: boolean
text: "is {name} remembered?"
inputs:
  name: text = "score"
---
return Scratch.data.has(Scratch.args.name);`,
`---
type: command
text: "add {value} to collection {name}"
inputs:
  value: text = "apple"
  name: text = "fruits"
---
Scratch.data.push(Scratch.args.name, Scratch.args.value);`,
`---
type: reporter
text: "item {i} of collection {name}"
inputs:
  i: number = 1
  name: text = "fruits"
---
return Scratch.data.itemAt(Scratch.args.name, Scratch.args.i);`,
`---
type: reporter
text: "size of collection {name}"
inputs:
  name: text = "fruits"
---
return Scratch.data.length(Scratch.args.name);`
    ]
};

/** D. Read VM data — sensing tricks, generative art (all observational). */
const READ_VM = {
    name: 'Sensing+',
    color1: '#4C97FF',
    color2: '#3373CC',
    color3: '#2E5EAC',
    docs: [
`---
type: reporter
text: "my direction"
inputs:
---
return Scratch.sprite.direction;`,
`---
type: reporter
text: "my size"
inputs:
---
return Scratch.sprite.size;`,
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
return Scratch.sprite.costumeHeight;`,
`---
type: reporter
text: "clones of me"
inputs:
---
return Scratch.clone.cloneCount;`,
`---
type: boolean
text: "am I a clone?"
inputs:
---
return Scratch.clone.isClone;`,
`---
type: reporter
text: "{name} effect amount"
inputs:
  name: text = "ghost"
---
return Scratch.effects[Scratch.args.name] || 0;`
    ]
};

const FAMILIES = [STRINGS, DATA_STRUCTURES, DYNAMIC, READ_VM];

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
