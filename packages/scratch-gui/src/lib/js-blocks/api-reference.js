/**
 * @file The complete `Scratch.*` API available to authored JS-powered block code,
 * as displayed by the in-editor API reference panel. Keep this in sync with
 * scratch-vm's extension-support/js-blocks/{api-bridge,vm-data-api,data-store}.js.
 */

/* eslint-disable @stylistic/max-len */
// Entries are documentation strings; keeping each on one line reads better here.

const API_REFERENCE = [
    {
        section: 'Inputs & output',
        entries: [
            {sig: 'Scratch.args.NAME', desc: 'The value of an input you declared, by its name (already cast to its type).'},
            {sig: 'return value;', desc: 'A reporter or boolean block returns its value this way. Commands need no return.'}
        ]
    },
    {
        section: 'Read the sprite & stage (live)',
        entries: [
            {sig: 'Scratch.sprite', desc: '{ name, x, y, direction, size, visible, draggable, rotationStyle, costumeNumber, costumeName, costumeCount, costumeWidth, costumeHeight, volume, layerOrder, isStage }'},
            {sig: 'Scratch.effects', desc: '{ color, fisheye, whirl, pixelate, mosaic, brightness, ghost } — current graphic-effect values.'},
            {sig: 'Scratch.clone', desc: '{ isClone, cloneCount } — clone info for this sprite.'},
            {sig: 'Scratch.stage', desc: '{ width, height, backdropNumber, backdropName, backdropCount }.'},
            {sig: 'Scratch.mouse', desc: '{ x, y, down } — the mouse pointer in Scratch coordinates.'},
            {sig: 'Scratch.timer', desc: 'The project timer, in seconds.'},
            {sig: 'Scratch.costumes', desc: 'Array of { name, dataFormat, isVector, bitmapResolution, rotationCenterX, rotationCenterY }.'}
        ]
    },
    {
        section: 'Read pixels & sound',
        entries: [
            {sig: 'Scratch.pixelColor(x, y)', desc: "Hex color (e.g. '#ff8800') of a pixel in the sprite's own costume."},
            {sig: 'Scratch.colorAtStage(x, y)', desc: 'Hex color rendered on the stage at a Scratch coordinate.'},
            {sig: 'Scratch.costumePixels()', desc: '{ width, height, data } — flat [r,g,b,a,…] of the rendered sprite.'},
            {sig: 'Scratch.costumeSVG(indexOrName)', desc: 'The SVG source of a vector costume.'},
            {sig: 'Scratch.soundLoudness(indexOrName)', desc: "A sound's overall loudness, 0–100 (RMS)."},
            {sig: 'Scratch.soundDuration(indexOrName)', desc: "A sound's length in seconds."},
            {sig: 'Scratch.soundSamples(indexOrName)', desc: "A sound's waveform as an array of samples (-1…1)."}
        ]
    },
    {
        section: 'Move & look (commands)',
        entries: [
            {sig: 'Scratch.setX(n) / changeX(n)', desc: "Set or change the sprite's x position."},
            {sig: 'Scratch.setY(n) / changeY(n)', desc: "Set or change the sprite's y position."},
            {sig: 'Scratch.goToXY(x, y)', desc: 'Move to a point.'},
            {sig: 'Scratch.move(steps)', desc: 'Move forward in the current direction.'},
            {sig: 'Scratch.setDirection(n) / turnRight(n) / turnLeft(n)', desc: 'Point or turn.'},
            {sig: 'Scratch.setSize(n) / changeSize(n)', desc: 'Set or change size (percent).'},
            {sig: 'Scratch.show() / hide()', desc: 'Show or hide the sprite.'},
            {sig: 'Scratch.setEffect(name, n) / changeEffect(name, n)', desc: "name: 'color','fisheye','whirl','pixelate','mosaic','brightness','ghost'."},
            {sig: 'Scratch.clearEffects()', desc: 'Remove all graphic effects.'},
            {sig: 'Scratch.setCostume(indexOrName) / nextCostume()', desc: 'Switch costume.'},
            {sig: 'Scratch.setVolume(n) / changeVolume(n)', desc: 'Set or change volume (0–100).'}
        ]
    },
    {
        section: 'Your library’s data (Scratch.data.*)',
        entries: [
            {sig: 'Scratch.data.set(name, value) / get(name)', desc: 'Store and read a named value. Private to your library; cleared on green flag/stop.'},
            {sig: 'Scratch.data.has(name) / delete(name) / keys() / clear()', desc: 'Test, remove, list, or clear stored names.'},
            {sig: 'Scratch.data.push(name, v) / itemAt(name, i) / setItem(name, i, v)', desc: 'Named lists (1-based indices, never throw).'},
            {sig: 'Scratch.data.insertAt(name, i, v) / removeAt(name, i) / length(name) / contains(name, v)', desc: 'More list operations.'},
            {sig: 'Scratch.data.newMap(name) / mapSet(name, k, v) / mapGet(name, k)', desc: 'Named maps (dictionaries).'},
            {sig: 'Scratch.data.mapHas(name, k) / mapDelete(name, k) / mapKeys(name)', desc: 'More map operations.'},
            {sig: 'Scratch.data.new2DArray(name, rows, cols, fill)', desc: 'Make a 2D grid filled with a value.'},
            {sig: 'Scratch.data.cell(name, r, c) / setCell(name, r, c, v)', desc: 'Read or write a grid cell (1-based).'}
        ]
    },
    {
        section: 'Text helpers (Scratch.text.*)',
        entries: [
            {sig: 'Scratch.text.split(s, sep) / join(list, sep)', desc: 'Split a string into a list, or join a list into a string.'},
            {sig: 'Scratch.text.replaceAll(s, find, repl)', desc: 'Replace every occurrence.'},
            {sig: 'Scratch.text.upper(s) / lower(s) / reverse(s) / trim(s)', desc: 'Transform a string.'},
            {sig: 'Scratch.text.contains(s, sub)', desc: 'True if s contains sub.'},
            {sig: 'Scratch.text.repeat(s, n)', desc: 'Repeat s n times.'}
        ]
    },
    {
        section: 'Control & cleanup',
        entries: [
            {sig: 'Scratch.runBranch()', desc: 'In a C-block, run the wrapped blocks once. Call it in a loop to repeat.'},
            {sig: 'Scratch.onStop(function () { … })', desc: 'Register cleanup that runs when the project stops or the green flag is pressed.'}
        ]
    },
    {
        section: 'Also available',
        entries: [
            {sig: 'Math, JSON, String, Number, Array, Object, Boolean', desc: 'Standard JavaScript built-ins (e.g. Math.random(), JSON.stringify()).'},
            {sig: '(not available)', desc: 'window, document, fetch, eval, setTimeout, and other host/network APIs are blocked.'}
        ]
    }
];

export {API_REFERENCE};
