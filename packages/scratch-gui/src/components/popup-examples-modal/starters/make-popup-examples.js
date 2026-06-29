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
const text = v => [1, [10, String(v)]];

// A reporter/boolean/menu spec is a plain object carrying an `op`. It is instantiated
// as its own block and referenced from its parent input. `boolean` picks the [2,id]
// hexagon shape; `menu` picks the [1,id] shadow-dropdown shape; otherwise it is a
// round reporter dropped into a value slot ([3,id,<text shadow>]).
const isSpec = x => x && typeof x === 'object' && !Array.isArray(x) && typeof x.op === 'string';

// Coerce a value used in an input slot: bare numbers/strings become literal shadows,
// while specs (nested reporters) and already-encoded arrays pass through untouched.
const asInput = v => (typeof v === 'number' ? num(v) : typeof v === 'string' ? text(v) : v);

// Resolve one input value into sb3 input form, creating any nested blocks under
// `parentId`. Arrays are already-encoded literal shadows (e.g. num()/text()).
const resolveInput = (blocks, value, parentId) => {
    if (!isSpec(value)) return value;
    const id = nid();
    const blk = {
        opcode: value.op,
        next: null,
        parent: parentId,
        inputs: {},
        fields: value.fields || {},
        shadow: !!value.shadow,
        topLevel: false
    };
    blocks[id] = blk;
    for (const [k, v] of Object.entries(value.inputs || {})) {
        blk.inputs[k] = resolveInput(blocks, v, id);
    }
    if (value.menu) return [1, id];
    if (value.boolean) return [2, id];
    return [3, id, [10, '']];
};

// Build a script (a hat + linear stack). Each spec is {op, fields?, inputs?, sub?, sub2?};
// `inputs` values may be literal shadows or nested reporter/boolean/menu specs. `sub`
// fills SUBSTACK (e.g. forever/if), `sub2` fills SUBSTACK2 (if/else).
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
                inputs: {},
                fields: s.fields || {},
                shadow: false,
                topLevel: false
            };
            blocks[id] = blk;
            for (const [k, v] of Object.entries(s.inputs || {})) {
                blk.inputs[k] = resolveInput(blocks, v, id);
            }
            if (prev) blocks[prev].next = id;
            if (s.sub) blk.inputs.SUBSTACK = [2, chain(s.sub, id)];
            if (s.sub2) blk.inputs.SUBSTACK2 = [2, chain(s.sub2, id)];
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
const whenClicked = (...specs) => [{op: 'event_whenthisspriteclicked'}, ...specs];
const whenClone = (...specs) => [{op: 'control_start_as_clone'}, ...specs];

// More motion / looks / control / sensing helpers (each returns a stack-block spec,
// or a reporter/boolean spec for the conditions and value slots).
const setX = v => ({op: 'motion_setx', inputs: {X: num(v)}});
const setY = v => ({op: 'motion_sety', inputs: {Y: num(v)}});
const changeYBy = v => ({op: 'motion_changeyby', inputs: {DY: typeof v === 'number' ? num(v) : v}});
const pointDir = v => ({op: 'motion_pointindirection', inputs: {DIRECTION: num(v)}});
const turn = v => ({op: 'motion_turnright', inputs: {DEGREES: num(v)}});
const yPos = () => ({op: 'motion_yposition'});
const xPos = () => ({op: 'motion_xposition'});

const setSize = v => ({op: 'looks_setsizeto', inputs: {SIZE: num(v)}});
const changeSize = v => ({op: 'looks_changesizeby', inputs: {CHANGE: num(v)}});
const setEffect = (effect, v) => ({op: 'looks_seteffectto', fields: {EFFECT: [effect, null]}, inputs: {VALUE: num(v)}});
const changeEffect = (effect, v) => ({op: 'looks_changeeffectby', fields: {EFFECT: [effect, null]}, inputs: {CHANGE: num(v)}});
const clearEffects = () => ({op: 'looks_cleargraphiceffects'});
const show = () => ({op: 'looks_show'});
const hide = () => ({op: 'looks_hide'});
const say = msg => ({op: 'looks_say', inputs: {MESSAGE: text(msg)}});
const sayForSecs = (msg, secs) => ({op: 'looks_sayforsecs', inputs: {MESSAGE: text(msg), SECS: num(secs)}});

const wait = secs => ({op: 'control_wait', inputs: {DURATION: num(secs)}});
const ifThen = (cond, ...sub) => ({op: 'control_if', inputs: {CONDITION: cond}, sub});
const ifElse = (cond, subThen, subElse) => ({op: 'control_if_else', inputs: {CONDITION: cond}, sub: subThen, sub2: subElse});
const repeatUntil = (cond, ...sub) => ({op: 'control_repeat_until', inputs: {CONDITION: cond}, sub});
const createClone = () => ({
    op: 'control_create_clone_of',
    inputs: {CLONE_OPTION: {op: 'control_create_clone_of_menu', menu: true, shadow: true,
        fields: {CLONE_OPTION: ['_myself_', null]}}}
});
const deleteClone = () => ({op: 'control_delete_this_clone'});

// 3D Pop-Up rotation / movement / sensing helpers.
const setTilt = v => ({op: 'popup_setTilt', inputs: {ANGLE: num(v)}});
const changeTilt = v => ({op: 'popup_changeTilt', inputs: {ANGLE: num(v)}});
const setSpin = v => ({op: 'popup_setSpin', inputs: {ANGLE: typeof v === 'number' ? num(v) : v}});
const changeSpin = v => ({op: 'popup_changeSpin', inputs: {ANGLE: num(v)}});
const move3D = v => ({op: 'popup_move3D', inputs: {STEPS: num(v)}});
const touching3D = spriteName => ({
    op: 'popup_touchingSprite', boolean: true,
    inputs: {SPRITE: {op: 'popup_menu_spriteMenu', menu: true, shadow: true,
        fields: {spriteMenu: [spriteName, null]}}}
});

// Operators (boolean / value reporters) and variables.
const lt = (a, b) => ({op: 'operator_lt', boolean: true, inputs: {OPERAND1: asInput(a), OPERAND2: asInput(b)}});
const gt = (a, b) => ({op: 'operator_gt', boolean: true, inputs: {OPERAND1: asInput(a), OPERAND2: asInput(b)}});
const not = a => ({op: 'operator_not', boolean: true, inputs: {OPERAND: a}});
const mkVar = name => ({name, id: `var-${name}-${++idCounter}`});
const setVar = (v, value) => ({op: 'data_setvariableto', fields: {VARIABLE: [v.name, v.id]},
    inputs: {VALUE: typeof value === 'number' ? text(value) : value}});
const changeVar = (v, value) => ({op: 'data_changevariableby', fields: {VARIABLE: [v.name, v.id]}, inputs: {VALUE: num(value)}});
const varRep = v => ({op: 'data_variable', fields: {VARIABLE: [v.name, v.id]}});

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

// `vars`, when given, is a list of {name, id} (see mkVar); each becomes a sprite-local
// variable initialised to 0.
const sprite = (opts) => {
    const variables = {};
    for (const v of opts.vars || []) variables[v.id] = [v.name, 0];
    return {
        isStage: false,
        name: opts.name,
        variables, lists: {}, broadcasts: {}, blocks: opts.blocks || {}, comments: {},
        currentCostume: 0,
        costumes: [costume(`${opts.name}-costume`, opts.svg, opts.rcx, opts.rcy)],
        sounds: [], volume: 100, layerOrder: opts.layer,
        visible: true,
        x: opts.x || 0, y: opts.y || 0, size: opts.size || 100,
        direction: opts.direction || 90,
        draggable: false, rotationStyle: opts.rotationStyle || 'all around'
    };
};

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

// ---- example 7: 3D Platformer (gravity + jump between platforms in x/y/depth) ----
// A hopper with real gravity. Arrow keys walk (x) and step into/out of the scene
// (depth); space jumps. Platforms are clones placed at different x, y AND depth, so
// reaching them means lining up in all three axes before you leap. The clones inherit
// the platform's 3D thickness/depth (3D properties are inherited like size/direction).
const platformSlabSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="44" viewBox="0 0 150 44">
  <rect x="3" y="3" width="144" height="38" rx="10" fill="#8bd17c" stroke="#4f9a40" stroke-width="4"/>
  <rect x="3" y="3" width="144" height="14" rx="7" fill="#a7e29a"/></svg>`);
const platformBgSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#aee3ff"/><stop offset="1" stop-color="#e7f7ff"/></linearGradient></defs>
  <rect width="480" height="360" fill="url(#sky)"/>
  <circle cx="402" cy="70" r="40" fill="#fff3b0"/>
  <ellipse cx="120" cy="96" rx="48" ry="22" fill="#ffffff"/><ellipse cx="160" cy="104" rx="40" ry="18" fill="#ffffff"/>
  <ellipse cx="330" cy="150" rx="44" ry="20" fill="#ffffff"/></svg>`);

const platformBlocks = {};
// Place each platform, then clone. The clone keeps the position + 3D depth/thickness
// it was stamped with; the original hides once the three platforms exist.
buildScript(platformBlocks, flag(
    setThickness(30),
    gotoXY(-150, -120), setDepth(0), createClone(),
    gotoXY(25, -45), setDepth(60), createClone(),
    gotoXY(155, 25), setDepth(-60), createClone(),
    hide()
), 30, 30);
buildScript(platformBlocks, whenClone(show()), 320, 30);

const vy = mkVar('vy');
const heroBlocks = {};
buildScript(heroBlocks, flag(
    setThickness(20),
    setVar(vy, 0),
    gotoXY(-150, -70), setDepth(0),
    forever(
        // Gravity: accelerate downward, then move by the velocity.
        changeVar(vy, -1.5),
        changeYBy(varRep(vy)),
        // Landing: if we have sunk into a platform, stop falling and rise back to its top.
        ifThen(touching3D('Platform'),
            setVar(vy, 0),
            repeatUntil(not(touching3D('Platform')), changeYBy(3))
        ),
        // Fell past the bottom: respawn on the first platform.
        ifThen(lt(yPos(), -175),
            gotoXY(-150, -70), setDepth(0), setVar(vy, 0)
        )
    )
), 30, 30);
buildScript(heroBlocks, whenKey('right arrow', changeX(14)), 30, 230);
buildScript(heroBlocks, whenKey('left arrow', changeX(-14)), 30, 310);
buildScript(heroBlocks, whenKey('up arrow', changeDepth(20)), 30, 390);
buildScript(heroBlocks, whenKey('down arrow', changeDepth(-20)), 30, 470);
buildScript(heroBlocks, whenKey('space', setVar(vy, 18)), 30, 550);
const platformer = [
    stage(platformBgSVG, buildScript({}, flag(setSky('day'), setCamera('drag')), 30, 30)),
    sprite({
        name: 'Platform', svg: platformSlabSVG, rcx: 75, rcy: 22, x: -150, y: -120, size: 120,
        layer: 1, blocks: platformBlocks
    }),
    sprite({
        name: 'Hero', svg: hopperSVG, rcx: 40, rcy: 40, x: -150, y: -70, size: 80,
        layer: 2, vars: [vy], blocks: heroBlocks
    })
];

// ---- example 8: Birthday Card (text + animated effects + click to pop) -----------
// A greeting that sways and cycles colour, balloons that bob and pop when you click
// them, and a cake whose candle flickers and spins when clicked. Shows text in 3D,
// the colour/ghost/brightness effects, and "when this sprite clicked".
const greetingSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="460" height="96" viewBox="0 0 460 96">
  <text x="230" y="70" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
    font-size="64" font-weight="900" fill="#ff3d7f" stroke="#9b1b4d" stroke-width="3"
    paint-order="stroke">Happy Birthday!</text></svg>`);
const balloonSVG = color => reg(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120" viewBox="0 0 80 120">
  <path d="M40 88 L34 98 L46 98 Z" fill="${color}"/>
  <ellipse cx="40" cy="46" rx="36" ry="44" fill="${color}" stroke="#00000022" stroke-width="3"/>
  <ellipse cx="28" cy="32" rx="9" ry="13" fill="#ffffff" opacity="0.6"/>
  <path d="M40 98 q10 12 -2 22" stroke="#9aa0a6" stroke-width="2" fill="none"/></svg>`);
const cakeSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="140" height="120" viewBox="0 0 140 120">
  <rect x="18" y="58" width="104" height="50" rx="10" fill="#ffd9ec" stroke="#e98bbb" stroke-width="4"/>
  <rect x="18" y="58" width="104" height="16" fill="#ff9ecb"/>
  <rect x="64" y="22" width="12" height="34" fill="#ffe08a" stroke="#d9a93a" stroke-width="2"/>
  <ellipse cx="70" cy="16" rx="7" ry="11" fill="#ffb347"/><ellipse cx="70" cy="13" rx="3.5" ry="6" fill="#fff2b0"/>
  <g fill="#ff5fa2"><circle cx="40" cy="86" r="5"/><circle cx="70" cy="92" r="5"/><circle cx="100" cy="86" r="5"/></g></svg>`);
const confettiBgSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
  <defs><linearGradient id="party" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#fff0f7"/><stop offset="1" stop-color="#eef3ff"/></linearGradient></defs>
  <rect width="480" height="360" fill="url(#party)"/>
  <g opacity="0.85"><rect x="60" y="40" width="12" height="12" fill="#ff7ab6" transform="rotate(20 66 46)"/>
  <rect x="380" y="60" width="12" height="12" fill="#7ab6ff" transform="rotate(-15 386 66)"/>
  <rect x="150" y="90" width="10" height="10" fill="#ffd23f" transform="rotate(35 155 95)"/>
  <rect x="300" y="120" width="10" height="10" fill="#8bd17c" transform="rotate(-25 305 125)"/>
  <circle cx="430" cy="150" r="6" fill="#ff7ab6"/><circle cx="40" cy="160" r="6" fill="#7ab6ff"/></g></svg>`);

const greetingBlocks = {};
buildScript(greetingBlocks, flag(
    setThickness(16), setDepth(20), setSize(95),
    setEffect('ghost', 100),
    repeatN(10, changeEffect('ghost', -10)), // fade in
    forever(
        repeatN(15, changeSpin(1), changeEffect('color', 4)),
        repeatN(15, changeSpin(-1), changeEffect('color', 4))
    )
), 30, 30);

// One balloon: bobs forever; pops (grows + fades) when clicked.
const balloonBlocks = depth => {
    const b = {};
    buildScript(b, flag(
        setThickness(16), setDepth(depth),
        forever(repeatN(14, changeYBy(2)), repeatN(14, changeYBy(-2)))
    ), 30, 30);
    buildScript(b, whenClicked(
        sayForSecs('Pop!', 0.5),
        repeatN(8, changeSize(7), changeEffect('ghost', 12)),
        hide()
    ), 320, 30);
    return b;
};

const cakeBlocks = {};
buildScript(cakeBlocks, flag(
    setThickness(26), setDepth(0),
    forever(repeatN(10, changeEffect('brightness', 4)), repeatN(10, changeEffect('brightness', -4)))
), 30, 30);
buildScript(cakeBlocks, whenClicked(
    sayForSecs('Make a wish!', 1.2),
    repeatN(18, changeSpin(20))
), 320, 30);

const birthdayCard = [
    stage(confettiBgSVG, buildScript({}, flag(setSky('dream'), setCamera('drag')), 30, 30)),
    sprite({name: 'Greeting', svg: greetingSVG, rcx: 230, rcy: 48, x: 0, y: 96, size: 95,
        layer: 5, blocks: greetingBlocks}),
    sprite({name: 'Cake', svg: cakeSVG, rcx: 70, rcy: 60, x: 0, y: -120, size: 120,
        layer: 1, blocks: cakeBlocks}),
    sprite({name: 'RedBalloon', svg: balloonSVG('#ff5a6e'), rcx: 40, rcy: 46, x: -150, y: -10,
        size: 95, layer: 4, blocks: balloonBlocks(0)}),
    sprite({name: 'BlueBalloon', svg: balloonSVG('#4aa3ff'), rcx: 40, rcy: 46, x: 150, y: 25,
        size: 85, layer: 2, blocks: balloonBlocks(80)}),
    sprite({name: 'GreenBalloon', svg: balloonSVG('#5bd07e'), rcx: 40, rcy: 46, x: 70, y: -35,
        size: 90, layer: 3, blocks: balloonBlocks(-50)})
];

// ---- example 9: 3D Crystal (composite object beyond a single extrusion) ----------
// Extruding one flat diamond just gives a thick diamond. Here three copies of the
// diamond are spun to 0/60/120 degrees so the flat cards cross through a shared axis
// and read as a solid, faceted gem from every angle as the camera auto-orbits. A
// tilted halo ring and a spinning core add parts no single 2D shape could.
const crystalSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="84" height="150" viewBox="0 0 84 150">
  <polygon points="42,2 80,52 42,148 4,52" fill="#5fe0ff" stroke="#1b6f9b" stroke-width="3" stroke-linejoin="round"/>
  <polygon points="42,2 80,52 42,52 4,52" fill="#9af0ff"/>
  <polygon points="42,52 80,52 42,148" fill="#37b6e0"/></svg>`);
const haloSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="80" viewBox="0 0 220 80">
  <ellipse cx="110" cy="40" rx="104" ry="30" fill="none" stroke="#ffd23f" stroke-width="12"/>
  <ellipse cx="110" cy="40" rx="104" ry="30" fill="none" stroke="#fff0b0" stroke-width="4"/></svg>`);
const coreSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
  <polygon points="30,2 37,23 58,30 37,37 30,58 23,37 2,30 23,23"
    fill="#ffffff" stroke="#bfefff" stroke-width="2"/></svg>`);

const angle = mkVar('angle');
const crystalBlocks = {};
// Spawn three crossed copies of the gem (spin 0, 60, 120). Each clone inherits the
// spin it was created with, so together they form one volumetric crystal.
buildScript(crystalBlocks, flag(
    setThickness(8), setDepth(0), setSize(120), gotoXY(0, -10),
    setVar(angle, 0),
    repeatN(3,
        setSpin(varRep(angle)),
        createClone(),
        changeVar(angle, 60)
    ),
    hide()
), 30, 30);
buildScript(crystalBlocks, whenClone(show()), 320, 30);

const coreBlocks = {};
buildScript(coreBlocks, flag(
    setThickness(10), setDepth(0), setSize(70), gotoXY(0, -10),
    forever(changeSpin(3), changeTilt(2))
), 30, 30);

const haloBlocks = {};
buildScript(haloBlocks, flag(
    setThickness(6), setDepth(0), setSize(120), gotoXY(0, -36), setTilt(78),
    forever(changeSpin(2))
), 30, 30);

const crystal = [
    stage(spaceBgSVG, buildScript({}, flag(setSky('space'), setCamera('orbit')), 30, 30)),
    sprite({name: 'Halo', svg: haloSVG, rcx: 110, rcy: 40, x: 0, y: -36, size: 120,
        layer: 1, blocks: haloBlocks}),
    sprite({name: 'Crystal', svg: crystalSVG, rcx: 42, rcy: 75, x: 0, y: -10, size: 120,
        layer: 2, vars: [angle], blocks: crystalBlocks}),
    sprite({name: 'Core', svg: coreSVG, rcx: 30, rcy: 30, x: 0, y: -10, size: 70,
        layer: 3, blocks: coreBlocks})
];

Promise.resolve()
    .then(() => writeProject('popup-example-1.sb3', card))
    .then(() => writeProject('popup-example-2.sb3', tank))
    .then(() => writeProject('popup-example-3.sb3', forest))
    .then(() => writeProject('popup-example-4.sb3', spaceFlyer))
    .then(() => writeProject('popup-example-5.sb3', jumper))
    .then(() => writeProject('popup-example-6.sb3', garden))
    .then(() => writeProject('popup-example-7.sb3', platformer))
    .then(() => writeProject('popup-example-8.sb3', birthdayCard))
    .then(() => writeProject('popup-example-9.sb3', crystal));
