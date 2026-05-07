#!/usr/bin/env node
/**
 * Fetches thumbnail JPEGs for the supplemental tip-only Wistia videos
 * (videos that live in the decks library as `hidden: true` entries so they
 * are reachable from the tips modal but excluded from the tutorials library).
 *
 * Reads a manifest of {tutorialId, wistiaId} pairs, hits Wistia's oEmbed
 * endpoint for each one, and writes the resized JPEG into the existing
 * decks/thumbnails directory under `<tutorialId>.jpg`.
 *
 * Usage:
 *   node scripts/fetch-wistia-thumbnails.mjs           # skip entries whose JPEG already exists
 *   node scripts/fetch-wistia-thumbnails.mjs --force   # re-fetch everything
 *
 * After running, the script prints paste-ready import + entry stubs that
 * can be dropped into src/lib/libraries/decks/index.jsx.
 */

import {readFileSync, writeFileSync, existsSync} from 'fs';
import {fileURLToPath} from 'url';
import {dirname, resolve} from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MANIFEST_PATH = resolve(__dirname, 'wistia-tip-videos.json');
const THUMBNAILS_DIR = resolve(__dirname, '../src/lib/libraries/decks/thumbnails');
const THUMB_SIZE = '480x270';

const force = process.argv.includes('--force');

const oembedUrl = wistiaId =>
    `https://fast.wistia.com/oembed?url=https://scratch.wistia.com/medias/${wistiaId}`;

const resizeThumbnailUrl = url => {
    const u = new URL(url);
    u.searchParams.set('image_crop_resized', THUMB_SIZE);
    return u.toString();
};

const fetchJson = async url => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`oEmbed request failed: ${res.status} ${url}`);
    return res.json();
};

const fetchBuffer = async url => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`thumbnail download failed: ${res.status} ${url}`);
    return Buffer.from(await res.arrayBuffer());
};

const camelCase = id =>
    id.replace(/[-_]+(.)/g, (_, c) => c.toUpperCase()).replace(/^(.)/, (_, c) => c.toLowerCase());

const main = async () => {
    if (!existsSync(MANIFEST_PATH)) {
        console.error(`Manifest not found: ${MANIFEST_PATH}`);
        console.error('Create it with entries like: [{"tutorialId": "tip-foo", "wistiaId": "abc123"}]');
        process.exit(1);
    }
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    if (!Array.isArray(manifest) || manifest.length === 0) {
        console.error('Manifest is empty.');
        process.exit(1);
    }

    const stubs = [];
    let fetched = 0;
    let skipped = 0;

    for (const {tutorialId, wistiaId} of manifest) {
        if (!tutorialId || !wistiaId) {
            console.warn(`Skipping malformed entry: ${JSON.stringify({tutorialId, wistiaId})}`);
            continue;
        }
        const outPath = resolve(THUMBNAILS_DIR, `${tutorialId}.jpg`);
        if (existsSync(outPath) && !force) {
            console.log(`= ${tutorialId}.jpg (exists, skipping; pass --force to overwrite)`);
            skipped++;
        } else {
            console.log(`→ ${tutorialId} (wistia: ${wistiaId})`);
            const meta = await fetchJson(oembedUrl(wistiaId));
            if (!meta.thumbnail_url) {
                throw new Error(`No thumbnail_url in oEmbed response for ${wistiaId}`);
            }
            const buf = await fetchBuffer(resizeThumbnailUrl(meta.thumbnail_url));
            writeFileSync(outPath, buf);
            console.log(`  wrote ${outPath} (${buf.length} bytes)`);
            fetched++;
        }
        stubs.push({tutorialId, wistiaId, varName: camelCase(tutorialId) + 'Thumb'});
    }

    console.log(`\nDone. fetched=${fetched} skipped=${skipped}\n`);

    console.log('Paste imports near the top of src/lib/libraries/decks/index.jsx:');
    console.log('-'.repeat(60));
    for (const {tutorialId, varName} of stubs) {
        console.log(`import ${varName} from './thumbnails/${tutorialId}.jpg';`);
    }
    console.log('\nPaste entries inside the default export of decks/index.jsx:');
    console.log('-'.repeat(60));
    for (const {tutorialId, wistiaId, varName} of stubs) {
        console.log(`    '${tutorialId}': {`);
        console.log(`        img: ${varName},`);
        console.log(`        steps: [{video: '${wistiaId}'}],`);
        console.log(`        urlId: '${tutorialId}',`);
        console.log(`        hidden: true`);
        console.log(`    },`);
    }
};

main().catch(err => {
    console.error(err);
    process.exit(1);
});
