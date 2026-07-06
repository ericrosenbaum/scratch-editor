import {FAMILIES, buildExampleLibrary} from './example-libraries';
import {SIGN_COSTUME, ROBOT_COSTUME} from './svg-costumes';

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
    const posNum = (parent, value) => shadow(parent, 'math_positive_number', 'NUM', value);
    const text = (parent, value) => shadow(parent, 'text', 'TEXT', value);
    // A dropdown shadow (e.g. sound_sounds_menu) — a single-field menu block.
    const menu = (parent, opcode, fieldName, value) => shadow(parent, opcode, fieldName, value);
    const colour = (parent, value) => {
        const id = uid();
        add({
            id,
            opcode: 'colour_picker',
            next: null,
            parent,
            inputs: {},
            fields: {COLOUR: {name: 'COLOUR', value: String(value)}},
            shadow: true,
            topLevel: false
        });
        return id;
    };

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

    return {blocks, uid, num, posNum, text, colour, menu, block};
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

            const paint = b.block(`${libId}_ex4`, {parent: ifBlock.id}); // paint at the mouse, size/color
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
    },
    {
        id: 'game-of-life-pen',
        name: 'Game of Life (Pen)',
        families: ['Life', 'Grid'],
        extensions: ['pen'],
        blurb: 'Run Conway’s Life and stamp each living cell with the pen, on a grid the C block walks for you.',
        build (libs, b) {
            const life = libs.Life;
            const grid = libs.Grid;

            const hat = b.block('event_whenflagclicked', {topLevel: true, x: 40, y: 40});
            const hide = b.block('looks_hide', {parent: hat.id});
            const clear0 = b.block('pen_clear', {parent: hide.id});
            const setSize = b.block('pen_setPenSizeTo', {parent: clear0.id});
            const sizeShadow = b.num(setSize.id, 18);
            setSize.input('SIZE', sizeShadow, sizeShadow);
            const setColor = b.block('pen_setPenColorToColor', {parent: setSize.id});
            const colorShadow = b.colour(setColor.id, '#33dd66');
            setColor.input('COLOR', colorShadow, colorShadow);
            const newWorld = b.block(`${life}_ex0`, {parent: setColor.id}); // new {cols} by {rows} life world
            const worldCols = b.num(newWorld.id, 12);
            const worldRows = b.num(newWorld.id, 12);
            newWorld.input('cols', worldCols, worldCols);
            newWorld.input('rows', worldRows, worldRows);
            const randomize = b.block(`${life}_ex1`, {parent: newWorld.id}); // randomize the life world
            const forever = b.block('control_forever', {parent: randomize.id});

            // forever body: erase all -> walk the grid stamping live cells -> step -> wait
            const clear1 = b.block('pen_clear', {parent: forever.id});
            const gridLoop = b.block(`${grid}_ex0`, {parent: clear1.id}); // for each cell of a cols x rows grid
            const gridCols = b.num(gridLoop.id, 12);
            const gridRows = b.num(gridLoop.id, 12);
            const gridSize = b.num(gridLoop.id, 26);
            gridLoop.input('cols', gridCols, gridCols);
            gridLoop.input('rows', gridRows, gridRows);
            gridLoop.input('size', gridSize, gridSize);

            // grid loop body: if <cell alive> { pen down, pen up } (a dot per living cell)
            const ifAlive = b.block('control_if', {parent: gridLoop.id});
            const aliveCond = b.block(`${life}_ex3`, {parent: ifAlive.id}); // life cell {col} {row} is alive?
            const colRep = b.block(`${grid}_ex1`, {parent: aliveCond.id}); // grid column
            const rowRep = b.block(`${grid}_ex2`, {parent: aliveCond.id}); // grid row
            const colShadow = b.num(aliveCond.id, 1);
            const rowShadow = b.num(aliveCond.id, 1);
            aliveCond.input('col', colRep.id, colShadow);
            aliveCond.input('row', rowRep.id, rowShadow);
            ifAlive.input('CONDITION', aliveCond.id, null);
            const penDown = b.block('pen_penDown', {parent: ifAlive.id});
            const penUp = b.block('pen_penUp', {parent: penDown.id});
            penDown.setNext(penUp.id);
            ifAlive.input('SUBSTACK', penDown.id, null);
            gridLoop.input('SUBSTACK', ifAlive.id, null);

            const step = b.block(`${life}_ex2`, {parent: gridLoop.id}); // step the life world
            const wait = b.block('control_wait', {parent: step.id});
            const waitShadow = b.posNum(wait.id, 0.15);
            wait.input('DURATION', waitShadow, waitShadow);

            hat.setNext(hide.id);
            hide.setNext(clear0.id);
            clear0.setNext(setSize.id);
            setSize.setNext(setColor.id);
            setColor.setNext(newWorld.id);
            newWorld.setNext(randomize.id);
            randomize.setNext(forever.id);
            forever.input('SUBSTACK', clear1.id, null);
            clear1.setNext(gridLoop.id);
            gridLoop.setNext(step.id);
            step.setNext(wait.id);
        }
    },
    {
        id: 'costume-invert',
        name: 'Costume Inverter',
        family: 'Image',
        blurb: 'Copy the costume to the canvas with colors inverted — a transform graphic effects can’t do.',
        build (libId, b) {
            const hat = b.block('event_whenflagclicked', {topLevel: true, x: 40, y: 40});
            const setSize = b.block('looks_setsizeto', {parent: hat.id});
            const sizeShadow = b.num(setSize.id, 100);
            setSize.input('SIZE', sizeShadow, sizeShadow);
            const clearFx = b.block('looks_cleargraphiceffects', {parent: setSize.id});
            const invert = b.block(`${libId}_ex0`, {parent: clearFx.id}); // stamp my costume, colors inverted
            const ix = b.num(invert.id, -130);
            const iy = b.num(invert.id, 0);
            invert.input('x', ix, ix);
            invert.input('y', iy, iy);
            hat.setNext(setSize.id);
            setSize.setNext(clearFx.id);
            clearFx.setNext(invert.id);
        }
    },
    {
        id: 'talking-sign',
        name: 'Talking Sign',
        family: 'Sign',
        costumes: [SIGN_COSTUME],
        blurb: 'Rewrite the words painted ON the costume, live — display only, the costume file never changes.',
        build (libId, b) {
            const hat = b.block('event_whenflagclicked', {topLevel: true, x: 40, y: 40});
            const ask = b.block('sensing_askandwait', {parent: hat.id});
            const askQ = b.text(ask.id, 'What should the sign say?');
            ask.input('QUESTION', askQ, askQ);

            // write (answer) on sign line (1)
            const writeTop = b.block(`${libId}_ex0`, {parent: ask.id});
            const answer = b.block('sensing_answer', {parent: writeTop.id});
            const topText = b.text(writeTop.id, 'HELLO');
            const topLine = b.num(writeTop.id, 1);
            writeTop.input('text', answer.id, topText);
            writeTop.input('line', topLine, topLine);

            // forever: write (join "timer: " (round (timer))) on sign line (2)
            const forever = b.block('control_forever', {parent: writeTop.id});
            const writeClock = b.block(`${libId}_ex0`, {parent: forever.id});
            const join = b.block('operator_join', {parent: writeClock.id});
            const joinLabel = b.text(join.id, 'timer: ');
            const round = b.block('operator_round', {parent: join.id});
            const timer = b.block('sensing_timer', {parent: round.id});
            const roundShadow = b.num(round.id, 0);
            round.input('NUM', timer.id, roundShadow);
            const joinShadow = b.text(join.id, '');
            join.input('STRING1', joinLabel, joinLabel);
            join.input('STRING2', round.id, joinShadow);
            const clockText = b.text(writeClock.id, '...');
            const clockLine = b.num(writeClock.id, 2);
            writeClock.input('text', join.id, clockText);
            writeClock.input('line', clockLine, clockLine);
            forever.input('SUBSTACK', writeClock.id, null);

            hat.setNext(ask.id);
            ask.setNext(writeTop.id);
            writeTop.setNext(forever.id);
        }
    },
    {
        id: 'robot-puppet',
        name: 'Robot Puppet',
        family: 'Puppet',
        costumes: [ROBOT_COSTUME],
        blurb: 'Wave the robot’s arms, make its eyes follow the mouse, and change its expression — all by reshaping the costume’s parts.',
        build (libId, b) {
            /**
             * turn part (id) to ((factor) * (sin of ((timer) * (300)))) — the
             * arm-wave expression tree, built fresh per use.
             * @param {string} parentId - the parent block id.
             * @param {string} partId - which part to turn.
             * @param {number} factor - degrees amplitude (sign flips the phase).
             * @returns {object} the turn block.
             */
            const turnWave = (parentId, partId, factor) => {
                const turn = b.block(`${libId}_ex0`, {parent: parentId});
                const idShadow = b.text(turn.id, partId);
                turn.input('id', idShadow, idShadow);
                const mult = b.block('operator_multiply', {parent: turn.id});
                const sin = b.block('operator_mathop', {parent: mult.id});
                sin.field('OPERATOR', 'sin');
                const speed = b.block('operator_multiply', {parent: sin.id});
                const timer = b.block('sensing_timer', {parent: speed.id});
                const speedN1 = b.num(speed.id, 0);
                const speedN2 = b.num(speed.id, 300);
                speed.input('NUM1', timer.id, speedN1);
                speed.input('NUM2', speedN2, speedN2);
                const sinShadow = b.num(sin.id, 0);
                sin.input('NUM', speed.id, sinShadow);
                const multN1 = b.num(mult.id, 0);
                const multN2 = b.num(mult.id, factor);
                mult.input('NUM1', sin.id, multN1);
                mult.input('NUM2', multN2, multN2);
                const degShadow = b.num(turn.id, 0);
                turn.input('deg', mult.id, degShadow);
                return turn;
            };

            /**
             * slide part (id) by x ((mouse x) / 60) y ((mouse y) / 60) — the
             * pupil-follows-the-mouse expression tree.
             * @param {string} parentId - the parent block id.
             * @param {string} partId - which pupil to slide.
             * @returns {object} the slide block.
             */
            const slideToMouse = (parentId, partId) => {
                const slide = b.block(`${libId}_ex1`, {parent: parentId});
                const idShadow = b.text(slide.id, partId);
                slide.input('id', idShadow, idShadow);
                const divX = b.block('operator_divide', {parent: slide.id});
                const mouseX = b.block('sensing_mousex', {parent: divX.id});
                const divXN1 = b.num(divX.id, 0);
                const divXN2 = b.num(divX.id, 60);
                divX.input('NUM1', mouseX.id, divXN1);
                divX.input('NUM2', divXN2, divXN2);
                const dxShadow = b.num(slide.id, 0);
                slide.input('dx', divX.id, dxShadow);
                const divY = b.block('operator_divide', {parent: slide.id});
                const mouseY = b.block('sensing_mousey', {parent: divY.id});
                const divYN1 = b.num(divY.id, 0);
                const divYN2 = b.num(divY.id, 60);
                divY.input('NUM1', mouseY.id, divYN1);
                divY.input('NUM2', divYN2, divYN2);
                const dyShadow = b.num(slide.id, 0);
                slide.input('dy', divY.id, dyShadow);
                return slide;
            };

            /**
             * A simple one-text-input library command (show/hide part, turn to a
             * constant, color a part).
             * @param {string} opcode - the library opcode suffix (e.g. 'ex2').
             * @param {string} parentId - the parent block id.
             * @param {Array.<Array>} inputs - [name, value, isNumber] triples.
             * @returns {object} the block.
             */
            const libCall = (opcode, parentId, inputs) => {
                const call = b.block(`${libId}_${opcode}`, {parent: parentId});
                for (const [name, value, isNumber] of inputs) {
                    const shadow = isNumber ? b.num(call.id, value) : b.text(call.id, value);
                    call.input(name, shadow, shadow);
                }
                return call;
            };

            // Stack 1: wave the arms, eyes follow the mouse.
            const hat = b.block('event_whenflagclicked', {topLevel: true, x: 40, y: 40});
            const forever = b.block('control_forever', {parent: hat.id});
            const waveLeft = turnWave(forever.id, 'arm-left', 35);
            const waveRight = turnWave(waveLeft.id, 'arm-right', -35);
            const lookLeft = slideToMouse(waveRight.id, 'pupil-left');
            const lookRight = slideToMouse(lookLeft.id, 'pupil-right');
            waveLeft.setNext(waveRight.id);
            waveRight.setNext(lookLeft.id);
            lookLeft.setNext(lookRight.id);
            forever.input('SUBSTACK', waveLeft.id, null);
            hat.setNext(forever.id);

            // Stack 2: expression — surprised while the mouse is down, smiling otherwise.
            const hat2 = b.block('event_whenflagclicked', {topLevel: true, x: 480, y: 40});
            const forever2 = b.block('control_forever', {parent: hat2.id});
            const ifElse = b.block('control_if_else', {parent: forever2.id});
            const mouseDown = b.block('sensing_mousedown', {parent: ifElse.id});
            ifElse.input('CONDITION', mouseDown.id, null);

            const hideSmile = libCall('ex3', ifElse.id, [['id', 'mouth-smile', false]]);
            const showOpen = libCall('ex2', hideSmile.id, [['id', 'mouth-open', false]]);
            const browLeftUp = libCall('ex0', showOpen.id, [['id', 'brow-left', false], ['deg', 12, true]]);
            const browRightUp = libCall('ex0', browLeftUp.id, [['id', 'brow-right', false], ['deg', -12, true]]);
            const lightRed = libCall('ex4', browRightUp.id, [['id', 'light', false], ['color', '#e74c3c', false]]);
            hideSmile.setNext(showOpen.id);
            showOpen.setNext(browLeftUp.id);
            browLeftUp.setNext(browRightUp.id);
            browRightUp.setNext(lightRed.id);
            ifElse.input('SUBSTACK', hideSmile.id, null);

            const showSmile = libCall('ex2', ifElse.id, [['id', 'mouth-smile', false]]);
            const hideOpen = libCall('ex3', showSmile.id, [['id', 'mouth-open', false]]);
            const browLeftFlat = libCall('ex0', hideOpen.id, [['id', 'brow-left', false], ['deg', 0, true]]);
            const browRightFlat = libCall('ex0', browLeftFlat.id, [['id', 'brow-right', false], ['deg', 0, true]]);
            const lightYellow = libCall('ex4', browRightFlat.id, [['id', 'light', false], ['color', '#f1c40f', false]]);
            showSmile.setNext(hideOpen.id);
            hideOpen.setNext(browLeftFlat.id);
            browLeftFlat.setNext(browRightFlat.id);
            browRightFlat.setNext(lightYellow.id);
            ifElse.input('SUBSTACK2', showSmile.id, null);

            forever2.input('SUBSTACK', ifElse.id, null);
            hat2.setNext(forever2.id);
        }
    },
    {
        id: 'audio-spectrum',
        name: 'Audio Spectrum (FFT)',
        family: 'Spectrum',
        blurb: 'Run an FFT on the project’s own live audio output and draw the frequency bars.',
        build (libId, b) {
            // Stack 1: keep some audio playing — the spectrum listens to the
            // project's own output, not the microphone.
            const hat = b.block('event_whenflagclicked', {topLevel: true, x: 40, y: 40});
            const playLoop = b.block('control_forever', {parent: hat.id});
            const play = b.block('sound_playuntildone', {parent: playLoop.id});
            const soundMenu = b.menu(play.id, 'sound_sounds_menu', 'SOUND_MENU', 'Meow');
            play.input('SOUND_MENU', soundMenu, soundMenu);
            playLoop.input('SUBSTACK', play.id, null);
            hat.setNext(playLoop.id);

            // Stack 2: reset, then FFT + draw the bars every frame.
            const hat2 = b.block('event_whenflagclicked', {topLevel: true, x: 360, y: 40});
            const reset = b.block(`${libId}_ex3`, {parent: hat2.id}); // reset the spectrum
            const drawLoop = b.block('control_forever', {parent: reset.id});
            const draw = b.block(`${libId}_ex0`, {parent: drawLoop.id}); // draw the audio spectrum
            drawLoop.input('SUBSTACK', draw.id, null);
            hat2.setNext(reset.id);
            reset.setNext(drawLoop.id);
        }
    },
    {
        id: 'sound-visualizer',
        name: 'Sound Visualizer',
        family: 'Scope',
        blurb: 'A real-time oscilloscope: the microphone’s live level sweeps across your own canvas layer.',
        build (libId, b) {
            const hat = b.block('event_whenflagclicked', {topLevel: true, x: 40, y: 40});
            const reset = b.block(`${libId}_ex1`, {parent: hat.id}); // reset the scope
            const forever = b.block('control_forever', {parent: reset.id});
            const show = b.block(`${libId}_ex0`, {parent: forever.id}); // show level {v} on the scope
            const loud = b.block('sensing_loudness', {parent: show.id});
            const vShadow = b.num(show.id, 0);
            show.input('v', loud.id, vShadow);
            forever.input('SUBSTACK', show.id, null);
            hat.setNext(reset.id);
            reset.setNext(forever.id);
        }
    }
];

/**
 * Build the runtime blocks + compiled libraries for a project. A project names one
 * library via `family`, or several via `families` (its `build` then receives a
 * {familyName: libraryId} map instead of a single id). It may also declare core
 * `extensions` (e.g. 'pen') that must be loaded before its blocks can render.
 * @param {object} project - the project definition.
 * @returns {?object} {libraries, library, blocks, extensions} or null if a library is missing.
 */
const buildProject = project => {
    const familyNames = project.families || [project.family];
    const libraries = [];
    const libraryIds = {};
    for (const name of familyNames) {
        const family = FAMILIES.find(f => f.name === name);
        if (!family) return null;
        const library = buildExampleLibrary(family);
        libraries.push(library);
        libraryIds[name] = library.id;
    }
    const salt = Math.random().toString(36)
        .slice(2, 7);
    const builder = makeBuilder(salt);
    project.build(project.families ? libraryIds : libraries[0].id, builder);
    return {
        libraries,
        library: libraries[0], // primary, for back-compat
        blocks: builder.blocks,
        extensions: project.extensions || [],
        costumes: project.costumes || []
    };
};

/**
 * @returns {Array.<object>} the project list for the UI ({id, name, blurb, family}).
 */
const projectList = () => PROJECTS.map(p => ({id: p.id, name: p.name, blurb: p.blurb, family: p.family}));

export {projectList, buildProject, PROJECTS};
