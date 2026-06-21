import {parseDocument, toSignature} from '../../../src/lib/js-blocks/block-spec';
import {analyze} from '../../../src/lib/js-blocks/static-analysis';

const doc = (header, body) => `---\n${header}\n---\n${body}`;

describe('block-spec parser', () => {
    test('parses a complete reporter document', () => {
        const source = doc(
            'type: reporter\ntext: "{a} plus {b}"\ninputs:\n  a: number = 3\n  b: number = 4\ncolor: "#59C059"\nwarp: false',
            'return Scratch.args.a + Scratch.args.b;'
        );
        const result = parseDocument(source);
        expect(result.errors).toEqual([]);
        expect(result.spec.type).toBe('reporter');
        expect(result.spec.text).toBe('{a} plus {b}');
        expect(result.spec.color).toBe('#59C059');
        expect(result.spec.inputs).toHaveLength(2);
        expect(result.spec.inputs[0]).toEqual({name: 'a', type: 'number', defaultValue: 3});
        expect(result.body).toContain('return Scratch.args.a');
    });

    test('toSignature converts {name} to [name] and builds arguments', () => {
        const {spec} = parseDocument(doc('type: command\ntext: "wave {n} times"\ninputs:\n  n: number = 5', 'x();'));
        const sig = toSignature(spec);
        expect(sig.text).toBe('wave [n] times');
        expect(sig.arguments.n).toEqual({type: 'number', defaultValue: 5});
    });

    test('flags a placeholder with no matching input', () => {
        const {errors} = parseDocument(doc('type: command\ntext: "do {missing}"', 'x();'));
        expect(errors.some(e => /no input named "missing"/.test(e.message))).toBe(true);
    });

    test('flags a declared input not used in the label', () => {
        const {errors} = parseDocument(doc('type: command\ntext: "do it"\ninputs:\n  a: number = 1', 'x();'));
        expect(errors.some(e => /declared but not used/.test(e.message))).toBe(true);
    });

    test('flags an unknown type and a missing header', () => {
        expect(parseDocument(doc('type: bogus\ntext: "x"', 'a();')).errors
            .some(e => /Unknown type/.test(e.message))).toBe(true);
        expect(parseDocument('return 1;').errors
            .some(e => /Missing "---" header/.test(e.message))).toBe(true);
    });
});

describe('static analysis', () => {
    test('accepts a valid reporter and compiles modern JS to ES5', () => {
        const source = doc('type: reporter\ntext: "double {n}"\ninputs:\n  n: number = 2',
            'const out = Scratch.args.n * 2;\nreturn out;');
        const result = analyze(source);
        expect(result.ok).toBe(true);
        expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
        expect(result.compiled).toContain('var out'); // const -> var (ES5)
        expect(result.signature.text).toBe('double [n]');
    });

    test('errors when a reporter has no return', () => {
        const source = doc('type: reporter\ntext: "x {n}"\ninputs:\n  n: number = 1', 'var y = Scratch.args.n;');
        const result = analyze(source);
        expect(result.ok).toBe(false);
        expect(result.diagnostics.some(d => /must return a value/.test(d.message))).toBe(true);
    });

    test('errors on a forbidden identifier', () => {
        const source = doc('type: command\ntext: "hack"', 'window.location = "evil";');
        const result = analyze(source);
        expect(result.ok).toBe(false);
        expect(result.diagnostics.some(d => /"window" is not available/.test(d.message))).toBe(true);
    });

    test('errors on prototype escape via constructor', () => {
        const source = doc('type: command\ntext: "esc"', 'var f = [].constructor.constructor("return 1")();');
        const result = analyze(source);
        expect(result.diagnostics.some(d => /Accessing ".constructor"/.test(d.message))).toBe(true);
    });

    test('errors when a hat block tries to wait', () => {
        const source = doc('type: hat\ntext: "when ready"', 'Scratch.broadcastAndWait("go");\nreturn true;');
        const result = analyze(source);
        expect(result.diagnostics.some(d => /Hat blocks cannot wait/.test(d.message))).toBe(true);
    });

    test('reports a syntax error with a position', () => {
        const source = doc('type: command\ntext: "oops"', 'this is not js (((');
        const result = analyze(source);
        expect(result.ok).toBe(false);
        const syntax = result.diagnostics.find(d => d.severity === 'error');
        expect(typeof syntax.from).toBe('number');
        expect(syntax.from).toBeGreaterThan(0);
    });

    test('warns about an obvious infinite loop but still compiles', () => {
        const source = doc('type: command\ntext: "spin"', 'while (true) { Scratch.changeX(1); }');
        const result = analyze(source);
        expect(result.diagnostics.some(d => d.severity === 'warning' && /never ends/.test(d.message))).toBe(true);
        expect(result.ok).toBe(true); // a warning does not block saving
    });
});
