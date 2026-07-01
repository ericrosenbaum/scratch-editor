/* eslint-disable */
// Generates the Songs example projects shown in the welcome modal:
//   songs-example-1.sb3   Dance Party   (dancers animate to beats + notes)
//   songs-example-2.sb3   Composition   (instruments cue in/out: auto build-up + click)
//   songs-example-3.sb3   Gem Hunt      (collect-to-win game; events drive the music)
//
// Each project embeds a top-level `song` (a library song run through sanitizeSong so its
// synth presets / drum voices are fully expanded) plus scripts that use the `songs`
// extension blocks. Library sprite/backdrop costumes are referenced by their real
// assetId/md5ext and their bytes are fetched from the Scratch CDN at generation time and
// embedded, so every .sb3 is self-contained.
//
// Run (from packages/scratch-gui): node src/components/songs-examples-modal/starters/make-songs-examples.js
//
// sanitizeSong (and its song-defaults / scale-utils deps) are ESM; @babel/register
// transpiles them on require so this stays a plain CommonJS script like the 3D Pop-Up
// generator it is modeled on.

require('@babel/register')({extensions: ['.js', '.jsx'], cwd: process.cwd()});

const fs = require('fs');
const path = require('path');
const https = require('https');
const JSZip = require('jszip');

const {sanitizeSong} = require('../../../lib/song-ai/sanitize.js');
const songTracks = require('../../../lib/libraries/song-tracks.json');
const spritesLib = require('../../../lib/libraries/sprites.json');
const backdropsLib = require('../../../lib/libraries/backdrops.json');

const assetsDir = path.join(__dirname, 'assets');

// ---- tiny sb3 block DSL (modeled on the 3D Pop-Up generator) ----------------
let idCounter = 0;
const nid = () => `s${++idCounter}`;
const num = v => [1, [4, String(v)]];
const text = v => [1, [10, String(v)]];

const isSpec = x => x && typeof x === 'object' && !Array.isArray(x) && typeof x.op === 'string';
const asInput = v => (typeof v === 'number' ? num(v) : typeof v === 'string' ? text(v) : v);

// Resolve one input value into sb3 input form, creating any nested blocks under
// `parentId`. Specs with `menu` become [1,id] shadow dropdowns; `boolean` specs become
// [2,id] hexagons; other specs are round reporters dropped into a value slot.
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

// Build a script (a hat + linear stack). Each spec is {op, fields?, inputs?, sub?, sub2?}.
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

// ---- events / motion / looks / control / sensing / operators / data ---------
const flag = (...specs) => [{op: 'event_whenflagclicked'}, ...specs];
const whenClicked = (...specs) => [{op: 'event_whenthisspriteclicked'}, ...specs];
const whenClone = (...specs) => [{op: 'control_start_as_clone'}, ...specs];
const whenKey = (key, ...specs) => [{op: 'event_whenkeypressed', fields: {KEY_OPTION: [key, null]}}, ...specs];

const gotoXY = (x, y) => ({op: 'motion_gotoxy', inputs: {X: num(x), Y: num(y)}});
const changeX = v => ({op: 'motion_changexby', inputs: {DX: num(v)}});
const changeY = v => ({op: 'motion_changeyby', inputs: {DY: num(v)}});
const turn = v => ({op: 'motion_turnright', inputs: {DEGREES: num(v)}});
const pointDir = v => ({op: 'motion_pointindirection', inputs: {DIRECTION: num(v)}});

const nextCostume = () => ({op: 'looks_nextcostume'});
const setSize = v => ({op: 'looks_setsizeto', inputs: {SIZE: num(v)}});
const changeSize = v => ({op: 'looks_changesizeby', inputs: {CHANGE: num(v)}});
const setEffect = (effect, v) => ({op: 'looks_seteffectto', fields: {EFFECT: [effect, null]}, inputs: {VALUE: num(v)}});
const changeEffect = (effect, v) => ({op: 'looks_changeeffectby', fields: {EFFECT: [effect, null]}, inputs: {CHANGE: num(v)}});
const clearEffects = () => ({op: 'looks_cleargraphiceffects'});
const show = () => ({op: 'looks_show'});
const hide = () => ({op: 'looks_hide'});
const sayForSecs = (msg, secs) => ({op: 'looks_sayforsecs', inputs: {MESSAGE: asInput(msg), SECS: num(secs)}});

const wait = secs => ({op: 'control_wait', inputs: {DURATION: num(secs)}});
const forever = (...sub) => ({op: 'control_forever', sub});
const repeatN = (times, ...sub) => ({op: 'control_repeat', inputs: {TIMES: num(times)}, sub});
const ifThen = (cond, ...sub) => ({op: 'control_if', inputs: {CONDITION: cond}, sub});
const ifElse = (cond, subThen, subElse) => ({op: 'control_if_else', inputs: {CONDITION: cond}, sub: subThen, sub2: subElse});
const createClone = () => ({
    op: 'control_create_clone_of',
    inputs: {CLONE_OPTION: {op: 'control_create_clone_of_menu', menu: true, shadow: true,
        fields: {CLONE_OPTION: ['_myself_', null]}}}
});
const deleteClone = () => ({op: 'control_delete_this_clone'});

const touchingSprite = spriteName => ({
    op: 'sensing_touchingobject', boolean: true,
    inputs: {TOUCHINGOBJECTMENU: {op: 'sensing_touchingobjectmenu', menu: true, shadow: true,
        fields: {TOUCHINGOBJECTMENU: [spriteName, null]}}}
});
const keyPressed = key => ({op: 'sensing_keypressed', boolean: true,
    inputs: {KEY_OPTION: {op: 'sensing_keyoptions', menu: true, shadow: true,
        fields: {KEY_OPTION: [key, null]}}}});

const eq = (a, b) => ({op: 'operator_equals', boolean: true, inputs: {OPERAND1: asInput(a), OPERAND2: asInput(b)}});
const and = (a, b) => ({op: 'operator_and', boolean: true, inputs: {OPERAND1: a, OPERAND2: b}});

const mkVar = name => ({name, id: `var-${name}-${++idCounter}`});
const setVar = (v, value) => ({op: 'data_setvariableto', fields: {VARIABLE: [v.name, v.id]},
    inputs: {VALUE: typeof value === 'number' ? text(value) : value}});
const changeVar = (v, value) => ({op: 'data_changevariableby', fields: {VARIABLE: [v.name, v.id]}, inputs: {VALUE: num(value)}});
const varRep = v => ({op: 'data_variable', fields: {VARIABLE: [v.name, v.id]}});

// ---- Songs extension block helpers ------------------------------------------
// A menu argument serializes as an input [1, menuBlockId] pointing at a shadow block
// `songs_menu_<MENU>` whose field holds the value (single-element array), matching the
// music extension's saved shape.
const ALL = '__all__';
const trackMenu = id => ({op: 'songs_menu_TRACK', menu: true, shadow: true, fields: {TRACK: [id]}});
const trackNoAllMenu = id => ({op: 'songs_menu_TRACK_NO_ALL', menu: true, shadow: true, fields: {TRACK: [id]}});
const whenSel = when => ({op: 'songs_menu_WHEN', menu: true, shadow: true, fields: {WHEN: [when]}});
const paramMenu = param => ({op: 'songs_menu_PARAM', menu: true, shadow: true, fields: {PARAM: [param]}});

const playTrack = (id, when = 'now') => ({op: 'songs_playTrack', inputs: {TRACK: trackMenu(id), WHEN: whenSel(when)}});
const stopTrack = (id, when = 'now') => ({op: 'songs_stopTrack', inputs: {TRACK: trackMenu(id), WHEN: whenSel(when)}});
const setTrackParam = (id, param, v) => ({op: 'songs_setTrackParam',
    inputs: {TRACK: trackMenu(id), PARAM: paramMenu(param), VALUE: num(v)}});
const changeTrackParam = (id, param, v) => ({op: 'songs_changeTrackParam',
    inputs: {TRACK: trackMenu(id), PARAM: paramMenu(param), VALUE: num(v)}});
const setSongTempo = v => ({op: 'songs_setSongTempo', inputs: {TEMPO: num(v)}});
const changeTempoBy = v => ({op: 'songs_changeTempoBy', inputs: {TEMPO: num(v)}});
const changeKeyBy = v => ({op: 'songs_changeKeyBy', inputs: {SEMITONES: num(v)}});

const getCurrentBeat = () => ({op: 'songs_getCurrentBeat'});
const getLoopCount = () => ({op: 'songs_getLoopCount'});

const whenBeat = (...specs) => [{op: 'songs_whenBeat'}, ...specs];
const whenLoopCounterReaches = (n, ...specs) => [{op: 'songs_whenLoopCounterReaches', inputs: {N: num(n)}}, ...specs];
const whenTrackPlaysNote = (id, ...specs) => [{op: 'songs_whenTrackPlaysNote', inputs: {TRACK: trackNoAllMenu(id)}}, ...specs];

// ---- song embedding ---------------------------------------------------------
// Run a library song through sanitizeSong (expands synthPreset -> full synth params and
// drumLanes -> drumVoices) then stamp deterministic ids so re-runs diff cleanly and the
// block TRACK fields can reference them.
const songFor = (name, slug) => {
    const item = songTracks.find(s => s.name === name);
    if (!item) throw new Error(`song not found: ${name}`);
    const song = sanitizeSong(item.payload, name);
    song.songId = `song-${slug}`;
    song.tracks.forEach((t, i) => {
        t.trackId = `${slug}-t${i}`;
    });
    return song;
};

// ---- library assets ---------------------------------------------------------
const usedAssets = new Set();
const libCostume = c => {
    usedAssets.add(c.md5ext);
    return {
        assetId: c.assetId,
        name: c.name,
        bitmapResolution: c.bitmapResolution || 1,
        md5ext: c.md5ext,
        dataFormat: c.dataFormat,
        rotationCenterX: c.rotationCenterX,
        rotationCenterY: c.rotationCenterY
    };
};

// All costumes for a library sprite (or a named subset), copied verbatim.
const spriteCostumes = (spriteName, only) => {
    const s = spritesLib.find(x => x.name === spriteName);
    if (!s) throw new Error(`sprite not found: ${spriteName}`);
    const list = only ? only.map(n => s.costumes.find(c => c.name === n)) : s.costumes;
    return list.map(libCostume);
};

// A single backdrop costume. backdrops.json entries are flat costume objects.
const backdropCostume = name => {
    const b = backdropsLib.find(x => x.name === name);
    if (!b) throw new Error(`backdrop not found: ${name}`);
    return libCostume(b.costumes ? b.costumes[0] : b);
};

const stage = (backdropName, blocks, vars) => {
    const variables = {};
    for (const v of vars || []) variables[v.id] = [v.name, 0];
    return {
        isStage: true,
        name: 'Stage',
        variables, lists: {}, broadcasts: {}, blocks: blocks || {}, comments: {},
        currentCostume: 0,
        costumes: [backdropCostume(backdropName)],
        sounds: [], volume: 100, layerOrder: 0,
        tempo: 60, videoTransparency: 50, videoState: 'off', textToSpeechLanguage: null
    };
};

const sprite = opts => {
    const variables = {};
    for (const v of opts.vars || []) variables[v.id] = [v.name, 0];
    return {
        isStage: false,
        name: opts.name,
        variables, lists: {}, broadcasts: {}, blocks: opts.blocks || {}, comments: {},
        currentCostume: opts.currentCostume || 0,
        costumes: opts.costumes,
        sounds: [], volume: 100, layerOrder: opts.layer,
        visible: opts.visible !== false,
        x: opts.x || 0, y: opts.y || 0, size: opts.size || 100,
        direction: opts.direction || 90,
        draggable: false, rotationStyle: opts.rotationStyle || 'all around'
    };
};

// A variable watcher shown on the stage (a DOM overlay, so it stays visible over play).
const varMonitor = (v, x, y) => ({
    id: v.id, mode: 'default', opcode: 'data_variable',
    params: {VARIABLE: v.name}, spriteName: null,
    value: 0, width: 0, height: 0, x, y, visible: true,
    sliderMin: 0, sliderMax: 100, isDiscrete: true
});

// ---- CDN fetch + zip --------------------------------------------------------
const cdnUrl = md5ext => `https://cdn.assets.scratch.mit.edu/internalapi/asset/${md5ext}/get/`;

const fetchAsset = md5ext => new Promise((resolve, reject) => {
    const local = path.join(assetsDir, md5ext);
    if (fs.existsSync(local)) return resolve();
    https.get(cdnUrl(md5ext), res => {
        if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`CDN ${res.statusCode} for ${md5ext}`));
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
            fs.writeFileSync(local, Buffer.concat(chunks));
            console.log(`fetched ${md5ext}`);
            resolve();
        });
    }).on('error', reject);
});

const writeProject = async (file, targets, song, monitors) => {
    const project = {
        targets,
        monitors: monitors || [],
        extensions: ['songs'],
        meta: {semver: '3.0.0', vm: '0.0.0', agent: 'songs-examples-generator'}
    };
    if (song) project.song = song;
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(project));
    const md5s = new Set();
    for (const t of targets) for (const c of t.costumes) md5s.add(c.md5ext);
    for (const m of md5s) zip.file(m, fs.readFileSync(path.join(assetsDir, m)));
    const buf = await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'});
    fs.writeFileSync(path.join(__dirname, file), buf);
    console.log(`wrote ${file} (${buf.length} bytes)`);
};

// =============================================================================
// Example 1 — Dance Party: dancers animate in sync to beats and notes.
// Song "Dance Party": t0 drums, t1 bass, t2 electric guitar, t3 saxophone.
// =============================================================================
const danceParty = () => {
    const song = songFor('Dance Party', 'dance');
    const [drums, , , sax] = song.tracks.map(t => t.trackId);

    // Stage: start the whole song, and flash the lights on every beat.
    const stageBlocks = {};
    buildScript(stageBlocks, flag(playTrack(ALL, 'now')), 30, 30);
    buildScript(stageBlocks, whenBeat(changeEffect('color', 12)), 30, 150);

    // Each dancer switches dance pose on a musical trigger.
    const dancer = (name, spriteName, x, y, size, trigger) => {
        const blocks = {};
        buildScript(blocks, flag(gotoXY(x, y), setSize(size), show()), 30, 30);
        buildScript(blocks, trigger(blocks), 30, 160);
        return sprite({name, costumes: spriteCostumes(spriteName), x, y, size,
            layer: 1, rotationStyle: "don't rotate", blocks});
    };

    return {
        song,
        monitors: [],
        targets: [
            stage('Party', stageBlocks),
            // Cassy dances on every beat.
            dancer('Cassy', 'Cassy Dance', -150, -30, 70, () => whenBeat(nextCostume())),
            // Champ moves with the drum groove (a new pose on every drum hit).
            dancer('Champ', 'Champ99', 0, -35, 60, () => whenTrackPlaysNote(drums, nextCostume())),
            // Anina dances on the beat and pops bigger when the saxophone plays.
            (() => {
                const name = 'Anina';
                const x = 150, y = -30, size = 70;
                const blocks = {};
                buildScript(blocks, flag(gotoXY(x, y), setSize(size), show()), 30, 30);
                buildScript(blocks, whenBeat(nextCostume(), setSize(size)), 30, 160);
                buildScript(blocks, whenTrackPlaysNote(sax, setSize(size + 15)), 30, 300);
                return sprite({name, costumes: spriteCostumes('Anina Dance'), x, y, size,
                    layer: 1, rotationStyle: "don't rotate", blocks});
            })()
        ]
    };
};

// =============================================================================
// Example 2 — Composition: instruments cue in/out (auto build-up + click to toggle).
// Song "Get Groovy": t0 bass, t1 piano, t2 trombone, t3 drums.
// =============================================================================
const composition = () => {
    const song = songFor('Get Groovy', 'groovy');
    const [bass, piano, trombone, drums] = song.tracks.map(t => t.trackId);

    // Stage: auto-arrange. Start with a drums + bass groove, layer the melody in over
    // the next loops, then drop it out and bring it back for a breakdown.
    const stageBlocks = {};
    buildScript(stageBlocks, flag(
        stopTrack(ALL, 'now'),
        playTrack(drums, 'now'),
        playTrack(bass, 'now')
    ), 30, 30);
    buildScript(stageBlocks, whenLoopCounterReaches(1, playTrack(piano, 'loop')), 30, 170);
    buildScript(stageBlocks, whenLoopCounterReaches(2, playTrack(trombone, 'loop')), 30, 290);
    buildScript(stageBlocks, whenLoopCounterReaches(4, stopTrack(piano, 'loop'), stopTrack(trombone, 'loop')), 300, 170);
    buildScript(stageBlocks, whenLoopCounterReaches(5, playTrack(piano, 'loop'), playTrack(trombone, 'loop')), 300, 320);

    // An instrument sprite. It stays on stage the whole time; while its track is playing
    // it pulses bigger and brighter on every note, and settles back on each beat — so you
    // can see at a glance which tracks are in the mix. Click it to cue its track in/out.
    const instrument = (name, spriteName, trackId, x) => {
        const playing = mkVar(`${name} on`);
        const blocks = {};
        buildScript(blocks, flag(gotoXY(x, -20), clearEffects(), setSize(65), setVar(playing, 0)), 30, 30);
        // Each note the track plays makes the instrument pop and glow.
        buildScript(blocks, whenTrackPlaysNote(trackId, setSize(88), setEffect('brightness', 40)), 30, 170);
        // Every beat settles it back — so a silent track just sits still.
        buildScript(blocks, whenBeat(setSize(65), setEffect('brightness', 0)), 30, 320);
        // Click to toggle the track (quantized would feel laggy, so toggle now).
        buildScript(blocks, whenClicked(
            ifElse(eq(varRep(playing), 1),
                [stopTrack(trackId, 'now'), setVar(playing, 0)],
                [playTrack(trackId, 'now'), setVar(playing, 1)])
        ), 300, 30);
        return sprite({name, costumes: spriteCostumes(spriteName), x, y: -20, size: 65,
            layer: 1, vars: [playing], blocks});
    };

    return {
        song,
        monitors: [],
        targets: [
            stage('Spotlight', stageBlocks),
            instrument('Drums', 'Drum Kit', drums, -165),
            instrument('Bass', 'Guitar', bass, -55),
            instrument('Piano', 'Keyboard', piano, 55),
            instrument('Brass', 'Trumpet', trombone, 165)
        ]
    };
};

// =============================================================================
// Example 3 — Gem Hunt: roam and collect gems; each pickup layers the music up, and
// collecting them all triggers a victory key change. Song "Platformer":
// t0 square lead, t1 pluck lead, t2 sub bass, t3 synth drums.
// =============================================================================
const gemHunt = () => {
    const song = songFor('Platformer', 'platformer');
    const [squareLead, pluckLead, subBass, drums] = song.tracks.map(t => t.trackId);

    const score = mkVar('score');
    const gemPositions = [[-180, 60], [140, 120], [0, -30], [-110, -110], [190, -70]];
    const TOTAL = gemPositions.length;

    // Stage: reset score and start a stripped-back groove (drums + bass, music slightly
    // muffled). Collecting gems opens it up and layers in the leads.
    const stageBlocks = {};
    buildScript(stageBlocks, flag(
        setVar(score, 0),
        stopTrack(ALL, 'now'),
        playTrack(drums, 'now'),
        playTrack(subBass, 'now'),
        setTrackParam(ALL, 'filter', 55)
    ), 30, 30);

    // Player: roam with the arrow keys; win animation when every gem is collected.
    const won = mkVar('won');
    const crabBlocks = {};
    buildScript(crabBlocks, flag(gotoXY(0, -120), setSize(80), pointDir(90), setVar(won, 0)), 30, 30);
    buildScript(crabBlocks, whenKey('right arrow', changeX(22), nextCostume()), 30, 170);
    buildScript(crabBlocks, whenKey('left arrow', changeX(-22), nextCostume()), 30, 250);
    buildScript(crabBlocks, whenKey('up arrow', changeY(22), nextCostume()), 30, 330);
    buildScript(crabBlocks, whenKey('down arrow', changeY(-22), nextCostume()), 30, 410);
    // Watch for the win: once all gems are in, lift the key, open the filter fully,
    // speed up a touch, celebrate — and only do it once.
    buildScript(crabBlocks, flag(forever(
        ifThen(and(eq(varRep(score), TOTAL), eq(varRep(won), 0)),
            setVar(won, 1),
            changeKeyBy(5),
            setTrackParam(ALL, 'filter', 100),
            changeTempoBy(10),
            playTrack(ALL, 'now'),
            sayForSecs('You collected them all!', 3),
            repeatN(24, turn(15))
        )
    )), 320, 30);
    const crab = sprite({name: 'Crab', costumes: spriteCostumes('Crab'), x: 0, y: -120, size: 80,
        layer: 2, vars: [won], blocks: crabBlocks});

    // Gems: the original spawns one clone per position, then hides. Each clone sparkles
    // on the beat and, when the player touches it, scores + layers the music up.
    const gemBlocks = {};
    const spawn = [];
    for (const [gx, gy] of gemPositions) {
        spawn.push(gotoXY(gx, gy), createClone());
    }
    buildScript(gemBlocks, flag(hide(), setSize(60), ...spawn), 30, 30);
    buildScript(gemBlocks, whenBeat(nextCostume()), 30, 220);
    buildScript(gemBlocks, whenClone(
        show(),
        forever(
            ifThen(touchingSprite('Crab'),
                changeVar(score, 1),
                changeTrackParam(ALL, 'filter', 12),
                changeTempoBy(3),
                // Layer the leads in as the hunt progresses.
                ifThen(eq(varRep(score), 2), playTrack(pluckLead, 'loop')),
                ifThen(eq(varRep(score), 4), playTrack(squareLead, 'loop')),
                hide(),
                deleteClone()
            )
        )
    ), 30, 300);
    const gems = sprite({name: 'Crystal', costumes: spriteCostumes('Crystal'), x: 0, y: 0, size: 60,
        visible: false, layer: 1, blocks: gemBlocks});

    return {
        song,
        monitors: [varMonitor(score, 5, 5)],
        targets: [
            stage('Blue Sky', stageBlocks, [score]),
            crab,
            gems
        ]
    };
};

// ---- run --------------------------------------------------------------------
async function main () {
    const projects = [
        {file: 'songs-example-1.sb3', ...danceParty()},
        {file: 'songs-example-2.sb3', ...composition()},
        {file: 'songs-example-3.sb3', ...gemHunt()}
    ];

    fs.mkdirSync(assetsDir, {recursive: true});
    const md5s = new Set();
    for (const p of projects) for (const t of p.targets) for (const c of t.costumes) md5s.add(c.md5ext);
    await Promise.all([...md5s].map(fetchAsset));

    for (const p of projects) await writeProject(p.file, p.targets, p.song, p.monitors);
    console.log('done.');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
