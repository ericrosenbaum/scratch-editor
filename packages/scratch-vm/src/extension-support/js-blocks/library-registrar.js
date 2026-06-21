const BlockType = require('../block-type');
const ArgumentType = require('../argument-type');
const makeJsBlockPrimitive = require('./js-block-primitive');

/**
 * Map a JS-block spec type to a VM BlockType.
 * @enum {string}
 */
const TYPE_TO_BLOCKTYPE = {
    'command': BlockType.COMMAND,
    'reporter': BlockType.REPORTER,
    'boolean': BlockType.BOOLEAN,
    'c-loop': BlockType.LOOP,
    'c-if': BlockType.CONDITIONAL,
    'hat': BlockType.HAT
};

/**
 * Map a JS-block spec argument type to a VM ArgumentType.
 * @enum {string}
 */
const TYPE_TO_ARGTYPE = {
    number: ArgumentType.NUMBER,
    text: ArgumentType.STRING,
    string: ArgumentType.STRING,
    boolean: ArgumentType.BOOLEAN
};

/**
 * Sanitize a string for use as a scratch-blocks id / opcode fragment.
 * @param {string} text - input.
 * @returns {string} a value safe to embed in an opcode and XML.
 */
const sanitizeId = text => String(text).replace(/[^a-zA-Z0-9_]/g, '_');

/**
 * Convert a library block's declared arguments into the `getInfo` arguments shape.
 * @param {object} argsSpec - {name: {type, defaultValue}}.
 * @returns {object} VM-ready arguments.
 */
const convertArguments = (argsSpec = {}) => {
    const out = {};
    for (const name in argsSpec) {
        if (!Object.prototype.hasOwnProperty.call(argsSpec, name)) continue;
        out[name] = {
            type: TYPE_TO_ARGTYPE[argsSpec[name].type] || ArgumentType.STRING,
            defaultValue: argsSpec[name].defaultValue
        };
    }
    return out;
};

/**
 * Build an extension-shaped `getInfo()` object for a library, with a synthesized
 * `func` per block. This rides the exact same registration path built-in
 * extensions use (`_registerExtensionPrimitives` → `_fillExtensionCategory`).
 * @param {object} library - the library {id, name, color1/2/3, blocks[]}.
 * @param {Runtime} runtime - the VM runtime.
 * @returns {object} the getInfo metadata.
 */
const buildGetInfo = (library, runtime) => {
    const blocks = library.blocks.map(libBlock => {
        const blockType = TYPE_TO_BLOCKTYPE[libBlock.type] || BlockType.COMMAND;
        const signature = libBlock.signature || {};
        const entry = {
            opcode: sanitizeId(libBlock.opcode),
            blockType,
            text: signature.text || libBlock.opcode,
            arguments: convertArguments(signature.arguments),
            func: makeJsBlockPrimitive(libBlock, library, runtime)
        };
        if (blockType === BlockType.HAT) {
            entry.isEdgeActivated = libBlock.edgeActivated !== false;
        }
        return entry;
    });
    return {
        id: library.id,
        name: library.name,
        color1: library.color1,
        color2: library.color2,
        color3: library.color3,
        blockIconURI: library.blockIconURI,
        blocks
    };
};

/**
 * Register (or refresh) a library's blocks with the runtime so they appear in the
 * palette as their own category and dispatch to the sandboxed interpreter.
 * @param {Runtime} runtime - the VM runtime.
 * @param {object} library - the library to register.
 */
const register = (runtime, library) => {
    const info = buildGetInfo(library, runtime);
    const alreadyRegistered = Array.isArray(runtime._blockInfo) &&
        runtime._blockInfo.some(category => category.id === library.id);
    if (alreadyRegistered) {
        runtime._refreshExtensionPrimitives(info);
    } else {
        runtime._registerExtensionPrimitives(info);
    }
};

module.exports = {
    register,
    buildGetInfo,
    sanitizeId,
    TYPE_TO_BLOCKTYPE
};
