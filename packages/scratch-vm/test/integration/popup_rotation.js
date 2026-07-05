const crypto = require('crypto');
const JSZip = require('jszip');
const test = require('tap').test;

const makeTestStorage = require('../fixtures/make-test-storage');
const VirtualMachine = require('../../src/virtual-machine');

// Build an .sb3 in memory with a single sprite running, on the green flag:
//   tilt to (30) -> spin to (45) -> move (10) steps in 3D
// using the built-in 3D Pop-Up extension. The rotation/move blocks are pure state
// (no renderer needed), so this runs headless.
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
                        next: 'tilt',
                        parent: null,
                        inputs: {},
                        fields: {},
                        shadow: false,
                        topLevel: true,
                        x: 0,
                        y: 0
                    },
                    tilt: {
                        opcode: 'popup_setTilt',
                        next: 'spin',
                        parent: 'flag',
                        inputs: {ANGLE: numInput('30')},
                        fields: {},
                        shadow: false,
                        topLevel: false
                    },
                    spin: {
                        opcode: 'popup_setSpin',
                        next: 'move',
                        parent: 'tilt',
                        inputs: {ANGLE: numInput('45')},
                        fields: {},
                        shadow: false,
                        topLevel: false
                    },
                    move: {
                        opcode: 'popup_move3D',
                        next: null,
                        parent: 'spin',
                        inputs: {STEPS: numInput('10')},
                        fields: {},
                        shadow: false,
                        topLevel: false
                    }
                }
            }
        ],
        monitors: [],
        extensions: ['popup'],
        meta: {semver: '3.0.0', vm: '0.0.0', agent: 'popup-rotation-test'}
    };
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(project));
    zip.file(`${md5(svg)}.svg`, svg);
    return zip.generateAsync({type: 'nodebuffer'});
};

const near = (a, b) => Math.abs(a - b) < 1e-6;

// `tilt`/`spin` store rotation state; `move ... steps in 3D` advances along the
// heading built from spin (yaw) + tilt (pitch). Each visual-change block requests a
// redraw and so yields a frame, so the three blocks run over successive steps.
test('3D Pop-Up tilt/spin/move3D update rotation state and 3D position', t => {
    buildProject().then(buffer => {
        const vm = new VirtualMachine();
        vm.attachStorage(makeTestStorage());
        return vm.loadProject(buffer).then(() => {
            const cat = vm.runtime.targets.find(target => !target.isStage);
            const state = () => cat.getCustomState('Scratch.popup');

            vm.runtime.currentStepTime = 1000 / 30;
            vm.runtime.greenFlag();

            // Step enough frames for the (yielding) sequential blocks to all run.
            for (let i = 0; i < 5; i++) vm.runtime._step();

            t.equal(state().tilt, 30, 'tilt set to 30');
            t.equal(state().spin, 45, 'spin set to 45');

            // Heading: the local +z (face normal) rotated by the card's orientation,
            // Euler 'XYZ' with x=tilt(30deg), y=spin(45deg), z=0 (direction 90 => no
            // in-plane rotation). Matches scene.forwardVector / _orientation: at rest
            // the heading is +z (toward the camera); spin yaws it, tilt pitches it.
            const yaw = 45 * Math.PI / 180;
            const pitch = 30 * Math.PI / 180;
            const fx = Math.sin(yaw);
            const fy = -Math.sin(pitch) * Math.cos(yaw);
            const fz = Math.cos(pitch) * Math.cos(yaw);

            t.ok(near(cat.x, 10 * fx), 'x advanced along the heading');
            t.ok(near(cat.y, 10 * fy), 'y advanced along the heading');
            t.ok(near(state().depth, -10 * fz), 'depth advanced along the heading');

            t.end();
        });
    });
});
