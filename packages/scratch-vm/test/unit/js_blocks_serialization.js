/* eslint-disable dot-notation */
const tap = require('tap');
const Runtime = require('../../src/engine/runtime');
const sb3 = require('../../src/serialization/sb3');
const {serializeLibrary, deserializeLibrary} = require('../../src/extension-support/js-blocks/library-serialization');

const test = tap.test;

const LIBRARY = {
    id: 'jslib_demo',
    name: 'Demo',
    color1: '#9966FF',
    color2: '#855CD6',
    color3: '#774DCB',
    blocks: [
        {
            opcode: 'shout',
            type: 'reporter',
            source: '---\ntype: reporter\ntext: "shout {s}"\n---\nreturn Scratch.text.upper(Scratch.args.s) + "!";',
            jsCompiled: 'return Scratch.text.upper(Scratch.args.s) + "!";',
            signature: {text: 'shout [s]', arguments: {s: {type: 'text', defaultValue: 'hi'}}}
        },
        {
            opcode: 'whenStarted',
            type: 'hat',
            edgeActivated: false,
            source: 'hat source',
            jsCompiled: 'return true;',
            signature: {text: 'when started', arguments: {}}
        }
    ]
};

test('serializeLibrary / deserializeLibrary round-trips losslessly', t => {
    const serialized = serializeLibrary(LIBRARY);
    // JSON-safe (no functions, survives a stringify/parse).
    const cloned = JSON.parse(JSON.stringify(serialized));
    const back = deserializeLibrary(cloned);

    t.equal(back.id, 'jslib_demo', 'id preserved');
    t.equal(back.name, 'Demo', 'name preserved');
    t.equal(back.color1, '#9966FF', 'color preserved');
    t.equal(back.blocks.length, 2, 'block count preserved');
    t.equal(back.blocks[0].jsCompiled, LIBRARY.blocks[0].jsCompiled, 'compiled body preserved');
    t.equal(back.blocks[0].signature.arguments.s.type, 'text', 'argument type preserved');
    t.equal(back.blocks[0].source, LIBRARY.blocks[0].source, 'authored source preserved');
    t.equal(back.blocks[1].edgeActivated, false, 'hat edge-activated flag preserved');
    t.end();
});

test('deserializeLibrary rejects structurally invalid libraries', t => {
    t.throws(() => deserializeLibrary({name: 'no id', blocks: []}), 'missing id throws');
    t.throws(() => deserializeLibrary({id: 'x'}), 'missing blocks throws');
    t.throws(() => deserializeLibrary({id: 'x', blocks: [{type: 'reporter'}]}), 'block missing opcode throws');
    t.throws(() => deserializeLibrary({id: 'x', blocks: [{opcode: 'a', type: 'bogus'}]}), 'bad block type throws');
    t.end();
});

test('library round-trips through a full sb3 serialize/deserialize and still runs', t => {
    const runtime1 = new Runtime();
    runtime1.installCustomLibrary(LIBRARY);

    const projectJson = sb3.serialize(runtime1);
    t.ok(Array.isArray(projectJson.customLibraries), 'customLibraries written to project.json');
    t.equal(projectJson.customLibraries.length, 1, 'one library serialized');

    // Simulate a save/load: stringify and parse, then deserialize into a fresh runtime.
    const reparsed = JSON.parse(JSON.stringify(projectJson));
    const runtime2 = new Runtime();

    sb3.deserialize(reparsed, runtime2, null, false).then(() => {
        t.equal(runtime2.getCustomLibraries().length, 1, 'library installed on load');
        t.type(runtime2._primitives['jslib_demo_shout'], 'function', 'block primitive registered after load');

        // It runs identically.
        const util = {
            runtime: runtime2,
            target: {isStage: false, sprite: {costumes: [], sounds: [], clones: []}},
            stackFrame: {},
            thread: {peekStackFrame: () => ({warpMode: false})},
            yield: () => {}
        };
        const result = runtime2._primitives['jslib_demo_shout']({s: 'hello'}, util);
        t.equal(result, 'HELLO!', 'reloaded block produces the same output');

        // The data store is NOT serialized.
        t.equal(typeof reparsed.customLibraries[0].store, 'undefined', 'runtime store not serialized');
        t.end();
    });
});

test('projects without libraries do not gain a customLibraries field', t => {
    const runtime = new Runtime();
    const projectJson = sb3.serialize(runtime);
    t.equal(typeof projectJson.customLibraries, 'undefined', 'no field added when there are no libraries');
    t.end();
});
