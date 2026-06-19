/* eslint-disable */
// Generates the three 3D Pop-Up example projects shown in the welcome modal:
//   popup-example-1.sb3  Pop-Up Card     (depth + drag camera)
//   popup-example-2.sb3  Fish Tank       (auto-spin + swimming clones-free fish)
//   popup-example-3.sb3  Build a Forest  (click to stamp 3D trees)
//
// Run: node src/components/popup-examples-modal/starters/make-popup-examples.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const JSZip = require('jszip');

const md5 = str => crypto.createHash('md5').update(str).digest('hex');

// ---- tiny sb3 block DSL -----------------------------------------------------
let idCounter = 0;
const nid = () => `b${++idCounter}`;
const num = v => [1, [4, String(v)]];

// Build a script (a hat + linear stack, with optional control_forever substacks).
// specs: [{op, fields?, inputs?, sub?}]; sub is a nested specs array.
const buildScript = (blocks, specs, x, y) => {
    const chain = (list, parentId) => {
        let prev = null;
        let first = null;
        for (const s of list) {
            const id = nid();
            if (!first) first = id;
            const blk = {
                opcode: s.op,
                next: null,
                parent: prev || parentId,
                inputs: Object.assign({}, s.inputs),
                fields: s.fields || {},
                shadow: false,
                topLevel: false
            };
            blocks[id] = blk;
            if (prev) blocks[prev].next = id;
            if (s.sub) {
                const subFirst = chain(s.sub, id);
                blk.inputs.SUBSTACK = [2, subFirst];
            }
            prev = id;
        }
        return first;
    };
    const firstId = chain(specs, null);
    blocks[firstId].topLevel = true;
    blocks[firstId].parent = null;
    blocks[firstId].x = x;
    blocks[firstId].y = y;
    return blocks;
};

const flag = (...specs) => [{op: 'event_whenflagclicked'}, ...specs];
const setSky = sky => ({op: 'popup_setSky', fields: {SKY: [sky, null]}});
const setCamera = view => ({op: 'popup_setCamera', fields: {VIEW: [view, null]}});
const setThickness = v => ({op: 'popup_setThickness', inputs: {AMOUNT: num(v)}});
const setDepth = v => ({op: 'popup_setDepth', inputs: {AMOUNT: num(v)}});
const stamp = () => ({op: 'popup_stampInThreeD'});
const move = v => ({op: 'motion_movesteps', inputs: {STEPS: num(v)}});
const bounce = () => ({op: 'motion_ifonedgebounce'});
const changeX = v => ({op: 'motion_changexby', inputs: {DX: num(v)}});
const gotoXY = (x, y) => ({op: 'motion_gotoxy', inputs: {X: num(x), Y: num(y)}});
const forever = (...sub) => ({op: 'control_forever', sub});

// ---- asset helpers ----------------------------------------------------------
const costume = (name, svg, rcx, rcy) => ({
    assetId: md5(svg),
    name,
    md5ext: `${md5(svg)}.svg`,
    dataFormat: 'svg',
    bitmapResolution: 1,
    rotationCenterX: rcx,
    rotationCenterY: rcy
});

const stage = (backdropSvg, blocks) => ({
    isStage: true,
    name: 'Stage',
    variables: {}, lists: {}, broadcasts: {}, blocks: blocks || {}, comments: {},
    currentCostume: 0,
    costumes: [costume('backdrop', backdropSvg, 240, 180)],
    sounds: [], volume: 100, layerOrder: 0,
    tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
});

const sprite = (opts) => ({
    isStage: false,
    name: opts.name,
    variables: {}, lists: {}, broadcasts: {}, blocks: opts.blocks || {}, comments: {},
    currentCostume: 0,
    costumes: [costume(`${opts.name}-costume`, opts.svg, opts.rcx, opts.rcy)],
    sounds: [], volume: 100, layerOrder: opts.layer,
    visible: true,
    x: opts.x || 0, y: opts.y || 0, size: opts.size || 100,
    direction: opts.direction || 90,
    draggable: false, rotationStyle: opts.rotationStyle || 'all around'
});

const writeProject = (file, targets) => {
    const project = {
        targets,
        monitors: [],
        extensions: ['popup'],
        meta: {semver: '3.0.0', vm: '0.0.0', agent: 'popup-examples-generator'}
    };
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(project));
    for (const t of targets) {
        for (const c of t.costumes) zip.file(c.md5ext, svgFor(c.assetId));
    }
    return zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'}).then(buf => {
        const out = path.join(__dirname, file);
        fs.writeFileSync(out, buf);
        console.log(`wrote ${file} (${buf.length} bytes)`);
    });
};

// Registry so writeProject can fetch each asset's SVG by its md5.
const svgRegistry = {};
const reg = svg => {
    svgRegistry[md5(svg)] = svg;
    return svg;
};
const svgFor = assetId => svgRegistry[assetId];

// ---- artwork ----------------------------------------------------------------
const heartSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="92" viewBox="0 0 100 92">
  <path d="M50 88 C10 56 4 30 22 16 C36 5 50 18 50 28 C50 18 64 5 78 16 C96 30 90 56 50 88Z"
    fill="#ff5c8a" stroke="#c2305c" stroke-width="5" stroke-linejoin="round"/></svg>`);
const starSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <polygon points="50,5 61,38 96,38 68,59 79,93 50,72 21,93 32,59 4,38 39,38"
    fill="#ffd23f" stroke="#d99a00" stroke-width="4" stroke-linejoin="round"/></svg>`);
const cardBgSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#ffe3ef"/><stop offset="1" stop-color="#fff7e6"/></linearGradient></defs>
  <rect width="480" height="360" fill="url(#g)"/></svg>`);

const fishSVG = color => reg(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="70" viewBox="0 0 120 70">
  <polygon points="92,35 118,12 118,58" fill="${color}" stroke="#0b3d52" stroke-width="3" stroke-linejoin="round"/>
  <ellipse cx="52" cy="35" rx="50" ry="26" fill="${color}" stroke="#0b3d52" stroke-width="3"/>
  <circle cx="24" cy="28" r="5" fill="#fff"/><circle cx="23" cy="28" r="2.5" fill="#0b3d52"/></svg>`);
const tankBgSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
  <defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#7fdbe6"/><stop offset="1" stop-color="#0277a8"/></linearGradient></defs>
  <rect width="480" height="360" fill="url(#w)"/>
  <rect y="320" width="480" height="40" fill="#e8d39b"/></svg>`);

const treeSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="90" height="120" viewBox="0 0 90 120">
  <rect x="38" y="78" width="14" height="36" fill="#7a4a1e"/>
  <circle cx="45" cy="46" r="38" fill="#3fa34d" stroke="#2c7a39" stroke-width="4"/></svg>`);
const grassBgSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
  <rect width="480" height="360" fill="#bfe8ff"/>
  <circle cx="86" cy="74" r="34" fill="#fff1a8"/>
  <rect y="250" width="480" height="110" fill="#86d35d"/></svg>`);

// ---- example 1: Pop-Up Card -------------------------------------------------
const card = [
    stage(cardBgSVG, buildScript({}, flag(setSky('sunset'), setCamera('drag')), 30, 30)),
    sprite({
        name: 'Heart', svg: heartSVG, rcx: 50, rcy: 46, x: -90, y: -10, size: 130, layer: 2,
        blocks: buildScript({}, flag(setThickness(35), setDepth(0)), 30, 30)
    }),
    sprite({
        name: 'Star', svg: starSVG, rcx: 50, rcy: 50, x: 110, y: 50, size: 90, layer: 1,
        blocks: buildScript({}, flag(setThickness(20), setDepth(140)), 30, 30)
    })
];

// ---- example 2: Fish Tank ---------------------------------------------------
const fishStack = (thickness, depth, speed) =>
    buildScript({}, flag(setThickness(thickness), setDepth(depth), forever(move(speed), bounce())), 30, 30);
const tank = [
    stage(tankBgSVG, buildScript({}, flag(setSky('underwater'), setCamera('orbit')), 30, 30)),
    sprite({
        name: 'Fish', svg: fishSVG('#ff924c'), rcx: 52, rcy: 35, x: -120, y: 40, size: 90,
        direction: 90, layer: 1, blocks: fishStack(16, 0, 3)
    }),
    sprite({
        name: 'Fish2', svg: fishSVG('#9b6bff'), rcx: 52, rcy: 35, x: 120, y: -30, size: 80,
        direction: -75, layer: 2, blocks: fishStack(14, 150, 2)
    })
];

// ---- example 3: Build a Forest ----------------------------------------------
// Stamps a row of trees on the green flag (each stamp uses the sprite's current
// spot, and "change x" walks it across between stamps).
const forest = [
    stage(grassBgSVG, buildScript({}, flag(setSky('day'), setCamera('drag')), 30, 30)),
    sprite({
        name: 'Tree', svg: treeSVG, rcx: 45, rcy: 114, x: -180, y: -30, size: 80, layer: 1,
        blocks: buildScript({}, flag(
            setThickness(22), gotoXY(-180, -30),
            stamp(), changeX(75),
            stamp(), changeX(75),
            stamp(), changeX(75),
            stamp(), changeX(75),
            stamp()
        ), 30, 30)
    })
];

Promise.resolve()
    .then(() => writeProject('popup-example-1.sb3', card))
    .then(() => writeProject('popup-example-2.sb3', tank))
    .then(() => writeProject('popup-example-3.sb3', forest));
