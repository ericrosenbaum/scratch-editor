const test = require('tap').test;
const EventEmitter = require('events');
const SoundRemix = require('../../src/extensions/scratch3_sound_remix/index.js');

/**
 * A stand-in for scratch-audio's SoundPlayer that records how its buffer
 * source is started.
 */
class FakePlayer extends EventEmitter {
    constructor () {
        super();
        this.buffer = {duration: 2};
        this.audioEngine = {currentTime: 0, DECAY_DURATION: 0.025};
        this.initialized = false;
        this.isPlaying = false;
        this.starts = [];
        this.stops = 0;
    }
    initialize () {
        this.initialized = true;
        this._createSource();
    }
    _createSource () {
        this.outputNode = {start: (...args) => this.starts.push(args)};
    }
    play () {
        throw new Error('SoundPlayer.play should be shadowed during playback');
    }
    stop () {
        this.stops++;
        this.isPlaying = false;
        this.emit('stop');
    }
}

const makeFixture = () => {
    const player = new FakePlayer();
    const played = [];
    const soundBank = {
        getSoundPlayer: () => player,
        playSound: (target, soundId) => {
            played.push(soundId);
            player.play();
            return new Promise(resolve => player.once('stop', resolve));
        },
        stop: (target, soundId) => {
            played.push(`stop ${soundId}`);
            player.stop();
        }
    };
    const target = {
        id: 'target1',
        sprite: {
            soundBank,
            sounds: [{name: 'meow', soundId: 's1'}, {name: 'pop', soundId: 's2'}]
        }
    };
    const handlers = {};
    const runtime = {
        on: (event, handler) => {
            handlers[event] = handler;
        },
        getEditingTarget: () => target,
        getTargetById: id => (id === target.id ? target : null)
    };
    return {player, played, target, handlers, util: {target}, blocks: new SoundRemix(runtime)};
};

test('start sound at an offset plays to the end of the sound', t => {
    const {player, played, util, blocks} = makeFixture();
    blocks.startSoundAt({SOUND: 'meow', START: 0.5}, util);
    t.same(played, ['s1']);
    t.same(player.starts, [[0, 0.5, 1.5]]);
    t.ok(player.isPlaying);
    t.equal(player.play, FakePlayer.prototype.play, 'play is restored after starting');
    t.end();
});

test('start sound from/to plays only that segment, clamped to the sound', t => {
    const {player, util, blocks} = makeFixture();
    blocks.startSoundFromTo({SOUND: 'meow', START: 1.5, END: 10}, util);
    t.same(player.starts, [[0, 1.5, 0.5]]);
    t.end();
});

test('an empty or reversed segment does not play', t => {
    const {played, util, blocks} = makeFixture();
    blocks.startSoundFromTo({SOUND: 'meow', START: 1, END: 1}, util);
    blocks.startSoundFromTo({SOUND: 'meow', START: 1.5, END: 0.5}, util);
    t.same(played, []);
    t.end();
});

test('a playing sound is restarted at the new offset', t => {
    const {player, util, blocks} = makeFixture();
    blocks.startSoundAt({SOUND: 'meow', START: 0}, util);
    blocks.startSoundAt({SOUND: 'meow', START: 1}, util);
    t.equal(player.stops, 1);
    t.same(player.starts, [[0, 0, 2], [0, 1, 1]]);
    t.end();
});

test('sounds can be chosen by number', t => {
    const {played, util, blocks} = makeFixture();
    blocks.startSoundAt({SOUND: '2', START: 0}, util);
    blocks.startSoundAt({SOUND: 'missing', START: 0}, util);
    t.same(played, ['s2']);
    t.end();
});

test('play until done resolves when the sound stops', t => {
    const {player, util, blocks} = makeFixture();
    const done = blocks.playSoundFromToUntilDone({SOUND: 'meow', START: 0, END: 1}, util);
    t.ok(done instanceof Promise);
    player.stop();
    return done;
});

test('stop sound stops only the chosen sound', t => {
    const {played, util, blocks} = makeFixture();
    blocks.stopSound({SOUND: 'pop'}, util);
    t.same(played, ['stop s2']);
    t.end();
});

test('stopping a target\'s scripts stops the sounds they wait on', t => {
    const {played, target, handlers, util, blocks} = makeFixture();
    blocks.playSoundFromToUntilDone({SOUND: 'meow', START: 0, END: 1}, util);
    handlers.STOP_FOR_TARGET(target);
    t.same(played, ['s1', 'stop s1']);
    t.end();
});

test('sound menu lists the target\'s sounds and defaults to the newest', t => {
    const {target, blocks} = makeFixture();
    t.same(blocks.getSoundMenu(target.id), ['meow', 'pop']);
    t.same(blocks.getSoundMenu('nobody'), ['']);
    t.equal(blocks.getInfo().blocks[0].arguments.SOUND.defaultValue, 'pop');
    t.end();
});
