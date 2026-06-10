// Filesystem + small utility helpers shared across the harness.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import {PATHS, CATEGORY_IDS} from '../config.mjs';

export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

export const readJsonIfExists = file => (fs.existsSync(file) ? readJson(file) : null);

export const writeJson = (file, obj) => {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`);
};

export const writeText = (file, text) => {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, text);
};

export const sha256 = obj =>
    crypto.createHash('sha256')
        .update(typeof obj === 'string' ? obj : JSON.stringify(obj))
        .digest('hex');

export const loadSettings = () => {
    const list = readJson(PATHS.settings);
    const byId = new Map(list.map(s => [s.id, s]));
    return {list, byId};
};

// Walk cases/<category>/*.case.json into a flat, ordered array.
export const loadCases = () => {
    const out = [];
    for (const cat of CATEGORY_IDS) {
        const dir = path.join(PATHS.cases, cat);
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.case.json')).sort();
        for (const f of files) {
            const c = readJson(path.join(dir, f));
            c.category = c.category || cat;
            c.__file = path.join(dir, f);
            out.push(c);
        }
    }
    return out;
};

export const loadSeed = seedRef => {
    if (!seedRef) return null;
    return readJson(path.join(PATHS.root, seedRef));
};

export const goldenPath = caseId => path.join(PATHS.goldens, caseId, 'golden.json');
export const goldenMetaPath = caseId => path.join(PATHS.goldens, caseId, 'meta.json');

export const loadGolden = caseId => readJsonIfExists(goldenPath(caseId));

// A stable fingerprint of the parts of a case that determine its golden, so the
// golden generator can skip work when nothing relevant changed.
export const caseFingerprint = (c, seed) => sha256({
    operation: c.operation,
    prompt: c.prompt || '',
    kind: c.kind || null,
    trackIndex: typeof c.trackIndex === 'number' ? c.trackIndex : null,
    editParams: c.editParams || null,
    seed: seed || null
});

export const nowIso = () => new Date().toISOString();
