const path = require('path');
const test = require('tap').test;
const makeTestStorage = require('../fixtures/make-test-storage');
const readFileToBuffer = require('../fixtures/readProjectFile').readFileToBuffer;
const VirtualMachine = require('../../src/index');
const Runtime = require('../../src/engine/runtime');

const quarterUri = path.resolve(__dirname, '../fixtures/musical-timing-quarter.sb3');
const quarterProject = readFileToBuffer(quarterUri);

const mixedUri = path.resolve(__dirname, '../fixtures/musical-timing-mixed.sb3');
const mixedProject = readFileToBuffer(mixedUri);

/**
 * Helper to get a variable value from the stage by variable ID.
 */
const getStageVariable = (vm, varId) => {
    const stage = vm.runtime.getTargetForStage();
    if (stage && stage.variables[varId]) {
        return stage.variables[varId].value;
    }
    return undefined;
};

/**
 * Helper to get the musical timing extension instance from the runtime.
 */
const getExtension = vm => {
    // The extension registers itself; find it via the runtime's service infrastructure
    // For built-in extensions loaded synchronously, the instance is stored internally.
    // We can access extension state through ext_ on the runtime if registered,
    // or by loading it directly.
    return vm.runtime.ext_musicalTiming;
};

test('extension loads and provides correct block info', t => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());

    vm.loadProject(quarterProject).then(() => {
        const ext = getExtension(vm);
        t.ok(ext, 'Extension instance exists on runtime');

        const info = ext.getInfo();
        t.equal(info.id, 'musicalTiming', 'Extension ID is correct');
        t.equal(info.blocks.length, 6, 'Has 6 blocks');

        const opcodes = info.blocks.map(b => b.opcode);
        t.ok(opcodes.includes('startBeat'), 'Has startBeat block');
        t.ok(opcodes.includes('stopBeat'), 'Has stopBeat block');
        t.ok(opcodes.includes('whenBeat'), 'Has whenBeat hat block');
        t.ok(opcodes.includes('setTempo'), 'Has setTempo block');
        t.ok(opcodes.includes('getTempo'), 'Has getTempo block');
        t.ok(opcodes.includes('getBeatNumber'), 'Has getBeatNumber block');

        t.equal(info.menus.INTERVAL.items.length, 5, 'Has 5 interval menu items');

        vm.quit();
        t.end();
    });
});

test('initial extension state', t => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());

    vm.loadProject(quarterProject).then(() => {
        const ext = getExtension(vm);

        t.equal(ext._running, false, 'Not running initially');
        t.equal(ext._tempo, 120, 'Default tempo is 120 BPM');
        t.equal(ext.getTempo(), 120, 'getTempo returns 120');
        t.equal(ext.getBeatNumber(), 0, 'Beat number is 0 when not running');

        vm.quit();
        t.end();
    });
});

test('start and stop beat controls', t => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());

    vm.loadProject(quarterProject).then(() => {
        const ext = getExtension(vm);

        ext.startBeat();
        t.equal(ext._running, true, 'Running after startBeat');
        t.ok(ext.getBeatNumber() >= 1, 'Beat number >= 1 after start');

        ext.stopBeat();
        t.equal(ext._running, false, 'Not running after stopBeat');
        t.equal(ext.getBeatNumber(), 0, 'Beat number is 0 after stop');

        vm.quit();
        t.end();
    });
});

test('setTempo clamps to valid range', t => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());

    vm.loadProject(quarterProject).then(() => {
        const ext = getExtension(vm);

        ext.setTempo({TEMPO: 200});
        t.equal(ext.getTempo(), 200, 'Tempo set to 200');

        ext.setTempo({TEMPO: 10});
        t.equal(ext.getTempo(), 20, 'Tempo clamped to minimum 20');

        ext.setTempo({TEMPO: 1000});
        t.equal(ext.getTempo(), 500, 'Tempo clamped to maximum 500');

        ext.setTempo({TEMPO: 'abc'});
        t.equal(ext.getTempo(), 20, 'Non-numeric tempo coerced to 0, clamped to 20');

        vm.quit();
        t.end();
    });
});

test('whenBeat predicate returns false when not running', t => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());

    vm.loadProject(quarterProject).then(() => {
        const ext = getExtension(vm);

        t.equal(ext.whenBeat({INTERVAL: 'quarter'}), false,
            'Predicate is false when engine not running');

        vm.quit();
        t.end();
    });
});

test('whenBeat predicate fires on beat boundaries', t => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());

    vm.loadProject(quarterProject).then(() => {
        const ext = getExtension(vm);

        // Set high tempo so beats come quickly: 60000 BPM = 1 beat per ms
        ext.setTempo({TEMPO: 500});
        ext.startBeat();

        // At 500 BPM, one beat = 120ms. Wait a bit to cross a beat boundary.
        setTimeout(() => {
            const result = ext.whenBeat({INTERVAL: 'quarter'});
            t.equal(result, true, 'First call after beat boundary returns true');

            // Immediately calling again should return false (same interval index)
            const result2 = ext.whenBeat({INTERVAL: 'quarter'});
            t.equal(result2, false, 'Consecutive call returns false (no new boundary)');

            ext.stopBeat();
            vm.quit();
            t.end();
        }, 150);
    });
});

test('whenBeat returns false for unknown interval', t => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());

    vm.loadProject(quarterProject).then(() => {
        const ext = getExtension(vm);
        ext.startBeat();

        t.equal(ext.whenBeat({INTERVAL: 'invalid'}), false,
            'Unknown interval returns false');

        ext.stopBeat();
        vm.quit();
        t.end();
    });
});

test('quarter note hat fires in fixture project via VM stepping', t => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());

    vm.loadProject(quarterProject).then(() => {
        const ext = getExtension(vm);

        // Set tempo to 480 BPM = 8 beats per second = 125ms per beat
        // This means in ~600ms we should get ~4 beats
        ext._tempo = 480;

        // Start the VM manually
        vm.runtime.currentStepTime = Runtime.THREAD_STEP_INTERVAL;
        vm.setCompatibilityMode(false);
        vm.setTurboMode(false);

        // Green flag starts the beat engine
        vm.greenFlag();

        // Let the VM run for ~600ms by stepping at intervals
        const startTime = Date.now();
        const intervalId = setInterval(() => {
            vm.runtime._step();
        }, Runtime.THREAD_STEP_INTERVAL);

        setTimeout(() => {
            clearInterval(intervalId);
            const beatCount = getStageVariable(vm, 'beatCount');
            t.comment(`Beat count after ~600ms at 480 BPM: ${beatCount}`);

            // At 480 BPM, 1 beat = 125ms. In 600ms, expect ~4 beats.
            // Allow tolerance for timing imprecision.
            t.ok(beatCount >= 3, `Beat count (${beatCount}) should be >= 3`);
            t.ok(beatCount <= 7, `Beat count (${beatCount}) should be <= 7`);

            vm.stopAll();
            vm.quit();
            t.end();
        }, 650);
    });
});

test('mixed intervals: eighth fires ~2x as often as quarter', t => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());

    vm.loadProject(mixedProject).then(() => {
        const ext = getExtension(vm);

        // 480 BPM = 125ms per quarter note
        ext._tempo = 480;

        vm.runtime.currentStepTime = Runtime.THREAD_STEP_INTERVAL;
        vm.setCompatibilityMode(false);
        vm.setTurboMode(false);

        vm.greenFlag();

        const intervalId = setInterval(() => {
            vm.runtime._step();
        }, Runtime.THREAD_STEP_INTERVAL);

        setTimeout(() => {
            clearInterval(intervalId);
            const quarterCount = getStageVariable(vm, 'quarterCount');
            const eighthCount = getStageVariable(vm, 'eighthCount');
            t.comment(`Quarter count: ${quarterCount}, Eighth count: ${eighthCount}`);

            t.ok(quarterCount >= 2, `Quarter count (${quarterCount}) should be >= 2`);
            t.ok(eighthCount >= 4, `Eighth count (${eighthCount}) should be >= 4`);

            // Eighth should be roughly 2x quarter (with some tolerance)
            const ratio = eighthCount / quarterCount;
            t.ok(ratio >= 1.5, `Ratio (${ratio.toFixed(2)}) should be >= 1.5`);
            t.ok(ratio <= 2.5, `Ratio (${ratio.toFixed(2)}) should be <= 2.5`);

            vm.stopAll();
            vm.quit();
            t.end();
        }, 650);
    });
});

test('stop beat prevents further hat firing', t => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());

    vm.loadProject(quarterProject).then(() => {
        const ext = getExtension(vm);

        // Use very fast tempo so we get quick beats
        ext._tempo = 480;

        vm.runtime.currentStepTime = Runtime.THREAD_STEP_INTERVAL;
        vm.setCompatibilityMode(false);
        vm.setTurboMode(false);

        vm.greenFlag();

        const intervalId = setInterval(() => {
            vm.runtime._step();
        }, Runtime.THREAD_STEP_INTERVAL);

        // Let beats accumulate for 300ms, then stop
        setTimeout(() => {
            ext.stopBeat();
            const countAtStop = getStageVariable(vm, 'beatCount');
            t.comment(`Count at stop: ${countAtStop}`);
            t.ok(countAtStop >= 1, 'Some beats fired before stop');

            // Wait another 300ms with engine stopped
            setTimeout(() => {
                clearInterval(intervalId);
                const countAfterWait = getStageVariable(vm, 'beatCount');
                t.comment(`Count after wait: ${countAfterWait}`);

                // Beat count should not have increased after stopping
                t.equal(countAfterWait, countAtStop,
                    'Beat count did not increase after stopping');

                vm.stopAll();
                vm.quit();
                t.end();
            }, 350);
        }, 350);
    });
});

test('tempo change affects beat timing', t => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());

    vm.loadProject(quarterProject).then(() => {
        const ext = getExtension(vm);

        ext.startBeat();

        // At 60 BPM: 1 beat per second
        ext.setTempo({TEMPO: 60});

        // After 500ms at 60 BPM, elapsed beats = 0.5 (no boundary crossed yet beyond initial)
        setTimeout(() => {
            const beatsAt60 = ext._getElapsedBeats();
            t.comment(`Elapsed beats after 500ms at 60 BPM: ${beatsAt60.toFixed(2)}`);
            t.ok(beatsAt60 >= 0.4, `Elapsed beats (${beatsAt60.toFixed(2)}) >= 0.4`);
            t.ok(beatsAt60 <= 0.7, `Elapsed beats (${beatsAt60.toFixed(2)}) <= 0.7`);

            // Now change to 240 BPM (4 beats per second)
            ext.setTempo({TEMPO: 240});

            // After another 500ms at 240 BPM, should add 2 more beats
            setTimeout(() => {
                const totalBeats = ext._getElapsedBeats();
                t.comment(`Total elapsed beats: ${totalBeats.toFixed(2)}`);
                // Should be ~0.5 (from first period) + ~2.0 (from second period) = ~2.5
                t.ok(totalBeats >= 2.0, `Total beats (${totalBeats.toFixed(2)}) >= 2.0`);
                t.ok(totalBeats <= 3.2, `Total beats (${totalBeats.toFixed(2)}) <= 3.2`);

                ext.stopBeat();
                vm.quit();
                t.end();
            }, 500);
        }, 500);
    });
});

test('beat number reporter tracks quarter notes', t => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());

    vm.loadProject(quarterProject).then(() => {
        const ext = getExtension(vm);

        t.equal(ext.getBeatNumber(), 0, 'Beat number is 0 before starting');

        ext.setTempo({TEMPO: 500});
        ext.startBeat();

        // At 500 BPM, 1 beat = 120ms. After 300ms should be beat ~2-3
        setTimeout(() => {
            const beatNum = ext.getBeatNumber();
            t.comment(`Beat number after 300ms at 500 BPM: ${beatNum}`);
            t.ok(beatNum >= 2, `Beat number (${beatNum}) >= 2`);
            t.ok(beatNum <= 4, `Beat number (${beatNum}) <= 4`);

            ext.stopBeat();
            vm.quit();
            t.end();
        }, 300);
    });
});

test('PROJECT_STOP_ALL stops the beat engine', t => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());

    vm.loadProject(quarterProject).then(() => {
        const ext = getExtension(vm);

        ext.startBeat();
        t.equal(ext._running, true, 'Running after start');

        vm.stopAll();
        t.equal(ext._running, false, 'Stopped after PROJECT_STOP_ALL');

        vm.quit();
        t.end();
    });
});
