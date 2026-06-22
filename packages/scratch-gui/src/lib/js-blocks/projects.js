import {FAMILIES, buildExampleLibrary} from './example-libraries';

/**
 * @file Loadable "starter" scripts for the example libraries. Rather than ship
 * binary .sb3 files (which would need bundled assets), each project installs its
 * library and injects a short, runnable script into the current sprite — the
 * default cat already provides a colorful costume (for pixel reads), a "meow"
 * sound (sound 1, for audio reads), and the pen. The full project designs live in
 * ./example-projects.md; these are the playful seeds that prove the headline
 * block works, left open for kids to extend.
 */

/**
 * A small builder for runtime-format block records (the shape Blocks.createBlock
 * expects). Tracks blocks in insertion order and hands out unique ids.
 * @param {string} salt - a per-load salt so repeated loads don't collide.
 * @returns {object} builder helpers.
 */
const makeBuilder = salt => {
    const blocks = [];
    let counter = 0;
    const uid = () => `jp_${salt}_${counter++}`;

    const add = rec => {
        blocks.push(rec);
        return rec.id;
    };

    const shadow = (parent, opcode, fieldName, value) => add({
        id: uid(),
        opcode,
        inputs: {},
        fields: {[fieldName]: {name: fieldName, value: String(value)}},
        next: null,
        parent,
        shadow: true,
        topLevel: false
    });
    const num = (parent, value) => shadow(parent, 'math_number', 'NUM', value);
    const text = (parent, value) => shadow(parent, 'text', 'TEXT', value);

    /**
     * Add a non-shadow block (reporter, command, or hat).
     * @param {string} opcode - the opcode.
     * @param {object} opts - {parent, next, topLevel, x, y}.
     * @returns {object} {id, setInput}.
     */
    const block = (opcode, opts = {}) => {
        const id = uid();
        const rec = {
            id,
            opcode,
            inputs: {},
            fields: {},
            next: opts.next || null,
            parent: opts.parent || null,
            shadow: false,
            topLevel: Boolean(opts.topLevel),
            x: opts.x || 0,
            y: opts.y || 0
        };
        add(rec);
        return {
            id,
            rec,
            // Plug a value into an input: a shadow id and/or an obscuring block id.
            input (inputName, blockId, shadowId) {
                rec.inputs[inputName] = {
                    name: inputName,
                    block: blockId,
                    shadow: typeof shadowId === 'undefined' ? null : shadowId
                };
                return this;
            },
            field (fieldName, value, fieldId) {
                rec.fields[fieldName] = fieldId ?
                    {name: fieldName, value, id: fieldId} : {name: fieldName, value};
                return this;
            },
            setNext (nextId) {
                rec.next = nextId;
            }
        };
    };

    return {blocks, uid, num, text, block};
};

/**
 * Project definitions. `build(libId)` returns an array of runtime block records
 * forming a green-flag script that uses the library identified by `libId`.
 */
const PROJECTS = [
    {
        id: 'secret-decoder',
        name: 'Secret Decoder',
        family: 'Text',
        blurb: 'Ask for a message and show it enciphered (shift the letters).',
        build (libId, b) {
            const hat = b.block('event_whenflagclicked', {topLevel: true, x: 40, y: 40});
            const ask = b.block('sensing_askandwait', {parent: hat.id});
            const askQ = b.text(ask.id, 'Type a secret message:');
            ask.input('QUESTION', askQ, askQ);
            const say = b.block('looks_sayforsecs', {parent: ask.id});
            const cipher = b.block(`${libId}_ex1`, {parent: say.id}); // shift letters of {s} by {n}
            const answer = b.block('sensing_answer', {parent: cipher.id});
            const shiftN = b.num(cipher.id, 3);
            cipher.input('s', answer.id, null);
            cipher.input('n', shiftN, shiftN);
            const secs = b.num(say.id, 4);
            say.input('MESSAGE', cipher.id, null);
            say.input('SECS', secs, secs);
            hat.setNext(ask.id);
            ask.setNext(say.id);
        }
    },
    {
        id: 'game-of-life',
        name: 'Game of Life (seed)',
        family: 'Grids',
        blurb: 'Randomize a grid and count living neighbors — the heart of Conway’s Life.',
        build (libId, b) {
            const hat = b.block('event_whenflagclicked', {topLevel: true, x: 40, y: 40});
            const rnd = b.block(`${libId}_ex1`, {parent: hat.id}); // randomize grid {name} size {n}
            const rndName = b.text(rnd.id, 'world');
            const rndN = b.num(rnd.id, 8);
            rnd.input('name', rndName, rndName);
            rnd.input('n', rndN, rndN);
            const say = b.block('looks_sayforsecs', {parent: rnd.id});
            const neigh = b.block(`${libId}_ex4`, {parent: say.id}); // living neighbors in {name} at {r} {c}
            const nName = b.text(neigh.id, 'world');
            const nR = b.num(neigh.id, 4);
            const nC = b.num(neigh.id, 4);
            neigh.input('name', nName, nName);
            neigh.input('r', nR, nR);
            neigh.input('c', nC, nC);
            const secs = b.num(say.id, 4);
            say.input('MESSAGE', neigh.id, null);
            say.input('SECS', secs, secs);
            hat.setNext(rnd.id);
            rnd.setNext(say.id);
        }
    },
    {
        id: 'color-chameleon',
        name: 'Color Chameleon',
        family: 'Pixels',
        blurb: 'Read the color of a pixel in the sprite’s own costume and react to it.',
        build (libId, b) {
            const hat = b.block('event_whenflagclicked', {topLevel: true, x: 40, y: 40});
            const forever = b.block('control_forever', {parent: hat.id});
            // set color effect to (red of (my pixel 20 20))
            const setEffect = b.block('looks_seteffectto', {parent: forever.id});
            const red = b.block(`${libId}_ex2`, {parent: setEffect.id}); // red of {color}
            const pixel = b.block(`${libId}_ex1`, {parent: red.id}); // my pixel {x} {y}
            // 50,50 lands on the cat's body (non-zero red). Because pixelColor reads
            // the drawable as rendered — graphic effects included — feeding that red
            // back into the color effect makes each frame shift the next: a feedback loop.
            const px = b.num(pixel.id, 50);
            const py = b.num(pixel.id, 50);
            pixel.input('x', px, px);
            pixel.input('y', py, py);
            red.input('color', pixel.id, null);
            setEffect.field('EFFECT', 'COLOR');
            const amt = b.num(setEffect.id, 0); // shadow behind the reporter
            setEffect.input('VALUE', red.id, amt);
            // forever's SUBSTACK is the setEffect block
            forever.input('SUBSTACK', setEffect.id, null);
            hat.setNext(forever.id);
        }
    },
    {
        id: 'sound-bars',
        name: 'Sound Bars (seed)',
        family: 'Sound',
        blurb: 'Read the loudness of a sound — vanilla Scratch can’t see a sound’s data.',
        build (libId, b) {
            const hat = b.block('event_whenflagclicked', {topLevel: true, x: 40, y: 40});
            const say = b.block('looks_say', {parent: hat.id});
            const loud = b.block(`${libId}_ex0`, {parent: say.id}); // loudness of sound {n}
            const which = b.num(loud.id, 1);
            loud.input('n', which, which);
            say.input('MESSAGE', loud.id, null);
            hat.setNext(say.id);
        }
    },
    {
        id: 'pixel-paint',
        name: 'Pixel Paint',
        family: 'Canvas',
        blurb: 'Hold the mouse to paint into your own pixel layer — the costume is never touched.',
        build (libId, b) {
            const hat = b.block('event_whenflagclicked', {topLevel: true, x: 40, y: 40});
            const forever = b.block('control_forever', {parent: hat.id});
            // if <mouse down?> { paint at the mouse, size (6) color (rainbow color (timer * 60)) }
            const ifBlock = b.block('control_if', {parent: forever.id});
            const mouseDown = b.block('sensing_mousedown', {parent: ifBlock.id});
            ifBlock.input('CONDITION', mouseDown.id, null);

            const paint = b.block(`${libId}_ex4`, {parent: ifBlock.id}); // paint at the mouse, size {size} color {color}
            const sizeShadow = b.num(paint.id, 6);
            paint.input('size', sizeShadow, sizeShadow);

            const rainbow = b.block(`${libId}_ex5`, {parent: paint.id}); // rainbow color {t}
            const mult = b.block('operator_multiply', {parent: rainbow.id});
            const timer = b.block('sensing_timer', {parent: mult.id});
            const multShadow1 = b.num(mult.id, 0);
            const multShadow2 = b.num(mult.id, 60);
            mult.input('NUM1', timer.id, multShadow1);
            mult.input('NUM2', multShadow2, multShadow2);
            const tShadow = b.num(rainbow.id, 0);
            rainbow.input('t', mult.id, tShadow);
            const colorShadow = b.text(paint.id, '#ff3355');
            paint.input('color', rainbow.id, colorShadow);

            ifBlock.input('SUBSTACK', paint.id, null);
            forever.input('SUBSTACK', ifBlock.id, null);
            hat.setNext(forever.id);
        }
    }
];

/**
 * Build the runtime blocks + the (compiled) library for a project.
 * @param {object} project - the project definition.
 * @returns {?object} {library, blocks} or null if the library is missing.
 */
const buildProject = project => {
    const family = FAMILIES.find(f => f.name === project.family);
    if (!family) return null;
    const library = buildExampleLibrary(family);
    const salt = Math.random().toString(36)
        .slice(2, 7);
    const builder = makeBuilder(salt);
    project.build(library.id, builder);
    return {library, blocks: builder.blocks};
};

/**
 * @returns {Array.<object>} the project list for the UI ({id, name, blurb, family}).
 */
const projectList = () => PROJECTS.map(p => ({id: p.id, name: p.name, blurb: p.blurb, family: p.family}));

export {projectList, buildProject, PROJECTS};
