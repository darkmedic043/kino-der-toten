#!/usr/bin/env node
// GPU-compressed copies of the game's textures (docs/fork/materials.md, "KTX2 textures").
// node .tools/build-ktx2.mjs [root ...] [--jobs N] [--force] [--limit N]
//   root: folders under export/web to convert (default: textures)
// Each PNG/WebP/JPEG with power-of-two sides (BC7, which UASTC transcodes to on desktop GPUs, needs block-aligned mip
// levels) becomes export/web/ktx2/<its path>.ktx2: UASTC (quality 2, RDO 1.0), zstd 18, full mip chain, RGBA.
// export/web/ktx2/manifest.json lists every converted source with a stamp (its size and mtime) that the game adds to
// the URL, so a changed source never gets an old copy from a cache. Unchanged files are skipped on later runs.
// Needs KTX-Software (`ktx`, 4.4.2 in ~/.local/opt/ktx-software; KTX_HOME overrides) and ffmpeg.
// The outputs are derived from ripped game textures: git-ignored, streamed from the site, never installed by Rind.
// Encoding notes:
// - Sources go through ffmpeg to plain RGBA PNG first (grey, paletted and WebP inputs; it also drops the gAMA 1.0
//   chunk most BO1 PNGs carry, which Chromium's glTF path ignores but `ktx create` would honour by brightening).
// - The transfer function is assigned, never converted: the game decides sRGB or linear per material slot (three
//   picks the BC7 sRGB or UNORM upload format from texture.colorSpace), so the stored values must be the raw pixels.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, rmSync, openSync, readSync, closeSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { tmpdir, homedir, cpus } from 'node:os';

const WEB = new URL('../export/web/', import.meta.url).pathname;
const OUT = join(WEB, 'ktx2');
const KTX = process.env.KTX_HOME || join(homedir(), '.local/opt/ktx-software');
const args = process.argv.slice(2), flag = n => args.includes(n), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const roots = args.filter((a, i) => !a.startsWith('--') && !['--jobs', '--limit'].includes(args[i - 1]));
const JOBS = +opt('--jobs', Math.max(1, cpus().length)), FORCE = flag('--force'), LIMIT = +opt('--limit', Infinity);
const IMAGE = /\.(png|webp|jpe?g)$/i;

// image size from the file header (PNG IHDR, WebP VP8/VP8L/VP8X, JPEG SOF), without decoding
function size(file) {
  const fd = openSync(file, 'r'), b = Buffer.alloc(65536); const n = readSync(fd, b, 0, b.length, 0); closeSync(fd);
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
    if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  }
  if (b[0] === 0xff && b[1] === 0xd8) for (let i = 2; i < n - 9;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}
const pow2 = v => v >= 4 && (v & (v - 1)) === 0;
// linear data: normal maps (BO1 _n / _nml, BO3 _nrm, the fork's nrm/ folder)
const linear = rel => /(^|\/)nrm\/|_(n|nml|nrm|normal)(\.|_)/i.test(rel);

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (p !== OUT) walk(p, out); } else if (IMAGE.test(e.name)) out.push(p);
  }
  return out;
}
const run = (cmd, argv, env) => new Promise((resolve, reject) => {
  const c = spawn(cmd, argv, { env: { ...process.env, ...env } }); let err = '';
  c.stderr.on('data', d => { err += d; }); c.stdout.on('data', d => { err += d; });
  c.on('error', reject); c.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.trim().split('\n').slice(-3).join(' | ')}`)));
});

const manifestFile = join(OUT, 'manifest.json');
const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : { files: {} };
const files = (roots.length ? roots : ['textures']).flatMap(r => walk(join(WEB, r)));
const tmp = mkdtempSync(join(tmpdir(), 'ktx2-'));
let done = 0, made = 0, skipped = 0, failed = 0, bytesIn = 0, bytesOut = 0;
const todo = [], notPow2 = [];
for (const file of files) {
  const rel = relative(WEB, file), st = statSync(file), stamp = `${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}`;
  const out = join(OUT, rel + '.ktx2');
  if (!FORCE && manifest.files[rel]?.[0] === stamp && existsSync(out)) { skipped++; continue; }
  const dims = size(file);
  if (!dims || !pow2(dims[0]) || !pow2(dims[1])) { notPow2.push(rel); delete manifest.files[rel]; continue; }
  todo.push({ file, rel, stamp, out, dims, bytes: st.size });
}
todo.splice(LIMIT);
console.log(`${files.length} images: ${todo.length} to encode, ${skipped} up to date, ${notPow2.length} not power-of-two (kept as they are); ${JOBS} jobs`);
const t0 = Date.now();
let next = 0, lastSave = Date.now();
const save = () => writeFileSync(manifestFile, JSON.stringify({ version: 1, encoder: 'ktx 4.4.2 uastc q2 rdo1 zstd18 mips', files: manifest.files }));
async function worker(id) {
  while (next < todo.length) {
    const job = todo[next++], png = join(tmp, `${id}.png`);
    try {
      mkdirSync(dirname(job.out), { recursive: true });
      await run('ffmpeg', ['-v', 'error', '-y', '-i', job.file, '-frames:v', '1', '-pix_fmt', 'rgba', png]);
      const lin = linear(job.rel);
      await run(join(KTX, 'bin/ktx'), ['create', '--format', lin ? 'R8G8B8A8_UNORM' : 'R8G8B8A8_SRGB', '--assign-tf', lin ? 'linear' : 'srgb', '--assign-primaries', 'srgb',
        '--encode', 'uastc', '--uastc-quality', '2', '--uastc-rdo', '--uastc-rdo-l', '1.0', '--zstd', '18', '--generate-mipmap', png, job.out + '.tmp'], { LD_LIBRARY_PATH: join(KTX, 'lib') });
      await run('mv', [job.out + '.tmp', job.out]);
      const outBytes = statSync(job.out).size;
      manifest.files[job.rel] = [job.stamp, job.dims[0], job.dims[1], outBytes];
      made++; bytesIn += job.bytes; bytesOut += outBytes;
    } catch (e) { failed++; delete manifest.files[job.rel]; console.warn(`  failed ${job.rel}: ${e.message}`); }
    done++;
    if (done % 50 === 0 || done === todo.length) {
      const s = (Date.now() - t0) / 1000;
      console.log(`  ${done}/${todo.length} in ${s.toFixed(0)} s (eta ${((todo.length - done) * s / done / 60).toFixed(1)} min), source ${(bytesIn / 1e6).toFixed(0)} MB -> ktx2 ${(bytesOut / 1e6).toFixed(0)} MB`);
    }
    if (Date.now() - lastSave > 20000) { save(); lastSave = Date.now(); }
  }
}
await Promise.all([...Array(JOBS)].map((_, i) => worker(i)));
save();
rmSync(tmp, { recursive: true, force: true });
console.log(`done: ${made} encoded, ${failed} failed, ${skipped} up to date, ${notPow2.length} skipped (not power-of-two); manifest ${Object.keys(manifest.files).length} files`);
