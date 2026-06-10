// Run the Magenta provider over every case N times, score each sample against
// the committed golden, aggregate, and report (with deltas vs the baseline).
// The scoring/report machinery lives in lib/score-run.mjs and is shared with the
// browser-driven Gemma 4 path (commands/run-browser.mjs); here we only supply the
// Node execution of one operation.
import * as tf from '@tensorflow/tfjs';

import {DEFAULT_SAMPLES, SUT_PROVIDER_ID, PATHS} from '../config.mjs';
import {runOperation} from '../lib/orchestrate.mjs';
import {runScoredEval} from '../lib/score-run.mjs';

export const runEval = async flags => {
    await tf.setBackend('cpu');
    await tf.ready();

    const samples = Math.max(1, parseInt(flags.samples, 10) || DEFAULT_SAMPLES);
    const runOp = async (testCase, seed) => {
        const {result} = await runOperation({testCase, seed, providerId: SUT_PROVIDER_ID});
        return result;
    };

    await runScoredEval({
        flags,
        runOp,
        providerId: SUT_PROVIDER_ID,
        baselineFile: PATHS.baselineFile,
        samples
    });
};
