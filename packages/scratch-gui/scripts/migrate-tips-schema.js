#!/usr/bin/env node
/**
 * One-shot schema migration for tips.json.
 *
 * - Drops `relevance.projectSignals` everywhere.
 * - Folds `relevance.keywords` into `queries` (deduped, preserving order).
 * - Drops `relevance` if empty afterward.
 *
 * Run: node packages/scratch-gui/scripts/migrate-tips-schema.js
 * Or with --dry to just report.
 */
const fs = require('fs');
const path = require('path');

const TIPS_JSON_PATH = path.resolve(
    __dirname, '..', 'src', 'lib', 'libraries', 'tips', 'tips.json'
);

const DRY = process.argv.includes('--dry');

const load = () => JSON.parse(fs.readFileSync(TIPS_JSON_PATH, 'utf8'));

const migrate = function (data) {
    const stats = {
        tipsTouched: 0,
        droppedProjectSignals: 0,
        mergedKeywords: 0,
        droppedEmptyRelevance: 0,
        keywordDupes: 0
    };
    const out = {...data, tips: {}};
    for (const [tipId, tip] of Object.entries(data.tips)) {
        const next = {...tip};
        let changed = false;

        if (next.relevance && next.relevance.projectSignals) {
            delete next.relevance.projectSignals;
            stats.droppedProjectSignals += 1;
            changed = true;
        }

        if (next.relevance && next.relevance.keywords) {
            const existingQueries = Array.isArray(next.queries) ? next.queries.slice() : [];
            const seen = new Set(existingQueries.map(q => String(q).toLowerCase()));
            for (const kw of next.relevance.keywords) {
                const key = String(kw).toLowerCase();
                if (seen.has(key)) {
                    stats.keywordDupes += 1;
                    continue;
                }
                seen.add(key);
                existingQueries.push(kw);
            }
            next.queries = existingQueries;
            delete next.relevance.keywords;
            stats.mergedKeywords += 1;
            changed = true;
        }

        if (next.relevance && Object.keys(next.relevance).length === 0) {
            delete next.relevance;
            stats.droppedEmptyRelevance += 1;
            changed = true;
        }

        if (changed) stats.tipsTouched += 1;
        out.tips[tipId] = next;
    }
    return {out, stats};
};

const main = function () {
    const data = load();
    const {out, stats} = migrate(data);
    console.log('Migration stats:', stats);
    if (DRY) {
        console.log('(dry run — not writing)');
        return;
    }
    const tmp = `${TIPS_JSON_PATH}.migrate.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(out, null, 4)}\n`, 'utf8');
    fs.renameSync(tmp, TIPS_JSON_PATH);
    console.log(`Wrote ${TIPS_JSON_PATH}`);
};

if (require.main === module) {
    main();
}

module.exports = {migrate};
