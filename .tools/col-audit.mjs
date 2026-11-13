#!/usr/bin/env node
// usage: ~/.local/bin/lowpri node .tools/col-audit.mjs <map-id> [--step 16] [--from-spawn] [--flood-only] [--no-rules | --rules file.json] [--trace x,y,z]
// Offline collision audit: floods the space a player can walk (collision meshes only), then looks for
//   through : a step the collision allows that passes through drawn geometry (walk-through walls and props)
//   ghost   : a step the collision blocks with nothing drawn within 24 units of the hit (invisible blockers)
//   floor   : drawn floor more than 8 units above or below the collision floor (sinking in / floating)
// -> scratch/col-audit/<map>[-rules][-spawn].json (lists by source and clusters)
// The map entry's propCollision rules (prop-collision.js) are part of the collision unless --no-rules; --rules tries a rule
// set from a file. --from-spawn floods from the player spawn only and lists the markers it cannot reach. --flood-only stops
// after the flood (seconds, little memory): points, markers, what was stood on, points under the map. --points file.json
// writes every walked point (other offline tools start from them: the castle's ceiling check). --trace prints the
// flood's way to the walked point nearest a position (how did it get there?). The full pass holds every drawn triangle near
// the walked space: about 3 GB for The Giant (docs/fork/custom-maps.md).
import fs from 'node:fs'; import * as THREE from 'three'; import { MeshBVH } from 'three-mesh-bvh';
const id = process.argv[2], arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? +process.argv[i + 1] : d; };
const STEP = arg('step', 16), dir = `export/web/mods/maps/${id}/`, t0 = Date.now(), log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const glb = fs.readFileSync(dir + id + '.glb'), jsonLen = glb.readUInt32LE(12), gltf = JSON.parse(glb.toString('utf8', 20, 20 + jsonLen)), bin0 = 20 + jsonLen + 8;
const TYPES = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array, 5120: Int8Array, 5122: Int16Array }, COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(i) {
  const a = gltf.accessors[i], v = gltf.bufferViews[a.bufferView], T = TYPES[a.componentType], n = a.count * COMPS[a.type], off = glb.byteOffset + bin0 + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  if (v.byteStride && v.byteStride !== T.BYTES_PER_ELEMENT * COMPS[a.type]) throw new Error('interleaved accessor');
  return off % T.BYTES_PER_ELEMENT ? new T(glb.buffer.slice(off, off + n * T.BYTES_PER_ELEMENT)) : new T(glb.buffer, off, n);
}
// world matrices
const parent = new Map(); gltf.nodes.forEach((n, i) => { for (const c of n.children ?? []) parent.set(c, i); });
const local = n => { const m = new THREE.Matrix4(); if (n.matrix) return m.fromArray(n.matrix); return m.compose(new THREE.Vector3(...(n.translation ?? [0, 0, 0])), new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])), new THREE.Vector3(...(n.scale ?? [1, 1, 1]))); };
const wcache = new Map(), world = i => { if (wcache.has(i)) return wcache.get(i); const m = local(gltf.nodes[i]); if (parent.has(i)) m.premultiply(world(parent.get(i))); wcache.set(i, m); return m; };
const topName = i => { let k = i; while (parent.has(k)) k = parent.get(k); return gltf.nodes[k].name ?? ''; };
const MARK = /^(PLAYER_SPAWN|WALLBUY|PERK|BOX|PAP|POWER|TELEPORT|TPDEST)/, marks = [], markNames = [];
gltf.nodes.forEach((n, i) => { if (MARK.test(n.name ?? '')) markNames.push(n.name), marks.push(new THREE.Vector3().setFromMatrixPosition(world(i))); });
const box = new THREE.Box3(); for (const m of marks) box.expandByPoint(m); box.expandByVector(new THREE.Vector3(1200, 500, 1200));
// ---- collision
const { modelOf, rulesOf, shapeOf, placeShape } = await import('../export/web/prop-collision.js');
const maps = JSON.parse(fs.readFileSync('export/web/mods/maps.json', 'utf8')), entry = (maps.maps ?? maps).find(m => m.id === id);
const rf = process.argv.indexOf('--rules'), RULES = process.argv.includes('--no-rules') ? null : rulesOf(rf > 0 ? JSON.parse(fs.readFileSync(process.argv[rf + 1], 'utf8')) : entry.propCollision);
const instMatrices = (n, i) => { const inst = n.extensions?.EXT_mesh_gpu_instancing?.attributes, m = world(i); if (!inst) return [m.clone()];
  const T = accessor(inst.TRANSLATION), R = inst.ROTATION != null ? accessor(inst.ROTATION) : null, S = inst.SCALE != null ? accessor(inst.SCALE) : null, q = new THREE.Quaternion(), t = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), out = [];
  for (let k = 0; k < T.length / 3; k++) { t.fromArray(T, k * 3); if (R) { q.fromArray(R, k * 4); if (!(R instanceof Float32Array)) { const d = R instanceof Int8Array ? 127 : 32767; q.set(q.x / d, q.y / d, q.z / d, q.w / d); } q.normalize(); } if (S) sc.fromArray(S, k * 3);
    out.push(m.clone().multiply(new THREE.Matrix4().compose(t, q, sc))); } return out; };
const cp = [], ci = []; let cv = 0, added = 0, nExtra = 0; const owners = [], ownerOf = tri => { for (const o of owners) if (tri >= o[0] && tri < o[1]) return o; return null; };
if (RULES) { const extra = [], by = {};
  gltf.nodes.forEach((n, i) => { const model = n.mesh != null && modelOf(n.name), shape = model && RULES.shape(model); if (!shape) return;
    for (const p of gltf.meshes[n.mesh].primitives) { const s = shapeOf(accessor(p.attributes.POSITION), p.indices != null ? accessor(p.indices) : null, shape);
      for (const m of instMatrices(n, i)) { const e0 = extra.length; if (placeShape(s, m.elements, RULES.minHeight, extra)) { added++; by[model] = (by[model] ?? 0) + 1; owners.push([e0 / 9, extra.length / 9, model, m.elements[12], m.elements[13], m.elements[14]]); } } } });
  for (let k = 0; k < extra.length; k++) cp.push(extra[k]); for (let k = 0; k < extra.length / 3; k++) ci.push(k); cv = nExtra = extra.length / 3;
  log('prop collision rules:', added, 'placed,', extra.length / 9, 'triangles ·', Object.entries(by).sort((x, y) => y[1] - x[1]).map(e => e.join(' x')).join(', ')); }
gltf.nodes.forEach((n, i) => { if (n.mesh == null || !/^(COL_|PCOL_)/.test(n.name ?? '')) return; const m = world(i), v = new THREE.Vector3();
  for (const p of gltf.meshes[n.mesh].primitives) { const P = accessor(p.attributes.POSITION), I = accessor(p.indices);
    for (let k = 0; k < P.length; k += 3) { v.set(P[k], P[k + 1], P[k + 2]).applyMatrix4(m); cp.push(v.x, v.y, v.z); } for (let k = 0; k < I.length; k++) ci.push(I[k] + cv); cv += P.length / 3; } });
const cgeo = new THREE.BufferGeometry(); cgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cp), 3)); cgeo.setIndex(new THREE.BufferAttribute(new Uint32Array(ci), 1));
const cbvh = new MeshBVH(cgeo, { targetLeafSize: 6 }); log('collision', ci.length / 3, 'triangles');
// ---- walk flood (collision only)
const ray = new THREE.Ray(), DS = THREE.DoubleSide, DOWN = new THREE.Vector3(0, -1, 0), d = new THREE.Vector3(), o = new THREE.Vector3();
const cast = (bvh, from, dirv, far) => { ray.origin.copy(from); ray.direction.copy(dirv); return bvh.raycastFirst(ray, DS, 0, far); };
let lastProp = false, lastTri = -1; const propOwner = new Map(); const cidx = () => cgeo.index.array, floor = (x, y, z) => { const h = cast(cbvh, o.set(x, y + 30, z), DOWN, 150); lastProp = !!h && cidx()[h.faceIndex * 3] < nExtra; lastTri = lastProp ? Math.floor(cidx()[h.faceIndex * 3] / 3) : -1; return h ? h.point.y : null; };
const key = (ix, iz, y) => ix + ',' + iz + ',' + Math.round(y / 40), seen = new Map(), par = new Map(), queue = [], FROM_SPAWN = process.argv.includes('--from-spawn');
const seeds = FROM_SPAWN ? marks.filter((m, k) => /^PLAYER_SPAWN/.test(markNames[k])) : marks;
for (const m of seeds) { const ix = Math.round(m.x / STEP), iz = Math.round(m.z / STEP), y = floor(ix * STEP, m.y + 10, iz * STEP); if (y == null) continue; const k = key(ix, iz, y); if (!seen.has(k)) { seen.set(k, y); queue.push([ix, iz, y]); } }
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]], HS = [20, 38, 56], p0 = new THREE.Vector3(), tgt = { point: new THREE.Vector3(), distance: 0 }, pts = [], moves = [], blocks = [];
const coarse = new Set(), ck = (x, y, z) => Math.floor(x / 64) + ',' + Math.floor(y / 64) + ',' + Math.floor(z / 64);
let qi = 0, onProp = 0; const propPts = new Set();
while (qi < queue.length) { const [ix, iz, y] = queue[qi++], x = ix * STEP, z = iz * STEP; pts.push([x, y, z]);
  for (let ax = -1; ax <= 1; ax++) for (let ay = -1; ay <= 2; ay++) for (let az = -1; az <= 1; az++) coarse.add(ck(x + ax * 64, y + ay * 64, z + az * 64));
  for (const [dx, dz] of DIRS) { const jx = ix + dx, jz = iz + dz, X = jx * STEP, Z = jz * STEP; if (X < box.min.x || X > box.max.x || Z < box.min.z || Z > box.max.z) continue;
    d.set(dx, 0, dz); let blocked = null; for (const h of HS) { const hit = cast(cbvh, p0.set(x, y + h, z), d, STEP); if (hit) { blocked = hit.point.clone(); break; } }
    const y2 = floor(X, y, Z);
    if (blocked) { if (y2 != null && Math.abs(y2 - y) <= 18) blocks.push(blocked); continue; }
    if (y2 == null || y2 - y > 18 || y - y2 > 110) continue;
    moves.push([x, y, z, dx, dz]);
    const k = key(jx, jz, y2); if (!seen.has(k)) { if (lastProp) { onProp++; propPts.add(k); const ow = ownerOf(lastTri); if (ow) propOwner.set(k, ow); } seen.set(k, y2); par.set(k, [key(ix, iz, y), x, Math.round(y), z]); queue.push([jx, jz, y2]); } } }
log('walkable points', seen.size, 'moves', moves.length, '· standing on rule shapes', onProp);
{ const c = {}; for (const o of propOwner.values()) c[o[2]] = (c[o[2]] ?? 0) + 1; log('stood on', JSON.stringify(c)); }
{ const ti = process.argv.indexOf('--trace'); if (ti > 0) { const [tx, ty, tz] = process.argv[ti + 1].split(',').map(Number); let best = null, bd = 1e9;
    for (const [x, y, z] of pts) { const dd = Math.abs(x - tx) + Math.abs(y - ty) + Math.abs(z - tz); if (dd < bd) { bd = dd; best = key(Math.round(x / STEP), Math.round(z / STEP), y); } }
    const chain = []; let k = best; while (par.has(k) && chain.length < 4000) { const e = par.get(k); chain.push(e.slice(1).join(',') + (propPts.has(e[0]) ? ' PROP:' + (propOwner.get(e[0])?.slice(2).map(v => typeof v === 'number' ? Math.round(v) : v).join('@') ?? '?') : '')); k = e[0]; }
    console.log('trace to', tx, ty, tz, '(nearest', bd, ') length', chain.length, '\n ' + chain.filter((c, i) => /PROP/.test(c) || i % Math.max(1, Math.floor(chain.length / 40)) === 0).join(' <- ')); process.exit(0); } }
if (FROM_SPAWN) { const lost = []; marks.forEach((m, k) => { const ix = Math.round(m.x / STEP), iz = Math.round(m.z / STEP), y = floor(ix * STEP, m.y + 10, iz * STEP);
    let ok = false; if (y != null) for (let ax = -3; ax <= 3 && !ok; ax++) for (let az = -3; az <= 3 && !ok; az++) for (const dy of [-40, 0, 40]) if (seen.has(key(ix + ax, iz + az, y + dy))) { ok = true; break; }
    if (!ok) lost.push(markNames[k] + '@' + [m.x, m.y, m.z].map(Math.round)); });
  console.log('markers not reached from the player spawn:', lost.length, 'of', marks.length, '\n ' + lost.join('\n ')); }
{ const pi = process.argv.indexOf('--points'); if (pi > 0) { fs.writeFileSync(process.argv[pi + 1], JSON.stringify(pts.map(p => p.map(Math.round)))); console.log('walked points ->', process.argv[pi + 1]); } }
if (process.argv.includes('--flood-only')) { let low = 0, minY = 1e9; for (const y of seen.values()) { if (y < -20) low++; if (y < minY) minY = y; } console.log('flood only: points below y -20:', low, 'lowest', Math.round(minY)); process.exit(0); }
// ---- drawn geometry (opaque and alpha-tested; blended materials are glass, decals and cards)
const names = [], nameId = new Map(), sid = s => { if (!nameId.has(s)) { nameId.set(s, names.length); names.push(s); } return nameId.get(s); };
let cap = 4e6, vp = new Float32Array(cap * 9), vs = new Uint16Array(cap), nt = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), im = new THREE.Matrix4(), mm = new THREE.Matrix4();
const addTris = (P, I, m, s) => { for (let k = 0; k < I.length; k += 3) {
  a.fromArray(P, I[k] * 3).applyMatrix4(m); b.fromArray(P, I[k + 1] * 3).applyMatrix4(m); c.fromArray(P, I[k + 2] * 3).applyMatrix4(m);
  if (!coarse.has(ck(a.x, a.y, a.z)) && !coarse.has(ck(b.x, b.y, b.z)) && !coarse.has(ck(c.x, c.y, c.z)) && !coarse.has(ck((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3))) continue;
  if (nt === cap) { cap *= 2; const p2 = new Float32Array(cap * 9); p2.set(vp); vp = p2; const s2 = new Uint16Array(cap); s2.set(vs); vs = s2; }
  a.toArray(vp, nt * 9); b.toArray(vp, nt * 9 + 3); c.toArray(vp, nt * 9 + 6); vs[nt++] = s; } };
gltf.nodes.forEach((n, i) => {
  const name = n.name ?? ''; if (n.mesh == null || /^(COL_|PCOL_|NCOL_)/.test(name)) return; const top = topName(i); if (/^(DOOR_|COL_|PCOL_)/.test(top)) return;
  const inst = n.extensions?.EXT_mesh_gpu_instancing?.attributes, m = world(i), label = /^bsp_/.test(name) ? 'bsp' : name.replace(/^prop_/, '').replace(/_-?\d+_-?\d+(_\d+)?$/, '');
  for (const p of gltf.meshes[n.mesh].primitives) { const mat = gltf.materials[p.material] ?? {}; if (mat.alphaMode === 'BLEND') continue;
    const P = accessor(p.attributes.POSITION), I = p.indices != null ? accessor(p.indices) : Uint32Array.from({ length: P.length / 3 }, (_, k) => k), s = sid(label === 'bsp' ? 'bsp:' + (mat.name ?? '?') : label + (mat.alphaMode === 'MASK' ? ' (mask)' : ''));
    if (!inst) { addTris(P, I, m, s); continue; }
    const T = accessor(inst.TRANSLATION), R = inst.ROTATION != null ? accessor(inst.ROTATION) : null, S = inst.SCALE != null ? accessor(inst.SCALE) : null, q = new THREE.Quaternion(), t = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
    for (let k = 0; k < T.length / 3; k++) { t.fromArray(T, k * 3); if (R) { q.fromArray(R, k * 4); if (!(R instanceof Float32Array)) { const d = R instanceof Int8Array ? 127 : 32767; q.set(q.x / d, q.y / d, q.z / d, q.w / d); } q.normalize(); } if (S) sc.fromArray(S, k * 3);
      if (!box.containsPoint(t)) continue; mm.copy(m).multiply(im.compose(t, q, sc)); addTris(P, I, mm, s); } } });
const vgeo = new THREE.BufferGeometry(); vgeo.setAttribute('position', new THREE.BufferAttribute(vp.subarray(0, nt * 9), 3));
const vbvh = new MeshBVH(vgeo, { targetLeafSize: 8 }), vidx = vgeo.index.array, srcOf = f => names[vs[Math.floor(vidx[f * 3] / 3)]]; log('drawn', nt, 'triangles,', names.length, 'sources; rss', Math.round(process.memoryUsage().rss / 1e6), 'MB');
// ---- the checks
const through = [], ghost = [], floorOff = [];
for (const [x, y, z] of pts) { const vf = cast(vbvh, p0.set(x, y + 30, z), DOWN, 110); if (vf) { const off = vf.point.y - y; if (Math.abs(off) > 8 && Math.abs(off) < 28) floorOff.push([x, Math.round(y), z, Math.round(off), srcOf(vf.faceIndex)]); } }
for (const [x, y, z, dx, dz] of moves) { d.set(dx, 0, dz); for (const h of HS) { const hit = cast(vbvh, p0.set(x, y + h, z), d, STEP); if (hit) { through.push([Math.round(hit.point.x), Math.round(hit.point.y), Math.round(hit.point.z), srcOf(hit.faceIndex)]); break; } } }
for (const bl of blocks) { vbvh.closestPointToPoint(bl, tgt, 0, 60); if (!(tgt.distance <= 24)) ghost.push([Math.round(bl.x), Math.round(bl.y), Math.round(bl.z)]); }
log('through', through.length, '· ghost', ghost.length, '· floor', floorOff.length);
const bySrc = (list, at) => { const m = new Map(); for (const r of list) { const e = m.get(r[at]) ?? { n: 0, at: r.slice(0, 3) }; e.n++; m.set(r[at], e); } return [...m].sort((p, q) => q[1].n - p[1].n).map(([k, v]) => `${v.n} ${k} e.g. ${v.at}`); };
const clusters = (list, r = 120) => { const cl = []; for (const p of list) { let c0 = cl.find(q => Math.abs(q.c[0] - p[0]) < r && Math.abs(q.c[1] - p[1]) < r && Math.abs(q.c[2] - p[2]) < r); if (!c0) cl.push(c0 = { c: p.slice(0, 3), n: 0, src: {} }); c0.n++; if (p[3] != null && typeof p[3] === 'string') c0.src[p[3]] = (c0.src[p[3]] ?? 0) + 1; }
  return cl.sort((p, q) => q.n - p.n).map(q => `${q.n} @ ${q.c} ${Object.entries(q.src).sort((x, y) => y[1] - x[1]).slice(0, 3).map(e => e[0] + ' x' + e[1]).join(', ')}`); };
const out = { map: id, step: STEP, walkable: seen.size, through: { n: through.length, bySource: bySrc(through, 3), clusters: clusters(through) }, ghost: { n: ghost.length, clusters: clusters(ghost) },
  floor: { n: floorOff.length, sunk: bySrc(floorOff.filter(r => r[3] > 0), 4), floating: bySrc(floorOff.filter(r => r[3] < 0), 4) }, raw: { through, ghost, floorOff } };
fs.mkdirSync('scratch/col-audit', { recursive: true });
fs.writeFileSync(`scratch/col-audit/${id}${RULES ? '-rules' : ''}${FROM_SPAWN ? '-spawn' : ''}.json`, JSON.stringify(out));
console.log('THROUGH by source:\n ' + out.through.bySource.slice(0, 45).join('\n ')); console.log('THROUGH clusters:', out.through.clusters.length, '\n ' + out.through.clusters.slice(0, 25).join('\n '));
console.log('GHOST clusters:', out.ghost.clusters.length, '\n ' + out.ghost.clusters.slice(0, 25).join('\n '));
console.log('SUNK:\n ' + out.floor.sunk.slice(0, 20).join('\n ')); console.log('FLOATING:\n ' + out.floor.floating.slice(0, 20).join('\n '));
