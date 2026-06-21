import {FAMILIES, buildExampleLibrary} from '../../../src/lib/js-blocks/example-libraries';

describe('example libraries', () => {
    test.each(FAMILIES.map(f => [f.name, f]))('%s: every block compiles cleanly', (name, family) => {
        const library = buildExampleLibrary(family);
        // Every authored document must pass static analysis (no dropped blocks).
        expect(library.blocks.length).toBe(family.docs.length);
        for (const block of library.blocks) {
            expect(block.jsCompiled).toBeTruthy();
            expect(block.signature.text).toMatch(/\[|\w/);
            expect(['command', 'reporter', 'boolean', 'c-loop', 'c-if', 'hat']).toContain(block.type);
        }
    });
});
