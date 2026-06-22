import {
    buildJsBlockPrompt,
    stripFences,
    flattenApiReference,
    SYSTEM_INSTRUCTION,
    EXAMPLES
} from '../../../src/lib/js-blocks/ai-block-prompt';
import {analyze} from '../../../src/lib/js-blocks/static-analysis';

describe('js-blocks AI prompt', () => {
    describe('flattenApiReference', () => {
        test('produces section headings and signature lines', () => {
            const text = flattenApiReference();
            expect(text).toContain('## Inputs & output');
            expect(text).toContain('- Scratch.args.NAME —');
            expect(text).toContain('Scratch.canvas.setPixel');
        });
    });

    describe('buildJsBlockPrompt', () => {
        const userText = 'a reporter that returns n squared';
        const prompt = buildJsBlockPrompt(userText);

        test('uses the Gemma turn format and ends ready for the model turn', () => {
            expect(prompt).toContain('<|turn>system');
            expect(prompt).toContain('<|turn>user');
            expect(prompt).toContain('<|turn>model');
            expect(prompt).toContain('<turn|>');
            expect(prompt.endsWith('<|turn>model\n')).toBe(true);
        });

        test('embeds the system instruction and flattened API reference', () => {
            expect(prompt).toContain(SYSTEM_INSTRUCTION);
            expect(prompt).toContain('type: <command | reporter | boolean | c-loop | c-if | hat>');
            expect(prompt).toContain('- Scratch.args.NAME —');
        });

        test('includes the user request and every few-shot example', () => {
            expect(prompt).toContain(userText);
            for (const ex of EXAMPLES) {
                expect(prompt).toContain(ex.user);
                expect(prompt).toContain(ex.model);
            }
        });
    });

    describe('stripFences', () => {
        const doc = '---\ntype: reporter\ntext: "x"\ninputs:\n---\nreturn 1;';
        const FENCE = '```';

        test('leaves a bare document untouched', () => {
            expect(stripFences(doc)).toBe(doc);
        });

        test('removes a ```yaml … ``` fence', () => {
            expect(stripFences(`${FENCE}yaml\n${doc}\n${FENCE}`)).toBe(doc);
        });

        test('removes a bare ``` … ``` fence', () => {
            expect(stripFences(`${FENCE}\n${doc}\n${FENCE}`)).toBe(doc);
        });

        test('drops a preamble before the opening header', () => {
            expect(stripFences(`Sure! Here is your block:\n\n${doc}`)).toBe(doc);
        });

        test('handles empty / nullish input', () => {
            expect(stripFences('')).toBe('');
            expect(stripFences(null)).toBe('');
            expect(stripFences()).toBe('');
        });
    });

    describe('few-shot examples are valid block documents', () => {
        test.each(EXAMPLES.map((ex, i) => [i, ex]))(
            'example %i lints clean',
            (i, ex) => {
                const result = analyze(ex.model);
                expect(result.ok).toBe(true);
                expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
            }
        );

        test('a fence-stripped response still lints clean', () => {
            const wrapped = `\`\`\`\n${EXAMPLES[0].model}\n\`\`\``;
            const result = analyze(stripFences(wrapped));
            expect(result.ok).toBe(true);
        });
    });
});
