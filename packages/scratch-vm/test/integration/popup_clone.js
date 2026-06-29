const crypto = require('crypto');
const JSZip = require('jszip');
const test = require('tap').test;

const makeTestStorage = require('../fixtures/make-test-storage');
const VirtualMachine = require('../../src/virtual-machine');

// Build an .sb3 in memory with a single sprite that, on the green flag, sets all four
// 3D Pop-Up properties and then clones itself:
//   set thickness to (60) -> set depth to (30) -> tilt to (20) -> spin to (40)
//     -> create clone of (myself)
// The clone must inherit every 3D property from its parent (mirroring how core
// properties like size and direction are inherited). Pure state, so this runs headless.
const md5 = str => crypto.createHash('md5').update(str)
    .digest('hex');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20">' +
    '<rect width="20" height="20" fill="#f90"/></svg>';
const costume = name => ({
    assetId: md5(svg),
    name,
    md5ext: `${md5(svg)}.svg`,
    dataFormat: 'svg',
    bitmapResolution: 1,
    rotationCenterX: 10,
    rotationCenterY: 10
});

const numInput = value => [1, [4, value]];

const buildProject = () => {
    const project = {
        targets: [
            {
                isStage: true,
                name: 'Stage',
                variables: {},
                lists: {},
                broadcasts: {},
                blocks: {},
                comments: {},
                currentCostume: 0,
                costumes: [costume('bg')],
                sounds: [],
                volume: 100,
                layerOrder: 0,
                tempo: 60,
                videoTransparency: 50,
                videoState: 'on',
                textToSpeechLanguage: null
            },
            {
                isStage: false,
                name: 'Cat',
                variables: {},
                lists: {},
                broadcasts: {},
                comments: {},
                currentCostume: 0,
                costumes: [costume('cat')],
                sounds: [],
                volume: 100,
                layerOrder: 1,
                visible: true,
                x: 0,
                y: 0,
                size: 100,
                direction: 90,
                draggable: false,
                rotationStyle: 'all around',
                blocks: {
                    flag: {
                        opcode: 'event_whenflagclicked',
                        next: 'thickness',
                        parent: null,
                        inputs: {},
                        fields: {},
                        shadow: false,
                        topLevel: true,
                        x: 0,
                        y: 0
                    },
                    thickness: {
                        opcode: 'popup_setThickness',
                        next: 'depth',
                        parent: 'flag',
                        inputs: {AMOUNT: numInput('60')},
                        fields: {},
                        shadow: false,
                        topLevel: false
                    },
                    depth: {
                        opcode: 'popup_setDepth',
                        next: 'tilt',
                        parent: 'thickness',
                        inputs: {AMOUNT: numInput('30')},
                        fields: {},
                        shadow: false,
                        topLevel: false
                    },
                    tilt: {
                        opcode: 'popup_setTilt',
                        next: 'spin',
                        parent: 'depth',
                        inputs: {ANGLE: numInput('20')},
                        fields: {},
                        shadow: false,
                        topLevel: false
                    },
                    spin: {
                        opcode: 'popup_setSpin',
                        next: 'clone',
                        parent: 'tilt',
                        inputs: {ANGLE: numInput('40')},
                        fields: {},
                        shadow: false,
                        topLevel: false
                    },
                    clone: {
                        opcode: 'control_create_clone_of',
                        next: null,
                        parent: 'spin',
                        inputs: {CLONE_OPTION: [1, 'cloneMenu']},
                        fields: {},
                        shadow: false,
                        topLevel: false
                    },
                    cloneMenu: {
                        opcode: 'control_create_clone_of_menu',
                        next: null,
                        parent: 'clone',
                        inputs: {},
                        fields: {CLONE_OPTION: ['_myself_', null]},
                        shadow: true,
                        topLevel: false
                    }
                }
            }
        ],
        monitors: [],
        extensions: ['popup'],
        meta: {semver: '3.0.0', vm: '0.0.0', agent: 'popup-clone-test'}
    };
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(project));
    zip.file(`${md5(svg)}.svg`, svg);
    return zip.generateAsync({type: 'nodebuffer'});
};

// A clone created while its parent has non-default 3D Pop-Up state must inherit all of
// that state (thickness, depth, tilt, spin), and the inherited state must be a copy so
// later edits to the clone don't leak back to the parent.
test('3D Pop-Up clones inherit all 3D properties from their parent', t => {
    buildProject().then(buffer => {
        const vm = new VirtualMachine();
        vm.attachStorage(makeTestStorage());
        return vm.loadProject(buffer).then(() => {
            const original = vm.runtime.targets.find(target => !target.isStage);

            vm.runtime.currentStepTime = 1000 / 30;
            vm.runtime.greenFlag();

            // Step enough frames for the (yielding) set blocks and the clone block to run.
            for (let i = 0; i < 8; i++) vm.runtime._step();

            const clone = vm.runtime.targets.find(
                target => !target.isStage && !target.isOriginal
            );
            t.ok(clone, 'a clone was created');

            const parentState = original.getCustomState('Scratch.popup');
            const cloneState = clone.getCustomState('Scratch.popup');

            t.ok(cloneState, 'the clone has Pop-Up state');
            t.equal(cloneState.thickness, 60, 'clone inherited thickness');
            t.equal(cloneState.depth, 30, 'clone inherited depth');
            t.equal(cloneState.tilt, 20, 'clone inherited tilt');
            t.equal(cloneState.spin, 40, 'clone inherited spin');

            // The inherited state must be an independent copy.
            t.not(cloneState, parentState, 'clone state is a distinct object');
            cloneState.depth = 999;
            t.equal(parentState.depth, 30, 'editing the clone does not affect the parent');

            t.end();
        });
    });
});
