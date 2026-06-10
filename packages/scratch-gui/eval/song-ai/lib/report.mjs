// Format a results object (optionally diffed against a baseline) into a text
// report for results/<runId>/report.txt and the console.
import {CATEGORIES} from '../config.mjs';
import {fmt, fmtDelta, table} from './table.mjs';

const catMeta = id => CATEGORIES.find(c => c.id === id) || {label: id, knownGap: false};

export const formatReport = (results, baseline) => {
    const lines = [];
    lines.push(`Song-Maker eval — run ${results.runId}`);
    lines.push(`provider=${results.provider || 'magenta'}  samples=${results.samples}  judge=${results.judge ? 'on' : 'off'}` +
        (baseline ? `  (vs baseline ${baseline.runId || baseline.generatedAt || ''})` : ''));
    lines.push('');

    // --- Category summary ---
    const baseCat = id => (baseline && baseline.categories || []).find(c => c.id === id);
    const catRows = results.categories.map(c => {
        const b = baseCat(c.id);
        const delta = b && typeof b.mean === 'number' && typeof c.mean === 'number' ?
            fmtDelta(c.mean - b.mean) : '';
        return [
            c.id + (catMeta(c.id).knownGap ? ' *' : ''),
            String(c.nCases),
            fmt(c.mean),
            delta
        ];
    });
    lines.push('CATEGORY SCORES  (* = known gap, excluded from gate until Coconet/MusicVAE)');
    lines.push(table(['category', 'cases', 'mean', 'Δ vs base'], catRows));
    lines.push('');

    // --- Per-case ---
    const baseCase = id => (baseline && baseline.cases || []).find(c => c.id === id);
    const caseRows = results.cases.map(c => {
        if (c.error) return [c.id, 'ERROR', '', '', '', c.error.slice(0, 40), ''];
        const b = baseCase(c.id);
        const delta = b && typeof b.mean === 'number' ? fmtDelta(c.mean - b.mean) : '';
        const weak = c.weakest ? `${c.weakest.name}=${fmt(c.weakest.value, 2)}` : '';
        const judge = c.judge ?
            `mus${c.judge.musicality}/adh${c.judge.promptAdherence}/sim${c.judge.similarityToGolden}` : '';
        return [c.id, fmt(c.mean), fmt(c.best, 2), `±${fmt(c.std, 2)}`, delta, weak, judge];
    });
    lines.push('PER-CASE');
    lines.push(table(
        ['case', 'mean', 'best', 'std', 'Δ', 'weakest metric', results.judge ? 'judge' : ''],
        caseRows
    ));
    lines.push('');

    // --- Regression callout (non-gap categories only) ---
    if (baseline) {
        const regressions = results.categories
            .filter(c => !catMeta(c.id).knownGap)
            .map(c => ({id: c.id, d: (c.mean || 0) - ((baseCat(c.id) || {}).mean || 0)}))
            .filter(r => r.d < -0.01);
        if (regressions.length) {
            lines.push('⚠ REGRESSIONS (non-gap categories):');
            for (const r of regressions) lines.push(`   ${r.id}: ${fmtDelta(r.d)}`);
        } else {
            lines.push('✓ No regressions in non-gap categories.');
        }
        lines.push('');
    }

    return lines.join('\n');
};
