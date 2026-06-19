const crypto = require('crypto');
const JSZip = require('jszip');
const test = require('tap').test;

const makeTestStorage = require('../fixtures/make-test-storage');
const VirtualMachine = require('../../src/virtual-machine');

// Build an .sb3 in memory with a single sprite running:
//   when green flag clicked -> forever { change depth by (10) }
// using the built-in 3D Pop-Up extension.
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
                        next: 'loop',
                        parent: null,
                        inputs: {},
                        fields: {},
                        shadow: false,
                        topLevel: true,
                        x: 0,
                        y: 0
                    },
                    loop: {
                        opcode: 'control_forever',
                        next: null,
                        parent: 'flag',
                        inputs: {SUBSTACK: [2, 'change']},
                        fields: {},
                        shadow: false,
                        topLevel: false
                    },
                    change: {
                        opcode: 'popup_changeDepth',
                        next: null,
                        parent: 'loop',
                        inputs: {AMOUNT: [1, [4, '10']]},
                        fields: {},
                        shadow: false,
                        topLevel: false
                    }
                }
            }
        ],
        monitors: [],
        extensions: ['popup'],
        meta: {semver: '3.0.0', vm: '0.0.0', agent: 'popup-yield-test'}
    };
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(project));
    zip.file(`${md5(svg)}.svg`, svg);
    return zip.generateAsync({type: 'nodebuffer'});
};

// A `forever` loop containing only a 3D Pop-Up visual-change block must yield one
// frame per iteration (like core motion blocks), rather than running to the work-time
// limit in a single tick. Each block requests a redraw, which makes the sequencer
// yield the (non-warp) loop.
test('3D Pop-Up visual-change blocks make loops yield one frame at a time', t => {
    buildProject().then(buffer => {
        const vm = new VirtualMachine();
        vm.attachStorage(makeTestStorage());
        return vm.loadProject(buffer).then(() => {
            const cat = vm.runtime.targets.find(target => !target.isStage);
            const depth = () => {
                const state = cat.getCustomState('Scratch.popup');
                return state && state.depth;
            };

            vm.runtime.currentStepTime = 1000 / 30;
            vm.runtime.greenFlag();

            vm.runtime._step();
            t.equal(depth(), 10, 'one iteration after the first frame');
            vm.runtime._step();
            t.equal(depth(), 20, 'two iterations after the second frame');
            vm.runtime._step();
            t.equal(depth(), 30, 'three iterations after the third frame');

            t.end();
        });
    });
});
