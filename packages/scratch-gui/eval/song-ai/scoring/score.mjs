// Combine metrics into a per-sample aggregate, and aggregate samples per case.
import {METRICS} from './metrics.mjs';

// out/golden are scoring views; ctx = {unit, case, setting}.
export const scoreSample = (out, golden, ctx, weights) => {
    const perMetric = {};
    let wsum = 0;
    let acc = 0;
    for (const [name, fn] of Object.entries(METRICS)) {
        let v = null;
        try {
            v = fn(out, golden, ctx);
        } catch (e) {
            v = null;
        }
        perMetric[name] = v;
        if (v !== null && weights[name]) {
            acc += v * weights[name];
            wsum += weights[name];
        }
    }
    return {aggregate: wsum ? acc / wsum : 0, perMetric};
};

const mean = xs => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const std = xs => {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(mean(xs.map(x => (x - m) ** 2)));
};

// samples: array of {aggregate, perMetric}. Returns case-level rollup.
export const aggregateSamples = samples => {
    const aggs = samples.map(s => s.aggregate);
    const metricNames = Object.keys(METRICS);
    const perMetricMean = {};
    for (const name of metricNames) {
        const vals = samples.map(s => s.perMetric[name]).filter(v => v !== null && v !== undefined);
        perMetricMean[name] = vals.length ? mean(vals) : null;
    }
    // The weakest applicable metric is the most useful pointer for improvement.
    let weakest = null;
    for (const [name, v] of Object.entries(perMetricMean)) {
        if (v === null) continue;
        if (weakest === null || v < weakest.value) weakest = {name, value: v};
    }
    return {
        mean: mean(aggs),
        best: aggs.length ? Math.max(...aggs) : null,
        std: std(aggs),
        n: samples.length,
        perMetricMean,
        weakest
    };
};
