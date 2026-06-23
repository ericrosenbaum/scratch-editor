/* eslint-disable */
/**
 * Generates the 7 starter-project .sb3 files for the Speech to Text / Q&A
 * welcome modal, plus their thumbnails are added separately.
 *
 * Each .sb3 is a real, self-contained Scratch project: hand-authored project.json
 * (blocks built with the small DSL below) zipped with the referenced library
 * assets (fetched once from the Scratch CDN and cached under /tmp).
 *
 * Run:  node packages/scratch-gui/scripts/generate-starter-projects.js
 * Output: packages/scratch-gui/src/components/starter-projects-modal/starters/<id>.sb3
 */
const fs = require('fs');
const path = require('path');
const JSZip = require(path.resolve(__dirname, '../../../node_modules/jszip'));

const LIB = path.resolve(__dirname, '../src/lib/libraries');
const SPRITES = require(path.join(LIB, 'sprites.json'));
const BACKDROPS = require(path.join(LIB, 'backdrops.json'));
const DEFAULT_QA = require(path.resolve(__dirname, '../../scratch-vm/src/extensions/scratch3_qna/default-qa-data'));

const OUT = path.resolve(__dirname, '../src/components/starter-projects-modal/starters');
const CACHE = '/tmp/scratch-asset-cache';
const CDN = md5ext => `https://cdn.assets.scratch.mit.edu/internalapi/asset/${md5ext}/get/`;

// ---------------------------------------------------------------------------
// Asset lookup + fetch
// ---------------------------------------------------------------------------
const spriteByName = name => {
    const s = SPRITES.find(x => x.name === name);
    if (!s) throw new Error(`sprite not found: ${name}`);
    return s;
};
const backdropByName = name => {
    const b = BACKDROPS.find(x => x.name === name);
    if (!b) throw new Error(`backdrop not found: ${name}`);
    return b;
};

const assetMd5s = new Set();
const collectAssets = target => {
    (target.costumes || []).forEach(c => assetMd5s.add(c.md5ext));
    (target.sounds || []).forEach(s => assetMd5s.add(s.md5ext));
};

async function fetchAsset (md5ext) {
    const cached = path.join(CACHE, md5ext);
    if (fs.existsSync(cached)) return fs.readFileSync(cached);
    const res = await fetch(CDN(md5ext));
    if (!res.ok) throw new Error(`fetch ${md5ext} -> ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(cached, buf);
    return buf;
}

// ---------------------------------------------------------------------------
// Block-builder DSL
//   Nodes:  C(opcode, inputs, fields)  -> command/reporter
//   Inputs: text/number/.../menu/rep/boolIn/substack descriptors
//   A "script" is {opcode (hat), inputs, fields, body:[...]}.
// ---------------------------------------------------------------------------
const C = (opcode, inputs = {}, fields = {}) => ({opcode, inputs, fields});

const prim = (type, val) => ({t: 'prim', val: [type, String(val)]});
const text = v => prim(10, v);
const number = v => prim(4, v);
const positive = v => prim(5, v);
const whole = v => prim(6, v);

const menu = (opcode, field, value) => ({t: 'menu', opcode, field, value});
const rep = (node, shadow = [10, '']) => ({t: 'rep', node, shadow});
const boolIn = node => ({t: 'block', node});
const substack = nodes => ({t: 'substack', nodes});

function makeBuilder () {
    const blocks = {};
    let n = 0;
    const id = () => `b${(++n).toString(36)}`;

    function resolveInput (desc, parentId) {
        if (desc.t === 'prim') return [1, desc.val];
        if (desc.t === 'menu') {
            const mid = mk(desc.opcode, {fields: {[desc.field]: [desc.value, null]}, shadow: true, parent: parentId});
            return [1, mid];
        }
        if (desc.t === 'rep') {
            const rid = mk(desc.node.opcode, {inputs: desc.node.inputs, fields: desc.node.fields, parent: parentId});
            return [3, rid, [desc.shadow[0], desc.shadow[1]]];
        }
        if (desc.t === 'block') {
            const cid = mk(desc.node.opcode, {inputs: desc.node.inputs, fields: desc.node.fields, parent: parentId});
            return [2, cid];
        }
        if (desc.t === 'substack') {
            return [2, buildStack(desc.nodes, parentId)];
        }
        throw new Error(`bad input ${JSON.stringify(desc)}`);
    }

    function mk (opcode, {inputs = {}, fields = {}, shadow = false, topLevel = false, x = 0, y = 0, parent = null} = {}) {
        const bid = id();
        const block = {opcode, next: null, parent, inputs: {}, fields, shadow, topLevel};
        if (topLevel) { block.x = x; block.y = y; }
        blocks[bid] = block;
        for (const [name, desc] of Object.entries(inputs)) {
            block.inputs[name] = resolveInput(desc, bid);
        }
        return bid;
    }

    function buildStack (nodes, parentId) {
        if (!nodes || !nodes.length) return null;
        const ids = nodes.map(node => mk(node.opcode, {inputs: node.inputs, fields: node.fields}));
        ids.forEach((bid, i) => {
            blocks[bid].parent = i === 0 ? parentId : ids[i - 1];
            blocks[bid].next = i < ids.length - 1 ? ids[i + 1] : null;
        });
        return ids[0];
    }

    function buildHat (script, x, y) {
        const hid = mk(script.opcode, {inputs: script.inputs || {}, fields: script.fields || {}, topLevel: true, x, y});
        blocks[hid].next = buildStack(script.body || [], hid);
        return hid;
    }

    return {blocks, buildHat};
}

// ---------------------------------------------------------------------------
// Target assembly
// ---------------------------------------------------------------------------
let layerCounter = 0;
function buildSprite ({name, costumes, sounds, scripts, x = 0, y = 0, currentCostume = 0}) {
    const b = makeBuilder();
    let yy = 40;
    (scripts || []).forEach(script => {
        b.buildHat(script, 40, yy);
        yy += 260;
    });
    return {
        isStage: false,
        name,
        variables: {}, lists: {}, broadcasts: {},
        blocks: b.blocks,
        comments: {},
        currentCostume,
        costumes,
        sounds: sounds || [],
        volume: 100,
        layerOrder: ++layerCounter,
        visible: true,
        x, y, size: 100, direction: 90,
        draggable: false,
        rotationStyle: 'all around'
    };
}
function buildStage (backdrop) {
    return {
        isStage: true,
        name: 'Stage',
        variables: {}, lists: {}, broadcasts: {},
        blocks: {}, comments: {},
        currentCostume: 0,
        costumes: [{
            name: backdrop.name,
            bitmapResolution: backdrop.bitmapResolution || 1,
            dataFormat: backdrop.dataFormat,
            assetId: backdrop.assetId,
            md5ext: backdrop.md5ext,
            rotationCenterX: backdrop.rotationCenterX,
            rotationCenterY: backdrop.rotationCenterY
        }],
        sounds: [],
        volume: 100,
        layerOrder: 0,
        tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
    };
}

// Convenience: a library sprite's costumes / a named subset of its sounds.
const costumesOf = name => spriteByName(name).costumes.map(c => ({...c}));
const soundsOf = (name, only) => {
    const all = spriteByName(name).sounds.map(s => ({...s}));
    return only ? all.filter(s => only.includes(s.name)) : all;
};

// ---------------------------------------------------------------------------
// Reusable script fragments
// ---------------------------------------------------------------------------
const sayFor = (msg, secs = 3) => C('looks_sayforsecs', {MESSAGE: text(msg), SECS: number(secs)});
const say = msg => C('looks_say', {MESSAGE: text(msg)});
const listen = () => C('speech2text_listenAndWait');
const speechRep = () => C('speech2text_getSpeech');
const playSound = name => C('sound_play', {SOUND_MENU: menu('sound_sounds_menu', 'SOUND_MENU', name)});
const ask = q => C('sensing_askandwait', {QUESTION: text(q)});
const sensingAnswer = () => C('sensing_answer');
const qnaAnswerCmd = (questionInput, dataset) => C('qna_answerQuestion', {
    QUESTION: questionInput,
    DATASET: menu('qna_menu_qaDatasetMenu', 'qaDatasetMenu', dataset)
});
const qnaAnswerRep = () => C('qna_getQAAnswer');
const whenIHear = (phrase, body) => ({opcode: 'speech2text_whenIHearHat', inputs: {PHRASE: text(phrase)}, body});
const whenFlag = body => ({opcode: 'event_whenflagclicked', body});
const whenClicked = body => ({opcode: 'event_whenthisspriteclicked', body});

// ---------------------------------------------------------------------------
// Custom Q&A datasets (saved into the project via extensionData)
// ---------------------------------------------------------------------------
const SCRATCH_FAQ = DEFAULT_QA[0]; // {name:'Scratch FAQ', pairs:[...]}
const DINO_FACTS = {
    name: 'Dinosaur Facts',
    pairs: [
        {question: 'How big was a T. rex?', answer: 'Tyrannosaurus rex was about 40 feet long and 12 feet tall at the hips!'},
        {question: 'What did Triceratops eat?', answer: 'Triceratops was a herbivore — it ate plants like ferns and shrubs.'},
        {question: 'When did dinosaurs live?', answer: 'Dinosaurs lived during the Mesozoic Era, from about 250 to 66 million years ago.'},
        {question: 'What does the word dinosaur mean?', answer: 'Dinosaur means "terrible lizard" in Greek.'},
        {question: 'Which dinosaur could fly?', answer: 'Flying reptiles like Pteranodon ruled the skies, though they were not technically dinosaurs!'},
        {question: 'How do we know about dinosaurs?', answer: 'We learn about dinosaurs from fossils — bones and footprints preserved in rock.'},
        {question: 'What was the biggest dinosaur?', answer: 'Long-necked sauropods like Argentinosaurus may have been over 100 feet long.'}
    ]
};
const SPACE_FACTS = {
    name: 'Space Facts',
    pairs: [
        {question: 'What is the closest planet to the sun?', answer: 'Mercury is the closest planet to the sun.'},
        {question: 'Why is the sky dark in space?', answer: 'In space there is no air to scatter sunlight, so the sky looks black.'},
        {question: 'How many planets are there?', answer: 'There are eight planets in our solar system.'},
        {question: 'What is a shooting star?', answer: 'A shooting star is really a meteor — a bit of space rock burning up in the air.'},
        {question: 'Why do astronauts float?', answer: 'Astronauts float because they are in free fall around Earth, which feels like zero gravity.'},
        {question: 'What is the moon made of?', answer: 'The moon is made of rock and dust, with no air and no water you can drink.'}
    ]
};
const OCEAN_FACTS = {
    name: 'Ocean Facts',
    pairs: [
        {question: 'What is the biggest animal in the ocean?', answer: 'The blue whale is the largest animal on Earth — bigger than any dinosaur!'},
        {question: 'How deep is the ocean?', answer: 'The deepest part of the ocean is the Mariana Trench, almost 11 kilometers down.'},
        {question: 'Why is the ocean salty?', answer: 'Rivers carry tiny bits of salt from rocks into the sea, and it builds up over time.'},
        {question: 'Do fish sleep?', answer: 'Many fish rest by slowing down and staying still, though they do not close their eyes.'},
        {question: 'What is coral?', answer: 'Coral is made by tiny animals called polyps that build hard reefs full of sea life.'},
        {question: 'How do whales breathe?', answer: 'Whales breathe air through a blowhole, so they come to the surface for a breath.'}
    ]
};

// ---------------------------------------------------------------------------
// The 7 projects
// ---------------------------------------------------------------------------
const projects = {};

// 1) Magic Words — Speech to Text
projects['magic-words'] = {
    title: 'Magic Words',
    extensions: ['speech2text'],
    targets: [
        buildStage(backdropByName('Witch House')),
        buildSprite({
            name: 'Wizard',
            costumes: costumesOf('Wizard'),
            sounds: soundsOf('Wizard'),
            scripts: [
                whenFlag([
                    sayFor('Say a magic word: bigger, smaller, or vanish!', 3),
                    C('control_forever', {SUBSTACK: substack([listen()])})
                ]),
                whenIHear('bigger', [
                    C('looks_changesizeby', {CHANGE: number(25)}),
                    playSound('Magic Spell')
                ]),
                whenIHear('smaller', [
                    C('looks_changesizeby', {CHANGE: number(-25)}),
                    playSound('Magic Spell')
                ]),
                whenIHear('vanish', [
                    C('control_repeat', {TIMES: whole(10), SUBSTACK: substack([
                        C('looks_changeeffectby', {CHANGE: number(10)}, {EFFECT: ['GHOST', null]})
                    ])}),
                    C('control_wait', {DURATION: positive(1)}),
                    C('control_repeat', {TIMES: whole(10), SUBSTACK: substack([
                        C('looks_changeeffectby', {CHANGE: number(-10)}, {EFFECT: ['GHOST', null]})
                    ])})
                ])
            ]
        })
    ]
};

// 2) Voice Racer — Speech to Text
projects['voice-racer'] = {
    title: 'Voice Racer',
    extensions: ['speech2text'],
    targets: [
        buildStage(backdropByName('Blue Sky 2')),
        buildSprite({
            name: 'Convertible',
            costumes: costumesOf('Convertible'),
            sounds: soundsOf('Convertible'),
            x: -200, y: -120,
            scripts: [
                whenFlag([
                    C('motion_gotoxy', {X: number(-200), Y: number(-120)}),
                    sayFor('Say GO to drive, STOP to brake, JUMP to hop!', 3),
                    C('control_forever', {SUBSTACK: substack([listen()])})
                ]),
                whenIHear('go', [
                    C('control_repeat', {TIMES: whole(10), SUBSTACK: substack([
                        C('motion_changexby', {DX: number(20)})
                    ])})
                ]),
                whenIHear('stop', [sayFor('Screech!', 1)]),
                whenIHear('jump', [
                    C('control_repeat', {TIMES: whole(6), SUBSTACK: substack([C('motion_changeyby', {DY: number(12)})])}),
                    C('control_repeat', {TIMES: whole(6), SUBSTACK: substack([C('motion_changeyby', {DY: number(-12)})])})
                ])
            ]
        }),
        buildSprite({
            name: 'Cake',
            costumes: costumesOf('Cake'),
            sounds: soundsOf('Cake'),
            x: 200, y: -120,
            scripts: [
                whenFlag([
                    C('motion_gotoxy', {X: number(200), Y: number(-120)}),
                    C('control_forever', {SUBSTACK: substack([
                        C('control_if', {
                            CONDITION: boolIn(C('sensing_touchingobject', {
                                TOUCHINGOBJECTMENU: menu('sensing_touchingobjectmenu', 'TOUCHINGOBJECTMENU', 'Convertible')
                            })),
                            SUBSTACK: substack([sayFor('You made it!', 2)])
                        })
                    ])})
                ])
            ]
        })
    ]
};

// 3) Echo Parrot — Speech to Text (the speech reporter)
projects['echo-parrot'] = {
    title: 'Echo Parrot',
    extensions: ['speech2text'],
    targets: [
        buildStage(backdropByName('Jungle')),
        buildSprite({
            name: 'Parrot',
            costumes: costumesOf('Parrot'),
            sounds: soundsOf('Parrot'),
            scripts: [
                whenFlag([
                    sayFor("Talk to me and I'll repeat you!", 2),
                    C('control_forever', {SUBSTACK: substack([
                        listen(),
                        C('looks_nextcostume'),
                        C('looks_sayforsecs', {MESSAGE: rep(speechRep()), SECS: number(2)}),
                        playSound('Bird'),
                        C('looks_nextcostume')
                    ])})
                ])
            ]
        })
    ]
};

// 4) Scratch Helper — Q&A (built-in Scratch FAQ)
projects['scratch-helper'] = {
    title: 'Scratch Helper',
    extensions: ['qna'],
    extensionData: {qna: {datasets: [SCRATCH_FAQ]}},
    targets: [
        buildStage(backdropByName('Chalkboard')),
        buildSprite({
            name: 'Robot',
            costumes: costumesOf('Robot'),
            sounds: soundsOf('Robot'),
            scripts: [
                whenFlag([sayFor('Click me and ask a question about Scratch!', 3)]),
                whenClicked([
                    ask('What do you want to know?'),
                    qnaAnswerCmd(rep(sensingAnswer()), 'Scratch FAQ'),
                    C('looks_sayforsecs', {MESSAGE: rep(qnaAnswerRep()), SECS: number(5)})
                ])
            ]
        })
    ]
};

// 5) Dino Expert — Q&A (custom dataset, saved via serialization)
projects['dino-expert'] = {
    title: 'Dino Expert',
    extensions: ['qna'],
    extensionData: {qna: {datasets: [DINO_FACTS, SCRATCH_FAQ]}},
    targets: [
        buildStage(backdropByName('Jurassic')),
        buildSprite({
            name: 'Dinosaur4',
            costumes: costumesOf('Dinosaur4'),
            sounds: soundsOf('Dinosaur4'),
            scripts: [
                whenFlag([sayFor('Ask me anything about dinosaurs — click me to start!', 3)]),
                whenClicked([
                    ask("What's your dinosaur question?"),
                    qnaAnswerCmd(rep(sensingAnswer()), 'Dinosaur Facts'),
                    C('looks_sayforsecs', {MESSAGE: rep(qnaAnswerRep()), SECS: number(5)}),
                    C('looks_nextcostume')
                ])
            ]
        })
    ]
};

// 6) Meet the Crew — Q&A (two experts, two datasets, dataset menu)
projects['meet-the-crew'] = {
    title: 'Meet the Crew',
    extensions: ['qna'],
    extensionData: {qna: {datasets: [SPACE_FACTS, OCEAN_FACTS, SCRATCH_FAQ]}},
    targets: [
        buildStage(backdropByName('Space')),
        buildSprite({
            name: 'Pico', costumes: costumesOf('Pico'), sounds: soundsOf('Pico'),
            x: -120, y: -40,
            scripts: [
                whenFlag([
                    C('motion_gotoxy', {X: number(-120), Y: number(-40)}),
                    say("I'm the space expert — click me!")
                ]),
                whenClicked([
                    ask('Ask me about space!'),
                    qnaAnswerCmd(rep(sensingAnswer()), 'Space Facts'),
                    C('looks_sayforsecs', {MESSAGE: rep(qnaAnswerRep()), SECS: number(5)})
                ])
            ]
        }),
        buildSprite({
            name: 'Ripley', costumes: costumesOf('Ripley'), sounds: soundsOf('Ripley'),
            x: 120, y: -40,
            scripts: [
                whenFlag([
                    C('motion_gotoxy', {X: number(120), Y: number(-40)}),
                    say("I'm the ocean expert — click me!")
                ]),
                whenClicked([
                    ask('Ask me about the ocean!'),
                    qnaAnswerCmd(rep(sensingAnswer()), 'Ocean Facts'),
                    C('looks_sayforsecs', {MESSAGE: rep(qnaAnswerRep()), SECS: number(5)})
                ])
            ]
        })
    ]
};

// 7) Talk to the Robot — Speech to Text + Q&A (the combo)
projects['talk-to-the-robot'] = {
    title: 'Talk to the Robot',
    extensions: ['speech2text', 'qna'],
    extensionData: {qna: {datasets: [SCRATCH_FAQ]}},
    targets: [
        buildStage(backdropByName('Bedroom 3')),
        buildSprite({
            name: 'Robot',
            costumes: costumesOf('Robot'),
            sounds: soundsOf('Robot'),
            scripts: [
                whenFlag([sayFor('Click me, then ask a question out loud!', 3)]),
                whenClicked([
                    say('Listening...'),
                    playSound('Computer Beep'),
                    listen(),
                    C('looks_sayforsecs', {
                        MESSAGE: rep(C('operator_join', {STRING1: text('You asked: '), STRING2: rep(speechRep())})),
                        SECS: number(2)
                    }),
                    qnaAnswerCmd(rep(speechRep()), 'Scratch FAQ'),
                    C('looks_sayforsecs', {MESSAGE: rep(qnaAnswerRep()), SECS: number(5)})
                ])
            ]
        })
    ]
};

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
async function main () {
    if (!fs.existsSync(CACHE)) fs.mkdirSync(CACHE, {recursive: true});

    for (const [id, def] of Object.entries(projects)) {
        layerCounter = 0;
        def.targets.forEach(collectAssets);
    }

    const order = Object.keys(projects);
    for (const id of order) {
        const def = projects[id];
        const project = {
            targets: def.targets,
            monitors: [],
            extensions: def.extensions || [],
            meta: {semver: '3.0.0', vm: '5.0.0', agent: 'starter-generator'}
        };
        if (def.extensionData) project.extensionData = def.extensionData;

        const zip = new JSZip();
        zip.file('project.json', JSON.stringify(project));
        // Bundle all assets referenced by this project's targets.
        const md5s = new Set();
        def.targets.forEach(t => {
            (t.costumes || []).forEach(c => md5s.add(c.md5ext));
            (t.sounds || []).forEach(s => md5s.add(s.md5ext));
        });
        for (const md5ext of md5s) {
            zip.file(md5ext, await fetchAsset(md5ext));
        }
        const buf = await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'});
        fs.writeFileSync(path.join(OUT, `${id}.sb3`), buf);
        console.log(`wrote ${id}.sb3  (${(buf.length / 1024).toFixed(0)} KB, ${md5s.size} assets)`);
    }
    console.log('done');
}

main().catch(e => { console.error(e); process.exit(1); });
