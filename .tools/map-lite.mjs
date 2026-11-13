// A light copy of a map for headless tests of the whole map (.tools/map-test.mjs serves it in place of the real files, so
// a full-map run fits the test memory budget): the external textures as 16 px copies (same names, same alpha) and the model
// with every drawn mesh simplified to about --ratio of its triangles. Collision meshes (COL_/PCOL_/NCOL_/CLIP_) are copied
// untouched, node names and the scene tree stay, and a mesh whose bounds would move is kept whole (mods measure meshes).
//   node .tools/map-lite.mjs <map-id> [--size 16] [--ratio .06] [--force]   -> scratch/lite/<map-id>/   (git-ignored; rerun after a map rebuild)
// --keep <regex> leaves meshes whose material or mesh name matches untouched (a test that needs exact pieces: the castle's void planes).
import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process';
import { MeshoptSimplifier } from '../node_modules/meshoptimizer/meshopt_simplifier.js';
const id = process.argv[2], size = +(process.argv[process.argv.indexOf('--size') + 1] || 16) || 16;
if (!id) { console.error('usage: node .tools/map-lite.mjs <map-id> [--size 16]'); process.exit(1); }
const src = `export/web/mods/maps/${id}/tex`, dst = `scratch/lite/${id}/tex`;
const ratio = +(process.argv[process.argv.indexOf('--ratio') + 1]) || .06;
const KEEP = process.argv.includes('--keep') ? new RegExp(process.argv[process.argv.indexOf('--keep') + 1]) : null;
await liteModel(id, process.argv.includes('--ratio') ? ratio : .06);
if (!fs.existsSync(src)) { console.log(id, 'has no tex/ folder (its textures are inside the GLB)'); process.exit(0); }
fs.mkdirSync(dst, { recursive: true });
const todo = fs.readdirSync(src).filter(f => /\.(webp|png|jpg)$/i.test(f)).filter(f => { try { return fs.statSync(path.join(dst, f)).mtimeMs < fs.statSync(path.join(src, f)).mtimeMs; } catch { return true; } });
let done = 0, bad = 0, i = 0; const t0 = Date.now();
const one = () => new Promise(res => { const f = todo[i++]; if (!f) return res(false);
  const p = spawn('ffmpeg', ['-v', 'error', '-y', '-i', path.join(src, f), '-vf', `scale=${size}:${size}:flags=area`, '-frames:v', '1', '-c:v', /\.webp$/i.test(f) ? 'libwebp' : /\.png$/i.test(f) ? 'png' : 'mjpeg', ...(/\.webp$/i.test(f) ? ['-lossless', '1'] : []), path.join(dst, f)], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', d => err += d); p.on('close', c => { if (c) { bad++; if (bad < 4) console.log('failed', f, err.slice(0, 120)); } else done++; res(true); }); });
await Promise.all([0, 1, 2].map(async () => { while (await one()); }));
console.log(`${id}: ${done} made, ${bad} failed, ${fs.readdirSync(dst).length} in ${dst} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

// ---- the map model: collision meshes exact, everything else simplified ------------------------------------------------
async function liteModel(id, ratio) {
  const entry = (JSON.parse(fs.readFileSync('export/web/mods/maps.json', 'utf8')).maps || []).find(m => m.id === id);
  const model = String(entry?.model || `${id}.glb`).split('?')[0], srcF = `export/web/mods/maps/${id}/${model}`, dstF = `scratch/lite/${id}/${model}`;
  if (!fs.existsSync(srcF)) return console.log('no model', srcF);
  if (fs.existsSync(dstF) && fs.statSync(dstF).mtimeMs > fs.statSync(srcF).mtimeMs && !process.argv.includes('--force')) return console.log(`${dstF} is up to date (--force rebuilds)`);
  await MeshoptSimplifier.ready; const t0 = Date.now();
  const file = fs.readFileSync(srcF), jl = file.readUInt32LE(12), g = JSON.parse(file.subarray(20, 20 + jl).toString()), bin = file.subarray(20 + jl + 8, 20 + jl + 8 + file.readUInt32LE(20 + jl));
  const CSZ = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, TN = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  const esz = a => CSZ[a.componentType] * TN[a.type];
  const read = i => { const a = g.accessors[i]; if (a.sparse) throw new Error('sparse accessor'); const v = g.bufferViews[a.bufferView], n = esz(a), o = (v.byteOffset || 0) + (a.byteOffset || 0);
    if (!v.byteStride || v.byteStride === n) return bin.subarray(o, o + a.count * n);
    const out = Buffer.alloc(a.count * n); for (let k = 0; k < a.count; k++) bin.copy(out, k * n, o + k * v.byteStride, o + k * v.byteStride + n); return out; };
  const chunks = [], views = [], accs = []; let off = 0;
  const put = (buf, target) => { const pad = (4 - off % 4) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; } views.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(target ? { target } : {}) }); chunks.push(buf); off += buf.length; return views.length - 1; };
  const kept = new Map(), keep = (i, target) => { if (i == null) return i; if (!kept.has(i)) { const a = g.accessors[i], n = { ...a, bufferView: put(read(i), target) }; delete n.byteOffset; accs.push(n); kept.set(i, accs.length - 1); } return kept.get(i); };
  const COL = /^(COL|UCX|collision|PCOL|NCOL|CLIP)[_.-]/i, col = new Set();
  g.meshes.forEach((m, i) => { if (COL.test(m.name || '')) col.add(i); }); for (const n of g.nodes) if (n.mesh != null && COL.test(n.name || '')) col.add(n.mesh);
  const f32 = b => new Float32Array(b.buffer, b.byteOffset, b.length / 4).slice();
  const done = new Map(); let tin = 0, tout = 0, tcol = 0, fell = 0, fellT = 0;
  g.meshes.forEach((m, mi) => { for (const p of m.primitives) {
    const A = p.attributes, tris = (p.indices != null ? g.accessors[p.indices].count : g.accessors[A.POSITION].count) / 3, pa = g.accessors[A.POSITION];
    if (col.has(mi) || (p.mode ?? 4) !== 4 || tris < 12 || KEEP?.test(g.materials?.[p.material]?.name || '') || KEEP?.test(m.name || '') || pa.componentType !== 5126 || p.targets) { if (col.has(mi)) tcol += tris; else { tin += tris; tout += tris; }
      for (const k in A) A[k] = keep(A[k], 34962); p.indices = keep(p.indices, 34963); continue; }
    const key = p.indices + '|' + Object.entries(A).map(e => e.join(':')).join(','); tin += tris;
    if (!done.has(key)) {
      const pos = f32(read(A.POSITION)), ia = p.indices != null ? g.accessors[p.indices] : null, ib = ia && read(p.indices);
      const idx = !ia ? Uint32Array.from({ length: pa.count }, (_, k) => k) : ia.componentType === 5125 ? new Uint32Array(ib.buffer, ib.byteOffset, ia.count).slice() : ia.componentType === 5123 ? Uint32Array.from(new Uint16Array(ib.buffer.slice(ib.byteOffset, ib.byteOffset + ib.length))) : Uint32Array.from(ib);
      const target = Math.max(12, Math.floor(tris * ratio) * 3); let out = idx;
      const box = ix => { const b = [1e30, 1e30, 1e30, -1e30, -1e30, -1e30]; for (const v of ix) for (let c = 0; c < 3; c++) { const x = pos[v * 3 + c]; if (x < b[c]) b[c] = x; if (x > b[3 + c]) b[3 + c] = x; } return b; };
      const b0 = box(idx), ext = Math.max(b0[3] - b0[0], b0[4] - b0[1], b0[5] - b0[2]); let ok = false;
      for (const e of [.1, .03, .01, .003]) { const [o] = MeshoptSimplifier.simplify(idx, pos, 3, target, e, []), b1 = o.length ? box(o) : null;   // the bounds must stay: mods measure meshes
        if (b1 && !b0.some((v, c) => Math.abs(v - b1[c]) > Math.max(.5, ext * .03))) { out = o; ok = true; break; } }
      if (!ok) { fell++; fellT += tris; }
      const remap = new Int32Array(pa.count).fill(-1); let nv = 0; const order = []; for (const v of out) if (remap[v] < 0) { remap[v] = nv++; order.push(v); }
      const nA = {}; for (const k in A) { const a = g.accessors[A[k]], n = esz(a), src = read(A[k]), dst = Buffer.alloc(nv * n); for (let j = 0; j < nv; j++) src.copy(dst, j * n, order[j] * n, order[j] * n + n);
        const na = { componentType: a.componentType, type: a.type, count: nv, bufferView: put(dst, 34962), ...(a.normalized ? { normalized: true } : {}) };
        if (k === 'POSITION') { const b = box(out); na.min = b.slice(0, 3); na.max = b.slice(3); } accs.push(na); nA[k] = accs.length - 1; }
      const big = nv > 65535, id2 = big ? new Uint32Array(out.length) : new Uint16Array(out.length); for (let j = 0; j < out.length; j++) id2[j] = remap[out[j]];
      accs.push({ componentType: big ? 5125 : 5123, type: 'SCALAR', count: out.length, bufferView: put(Buffer.from(id2.buffer), 34963) }); done.set(key, { A: nA, i: accs.length - 1, n: out.length / 3 });
    }
    const d = done.get(key); p.attributes = { ...d.A }; p.indices = d.i; tout += d.n; } });
  for (const n of g.nodes) { const x = n.extensions?.EXT_mesh_gpu_instancing?.attributes; if (x) for (const k in x) x[k] = keep(x[k]); }
  for (const a of g.animations || []) for (const s of a.samplers) { s.input = keep(s.input); s.output = keep(s.output); }
  for (const s of g.skins || []) if (s.inverseBindMatrices != null) s.inverseBindMatrices = keep(s.inverseBindMatrices);
  for (const im of g.images || []) if (im.bufferView != null) { const v = g.bufferViews[im.bufferView]; im.bufferView = put(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength)); }
  g.accessors = accs; g.bufferViews = views; g.buffers = [{ byteLength: off }];
  let js = Buffer.from(JSON.stringify(g)); if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - js.length % 4, 32)]); const bpad = (4 - off % 4) % 4;
  const head = Buffer.alloc(20); head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(28 + js.length + off + bpad, 8); head.writeUInt32LE(js.length, 12); head.writeUInt32LE(0x4E4F534A, 16);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(off + bpad, 0); bh.writeUInt32LE(0x004E4942, 4);
  fs.mkdirSync(path.dirname(dstF), { recursive: true }); const fd = fs.openSync(dstF, 'w'); for (const c of [head, js, bh, ...chunks, Buffer.alloc(bpad)]) fs.writeSync(fd, c); fs.closeSync(fd);
  console.log(`${id}: model ${(file.length / 1e6).toFixed(0)} -> ${(fs.statSync(dstF).size / 1e6).toFixed(0)} MB; drawn triangles ${(tin / 1e6).toFixed(2)} M -> ${(tout / 1e6).toFixed(2)} M (${fell} meshes with ${(fellT / 1e6).toFixed(2)} M kept whole), collision ${(tcol / 1e6).toFixed(2)} M untouched (${col.size} meshes) (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
