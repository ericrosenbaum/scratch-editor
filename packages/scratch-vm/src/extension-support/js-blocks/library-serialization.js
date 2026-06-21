/**
 * @file (De)serialization for JS-powered block libraries. This module is pure
 * data work — it does NOT import the interpreter — so it is cheap to require from
 * the project (de)serializer. The per-library runtime data store is never
 * serialized (it is cleared on green flag / stop); only the block definitions are.
 */

const BLOCK_TYPES = ['command', 'reporter', 'boolean', 'c-loop', 'c-if', 'hat'];
const ARG_TYPES = ['number', 'text', 'string', 'boolean'];

/**
 * Serialize one block definition to a plain, JSON-safe object.
 * @param {object} block - the library block.
 * @returns {object} the serialized block.
 */
const serializeBlock = block => {
    const args = (block.signature && block.signature.arguments) || {};
    const serializedArgs = {};
    for (const name of Object.keys(args)) {
        serializedArgs[name] = {
            type: args[name].type,
            defaultValue: args[name].defaultValue
        };
    }
    const out = {
        opcode: block.opcode,
        type: block.type,
        source: block.source || '',
        jsCompiled: block.jsCompiled || '',
        signature: {
            text: (block.signature && block.signature.text) || block.opcode,
            arguments: serializedArgs
        }
    };
    if (block.warp) out.warp = true;
    if (block.type === 'hat') {
        out.edgeActivated = block.edgeActivated !== false;
        if (block.restartExistingThreads) out.restartExistingThreads = true;
    }
    return out;
};

/**
 * Serialize a library to a plain, JSON-safe object (for .sb3 storage or export).
 * @param {object} library - the library.
 * @returns {object} the serialized library.
 */
const serializeLibrary = library => {
    const out = {
        id: library.id,
        name: library.name,
        blocks: (library.blocks || []).map(serializeBlock)
    };
    if (library.color1) out.color1 = library.color1;
    if (library.color2) out.color2 = library.color2;
    if (library.color3) out.color3 = library.color3;
    if (library.iconURI) out.iconURI = library.iconURI;
    if (library.blockIconURI) out.blockIconURI = library.blockIconURI;
    return out;
};

/**
 * Validate and normalize a serialized block.
 * @param {object} raw - the raw block JSON.
 * @returns {object} a normalized block.
 * @throws {Error} if the block is structurally invalid.
 */
const deserializeBlock = raw => {
    if (!raw || typeof raw.opcode !== 'string' || raw.opcode.length === 0) {
        throw new Error('Library block is missing an opcode');
    }
    if (BLOCK_TYPES.indexOf(raw.type) === -1) {
        throw new Error(`Library block "${raw.opcode}" has an invalid type "${raw.type}"`);
    }
    const rawArgs = (raw.signature && raw.signature.arguments) || {};
    const args = {};
    for (const name of Object.keys(rawArgs)) {
        const type = rawArgs[name].type;
        args[name] = {
            type: ARG_TYPES.indexOf(type) === -1 ? 'text' : type,
            defaultValue: rawArgs[name].defaultValue
        };
    }
    const block = {
        opcode: raw.opcode,
        type: raw.type,
        source: typeof raw.source === 'string' ? raw.source : '',
        jsCompiled: typeof raw.jsCompiled === 'string' ? raw.jsCompiled : '',
        warp: Boolean(raw.warp),
        signature: {
            text: (raw.signature && raw.signature.text) || raw.opcode,
            arguments: args
        }
    };
    if (raw.type === 'hat') {
        block.edgeActivated = raw.edgeActivated !== false;
        block.restartExistingThreads = Boolean(raw.restartExistingThreads);
    }
    return block;
};

/**
 * Validate and normalize a serialized library.
 * @param {object} raw - the raw library JSON.
 * @returns {object} a normalized library ready for installCustomLibrary.
 * @throws {Error} if the library is structurally invalid.
 */
const deserializeLibrary = raw => {
    if (!raw || typeof raw.id !== 'string' || raw.id.length === 0) {
        throw new Error('Library is missing an id');
    }
    if (!Array.isArray(raw.blocks)) {
        throw new Error(`Library "${raw.id}" is missing a blocks array`);
    }
    const library = {
        id: raw.id,
        name: typeof raw.name === 'string' ? raw.name : raw.id,
        blocks: raw.blocks.map(deserializeBlock)
    };
    if (raw.color1) library.color1 = raw.color1;
    if (raw.color2) library.color2 = raw.color2;
    if (raw.color3) library.color3 = raw.color3;
    if (raw.iconURI) library.iconURI = raw.iconURI;
    if (raw.blockIconURI) library.blockIconURI = raw.blockIconURI;
    return library;
};

module.exports = {
    serializeLibrary,
    deserializeLibrary,
    serializeBlock,
    deserializeBlock,
    BLOCK_TYPES,
    ARG_TYPES
};
