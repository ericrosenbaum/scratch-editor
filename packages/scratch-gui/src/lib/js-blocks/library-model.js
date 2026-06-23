import {analyze} from './static-analysis';

/**
 * @file Helpers shared by the JS-blocks authoring UI: creating libraries
 * and blocks, generating ids, default document templates, and compiling an
 * authored document into a VM-ready library block via static analysis.
 */

/** Default category palette (Scratch purple) for new libraries. */
const DEFAULT_COLORS = {color1: '#9966FF', color2: '#855CD6', color3: '#774DCB'};

/** Starter document templates per block type. */
const TEMPLATES = {
    'command':
`---
type: command
text: "do something with {value}"
inputs:
  value: number = 10
---
// Command blocks make something happen. Use Scratch.* helpers.
Scratch.changeX(Scratch.args.value);`,
    'reporter':
`---
type: reporter
text: "double {n}"
inputs:
  n: number = 5
---
// Reporter blocks return a value.
return Scratch.args.n * 2;`,
    'boolean':
`---
type: boolean
text: "is {n} big?"
inputs:
  n: number = 0
---
return Scratch.args.n > 10;`,
    'c-loop':
`---
type: c-loop
text: "repeat fancy {n}"
inputs:
  n: number = 4
---
// Run the wrapped blocks n times.
// Tip: add "warp: true" to the header to run without screen refresh, so the
// whole loop finishes in one frame (e.g. to draw a grid every frame).
for (var i = 0; i < Scratch.args.n; i++) {
    Scratch.runBranch();
}`,
    'c-if':
`---
type: c-if
text: "maybe {chance}%"
inputs:
  chance: number = 50
---
if ((Math.random() * 100) < Scratch.args.chance) {
    Scratch.runBranch();
}`,
    'hat':
`---
type: hat
text: "when {n} is reached"
inputs:
  n: number = 10
---
// Hat blocks are checked every frame; return true to fire.
return Scratch.timer > Scratch.args.n;`
};

/**
 * Generate a short, reasonably-unique id fragment.
 * @returns {string} a lowercase alphanumeric token.
 */
const shortId = () => Math.random().toString(36)
    .slice(2, 8);

/**
 * Create a new, empty library.
 * @param {string} name - the library display name.
 * @param {object} [colors] - optional {color1, color2, color3}.
 * @returns {object} a new library object.
 */
const createLibrary = (name, colors) => Object.assign(
    {
        id: `jslib_${shortId()}`,
        name: name || 'My Library',
        blocks: []
    },
    DEFAULT_COLORS,
    colors || {}
);

/**
 * The default authoring document for a new block of the given type.
 * @param {string} type - one of the block types.
 * @returns {string} a starter document.
 */
const defaultDocument = type => TEMPLATES[type] || TEMPLATES.command;

/**
 * Generate a fresh opcode that does not collide within a library.
 * @param {object} library - the owning library.
 * @returns {string} a unique opcode.
 */
const nextOpcode = library => {
    const used = new Set((library.blocks || []).map(b => b.opcode));
    let opcode;
    do {
        opcode = `b${shortId()}`;
    } while (used.has(opcode));
    return opcode;
};

/**
 * Compile an authored document into a VM-ready library block.
 * @param {string} source - the document text.
 * @param {string} opcode - the stable opcode to assign.
 * @returns {object} {ok, diagnostics, block} — block is null when not ok.
 */
const buildLibraryBlock = (source, opcode) => {
    const result = analyze(source);
    if (!result.ok || !result.signature) {
        return {ok: false, diagnostics: result.diagnostics, block: null};
    }
    const block = {
        opcode,
        type: result.type,
        source,
        jsCompiled: result.compiled,
        warp: result.warp,
        signature: result.signature
    };
    if (result.type === 'hat') {
        block.edgeActivated = true;
    }
    return {ok: true, diagnostics: result.diagnostics, block};
};

/**
 * Return a copy of a library with a block added or replaced (matched by opcode).
 * @param {object} library - the library.
 * @param {object} block - the block to upsert.
 * @returns {object} a new library object.
 */
const upsertBlock = (library, block) => {
    const blocks = (library.blocks || []).slice();
    const index = blocks.findIndex(b => b.opcode === block.opcode);
    if (index === -1) {
        blocks.push(block);
    } else {
        blocks[index] = block;
    }
    return Object.assign({}, library, {blocks});
};

/**
 * Return a copy of a library with a block removed.
 * @param {object} library - the library.
 * @param {string} opcode - the opcode to remove.
 * @returns {object} a new library object.
 */
const removeBlock = (library, opcode) =>
    Object.assign({}, library, {blocks: (library.blocks || []).filter(b => b.opcode !== opcode)});

export {
    createLibrary,
    defaultDocument,
    nextOpcode,
    buildLibraryBlock,
    upsertBlock,
    removeBlock,
    DEFAULT_COLORS,
    TEMPLATES
};
