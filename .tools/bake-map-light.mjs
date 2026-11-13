#!/usr/bin/env node
// Bakes a BO3-port map's light volume offline (no browser): a 3D grid over the playable area holding, per cell,
//   - the light of every lamp marker (walls block it), split into "always" and "with the power on",
//   - the dominant lamp direction,
//   - how much of the sky the cell sees (0..1) and whether the sun/moon reaches it (0..1, soft).
// The map's own lights stay in charge of colour and level: at runtime mods/lighting/map-volume.js scales the scene's
// ambient + hemisphere by the sky value, its directional lights by the sun value, and adds the lamp light, so
// interiors go dark, lamps light their rooms from any distance and nothing pops in or out.
//
//   node .tools/bake-map-light.mjs <map-id> [--cell N] [--out dir/]   (--out: write somewhere else, to compare before going live;
//   --cache file: keeps the sky and visibility pass, 4 of the 5 minutes, between runs while tuning: delete it after a map rebuild)
// Reads export/web/mods/maps/<id>/<id>.glb, writes light.json + light.bin.gz next to it (git-ignored, like the map).
// Rerun after rebuilding the map or changing a number in MAPS (they must match the map mod's LAMP table).
//
// A map with `real` takes its lamp light from the game's own primary lights (.tools/bo3_ff_lights.py reads them out of
// the map's fastfile into export_game/, git-ignored) instead of the lamp markers and the invented fill lights: true
// positions, colours, radii and spot cones, inverse-square falloff. `gain` turns the game's light units into this
// volume's (set once so the lit rooms keep about their old level and the map's grade still fits); `--gain N` tries
// another. Without the file the bake falls back to the markers and says so.
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const MAPS = {
  'the-giant': { lamps: /^GIANT_LAMP_/, cell: 40, range: 650, decay: 1.4, off: 700, on: 2200, color: () => 0xffc58a, sun: [-.35, 1, .45], extra: [] },
  'der-eisendrache': { lamps: /^CASTLE_LAMP_/, cell: 48, range: 620, decay: 1.4, off: 2000, on: 3000,
    color: n => n.extras?.kind === 'electric' ? 0xffd9a8 : 0xffac62, sun: [.45, 1, .3], extra: ['PCOL_props', 'COL_flagstones'],
    real: { file: 'export_game/bo3/maps/zm_castle/zm_castle.lights.json', gain: 550, minRadius: 30, albedo: .5, bounces: 3, adapt: [6, .45], fill: [1.5, .84, .93, 1.1], outdoor: 1.4,
      // The undercroft (the box = the map mod's UNDER): the game keeps 71 blue ceiling lights on there all the time; the
      // user wants the blue only while the gravity is low. So in the box the "with the power on" set holds those blue
      // lights instead (the mod drives mvPower from the gravity while the camera is inside), the always set holds every
      // other light of the room at full plus a dim warm copy of the blue ones (`keep`: level, r, g, b of their
      // luminance), and the room fill there is warm (`fill`) and measured against the always set.
      gated: { box: [[-1900, 0, -3100], [320, 620, -1650]], blue: 1.3, keep: [.5, 1, .97, .9], fill: [1, .95, .88] } } },
};
const id = process.argv[2], cfg = MAPS[id];
if (!cfg) { console.error('usage: bake-map-light.mjs <' + Object.keys(MAPS).join('|') + '> [--cell N]'); process.exit(1); }
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? +process.argv[i + 1] : d; };
const CELL = arg('cell', cfg.cell), SCALE = 8, CLAMP = 4, SKY_RAYS = 32, SKY_FAR = 9000;
const MARK = /^(ZSPAWN|WINDOW|WALLBUY|PERK|BOX|PLAYER_SPAWN|PAP|POWER|TELEPORT|TPDEST|TRAP|CLAYMORE)/, REACH = 1000, BELOW = 300, ABOVE = 600;
const dir = `export/web/mods/maps/${id}/`, outDir = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : dir, t0 = Date.now(), log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// ---- the glb
const glb = fs.readFileSync(dir + id + '.glb'), jsonLen = glb.readUInt32LE(12), gltf = JSON.parse(glb.toString('utf8', 20, 20 + jsonLen)), bin0 = 20 + jsonLen + 8;
const TYPES = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }, COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(i) {
  const a = gltf.accessors[i], v = gltf.bufferViews[a.bufferView], T = TYPES[a.componentType], n = a.count * COMPS[a.type];
  const off = glb.byteOffset + bin0 + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  if (v.byteStride && v.byteStride !== T.BYTES_PER_ELEMENT * COMPS[a.type]) throw new Error('interleaved accessor');
  return off % T.BYTES_PER_ELEMENT ? new T(glb.buffer.slice(off, off + n * T.BYTES_PER_ELEMENT)) : new T(glb.buffer, off, n);
}
const plain = n => !n.translation && !n.rotation && !n.scale && !n.matrix;
// glass panes are in the collision mesh but let light through: their triangles are dropped from the occluders
const glass = new Set(), key = (x, y, z) => Math.round(x) + ',' + Math.round(y) + ',' + Math.round(z);
for (const n of gltf.nodes) {
  if (n.mesh == null || !/^bsp_/.test(n.name ?? '')) continue;
  for (const p of gltf.meshes[n.mesh].primitives) {
    const m = gltf.materials[p.material] ?? {};
    if (!(m.alphaMode === 'BLEND' && /glass|window/i.test(m.name ?? ''))) continue;
    const P = accessor(p.attributes.POSITION), I = accessor(p.indices);
    for (let i = 0; i < I.length; i += 3) { const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3; glass.add(key((P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3)); }
  }
}
const parts = []; let nv = 0, nt = 0, dropped = 0;
for (const name of ['COL_world', ...cfg.extra]) {
  const n = gltf.nodes.find(x => x.name === name); if (!n) { log('no', name); continue; }
  if (!plain(n)) throw new Error(name + ' has a transform');
  const p = gltf.meshes[n.mesh].primitives[0], P = accessor(p.attributes.POSITION); let I = accessor(p.indices);
  if (name === 'COL_world' && glass.size) {
    const keep = new Uint32Array(I.length); let k = 0;
    for (let i = 0; i < I.length; i += 3) { const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      if (glass.has(key((P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3))) { dropped++; continue; }
      keep[k++] = I[i]; keep[k++] = I[i + 1]; keep[k++] = I[i + 2]; }
    I = keep.subarray(0, k);
  }
  parts.push({ P, I }); nv += P.length / 3; nt += I.length / 3;
}
const pos = new Float32Array(nv * 3), idx = new Uint32Array(nt * 3);
{ let vo = 0, io = 0; for (const { P, I } of parts) { pos.set(P, vo * 3); for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo; vo += P.length / 3; io += I.length; } }
log(`occluders: ${nt} triangles (${glass.size} glass triangles, ${dropped} dropped from the collision mesh)`);
const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
const bvh = new MeshBVH(geo, { targetLeafSize: 6 }); log('bvh built');

// ---- the grid: around the gameplay markers and the lamps near them (the map's vista and far set dressing stay as they are)
const at = n => new THREE.Vector3(...n.translation);
const marks = gltf.nodes.filter(n => n.translation && MARK.test(n.name ?? '')).map(at);
const lamps = gltf.nodes.filter(n => n.translation && cfg.lamps.test(n.name ?? '')).map(n => ({ p: at(n), c: new THREE.Color(cfg.color(n)) }))
  .filter(l => marks.some(m => m.distanceTo(l.p) < 1500));
const box = new THREE.Box3(); for (const m of [...marks, ...lamps.map(l => l.p)]) box.expandByPoint(m);
box.min.x -= REACH; box.min.z -= REACH; box.max.x += REACH; box.max.z += REACH; box.min.y -= BELOW; box.max.y += ABOVE;
const origin = box.min.clone().floor(), size = box.getSize(new THREE.Vector3());
const X = Math.ceil(size.x / CELL) + 1, Y = Math.ceil(size.y / CELL) + 1, Z = Math.ceil(size.z / CELL) + 1, N = X * Y * Z;
const active = new Uint8Array(N);
for (const m of [...marks, ...lamps.map(l => l.p)]) {
  const x0 = Math.max(0, Math.floor((m.x - REACH - origin.x) / CELL)), x1 = Math.min(X - 1, Math.ceil((m.x + REACH - origin.x) / CELL));
  const y0 = Math.max(0, Math.floor((m.y - BELOW - origin.y) / CELL)), y1 = Math.min(Y - 1, Math.ceil((m.y + ABOVE - origin.y) / CELL));
  const z0 = Math.max(0, Math.floor((m.z - REACH - origin.z) / CELL)), z1 = Math.min(Z - 1, Math.ceil((m.z + REACH - origin.z) / CELL));
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) active.fill(1, (z * Y + y) * X + x0, (z * Y + y) * X + x1 + 1);
}
let nActive = 0; for (let i = 0; i < N; i++) nActive += active[i];
log(`grid ${X}x${Y}x${Z} = ${N} cells of ${CELL}, ${nActive} active; ${marks.length} markers, ${lamps.length} lamps`);

// ---- rays
const skyDirs = []; for (let i = 0; i < SKY_RAYS; i++) { const y = .1 + .9 * (i + .5) / SKY_RAYS, r = Math.sqrt(1 - y * y), a = i * 2.39996323; skyDirs.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)); }
const sun = new THREE.Vector3(...cfg.sun).normalize(), sunDirs = [sun.clone()];
{ const u = new THREE.Vector3(1, 0, 0).cross(sun).normalize(), v = sun.clone().cross(u); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .6; sunDirs.push(sun.clone().addScaledVector(u, Math.cos(a) * .06).addScaledVector(v, Math.sin(a) * .06).normalize()); } }
const ray = new THREE.Ray(), SIDE = THREE.DoubleSide;
const lampOff = new Float32Array(N * 3), lampOn = new Float32Array(N * 3), dirs = new Float32Array(N * 3), sky = new Float32Array(N).fill(1), sunV = new Float32Array(N).fill(1), valid = new Uint8Array(N);
const toL = new THREE.Vector3(), kOn = cfg.on - cfg.off; let rays = 0, done = 0, nInvalid = 0;
const cellPos = (i, v) => v.set(origin.x + (i % X) * CELL, origin.y + (Math.floor(i / X) % Y) * CELL, origin.z + Math.floor(i / (X * Y)) * CELL);
const hit = (o, d, far) => { ray.origin.copy(o); ray.direction.copy(d); rays++; return bvh.raycastFirst(ray, SIDE, 0, far); };
// ---- pass 1: sky and sun; a cell whose rays mostly leave through back faces is inside a wall or under the floor
const cachePath = process.argv.includes('--cache') ? process.argv[process.argv.indexOf('--cache') + 1] : null;
const cached = cachePath && fs.existsSync(cachePath) && fs.statSync(cachePath).size === N * 10 ? fs.readFileSync(cachePath) : null;
if (!cached) for (let z = 0; z < Z; z++) {
  for (let y = 0; y < Y; y++) for (let x = 0; x < X; x++) {
    const i = (z * Y + y) * X + x; if (!active[i]) continue;
    ray.origin.set(origin.x + x * CELL, origin.y + y * CELL, origin.z + z * CELL);
    let open = 0, back = 0;
    for (const d of skyDirs) { ray.direction.copy(d); const h = bvh.raycastFirst(ray, SIDE, 0, SKY_FAR); rays++; if (!h) open++; else if (h.face.normal.dot(d) > 0) back++; }
    if (back > SKY_RAYS * .4) { nInvalid++; continue; }
    valid[i] = 1; sky[i] = open / SKY_RAYS;
    let s = 0; for (const d of sunDirs) { ray.direction.copy(d); rays++; if (!bvh.raycastFirst(ray, SIDE, 0, SKY_FAR)) s++; } sunV[i] = s / sunDirs.length;
  }
  if (z % 32 === 0) log(`sky: slice ${z}/${Z}, ${rays} rays`);
}
// ---- links: which of a cell's +x, +y, +z neighbours it can see (light only spreads through open links)
const link = new Uint8Array(N), AX = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)], STEP = [1, X, X * Y], o = new THREE.Vector3();
if (!cached) for (let i = 0; i < N; i++) { if (valid[i] !== 1) continue; cellPos(i, o); const x = i % X, y = Math.floor(i / X) % Y, z = Math.floor(i / (X * Y));
  for (let k = 0; k < 3; k++) { if ([x, y, z][k] >= [X, Y, Z][k] - 1 || valid[i + STEP[k]] !== 1) continue; if (!hit(o, AX[k], CELL)) link[i] |= 1 << k; } }
if (cached) { valid.set(cached.subarray(0, N)); link.set(cached.subarray(N, N * 2)); sky.set(new Float32Array(cached.buffer.slice(cached.byteOffset + N * 2, cached.byteOffset + N * 6))); sunV.set(new Float32Array(cached.buffer.slice(cached.byteOffset + N * 6, cached.byteOffset + N * 10))); log('sky pass from ' + cachePath); }
else if (cachePath) fs.writeFileSync(cachePath, Buffer.concat([Buffer.from(valid.buffer), Buffer.from(link.buffer), Buffer.from(sky.buffer), Buffer.from(sunV.buffer)]));
const NEIGH = [[1, 1], [-1, 1], [X, 2], [-X, 2], [X * Y, 4], [-X * Y, 4]];
const eachOpen = (i, f) => { for (const [s, bit] of NEIGH) { const j = i + s; if (j < 0 || j >= N) continue; if (link[s > 0 ? i : j] & bit) f(j); } };
log(`links done, ${rays} rays`);

// ---- fill lights: BO3 lights its rooms with many lights that have no model, so they are not among the lamp markers and
// whole rooms came out with no lamp light. Indoor standing-height cells with no lamp in sight get an invisible ceiling
// light (the most open spots first), dimmer and a little cooler than a lamp. They exist only in this bake.
const DOWN = new THREE.Vector3(0, -1, 0), UP = new THREE.Vector3(0, 1, 0), FILL = { reach: cfg.fillReach ?? 400, level: cfg.fillLevel ?? .5, color: new THREE.Color(cfg.fillColor ?? 0xffd9b0) };
const H8 = []; for (let i = 0; i < 8; i++) H8.push(new THREE.Vector3(Math.cos(i * Math.PI / 4), 0, Math.sin(i * Math.PI / 4)));
const cands = [];
for (let i = 0; i < N; i++) { if (valid[i] !== 1 || sky[i] > .22) continue; cellPos(i, o);
  const f = hit(o, DOWN, 115); if (!f || f.distance < 40) continue;                    // about head height over a floor
  let open = 300; for (const d of H8) { const h = hit(o, d, open); if (h) open = Math.min(open, h.distance); } if (open < 55) continue;
  cands.push({ i, open }); }
cands.sort((a, b) => b.open - a.open || a.i - b.i);
const all = lamps.map(l => ({ p: l.p, c: l.c, k: 1 })); let nFill = 0;
for (const c of cands) { cellPos(c.i, o);
  let lit = false; for (const L of all) { const d = L.p.distanceTo(o); if (d > FILL.reach) continue; if (d < 40 || !hit(o, toL.subVectors(L.p, o).divideScalar(d), d - 30)) { lit = true; break; } }
  if (lit) continue;
  const up = hit(o, UP, 260), h = Math.min((up ? up.distance : 260) - 22, 150); if (h < 20) continue;
  all.push({ p: o.clone().addScaledVector(UP, h), c: FILL.color, k: FILL.level, fill: true }); nFill++; }
log(`${cands.length} indoor standing cells, ${nFill} fill lights added to ${lamps.length} lamps`);

// ---- the game's own lights (cfg.real): CoD axes -> the map's (x, z, -y); only the default lighting state's lights, and
// none smaller than a cell can show (candle glows of 5-13 units)
const realFile = cfg.real && !process.argv.includes('--markers') && fs.existsSync(cfg.real.file) ? cfg.real.file : null;
if (cfg.real && !realFile) log(`no ${cfg.real.file}: falling back to the lamp markers`);
const GAIN = arg('gain', cfg.real?.gain ?? 1), toMap = v => new THREE.Vector3(v[0], v[2], -v[1]);
const GATED = cfg.real?.gated, inBox = p => !!GATED && p.x > GATED.box[0][0] && p.y > GATED.box[0][1] && p.z > GATED.box[0][2] && p.x < GATED.box[1][0] && p.y < GATED.box[1][1] && p.z < GATED.box[1][2];
const real = !realFile ? null : JSON.parse(fs.readFileSync(realFile)).lights.filter(l => (l.states & 1) && l.radius >= cfg.real.minRadius)
  .map(l => ({ p: toMap(l.origin), c: l.color, r: l.radius, d: l.toLight ? toMap(l.toLight).normalize() : null, ci: l.cosInner, co: l.cosOuter }))
  .map(l => { if (inBox(l.p)) { if (l.c[2] > l.c[0] * GATED.blue) { const lum = (.2126 * l.c[0] + .7152 * l.c[1] + .0722 * l.c[2]) * GATED.keep[0]; l.keep = l.c.map((v, k) => Math.min(v, lum * GATED.keep[1 + k])); } else l.room = true; } return l; })
  .filter(l => l.p.x + l.r > origin.x && l.p.y + l.r > origin.y && l.p.z + l.r > origin.z && l.p.x - l.r < origin.x + X * CELL && l.p.y - l.r < origin.y + Y * CELL && l.p.z - l.r < origin.z + Z * CELL);
if (real) {
  const share = cfg.off / cfg.on, acc = new Float32Array(N * 3), cv = new THREE.Vector3(); let used = 0;
  for (const L of real) {
    const lo = [L.p.x - L.r - origin.x, L.p.y - L.r - origin.y, L.p.z - L.r - origin.z].map(v => Math.max(0, Math.ceil(v / CELL)));
    const hi = [L.p.x + L.r - origin.x, L.p.y + L.r - origin.y, L.p.z + L.r - origin.z].map((v, k) => Math.min([X, Y, Z][k] - 1, Math.floor(v / CELL)));
    const top = Math.max(L.c[0], L.c[1], L.c[2]) * GAIN; let any = false;
    for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) {
      const i = (z * Y + y) * X + x; if (valid[i] !== 1) continue; cellPos(i, cv);
      toL.subVectors(L.p, cv); const d = toL.length(); if (d >= L.r) continue;
      let cone = 1; if (L.d) { const c = toL.dot(L.d) / Math.max(d, 1e-3); cone = L.ci - L.co < 1e-4 ? +(c >= L.co) : Math.min(1, Math.max(0, (c - L.co) / (L.ci - L.co))); cone *= cone * (3 - 2 * cone); if (cone <= 0) continue; }
      const dd = Math.max(d, 16), fall = Math.pow(1 - Math.pow(dd / L.r, 4), 2) / (dd * dd) * cone;
      if (top * fall < .004) continue;
      if (d > 34 && hit(cv, toL.clone().divideScalar(d), d - 30)) continue;   // stops short of the light: it may sit in its fixture
      const e = GAIN * fall * Math.min(1, CLAMP / (top * fall)), w = e * top / Math.max(d, 1);
      if (L.keep) for (let k = 0; k < 3; k++) { lampOff[i * 3 + k] += L.keep[k] * e; lampOn[i * 3 + k] += (L.c[k] - L.keep[k]) * e; }
      else for (let k = 0; k < 3; k++) { const sh = L.room ? 1 : share; lampOff[i * 3 + k] += L.c[k] * e * sh; lampOn[i * 3 + k] += L.c[k] * e * (1 - sh); }
      acc[i * 3] += toL.x * w; acc[i * 3 + 1] += toL.y * w; acc[i * 3 + 2] += toL.z * w; any = true;
    }
    if (any) used++;
  }
  for (let i = 0; i < N; i++) { if (valid[i] !== 1) continue; const dl = Math.hypot(acc[i * 3], acc[i * 3 + 1], acc[i * 3 + 2]);
    if (dl > 0) for (let k = 0; k < 3; k++) dirs[i * 3 + k] = acc[i * 3 + k] / dl; else dirs[i * 3 + 1] = 1; done++; }
  // the level people stand in, for setting the gain: lamp light (power on) at the indoor standing cells
  const lum = cands.map(c => .2126 * (lampOff[c.i * 3] + lampOn[c.i * 3]) + .7152 * (lampOff[c.i * 3 + 1] + lampOn[c.i * 3 + 1]) + .0722 * (lampOff[c.i * 3 + 2] + lampOn[c.i * 3 + 2])).sort((a, b) => a - b);
  log(`${real.length} real lights in reach, ${used} light a cell (gain ${GAIN}); indoor standing cells, lamp level p10/25/50/75/90: ${[.1, .25, .5, .75, .9].map(q => lum[Math.floor(lum.length * q)].toFixed(3)).join(' ')}`);
}

// ---- pass 2: lamp light with occlusion (lamps bucketed by range)
const bucket = new Map(), bk = p => Math.floor(p.x / cfg.range) + ',' + Math.floor(p.z / cfg.range);
for (const L of all) { const k = bk(L.p); bucket.has(k) || bucket.set(k, []); bucket.get(k).push(L); }
for (let i = 0; i < N && !real; i++) { if (valid[i] !== 1) continue; cellPos(i, o);
  const bx = Math.floor(o.x / cfg.range), bz = Math.floor(o.z / cfg.range); let dx = 0, dy = 0, dz = 0;
  for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) for (const L of bucket.get((bx + u) + ',' + (bz + v)) ?? []) {
    toL.subVectors(L.p, o); const d = toL.length(); if (d >= cfg.range) continue;
    const dd = Math.max(d, 12), fall = Math.pow(Math.min(1, Math.max(0, 1 - Math.pow(dd / cfg.range, 4))), 2) / Math.pow(dd, cfg.decay) * L.k;
    if (cfg.on * fall < .004) continue;
    if (d > 34 && hit(o, toL.clone().divideScalar(d), d - 30)) continue;   // stops short of the lamp: it sits in its own fixture
    const k = Math.min(1, CLAMP / (cfg.on * fall)), a = cfg.off * fall * k, b = kOn * fall * k;
    lampOff[i * 3] += L.c.r * a; lampOff[i * 3 + 1] += L.c.g * a; lampOff[i * 3 + 2] += L.c.b * a;
    lampOn[i * 3] += L.c.r * b; lampOn[i * 3 + 1] += L.c.g * b; lampOn[i * 3 + 2] += L.c.b * b;
    const w = (a + b) / Math.max(d, 1); dx += toL.x * w; dy += toL.y * w; dz += toL.z * w;
  }
  const dl = Math.hypot(dx, dy, dz); if (dl > 0) { dirs[i * 3] = dx / dl; dirs[i * 3 + 1] = dy / dl; dirs[i * 3 + 2] = dz / dl; } else dirs[i * 3 + 1] = 1;
  done++; if (done % 200000 === 0) log(`lamps: ${done} cells, ${rays} rays`);
}
log(`${done} cells lit, ${nInvalid} inside solids, ${rays} rays`);

// ---- bounce, through open links only. Lamp light: ten diffusion steps (a closed side absorbs), added at BOUNCE, so a
// lamp also lifts what it can't see directly. Sky: the direct value is smoothed (32 fixed rays band otherwise), then
// spread indoors from doorways and windows, falling to 1/e in about three cells.
const BOUNCE = .45, SKY_DECAY = .98;
function diffuse(f, ch, steps) {
  let a = new Float32Array(f), b = new Float32Array(f.length);
  for (let s = 0; s < steps; s++) { for (let i = 0; i < N; i++) { if (valid[i] !== 1) continue;
      for (let k = 0; k < ch; k++) { let sum = a[i * ch + k] * 2; eachOpen(i, j => { sum += a[j * ch + k]; }); b[i * ch + k] = sum / 8; } }
    [a, b] = [b, a]; }
  return a;
}
if (!real) for (const f of [lampOff, lampOn]) { const d = diffuse(f, 3, 10); for (let i = 0; i < f.length; i++) f[i] += d[i] * BOUNCE; }
// The real lights reach only about a third of the indoor space directly: the game fills the rest with bounced light in
// its lightmaps. So their bounce is a gather: every cell looks 24 ways, takes the light of the cell in front of whatever
// it sees, times the surfaces' albedo, and that repeats (`bounces`): rooms fill from their own lamps, through doorways too.
if (real) {
  const RAYS = 24, gd = [], cells = []; for (let i = 0; i < RAYS; i++) { const y = 1 - 2 * (i + .5) / RAYS, r = Math.sqrt(1 - y * y), a = i * 2.39996323; gd.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)); }
  for (let i = 0; i < N; i++) if (valid[i] === 1) cells.push(i);
  const gPath = cachePath && cachePath + '.gather', pv = new THREE.Vector3(); let seen;
  const cellAt = p => { const x = Math.round((p.x - origin.x) / CELL), y = Math.round((p.y - origin.y) / CELL), z = Math.round((p.z - origin.z) / CELL);
    return x < 0 || y < 0 || z < 0 || x >= X || y >= Y || z >= Z ? -1 : (z * Y + y) * X + x; };
  if (gPath && fs.existsSync(gPath) && fs.statSync(gPath).size === cells.length * RAYS * 4) { const b = fs.readFileSync(gPath); seen = new Int32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }
  else { seen = new Int32Array(cells.length * RAYS);
    for (let n = 0; n < cells.length; n++) { const i = cells[n]; cellPos(i, o);
      for (let r = 0; r < RAYS; r++) { const h = hit(o, gd[r], 3000); let j = -1;
        if (h) for (const back of [.6, 1.3]) { j = cellAt(pv.copy(o).addScaledVector(gd[r], Math.max(0, h.distance - CELL * back))); if (j >= 0 && valid[j] === 1) break; j = i; }
        seen[n * RAYS + r] = j; }
      if (n % 200000 === 0) log(`gather: ${n}/${cells.length} cells`); }
    if (gPath) fs.writeFileSync(gPath, Buffer.from(seen.buffer)); }
  const albedo = arg('albedo', cfg.real.albedo), bounces = arg('bounces', cfg.real.bounces);
  for (const f of [lampOff, lampOn]) { const direct = f.slice(); let cur = direct;
    for (let b = 0; b < bounces; b++) { const next = new Float32Array(f.length);
      for (let n = 0; n < cells.length; n++) { const i = cells[n]; let r0 = 0, g0 = 0, b0 = 0;
        for (let r = 0; r < RAYS; r++) { const j = seen[n * RAYS + r]; if (j < 0) continue; r0 += cur[j * 3]; g0 += cur[j * 3 + 1]; b0 += cur[j * 3 + 2]; }
        next[i * 3] = direct[i * 3] + r0 / RAYS * albedo; next[i * 3 + 1] = direct[i * 3 + 1] + g0 / RAYS * albedo; next[i * 3 + 2] = direct[i * 3 + 2] + b0 / RAYS * albedo; }
      cur = next; }
    f.set(cur); }
  log(`gather bounce done (albedo ${albedo}, ${bounces} bounces)`);
  // The game's eye adaptation opens up in its dim rooms; this renderer's exposure is fixed. `adapt: [ref, power]` does
  // that job in the data: a cell's level L becomes ref * (L / ref) ^ power (colour kept; a lift of at most 8x), so a
  // lamp's pool stays a few times brighter than the room around it instead of thirty times.
  const [ref, pw] = [arg('ref', cfg.real.adapt?.[0] ?? 1), arg('adapt', cfg.real.adapt?.[1] ?? 1)];
  if (pw !== 1) for (const i of cells) { const q = i * 3, L = .2126 * (lampOff[q] + lampOn[q]) + .7152 * (lampOff[q + 1] + lampOn[q + 1]) + .0722 * (lampOff[q + 2] + lampOn[q + 2]); if (L <= 0) continue;
    const k = Math.min(8, Math.pow(L / ref, pw - 1)); let kOff = k;
    if (GATED && inBox(cellPos(i, o))) { const L0 = .2126 * lampOff[q] + .7152 * lampOff[q + 1] + .0722 * lampOff[q + 2]; if (L0 > 0) kOff = Math.min(8, Math.pow(L0 / ref, pw - 1)); }   // (the room's own level with the gated lights off)
    for (let c = 0; c < 3; c++) { lampOff[q + c] *= kOff; lampOn[q + c] *= k; } }
  // and no room is left black: BO3's lightmaps hold bounce light everywhere indoors. `fill: [level, r, g, b]` tops up
  // every cell to `level` (scaled by how far indoors it is, 1 - sky) with that colour, a cool grey against the lamps.
  const fill = cfg.real.fill, fillLevel = arg('fill', fill?.[0] ?? 0);
  if (fillLevel > 0) { const fc = fill?.length > 3 ? fill.slice(1) : [.84, .93, 1.1], fl = .2126 * fc[0] + .7152 * fc[1] + .0722 * fc[2]; let n = 0;
    for (const i of cells) { const q = i * 3, L = .2126 * (lampOff[q] + lampOn[q]) + .7152 * (lampOff[q + 1] + lampOn[q + 1]) + .0722 * (lampOff[q + 2] + lampOn[q + 2]);
      const gf = GATED && inBox(cellPos(i, o)) ? GATED.fill : null, gl = gf && .2126 * gf[0] + .7152 * gf[1] + .0722 * gf[2];
      const short = fillLevel * (1 - Math.min(1, sky[i])) - (gf ? .2126 * lampOff[q] + .7152 * lampOff[q + 1] + .0722 * lampOff[q + 2] : L); if (short <= 0) continue; n++;
      for (let c = 0; c < 3; c++) lampOff[q + c] += (gf ? gf[c] / gl : fc[c] / fl) * short; }
    log(`room fill ${fillLevel}: ${n} cells topped up`); }
  // under the open sky the daylight is already there: `outdoor` caps the lamp level at outdoor / sky (lamps on snow
  // burned it white with bloom on top, 2026-11-12), so a lamp still reads in a doorway but not on the open pad
  const capOut = arg('outdoor', cfg.real.outdoor ?? 0);
  if (capOut > 0) { let n = 0; for (const i of cells) { const s = sky[i]; if (s <= .05) continue; const q = i * 3, L = .2126 * (lampOff[q] + lampOn[q]) + .7152 * (lampOff[q + 1] + lampOn[q + 1]) + .0722 * (lampOff[q + 2] + lampOn[q + 2]), lim = capOut / s;
      if (L > lim) { n++; for (let c = 0; c < 3; c++) { lampOff[q + c] *= lim / L; lampOn[q + c] *= lim / L; } } }
    log(`outdoor cap ${capOut}: ${n} cells held down`); }
}
function smooth(f) { const out = new Float32Array(f); for (let i = 0; i < N; i++) { if (valid[i] !== 1) continue; let s = f[i] * 2, w = 2; eachOpen(i, j => { s += f[j]; w++; }); out[i] = s / w; } return out; }
function spread(f, steps) { let a = new Float32Array(f), b = new Float32Array(f);
  for (let s = 0; s < steps; s++) { for (let i = 0; i < N; i++) { if (valid[i] !== 1) continue; let sum = 0; eachOpen(i, j => { sum += a[j]; }); b[i] = Math.max(f[i], sum / 6 * SKY_DECAY); } [a, b] = [b, a]; }
  return a; }
const skyS = spread(smooth(sky), 30), sunS = smooth(sunV);
sky.set(skyS); sunV.set(sunS);
log('bounce done');


// ---- cells inside solids take their open neighbours' values (a wall's surface samples between its two sides)
const NB = []; for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy || dz) NB.push([dx, dy, dz]);
for (let pass = 0; pass < 3; pass++) {
  const add = [];
  for (let z = 0; z < Z; z++) for (let y = 0; y < Y; y++) for (let x = 0; x < X; x++) {
    const i = (z * Y + y) * X + x; if (!active[i] || valid[i]) continue;
    let n = 0, s = 0, sv = 0; const acc = new Float32Array(9);
    for (const [dx, dy, dz] of NB) { const a = x + dx, b = y + dy, c = z + dz; if (a < 0 || b < 0 || c < 0 || a >= X || b >= Y || c >= Z) continue; const j = (c * Y + b) * X + a; if (!valid[j]) continue;
      n++; s += sky[j]; sv += sunV[j]; for (let k = 0; k < 3; k++) { acc[k] += lampOff[j * 3 + k]; acc[3 + k] += lampOn[j * 3 + k]; acc[6 + k] += dirs[j * 3 + k]; } }
    if (n) add.push([i, n, s, sv, acc]);
  }
  for (const [i, n, s, sv, acc] of add) { valid[i] = 2; sky[i] = s / n; sunV[i] = sv / n; for (let k = 0; k < 3; k++) { lampOff[i * 3 + k] = acc[k] / n; lampOn[i * 3 + k] = acc[3 + k] / n; dirs[i * 3 + k] = acc[6 + k] / n; } }
}
for (let i = 0; i < N; i++) if (active[i] && !valid[i]) { sky[i] = 0; sunV[i] = 0; }   // deep inside rock: never sampled
// sky and sun are pulled halfway to the darkest of the six neighbours: a cell just outside a thin wall no longer
// bleeds daylight onto the wall's inner face, and outside corners get a soft contact shade
function erode(f, k) {
  const out = new Float32Array(f);
  for (let z = 1; z < Z - 1; z++) for (let y = 1; y < Y - 1; y++) for (let x = 1; x < X - 1; x++) {
    const i = (z * Y + y) * X + x; if (!active[i]) continue; let m = f[i];
    for (const j of [i - 1, i + 1, i - X, i + X, i - X * Y, i + X * Y]) if (active[j] && valid[j] === 1) m = Math.min(m, f[j]);
    out[i] = f[i] + (m - f[i]) * k;
  }
  return out;
}
const skyF = erode(sky, .5), sunF = erode(sunV, .5);

// ---- written as three RGBA 3D textures: lamps (power off) + sun, lamps (extra with power) + sky, lamp direction
const enc = v => Math.round(Math.sqrt(Math.min(1, Math.max(0, v) / SCALE)) * 255), u8 = v => Math.round(Math.min(1, Math.max(0, v)) * 255);
// ---- regions: the marker boxes that touch form a play area; a map whose areas lie far apart (Der Eisendrache's boss
// arena) would waste most of one big box, so up to two areas are cut out and packed side by side along x in one atlas
const boxes = [...marks, ...lamps.map(l => l.p)].map(m => [
  Math.max(0, Math.floor((m.x - REACH - origin.x) / CELL)), Math.max(0, Math.floor((m.y - BELOW - origin.y) / CELL)), Math.max(0, Math.floor((m.z - REACH - origin.z) / CELL)),
  Math.min(X - 1, Math.ceil((m.x + REACH - origin.x) / CELL)), Math.min(Y - 1, Math.ceil((m.y + ABOVE - origin.y) / CELL)), Math.min(Z - 1, Math.ceil((m.z + REACH - origin.z) / CELL))]);
let regs = [];
for (const b of boxes) { let cur = b.slice();
  for (let merged = true; merged;) { merged = false; for (let i = 0; i < regs.length; i++) { const r = regs[i];
    if (cur[0] <= r[3] + 1 && r[0] <= cur[3] + 1 && cur[1] <= r[4] + 1 && r[1] <= cur[4] + 1 && cur[2] <= r[5] + 1 && r[2] <= cur[5] + 1) {
      cur = [Math.min(cur[0], r[0]), Math.min(cur[1], r[1]), Math.min(cur[2], r[2]), Math.max(cur[3], r[3]), Math.max(cur[4], r[4]), Math.max(cur[5], r[5])]; regs.splice(i, 1); merged = true; break; } } }
  regs.push(cur); }
const vol = r => (r[3] - r[0] + 1) * (r[4] - r[1] + 1) * (r[5] - r[2] + 1), join = (a, b) => [0, 1, 2].map(k => Math.min(a[k], b[k])).concat([3, 4, 5].map(k => Math.max(a[k], b[k])));
while (regs.length > 2) { let best = null; for (let i = 0; i < regs.length; i++) for (let j = i + 1; j < regs.length; j++) { const c = vol(join(regs[i], regs[j])) - vol(regs[i]) - vol(regs[j]); if (!best || c < best.c) best = { i, j, c }; }
  const m = join(regs[best.i], regs[best.j]); regs.splice(best.j, 1); regs.splice(best.i, 1); regs.push(m); }
if (regs.length === 2 && vol(join(regs[0], regs[1])) < (vol(regs[0]) + vol(regs[1])) * 1.3) regs = [join(regs[0], regs[1])];
regs.sort((a, b) => vol(b) - vol(a));
const dimsOf = r => [r[3] - r[0] + 1, r[4] - r[1] + 1, r[5] - r[2] + 1];
const AX_ = regs.reduce((s, r) => s + dimsOf(r)[0], 0), AY = Math.max(...regs.map(r => dimsOf(r)[1])), AZ = Math.max(...regs.map(r => dimsOf(r)[2])), AN = AX_ * AY * AZ;
const out = new Uint8Array(AN * 12), regions = []; let xoff = 0;
for (const r of regs) { const [dx, dy, dz] = dimsOf(r);
  regions.push({ origin: [origin.x + r[0] * CELL, origin.y + r[1] * CELL, origin.z + r[2] * CELL], dims: [dx, dy, dz], x: xoff });
  for (let z = 0; z < dz; z++) for (let y = 0; y < dy; y++) for (let x = 0; x < dx; x++) {
    const i = ((r[2] + z) * Y + r[1] + y) * X + r[0] + x, q = ((z * AY + y) * AX_ + xoff + x) * 4, a = q, b = AN * 4 + q, c = AN * 8 + q;
    for (let k = 0; k < 3; k++) { out[a + k] = enc(lampOff[i * 3 + k]); out[b + k] = enc(lampOn[i * 3 + k]); out[c + k] = u8(dirs[i * 3 + k] * .5 + .5); }
    out[a + 3] = u8(sunF[i]); out[b + 3] = u8(skyF[i]); out[c + 3] = valid[i] === 1 ? 255 : valid[i] ? 128 : 0;
  }
  xoff += dx; }
log(`${regions.length} region(s): ${regions.map(r => r.dims.join('x')).join(' + ')} -> atlas ${AX_}x${AY}x${AZ}`);
const meta = { map: id, cell: CELL, atlas: [AX_, AY, AZ], regions, scale: SCALE, sun: sun.toArray(), lamps: lamps.length, fills: real ? 0 : nFill, ...(real ? { real: real.length, gain: GAIN } : {}), baked: new Date().toISOString().slice(0, 10), stamp: Date.now().toString(36),
  lamp: { off: cfg.off, on: cfg.on, range: cfg.range, decay: cfg.decay } };
fs.writeFileSync(outDir + 'light.json', JSON.stringify(meta));
const gz = zlib.gzipSync(out, { level: 9 }); fs.writeFileSync(outDir + 'light.bin.gz', gz);
log(`wrote ${outDir}light.bin.gz: ${(gz.length / 1048576).toFixed(2)} MB (${(out.length / 1048576).toFixed(1)} MB raw)`);
