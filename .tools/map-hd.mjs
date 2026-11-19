// Larger copies of a World at War port's blurriest colour textures (2026-11-19, user: "clean up the maps with more
// ehish textures"). build_waw_map.py embeds every texture in the map's GLB at 512 px at most; the zone dump often has
// the same image at 1024 or 2048. This measures, per embedded image, how many texels a unit it gets on the surfaces
// near where players walk, and re-encodes the ones under 4 texels a unit from the dump at up to 2048 px, largest blurry
// area first, within --budget MB of texture memory (as GPU-compressed KTX2: 1 byte a pixel plus mips).
//   node .tools/map-hd.mjs <map-id> --src <dump images dir>[,<dir2>] [--pts walkable.json] [--budget 96] [--go]
// no --go: report only. --go writes export/web/mods/maps/<id>/hd/<image>.webp and hd.json ({image name: file}), both
// git-ignored (ripped textures: streamed from the site, never installed by Rind). Afterwards:
//   LD_LIBRARY_PATH=~/.local/opt/ktx-software/lib node .tools/build-ktx2.mjs mods/maps/<id>/hd
// The game swaps them in by texture name right after the GLB loads (map-detail.js `embeddedHd`, map entry `hd: true`):
// no map rebuild, no ?v= bump. --pts as for map-detail.mjs ({pts:[[x,y,z],...]}, col-audit's --flood-only --points).
// --upscale [--up-budget 64]: second stage for the textures the dump has no larger copy of (most of a WaW map: its
// originals are 256 or 512 px). The ones under 2.5 texels a unit over a large area are AI-upscaled to twice their size
// with Real-ESRGAN (~/.local/opt/realesrgan, runs on the GPU: not while a game test is running), as
// .tools/upscale-kino-textures.py does for Kino: a wrapped border keeps tiling textures seamless, 4x then Lanczos to 2x.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
const args = process.argv.slice(2), opt = k => { const i = args.indexOf('--' + k); return i < 0 ? null : args[i + 1]; };
const MAP = args[0], DIR = 'export/web/mods/maps/' + MAP + '/', GO = args.includes('--go'), BUDGET = +(opt('budget') ?? 96), PTS = opt('pts'), SRC = (opt('src') ?? '').split(',').filter(Boolean);
const UP = args.includes('--upscale'), UPB = +(opt('up-budget') ?? 64), ESRGAN = path.join(os.homedir(), '.local/opt/realesrgan/realesrgan-ncnn-vulkan');
if (!MAP || !SRC.length) { console.error('usage: node .tools/map-hd.mjs <map-id> --src <dump images dir>[,<dir2>] [--pts file] [--budget MB] [--upscale [--up-budget MB]] [--go]'); process.exit(1); }
const buf = fs.readFileSync(DIR + MAP + '.glb'), jl = buf.readUInt32LE(12), g = JSON.parse(buf.subarray(20, 20 + jl).toString()), bin = buf.subarray(20 + jl + 8);
const TYPES = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array, 5122: Int16Array, 5120: Int8Array }, COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const acc = i => { const a = g.accessors[i], v = g.bufferViews[a.bufferView], n = COMP[a.type], T = TYPES[a.componentType], off = (v.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = v.byteStride || n * T.BYTES_PER_ELEMENT;
  const out = new Float32Array(a.count * n), dv = new DataView(bin.buffer, bin.byteOffset + off), rd = { 5126: 'getFloat32', 5125: 'getUint32', 5123: 'getUint16', 5121: 'getUint8', 5122: 'getInt16', 5120: 'getInt8' }[a.componentType];
  const norm = a.normalized ? { 5123: 65535, 5121: 255, 5122: 32767, 5120: 127 }[a.componentType] : 1;
  for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = dv[rd](i * stride + k * T.BYTES_PER_ELEMENT, true) / norm;
  return { arr: out, n }; };
const CELL = 256, grid = new Set(); if (PTS) for (const [x, y, z] of JSON.parse(fs.readFileSync(PTS)).pts) grid.add(Math.floor(x / CELL) + ',' + Math.floor(y / CELL) + ',' + Math.floor(z / CELL));
const near = (x, y, z) => { if (!PTS) return true; const a = Math.floor(x / CELL), b = Math.floor(y / CELL), c = Math.floor(z / CELL); for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) if (grid.has((a + i) + ',' + (b + j) + ',' + (c + k))) return true; return false; };
// per primitive: surface area, uv area, centroid (mesh space)
const prim = new Map(), stat = (mi, pi) => { const key = mi + ':' + pi; if (prim.has(key)) return prim.get(key); const p = g.meshes[mi].primitives[pi]; let r = null;
  if (p.attributes.TEXCOORD_0 != null && p.indices != null && (p.mode ?? 4) === 4) { const pos = acc(p.attributes.POSITION).arr, uv = acc(p.attributes.TEXCOORD_0), idx = acc(p.indices).arr, un = uv.n, u = uv.arr; let A = 0, U = 0, cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < idx.length; i += 3) { const a = idx[i], b = idx[i + 1], c = idx[i + 2], ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2], e1x = pos[b * 3] - ax, e1y = pos[b * 3 + 1] - ay, e1z = pos[b * 3 + 2] - az, e2x = pos[c * 3] - ax, e2y = pos[c * 3 + 1] - ay, e2z = pos[c * 3 + 2] - az;
      const ar = Math.hypot(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x) / 2; if (!(ar > 0)) continue;
      const ua = Math.abs((u[b * un] - u[a * un]) * (u[c * un + 1] - u[a * un + 1]) - (u[c * un] - u[a * un]) * (u[b * un + 1] - u[a * un + 1])) / 2;
      A += ar; U += ua; cx += (ax + pos[b * 3] / 3 + pos[c * 3] / 3 - ax * 2 / 3) * ar; cy += (ay + pos[b * 3 + 1] / 3 + pos[c * 3 + 1] / 3 - ay * 2 / 3) * ar; cz += (az + pos[b * 3 + 2] / 3 + pos[c * 3 + 2] / 3 - az * 2 / 3) * ar; }
    if (A > 0 && U > 0) r = { A, U, c: [cx / A, cy / A, cz / A], mat: p.material }; }
  prim.set(key, r); return r; };
const tex = new Map();   // image index -> { A: area near players, w: area-weighted log2 of uv per unit, mats }
const add = (s, m) => { if (!s || s.mat == null) return; const mat = g.materials[s.mat], t = mat.pbrMetallicRoughness?.baseColorTexture?.index; if (t == null) return;
  const sc = Math.cbrt(Math.abs(m.determinant())), c = new THREE.Vector3(...s.c).applyMatrix4(m); if (!near(c.x, c.y, c.z)) return;
  const img = g.textures[t].extensions?.EXT_texture_webp?.source ?? g.textures[t].source, A = s.A * sc * sc, e = tex.get(img) ?? { A: 0, w: 0, mats: new Set() };
  e.A += A; e.w += A * Math.log2(Math.sqrt(s.U / A)); e.mats.add(mat.name); tex.set(img, e); };
const M = new THREE.Matrix4(), I = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sv = new THREE.Vector3();
const walk = (ni, parent) => { const n = g.nodes[ni], m = new THREE.Matrix4(); if (n.matrix) m.fromArray(n.matrix); else m.compose(v.fromArray(n.translation ?? [0, 0, 0]), q.fromArray(n.rotation ?? [0, 0, 0, 1]), sv.fromArray(n.scale ?? [1, 1, 1])); m.premultiply(parent);
  if (n.mesh != null && !/^COL_/.test(n.name ?? '')) { const inst = n.extensions?.EXT_mesh_gpu_instancing?.attributes, np = g.meshes[n.mesh].primitives.length;
    if (inst) { const T = acc(inst.TRANSLATION).arr, R = inst.ROTATION != null ? acc(inst.ROTATION).arr : null, S = inst.SCALE != null ? acc(inst.SCALE).arr : null;
      for (let i = 0; i < T.length / 3; i++) { I.compose(v.set(T[i * 3], T[i * 3 + 1], T[i * 3 + 2]), R ? q.set(R[i * 4], R[i * 4 + 1], R[i * 4 + 2], R[i * 4 + 3]) : q.identity(), S ? sv.set(S[i * 3], S[i * 3 + 1], S[i * 3 + 2]) : sv.set(1, 1, 1)); M.multiplyMatrices(m, I); for (let p = 0; p < np; p++) add(stat(n.mesh, p), M); } }
    else for (let p = 0; p < np; p++) add(stat(n.mesh, p), m); }
  for (const c of n.children ?? []) walk(c, m); };
for (const r of g.scenes[g.scene ?? 0].nodes) walk(r, new THREE.Matrix4());
// sizes: the embedded WebP's, the dump's DDS
const webpSize = b => { const t = b.toString('latin1', 12, 16);
  if (t === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (t === 'VP8L') { const n = b.readUInt32LE(21); return [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)]; }
  if (t === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  return [0, 0]; };
const embedded = i => { const im = g.images[i]; if (im.bufferView == null) return [0, 0]; const bv = g.bufferViews[im.bufferView]; return webpSize(bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + 32)); };
const srcOf = name => { for (const d of SRC) { const f = path.join(d, name + '.dds'); if (fs.existsSync(f)) return f; } return null; };
const ddsSize = f => { const h = Buffer.alloc(24), fd = fs.openSync(f, 'r'); fs.readSync(fd, h, 0, 24, 0); fs.closeSync(fd); return [h.readUInt32LE(16), h.readUInt32LE(12)]; };
const pow2 = n => n > 0 && (n & (n - 1)) === 0;
const rows = [];
for (const [img, e] of tex) { const name = g.images[img].name, [w, h] = embedded(img); if (!name || !w) continue; const src = srcOf(name); if (!src) continue; const [sw, sh] = ddsSize(src);
  rows.push({ name, w, h, sw, sh, src, area: Math.round(e.A), dens: +(Math.sqrt(w * h) * 2 ** (e.w / e.A)).toFixed(2), mats: [...e.mats].slice(0, 2) }); }
const cand = rows.filter(r => r.sw > r.w && pow2(r.sw) && pow2(r.sh) && r.dens > 0 && r.dens < 4 && r.area >= 1e5).sort((a, b) => b.area * Math.log2(4 / b.dens) - a.area * Math.log2(4 / a.dens));
console.log('colour textures near players:', rows.length, '· larger in the dump:', rows.filter(r => r.sw > r.w).length, '· of those under 4 texels a unit:', cand.length);
const safe = n => n.replace(/[^A-Za-z0-9_.-]/g, '_'), hd = {}, todo = []; let mb = 0;
for (const r of cand) { const k = r.dens * 2 >= 3.5 ? 2 : 4, size = Math.min(r.w * k, r.sw, 2048); if (size <= r.w) continue;
  const cost = (size * size - r.w * r.w) * (r.sh / r.sw) * 1.33 / 1048576; if (mb + cost > BUDGET) continue; mb += cost;
  hd[r.name] = 'hd/' + safe(r.name) + '.webp'; todo.push({ ...r, size });
  console.log(String(r.area).padStart(9), String(r.dens).padStart(5), '->', (r.dens * size / r.w).toFixed(1).padStart(5), r.name.padEnd(46), r.w + ' -> ' + size, '(dump ' + r.sw + ')', '+' + cost.toFixed(1) + ' MB', r.mats[0] ?? ''); }
console.log('larger copies:', todo.length, '· extra texture memory about', Math.round(mb), 'MB (compressed)');
// second stage: no larger original, still blurry over a large area -> AI upscale to twice the size
const ups = []; let umb = 0;
if (UP) { const c2 = rows.filter(r => !hd[r.name] && r.sw <= r.w && pow2(r.w) && pow2(r.h) && Math.max(r.w, r.h) >= 64 && Math.max(r.w, r.h) <= 512 && r.dens > .2 && r.dens < 2.5 && r.area >= 2e5).sort((a, b) => b.area * Math.log2(4 / b.dens) - a.area * Math.log2(4 / a.dens));
  for (const r of c2) { const cost = 3 * r.w * r.h * 1.33 / 1048576; if (umb + cost > UPB) continue; umb += cost; hd[r.name] = 'hd/' + safe(r.name) + '.webp'; ups.push(r);
    console.log(String(r.area).padStart(9), String(r.dens).padStart(5), '->', (r.dens * 2).toFixed(1).padStart(5), r.name.padEnd(46), r.w + 'x' + r.h + ' -> ' + r.w * 2 + 'x' + r.h * 2, '(upscaled)', '+' + cost.toFixed(1) + ' MB', r.mats[0] ?? ''); }
  console.log('upscaled copies:', ups.length, 'of', c2.length, '· extra texture memory about', Math.round(umb), 'MB (compressed)'); }
if (GO) { fs.mkdirSync(DIR + 'hd', { recursive: true });
  for (const t of todo) { const dst = DIR + hd[t.name]; if (fs.existsSync(dst)) continue;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', t.src, '-frames:v', '1', '-vf', `scale='min(${t.size},iw)':-1`, '-c:v', 'libwebp', '-quality', '82', dst]); }
  if (ups.length) { const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'map-hd-')), pad = path.join(tmp, 'in.png'), up = path.join(tmp, 'up.png'); let n = 0;
    for (const t of ups) { const dst = DIR + hd[t.name]; n++; if (fs.existsSync(dst)) continue; const { w, h } = t, p = Math.min(24, w >> 1, h >> 1);
      // the dump's image at the embedded size, tiled 3x3, the centre kept with a wrapped border
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', t.src, '-frames:v', '1', '-filter_complex', `[0]scale=${w}:${h}:flags=lanczos,format=rgba,split=3[a][b][c];[a][b][c]hstack=3,split=3[r1][r2][r3];[r1][r2][r3]vstack=3,crop=${w + 2 * p}:${h + 2 * p}:${w - p}:${h - p}`, pad]);
      execFileSync(ESRGAN, ['-i', pad, '-o', up, '-n', 'realesrgan-x4plus', '-g', '0'], { stdio: 'ignore' });
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', up, '-vf', `crop=${w * 4}:${h * 4}:${p * 4}:${p * 4},scale=${w * 2}:${h * 2}:flags=lanczos`, '-c:v', 'libwebp', '-quality', '88', dst]);
      if (n % 10 === 0) console.log('upscaled', n, '/', ups.length); }
    fs.rmSync(tmp, { recursive: true, force: true }); }
  fs.writeFileSync(DIR + 'hd.json', JSON.stringify(hd)); console.log('wrote', DIR + 'hd.json'); }
