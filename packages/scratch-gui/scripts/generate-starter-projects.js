/* eslint-disable */
/**
 * Generates the script-built starter-project .sb3 files for the Speech to Text
 * / Q&A welcome modal, plus their thumbnails are added separately.
 *
 * NOTE: only `scratch-helper` is still generated here. The other starters
 * (magic-words, maze-starter, echo-parrot, pong-with-faq, space-adventure,
 * talk-to-the-axolotl) are now hand-authored .sb3 files that live directly in
 * starters/ — do NOT re-add them here or a regen would clobber them. See
 * starters/README.md.
 *
 * Each generated .sb3 is a real, self-contained Scratch project: hand-authored
 * project.json (blocks built with the small DSL below) zipped with the
 * referenced library assets (fetched once from the Scratch CDN, cached in /tmp).
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

// ---------------------------------------------------------------------------
// The projects still generated by this script (see header note)
// ---------------------------------------------------------------------------
const projects = {};

// Scratch Helper — Q&A (built-in Scratch FAQ)
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
