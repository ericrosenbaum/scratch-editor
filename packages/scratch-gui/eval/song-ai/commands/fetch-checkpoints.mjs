// Pre-download model checkpoints into checkpoints/<name>/ for offline inspection
// and as a connectivity check. (The provider currently loads from the CDN at
// run time; these local copies are not yet wired into it.)
import fs from 'fs';
import path from 'path';

import {CHECKPOINTS, PATHS} from '../config.mjs';

const download = async (url, dest) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(dest), {recursive: true});
    fs.writeFileSync(dest, buf);
    return buf.length;
};

export const fetchCheckpoints = async () => {
    let total = 0;
    for (const [name, base] of Object.entries(CHECKPOINTS)) {
        const dir = path.join(PATHS.checkpoints, name);
        try {
            // config.json is optional on some checkpoints; manifest is required.
            try {
                total += await download(`${base}/config.json`, path.join(dir, 'config.json'));
            } catch (e) { /* not all checkpoints ship config.json */ }
            const manifestText = await (await fetch(`${base}/weights_manifest.json`)).text();
            fs.writeFileSync(path.join(dir, 'weights_manifest.json'), manifestText);
            const manifest = JSON.parse(manifestText);
            const shards = manifest.flatMap(g => g.paths || []);
            let bytes = 0;
            for (const shard of shards) {
                bytes += await download(`${base}/${shard}`, path.join(dir, shard));
            }
            total += bytes;
            process.stdout.write(`[checkpoints] ${name}: ${shards.length} shard(s), ${(bytes / 1e6).toFixed(1)} MB\n`);
        } catch (err) {
            process.stderr.write(`[checkpoints] ${name}: FAILED (${err.message})\n`);
        }
    }
    process.stdout.write(`[checkpoints] total ${(total / 1e6).toFixed(1)} MB into ${path.relative(PATHS.root, PATHS.checkpoints)}\n`);
};
