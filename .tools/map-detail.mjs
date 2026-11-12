// Texel density of a BO3 port's colour textures, and what to do about the blurry ones (2026-11-12, Der Eisendrache:
// "some textures are also extremely blurry"). Two findings feed the map's detail.json (next to the GLB, git-ignored):
//   tile  BO3 props take their colour from small tiling "micro" detail maps (i_t7_micro_*); the port stretches each once
//         over the whole prop (a boulder: 256 texels across 1,000 units). material name -> repeat for the colour map,
//         so one tile covers about TILE (32) units (the unique normal map keeps its own UVs).
//   hd    the other colour maps under 4 texels a unit, re-encoded larger from the Greyhound export (within --budget MB
//         of extra texture memory, largest blurry area first): old uri -> new uri, swapped at load by a URL redirect.
// node .tools/map-detail.mjs <map-id> [--pts walkable.json] [--budget 160] [--go]     (no --go: report only)
// --pts: {pts:[[x,y,z],...]} walkable points; only surfaces within about 500 units of one count (col-audit's flood).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
const args = process.argv.slice(2), opt = k => { const i = args.indexOf('--' + k); return i < 0 ? null : args[i + 1]; };
const MAP = args[0], DIR = 'export/web/mods/maps/' + MAP + '/', GO = args.includes('--go'), BUDGET = +(opt('budget') ?? 160), PTS = opt('pts');
const P = DIR + MAP + '.glb', buf = fs.readFileSync(P);
const jl = buf.readUInt32LE(12), g = JSON.parse(buf.subarray(20, 20 + jl).toString()), bin = buf.subarray(20 + jl + 8);
const acc = i => { const a = g.accessors[i], v = g.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array, 5122: Int16Array, 5120: Int8Array }[a.componentType];
  const off = (v.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = v.byteStride ?? 0, bpe = T.BYTES_PER_ELEMENT;
  if (!stride || stride === n * bpe) { const sl = bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * n * bpe); let arr = new T(sl); if (a.normalized) { const d = { 5123: 65535, 5121: 255, 5122: 32767, 5120: 127 }[a.componentType]; arr = Float32Array.from(arr, x => x / d); } return { arr, n, count: a.count }; }
  const out = new Float32Array(a.count * n), dv = new DataView(bin.buffer, bin.byteOffset + off); const rd = { 5126: 'getFloat32', 5125: 'getUint32', 5123: 'getUint16', 5121: 'getUint8', 5122: 'getInt16', 5120: 'getInt8' }[a.componentType];
  for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = dv[rd](i * stride + k * bpe, true);
  return { arr: out, n, count: a.count }; };
// walkable points -> grid
const CELL = 256, grid = new Set(); if (PTS) for (const [x, y, z] of JSON.parse(fs.readFileSync(PTS)).pts) grid.add(Math.floor(x / CELL) + ',' + Math.floor(y / CELL) + ',' + Math.floor(z / CELL));
const near = (x, y, z) => { if (!PTS) return true; const a = Math.floor(x / CELL), b = Math.floor(y / CELL), c = Math.floor(z / CELL); for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) if (grid.has((a + i) + ',' + (b + j) + ',' + (c + k))) return true; return false; };
// mesh-local stats per primitive: area, uv area, centroid
const prim = new Map(), stat = (mi, pi) => { const k = mi + ':' + pi; if (prim.has(k)) return prim.get(k); const p = g.meshes[mi].primitives[pi]; let r = null;
  if (p.attributes.TEXCOORD_0 != null && p.indices != null && (p.mode ?? 4) === 4) { const pos = acc(p.attributes.POSITION).arr, uv = acc(p.attributes.TEXCOORD_0), idx = acc(p.indices).arr, un = uv.n, u = uv.arr; let A = 0, U = 0, cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < idx.length; i += 3) { const a = idx[i], b = idx[i + 1], c = idx[i + 2], ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2], e1x = pos[b * 3] - ax, e1y = pos[b * 3 + 1] - ay, e1z = pos[b * 3 + 2] - az, e2x = pos[c * 3] - ax, e2y = pos[c * 3 + 1] - ay, e2z = pos[c * 3 + 2] - az;
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x, ar = Math.hypot(nx, ny, nz) / 2; if (!(ar > 0)) continue;
      const ua = Math.abs((u[b * un] - u[a * un]) * (u[c * un + 1] - u[a * un + 1]) - (u[c * un] - u[a * un]) * (u[b * un + 1] - u[a * un + 1])) / 2;
      A += ar; U += ua; cx += ax * ar; cy += ay * ar; cz += az * ar; }
    if (A > 0) r = { A, U, c: [cx / A, cy / A, cz / A], mat: p.material }; }
  prim.set(k, r); return r; };
const mats = new Map(), tex = new Map();   // image index -> {A, wd (area-weighted log density at size 1), uses}
const add = (s, m) => { if (!s || s.mat == null) return; const mat = g.materials[s.mat], t = mat.pbrMetallicRoughness?.baseColorTexture?.index; if (t == null) return;
  const sc = Math.cbrt(Math.abs(m.determinant())), c = new THREE.Vector3(...s.c).applyMatrix4(m); if (!near(c.x, c.y, c.z)) return;
  const img = g.textures[t].extensions?.EXT_texture_webp?.source ?? g.textures[t].source, A = s.A * sc * sc, d1 = Math.sqrt(s.U / A);   // uv per unit
  const e = tex.get(img) ?? { A: 0, w: 0, mats: new Set() }; e.A += A; e.w += A * Math.log2(Math.max(d1, 1e-9)); e.mats.add(mat.name); tex.set(img, e); 
  const me = mats.get(mat.name) ?? { A: 0, w: 0, img, n: 0 }; me.A += A; me.w += A * Math.log2(Math.max(d1, 1e-9)); me.n++; mats.set(mat.name, me); };
const M = new THREE.Matrix4(), I = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sv = new THREE.Vector3();
const walk = (ni, parent) => { const n = g.nodes[ni], m = new THREE.Matrix4(); if (n.matrix) m.fromArray(n.matrix); else m.compose(v.fromArray(n.translation ?? [0, 0, 0]), q.fromArray(n.rotation ?? [0, 0, 0, 1]), sv.fromArray(n.scale ?? [1, 1, 1])); m.premultiply(parent);
  if (n.mesh != null) { const inst = n.extensions?.EXT_mesh_gpu_instancing?.attributes, np = g.meshes[n.mesh].primitives.length;
    if (inst) { const T = acc(inst.TRANSLATION).arr, R = inst.ROTATION != null ? acc(inst.ROTATION).arr : null, S = inst.SCALE != null ? acc(inst.SCALE).arr : null, cnt = T.length / 3;
      for (let i = 0; i < cnt; i++) { I.compose(v.set(T[i * 3], T[i * 3 + 1], T[i * 3 + 2]), R ? q.set(R[i * 4], R[i * 4 + 1], R[i * 4 + 2], R[i * 4 + 3]) : q.identity(), S ? sv.set(S[i * 3], S[i * 3 + 1], S[i * 3 + 2]) : sv.set(1, 1, 1)); M.multiplyMatrices(m, I); for (let p = 0; p < np; p++) add(stat(n.mesh, p), M); } }
    else for (let p = 0; p < np; p++) add(stat(n.mesh, p), m); }
  for (const c of n.children ?? []) walk(c, m); };
for (const r of g.scenes[g.scene ?? 0].nodes) walk(r, new THREE.Matrix4());
const rows = [...tex].map(([img, e]) => { const uri = g.images[img].uri, size = +(uri.match(/_(\d+)\.webp$/)?.[1] ?? 0), d = size * 2 ** (e.w / e.A); return { uri, size, area: Math.round(e.A), dens: +d.toFixed(2), mats: [...e.mats].slice(0, 3) }; });
const GH = '/mass_drive/SteamLibrary/steamapps/compatdata/311210/pfx/drive_c/greyhound/exported_files/black_ops_3/ximages/';
const srcOf = uri => GH + uri.replace(/^tex\//, '').replace(/_\d+\.webp$/, '') + '.png';
const srcInfo = uri => { try { const fd = fs.openSync(srcOf(uri), 'r'), h = Buffer.alloc(26); fs.readSync(fd, h, 0, 26, 0); fs.closeSync(fd); return { w: h.readUInt32BE(16), h: h.readUInt32BE(20), alpha: h[25] === 4 || h[25] === 6 }; } catch { return null; } };
const TILE = 32, tile = {}; let mA = 0;
// Tiling sources: the micro maps, and library textures (i_t7_*, not decals or signs) a prop material stretches at least
// 2.3 to 8.5 tiles' worth (a unique unwrap is named after its material, i_mtl_*, and is never tiled; past 8.5 the prop
// is sampling one flat patch of the texture as a colour, which tiling would turn into a pattern).
const LIB = /^tex\/i_t7_(?!decal|foliage|vista)/, NOT = /decal|sign|logo|poster|numbers|text|graffiti|stain|leak|grunge/;
for (const [name, e] of mats) { const uri = g.images[e.img].uri, micro = /_micro_/.test(uri);
  if (!micro && (!name.startsWith('mtl_') || !LIB.test(uri) || NOT.test(uri + name))) continue;
  const raw = 1 / (TILE * 2 ** (e.w / e.A)), rep = Math.round(raw); if (micro ? rep >= 2 : raw >= 2.3 && raw <= 8.5) { tile[name] = Math.min(rep, 32); mA += e.A; if (!micro && args.includes('--list')) console.log('  lib', name, uri, rep, Math.round(e.A)); } }
console.log('colour textures:', rows.length, '· micro materials to tile:', Object.keys(tile).length, '(area', Math.round(mA / 1e6) + 'M)');
const have = new Set(g.images.map(i => i.uri)), hd = {}, todo = []; let mb = 0;
const cand = rows.filter(r => r.dens > 0 && r.dens < 4 && r.area >= 1e5 && !/_micro_/.test(r.uri) && !/foliage|vista/.test(r.uri + r.mats[0])).sort((a, b) => b.area * Math.log2(4 / b.dens) - a.area * Math.log2(4 / a.dens));
for (const r of cand) { const si = srcInfo(r.uri); if (!si) continue; const max = Math.max(si.w, si.h), size = Math.min(r.dens * 512 / r.size >= 3.5 ? 512 : 1024, max); if (size <= r.size) continue;
  const uri = r.uri.replace(/_\d+\.webp$/, '_' + size + '.webp'), cost = have.has(uri) ? 0 : (size * size - r.size * r.size) * (Math.min(si.w, si.h) / max) * 4 * 1.33 / 1048576;
  if (mb + cost > BUDGET) continue; mb += cost; hd[r.uri] = uri; if (!have.has(uri)) todo.push({ uri, size, alpha: si.alpha, src: srcOf(r.uri) });
  console.log(String(r.area).padStart(9), String(r.dens).padStart(5), '->', (r.dens * size / r.size).toFixed(1).padStart(5), r.uri.replace('tex/', '').padEnd(58), size, have.has(uri) ? '(already loaded)' : '+' + cost.toFixed(1) + ' MB'); }
console.log('larger copies:', Object.keys(hd).length, '· to encode:', todo.length, '· extra texture memory about', Math.round(mb), 'MB');
if (GO) { for (const t of todo) { const dst = DIR + t.uri; if (fs.existsSync(dst)) continue;
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', t.src, '-vf', `scale='min(${t.size},iw)':'min(${t.size},ih)':force_original_aspect_ratio=decrease`, '-c:v', 'libwebp', '-quality', '82', ...(t.alpha ? ['-pix_fmt', 'yuva420p'] : []), dst]); }
  fs.writeFileSync(DIR + 'detail.json', JSON.stringify({ tile, hd })); console.log('wrote', DIR + 'detail.json'); }
