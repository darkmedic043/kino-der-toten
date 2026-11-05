// Precompressed copies for the static server: every big .glb/.bin/.wasm/.json under export/web gets a <file>.gz next to it
// (git-ignored), which kino-server.mjs sends with Content-Encoding: gzip. Map files are mostly raw vertex data and halve:
// a first load pays for them over the home uplink (Cloudflare doesn't cache .glb). A copy older than its file is ignored
// by the server, so rerun this after rebuilding a map or weapon: node .tools/build-gz.mjs [--force]
import { readdirSync, statSync, createReadStream, createWriteStream, renameSync, rmSync, utimesSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

const ROOT = resolve(import.meta.dirname, '../export/web'), EXT = new Set(['.glb', '.bin', '.wasm', '.json']), MIN = 256 * 1024, force = process.argv.includes('--force');
const files = [];
const walk = dir => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) walk(p); else if (EXT.has(extname(p).toLowerCase()) && statSync(p).size >= MIN) files.push(p); } };
walk(ROOT);
let raw = 0, gz = 0, built = 0;
for (const p of files) {
  const st = statSync(p), out = p + '.gz', tmp = out + '.tmp';
  let cur = null; try { cur = statSync(out); } catch {}
  if (cur && cur.mtimeMs >= st.mtimeMs && !force) { raw += st.size; gz += Math.min(cur.size, st.size); continue; }
  await pipeline(createReadStream(p), createGzip({ level: 7, memLevel: 9 }), createWriteStream(tmp));
  const size = statSync(tmp).size;
  if (size > st.size * .9) { rmSync(tmp); raw += st.size; gz += st.size; continue; }   // already compressed: not worth a copy
  renameSync(tmp, out); utimesSync(out, new Date(), new Date()); raw += st.size; gz += size; built++;
  console.log((size / st.size * 100).toFixed(0).padStart(3) + '%', (st.size / 1e6).toFixed(1).padStart(7) + ' MB', p.slice(ROOT.length + 1));
}
console.log(`${files.length} files, ${built} compressed now; ${(raw / 1e6).toFixed(0)} MB -> ${(gz / 1e6).toFixed(0)} MB`);
