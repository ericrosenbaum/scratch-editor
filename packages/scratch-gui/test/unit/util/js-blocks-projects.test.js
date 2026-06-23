import {PROJECTS, buildProject} from '../../../src/lib/js-blocks/projects';

describe('example projects', () => {
    test.each(PROJECTS.map(p => [p.name, p]))('%s builds a valid, reference-complete script', (projectName, project) => {
        const built = buildProject(project);
        expect(built).not.toBeNull();
        expect(built.library.blocks.length).toBeGreaterThan(0);

        const blocks = built.blocks;
        const ids = new Set(blocks.map(b => b.id));
        // A project may pull blocks from more than one library; collect them all.
        const libOpcodes = new Set();
        const libIds = built.libraries.map(lib => lib.id);
        built.libraries.forEach(lib => lib.blocks.forEach(blk => libOpcodes.add(`${lib.id}_${blk.opcode}`)));

        // Exactly one top-level green-flag hat.
        const tops = blocks.filter(b => b.topLevel);
        expect(tops).toHaveLength(1);
        expect(tops[0].opcode).toBe('event_whenflagclicked');

        let referencesLibraryBlock = false;
        for (const block of blocks) {
            // Every library opcode used must exist in one of the project's libraries.
            if (libIds.some(libId => block.opcode.startsWith(`${libId}_`))) {
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
