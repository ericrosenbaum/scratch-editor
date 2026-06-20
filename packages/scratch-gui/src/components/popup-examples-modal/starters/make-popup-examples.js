/* eslint-disable */
// Generates the 3D Pop-Up example projects shown in the welcome modal:
//   popup-example-1.sb3  Pop-Up Card     (depth + drag camera)
//   popup-example-2.sb3  Fish Tank       (auto-spin + swimming fish)
//   popup-example-3.sb3  Build a Forest  (stamps a row of 3D trees)
//   popup-example-4.sb3  Space Flyer     (arrow keys fly in x + depth)
//   popup-example-5.sb3  Jump!           (arrow keys walk, space jumps)
//   popup-example-6.sb3  Magic Garden    (arrow keys move, space stamps flowers)
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
const changeY = v => ({op: 'motion_changeyby', inputs: {DY: num(v)}});
const gotoXY = (x, y) => ({op: 'motion_gotoxy', inputs: {X: num(x), Y: num(y)}});
const changeDepth = v => ({op: 'popup_changeDepth', inputs: {AMOUNT: num(v)}});
const forever = (...sub) => ({op: 'control_forever', sub});
const repeatN = (times, ...sub) => ({op: 'control_repeat', inputs: {TIMES: num(times)}, sub});
const whenKey = (key, ...specs) => [{op: 'event_whenkeypressed', fields: {KEY_OPTION: [key, null]}}, ...specs];

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

const rocketSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="100" viewBox="0 0 60 100">
  <polygon points="30,2 47,34 13,34" fill="#e6e9ed" stroke="#9aa0a6" stroke-width="3" stroke-linejoin="round"/>
  <rect x="14" y="31" width="32" height="46" rx="7" fill="#f7f8fa" stroke="#9aa0a6" stroke-width="3"/>
  <circle cx="30" cy="50" r="7" fill="#4aa3ff" stroke="#1c6fd0" stroke-width="3"/>
  <polygon points="14,60 2,84 14,76" fill="#ff5252" stroke="#b71c1c" stroke-width="2"/>
  <polygon points="46,60 58,84 46,76" fill="#ff5252" stroke="#b71c1c" stroke-width="2"/>
  <polygon points="22,77 38,77 30,97" fill="#ffb300"/></svg>`);
const spaceBgSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
  <rect width="480" height="360" fill="#0a0a2a"/>
  <g fill="#ffffff"><circle cx="60" cy="60" r="2"/><circle cx="200" cy="120" r="1.5"/><circle cx="380" cy="80" r="2"/>
  <circle cx="120" cy="260" r="1.5"/><circle cx="300" cy="300" r="2"/><circle cx="430" cy="220" r="1.5"/>
  <circle cx="250" cy="40" r="1.5"/><circle cx="80" cy="190" r="1.5"/><circle cx="350" cy="170" r="2"/></g></svg>`);

const hopperSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
  <circle cx="40" cy="42" r="34" fill="#6ec6ff" stroke="#1c6fd0" stroke-width="4"/>
  <circle cx="30" cy="36" r="6" fill="#fff"/><circle cx="50" cy="36" r="6" fill="#fff"/>
  <circle cx="31" cy="37" r="3" fill="#222"/><circle cx="51" cy="37" r="3" fill="#222"/>
  <path d="M28 52 q12 12 24 0" stroke="#1c6fd0" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`);

const flowerSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="120" viewBox="0 0 60 120">
  <rect x="27" y="48" width="6" height="68" fill="#2e8b3d"/>
  <ellipse cx="14" cy="66" rx="12" ry="6" fill="#2e8b3d"/>
  <g fill="#ff5fa2" stroke="#c2305c" stroke-width="2">
  <circle cx="30" cy="14" r="11"/><circle cx="14" cy="26" r="11"/><circle cx="46" cy="26" r="11"/>
  <circle cx="20" cy="44" r="11"/><circle cx="40" cy="44" r="11"/></g>
  <circle cx="30" cy="30" r="10" fill="#ffd23f" stroke="#d99a00" stroke-width="2"/></svg>`);
const gardenBgSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
  <rect width="480" height="360" fill="#fbe6ff"/>
  <rect y="252" width="480" height="108" fill="#9be08a"/>
  <rect y="252" width="480" height="8" fill="#7fcf6f"/></svg>`);

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

// ---- example 4: Space Flyer (keyboard: x + depth) ---------------------------
const rocketBlocks = {};
buildScript(rocketBlocks, flag(setThickness(16), gotoXY(0, 0), setDepth(0)), 30, 30);
buildScript(rocketBlocks, whenKey('right arrow', changeX(18)), 30, 150);
buildScript(rocketBlocks, whenKey('left arrow', changeX(-18)), 30, 230);
buildScript(rocketBlocks, whenKey('up arrow', changeDepth(25)), 30, 310);
buildScript(rocketBlocks, whenKey('down arrow', changeDepth(-25)), 30, 390);
const spaceFlyer = [
    stage(spaceBgSVG, buildScript({}, flag(setSky('space'), setCamera('drag')), 30, 30)),
    sprite({
        name: 'Rocket', svg: rocketSVG, rcx: 30, rcy: 50, x: 0, y: 0, size: 90, layer: 1,
        blocks: rocketBlocks
    })
];

// ---- example 5: Jump! (keyboard: walk + jump via change y) -------------------
const hopperBlocks = {};
buildScript(hopperBlocks, flag(setThickness(24), gotoXY(0, -90)), 30, 30);
buildScript(hopperBlocks, whenKey('right arrow', changeX(22)), 30, 150);
buildScript(hopperBlocks, whenKey('left arrow', changeX(-22)), 30, 230);
buildScript(hopperBlocks, whenKey('space', repeatN(8, changeY(16)), repeatN(8, changeY(-16))), 30, 310);
const jumper = [
    stage(grassBgSVG, buildScript({}, flag(setSky('day'), setCamera('drag')), 30, 30)),
    sprite({
        name: 'Hopper', svg: hopperSVG, rcx: 40, rcy: 40, x: 0, y: -90, size: 110, layer: 1,
        blocks: hopperBlocks
    })
];

// ---- example 6: Magic Garden (keyboard: move + space stamps) -----------------
const flowerBlocks = {};
buildScript(flowerBlocks, flag(setThickness(14), gotoXY(0, -40), setDepth(0)), 30, 30);
buildScript(flowerBlocks, whenKey('right arrow', changeX(24)), 30, 150);
buildScript(flowerBlocks, whenKey('left arrow', changeX(-24)), 30, 230);
buildScript(flowerBlocks, whenKey('up arrow', changeDepth(28)), 30, 310);
buildScript(flowerBlocks, whenKey('down arrow', changeDepth(-28)), 30, 390);
buildScript(flowerBlocks, whenKey('space', stamp()), 30, 470);
const garden = [
    stage(gardenBgSVG, buildScript({}, flag(setSky('dream'), setCamera('drag')), 30, 30)),
    sprite({
        name: 'Flower', svg: flowerSVG, rcx: 30, rcy: 60, x: 0, y: -40, size: 80, layer: 1,
        blocks: flowerBlocks
    })
];

Promise.resolve()
    .then(() => writeProject('popup-example-1.sb3', card))
    .then(() => writeProject('popup-example-2.sb3', tank))
    .then(() => writeProject('popup-example-3.sb3', forest))
    .then(() => writeProject('popup-example-4.sb3', spaceFlyer))
    .then(() => writeProject('popup-example-5.sb3', jumper))
    .then(() => writeProject('popup-example-6.sb3', garden));
