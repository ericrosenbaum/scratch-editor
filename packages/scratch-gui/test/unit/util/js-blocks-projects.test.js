import {PROJECTS, buildProject} from '../../../src/lib/js-blocks/projects';

describe('example projects', () => {
    test.each(PROJECTS.map(p => [p.name, p]))('%s builds a valid, reference-complete script', (projectName, project) => {
        const built = buildProject(project);
        expect(built).not.toBeNull();
        expect(built.library.blocks.length).toBeGreaterThan(0);

        const blocks = built.blocks;
        const ids = new Set(blocks.map(b => b.id));
        const libOpcodes = new Set(built.library.blocks.map(b => `${built.library.id}_${b.opcode}`));

        // Exactly one top-level green-flag hat.
        const tops = blocks.filter(b => b.topLevel);
        expect(tops).toHaveLength(1);
        expect(tops[0].opcode).toBe('event_whenflagclicked');

        let referencesLibraryBlock = false;
        for (const block of blocks) {
            // Every library opcode used must exist in the library.
            if (block.opcode.startsWith(built.library.id)) {
                expect(libOpcodes.has(block.opcode)).toBe(true);
                referencesLibraryBlock = true;
            }
            // Every input/next reference must point at a real block in this script.
            if (block.next) expect(ids.has(block.next)).toBe(true);
            for (const name of Object.keys(block.inputs)) {
                const input = block.inputs[name];
                if (input.block) expect(ids.has(input.block)).toBe(true);
                if (input.shadow) expect(ids.has(input.shadow)).toBe(true);
            }
        }
        // The whole point: the script actually uses one of the library's blocks.
        expect(referencesLibraryBlock).toBe(true);
    });
});
