// Generate the base seed songs (full multitrack songs) via Opus, once, and
// commit them. Cases derive their partially-filled seeds from these.
import fs from 'fs';
import path from 'path';

import {generateSongFromPrompt} from '../../../src/lib/song-ai/index.js';
import {PATHS, GOLDEN_PROVIDER_ID} from '../config.mjs';
import {readJson, writeJson} from '../lib/io.mjs';

export const generateSeeds = async flags => {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is required to generate seeds.');
    }
    const specs = readJson(path.join(PATHS.seeds, '_specs.json'));
    let made = 0;
    let skipped = 0;
    for (const spec of specs) {
        const file = path.join(PATHS.seeds, `${spec.id}.seed.json`);
        if (fs.existsSync(file) && !flags.force) {
            skipped++;
            continue;
        }
        process.stdout.write(`[seeds] generating ${spec.id} ...\n`);
        const song = await generateSongFromPrompt({
            prompt: spec.prompt,
            providerId: GOLDEN_PROVIDER_ID,
            fallbackName: spec.id
        });
        writeJson(file, song);
        made++;
    }
    process.stdout.write(`[seeds] done. ${made} generated, ${skipped} skipped.\n`);
};
