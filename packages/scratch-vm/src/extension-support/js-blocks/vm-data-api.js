const Interpreter = require('js-interpreter');

/**
 * @file Read-only "VM data" surface for JS-powered blocks. Everything here is a
 * LIVE getter (re-evaluated on each property access) so a block that yields and
 * resumes reads current values, and every result is a fresh snapshot — mutating
 * it does nothing to the VM. Pixel / SVG / audio reads need the renderer / audio
 * engine (browser only) and degrade gracefully when those are absent.
 */

const STAGE_WIDTH = 480;
const STAGE_HEIGHT = 360;
const EFFECT_NAMES = ['color', 'fisheye', 'whirl', 'pixelate', 'mosaic', 'brightness', 'ghost'];

/**
 * Best-effort current costume size via the renderer.
 * @param {Target} target - the rendered target.
 * @returns {Array.<number>} [width, height], or [0, 0] when unavailable.
 */
const currentCostumeSize = target => {
    const renderer = target && target.renderer;
    if (renderer && typeof renderer.getCurrentSkinSize === 'function' &&
        typeof target.drawableID === 'number' && target.drawableID >= 0) {
        try {
            return renderer.getCurrentSkinSize(target.drawableID);
        } catch (e) {
            return [0, 0];
        }
    }
    return [0, 0];
};

/**
 * Snapshot the read-only sprite/target properties.
 * @param {Target} target - the rendered target.
 * @returns {object} a plain snapshot.
 */
const spriteSnapshot = target => {
    if (!target) return {};
    const sprite = target.sprite || {};
    const costumes = sprite.costumes || [];
    const [costumeWidth, costumeHeight] = currentCostumeSize(target);
    return {
        name: target.getName ? target.getName() : '',
        x: target.x || 0,
        y: target.y || 0,
        direction: typeof target.direction === 'number' ? target.direction : 90,
        size: typeof target.size === 'number' ? target.size : 100,
        visible: target.visible !== false,
        draggable: Boolean(target.draggable),
        rotationStyle: target.rotationStyle || 'all around',
        costumeNumber: (target.currentCostume || 0) + 1,
        costumeName: costumes[target.currentCostume] ? costumes[target.currentCostume].name : '',
        costumeCount: costumes.length,
        costumeWidth: costumeWidth,
        costumeHeight: costumeHeight,
        volume: typeof target.volume === 'number' ? target.volume : 100,
        layerOrder: typeof target.getLayerOrder === 'function' ? target.getLayerOrder() : 0,
        isStage: Boolean(target.isStage)
    };
};

/**
 * Snapshot the graphic effect values.
 * @param {Target} target - the rendered target.
 * @returns {object} effect name -> value.
 */
const effectsSnapshot = target => {
    const out = {};
    const effects = (target && target.effects) || {};
    for (const name of EFFECT_NAMES) {
        out[name] = effects[name] || 0;
    }
    return out;
};

/**
 * Snapshot clone information for this target.
 * @param {Target} target - the rendered target.
 * @returns {object} {isClone, cloneCount}.
 */
const cloneSnapshot = target => {
    const clones = (target && target.sprite && target.sprite.clones) || [];
    // clones[] includes the original at index 0; "other" clones are the rest.
    return {
        isClone: Boolean(target && !target.isOriginal),
        cloneCount: Math.max(0, clones.length - 1)
    };
};

/**
 * Snapshot the stage / backdrop.
 * @param {Runtime} runtime - the VM runtime.
 * @returns {object} stage snapshot.
 */
const stageSnapshot = runtime => {
    const stage = runtime.getTargetForStage ? runtime.getTargetForStage() : null;
    const backdrops = (stage && stage.sprite && stage.sprite.costumes) || [];
    return {
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        backdropNumber: stage ? (stage.currentCostume || 0) + 1 : 1,
        backdropName: stage && backdrops[stage.currentCostume] ? backdrops[stage.currentCostume].name : '',
        backdropCount: backdrops.length
    };
};

/**
 * Snapshot the mouse state.
 * @param {Runtime} runtime - the VM runtime.
 * @returns {object} {x, y, down}.
 */
const mouseSnapshot = runtime => {
    const mouse = runtime.ioDevices && runtime.ioDevices.mouse;
    return {
        x: mouse ? mouse.getScratchX() : 0,
        y: mouse ? mouse.getScratchY() : 0,
        down: mouse ? Boolean(mouse.getIsDown()) : false
    };
};

/**
 * Snapshot costume metadata (no pixel data).
 * @param {Target} target - the rendered target.
 * @returns {Array.<object>} metadata for each costume.
 */
const costumesSnapshot = target => {
    const costumes = (target && target.sprite && target.sprite.costumes) || [];
    return costumes.map(costume => ({
        name: costume.name,
        dataFormat: costume.dataFormat || '',
        isVector: (costume.dataFormat || '').toLowerCase() === 'svg',
        bitmapResolution: costume.bitmapResolution || 1,
        rotationCenterX: costume.rotationCenterX || 0,
        rotationCenterY: costume.rotationCenterY || 0
    }));
};

/**
 * Resolve a 1-based index or a costume name to a 0-based costume index.
 * @param {Target} target - the rendered target.
 * @param {number|string} indexOrName - 1-based index or name.
 * @returns {number} 0-based index, or -1 if not found.
 */
const resolveCostumeIndex = (target, indexOrName) => {
    const costumes = (target && target.sprite && target.sprite.costumes) || [];
    if (typeof indexOrName === 'number' || /^\d+$/.test(String(indexOrName))) {
        const idx = Math.round(Number(indexOrName)) - 1;
        return idx >= 0 && idx < costumes.length ? idx : -1;
    }
    return costumes.findIndex(c => c.name === indexOrName);
};

/**
 * Read a costume's SVG source (vector costumes only).
 * @param {Target} target - the rendered target.
 * @param {number|string} indexOrName - which costume.
 * @returns {string} SVG text, or '' when unavailable / not a vector.
 */
const readCostumeSVG = (target, indexOrName) => {
    const idx = resolveCostumeIndex(target, indexOrName);
    const costumes = (target && target.sprite && target.sprite.costumes) || [];
    const costume = costumes[idx];
    if (costume && costume.asset && (costume.dataFormat || '').toLowerCase() === 'svg') {
        try {
            return costume.asset.decodeText();
        } catch (e) {
            return '';
        }
    }
    return '';
};

/**
 * Read the current drawable's pixels (best effort; requires the renderer).
 * @param {Target} target - the rendered target.
 * @returns {object} {width, height, data} — data is a flat RGBA array; empty when unavailable.
 */
const readCurrentPixels = target => {
    const renderer = target && target.renderer;
    if (renderer && typeof renderer.extractDrawableScreenSpace === 'function' &&
        typeof target.drawableID === 'number' && target.drawableID >= 0) {
        try {
            const result = renderer.extractDrawableScreenSpace(target.drawableID);
            const imageData = result && result.imageData;
            if (imageData) {
                return {
                    width: imageData.width,
                    height: imageData.height,
                    data: Array.prototype.slice.call(imageData.data)
                };
            }
        } catch (e) {
            // fall through to the empty result
        }
    }
    return {width: 0, height: 0, data: []};
};

/**
 * Read decoded PCM samples for a sound (best effort; requires the audio engine).
 * @param {Target} target - the rendered target.
 * @param {number|string} indexOrName - which sound.
 * @returns {Array.<number>} samples, capped in length; empty when unavailable.
 */
const readSoundSamples = (target, indexOrName) => {
    const sounds = (target && target.sprite && target.sprite.sounds) || [];
    let idx;
    if (typeof indexOrName === 'number' || /^\d+$/.test(String(indexOrName))) {
        idx = Math.round(Number(indexOrName)) - 1;
    } else {
        idx = sounds.findIndex(s => s.name === indexOrName);
    }
    const sound = sounds[idx];
    const soundBank = target && target.sprite && target.sprite.soundBank;
    if (sound && soundBank && soundBank.getSoundPlayer) {
        try {
            const player = soundBank.getSoundPlayer(sound.soundId);
            const buffer = player && player.buffer;
            if (buffer && buffer.getChannelData) {
                const channel = buffer.getChannelData(0);
                const cap = Math.min(channel.length, 8000);
                const out = new Array(cap);
                for (let i = 0; i < cap; i++) out[i] = channel[i];
                return out;
            }
        } catch (e) {
            // fall through to the empty result
        }
    }
    return [];
};

/**
 * Install the read-only VM data accessors onto the `Scratch` global.
 * @param {Interpreter} interp - the interpreter.
 * @param {object} Scratch - the pseudo `Scratch` object.
 * @param {object} ctx - {runtime, util, ...}.
 */
const install = (interp, Scratch, ctx) => {
    const {runtime, util} = ctx;
    const target = util.target;
    const toPseudo = v => ((v !== null && typeof v === 'object') ? interp.nativeToPseudo(v) : v);

    const liveGetter = (name, compute) => {
        interp.setProperty(Scratch, name, Interpreter.VALUE_IN_DESCRIPTOR, {
            get: interp.createNativeFunction(() => toPseudo(compute()))
        });
    };

    liveGetter('sprite', () => spriteSnapshot(target));
    liveGetter('effects', () => effectsSnapshot(target));
    liveGetter('clone', () => cloneSnapshot(target));
    liveGetter('stage', () => stageSnapshot(runtime));
    liveGetter('mouse', () => mouseSnapshot(runtime));
    liveGetter('costumes', () => costumesSnapshot(target));
    liveGetter('timer', () => {
        const clock = runtime.ioDevices && runtime.ioDevices.clock;
        return clock ? clock.projectTimer() : 0;
    });

    const fn = (name, impl) => interp.setProperty(Scratch, name, interp.createNativeFunction(impl));
    fn('costumeSVG', indexOrName => toPseudo(readCostumeSVG(target, interp.pseudoToNative(indexOrName))));
    fn('costumePixels', () => toPseudo(readCurrentPixels(target)));
    fn('soundSamples', indexOrName => toPseudo(readSoundSamples(target, interp.pseudoToNative(indexOrName))));
};

module.exports = {
    install,
    spriteSnapshot,
    effectsSnapshot,
    cloneSnapshot,
    stageSnapshot,
    costumesSnapshot
};
