// The Giant's three chalk drawings (the "HELP", the lightning bolt and the teleporter verse): BO3 keeps the drawing in
// a second image (i_..._r, the reveal map) and the colour image is plain chalk with a solid alpha, so the port drew
// them as pale grey panels. This writes the colour image again with the drawing as its alpha; the overlay pass
// (mods/the-giant/overlays.js) then draws them as chalk on the wall. Rerun after a map rebuild rewrites tex/.
//   node .tools/giant-chalk.mjs [--out <dir>] [--size <px>]      (source: the Greyhound export, GREYHOUND=<dir> to move it)
import { spawnSync } from 'child_process'; import fs from 'fs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const GH = process.env.GREYHOUND || '/mass_drive/SteamLibrary/steamapps/compatdata/311210/pfx/drive_c/greyhound/exported_files/black_ops_3';
const out = arg('--out', 'export/web/mods/maps/the-giant/tex'), size = arg('--size', null);
for (const n of ['help', 'lightning_bolt', 'teleporter']) {
  const c = `${GH}/ximages/i_t7_zm_der_chalk_${n}_c.png`, r = `${GH}/ximages/i_t7_zm_der_chalk_${n}_r.png`, dst = `${out}/i_t7_zm_der_chalk_${n}_c_1024.webp`;
  if (!fs.existsSync(c) || !fs.existsSync(r)) { console.error('missing source for', n); process.exitCode = 1; continue; }
  const sc = size ? `,scale=${size}:-2` : '';
  const p = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', c, '-i', r, '-filter_complex', `[0:v]format=rgb24${sc}[c];[1:v]format=gray${sc}[a];[c][a]alphamerge`, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '86', '-pix_fmt', 'yuva420p', dst]);
  console.log(p.status ? 'FAILED ' + String(p.stderr).slice(0, 200) : 'wrote ' + dst);
}
