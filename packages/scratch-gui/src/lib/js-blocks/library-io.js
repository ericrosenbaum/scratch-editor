import {buildLibraryBlock} from './library-model';

/**
 * @file Export/import of JS-powered block libraries as `.scratchlib.json`
 * files. Imported libraries are NOT trusted: every block is re-parsed,
 * re-analyzed, and re-transpiled from its authored `source` (never from any
 * imported `jsCompiled`), and blocks that fail analysis are dropped.
 */

const FILE_EXTENSION = '.scratchlib.json';

/**
 * Serialize a library to pretty JSON text suitable for a download.
 * @param {object} library - the library.
 * @returns {string} JSON text.
 */
const serializeLibraryToText = library => JSON.stringify({
    format: 'scratch-js-blocks',
    version: 1,
    library: {
        id: library.id,
        name: library.name,
        color1: library.color1,
        color2: library.color2,
        color3: library.color3,
        blocks: (library.blocks || []).map(block => ({
            opcode: block.opcode,
            type: block.type,
            source: block.source,
            warp: Boolean(block.warp),
            signature: block.signature,
            jsCompiled: block.jsCompiled,
            edgeActivated: block.edgeActivated
        }))
    }
}, null, 2);

/**
 * Trigger a browser download of a library as a `.scratchlib.json` file.
 * @param {object} library - the library to export.
 */
const downloadLibrary = library => {
    const text = serializeLibraryToText(library);
    const blob = new Blob([text], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(library.name || 'library').replace(/[^\w-]+/g, '_')}${FILE_EXTENSION}`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 0);
};

/**
 * Parse imported JSON into a trusted library, recompiling every block from its
 * authored source. Blocks that fail analysis are skipped.
 * @param {string} jsonText - the imported file contents.
 * @param {string} [newId] - an id to assign (avoids collisions with existing libraries).
 * @returns {object} {library, skipped} — library ready for installCustomLibrary.
 * @throws {Error} if the file is not a valid library file.
 */
const parseImportedLibrary = (jsonText, newId) => {
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    } catch (e) {
        throw new Error('That file is not valid JSON.');
    }
    const raw = parsed && parsed.library ? parsed.library : parsed;
    if (!raw || !Array.isArray(raw.blocks)) {
        throw new Error('That file does not contain a block library.');
    }

    const blocks = [];
    const skipped = [];
    for (const rawBlock of raw.blocks) {
        const source = rawBlock && rawBlock.source;
        if (typeof source !== 'string' || source.length === 0) {
            skipped.push(rawBlock && rawBlock.opcode);
            continue;
        }
        // Recompile from source; never trust imported jsCompiled.
        const built = buildLibraryBlock(source, rawBlock.opcode || `b${blocks.length}`);
        if (built.ok) {
            blocks.push(built.block);
        } else {
            skipped.push(rawBlock.opcode);
        }
    }

    const library = {
        id: newId || raw.id || `jslib_${Math.random().toString(36)
            .slice(2, 8)}`,
        name: raw.name || 'Imported Library',
        color1: raw.color1 || '#9966FF',
        color2: raw.color2 || '#855CD6',
        color3: raw.color3 || '#774DCB',
        blocks
    };
    return {library, skipped};
};

export {
    serializeLibraryToText,
    downloadLibrary,
    parseImportedLibrary,
    FILE_EXTENSION
};
