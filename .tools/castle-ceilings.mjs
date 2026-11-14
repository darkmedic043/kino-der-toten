// Der Eisendrache: the "infinite blackness" planes that are ceilings over walkable space, and the gaps beside them (waw-ports.md, Der Eisendrache, void ceilings).
// Rays go up from every walkable point of the real model; a void triangle they hit is redrawn as lit stone by overlays.js voidCeilings(),
// and a slit that shows what is above a void ceiling gets a plug. Steps (about 50 min, 2 x 1.6 GB of RAM; run under a memory cap):
//   node .tools/col-audit.mjs der-eisendrache --flood-only --points scratch/ceilings/walk.json
//   node .tools/castle-ceilings.mjs scan            every tile, two at a time (tiles already in scratch/ceilings/ are skipped: empty the folder after a rebuild)
//   node .tools/castle-ceilings.mjs build [--write] -> scratch/ceilings/ceilings.js (--write: also the mod's ceilings.js)
//   node .tools/castle-ceilings.mjs tile <ix> <iz> verify ; node .tools/castle-ceilings.mjs check <ix>_<iz>|all   open rays of a tile before and after the plugs
//   (scan verify does every tile). A ray counts as open when it leaves through the ceiling level: it ends above the highest void the point sees, or finds
//   nothing although it reaches that level within FAR. Rays that end on rock or walls below it, or run out of length under it, are closed, and so are rays
//   that end in a taller room under that room's own void ceiling (an opening). A point with over 10% of its rays open is under open sky and listed apart.
//   node .tools/castle-ceilings.mjs status          is ceilings.js still the table of the current GLB (exit 1: rerun; .tools/castle-after-rebuild.sh does it all)
//   node .tools/castle-ceilings.mjs probe "<x,y,z>" "<ray,ray,...>" [far]   follow single rays of a point further; WHY=x,y,z with build explains a point's gap rays
//   scan --fresh redoes tiles that already have a file (after a rebuild).
//   JOBS=1 scans one tile at a time (a tile peaks near 4 GB with the page cache; two at a time need a 6 GB cap). A tile that dies makes scan exit 1.
// env: T tile size 768, FAR ray length 1400, GRID point spacing 96, NR rays a point 300, MAT ceiling material, MINV 15, REACH 600, MAXG .1, MINN 1, MINT 1
import fs from 'fs'; import { spawn } from 'child_process'; import * as THREE from 'three'; import { MeshBVH } from 'three-mesh-bvh';
const DIR = 'scratch/ceilings/', T = +process.env.T || 768, FAR = +process.env.FAR || 1400, GRID = +process.env.GRID || 96, EYE = 60, NR = +process.env.NR || 300, mode = process.argv[2];
const dirs = []; for (let k = 0; k < NR; k++) { const y = .22 + .78 * (k + .5) / NR, r = Math.sqrt(1 - y * y), ph = k * 2.399963; dirs.push([r * Math.cos(ph), y, r * Math.sin(ph)]); }
const VOIDRE = /global_diffuse_black|infinite_blackness/;
// Upright patches placed by hand, [x0,z0,x1,z1,y0,y1, seen-from x,y,z]: openings in a vault that look sideways into dead space, which no flat plug closes.
// The Juggernog room's vault is open between its ribs above the pillar (x 368..410, up to the void ceiling at y 264) onto the gap between two buildings.
const WALLS = [[360, -1907.5, 416, -1907.5, 124, 264, 420, 158, -1802]];
const b = fs.readFileSync('export/web/mods/maps/der-eisendrache/der-eisendrache.glb'), jl = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jl).toString()), bin = b.subarray(20 + jl + 8);
const SIG = (await import('crypto')).createHash('sha1').update(b.subarray(20, 20 + jl)).digest('hex').slice(0, 16) + ':' + b.length;   // the GLB the table was made from
if (mode === 'status') { const f = 'export/web/mods/der-eisendrache/ceilings.js', m = fs.existsSync(f) && /"glb":"([^"]+)"/.exec(fs.readFileSync(f, 'utf8')), ok = !!m && m[1] === SIG;
  console.log(ok ? 'ceilings.js matches the current GLB (' + SIG + ')' : `ceilings.js is ${m ? 'from another build of the map (' + m[1] + ', now ' + SIG + ')' : 'unsigned'}: run .tools/castle-after-rebuild.sh, or scan --fresh and build --write`); process.exit(ok ? 0 : 1); }
const CT = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }, TN = { SCALAR: 1, VEC3: 3, VEC4: 4 };
const acc = i => { const a = j.accessors[i], v = j.bufferViews[a.bufferView], C = CT[a.componentType], k = TN[a.type], off = (v.byteOffset || 0) + (a.byteOffset || 0); if (v.byteStride && v.byteStride !== k * C.BYTES_PER_ELEMENT) throw new Error('stride');
  return new C(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * k * C.BYTES_PER_ELEMENT)); };
const world = [], M = n => { const m = new THREE.Matrix4(); if (n.matrix) m.fromArray(n.matrix); else m.compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1]))); return m; };
const wk = (i, p) => { const n = j.nodes[i], m = p.clone().multiply(M(n)); world[i] = m; for (const c of n.children || []) wk(c, m); }; for (const r of j.scenes[j.scene || 0].nodes) wk(r, new THREE.Matrix4());
if (mode === 'build') {
const CELL = 64, MINV = +process.env.MINV || 15, REACH = +process.env.REACH || 600, MAT = process.env.MAT || 'wc/t7_zm_ctl_stone_wall_cut';
const tiles = fs.readdirSync(DIR).filter(f => /^t_-?\d+_-?\d+\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(DIR + f)));
const voids = new Map(), pts = []; for (const t of tiles) { for (const k in t.voids) { const e = voids.get(k) || { n: 0, s: [0, 0, 0] }; e.n += t.voids[k].n; for (let d = 0; d < 3; d++) e.s[d] += t.voids[k].s[d]; voids.set(k, e); } pts.push(...t.pts); }
// only the map's own void planes (the bsp_ nodes): black parts of placed props, doors and moving pieces are coloured by overlays.js blackPlanes()
const par = new Map(); j.nodes.forEach((nd, i) => (nd.children || []).forEach(c => par.set(c, i))); const bspNode = i => { for (let p = i; p != null; p = par.get(p)) if (/^bsp_/.test(j.nodes[p].name || '')) return true; return false; };
const own = new Set(), v3 = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
j.nodes.forEach((nd, i) => { if (nd.mesh == null || !world[i] || nd.extensions?.EXT_mesh_gpu_instancing || !bspNode(i)) return; for (const pr of j.meshes[nd.mesh].primitives) { if (!VOIDRE.test(j.materials[pr.material]?.name || '')) continue; const P = acc(pr.attributes.POSITION), I = pr.indices != null ? acc(pr.indices) : null, L = I ? I.length : P.length / 3;
  for (let k = 0; k < L; k += 3) { for (let q = 0; q < 3; q++) v3[q].fromArray(P, (I ? I[k + q] : k + q) * 3).applyMatrix4(world[i]); own.add(['x', 'y', 'z'].map(d => Math.round((v3[0][d] + v3[1][d] + v3[2][d]) / 3)).join(',')); } } });
const tris = [...voids].filter(([k, e]) => e.n >= (+process.env.MINT || 1) && own.has(k)).map(([k, e]) => [...k.split(',').map(Number), ...e.s.map(x => Math.round(x / e.n))]);
// a flat void ceiling: the height most upward rays hit void at is the height of the void right above (several points agree); a tent of void planes has no such level and uses its top
const lv = new Map(); for (const r of pts) if (r.up === 'VOID' && r.vd >= MINV && Math.abs(r.p[1] + EYE + r.upd - r.vmed) <= 2) lv.set(Math.round(r.vmed), (lv.get(Math.round(r.vmed)) || 0) + 1);
const flat = r => { for (let d = -2; d <= 2; d++) if ((lv.get(Math.round(r.vmed) + d) || 0) >= 3) return true; return false; }, HT = r => flat(r) ? r.vmed : r.vmax, MINN = +process.env.MINN || 1;
const cells = new Map(); let gapPts = 0, gapRays = 0, escIndoorNoVoid = [];
for (const r of pts) { if (!r.up && r.vd < MINV) continue; const o = [r.p[0], r.p[1] + EYE, r.p[2]];
  if (r.vd < MINV) { if (r.esc.length && r.esc.length < NR * .2) escIndoorNoVoid.push(r); continue; }
  const H = HT(r), yp = Math.round(H) + 3, rays = [...r.esc]; for (let i = 0; i < r.over.length; i += 3) if (r.over[i + 1] > H + 16) rays.push(r.over[i]); if (!rays.length || rays.length > NR * (+process.env.MAXG || .1)) continue; let used = 0;   // a gap is a slit: a point with more open rays than that stands under open sky or beside a taller room
  for (const k of rays) { const d = dirs[k], t = (yp - o[1]) / d[1]; if (t <= 0) continue; const x = o[0] + d[0] * t, z = o[2] + d[2] * t; if (Math.hypot(x - o[0], z - o[2]) > REACH) continue;
    const key = Math.floor(x / CELL) + ',' + Math.floor(z / CELL) + ',' + yp, e = cells.get(key) || { n: 0, pts: new Set() }; e.n++; e.pts.add(r.p.join(',')); cells.set(key, e); used++; }
  if (used) { gapPts++; gapRays += used; } }
const owner = (r, y) => (r.up ? r.vd >= 3 : r.vd >= MINV) && Math.abs(HT(r) + 3 - y) <= 24;
// a plug must only be seen from under the void ceiling it completes: one that a ray from outdoors or from a taller room crosses (before that ray's own hit) is dropped
let patches = [], dropped = 0; const mk = () => { patches = []; for (const [k, e] of cells) { if (e.n < MINN || e.bad) continue; const [cx, cz, y] = k.split(',').map(Number); patches.push([cx * CELL - 4, cz * CELL - 4, cx * CELL + CELL + 4, cz * CELL + CELL + 4, y]); } }; mk();
const ys = [...new Set(patches.map(p => p[4]))];
for (const r of pts) { const o = [r.p[0], r.p[1] + EYE, r.p[2]], top = r.up ? o[1] + r.upd : Infinity, rays = r.esc.map(k => [k, Infinity]); for (let i = 0; i < r.over.length; i += 3) rays.push([r.over[i], r.over[i + 2]]);
  for (const y of ys) { if (y <= o[1] || owner(r, y) || top <= y + 48) continue; for (const [k, dist] of rays) { const d = dirs[k], t = (y - o[1]) / d[1]; if (t >= dist || t > 1380) continue; const e = cells.get(Math.floor((o[0] + d[0] * t) / CELL) + ',' + Math.floor((o[2] + d[2] * t) / CELL) + ',' + y); if (e && e.n >= MINN) { if (!e.bad) dropped++; e.bad = (e.bad || 0) + 1; (e.by ??= new Set()).add(r.p.join(",") + (r.up ? " top " + Math.round(top) + " vd " + r.vd + " vmax " + r.vmax : " outdoor")); } } } }
mk();
if (process.env.WHY) for (const r of pts) { if (r.p.join(',') !== process.env.WHY) continue; const o = [r.p[0], r.p[1] + EYE, r.p[2]], H = HT(r), yp = Math.round(H) + 3; console.log('WHY', JSON.stringify({ p: r.p, up: r.up, upd: r.upd, vd: r.vd, vmed: r.vmed, vmax: r.vmax, flat: flat(r), H, esc: r.esc.length, over: r.over.length / 3 }));
  const rays = r.esc.map(k => [k, null, null]); for (let i = 0; i < r.over.length; i += 3) if (r.over[i + 1] > H + 16) rays.push([r.over[i], r.over[i + 1], r.over[i + 2]]);
  for (const [k, hy, hd] of rays) { const d = dirs[k], t = (yp - o[1]) / d[1], x = o[0] + d[0] * t, z = o[2] + d[2] * t, key = Math.floor(x / CELL) + ',' + Math.floor(z / CELL) + ',' + yp, e = cells.get(key); console.log(' ray', k, 'dir', d.map(v => v.toFixed(2)).join(','), 'hit', hy == null ? 'escape' : 'y ' + hy + ' d ' + hd, 'crosses', Math.round(x), yp, Math.round(z), 'reach', Math.round(Math.hypot(x - o[0], z - o[2])), 'cell', e ? 'n ' + e.n + (e.bad ? ' BAD x' + e.bad + ' by ' + [...e.by].slice(0, 3).join(' ; ') : ' ok') : 'none'); } }
const out = { glb: SIG, material: MAT, tris, patches, walls: WALLS }; fs.writeFileSync(DIR + 'ceilings.json', JSON.stringify(out));
fs.writeFileSync(DIR + 'ceilings.js', `// Der Eisendrache: void-plane triangles seen from below ([centre x,y,z, seen-from x,y,z]) and plugs for the gaps beside them\n// ([x0,z0,x1,z1,y]) and upright wall patches ([x0,z0,x1,z1,y0,y1, seen-from x,y,z]); written by .tools/castle-ceilings.mjs from the real model (rerun after a map rebuild), read by overlays.js voidCeilings().\nexport default ${JSON.stringify(out)};\n`);
const byY = {}; for (const p of patches) byY[p[4]] = (byY[p[4]] || 0) + 1;
console.log(`tiles ${tiles.length}, points ${pts.length}, void triangles seen ${voids.size} -> ceilings ${tris.length} (the rest are black parts of placed props); gap points ${gapPts}, gap rays ${gapRays}, plugs ${patches.length} (dropped ${dropped} seen from outdoors or taller rooms) by height ${JSON.stringify(byY)}; file ${(fs.statSync(DIR + 'ceilings.js').size / 1024).toFixed(1)} KB`);
const gp = new Map(); for (const [k, e] of cells) if (e.n >= MINN && !e.bad) for (const q of e.pts) { const [x, y, z] = q.split(',').map(Number), kk = Math.round(x / 256) * 256 + ',' + Math.round(y / 128) * 128 + ',' + Math.round(z / 256) * 256 + ' plug y ' + k.split(',')[2], g = gp.get(kk) || { n: new Set(), ex: q }; g.n.add(q); gp.set(kk, g); }
console.log('gap rooms:\n' + [...gp].sort((a, b) => b[1].n.size - a[1].n.size).slice(0, 40).map(([k, g]) => `${k}: ${g.n.size} pts e.g. ${g.ex}`).join('\n'));
console.log('indoor, no void, a few escapes (windows or roof gaps):', escIndoorNoVoid.length); const cl = new Map(); for (const r of escIndoorNoVoid) { const k = Math.round(r.p[0] / 384) * 384 + ',' + Math.round(r.p[1] / 200) * 200 + ',' + Math.round(r.p[2] / 384) * 384, e = cl.get(k) || { n: 0, esc: 0, ex: r.p }; e.n++; e.esc += r.esc.length; cl.set(k, e); }
console.log([...cl].sort((a, b) => b[1].esc - a[1].esc).slice(0, +process.env.N || 12).map(([k, e]) => `${k}: ${e.n} pts, ${e.esc} rays, e.g. ${e.ex.join(',')}`).join('\n'));
if (process.argv.includes('--write')) { fs.copyFileSync(DIR + 'ceilings.js', 'export/web/mods/der-eisendrache/ceilings.js'); console.log('written to export/web/mods/der-eisendrache/ceilings.js'); }
  process.exit(0); }
if (mode === 'check') {   // open = a ray that leaves through the ceiling level H (the highest void the point still sees with the plugs in)
  const list = process.argv[3] === 'all' ? fs.readdirSync(DIR).map(f => /^t_(-?\d+_-?\d+)_v\.json$/.exec(f)?.[1]).filter(Boolean) : process.argv.slice(3); let N = 0, G0 = 0, G1 = 0, PAT = 0, TALL = 0, TALL0 = 0; const all = [], sky = [], lv = new Map(), ceil = [], MINV = +process.env.MINV || 15, SKY = (+process.env.MAXG || .1) * NR;
  for (const f of fs.readdirSync(DIR).filter(f => /^t_-?\d+_-?\d+\.json$/.test(f))) for (const r of JSON.parse(fs.readFileSync(DIR + f)).pts) { if (r.vd >= MINV) ceil.push(r.p[0], r.p[2], r.vmax); if (r.up === 'VOID' && r.vd >= MINV && Math.abs(r.p[1] + EYE + r.upd - r.vmed) <= 2) lv.set(Math.round(r.vmed), (lv.get(Math.round(r.vmed)) || 0) + 1); }
  const taller = (x, y, z, H) => { for (let i = 0; i < ceil.length; i += 3) if (ceil[i + 2] > H + 16 && ceil[i + 2] >= y - 2 && Math.abs(ceil[i] - x) < 160 && Math.abs(ceil[i + 1] - z) < 160) return true; return false; };   // the ray ended in a taller room, under that room's own void ceiling: an opening, not a gap
  const under = r => { if (r.up === 'VOID') return true; for (let d = -2; d <= 2; d++) if ((lv.get(Math.round(r.vmed) + d) || 0) >= 3) return true; return false; };   // under a void ceiling (as build sees it), not beside a void wall or a prop's black part
  for (const t of list) { const a = JSON.parse(fs.readFileSync(`${DIR}t_${t}.json`)).pts, b = JSON.parse(fs.readFileSync(`${DIR}t_${t}_v.json`)).pts; let n = 0, g0 = 0, g1 = 0, pat = 0, tall = 0, tall0 = 0; const worst = [];
    a.forEach((r, i) => { if (r.vd < 15) return; const q = b[i], H = Math.max(r.vmax ?? -1e9, q.vmax ?? -1e9), oy = r.p[1] + EYE; if (!under(r)) return;
      const cnt = x => { let c = 0, tl = 0; for (const k of x.esc) if ((H + 3 - oy) / dirs[k][1] < FAR) c++; for (let k = 0; k < x.over.length; k += 3) if (x.over[k + 1] > H + 16) { const d = dirs[x.over[k]], l = x.over[k + 2]; if (taller(r.p[0] + d[0] * l, x.over[k + 1], r.p[2] + d[2] * l, H)) tl++; else c++; } return [c, tl]; }, [c0, t0] = cnt(r), [c1, t1] = cnt(q);
      if (c0 > SKY) { sky.push(`${r.p.join(',')} (tile ${t}) ${c0}->${c1}`); return; }   // over 10% of its rays leave: open sky or a shaft, build makes no plugs there either
      n++; g0 += c0; g1 += c1; tall += t1; tall0 += t0; pat += q.pat; if (c1) worst.push([c1, c0, r.p.join(',')]); });
    N += n; G0 += g0; G1 += g1; PAT += pat; TALL += tall; TALL0 += tall0; all.push(...worst.map(w => [...w, t]));
    if (list.length < 6 || g1) console.log(`tile ${t}: ${n} points under void, open rays ${g0} -> ${g1}, plug hits ${pat}, into a taller room ${tall0} -> ${tall}${worst.length ? '; still open: ' + worst.sort((p, q) => q[0] - p[0]).slice(0, 8).map(w => `${w[2]} ${w[1]}->${w[0]}`).join(' | ') : ''}`); }
  if (list.length > 1) console.log(`${list.length} tiles: ${N} points under void, open rays ${G0} -> ${G1}, plug hits ${PAT}, rays that end in a taller room (counted apart) ${TALL0} -> ${TALL}; under open sky (not counted): ${sky.join(' | ') || 'none'}; worst: ${all.sort((p, q) => q[0] - p[0]).slice(0, 10).map(w => `${w[2]} (tile ${w[3]}) ${w[1]}->${w[0]}`).join(' | ')}`);
  process.exit(0); }
const walk = JSON.parse(fs.readFileSync(DIR + 'walk.json')), tiles = new Map(), seenP = new Set();
for (const p of walk) { const k = Math.round(p[0] / GRID) + ',' + Math.round(p[1] / 64) + ',' + Math.round(p[2] / GRID); if (seenP.has(k)) continue; seenP.add(k); const tk = Math.floor(p[0] / T) + ',' + Math.floor(p[2] / T); (tiles.get(tk) || tiles.set(tk, []).get(tk)).push(p); }
if (mode === 'scan') {   // one child process a tile (each loads the model and builds its own BVH), two at a time
  const ver = process.argv.includes('verify'), fresh = process.argv.includes('--fresh'), todo = [...tiles.keys()].filter(k => fresh || !fs.existsSync(`${DIR}t_${k.replace(',', '_')}${ver ? '_v' : ''}.json`)); let run = 0, bad = 0; const JOBS = +process.env.JOBS || 2; console.log(todo.length, 'tiles to do,', JOBS, 'at a time');
  await new Promise(done => { const next = () => { if (!todo.length) { if (!run) done(); return; } const [x, z] = todo.shift().split(','); run++; const ch = spawn(process.execPath, [process.argv[1], 'tile', x, z, ...(ver ? ['verify'] : [])], { stdio: 'inherit' }); ch.on('exit', (code, sig) => { if (code || sig) { bad++; console.error(`tile ${x} ${z} failed (${sig || 'exit ' + code}): out of memory? Try JOBS=1 or a larger memory cap`); } run--; next(); }); if (run < JOBS) next(); }; next(); });
  if (bad) console.error(bad, 'tiles failed: the scan is not complete, do not build from it'); process.exit(bad ? 1 : 0); }
if (mode === 'tiles') { console.log([...tiles].map(([k, v]) => k + ':' + v.length).join(' ')); process.exit(0); }
// probe "<x,y,z>" "<ray,ray,...>" [far]: follow single rays of one point further than a tile scan does (what is at the end of an escape), with the plugs in place
const probe = mode === 'probe' ? { p: process.argv[3].split(',').map(Number), rays: process.argv[4].split(',').map(Number), far: +process.argv[5] || 4000 } : null;
const ix = +process.argv[3], iz = +process.argv[4], pts = probe ? [probe.p] : tiles.get(ix + ',' + iz) || [], verify = probe || process.argv[5] === 'verify';
if (!pts.length) { console.log('no points'); process.exit(0); }
let y0 = 1e9, y1 = -1e9; for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
const box = new THREE.Box3(new THREE.Vector3(ix * T, y0, iz * T), new THREE.Vector3(ix * T + T, y1 + EYE, iz * T + T));
if (probe) { box.makeEmpty(); const o = new THREE.Vector3(probe.p[0], probe.p[1] + EYE, probe.p[2]); box.expandByPoint(o); for (const k of probe.rays) box.expandByPoint(new THREE.Vector3(...dirs[k]).multiplyScalar(probe.far).add(o)); }
const VOID = VOIDRE, COL = /^(COL|UCX|collision|PCOL|NCOL|CLIP)[_.-]/i, names = j.materials.map(m => m.name || '?'), isVoid = names.map(n => VOID.test(n)), dbl = j.materials.map((m, i) => !!m.doubleSided || isVoid[i]);
const thru = j.materials.map(m => (m.alphaMode && m.alphaMode !== 'OPAQUE') || /decal/i.test(m.name || ''));
const v = new THREE.Vector3(), list = []; let NV = 0, NI = 0;
const near = (pr, m) => { const a = j.accessors[pr.attributes.POSITION], lo = a.min, hi = a.max; v.set((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2).applyMatrix4(m); return box.distanceToPoint(v) - m.getMaxScaleOnAxis() * Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 < (probe ? 64 : FAR); };
const take = (pr, m) => { if ((pr.mode ?? 4) !== 4 || pr.material == null || thru[pr.material] || !near(pr, m)) return; list.push([pr, m.clone()]); NV += j.accessors[pr.attributes.POSITION].count; NI += pr.indices != null ? j.accessors[pr.indices].count : j.accessors[pr.attributes.POSITION].count; };
j.nodes.forEach((nd, i) => { if (nd.mesh == null || !world[i] || COL.test(nd.name || '') || COL.test(j.meshes[nd.mesh].name || '')) return; const x = nd.extensions?.EXT_mesh_gpu_instancing?.attributes;
  if (!x) { for (const pr of j.meshes[nd.mesh].primitives) take(pr, world[i]); return; }
  const Tr = acc(x.TRANSLATION), Q = x.ROTATION != null ? acc(x.ROTATION) : null, S = x.SCALE != null ? acc(x.SCALE) : null, m = new THREE.Matrix4(), q = new THREE.Quaternion(), t = new THREE.Vector3(), s = new THREE.Vector3();
  for (let k = 0; k < Tr.length / 3; k++) { t.set(Tr[k * 3], Tr[k * 3 + 1], Tr[k * 3 + 2]); Q ? q.set(Q[k * 4], Q[k * 4 + 1], Q[k * 4 + 2], Q[k * 4 + 3]).normalize() : q.identity(); S ? s.set(S[k * 3], S[k * 3 + 1], S[k * 3 + 2]) : s.set(1, 1, 1);
    m.compose(t, q, s).premultiply(world[i]); for (const pr of j.meshes[nd.mesh].primitives) take(pr, m); } });
let patches = []; if (verify && fs.existsSync(DIR + 'ceilings.json')) patches = JSON.parse(fs.readFileSync(DIR + 'ceilings.json')).patches || [];
const P = new Float32Array((NV + patches.length * 4) * 3), I = new Uint32Array(NI + patches.length * 6), mid = new Int16Array(NV + patches.length * 4); let nv = 0, ni = 0; const cache = new Map();
for (const [pr, m] of list) { let g = cache.get(pr); if (!g) { g = { P: acc(pr.attributes.POSITION), I: pr.indices != null ? acc(pr.indices) : null }; cache.set(pr, g); } const n = g.P.length / 3, flip = m.determinant() < 0, e = m.elements;
  for (let k = 0; k < n; k++) { const x = g.P[k * 3], y = g.P[k * 3 + 1], z = g.P[k * 3 + 2], o = (nv + k) * 3; P[o] = e[0] * x + e[4] * y + e[8] * z + e[12]; P[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; P[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]; }
  mid.fill(pr.material, nv, nv + n); const L = g.I ? g.I.length : n; for (let k = 0; k < L; k += 3) { const i0 = g.I ? g.I[k] : k, i1 = g.I ? g.I[k + 1] : k + 1, i2 = g.I ? g.I[k + 2] : k + 2; I[ni++] = nv + i0; I[ni++] = nv + (flip ? i2 : i1); I[ni++] = nv + (flip ? i1 : i2); } nv += n; }
for (const [x0, z0, x1, z1, y] of patches) { P.set([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], nv * 3); mid.fill(-2, nv, nv + 4); I.set([nv, nv + 1, nv + 2, nv, nv + 2, nv + 3], ni); ni += 6; nv += 4; }   // wound to face down
const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setIndex(new THREE.BufferAttribute(I, 1));
const t0 = Date.now(), bvh = new MeshBVH(geo, { targetLeafSize: 8, maxDepth: 60 }), I2 = geo.index.array;
const ray = new THREE.Ray(), a = new THREE.Vector3(), bb = new THREE.Vector3(), cc = new THREE.Vector3(), nn = new THREE.Vector3();
const cast = (o, d, far) => { ray.origin.copy(o); ray.direction.copy(d); const hs = bvh.raycast(ray, THREE.DoubleSide).sort((p, q) => p.distance - q.distance);
  for (const h of hs) { if (h.distance > far) break; const f = h.faceIndex * 3, m = mid[I2[f]]; a.fromArray(P, I2[f] * 3); bb.fromArray(P, I2[f + 1] * 3); cc.fromArray(P, I2[f + 2] * 3); const cx = (a.x + bb.x + cc.x) / 3, cy = (a.y + bb.y + cc.y) / 3, cz = (a.z + bb.z + cc.z) / 3;
    nn.subVectors(bb, a).cross(cc.sub(a)); if (nn.dot(d) < 0 || (m >= 0 && dbl[m])) return { m, d: h.distance, y: h.point.y, c: [cx, cy, cz] }; } return null; };
const dv = dirs.map(d => new THREE.Vector3(...d));
const o = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), out = { tile: [ix, iz], pts: [], voids: {} };
if (probe) { o.set(probe.p[0], probe.p[1] + EYE, probe.p[2]); for (const k of probe.rays) { const h = cast(o, dv[k], probe.far); console.log('ray', k, 'dir', dirs[k].map(x => x.toFixed(2)).join(','), h ? `hits ${h.m === -2 ? 'PLUG' : names[h.m]} at ${Math.round(h.d)}, y ${Math.round(h.y)}, centre ${h.c.map(Math.round).join(',')}` : 'nothing within ' + probe.far); } process.exit(0); }
for (const p of pts) { o.set(p[0], p[1] + EYE, p[2]); const u = cast(o, up, FAR); const r = { p, up: u ? (u.m === -2 ? 'PATCH' : isVoid[u.m] ? 'VOID' : names[u.m]) : null, upd: u ? Math.round(u.d) : 0, esc: [], vd: 0, vy: [], pat: 0, over: [] };
  dv.forEach((d, k) => { const h = cast(o, d, FAR); if (!h) { r.esc.push(k); return; } if (h.m === -2) { r.pat++; return; }
    if (isVoid[h.m]) { r.vd++; r.vy.push(Math.round(h.y)); const key = h.c.map(x => Math.round(x)).join(','), e = out.voids[key] || (out.voids[key] = { n: 0, s: [0, 0, 0] }); e.n++; e.s[0] += o.x; e.s[1] += o.y; e.s[2] += o.z; } else r.over.push(k, Math.round(h.y), Math.round(h.d)); });
  r.vy.sort((x, y) => x - y); r.vmax = r.vy.length ? r.vy[r.vy.length - 1] : null; r.vmed = r.vy.length ? r.vy[r.vy.length >> 1] : null; delete r.vy; out.pts.push(r); }
fs.writeFileSync(`${DIR}t_${ix}_${iz}${verify ? '_v' : ''}.json`, JSON.stringify(out));
const ind = out.pts.filter(r => r.up); console.log(`tile ${ix},${iz}: ${pts.length} points, ${(ni / 3e6).toFixed(1)} M tris, bvh ${Date.now() - t0} ms; indoor ${ind.length}, see void ${out.pts.filter(r => r.vd).length}, indoor with escapes ${ind.filter(r => r.esc.length).length}, void tris seen ${Object.keys(out.voids).length}, patch hits ${out.pts.reduce((s, r) => s + r.pat, 0)}`);

