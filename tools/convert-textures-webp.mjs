// Convert every .jpg / .jpeg / .png inside src/asset/textures/** to .webp
// for web delivery. Originals are deleted only after the webp output exists
// and has non-zero size, so an interrupted run never loses data.
//
//   cd tools
//   node convert-textures-webp.mjs            # default quality 82
//   node convert-textures-webp.mjs --q 90     # bump quality
//   node convert-textures-webp.mjs --keep     # keep originals
//
// Requires `sharp` (added to tools/package.json).

import { readdir, stat, unlink } from 'node:fs/promises';
import { join, extname, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(__filename));
const TARGET = join(ROOT, 'src', 'asset', 'textures');

const args = process.argv.slice(2);
const KEEP = args.includes('--keep');
const QUALITY = (() => {
    const i = args.indexOf('--q');
    if (i < 0) return 82;
    const v = Number.parseInt(args[i + 1], 10);
    return Number.isFinite(v) ? v : 82;
})();

const SOURCE_EXT = new Set(['.jpg', '.jpeg', '.png']);

async function* walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
            yield* walk(p);
        } else if (e.isFile()) {
            yield p;
        }
    }
}

async function convertOne(file) {
    const ext = extname(file).toLowerCase();
    if (!SOURCE_EXT.has(ext)) return null;

    const dir = dirname(file);
    const base = basename(file, ext);
    const out = join(dir, `${base}.webp`);

    const inSize = (await stat(file)).size;
    await sharp(file)
        .webp({ quality: QUALITY, effort: 5 })
        .toFile(out);
    const outStat = await stat(out);
    if (outStat.size <= 0) {
        throw new Error(`empty output: ${out}`);
    }
    if (!KEEP) await unlink(file);

    return { in: file, out, inSize, outSize: outStat.size };
}

const results = [];
let totalIn = 0;
let totalOut = 0;
for await (const file of walk(TARGET)) {
    try {
        const r = await convertOne(file);
        if (!r) continue;
        results.push(r);
        totalIn += r.inSize;
        totalOut += r.outSize;
        const ratio = ((1 - r.outSize / r.inSize) * 100).toFixed(1);
        console.log(`${pad(r.outSize, 9)} ${ratio.padStart(5)}%  ${rel(r.out)}`);
    } catch (err) {
        console.error(`! failed ${rel(file)}: ${err.message}`);
    }
}

const overall = totalIn > 0 ? ((1 - totalOut / totalIn) * 100).toFixed(1) : '0';
console.log('---');
console.log(`converted ${results.length} files, ${kb(totalIn)} → ${kb(totalOut)} (-${overall}%)`);

function rel(p) { return p.replace(ROOT + '\\', '').replace(ROOT + '/', ''); }
function pad(n, w) { return String(n).padStart(w); }
function kb(n)  { return `${(n / 1024).toFixed(0)}KB`; }
