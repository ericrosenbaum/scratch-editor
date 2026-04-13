const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const MathUtil = require('../../util/math-util');
const formatMessage = require('format-message');

/**
 * Icon svg to be displayed at the left edge of each extension block, encoded as a data URI.
 * @type {string}
 */
// eslint-disable-next-line @stylistic/max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHJ4PSI0IiBmaWxsPSIjRjI3OTJEIi8+PGcgZmlsbD0iI2ZmZiI+PHJlY3QgeD0iNiIgeT0iMjAiIHdpZHRoPSI0IiBoZWlnaHQ9IjEyIi8+PHJlY3QgeD0iMTIiIHk9IjE0IiB3aWR0aD0iNCIgaGVpZ2h0PSIxOCIvPjxyZWN0IHg9IjE4IiB5PSI4IiB3aWR0aD0iNCIgaGVpZ2h0PSIyNCIvPjxyZWN0IHg9IjI0IiB5PSIxNCIgd2lkdGg9IjQiIGhlaWdodD0iMTgiLz48cmVjdCB4PSIzMCIgeT0iMjAiIHdpZHRoPSI0IiBoZWlnaHQ9IjEyIi8+PC9nPjwvc3ZnPg==';

/**
 * Icon svg to be displayed in the category menu, encoded as a data URI.
 * @type {string}
 */
// eslint-disable-next-line @stylistic/max-len
const menuIconURI = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHJ4PSIyIiBmaWxsPSIjRjI3OTJEIi8+PGcgZmlsbD0iI2ZmZiI+PHJlY3QgeD0iMyIgeT0iMTAiIHdpZHRoPSIyIiBoZWlnaHQ9IjYiLz48cmVjdCB4PSI2IiB5PSI3IiB3aWR0aD0iMiIgaGVpZ2h0PSI5Ii8+PHJlY3QgeD0iOSIgeT0iNCIgd2lkdGg9IjIiIGhlaWdodD0iMTIiLz48cmVjdCB4PSIxMiIgeT0iNyIgd2lkdGg9IjIiIGhlaWdodD0iOSIvPjxyZWN0IHg9IjE1IiB5PSIxMCIgd2lkdGg9IjIiIGhlaWdodD0iNiIvPjwvZz48L3N2Zz4=';

/**
 * Map of interval names to their size in quarter-note beats.
 * @type {object}
 */
const INTERVAL_BEATS = {
    whole: 4,
    half: 2,
    quarter: 1,
    eighth: 0.5,
    sixteenth: 0.25
};

/**
 * Tempo range in BPM.
 */
const TEMPO_MIN = 20;
const TEMPO_MAX = 500;
const TEMPO_DEFAULT = 120;

/**
 * Small offset in beats used when computing the next boundary, to avoid
 * immediately re-firing the boundary we just crossed due to floating-point
 * precision.
 * @type {number}
 */
const BEAT_EPSILON = 1e-6;

/**
 * Class for the musical timing extension in Scratch 3.0.
 * Provides a steady temporal grid that triggers hat blocks at musical time intervals.
 *
 * Uses a self-correcting setTimeout chain driven by AudioContext.currentTime.
 * Each scheduled wake-up targets the next beat boundary directly in audio-clock
 * seconds, fires the matching hats via runtime.startHats() with field matching,
 * then re-targets the next absolute boundary. The audio clock is monotonic and
 * sample-accurate, so timing does not drift under event-loop load and is not
 * coupled to the VM frame rate.
 *
 * @param {Runtime} runtime - the runtime instantiating this block package.
 * @class
 */
class Scratch3MusicalTimingBlocks {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;

        // Register on the runtime so other components (GUI, tests) can access this extension
        this.runtime.ext_musicalTiming = this;

        /**
         * Whether the beat engine is currently running.
         * @type {boolean}
         */
        this._running = false;

        /**
         * Current tempo in beats per minute.
         * @type {number}
         */
        this._tempo = TEMPO_DEFAULT;

        /**
         * Elapsed beats at the time of the last tempo change or start,
         * used to maintain beat continuity across tempo changes.
         * @type {number}
         */
        this._beatsAtLastReset = 0;

        /**
         * Audio-clock time (seconds) corresponding to _beatsAtLastReset.
         * Rebased on start and on tempo change so that elapsed beats can be
         * computed as _beatsAtLastReset + (now - _audioStartTime) * tempo/60.
         * @type {number}
         */
        this._audioStartTime = 0;

        /**
         * Map of interval name to the last interval index that was fired.
         * @type {object}
         */
        this._lastFiredInterval = {};

        /**
         * Handle for the pending self-correcting setTimeout.
         * @type {number|null}
         */
        this._timerHandle = null;

        this._resetLastFired();

        this.runtime.on('PROJECT_STOP_ALL', () => {
            this._stop();
        });
    }

    /**
     * Reset the last-fired tracking for all intervals.
     * @private
     */
    _resetLastFired () {
        for (const key in INTERVAL_BEATS) {
            this._lastFiredInterval[key] = -1;
        }
    }

    /**
     * Read the current audio-clock time in seconds. Falls back to
     * performance.now() when no audio engine is attached (e.g. headless tests).
     * @returns {number} Current time in seconds on a monotonic clock.
     * @private
     */
    _getAudioTime () {
        const engine = this.runtime.audioEngine;
        if (engine && engine.audioContext) {
            return engine.audioContext.currentTime;
        }
        return performance.now() / 1000;
    }

    /**
     * Compute the current elapsed beats from the audio clock and tempo.
     * @returns {number} Elapsed beats since the beat engine started.
     * @private
     */
    _getElapsedBeats () {
        const deltaSeconds = this._getAudioTime() - this._audioStartTime;
        return this._beatsAtLastReset + (deltaSeconds * this._tempo / 60);
    }

    /**
     * Convert a target beat count (measured from the current tempo segment's
     * origin) back into an absolute audio-clock time in seconds.
     * @param {number} targetBeats - beat count on the same scale as _getElapsedBeats.
     * @returns {number} Audio-clock time in seconds.
     * @private
     */
    _beatsToAudioTime (targetBeats) {
        const beatsSinceReset = targetBeats - this._beatsAtLastReset;
        return this._audioStartTime + (beatsSinceReset * 60 / this._tempo);
    }

    /**
     * Schedule the next self-correcting wake-up at the soonest upcoming beat
     * boundary across all intervals.
     * @private
     */
    _scheduleNextTick () {
        if (!this._running) return;

        const elapsedBeats = this._getElapsedBeats();

        let nextBoundaryBeats = Infinity;
        for (const interval in INTERVAL_BEATS) {
            const beatsPerInterval = INTERVAL_BEATS[interval];
            const nextIndex = Math.floor(
                (elapsedBeats + BEAT_EPSILON) / beatsPerInterval
            ) + 1;
            const boundary = nextIndex * beatsPerInterval;
            if (boundary < nextBoundaryBeats) {
                nextBoundaryBeats = boundary;
            }
        }

        const targetAudioTime = this._beatsToAudioTime(nextBoundaryBeats);
        const delayMs = Math.max(
            0, (targetAudioTime - this._getAudioTime()) * 1000
        );

        this._timerHandle = setTimeout(() => this._onTick(), delayMs);
    }

    /**
     * Scheduler callback: fire any interval hats whose boundaries have been
     * crossed since the last tick, then re-target the next boundary.
     * @private
     */
    _onTick () {
        this._timerHandle = null;
        if (!this._running) return;

        const elapsedBeats = this._getElapsedBeats();

        for (const interval in INTERVAL_BEATS) {
            const beatsPerInterval = INTERVAL_BEATS[interval];
            const currentIndex = Math.floor(
                (elapsedBeats + BEAT_EPSILON) / beatsPerInterval
            );

            if (currentIndex > this._lastFiredInterval[interval]) {
                this._lastFiredInterval[interval] = currentIndex;
                // Field matching works because both sides are uppercased:
                //   - blocks-runtime-cache.js uppercases cached field values
                //   - runtime.startHats uppercases match field values
                this.runtime.startHats('musicalTiming_whenBeat', {
                    INTERVAL: interval
                });
            }
        }

        this._scheduleNextTick();
    }

    /**
     * Internal stop: clear running state and cancel any pending wake-up.
     * @private
     */
    _stop () {
        this._running = false;
        if (this._timerHandle !== null) {
            clearTimeout(this._timerHandle);
            this._timerHandle = null;
        }
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'musicalTiming',
            name: formatMessage({
                id: 'musicalTiming.categoryName',
                default: 'Musical Timing',
                description: 'Label for the Musical Timing extension category'
            }),
            menuIconURI: menuIconURI,
            blockIconURI: blockIconURI,
            blocks: [
                {
                    opcode: 'startBeat',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'musicalTiming.startBeat',
                        default: 'start beat',
                        description: 'Start the musical timing engine'
                    })
                },
                {
                    opcode: 'stopBeat',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'musicalTiming.stopBeat',
                        default: 'stop beat',
                        description: 'Stop the musical timing engine'
                    })
                },
                {
                    opcode: 'whenBeat',
                    blockType: BlockType.HAT,
                    text: formatMessage({
                        id: 'musicalTiming.whenBeat',
                        default: 'when [INTERVAL] note',
                        description: 'Hat block that triggers on musical beat intervals'
                    }),
                    isEdgeActivated: false,
                    shouldRestartExistingThreads: true,
                    arguments: {
                        INTERVAL: {
                            type: ArgumentType.STRING,
                            menu: 'INTERVAL',
                            defaultValue: 'quarter'
                        }
                    }
                },
                {
                    opcode: 'setTempo',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'musicalTiming.setTempo',
                        default: 'set tempo to [TEMPO] bpm',
                        description: 'Set the tempo in beats per minute'
                    }),
                    arguments: {
                        TEMPO: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 120
                        }
                    }
                },
                {
                    opcode: 'getTempo',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'musicalTiming.getTempo',
                        default: 'tempo',
                        description: 'Reports the current tempo in BPM'
                    })
                },
                {
                    opcode: 'getBeatNumber',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'musicalTiming.getBeatNumber',
                        default: 'beat number',
                        description: 'Reports the current beat number (quarter notes elapsed)'
                    })
                }
            ],
            menus: {
                INTERVAL: {
                    acceptReporters: false,
                    items: [
                        {
                            text: formatMessage({
                                id: 'musicalTiming.interval.whole',
                                default: 'whole',
                                description: 'Whole note interval (4 beats)'
                            }),
                            value: 'whole'
                        },
                        {
                            text: formatMessage({
                                id: 'musicalTiming.interval.half',
                                default: 'half',
                                description: 'Half note interval (2 beats)'
                            }),
                            value: 'half'
                        },
                        {
                            text: formatMessage({
                                id: 'musicalTiming.interval.quarter',
                                default: 'quarter',
                                description: 'Quarter note interval (1 beat)'
                            }),
                            value: 'quarter'
                        },
                        {
                            text: formatMessage({
                                id: 'musicalTiming.interval.eighth',
                                default: 'eighth',
                                description: 'Eighth note interval (half beat)'
                            }),
                            value: 'eighth'
                        },
                        {
                            text: formatMessage({
                                id: 'musicalTiming.interval.sixteenth',
                                default: 'sixteenth',
                                description: 'Sixteenth note interval (quarter beat)'
                            }),
                            value: 'sixteenth'
                        }
                    ]
                }
            }
        };
    }

    /**
     * Start the musical timing engine.
     */
    startBeat () {
        this._stop();
        this._running = true;
        this._beatsAtLastReset = 0;
        this._audioStartTime = this._getAudioTime();
        this._resetLastFired();
        this._scheduleNextTick();
    }

    /**
     * Stop the musical timing engine.
     */
    stopBeat () {
        this._stop();
    }

    /**
     * Hat predicate for whenBeat. With isEdgeActivated: false, startHats()
     * triggers matching scripts and then execute() calls this predicate.
     * Returning true allows the thread to proceed; returning false retires it.
     * Field matching in startHats already ensures only the correct interval
     * blocks are triggered, so this just gates on the running state.
     * @returns {boolean} true if the beat engine is running.
     */
    whenBeat () {
        return this._running;
    }

    /**
     * Set the tempo, maintaining beat continuity.
     * @param {object} args - the block arguments.
     * @param {number} args.TEMPO - the new tempo in BPM.
     */
    setTempo (args) {
        const newTempo = MathUtil.clamp(
            Cast.toNumber(args.TEMPO), TEMPO_MIN, TEMPO_MAX
        );

        if (this._running) {
            // Preserve current beat position across tempo change, then
            // re-target the next boundary under the new tempo.
            this._beatsAtLastReset = this._getElapsedBeats();
            this._audioStartTime = this._getAudioTime();
            this._tempo = newTempo;
            if (this._timerHandle !== null) {
                clearTimeout(this._timerHandle);
                this._timerHandle = null;
            }
            this._scheduleNextTick();
        } else {
            this._tempo = newTempo;
        }
    }

    /**
     * Get the current tempo.
     * @returns {number} the current tempo in BPM.
     */
    getTempo () {
        return this._tempo;
    }

    /**
     * Get the current beat number (1-indexed quarter note count).
     * @returns {number} the current beat number.
     */
    getBeatNumber () {
        if (!this._running) return 0;
        return Math.floor(this._getElapsedBeats()) + 1;
    }
}

module.exports = Scratch3MusicalTimingBlocks;
