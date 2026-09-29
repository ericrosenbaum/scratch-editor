const formatMessage = require('format-message');
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const MathUtil = require('../../util/math-util');

// eslint-disable-next-line @stylistic/max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48ZyBmaWxsPSJub25lIiBzdHJva2U9IiNGRkYiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCI+PHBhdGggc3Ryb2tlLXdpZHRoPSIyLjQiIGQ9Ik04IDE4djRNMTIgMTV2MTBNMTYuNSAxMnYxNk0yMSAxNnY4TTI1LjUgMTF2MThNMzAgMTV2MTAiLz48cGF0aCBzdHJva2Utd2lkdGg9IjEuNiIgc3Ryb2tlLWRhc2hhcnJheT0iMiAyLjIiIGQ9Ik0xNC4yIDh2MjRNMjcuOCA4djI0Ii8+PC9nPjwvc3ZnPg==';

// eslint-disable-next-line @stylistic/max-len
const menuIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxOSIgZmlsbD0iIzBGQkQ4QyIgc3Ryb2tlPSIjMEI4RTY5IiBzdHJva2Utd2lkdGg9IjIiLz48ZyBmaWxsPSJub25lIiBzdHJva2U9IiNGRkYiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCI+PHBhdGggc3Ryb2tlLXdpZHRoPSIyLjQiIGQ9Ik04IDE4djRNMTIgMTV2MTBNMTYuNSAxMnYxNk0yMSAxNnY4TTI1LjUgMTF2MThNMzAgMTV2MTAiLz48cGF0aCBzdHJva2Utd2lkdGg9IjEuNiIgc3Ryb2tlLWRhc2hhcnJheT0iMiAyLjIiIGQ9Ik0xNC4yIDh2MjRNMjcuOCA4djI0Ii8+PC9nPjwvc3ZnPg==';

/**
 * Start a sound player partway through its sound. SoundPlayer.play always
 * starts from the beginning, so this follows the same steps but starts the
 * buffer source at an offset, optionally for a limited duration.
 * @param {SoundPlayer} player - the player to start.
 * @param {number} offset - seconds into the sound to start from.
 * @param {number} [duration] - seconds of the sound to play; to the end if omitted.
 */
const startPlayerAt = (player, offset, duration) => {
    if (player.isPlaying) {
        player.stop();
    }
    if (player.initialized) {
        player._createSource();
    } else {
        player.initialize();
    }
    player.outputNode.start(0, offset, duration);
    player.isPlaying = true;
    const {currentTime, DECAY_DURATION} = player.audioEngine;
    player.startingUntil = currentTime + DECAY_DURATION;
    player.emit('play');
};

/**
 * Host for the Sound Remix extension: blocks that start and stop a sprite's
 * sounds individually, from any point in the sound.
 */
class Scratch3SoundRemixBlocks {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;

        /**
         * Sound IDs being waited on by "until done" blocks, keyed by target ID,
         * so they can be stopped along with the scripts waiting on them.
         * @type {Object.<string, Set.<string>>}
         */
        this.waitingSounds = {};

        this._stopWaitingSoundsForTarget = this._stopWaitingSoundsForTarget.bind(this);
        this.runtime.on('STOP_FOR_TARGET', this._stopWaitingSoundsForTarget);
        this.runtime.on('PROJECT_STOP_ALL', () => {
            this.waitingSounds = {};
        });
    }

    getInfo () {
        const soundArg = {
            type: ArgumentType.STRING,
            menu: 'SOUND',
            defaultValue: this._getDefaultSoundName()
        };
        return {
            id: 'soundRemix',
            name: formatMessage({
                id: 'soundRemix.categoryName',
                default: 'Sound Remix',
                description: 'Label for the sound remix extension category'
            }),
            blockIconURI: blockIconURI,
            menuIconURI: menuIconURI,
            blocks: [
                {
                    opcode: 'startSoundAt',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'soundRemix.startSoundAt',
                        default: 'start sound [SOUND] at [START] seconds',
                        description: 'start playing a sound from a point in the sound, in seconds'
                    }),
                    arguments: {
                        SOUND: soundArg,
                        START: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: 'startSoundFromTo',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'soundRemix.startSoundFromTo',
                        default: 'start sound [SOUND] from [START] to [END] seconds',
                        description: 'start playing part of a sound, between two points in seconds'
                    }),
                    arguments: {
                        SOUND: soundArg,
                        START: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        },
                        END: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0.5
                        }
                    }
                },
                {
                    opcode: 'playSoundFromToUntilDone',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'soundRemix.playSoundFromToUntilDone',
                        default: 'play sound [SOUND] from [START] to [END] seconds until done',
                        description: 'play part of a sound, between two points in seconds, and wait for it to finish'
                    }),
                    arguments: {
                        SOUND: soundArg,
                        START: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        },
                        END: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0.5
                        }
                    }
                },
                {
                    opcode: 'stopSound',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'soundRemix.stopSound',
                        default: 'stop sound [SOUND]',
                        description: 'stop one sound that is playing, leaving other sounds playing'
                    }),
                    arguments: {
                        SOUND: soundArg
                    }
                }
            ],
            menus: {
                SOUND: {
                    acceptReporters: true,
                    items: 'getSoundMenu'
                }
            }
        };
    }

    /**
     * The sound menu's default: the editing target's newest sound, matching the
     * default in the Sound category. The toolbox is regenerated whenever the
     * editing target changes, so this follows the selected sprite.
     * @returns {string} the name of the sound, or '' if there is none.
     * @private
     */
    _getDefaultSoundName () {
        const target = this.runtime.getEditingTarget();
        const sounds = target ? target.sprite.sounds : [];
        return sounds.length > 0 ? sounds[sounds.length - 1].name : '';
    }

    /**
     * @param {string} targetId - the ID of the target whose sounds to list.
     * @returns {Array.<string>} the names of the target's sounds.
     */
    getSoundMenu (targetId) {
        const target = this.runtime.getTargetById(targetId);
        const names = target ? target.sprite.sounds.map(sound => sound.name) : [];
        // Menus must have at least one item.
        return names.length > 0 ? names : [''];
    }

    /**
     * Find a sound by name, or else by 1-based number, the same way the Sound
     * category's blocks do.
     * @param {*} soundName - the sound menu value.
     * @param {RenderedTarget} target - the target whose sounds to search.
     * @returns {?object} the sound, or null if there is no match.
     * @private
     */
    _getSound (soundName, target) {
        const sounds = target.sprite.sounds;
        if (sounds.length === 0) {
            return null;
        }
        const name = Cast.toString(soundName);
        const byName = sounds.find(sound => sound.name === name);
        if (byName) {
            return byName;
        }
        const oneIndexedIndex = parseInt(name, 10);
        if (!isNaN(oneIndexedIndex)) {
            return sounds[MathUtil.wrapClamp(oneIndexedIndex - 1, 0, sounds.length - 1)];
        }
        return null;
    }

    /**
     * Play part of a sound through the sprite's sound bank, so the sound gets the
     * target's effects and volume and is stopped by "stop all sounds".
     * @param {object} args - the block arguments.
     * @param {BlockUtility} util - utility object provided by the runtime.
     * @param {boolean} hasEnd - whether to stop at `args.END` rather than the end.
     * @param {boolean} wait - whether the calling block waits for the sound to finish.
     * @returns {Promise|undefined} resolves when the sound finishes, if it started.
     * @private
     */
    _playSound (args, util, hasEnd, wait) {
        const {target} = util;
        const {soundBank} = target.sprite;
        const sound = this._getSound(args.SOUND, target);
        if (!sound || !soundBank) {
            return;
        }
        const player = soundBank.getSoundPlayer(sound.soundId);
        const length = player.buffer.duration;
        const start = MathUtil.clamp(Cast.toNumber(args.START), 0, length);
        const end = hasEnd ? MathUtil.clamp(Cast.toNumber(args.END), 0, length) : length;
        if (end <= start) {
            return;
        }

        if (wait) {
            if (!this.waitingSounds[target.id]) {
                this.waitingSounds[target.id] = new Set();
            }
            this.waitingSounds[target.id].add(sound.soundId);
        } else if (this.waitingSounds[target.id]) {
            this.waitingSounds[target.id].delete(sound.soundId);
        }

        // SoundBank.playSound wires up the effects and then calls player.play;
        // shadow play on this player for the call so playback starts at the offset.
        player.play = () => startPlayerAt(player, start, end - start);
        try {
            return soundBank.playSound(target, sound.soundId);
        } finally {
            delete player.play;
        }
    }

    startSoundAt (args, util) {
        this._playSound(args, util, false, false);
    }

    startSoundFromTo (args, util) {
        this._playSound(args, util, true, false);
    }

    playSoundFromToUntilDone (args, util) {
        return this._playSound(args, util, true, true);
    }

    stopSound (args, util) {
        const {target} = util;
        const sound = this._getSound(args.SOUND, target);
        if (sound && target.sprite.soundBank) {
            target.sprite.soundBank.stop(target, sound.soundId);
        }
    }

    /**
     * Stop the sounds that a target's stopped scripts were waiting on.
     * @param {RenderedTarget} target - the target whose scripts were stopped.
     * @private
     */
    _stopWaitingSoundsForTarget (target) {
        const waiting = this.waitingSounds[target.id];
        if (!waiting || !target.sprite.soundBank) {
            return;
        }
        for (const soundId of waiting) {
            target.sprite.soundBank.stop(target, soundId);
        }
        waiting.clear();
    }
}

module.exports = Scratch3SoundRemixBlocks;
