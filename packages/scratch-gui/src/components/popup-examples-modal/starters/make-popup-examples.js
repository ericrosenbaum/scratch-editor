/* eslint-disable */
// Generates the 3D Pop-Up example projects shown in the welcome modal:
//   popup-example-1.sb3   Pop-Up Card     (depth + drag camera)
//   popup-example-2.sb3   Fish Tank       (auto-spin + swimming fish)
//   popup-example-3.sb3   Build a Forest  (stamps a row of 3D trees)
//   popup-example-4.sb3   Space Flyer     (arrow keys fly in x + depth)
//   popup-example-5.sb3   Jump!           (arrow keys walk, space jumps)
//   popup-example-6.sb3   Magic Garden    (arrow keys move, space stamps flowers)
//   popup-example-7.sb3   3D Platformer   (gravity + jump up a tower to a flag; follow cam)
//   popup-example-8.sb3   Birthday Card   (text + animated effects + click to pop)
//   popup-example-9.sb3   3D Crystal      (crossed clones form one composite gem)
//   popup-example-10.sb3  Solar System    (planets orbit the sun in the ground plane)
//   popup-example-11.sb3  Gem Hunt        (a scored game: roam in 3D, collect gems)
//   popup-example-12.sb3  Carousel        (clones placed + revolved with "orbit")
//   popup-example-13.sb3  Platform Run    (an ascending, staggered trail of square
//                                          tiles along the depth axis; shoulder cam)
//   popup-example-14.sb3  Race Day        (first-person racing: a giant SVG track
//                                          map, spin steering, gates, trees, houses)
//   popup-example-15.sb3  Tiny Town       (an explorable town + forest of hidden
//                                          discoveries that talk when bumped)
//   popup-example-16.sb3  Robot Builder   (an articulated robot of jointed sprites;
//                                          keys move each part around its pivot)
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
// `set camera to follow [sprite]` — the 3D camera tracks and stays centred on the sprite.
const followCamera = spriteName => ({op: 'popup_followCamera',
    inputs: {SPRITE: {op: 'popup_menu_spriteMenu', menu: true, shadow: true,
        fields: {spriteMenu: [spriteName, null]}}}});
// `set camera behind [sprite]` — over-the-shoulder camera that looks along the sprite's
// spin heading, so turning the sprite turns the view the way it's about to move.
const cameraBehind = spriteName => ({op: 'popup_shoulderCamera',
    inputs: {SPRITE: {op: 'popup_menu_spriteMenu', menu: true, shadow: true,
        fields: {spriteMenu: [spriteName, null]}}}});
// 'shown' | 'hidden' — when hidden the sky shows behind the sprites instead of the backdrop.
const setBackdrop = visible => ({op: 'popup_setBackdrop', fields: {VISIBLE: [visible, null]}});
const setThickness = v => ({op: 'popup_setThickness', inputs: {AMOUNT: num(v)}});
const setDepth = v => ({op: 'popup_setDepth', inputs: {AMOUNT: asInput(v)}});
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
const setX = v => ({op: 'motion_setx', inputs: {X: typeof v === 'number' ? num(v) : v}});
const setY = v => ({op: 'motion_sety', inputs: {Y: typeof v === 'number' ? num(v) : v}});
const changeYBy = v => ({op: 'motion_changeyby', inputs: {DY: typeof v === 'number' ? num(v) : v}});
const changeXBy = v => ({op: 'motion_changexby', inputs: {DX: typeof v === 'number' ? num(v) : v}});
const pointDir = v => ({op: 'motion_pointindirection', inputs: {DIRECTION: num(v)}});
const turn = v => ({op: 'motion_turnright', inputs: {DEGREES: num(v)}});
const yPos = () => ({op: 'motion_yposition'});
const xPos = () => ({op: 'motion_xposition'});
const dirRep = () => ({op: 'motion_direction'});

// `key [key] pressed?` boolean — poll a key every frame (in a forever-if) for smooth,
// continuous movement, unlike the `when key pressed` hat which stutters on the OS repeat.
const keyPressed = key => ({op: 'sensing_keypressed', boolean: true,
    inputs: {KEY_OPTION: {op: 'sensing_keyoptions', menu: true, shadow: true,
        fields: {KEY_OPTION: [key, null]}}}});

const setSize = v => ({op: 'looks_setsizeto', inputs: {SIZE: num(v)}});
const changeSize = v => ({op: 'looks_changesizeby', inputs: {CHANGE: num(v)}});
const setEffect = (effect, v) => ({op: 'looks_seteffectto', fields: {EFFECT: [effect, null]}, inputs: {VALUE: num(v)}});
const changeEffect = (effect, v) => ({op: 'looks_changeeffectby', fields: {EFFECT: [effect, null]}, inputs: {CHANGE: num(v)}});
const clearEffects = () => ({op: 'looks_cleargraphiceffects'});
const show = () => ({op: 'looks_show'});
const hide = () => ({op: 'looks_hide'});
const say = msg => ({op: 'looks_say', inputs: {MESSAGE: asInput(msg)}});
const sayForSecs = (msg, secs) => ({op: 'looks_sayforsecs', inputs: {MESSAGE: asInput(msg), SECS: num(secs)}});

// The sensing timer: a reporter for elapsed seconds and a reset, for timing races.
const timerRep = () => ({op: 'sensing_timer'});
const resetTimer = () => ({op: 'sensing_resettimer'});

const wait = secs => ({op: 'control_wait', inputs: {DURATION: num(secs)}});
const ifThen = (cond, ...sub) => ({op: 'control_if', inputs: {CONDITION: cond}, sub});
const ifElse = (cond, subThen, subElse) => ({op: 'control_if_else', inputs: {CONDITION: cond}, sub: subThen, sub2: subElse});
const repeatUntil = (cond, ...sub) => ({op: 'control_repeat_until', inputs: {CONDITION: cond}, sub});
const waitUntil = cond => ({op: 'control_wait_until', inputs: {CONDITION: cond}});
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
const orbit = v => ({op: 'popup_orbit', inputs: {DEGREES: num(v)}});
const getDepth3D = () => ({op: 'popup_getDepth'});
const tiltRep = () => ({op: 'popup_getTilt'});
const changeDepthBy = v => ({op: 'popup_changeDepth', inputs: {AMOUNT: typeof v === 'number' ? num(v) : v}});
const touching3D = spriteName => ({
    op: 'popup_touchingSprite', boolean: true,
    inputs: {SPRITE: {op: 'popup_menu_spriteMenu', menu: true, shadow: true,
        fields: {spriteMenu: [spriteName, null]}}}
});

// Operators (boolean / value reporters) and variables.
const round = v => ({op: 'operator_round', inputs: {NUM: asInput(v)}});
const lt = (a, b) => ({op: 'operator_lt', boolean: true, inputs: {OPERAND1: asInput(a), OPERAND2: asInput(b)}});
const gt = (a, b) => ({op: 'operator_gt', boolean: true, inputs: {OPERAND1: asInput(a), OPERAND2: asInput(b)}});
const eq = (a, b) => ({op: 'operator_equals', boolean: true, inputs: {OPERAND1: asInput(a), OPERAND2: asInput(b)}});
const join = (a, b) => ({op: 'operator_join', inputs: {STRING1: asInput(a), STRING2: asInput(b)}});
const not = a => ({op: 'operator_not', boolean: true, inputs: {OPERAND: a}});
const and = (a, b) => ({op: 'operator_and', boolean: true, inputs: {OPERAND1: a, OPERAND2: b}});
const or = (a, b) => ({op: 'operator_or', boolean: true, inputs: {OPERAND1: a, OPERAND2: b}});
const mul = (a, b) => ({op: 'operator_multiply', inputs: {NUM1: asInput(a), NUM2: asInput(b)}});
const pickRandom = (a, b) => ({op: 'operator_random', inputs: {FROM: asInput(a), TO: asInput(b)}});
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

// `vars`, when given, is a list of {name, id} (see mkVar); each becomes a global
// (stage-scoped) variable initialised to 0, readable/writable by every sprite.
const stage = (backdropSvg, blocks, vars) => {
    const variables = {};
    for (const v of vars || []) variables[v.id] = [v.name, 0];
    return {
        isStage: true,
        name: 'Stage',
        variables, lists: {}, broadcasts: {}, blocks: blocks || {}, comments: {},
        currentCostume: 0,
        costumes: [costume('backdrop', backdropSvg, 240, 180)],
        sounds: [], volume: 100, layerOrder: 0,
        tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
    };
};

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

// A variable watcher shown on the stage. Monitors are DOM overlays drawn by the GUI on
// top of the stage, so (unlike `say` bubbles) they stay visible over the 3D view.
const varMonitor = (v, x, y) => ({
    id: v.id,
    mode: 'default',
    opcode: 'data_variable',
    params: {VARIABLE: v.name},
    spriteName: null,
    value: 0,
    width: 0,
    height: 0,
    x, y,
    visible: true,
    sliderMin: 0,
    sliderMax: 100,
    isDiscrete: true
});

const writeProject = (file, targets, monitors) => {
    const project = {
        targets,
        monitors: monitors || [],
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

// Mirror an SVG horizontally within its own viewBox. Used to make a left-facing library
// costume point right, so its "nose" is local +x and `move ... steps in 3D` (whose rest
// heading is +x) swims it forward instead of backward.
const flipSVGH = svg => {
    const vb = svg.match(/viewBox="\s*([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)/);
    const tx = (2 * parseFloat(vb[1])) + parseFloat(vb[3]); // 2*minX + width
    const open = svg.indexOf('>', svg.indexOf('<svg')) + 1;
    const close = svg.lastIndexOf('</svg>');
    return `${svg.slice(0, open)}<g transform="matrix(-1 0 0 1 ${tx} 0)">${svg.slice(open, close)}</g>${svg.slice(close)}`;
};

// Register a committed SVG asset file (e.g. a real costume pulled from the Scratch
// library and saved under starters/assets/) so it embeds in the project like any other.
// An optional transform (e.g. flipSVGH) is applied to the SVG text first.
const regFile = (name, transform) => {
    const raw = fs.readFileSync(path.join(__dirname, 'assets', name), 'utf8');
    return reg(transform ? transform(raw) : raw);
};

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

// Fish Tank stage backdrop. The 3D view hides it (see setBackdrop('hidden') below) so the
// underwater sky shows through, but the project still needs a stage costume for 2D/loading.
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
// Real fish costumes from the Scratch library swim in a backdrop-free tank (the
// underwater sky shows through). A sandy floor, coral and waving kelp dress the scene.
// Each fish glides slowly, wanders a little in all three axes, always stays upright,
// and at the side walls does a quick 180-degree spin instead of a hard bounce.

// Library fish costumes (saved under starters/assets/). `move ... steps in 3D` swims a
// sprite along its nose (local +x), so every fish must point right; the clownfish art
// points left, so we mirror it. The others already point right.
const fishClownSVG = regFile('fish-a.svg', flipSVGH);
const fishBlueSVG = regFile('fish-b.svg');
const fishBannerSVG = regFile('fish-c.svg');
const fishYellowSVG = regFile('fish-d.svg');

const sandSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="280" viewBox="0 0 480 280">
  <defs><linearGradient id="sd" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#f2e3ad"/><stop offset="1" stop-color="#d7bd6f"/></linearGradient></defs>
  <rect width="480" height="280" rx="36" fill="url(#sd)"/>
  <g fill="none" stroke="#caac5e" stroke-width="5" opacity="0.45" stroke-linecap="round">
  <path d="M30 80 q70 -22 140 0 t140 0 t140 0"/>
  <path d="M10 150 q80 24 160 0 t160 0"/>
  <path d="M40 215 q70 -20 140 0 t140 0"/></g>
  <g fill="#bfa253" opacity="0.5"><circle cx="90" cy="120" r="6"/><circle cx="300" cy="95" r="5"/>
  <circle cx="410" cy="185" r="6"/><circle cx="190" cy="205" r="5"/><circle cx="250" cy="150" r="4"/></g></svg>`);
const coralSVG = (c, a) => reg(`<svg xmlns="http://www.w3.org/2000/svg" width="130" height="140" viewBox="0 0 130 140">
  <g fill="${c}" stroke="${a}" stroke-width="3" stroke-linejoin="round">
  <path d="M30 138 C22 100 18 70 36 60 C50 52 52 82 48 138 Z"/>
  <path d="M60 138 C54 92 44 50 68 38 C88 28 86 72 82 138 Z"/>
  <path d="M94 138 C90 104 96 62 108 64 C122 66 112 106 110 138 Z"/></g>
  <g fill="#ffffff" opacity="0.5"><circle cx="40" cy="78" r="3.5"/><circle cx="68" cy="60" r="3.5"/>
  <circle cx="72" cy="92" r="3"/><circle cx="104" cy="86" r="3"/></g></svg>`);
const kelpSVG = c => reg(`<svg xmlns="http://www.w3.org/2000/svg" width="70" height="240" viewBox="0 0 70 240">
  <path d="M35 238 C18 200 52 178 32 138 C14 102 52 82 30 44 C20 24 42 10 36 2"
    fill="none" stroke="${c}" stroke-width="13" stroke-linecap="round"/>
  <g fill="${c}">
  <path d="M30 150 q-22 -6 -28 -26 q20 2 30 16 Z"/>
  <path d="M40 108 q22 -6 28 -24 q-20 1 -30 14 Z"/>
  <path d="M28 70 q-20 -4 -24 -22 q18 1 27 13 Z"/></g></svg>`);

// One kelp strand: rooted in the sand, swaying gently (a small spin oscillation, offset
// per strand by `phase` so they don't sway in unison).
const makeKelp = ({name, color, x, y, depth, size, phase, layer}) => sprite({
    name, svg: kelpSVG(color), rcx: 35, rcy: 120, x, y, size, layer,
    blocks: buildScript({}, flag(
        setThickness(8), gotoXY(x, y), setDepth(depth), setSpin(-8 + phase),
        forever(repeatN(24, changeSpin(0.5)), repeatN(24, changeSpin(-0.5)))
    ), 30, 30)
});

// One fish: swim across the tank with 2D `move` (steered by `direction`, which the
// "don't rotate" style keeps out of the rendered card), wander gently in y and depth,
// and always stay upright (tilt 0). On reaching a side wall the fish reverses its
// `direction` and does a quick 180-degree Y-axis spin — the spin is how the card
// visibly turns to face the way it now swims ("move in 3D" itself heads along the
// depth axis, so the swim is driven by 2D motion). `faceLeft` picks the starting side.
const makeFish = ({name, svg, x, y, depth, size, speed, faceLeft, layer}) => {
    const blocks = {};
    buildScript(blocks, flag(
        setThickness(12), setTilt(0), setSpin(faceLeft ? 180 : 0),
        pointDir(faceLeft ? -90 : 90),
        gotoXY(x, y), setDepth(depth),
        forever(
            move(speed),
            changeYBy(pickRandom(-1.4, 1.4)),
            changeDepthBy(pickRandom(-2.5, 2.5)),
            ifThen(gt(yPos(), 120), changeY(-3)),
            ifThen(lt(yPos(), -55), changeY(3)),
            ifThen(gt(getDepth3D(), 210), changeDepthBy(-4)),
            ifThen(lt(getDepth3D(), -110), changeDepthBy(4)),
            ifThen(or(gt(xPos(), 195), lt(xPos(), -195)),
                ifElse(gt(xPos(), 0), [pointDir(-90)], [pointDir(90)]), // swim back toward the middle
                repeatN(9, changeSpin(20)),   // quick about-face so the card faces its new heading
                repeatN(12, move(speed))      // glide clear of the wall before checking again
            )
        )
    ), 30, 30);
    return sprite({name, svg, rcx: 63, rcy: 45, x, y, size, layer, rotationStyle: "don't rotate", blocks});
};

const tank = [
    stage(tankBgSVG, buildScript({}, flag(setSky('underwater'), setCamera('drag'), setBackdrop('hidden')), 30, 30)),
    sprite({name: 'Sand', svg: sandSVG, rcx: 240, rcy: 140, x: 0, y: -132, size: 100, layer: 1,
        blocks: buildScript({}, flag(setThickness(12), setTilt(90), gotoXY(0, -132), setDepth(40)), 30, 30)}),
    sprite({name: 'Coral1', svg: coralSVG('#ff7eb6', '#cf4f8c'), rcx: 65, rcy: 70, x: -150, y: -92, size: 95,
        layer: 2, blocks: buildScript({}, flag(setThickness(16), gotoXY(-150, -92), setDepth(70)), 30, 30)}),
    sprite({name: 'Coral2', svg: coralSVG('#ffa94d', '#d97a2a'), rcx: 65, rcy: 70, x: 150, y: -98, size: 80,
        layer: 3, blocks: buildScript({}, flag(setThickness(14), gotoXY(150, -98), setDepth(25)), 30, 30)}),
    makeKelp({name: 'Kelp1', color: '#3fa34d', x: -205, y: -50, depth: 130, size: 110, phase: 0, layer: 4}),
    makeKelp({name: 'Kelp2', color: '#2c8f5a', x: 200, y: -45, depth: 100, size: 95, phase: 13, layer: 5}),
    makeFish({name: 'Clownfish', svg: fishClownSVG, x: -120, y: 30, depth: 30, size: 80, speed: 1, faceLeft: false, layer: 7}),
    makeFish({name: 'BlueTang', svg: fishBlueSVG, x: 130, y: -10, depth: 120, size: 90, speed: 0.8, faceLeft: true, layer: 8}),
    makeFish({name: 'BannerFish', svg: fishBannerSVG, x: 30, y: 70, depth: 70, size: 60, speed: 0.7, faceLeft: false, layer: 6}),
    makeFish({name: 'YellowTang', svg: fishYellowSVG, x: -40, y: -20, depth: 175, size: 70, speed: 0.9, faceLeft: true, layer: 9})
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

// ---- example 7: 3D Platformer (gravity + jump up a tower to a flag) ---------------
// A hopper with real gravity climbs a tower of floating platforms to a goal flag, while
// the 3D camera FOLLOWS it up (set camera to follow [Hero]). Three things make it play
// well:
//  - Controls are POLLED every frame in a `forever … if key pressed` loop (left/right
//    walk, up/down step into and out of the scene, space jumps). That is smooth, unlike
//    the `when key pressed` hat which stutters on the OS key-repeat delay.
//  - Landing no longer jitters: instead of rising in coarse 3px steps, the hero pops out
//    of a platform in 1px steps and then settles one step back onto the surface, so its
//    end-of-frame rest position is stable (no more bobbing on contact).
//  - A jump only fires when grounded, so you can't fly by holding space.
// Two extra ledges sit at front/back depths to explore by stepping in/out; the climb
// itself stays near depth 0 so it's always winnable. Reaching the flag sets the global
// "Win" flag (shown in a monitor and used by the beatable test) and plays a celebration.
const platformSlabSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="44" viewBox="0 0 150 44">
  <rect x="3" y="3" width="144" height="38" rx="10" fill="#8bd17c" stroke="#4f9a40" stroke-width="4"/>
  <rect x="3" y="3" width="144" height="14" rx="7" fill="#a7e29a"/></svg>`);
const goalFlagSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="130" viewBox="0 0 80 130">
  <rect x="12" y="6" width="8" height="118" rx="4" fill="#b9854f" stroke="#8a5f33" stroke-width="3"/>
  <path d="M20 12 L70 28 L20 46 Z" fill="#ff4d6d" stroke="#c2305c" stroke-width="3" stroke-linejoin="round"/>
  <polygon points="40,21 44,30 53,30 46,36 49,45 40,39 31,45 34,36 27,30 36,30"
    fill="#ffe14d" stroke="#d9a93a" stroke-width="1.5" stroke-linejoin="round"/>
  <ellipse cx="16" cy="124" rx="13" ry="4" fill="#000" opacity="0.18"/></svg>`);
const platformBgSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#aee3ff"/><stop offset="1" stop-color="#e7f7ff"/></linearGradient></defs>
  <rect width="480" height="360" fill="url(#sky)"/>
  <circle cx="402" cy="70" r="40" fill="#fff3b0"/>
  <ellipse cx="120" cy="96" rx="48" ry="22" fill="#ffffff"/><ellipse cx="160" cy="104" rx="40" ry="18" fill="#ffffff"/>
  <ellipse cx="330" cy="150" rx="44" ry="20" fill="#ffffff"/></svg>`);

// Tower of platforms [x, y, depth]. The first six zigzag up the centre, all at the same
// modest depth (26, just into the page) and wide enough to overlap x = 0, so a straight-up
// jump always lands on the next one. The hero stays at depth 0 (in front of them), so it's
// never buried in the stack — yet 26 < the ~31-unit landing tolerance, so it still lands.
// The last two are decorative ledges set far / near for parallax (explore by stepping
// in and out with the up/down arrows).
const CLIMB_DEPTH = 26;
const PLATFORMS = [
    [0, -125, CLIMB_DEPTH], [-50, -83, CLIMB_DEPTH], [45, -41, CLIMB_DEPTH],
    [-45, 1, CLIMB_DEPTH], [50, 43, CLIMB_DEPTH], [0, 85, CLIMB_DEPTH],
    [-95, -25, 140], [100, 20, -60]
];
const platformBlocks = {};
const placePlatforms = [setThickness(40)];
for (const [x, y, d] of PLATFORMS) placePlatforms.push(gotoXY(x, y), setDepth(d), createClone());
placePlatforms.push(hide()); // hide the original once every clone exists
buildScript(platformBlocks, flag(...placePlatforms), 30, 30);
buildScript(platformBlocks, whenClone(show()), 320, 30);

const vy = mkVar('vy'); // vertical velocity (hero-local)
const onGround = mkVar('onGround'); // 1 while standing on a platform (hero-local)
const won = mkVar('Win'); // 1 once the flag is reached (global: shared with Goal + monitor)
const heroBlocks = {};
buildScript(heroBlocks, flag(
    setThickness(22), setSize(75),
    setVar(won, 0), setVar(vy, 0), setVar(onGround, 0),
    gotoXY(0, -75), setDepth(0),
    forever(
        // Controls, polled every frame for smooth motion (frozen once you've won).
        ifThen(eq(varRep(won), 0),
            ifThen(keyPressed('right arrow'), changeX(7)),
            ifThen(keyPressed('left arrow'), changeX(-7)),
            ifThen(keyPressed('up arrow'), changeDepth(16)),
            ifThen(keyPressed('down arrow'), changeDepth(-16)),
            // Jump only from the ground (no mid-air jumps / flying).
            ifThen(and(keyPressed('space'), eq(varRep(onGround), 1)),
                setVar(vy, 13), setVar(onGround, 0))
        ),
        // Gravity, with a terminal velocity so a long fall can't tunnel through a slab.
        changeVar(vy, -1.2),
        ifThen(lt(varRep(vy), -14), setVar(vy, -14)),
        changeYBy(varRep(vy)),
        // Land: while falling/resting, pop up out of the slab in 1px steps, then settle
        // one step back onto its surface so the resting position is stable (no jitter).
        setVar(onGround, 0),
        ifThen(and(touching3D('Platform'), not(gt(varRep(vy), 0))),
            repeatUntil(not(touching3D('Platform')), changeYBy(1)),
            changeYBy(-1),
            setVar(vy, 0),
            setVar(onGround, 1)
        ),
        // Fell off the bottom: respawn at the start.
        ifThen(lt(yPos(), -175),
            gotoXY(0, -75), setDepth(0), setVar(vy, 0))
    )
), 30, 30);
// Reaching the flag wins. Touching it, or landing on the top platform (grounded and high
// up — so a mid-jump apex from a lower platform can't false-trigger), sets Win = 1 and
// the hero does a celebratory spin-and-grow.
buildScript(heroBlocks, flag(
    waitUntil(or(touching3D('Goal'), and(eq(varRep(onGround), 1), gt(yPos(), 120)))),
    setVar(won, 1),
    repeatN(18, changeSpin(10), changeEffect('color', 6), changeSize(2)),
    repeatN(18, changeSpin(10), changeEffect('color', 6), changeSize(-2)),
    setEffect('color', 0)
), 360, 30);

const goalBlocks = {};
buildScript(goalBlocks, flag(
    setThickness(18), setSize(95), setDepth(0),
    gotoXY(0, 120), show(),
    // Idle: bob gently until the player arrives.
    forever(ifThen(eq(varRep(won), 0),
        repeatN(16, changeYBy(0.7)),
        repeatN(16, changeYBy(-0.7))
    ))
), 30, 30);
buildScript(goalBlocks, flag(
    waitUntil(eq(varRep(won), 1)),
    setSky('dream'), // the sky bursts into colour to celebrate
    repeatN(24, changeSpin(12), changeEffect('color', 8), changeSize(2)),
    repeatN(24, changeSpin(12), changeEffect('color', 8), changeSize(-2))
), 360, 30);

const platformer = [
    stage(platformBgSVG, buildScript({}, flag(setSky('day'), followCamera('Hero')), 30, 30), [won]),
    sprite({
        name: 'Platform', svg: platformSlabSVG, rcx: 75, rcy: 22, x: 0, y: -125, size: 125,
        layer: 1, blocks: platformBlocks
    }),
    sprite({
        name: 'Goal', svg: goalFlagSVG, rcx: 40, rcy: 65, x: 0, y: 120, size: 95,
        layer: 3, blocks: goalBlocks
    }),
    sprite({
        name: 'Hero', svg: hopperSVG, rcx: 40, rcy: 40, x: 0, y: -75, size: 75,
        layer: 2, vars: [vy, onGround], blocks: heroBlocks
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

// ---- example 10: Solar System (planets orbit the sun via the `orbit` block) ------
// Each planet keeps its height and its face-on orientation while `orbit` walks it
// around the centre of the stage in the ground (x/depth) plane, the same plane the
// camera circles. Doing the same with `spin` + `move in 3D` would turn each planet
// edge-on at the sides; `orbit` is the simple primitive that makes a clean solar
// system possible. Faint flat rings (laid down with a 90-degree tilt) show the paths.
const sunSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <defs><radialGradient id="su" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0" stop-color="#fff6c8"/><stop offset="0.55" stop-color="#ffcf3f"/><stop offset="1" stop-color="#ff8a1e"/></radialGradient></defs>
  <circle cx="60" cy="60" r="52" fill="url(#su)" stroke="#ff7a00" stroke-width="4"/></svg>`);
const earthSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <defs><radialGradient id="ea" cx="0.38" cy="0.34" r="0.78">
  <stop offset="0" stop-color="#9fdcff"/><stop offset="1" stop-color="#1f6fd0"/></radialGradient></defs>
  <circle cx="50" cy="50" r="46" fill="url(#ea)" stroke="#124a8c" stroke-width="3"/>
  <path d="M26 42 q12 -10 24 -3 q12 7 3 17 q-11 8 -23 1 q-10 -6 -4 -15Z" fill="#4caf50" opacity="0.85"/>
  <path d="M60 66 q9 -5 17 2 q4 8 -6 12 q-11 2 -15 -6 q-2 -6 4 -8Z" fill="#4caf50" opacity="0.85"/></svg>`);
const marsSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="90" height="90" viewBox="0 0 90 90">
  <defs><radialGradient id="ma" cx="0.4" cy="0.35" r="0.75">
  <stop offset="0" stop-color="#ffb088"/><stop offset="1" stop-color="#c0451f"/></radialGradient></defs>
  <circle cx="45" cy="45" r="41" fill="url(#ma)" stroke="#7e2a13" stroke-width="3"/>
  <ellipse cx="34" cy="38" rx="8" ry="5" fill="#a83a1c" opacity="0.55"/>
  <ellipse cx="56" cy="57" rx="10" ry="6" fill="#a83a1c" opacity="0.5"/></svg>`);
const saturnSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="140" height="100" viewBox="0 0 140 100">
  <defs><radialGradient id="sa" cx="0.42" cy="0.36" r="0.72">
  <stop offset="0" stop-color="#ffe9b0"/><stop offset="1" stop-color="#caa24a"/></radialGradient></defs>
  <ellipse cx="70" cy="50" rx="58" ry="18" fill="none" stroke="#e7c87a" stroke-width="8"/>
  <ellipse cx="70" cy="50" rx="58" ry="18" fill="none" stroke="#fff0c0" stroke-width="3"/>
  <circle cx="70" cy="50" r="32" fill="url(#sa)" stroke="#a67c2e" stroke-width="3"/></svg>`);
const orbitRingSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
  <circle cx="110" cy="110" r="100" fill="none" stroke="#8a93e0" stroke-width="4"/></svg>`);

// One planet: start at radius R (offset around the ring by `startDeg`), then orbit forever.
const planetBlocks = (radius, startDeg, speed, thickness) => buildScript({}, flag(
    setThickness(thickness), setSize(100), gotoXY(radius, 0), setDepth(0),
    orbit(startDeg),
    forever(orbit(speed))
), 30, 30);
// One flat orbit ring laid in the ground plane, sized so its radius matches the planet.
const ringBlocks = radius => buildScript({}, flag(
    setThickness(4), setTilt(90), gotoXY(0, 0), setDepth(0), setSize(radius),
    setEffect('ghost', 55)
), 30, 30);
const solarSystem = [
    stage(spaceBgSVG, buildScript({}, flag(setSky('space'), setCamera('orbit'), setBackdrop('hidden')), 30, 30)),
    sprite({name: 'Ring1', svg: orbitRingSVG, rcx: 110, rcy: 110, x: 0, y: 0, size: 95,
        layer: 1, blocks: ringBlocks(95)}),
    sprite({name: 'Ring2', svg: orbitRingSVG, rcx: 110, rcy: 110, x: 0, y: 0, size: 150,
        layer: 2, blocks: ringBlocks(150)}),
    sprite({name: 'Ring3', svg: orbitRingSVG, rcx: 110, rcy: 110, x: 0, y: 0, size: 215,
        layer: 3, blocks: ringBlocks(215)}),
    sprite({name: 'Sun', svg: sunSVG, rcx: 60, rcy: 60, x: 0, y: 0, size: 110, layer: 4,
        blocks: buildScript({}, flag(
            setThickness(40), setDepth(0), gotoXY(0, 0),
            forever(repeatN(12, changeEffect('brightness', 2)), repeatN(12, changeEffect('brightness', -2)))
        ), 30, 30)}),
    sprite({name: 'Earth', svg: earthSVG, rcx: 50, rcy: 50, x: 95, y: 0, size: 100, layer: 5,
        blocks: planetBlocks(95, 0, 2.2, 16)}),
    sprite({name: 'Mars', svg: marsSVG, rcx: 45, rcy: 45, x: 150, y: 0, size: 100, layer: 6,
        blocks: planetBlocks(150, 120, 1.5, 14)}),
    sprite({name: 'Saturn', svg: saturnSVG, rcx: 70, rcy: 50, x: 215, y: 0, size: 100, layer: 7,
        blocks: planetBlocks(215, 240, 1.0, 12)})
];

// ---- example 11: Gem Hunt (a scored 3D game) -------------------------------------
// Roam the scene with the arrow keys (left/right move across; up/down step into and
// out of the page) and collect five gems scattered at different depths. Each gem is a
// clone that watches for the player with "touching ... in 3D?" and, when caught, adds
// to a global score and vanishes. The player announces the running total and a win.
const gemSVG = color => reg(`<svg xmlns="http://www.w3.org/2000/svg" width="70" height="80" viewBox="0 0 70 80">
  <polygon points="35,3 63,28 35,77 7,28" fill="${color}" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>
  <polygon points="35,3 63,28 35,28 7,28" fill="#ffffff" opacity="0.45"/>
  <polygon points="35,28 63,28 35,77" fill="#001018" opacity="0.14"/></svg>`);
const explorerSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="96" viewBox="0 0 80 96">
  <rect x="22" y="46" width="36" height="40" rx="12" fill="#ff8a3d" stroke="#c85a14" stroke-width="3"/>
  <circle cx="40" cy="30" r="22" fill="#ffd9a8" stroke="#c89a64" stroke-width="3"/>
  <path d="M16 30 a24 16 0 0 1 48 0 l-6 -2 a18 8 0 0 0 -36 0Z" fill="#5b3b1e"/>
  <circle cx="32" cy="31" r="3.4" fill="#222"/><circle cx="48" cy="31" r="3.4" fill="#222"/>
  <path d="M32 40 q8 6 16 0" stroke="#b06a3a" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`);

const score = mkVar('Gems');
const gemBlocks = {};
buildScript(gemBlocks, flag(
    setThickness(10), setSize(75), hide(),
    gotoXY(-170, -20), setDepth(70), createClone(),
    gotoXY(150, -20), setDepth(-40), createClone(),
    gotoXY(-55, -20), setDepth(220), createClone(),
    gotoXY(70, -20), setDepth(120), createClone(),
    gotoXY(190, -20), setDepth(280), createClone()
), 30, 30);
buildScript(gemBlocks, whenClone(
    show(),
    forever(
        changeSpin(6),
        ifThen(touching3D('Explorer'),
            changeVar(score, 1),
            hide(),
            deleteClone()
        )
    )
), 320, 30);

const explorerBlocks = {};
buildScript(explorerBlocks, flag(setThickness(22), setSize(95), gotoXY(0, -20), setDepth(0), setVar(score, 0)), 30, 30);
buildScript(explorerBlocks, whenKey('right arrow', changeX(24)), 30, 170);
buildScript(explorerBlocks, whenKey('left arrow', changeX(-24)), 30, 250);
buildScript(explorerBlocks, whenKey('up arrow', changeDepth(28)), 30, 330);
buildScript(explorerBlocks, whenKey('down arrow', changeDepth(-28)), 30, 410);
// The running total shows in the on-stage "Gems" monitor (see writeProject below).
// When all five are found, celebrate visibly: the sky bursts into colour and the
// explorer does a happy little grow (a `say` bubble would hide behind the 3D view).
buildScript(explorerBlocks, flag(
    waitUntil(eq(varRep(score), 5)),
    setSky('dream'),
    repeatN(20, changeEffect('color', 12), changeSize(2)),
    repeatN(20, changeEffect('color', 12), changeSize(-2))
), 320, 30);

const gemHunt = [
    stage(grassBgSVG, buildScript({}, flag(setSky('day'), setCamera('drag')), 30, 30), [score]),
    sprite({name: 'Explorer', svg: explorerSVG, rcx: 40, rcy: 48, x: 0, y: -20, size: 95,
        layer: 2, blocks: explorerBlocks}),
    sprite({name: 'Gem', svg: gemSVG('#7be0ff'), rcx: 35, rcy: 40, x: 0, y: -20, size: 75,
        layer: 1, blocks: gemBlocks})
];

// ---- example 12: Carousel (clones placed AND animated with `orbit`) ---------------
// `orbit` does double duty: it spaces six horses evenly around the centre when they
// are cloned (orbit 60 degrees between each), and it revolves them forever while they
// bob up and down. A flat striped roof and a wooden base (both laid down with a tilt)
// frame the ride; the camera auto-orbits around the whole thing.
const horseSVG = (body, accent) => reg(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="132" viewBox="0 0 120 132">
  <rect x="55" y="4" width="9" height="122" rx="4" fill="#ffd23f" stroke="#d99a00" stroke-width="2"/>
  <ellipse cx="60" cy="76" rx="40" ry="24" fill="${body}" stroke="${accent}" stroke-width="3"/>
  <path d="M90 66 q20 -8 16 -30 q-3 -12 -16 -9 q-9 2 -12 15 l3 24 Z" fill="${body}" stroke="${accent}" stroke-width="3"/>
  <path d="M88 36 q12 6 9 30" stroke="${accent}" stroke-width="7" fill="none" stroke-linecap="round"/>
  <circle cx="97" cy="42" r="3.2" fill="#3a2030"/>
  <rect x="42" y="94" width="8" height="30" rx="4" fill="#b9854f" stroke="#8a5f33" stroke-width="2"/>
  <rect x="72" y="94" width="8" height="30" rx="4" fill="#b9854f" stroke="#8a5f33" stroke-width="2"/>
  <rect x="48" y="58" width="28" height="15" rx="5" fill="#ffe08a" stroke="#d9a93a" stroke-width="2"/></svg>`);
const canopySVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
  <path d="M110 110 L210 110 A100 100 0 0 1 180.7 180.7 Z" fill="#ff6b6b"/>
  <path d="M110 110 L180.7 180.7 A100 100 0 0 1 110 210 Z" fill="#fff3e0"/>
  <path d="M110 110 L110 210 A100 100 0 0 1 39.3 180.7 Z" fill="#ff6b6b"/>
  <path d="M110 110 L39.3 180.7 A100 100 0 0 1 10 110 Z" fill="#fff3e0"/>
  <path d="M110 110 L10 110 A100 100 0 0 1 39.3 39.3 Z" fill="#ff6b6b"/>
  <path d="M110 110 L39.3 39.3 A100 100 0 0 1 110 10 Z" fill="#fff3e0"/>
  <path d="M110 110 L110 10 A100 100 0 0 1 180.7 39.3 Z" fill="#ff6b6b"/>
  <path d="M110 110 L180.7 39.3 A100 100 0 0 1 210 110 Z" fill="#fff3e0"/>
  <circle cx="110" cy="110" r="100" fill="none" stroke="#c0392b" stroke-width="4"/>
  <circle cx="110" cy="110" r="12" fill="#ffd23f" stroke="#d99a00" stroke-width="3"/></svg>`);
const baseDiscSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
  <circle cx="110" cy="110" r="100" fill="#caa46a" stroke="#8a5f33" stroke-width="6"/>
  <circle cx="110" cy="110" r="100" fill="none" stroke="#e6c98e" stroke-width="3"/>
  <circle cx="110" cy="110" r="62" fill="none" stroke="#b58b50" stroke-width="3"/></svg>`);

// A horse clone: appears, then revolves around the centre while bobbing up and down.
const horseRiderBlocks = (startDeg, body, accent) => {
    const b = {};
    buildScript(b, flag(
        setThickness(16), setSize(62), gotoXY(120, 0), setDepth(0),
        orbit(startDeg),
        createClone(), orbit(120),
        createClone(), orbit(120),
        createClone(),
        hide()
    ), 30, 30);
    buildScript(b, whenClone(
        show(),
        forever(
            repeatN(15, orbit(2), changeYBy(2)),
            repeatN(15, orbit(2), changeYBy(-2))
        )
    ), 320, 30);
    return b;
};
const carousel = [
    stage(grassBgSVG, buildScript({}, flag(setSky('sunset'), setCamera('orbit'), setBackdrop('hidden')), 30, 30)),
    sprite({name: 'Base', svg: baseDiscSVG, rcx: 110, rcy: 110, x: 0, y: -95, size: 150,
        layer: 1, blocks: buildScript({}, flag(setThickness(10), setTilt(90), gotoXY(0, -95), setDepth(0)), 30, 30)}),
    sprite({name: 'Canopy', svg: canopySVG, rcx: 110, rcy: 110, x: 0, y: 95, size: 150,
        layer: 2, blocks: buildScript({}, flag(setThickness(10), setTilt(90), gotoXY(0, 95), setDepth(0)), 30, 30)}),
    sprite({name: 'HorseA', svg: horseSVG('#ff9ecb', '#c2305c'), rcx: 60, rcy: 76, x: 120, y: 0, size: 62,
        layer: 4, blocks: horseRiderBlocks(0, '#ff9ecb', '#c2305c')}),
    sprite({name: 'HorseB', svg: horseSVG('#8fd0ff', '#1c6fd0'), rcx: 60, rcy: 76, x: 120, y: 0, size: 62,
        layer: 3, blocks: horseRiderBlocks(60, '#8fd0ff', '#1c6fd0')})
];

// ---- example 13: Platform Run (an ascending trail of tiles; over-the-shoulder cam) --
// A platformer built along the DEPTH axis: square tiles laid flat (tilt 90) climb
// gradually away from the start, staggered left and right, from depth 0 out to depth
// -2280 — far past the old sprite fence (fencing defaults to off while the extension
// is loaded, and the depth range is wide enough for the whole trail). "move in 3D"
// carries the hero forward along the depth axis (toward the camera at rest), and the
// over-the-shoulder camera (`set camera behind`) rides behind the hero looking down
// the trail, so the tiles recede into the distance ahead.
//
// The layout and physics (run 8/frame, jump velocity 15, 380-unit tile spacing,
// 20-unit ascent per tile) were chosen by simulating the exact loop below
// frame-by-frame over a range of plausible hero hitbox sizes: holding up+space always
// reaches the goal (a fall respawns you at the last tile you stood on, never the
// start; at most one fall in simulation), while holding up WITHOUT jumping always
// falls in — the gaps are real, but every jump is makeable. Playability is enforced
// end-to-end by test/playwright/popup-platform-run-beatable.spec.js.
const runTileSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150">
  <rect x="3" y="3" width="144" height="144" rx="14" fill="#8bd17c" stroke="#4f9a40" stroke-width="5"/>
  <rect x="18" y="18" width="114" height="114" rx="9" fill="#a7e29a" opacity="0.7"/></svg>`);
// Tiles: [x, y, depth]. Depth steps away by 380 per tile, y ascends 20 per tile, and
// x staggers left/right by 55 (well within the tile's ~94-unit half-width, so running
// straight up the middle still lands — sidestep with the arrows to stay centred).
const RUN_TILES = [
    [0, -125, 0], [55, -105, -380], [-55, -85, -760], [55, -65, -1140],
    [-55, -45, -1520], [55, -25, -1900], [-55, -5, -2280]
];
const RUN_GOAL = RUN_TILES[RUN_TILES.length - 1];
const runPlatformBlocks = {};
// Tiles lie flat (tilt 90), so each card's 150x150 face becomes a square floor slab.
const placeRunPlatforms = [setThickness(40), setTilt(90)];
for (const [x, y, d] of RUN_TILES) placeRunPlatforms.push(gotoXY(x, y), setDepth(d), createClone());
placeRunPlatforms.push(hide()); // hide the original once every clone exists
buildScript(runPlatformBlocks, flag(...placeRunPlatforms), 30, 30);
buildScript(runPlatformBlocks, whenClone(show()), 320, 30);

const runVy = mkVar('vy'); // vertical velocity (hero-local)
const runOnGround = mkVar('onGround'); // 1 while standing on a tile (hero-local)
const runCheckpointX = mkVar('checkpoint x'); // where the hero last stood (hero-local)
const runCheckpointY = mkVar('checkpoint y');
const runCheckpointD = mkVar('checkpoint depth');
const runWon = mkVar('Win'); // 1 once the goal is reached (global: shared with Goal + monitor)
const runHeroBlocks = {};
buildScript(runHeroBlocks, flag(
    setThickness(22), setSize(75),
    setVar(runWon, 0), setVar(runVy, 0), setVar(runOnGround, 0),
    setVar(runCheckpointX, 0), setVar(runCheckpointY, -35), setVar(runCheckpointD, 0),
    gotoXY(0, -75), setDepth(0), setSpin(0),
    forever(
        // Controls, polled every frame (frozen once you've won). Up runs forward
        // along the depth axis — the way the hero faces, straight down the trail the
        // shoulder camera looks along — and left/right sidestep onto the staggered
        // tiles. Down backs up.
        ifThen(eq(varRep(runWon), 0),
            ifThen(keyPressed('up arrow'), move3D(8)),
            ifThen(keyPressed('down arrow'), move3D(-8)),
            ifThen(keyPressed('right arrow'), changeX(8)),
            ifThen(keyPressed('left arrow'), changeX(-8)),
            // Jump only from the ground (no mid-air jumps / flying).
            ifThen(and(keyPressed('space'), eq(varRep(runOnGround), 1)),
                setVar(runVy, 15), setVar(runOnGround, 0))
        ),
        // Gravity, with a terminal velocity so a long fall can't tunnel through a tile.
        changeVar(runVy, -1.2),
        ifThen(lt(varRep(runVy), -14), setVar(runVy, -14)),
        changeYBy(varRep(runVy)),
        // Land: while falling/resting, pop up out of the tile in 1px steps, then settle
        // one step back onto its surface. Each landing records a checkpoint.
        setVar(runOnGround, 0),
        ifThen(and(touching3D('Platform'), not(gt(varRep(runVy), 0))),
            repeatUntil(not(touching3D('Platform')), changeYBy(1)),
            changeYBy(-1),
            setVar(runVy, 0),
            setVar(runOnGround, 1),
            setVar(runCheckpointX, xPos()),
            setVar(runCheckpointY, yPos()),
            setVar(runCheckpointD, getDepth3D())
        ),
        // Fell into a gap: respawn just above the last tile you stood on.
        ifThen(lt(yPos(), -175),
            setX(varRep(runCheckpointX)), setY(varRep(runCheckpointY)), changeYBy(40),
            setDepth(varRep(runCheckpointD)), setVar(runVy, 0))
    )
), 30, 30);
// Reaching the goal wins: touching the flag, or landing on the last tile (grounded
// and far enough out along the trail), sets Win = 1 and the hero does a celebratory
// spin.
buildScript(runHeroBlocks, flag(
    waitUntil(or(touching3D('Goal'), and(eq(varRep(runOnGround), 1), lt(getDepth3D(), RUN_GOAL[2] + 50)))),
    setVar(runWon, 1),
    repeatN(18, changeSpin(20), changeEffect('color', 6), changeSize(2)),
    repeatN(18, changeSpin(20), changeEffect('color', 6), changeSize(-2)),
    setEffect('color', 0)
), 360, 30);

const runGoalBlocks = {};
buildScript(runGoalBlocks, flag(
    // The flag stands on the last tile (its top is at y 15), spun 180 so its front
    // face greets the hero approaching from the near side of the trail.
    setThickness(18), setSize(95), setSpin(180),
    gotoXY(RUN_GOAL[0], 76), setDepth(RUN_GOAL[2]), show(),
    // Idle: bob gently until the player arrives.
    forever(ifThen(eq(varRep(runWon), 0),
        repeatN(16, changeYBy(0.7)),
        repeatN(16, changeYBy(-0.7))
    ))
), 30, 30);
buildScript(runGoalBlocks, flag(
    waitUntil(eq(varRep(runWon), 1)),
    setSky('dream'), // the sky bursts into colour to celebrate
    repeatN(24, changeSpin(12), changeEffect('color', 8), changeSize(2)),
    repeatN(24, changeSpin(12), changeEffect('color', 8), changeSize(-2))
), 360, 30);

const platformRun = [
    stage(platformBgSVG,
        buildScript({}, flag(setSky('day'), setBackdrop('hidden'), cameraBehind('Hero')), 30, 30),
        [runWon]),
    sprite({
        name: 'Platform', svg: runTileSVG, rcx: 75, rcy: 75, x: 0, y: -125, size: 125,
        layer: 1, blocks: runPlatformBlocks
    }),
    sprite({
        name: 'Goal', svg: goalFlagSVG, rcx: 40, rcy: 65, x: RUN_GOAL[0], y: 76, size: 95,
        layer: 3, blocks: runGoalBlocks
    }),
    sprite({
        name: 'Hero', svg: hopperSVG, rcx: 40, rcy: 40, x: 0, y: -75, size: 75,
        layer: 2, vars: [runVy, runOnGround, runCheckpointX, runCheckpointY, runCheckpointD],
        blocks: runHeroBlocks
    })
];

// ---- example 14: Race Day (first-person racing on a giant track map) --------------
// A driving game seen from behind the wheel-ish: the whole race track is ONE SVG
// drawing (1920x1440 — four stage-widths of map) laid flat with tilt -90 (front face
// up, so the drawing reads unmirrored from above), and the car drives around on top
// of it with "move in 3D", steering by changing its spin. The over-the-shoulder
// camera rides behind the car and turns with the spin, so steering swings the whole
// view around the track. Crossed-card trees (two clones at spin 0/90 so they read as
// solid from every angle) and thick extruded houses dot the map, and four checkered
// gates stand across the road: drive through all four to finish the lap, and the
// timer shows how fast you were. All of this lives far outside the old stage bounds,
// which is exactly what unfenced sprites + the wide depth range are for.
const raceTrackSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1440" viewBox="0 0 1920 1440">
  <rect width="1920" height="1440" fill="#7cc95f"/>
  <ellipse cx="960" cy="720" rx="480" ry="280" fill="#8fd472"/>
  <ellipse cx="700" cy="640" rx="60" ry="24" fill="#6ab34d"/>
  <ellipse cx="1240" cy="820" rx="80" ry="30" fill="#6ab34d"/>
  <rect x="280" y="280" width="1360" height="880" rx="360" fill="none" stroke="#ffffff" stroke-width="238"/>
  <rect x="280" y="280" width="1360" height="880" rx="360" fill="none" stroke="#e04040" stroke-width="238" stroke-dasharray="70 70"/>
  <rect x="280" y="280" width="1360" height="880" rx="360" fill="none" stroke="#5a5f6a" stroke-width="220"/>
  <rect x="280" y="280" width="1360" height="880" rx="360" fill="none" stroke="#ffffff" stroke-width="7" stroke-dasharray="48 38"/>
  <g transform="translate(936,1050)">
    <rect width="48" height="220" fill="#ffffff"/>
    <rect x="0" y="0" width="24" height="28" fill="#111"/><rect x="24" y="28" width="24" height="28" fill="#111"/>
    <rect x="0" y="56" width="24" height="28" fill="#111"/><rect x="24" y="84" width="24" height="28" fill="#111"/>
    <rect x="0" y="112" width="24" height="28" fill="#111"/><rect x="24" y="140" width="24" height="28" fill="#111"/>
    <rect x="0" y="168" width="24" height="28" fill="#111"/><rect x="24" y="196" width="24" height="24" fill="#111"/>
  </g></svg>`);
const raceCarSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="90" height="64" viewBox="0 0 90 64">
  <rect x="8" y="50" width="18" height="13" rx="4" fill="#26282e"/>
  <rect x="64" y="50" width="18" height="13" rx="4" fill="#26282e"/>
  <path d="M14 54 Q13 32 24 27 L66 27 Q77 32 76 54 Z" fill="#e04040" stroke="#9b1f1f" stroke-width="3"/>
  <rect x="23" y="13" width="44" height="18" rx="7" fill="#e04040" stroke="#9b1f1f" stroke-width="3"/>
  <rect x="29" y="17" width="32" height="10" rx="4" fill="#9fd8ff"/>
  <rect x="8" y="6" width="74" height="8" rx="4" fill="#9b1f1f"/>
  <rect x="14" y="12" width="7" height="10" fill="#9b1f1f"/><rect x="69" y="12" width="7" height="10" fill="#9b1f1f"/>
  <rect x="17" y="44" width="15" height="7" rx="3" fill="#ffd23f"/>
  <rect x="58" y="44" width="15" height="7" rx="3" fill="#ffd23f"/></svg>`);
const houseSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="140" height="110" viewBox="0 0 140 110">
  <rect x="12" y="46" width="116" height="60" fill="#f2d29b" stroke="#b98d55" stroke-width="4"/>
  <polygon points="6,50 70,6 134,50" fill="#c1553f" stroke="#8f3a2a" stroke-width="4"/>
  <rect x="60" y="70" width="24" height="36" fill="#7a4a1e"/>
  <rect x="26" y="58" width="22" height="20" fill="#9fd8ff" stroke="#5c86a8" stroke-width="3"/>
  <rect x="92" y="58" width="22" height="20" fill="#9fd8ff" stroke="#5c86a8" stroke-width="3"/></svg>`);
const raceGateSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="130" viewBox="0 0 240 130">
  <rect x="4" y="8" width="12" height="122" rx="4" fill="#8a5f33"/>
  <rect x="224" y="8" width="12" height="122" rx="4" fill="#8a5f33"/>
  <rect x="4" y="8" width="232" height="36" fill="#ffffff" stroke="#26282e" stroke-width="4"/>
  <rect x="8" y="12" width="28" height="14" fill="#111"/><rect x="36" y="26" width="28" height="14" fill="#111"/>
  <rect x="64" y="12" width="28" height="14" fill="#111"/><rect x="92" y="26" width="28" height="14" fill="#111"/>
  <rect x="120" y="12" width="28" height="14" fill="#111"/><rect x="148" y="26" width="28" height="14" fill="#111"/>
  <rect x="176" y="12" width="28" height="14" fill="#111"/><rect x="204" y="26" width="28" height="14" fill="#111"/></svg>`);

// The track map is centred 440 into the page, so the start/finish line (bottom
// centre of the drawing) sits at depth 0 where the car spawns. The road is a rounded
// rectangle: straights at depth 0 / 880 (along x) and at x = +/-680 (along depth),
// each 220 units wide. The lap runs start -> G1 -> G2 -> G3 -> G4 -> start.
const RACE_GATES = [
    [-400, 0, 90], [-680, 440, 0], [0, 880, 90], [680, 440, 0] // [x, depth, spin]
];
const RACE_TREES = [ // [x, depth]: some in the infield, some outside the ring
    [-350, 300], [350, 620], [0, 300], [200, 740],
    [-820, 100], [850, 800], [-800, 750], [900, 150]
];
const RACE_HOUSES = [ // [x, depth, spin]: all outside the ring
    [-850, 420, 60], [880, 460, -60], [-250, 1020, 0], [420, -140, 180]
];
const raceGates = mkVar('Gates'); // global: gates passed so far (monitor + win check)
const raceTime = mkVar('Time'); // global: finishing time in seconds (monitor)
const raceWon = mkVar('Win'); // global: 1 once all gates are passed

// The ground: one giant flat card. tilt -90 (not 90) so the card's FRONT face points
// up and the track drawing reads unmirrored from above.
const raceTrackBlocks = {};
buildScript(raceTrackBlocks, flag(
    setThickness(10), setTilt(-90), setSpin(0), gotoXY(0, -60), setDepth(440)
), 30, 30);

// Gates: each clone stands across the road (spun to match its straight) and counts
// itself once when the car drives through, then disappears.
const raceGateBlocks = {};
const placeRaceGates = [setVar(raceGates, 0), setThickness(12)];
for (const [x, d, spin] of RACE_GATES) {
    placeRaceGates.push(gotoXY(x, 10), setDepth(d), setSpin(spin), createClone());
}
placeRaceGates.push(hide()); // hide the original once every clone exists
buildScript(raceGateBlocks, flag(...placeRaceGates), 30, 30);
buildScript(raceGateBlocks, whenClone(
    show(),
    waitUntil(touching3D('Car')),
    changeVar(raceGates, 1),
    hide()
), 320, 30);

// Trees: two crossed clones (spin 0 + spin 90) per spot, so each tree reads as a
// solid shape from every direction as the car drives past.
const raceTreeBlocks = {};
const placeRaceTrees = [setThickness(10), setSize(130)];
for (const [x, d] of RACE_TREES) {
    placeRaceTrees.push(gotoXY(x, 23), setDepth(d), setSpin(0), createClone(), setSpin(90), createClone());
}
placeRaceTrees.push(hide());
buildScript(raceTreeBlocks, flag(...placeRaceTrees), 30, 30);
buildScript(raceTreeBlocks, whenClone(show()), 320, 30);

// Houses: thick extrusions (boxy volumes), one clone per spot at assorted spins.
const raceHouseBlocks = {};
const placeRaceHouses = [setThickness(60), setSize(120)];
for (const [x, d, spin] of RACE_HOUSES) {
    placeRaceHouses.push(gotoXY(x, 11), setDepth(d), setSpin(spin), createClone());
}
placeRaceHouses.push(hide());
buildScript(raceHouseBlocks, flag(...placeRaceHouses), 30, 30);
buildScript(raceHouseBlocks, whenClone(show()), 320, 30);

// The car: drive with "move in 3D" and steer by changing spin — the shoulder camera
// follows the spin, so the view sweeps around the track as you turn. It starts on
// the finish line facing down the bottom straight (spin -90 heads -x).
const raceCarBlocks = {};
buildScript(raceCarBlocks, flag(
    setThickness(16), setSize(100),
    setVar(raceWon, 0), setVar(raceTime, 0),
    gotoXY(0, -25), setDepth(0), setSpin(-90), setTilt(0),
    resetTimer(),
    forever(
        ifThen(eq(varRep(raceWon), 0),
            ifThen(keyPressed('up arrow'), move3D(10)),
            ifThen(keyPressed('down arrow'), move3D(-5)),
            ifThen(keyPressed('right arrow'), changeSpin(-4)),
            ifThen(keyPressed('left arrow'), changeSpin(4))
        )
    )
), 30, 30);
// Passing all four gates finishes the lap: record the time and do a victory spin
// (the camera whirls all the way around with it).
buildScript(raceCarBlocks, flag(
    waitUntil(eq(varRep(raceGates), 4)),
    setVar(raceTime, round(timerRep())),
    setVar(raceWon, 1),
    repeatN(18, changeSpin(20), changeEffect('color', 6)),
    setEffect('color', 0)
), 360, 30);

const raceDay = [
    stage(platformBgSVG,
        buildScript({}, flag(setSky('day'), setBackdrop('hidden'), cameraBehind('Car')), 30, 30),
        [raceGates, raceTime, raceWon]),
    sprite({
        name: 'Track', svg: raceTrackSVG, rcx: 960, rcy: 720, x: 0, y: -60, size: 100,
        layer: 1, blocks: raceTrackBlocks
    }),
    sprite({
        name: 'Gate', svg: raceGateSVG, rcx: 120, rcy: 65, x: -400, y: 10, size: 100,
        layer: 2, blocks: raceGateBlocks
    }),
    sprite({
        name: 'Tree', svg: treeSVG, rcx: 45, rcy: 60, x: -350, y: 23, size: 130,
        layer: 3, blocks: raceTreeBlocks
    }),
    sprite({
        name: 'House', svg: houseSVG, rcx: 70, rcy: 55, x: -850, y: 11, size: 120,
        layer: 4, blocks: raceHouseBlocks
    }),
    sprite({
        name: 'Car', svg: raceCarSVG, rcx: 45, rcy: 32, x: 0, y: -25, size: 100,
        layer: 5, blocks: raceCarBlocks
    })
];

// ---- example 15: Tiny Town (an explorable town + forest full of discoveries) ------
// A little open world: one giant map SVG (grass, a dirt path, a town plaza, a pond
// and a forest floor) laid flat, a town of houses on one side, a forest of
// crossed-card trees on the other, and eight small discoveries hidden around the
// world. You drop in knowing nothing; walk around (up walks the way you face,
// left/right turn — the shoulder camera turns with you) and bump into things to see
// what they are: each discovery SAYS something when the Scratch Cat touches it, with
// its speech bubble anchored in screen space to its projected 3D position (the
// runtime's bubblePositionProvider, fed by the scene). A "Found" counter ticks up
// the first time you meet each one; find all eight and the cat celebrates. The cat
// itself is the real Scratch library costume (committed under assets/), per the
// use-library-art-where-possible rule; the CDN isn't reachable from this repo so the
// other props are hand-drawn in the same style as the rest of the examples.
const catSVG = regFile('cat-a.svg');
const townMapSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1440" viewBox="0 0 1920 1440">
  <rect width="1920" height="1440" fill="#7cc95f"/>
  <ellipse cx="430" cy="600" rx="500" ry="520" fill="#5fae4b"/>
  <ellipse cx="1610" cy="310" rx="160" ry="95" fill="#6ec6e8" stroke="#4a9fc4" stroke-width="8"/>
  <circle cx="1380" cy="640" r="175" fill="#d9c9a3" stroke="#c4b28a" stroke-width="10"/>
  <path d="M960 1160 Q 990 900 1180 780 T 1380 640 M1230 750 Q 950 690 640 620"
    fill="none" stroke="#d2b48c" stroke-width="70" stroke-linecap="round"/>
  <g fill="#ffffff"><circle cx="1120" cy="1050" r="9"/><circle cx="820" cy="1100" r="9"/>
  <circle cx="1500" cy="900" r="9"/><circle cx="1050" cy="500" r="9"/></g>
  <g fill="#ffd23f"><circle cx="1120" cy="1050" r="4"/><circle cx="820" cy="1100" r="4"/>
  <circle cx="1500" cy="900" r="4"/><circle cx="1050" cy="500" r="4"/></g></svg>`);
const signSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="70" height="110" viewBox="0 0 70 110">
  <rect x="31" y="30" width="8" height="78" rx="3" fill="#8a5f33"/>
  <rect x="4" y="6" width="62" height="26" rx="6" fill="#d9a55b" stroke="#8a5f33" stroke-width="4"/>
  <rect x="10" y="38" width="50" height="22" rx="5" fill="#d9a55b" stroke="#8a5f33" stroke-width="4"/>
  <rect x="12" y="14" width="46" height="4" rx="2" fill="#8a5f33"/>
  <rect x="16" y="22" width="38" height="4" rx="2" fill="#8a5f33"/>
  <rect x="18" y="46" width="34" height="4" rx="2" fill="#8a5f33"/></svg>`);
const fountainSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="140" height="110" viewBox="0 0 140 110">
  <ellipse cx="70" cy="92" rx="64" ry="16" fill="#b9c2cc" stroke="#8a949e" stroke-width="4"/>
  <ellipse cx="70" cy="86" rx="50" ry="11" fill="#6ec6e8"/>
  <rect x="62" y="40" width="16" height="42" fill="#b9c2cc" stroke="#8a949e" stroke-width="3"/>
  <ellipse cx="70" cy="38" rx="26" ry="8" fill="#b9c2cc" stroke="#8a949e" stroke-width="3"/>
  <path d="M70 30 Q 60 12 48 22 M70 30 Q 70 8 70 18 M70 30 Q 80 12 92 22"
    fill="none" stroke="#9fd8ff" stroke-width="5" stroke-linecap="round"/></svg>`);
const mailboxSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="95" viewBox="0 0 60 95">
  <rect x="26" y="44" width="8" height="50" rx="3" fill="#8a5f33"/>
  <rect x="6" y="12" width="48" height="34" rx="12" fill="#e04040" stroke="#9b1f1f" stroke-width="4"/>
  <rect x="12" y="24" width="36" height="4" rx="2" fill="#ffffff"/>
  <rect x="46" y="2" width="5" height="18" fill="#ffd23f"/><rect x="42" y="2" width="14" height="6" fill="#ffd23f"/></svg>`);
const duckSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="70" height="60" viewBox="0 0 70 60">
  <ellipse cx="32" cy="42" rx="26" ry="16" fill="#ffd23f" stroke="#d9a93a" stroke-width="3"/>
  <circle cx="50" cy="22" r="13" fill="#ffd23f" stroke="#d9a93a" stroke-width="3"/>
  <polygon points="61,20 70,24 61,28" fill="#f28d2e"/>
  <circle cx="53" cy="19" r="2.5" fill="#26282e"/>
  <path d="M14 40 Q 6 42 10 48" fill="none" stroke="#d9a93a" stroke-width="3"/></svg>`);
const mushroomSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="70" height="60" viewBox="0 0 70 60">
  <rect x="26" y="30" width="18" height="26" rx="7" fill="#f6ead0" stroke="#cbb890" stroke-width="3"/>
  <path d="M4 32 Q 35 -14 66 32 Z" fill="#e04040" stroke="#9b1f1f" stroke-width="3"/>
  <circle cx="22" cy="20" r="5" fill="#ffffff"/><circle cx="42" cy="12" r="4" fill="#ffffff"/>
  <circle cx="52" cy="24" r="4" fill="#ffffff"/>
  <circle cx="31" cy="40" r="2" fill="#26282e"/><circle cx="39" cy="40" r="2" fill="#26282e"/>
  <path d="M31 47 Q 35 50 39 47" fill="none" stroke="#26282e" stroke-width="2" stroke-linecap="round"/></svg>`);
const gnomeSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="90" viewBox="0 0 60 90">
  <circle cx="30" cy="18" r="13" fill="#f2c9a0"/>
  <path d="M12 62 Q 12 30 30 30 Q 48 30 48 62 Z" fill="#4a7fd0" stroke="#2f5da8" stroke-width="3"/>
  <path d="M18 26 Q 30 44 42 26 L 42 40 Q 30 52 18 40 Z" fill="#f5f5f5"/>
  <circle cx="25" cy="16" r="2.2" fill="#26282e"/><circle cx="35" cy="16" r="2.2" fill="#26282e"/>
  <circle cx="30" cy="21" r="3" fill="#e88a75"/>
  <rect x="14" y="60" width="12" height="26" rx="5" fill="#7a4a1e"/>
  <rect x="34" y="60" width="12" height="26" rx="5" fill="#7a4a1e"/></svg>`);
const pointyHatSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="70" height="60" viewBox="0 0 70 60">
  <path d="M35 2 L 58 48 L 12 48 Z" fill="#e04040" stroke="#9b1f1f" stroke-width="3"/>
  <ellipse cx="35" cy="50" rx="28" ry="8" fill="#e04040" stroke="#9b1f1f" stroke-width="3"/>
  <circle cx="35" cy="4" r="4" fill="#ffd23f"/></svg>`);
const ghostSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="95" viewBox="0 0 80 95">
  <path d="M8 92 L8 42 Q 8 6 40 6 Q 72 6 72 42 L72 92 L60 80 L50 92 L40 80 L30 92 L20 80 Z"
    fill="#f5f5ff" stroke="#c9c9e8" stroke-width="4"/>
  <circle cx="28" cy="38" r="5" fill="#26282e"/><circle cx="52" cy="38" r="5" fill="#26282e"/>
  <ellipse cx="40" cy="54" rx="7" ry="9" fill="#26282e"/></svg>`);

// World layout (x, depth): the cat drops in at (0, 0) facing into the world; the
// town (plaza, houses, fountain, mailbox, duck pond) lies to the right, the forest
// (trees, mushroom, gnome, lost hat, ghost) to the left. The welcome sign stands
// straight ahead of the spawn, so the first discovery is unmissable.
const TOWN_HOUSES = [ // [x, depth, spin]
    [250, 380, -15], [500, 300, 10], [620, 620, -30], [330, 750, 20]
];
const TOWN_TREES = [ // [x, depth]: crossed-card pairs
    [-180, 280], [-380, 220], [-560, 350], [-720, 500], [-300, 480],
    [-480, 620], [-650, 780], [-250, 720], [-820, 300], [-400, 900]
];
const townFound = mkVar('Found'); // global: discoveries met so far (monitor + finale)

// One interactive discovery sprite: stands at its spot and, whenever the cat bumps
// it, says its line (the bubble hangs over its projected 3D spot). The first bump
// also ticks the global Found counter, via a sprite-local "seen" flag.
const discovery = ({name, svg, rcx, rcy, x, y, depth, size, thickness, line, layer, extra}) => {
    const seen = mkVar('seen');
    const blocks = {};
    buildScript(blocks, flag(
        setThickness(thickness), setSize(size), gotoXY(x, y), setDepth(depth),
        setVar(seen, 0),
        ...(extra || []),
        // Wait a beat before sensing: until the stage script has switched the 3D view
        // on, `touching in 3D?` falls back to the flat 2D overlap test, and several
        // discoveries share 2D stage spots with the cat before everything spreads out.
        wait(0.5),
        forever(
            ifThen(touching3D('Cat'),
                ifThen(eq(varRep(seen), 0), setVar(seen, 1), changeVar(townFound, 1)),
                sayForSecs(line, 2.5)
            )
        )
    ), 30, 30);
    return sprite({name, svg, rcx, rcy, x, y, size, layer, vars: [seen], blocks});
};

const townMapBlocks = {};
buildScript(townMapBlocks, flag(
    setThickness(10), setTilt(-90), setSpin(0), gotoXY(0, -60), setDepth(440)
), 30, 30);

const townHouseBlocks = {};
const placeTownHouses = [setThickness(60), setSize(120)];
for (const [x, d, spin] of TOWN_HOUSES) {
    placeTownHouses.push(gotoXY(x, 11), setDepth(d), setSpin(spin), createClone());
}
placeTownHouses.push(hide());
buildScript(townHouseBlocks, flag(...placeTownHouses), 30, 30);
buildScript(townHouseBlocks, whenClone(show()), 320, 30);

const townTreeBlocks = {};
const placeTownTrees = [setThickness(10), setSize(130)];
for (const [x, d] of TOWN_TREES) {
    placeTownTrees.push(gotoXY(x, 23), setDepth(d), setSpin(0), createClone(), setSpin(90), createClone());
}
placeTownTrees.push(hide());
buildScript(townTreeBlocks, flag(...placeTownTrees), 30, 30);
buildScript(townTreeBlocks, whenClone(show()), 320, 30);

// The explorer: the Scratch Cat. Up walks the way it faces, left/right turn (the
// shoulder camera swings along), down backs up. Finding all eight discoveries earns
// a little celebration.
const townCatBlocks = {};
buildScript(townCatBlocks, flag(
    setThickness(14), setSize(85),
    setVar(townFound, 0),
    gotoXY(0, -13), setDepth(0), setSpin(180), setTilt(0),
    forever(
        ifThen(keyPressed('up arrow'), move3D(7)),
        ifThen(keyPressed('down arrow'), move3D(-4)),
        ifThen(keyPressed('right arrow'), changeSpin(-4)),
        ifThen(keyPressed('left arrow'), changeSpin(4))
    )
), 30, 30);
buildScript(townCatBlocks, flag(
    waitUntil(eq(varRep(townFound), 8)),
    sayForSecs('You found all 8! What a town.', 4),
    repeatN(18, changeSpin(20), changeEffect('color', 6)),
    setEffect('color', 0)
), 360, 30);

const tinyTown = [
    stage(grassBgSVG,
        buildScript({}, flag(setSky('day'), setBackdrop('hidden'), cameraBehind('Cat')), 30, 30),
        [townFound]),
    sprite({
        name: 'Map', svg: townMapSVG, rcx: 960, rcy: 720, x: 0, y: -60, size: 100,
        layer: 1, blocks: townMapBlocks
    }),
    sprite({
        name: 'House', svg: houseSVG, rcx: 70, rcy: 55, x: 250, y: 11, size: 120,
        layer: 2, blocks: townHouseBlocks
    }),
    sprite({
        name: 'Tree', svg: treeSVG, rcx: 45, rcy: 60, x: -180, y: 23, size: 130,
        layer: 3, blocks: townTreeBlocks
    }),
    discovery({name: 'Sign', svg: signSVG, rcx: 35, rcy: 55, x: 0, y: 0, depth: 230,
        size: 100, thickness: 10, layer: 4,
        line: 'Welcome to Tiny Town! 8 things are waiting to be found.'}),
    discovery({name: 'Fountain', svg: fountainSVG, rcx: 70, rcy: 55, x: 420, y: 5, depth: 520,
        size: 110, thickness: 30, layer: 5,
        line: 'Splash! Toss in a coin and make a wish.'}),
    discovery({name: 'Mailbox', svg: mailboxSVG, rcx: 30, rcy: 47, x: 180, y: -8, depth: 300,
        size: 100, thickness: 12, layer: 6,
        line: `You've got mail! It's a postcard from a fish.`}),
    discovery({name: 'Duck', svg: duckSVG, rcx: 35, rcy: 30, x: 650, y: -28, depth: 850,
        size: 90, thickness: 14, layer: 7,
        line: 'Quack. Quack quack. ...That means hello.'}),
    discovery({name: 'Mushroom', svg: mushroomSVG, rcx: 35, rcy: 30, x: -450, y: -25, depth: 470,
        size: 100, thickness: 16, layer: 8,
        line: 'Hey! Watch where you are stepping!'}),
    discovery({name: 'Gnome', svg: gnomeSVG, rcx: 30, rcy: 45, x: -230, y: -10, depth: 580,
        size: 100, thickness: 14, layer: 9,
        line: 'Brrr, my head is cold. Have you seen my pointy hat?'}),
    discovery({name: 'Hat', svg: pointyHatSVG, rcx: 35, rcy: 30, x: -750, y: -25, depth: 650,
        size: 100, thickness: 14, layer: 10,
        line: 'A pointy little hat! Somebody must be missing it.'}),
    discovery({name: 'Ghost', svg: ghostSVG, rcx: 40, rcy: 47, x: -600, y: 20, depth: 950,
        size: 100, thickness: 10, layer: 11,
        line: 'Boooo! ...Did I get you? I have been practicing.',
        extra: [setEffect('ghost', 35)]}),
    sprite({
        name: 'Cat', svg: catSVG, rcx: 48, rcy: 50, x: 0, y: -13, size: 85,
        layer: 12, blocks: townCatBlocks
    })
];

// ---- example 16: Robot Builder (an articulated robot made of jointed sprites) -----
// A robot assembled from SIX separate sprites — torso, head, two arms, two legs —
// each an extruded card at its own depth (arms in front, legs behind) so the figure
// reads as a layered 3D machine from any angle (set camera to drag and spin around
// it). The joints are real Scratch rotation centres: each limb costume's rotation
// centre sits at its joint (the arm's shoulder bolt, the leg's hip bolt, the head's
// neck), which the 3D scene now honours (see scene.pivotOffset), so turning a part's
// `direction` swings it around its joint exactly like a 2D marionette — but in 3D.
//
// Keyboard controls move the parts directly, polled every frame:
//   Q / A       raise / lower the left arm     (direction 90..175, pivot at shoulder)
//   P / L       raise / lower the right arm    (direction 5..90)
//   left/right  march the legs (they scissor around their hips)
//   up / down   nod the head in 3D (tilt about its neck)
//   space       the whole robot hops (all parts jump together)
const robotBgSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
  <rect width="480" height="360" fill="#1d2433"/>
  <g stroke="#2c3750" stroke-width="2">
    <path d="M0 60H480 M0 120H480 M0 180H480 M0 240H480 M0 300H480"/>
    <path d="M60 0V360 M120 0V360 M180 0V360 M240 0V360 M300 0V360 M360 0V360 M420 0V360"/>
  </g>
  <rect y="312" width="480" height="48" fill="#141a26"/>
  <circle cx="70" cy="60" r="14" fill="none" stroke="#39c1e0" stroke-width="3"/>
  <circle cx="410" cy="100" r="9" fill="none" stroke="#39c1e0" stroke-width="3"/></svg>`);
const robotTorsoSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="74" height="92" viewBox="0 0 74 92">
  <rect x="5" y="4" width="64" height="84" rx="12" fill="#8a97ab" stroke="#5a6678" stroke-width="4"/>
  <rect x="16" y="16" width="42" height="30" rx="6" fill="#39c1e0" stroke="#1f7f96" stroke-width="3"/>
  <rect x="20" y="22" width="34" height="4" rx="2" fill="#bdefff"/>
  <circle cx="26" cy="60" r="5" fill="#ffd23f" stroke="#b98d1e" stroke-width="2"/>
  <circle cx="48" cy="60" r="5" fill="#e04040" stroke="#9b1f1f" stroke-width="2"/>
  <rect x="16" y="72" width="42" height="8" rx="4" fill="#5a6678"/></svg>`);
const robotHeadSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="58" viewBox="0 0 60 58">
  <rect x="27" y="2" width="6" height="10" fill="#5a6678"/>
  <circle cx="30" cy="4" r="4" fill="#e04040"/>
  <rect x="6" y="10" width="48" height="38" rx="9" fill="#aab6c8" stroke="#5a6678" stroke-width="4"/>
  <circle cx="21" cy="28" r="6" fill="#39c1e0" stroke="#1f7f96" stroke-width="2"/>
  <circle cx="39" cy="28" r="6" fill="#39c1e0" stroke="#1f7f96" stroke-width="2"/>
  <rect x="20" y="39" width="20" height="4" rx="2" fill="#5a6678"/>
  <rect x="24" y="48" width="12" height="10" rx="3" fill="#5a6678"/></svg>`);
const robotArmSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="78" viewBox="0 0 22 78">
  <circle cx="11" cy="9" r="8" fill="#5a6678" stroke="#39424f" stroke-width="2"/>
  <circle cx="11" cy="9" r="3" fill="#ffd23f"/>
  <rect x="6" y="14" width="10" height="42" rx="5" fill="#8a97ab" stroke="#5a6678" stroke-width="3"/>
  <circle cx="11" cy="58" r="6" fill="#5a6678"/>
  <path d="M5 62 Q 2 72 8 76 M17 62 Q 20 72 14 76" fill="none" stroke="#8a97ab" stroke-width="5" stroke-linecap="round"/></svg>`);
const robotLegSVG = reg(`<svg xmlns="http://www.w3.org/2000/svg" width="26" height="72" viewBox="0 0 26 72">
  <circle cx="13" cy="8" r="8" fill="#5a6678" stroke="#39424f" stroke-width="2"/>
  <circle cx="13" cy="8" r="3" fill="#ffd23f"/>
  <rect x="8" y="13" width="10" height="42" rx="5" fill="#8a97ab" stroke="#5a6678" stroke-width="3"/>
  <rect x="3" y="55" width="20" height="14" rx="5" fill="#5a6678" stroke="#39424f" stroke-width="3"/></svg>`);

// The whole-robot hop: every part runs this same loop, so a space press lifts all
// six sprites in step.
const robotHop = () => forever(
    ifThen(keyPressed('space'),
        repeatN(6, changeYBy(5)),
        repeatN(6, changeYBy(-5))
    )
);

const robotTorsoBlocks = {};
buildScript(robotTorsoBlocks, flag(
    setThickness(24), gotoXY(0, -8), setDepth(0), pointDir(90)
), 30, 30);
buildScript(robotTorsoBlocks, flag(robotHop()), 360, 30);

const robotHeadBlocks = {};
buildScript(robotHeadBlocks, flag(
    setThickness(16), gotoXY(0, 38), setDepth(0), pointDir(90), setTilt(0),
    sayForSecs('Q/A: left arm. P/L: right arm. Arrows: march and nod. Space: jump!', 6),
    // Nod in 3D: tilt swings the head about its neck pivot, toward/away the camera.
    forever(
        ifThen(and(keyPressed('up arrow'), gt(tiltRep(), -30)), changeTilt(-3)),
        ifThen(and(keyPressed('down arrow'), lt(tiltRep(), 30)), changeTilt(3))
    )
), 30, 30);
buildScript(robotHeadBlocks, flag(robotHop()), 360, 30);

const robotLeftArmBlocks = {};
buildScript(robotLeftArmBlocks, flag(
    setThickness(14), gotoXY(-36, 30), setDepth(-12), pointDir(90),
    // direction 90 hangs the arm as drawn; higher directions swing it out and up
    // around the shoulder bolt (the costume's rotation centre).
    forever(
        ifThen(and(keyPressed('q'), lt(dirRep(), 175)), turn(5)),
        ifThen(and(keyPressed('a'), gt(dirRep(), 90)), turn(-5))
    )
), 30, 30);
buildScript(robotLeftArmBlocks, flag(robotHop()), 360, 30);

const robotRightArmBlocks = {};
buildScript(robotRightArmBlocks, flag(
    setThickness(14), gotoXY(36, 30), setDepth(-12), pointDir(90),
    forever(
        ifThen(and(keyPressed('p'), gt(dirRep(), 5)), turn(-5)),
        ifThen(and(keyPressed('l'), lt(dirRep(), 90)), turn(5))
    )
), 30, 30);
buildScript(robotRightArmBlocks, flag(robotHop()), 360, 30);

const robotLeftLegBlocks = {};
buildScript(robotLeftLegBlocks, flag(
    setThickness(14), gotoXY(-16, -50), setDepth(12), pointDir(90),
    // The legs scissor around their hip bolts: left arrow swings this leg forward
    // while the right leg swings back, and vice versa.
    forever(
        ifThen(and(keyPressed('left arrow'), gt(dirRep(), 60)), turn(-4)),
        ifThen(and(keyPressed('right arrow'), lt(dirRep(), 120)), turn(4))
    )
), 30, 30);
buildScript(robotLeftLegBlocks, flag(robotHop()), 360, 30);

const robotRightLegBlocks = {};
buildScript(robotRightLegBlocks, flag(
    setThickness(14), gotoXY(16, -50), setDepth(12), pointDir(90),
    forever(
        ifThen(and(keyPressed('left arrow'), lt(dirRep(), 120)), turn(4)),
        ifThen(and(keyPressed('right arrow'), gt(dirRep(), 60)), turn(-4))
    )
), 30, 30);
buildScript(robotRightLegBlocks, flag(robotHop()), 360, 30);

const robotBuilder = [
    stage(robotBgSVG, buildScript({}, flag(setSky('night'), setCamera('drag')), 30, 30)),
    sprite({name: 'LeftLeg', svg: robotLegSVG, rcx: 13, rcy: 8, x: -16, y: -50, size: 100,
        layer: 1, blocks: robotLeftLegBlocks}),
    sprite({name: 'RightLeg', svg: robotLegSVG, rcx: 13, rcy: 8, x: 16, y: -50, size: 100,
        layer: 2, blocks: robotRightLegBlocks}),
    sprite({name: 'Torso', svg: robotTorsoSVG, rcx: 37, rcy: 46, x: 0, y: -8, size: 100,
        layer: 3, blocks: robotTorsoBlocks}),
    sprite({name: 'Head', svg: robotHeadSVG, rcx: 30, rcy: 56, x: 0, y: 38, size: 100,
        layer: 4, blocks: robotHeadBlocks}),
    sprite({name: 'LeftArm', svg: robotArmSVG, rcx: 11, rcy: 9, x: -36, y: 30, size: 100,
        layer: 5, blocks: robotLeftArmBlocks}),
    sprite({name: 'RightArm', svg: robotArmSVG, rcx: 11, rcy: 9, x: 36, y: 30, size: 100,
        layer: 6, blocks: robotRightArmBlocks})
];

Promise.resolve()
    .then(() => writeProject('popup-example-1.sb3', card))
    .then(() => writeProject('popup-example-2.sb3', tank))
    .then(() => writeProject('popup-example-3.sb3', forest))
    .then(() => writeProject('popup-example-4.sb3', spaceFlyer))
    .then(() => writeProject('popup-example-5.sb3', jumper))
    .then(() => writeProject('popup-example-6.sb3', garden))
    .then(() => writeProject('popup-example-7.sb3', platformer, [varMonitor(won, 5, 5)]))
    .then(() => writeProject('popup-example-8.sb3', birthdayCard))
    .then(() => writeProject('popup-example-9.sb3', crystal))
    .then(() => writeProject('popup-example-10.sb3', solarSystem))
    .then(() => writeProject('popup-example-11.sb3', gemHunt, [varMonitor(score, 5, 5)]))
    .then(() => writeProject('popup-example-12.sb3', carousel))
    .then(() => writeProject('popup-example-13.sb3', platformRun, [varMonitor(runWon, 5, 5)]))
    .then(() => writeProject('popup-example-14.sb3', raceDay,
        [varMonitor(raceGates, 5, 5), varMonitor(raceTime, 5, 35)]))
    .then(() => writeProject('popup-example-15.sb3', tinyTown, [varMonitor(townFound, 5, 5)]))
    .then(() => writeProject('popup-example-16.sb3', robotBuilder));
