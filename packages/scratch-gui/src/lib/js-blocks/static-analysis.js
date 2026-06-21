/**
 * @file Author-time static analysis for JS-powered block documents.
 * Parses the header (via block-spec), then parses + lints + transpiles the JS body
 * with Babel. Returns CodeMirror-ready diagnostics (absolute offsets), the
 * compiled ES5 body, and the derived signature. Babel is heavy; the authoring UI
 * lazy-loads this module so the player bundle never pays for it.
 */

const Babel = require('@babel/standalone');
const {parseDocument, toSignature} = require('./block-spec');

/** Host capabilities that must never be referenced. Referencing one is an error. */
const FORBIDDEN = new Set([
    'window', 'document', 'globalThis', 'self', 'top', 'parent', 'frames',
    'eval', 'Function', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
    'importScripts', 'localStorage', 'sessionStorage', 'indexedDB', 'caches',
    'setTimeout', 'setInterval', 'setImmediate', 'requestAnimationFrame',
    'queueMicrotask', 'require', 'module', 'exports', 'process', 'global',
    'Reflect', 'Proxy', 'Symbol', 'WeakMap', 'WeakSet', 'WeakRef',
    'navigator', 'location', 'history', 'alert', 'prompt', 'confirm',
    'Worker', 'SharedWorker', 'Notification', 'crypto'
]);

/** Globals that authored code may freely reference (besides its own declarations). */
const ALLOWED_GLOBALS = new Set([
    'Scratch', 'Math', 'JSON', 'String', 'Number', 'Array', 'Object', 'Boolean',
    'Date', 'RegExp', 'isNaN', 'isFinite', 'parseInt', 'parseFloat',
    'undefined', 'NaN', 'Infinity', 'arguments'
]);

/** Member names whose access can break the sandbox. */
const FORBIDDEN_MEMBERS = new Set(['constructor', '__proto__', 'prototype']);

/**
 * Convert a 0-based line/column to a character offset in source.
 * @param {string} source - the document.
 * @param {number} line0 - 0-based line index.
 * @param {number} col0 - 0-based column.
 * @returns {number} the character offset.
 */
const lineColToOffset = (source, line0, col0) => {
    const lines = source.split('\n');
    let offset = 0;
    for (let i = 0; i < line0 && i < lines.length; i++) {
        offset += lines[i].length + 1;
    }
    return offset + col0;
};

/**
 * Build a diagnostic spanning a whole document line.
 * @param {string} source - the document.
 * @param {number} line0 - 0-based line index.
 * @param {string} severity - 'error' | 'warning'.
 * @param {string} message - the message.
 * @returns {object} a CodeMirror-style diagnostic.
 */
const lineDiagnostic = (source, line0, severity, message) => {
    const lines = source.split('\n');
    const from = lineColToOffset(source, line0, 0);
    const to = from + (lines[line0] ? lines[line0].length : 0);
    return {from, to, severity, message};
};

/**
 * Recursively walk a Babel AST, invoking visit(node, ctx) for every node.
 * ctx.functionDepth counts enclosing functions (0 == top level of the body).
 * @param {object} node - the current AST node.
 * @param {object} ctx - {functionDepth}.
 * @param {Function} visit - visitor called as visit(node, ctx).
 */
const walk = (node, ctx, visit) => {
    if (!node || typeof node.type !== 'string') return;
    visit(node, ctx);
    const isFunction = node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression';
    const childCtx = isFunction ? {functionDepth: ctx.functionDepth + 1} : ctx;
    for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments' ||
            key === 'trailingComments' || key === 'innerComments') continue;
        const value = node[key];
        if (Array.isArray(value)) {
            for (const child of value) walk(child, childCtx, visit);
        } else if (value && typeof value.type === 'string') {
            walk(value, childCtx, visit);
        }
    }
};

/**
 * Lint a parsed body AST, pushing diagnostics.
 * @param {object} ast - the Babel File/Program AST of the body.
 * @param {string} type - the block type.
 * @param {object} doc - the parsed document (for offset mapping).
 * @param {string} source - the full document.
 * @param {Array} diagnostics - the diagnostics list to append to.
 */
const lintBody = (ast, type, doc, source, diagnostics) => {
    const base = doc.bodyStartOffset;
    const program = ast.program || ast;
    let hasTopReturn = false;
    let usesYieldingCall = false;

    const at = node => ({from: base + node.start, to: base + node.end});
    const err = (node, message) => diagnostics.push(Object.assign(at(node), {severity: 'error', message}));
    const warn = (node, message) => diagnostics.push(Object.assign(at(node), {severity: 'warning', message}));

    walk(program, {functionDepth: 0}, (node, ctx) => {
        // Identifier references.
        if (node.type === 'Identifier') {
            const name = node.name;
            if (FORBIDDEN.has(name)) {
                err(node, `"${name}" is not available in JS blocks.`);
            }
        }
        // Member access escapes.
        if (node.type === 'MemberExpression') {
            if (!node.computed && node.property && FORBIDDEN_MEMBERS.has(node.property.name)) {
                err(node.property, `Accessing ".${node.property.name}" is not allowed.`);
            }
            if (node.computed && node.property && node.property.type === 'StringLiteral' &&
                FORBIDDEN_MEMBERS.has(node.property.value)) {
                err(node.property, `Accessing "${node.property.value}" is not allowed.`);
            }
        }
        // Top-level return.
        if (node.type === 'ReturnStatement' && ctx.functionDepth === 0 && node.argument) {
            hasTopReturn = true;
        }
        // Yielding Scratch calls (illegal in hats).
        if (node.type === 'CallExpression' && node.callee && node.callee.type === 'MemberExpression' &&
            node.callee.object && node.callee.object.name === 'Scratch' &&
            node.callee.property &&
            (node.callee.property.name === 'runBranch' || node.callee.property.name === 'broadcastAndWait')) {
            usesYieldingCall = true;
            if (type === 'hat') {
                err(node, 'Hat blocks cannot wait — remove runBranch/broadcastAndWait.');
            }
        }
        // Obvious infinite loops.
        if ((node.type === 'WhileStatement' || node.type === 'DoWhileStatement') &&
            node.test && node.test.type === 'BooleanLiteral' && node.test.value === true) {
            warn(node, 'This loop never ends on its own — it will hit the instruction limit.');
        }
        if (node.type === 'ForStatement' && node.test === null) {
            warn(node, 'This loop has no exit condition — it will hit the instruction limit.');
        }
    });

    if ((type === 'reporter' || type === 'boolean' || type === 'hat') && !hasTopReturn) {
        const label = type === 'hat' ? 'A hat' : (type === 'boolean' ? 'A boolean' : 'A reporter');
        diagnostics.push(lineDiagnostic(source, doc.bodyStartLine, 'error',
            `${label} block must return a value (add "return ...").`));
    }
    if ((type === 'reporter' || type === 'boolean') && usesYieldingCall) {
        diagnostics.push(lineDiagnostic(source, doc.bodyStartLine, 'warning',
            'Reporters should not wait (runBranch/broadcastAndWait) — keep them quick.'));
    }
};

/**
 * Analyze a block document: validate the header, parse + lint + transpile the body.
 * @param {string} source - the full document text.
 * @returns {object} {diagnostics, compiled, signature, type, warp, ok}.
 */
const analyze = source => {
    const doc = parseDocument(source);
    const diagnostics = [];

    for (const e of doc.errors) {
        diagnostics.push(lineDiagnostic(source, Math.max(0, e.line === 0 ? 0 : e.line), 'error', e.message));
    }

    const type = doc.spec && doc.spec.type;
    const body = doc.body;
    const base = doc.bodyStartOffset;

    let ast = null;
    try {
        ast = Babel.packages.parser.parse(body, {
            allowReturnOutsideFunction: true,
            sourceType: 'script',
            errorRecovery: false
        });
    } catch (e) {
        const loc = e.loc || {line: 1, column: 0};
        const offset = base + lineColToOffset(body, loc.line - 1, loc.column);
        diagnostics.push({
            from: offset,
            to: Math.min(source.length, offset + 1),
            severity: 'error',
            message: e.message.replace(/\s*\(\d+:\d+\)\s*$/, '')
        });
        return {diagnostics, compiled: null, signature: null, type, warp: false, ok: false};
    }

    if (type) lintBody(ast, type, doc, source, diagnostics);

    let compiled = null;
    try {
        const out = Babel.transform(body, {
            presets: [['env', {targets: {ie: 11}}]],
            parserOpts: {allowReturnOutsideFunction: true},
            sourceType: 'script',
            babelrc: false,
            configFile: false
        });
        compiled = out.code;
    } catch (e) {
        diagnostics.push(lineDiagnostic(source, doc.bodyStartLine, 'error',
            `Could not compile: ${e.message}`));
    }

    const ok = !diagnostics.some(d => d.severity === 'error');
    return {
        diagnostics,
        compiled,
        signature: type ? toSignature(doc.spec) : null,
        type,
        warp: Boolean(doc.spec && doc.spec.warp),
        color: doc.spec && doc.spec.color,
        ok
    };
};

module.exports = {
    analyze,
    FORBIDDEN,
    ALLOWED_GLOBALS
};
