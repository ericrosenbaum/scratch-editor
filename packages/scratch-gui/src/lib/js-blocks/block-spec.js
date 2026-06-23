/**
 * @file Parser for the text-only "block document" format used to author
 * JS-powered blocks. A document is a small `---`-fenced header describing the
 * block (type, label, inputs, color, warp) followed by the JavaScript body:
 *
 *   ---
 *   type: reporter            # command | reporter | boolean | c-loop | c-if | hat
 *   text: "{a} plus {b}"       # label; {name} placeholders map to declared inputs
 *   inputs:
 *     a: number = 3            # name: type [= default]   (type: number | text | boolean)
 *     b: number = 4
 *   color: "#59C059"           # optional
 *   warp: false                # optional ("run without screen refresh")
 *   ---
 *   return Scratch.args.a + Scratch.args.b;
 *
 * This module is pure (no Babel / no React) so it is cheap to unit test and to
 * import. Static analysis (syntax + lint of the JS body) lives in
 * ./static-analysis, which builds on this parser.
 */

const BLOCK_TYPES = ['command', 'reporter', 'boolean', 'c-loop', 'c-if', 'hat'];
const INPUT_TYPES = ['number', 'text', 'boolean'];
const FENCE = '---';

/**
 * Strip a single pair of surrounding quotes from a value, if present.
 * @param {string} value - the raw value.
 * @returns {string} the unquoted value.
 */
const unquote = value => {
    const trimmed = value.trim();
    if (trimmed.length >= 2 &&
        ((trimmed[0] === '"' && trimmed[trimmed.length - 1] === '"') ||
         (trimmed[0] === '\'' && trimmed[trimmed.length - 1] === '\''))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
};

/**
 * Parse one input declaration: `name: type [= default]`.
 * @param {string} text - the declaration (without leading indentation).
 * @returns {?object} {name, type, defaultValue} or null if malformed.
 */
const parseInputDeclaration = text => {
    const colon = text.indexOf(':');
    if (colon === -1) return null;
    const name = text.slice(0, colon).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null;

    let rest = text.slice(colon + 1).trim();
    let defaultRaw = null;
    const eq = rest.indexOf('=');
    if (eq !== -1) {
        defaultRaw = rest.slice(eq + 1).trim();
        rest = rest.slice(0, eq).trim();
    }
    const type = rest.toLowerCase();
    if (INPUT_TYPES.indexOf(type) === -1) return {name, type: null, defaultValue: null, badType: rest};

    let defaultValue;
    if (defaultRaw === null) {
        defaultValue = type === 'number' ? 0 : (type === 'boolean' ? false : '');
    } else if (type === 'number') {
        defaultValue = Number(unquote(defaultRaw));
        if (isNaN(defaultValue)) defaultValue = 0;
    } else if (type === 'boolean') {
        defaultValue = unquote(defaultRaw).toLowerCase() === 'true';
    } else {
        defaultValue = unquote(defaultRaw);
    }
    return {name, type, defaultValue};
};

/**
 * Split a document into its header text, JS body, and the body's starting offsets.
 * @param {string} source - the full document.
 * @returns {object} {headerLines, body, bodyStartLine, bodyStartOffset, hasHeader, errors}.
 */
const splitDocument = source => {
    const lines = source.split('\n');
    const errors = [];
    if (lines[0].trim() !== FENCE) {
        return {
            headerLines: [],
            body: source,
            bodyStartLine: 0,
            bodyStartOffset: 0,
            hasHeader: false,
            errors: [{line: 0, message: 'Missing "---" header. The first line must be "---".'}]
        };
    }
    let closeIndex = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === FENCE) {
            closeIndex = i;
            break;
        }
    }
    if (closeIndex === -1) {
        return {
            headerLines: lines.slice(1).map((text, i) => ({text, line: i + 1})),
            body: '',
            bodyStartLine: lines.length,
            bodyStartOffset: source.length,
            hasHeader: true,
            errors: [{line: 0, message: 'Unterminated header — add a closing "---" line.'}]
        };
    }
    const headerLines = lines.slice(1, closeIndex).map((text, i) => ({text, line: i + 1}));
    const body = lines.slice(closeIndex + 1).join('\n');
    const bodyStartLine = closeIndex + 1; // 0-based line index where the body begins
    const bodyStartOffset = lines.slice(0, closeIndex + 1).join('\n').length + (closeIndex + 1 < lines.length ? 1 : 0);
    return {headerLines, body, bodyStartLine, bodyStartOffset, hasHeader: true, errors};
};

/**
 * Parse the header lines into a structured spec, collecting per-line errors.
 * @param {Array.<object>} headerLines - [{text, line}].
 * @returns {object} {spec, errors}.
 */
const parseHeader = headerLines => {
    const errors = [];
    const spec = {type: null, text: '', color: null, warp: false, inputs: []};
    let inInputs = false;

    for (const {text, line} of headerLines) {
        if (text.trim() === '' || text.trim().startsWith('#')) continue;
        const indented = /^\s+/.test(text);

        if (inInputs && indented) {
            const decl = parseInputDeclaration(text.trim());
            if (!decl) {
                errors.push({line, message: `Could not parse input "${text.trim()}". Use "name: type = default".`});
            } else if (decl.type === null) {
                errors.push({line, message: `Unknown input type "${decl.badType}". Use number, text, or boolean.`});
            } else {
                spec.inputs.push(decl);
            }
            continue;
        }
        inInputs = false;

        const colon = text.indexOf(':');
        if (colon === -1) {
            errors.push({line, message: `Could not parse header line "${text.trim()}".`});
            continue;
        }
        const key = text.slice(0, colon).trim()
            .toLowerCase();
        const value = text.slice(colon + 1).trim();

        switch (key) {
        case 'type':
            spec.type = value.toLowerCase();
            if (BLOCK_TYPES.indexOf(spec.type) === -1) {
                errors.push({line, message: `Unknown type "${value}". Use one of: ${BLOCK_TYPES.join(', ')}.`});
            }
            break;
        case 'text':
            spec.text = unquote(value);
            break;
        case 'color':
            spec.color = unquote(value);
            break;
        case 'warp':
            spec.warp = unquote(value).toLowerCase() === 'true';
            break;
        case 'inputs':
            inInputs = true;
            if (value !== '') {
                errors.push({line, message: 'Put each input on its own indented line under "inputs:".'});
            }
            break;
        default:
            errors.push({line, message: `Unknown header field "${key}".`});
        }
    }

    if (spec.type === null) {
        errors.push({line: 0, message: 'Header is missing "type:".'});
    }
    if (!spec.text) {
        errors.push({line: 0, message: 'Header is missing "text:" (the block label).'});
    }
    return {spec, errors};
};

/**
 * Validate that placeholders in the label and declared inputs agree.
 * @param {object} spec - the parsed header spec.
 * @returns {Array.<object>} errors.
 */
const validatePlaceholders = spec => {
    const errors = [];
    const declared = new Set(spec.inputs.map(i => i.name));
    const used = new Set();
    const re = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
    let match;
    while ((match = re.exec(spec.text)) !== null) {
        const name = match[1];
        if (used.has(name)) {
            // scratch-blocks can't render two inputs with the same name on one block —
            // the repeat shows up as a broken/empty field. Make each input appear once.
            errors.push({line: 0, message: `Label uses {${name}} more than once; each input may appear only once.`});
        }
        used.add(name);
        if (!declared.has(name)) {
            errors.push({line: 0, message: `Label uses {${name}} but no input named "${name}" is declared.`});
        }
    }
    for (const name of declared) {
        if (!used.has(name)) {
            errors.push({line: 0, message: `Input "${name}" is declared but not used in the label (add {${name}}).`});
        }
    }
    return errors;
};

/**
 * Parse a full block document.
 * @param {string} source - the document text.
 * @returns {object} {spec, body, bodyStartLine, bodyStartOffset, errors}.
 *   `spec` is null only when the header is unrecoverable.
 */
const parseDocument = source => {
    const split = splitDocument(source);
    const {spec, errors: headerErrors} = parseHeader(split.headerLines);
    const placeholderErrors = spec.type ? validatePlaceholders(spec) : [];
    return {
        spec,
        body: split.body,
        bodyStartLine: split.bodyStartLine,
        bodyStartOffset: split.bodyStartOffset,
        hasHeader: split.hasHeader,
        errors: split.errors.concat(headerErrors).concat(placeholderErrors)
    };
};

/**
 * Convert a parsed spec into the VM-ready signature (label with [name]
 * placeholders + arguments map).
 * @param {object} spec - the parsed header spec.
 * @returns {object} {text, arguments}.
 */
const toSignature = spec => {
    const text = spec.text.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, '[$1]');
    const args = {};
    for (const input of spec.inputs) {
        args[input.name] = {type: input.type, defaultValue: input.defaultValue};
    }
    return {text, arguments: args};
};

module.exports = {
    parseDocument,
    parseHeader,
    splitDocument,
    parseInputDeclaration,
    validatePlaceholders,
    toSignature,
    BLOCK_TYPES,
    INPUT_TYPES
};
