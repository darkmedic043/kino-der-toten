#!/usr/bin/env node
// usage: ~/.local/bin/lowpri node .tools/stuck-audit.mjs <map-id> <points.json> [--glb file.glb] [--only x,y,z,r] [--limit n]
//        [--brushes brushes.json] [--no-wedge]
// Stuck-spot finder (2026-11-15, Gorod Krovi, user: "alot of spots cause the player to get stuck and not be able to
// escape"). Runs the game's own PlayerController (radius 14, height 70, jump 39, the map entry's `player` options) on the
// map's collision (COL_ + PCOL_, CLIP_ as its own world, the entry's collisionCut) offline, no browser:
//   candidates: the walked points of `col-audit.mjs <map> --flood-only --points <points.json>` plus every ledge 19-74
//   above one within 28 (what a jump or a mantle lands on: railings, banisters, crates, stair stringers);
//   each is dropped onto, settled 0.5 s, then the player sprints and jumps 1.3 s in 8 directions (time to land). A spot it never leaves
//   by 32 units on a walkable floor is stuck (a capsule wedged between railings: it can slide along them, but
//   never stands; a pit with no way out); clustered within 48. A cluster counts
//   (ENTERABLE) only when a run from an open spot nearby ends in it and can't get out: most stuck spots are sealed slots
//   the flood's thin rays slipped into and the 28-wide capsule never reaches.
// Mantle (mods/movement findLedge, rises up to 74) is simulated as a way out (standing, and mid-air while jumping) and as a
// way in (MANTLE TRAP: a standing mantle from an open spot that lands where nothing escapes); --no-mantle turns it off. Doors, mod colliders and movers are not loaded (all open / absent).
// -> scratch/stuck/<map>.json
import fs from 'node:fs'; import * as THREE from 'three';
import { CollisionWorld } from '../export/web/collision-world.js';
import { PlayerController } from '../export/web/player-controller.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import { wedgeAssist } from '../export/web/mods/unstick/wedge.js';
const id = process.argv[2], ptsFile = process.argv[3], argv = process.argv, arg = (k, d) => { const i = argv.indexOf('--' + k); return i > 0 ? argv[i + 1] : d; };
const t0 = Date.now(), log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const glb = fs.readFileSync(arg('glb', `export/web/mods/maps/${id}/${id}.glb`)), jl = glb.readUInt32LE(12), gltf = JSON.parse(glb.toString('utf8', 20, 20 + jl)), bin0 = 20 + jl + 8;
const TYPES = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }, COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const accessor = i => { const a = gltf.accessors[i], v = gltf.bufferViews[a.bufferView], T = TYPES[a.componentType], n = a.count * COMPS[a.type], off = glb.byteOffset + bin0 + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return off % T.BYTES_PER_ELEMENT ? new T(glb.buffer.slice(off, off + n * T.BYTES_PER_ELEMENT)) : new T(glb.buffer, off, n); };
const parent = new Map(); gltf.nodes.forEach((n, i) => { for (const c of n.children ?? []) parent.set(c, i); });
const local = n => n.matrix ? new THREE.Matrix4().fromArray(n.matrix) : new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation ?? [0, 0, 0])), new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])), new THREE.Vector3(...(n.scale ?? [1, 1, 1])));
const world = i => { const m = local(gltf.nodes[i]); if (parent.has(i)) m.premultiply(world(parent.get(i))); return m; };
const maps = JSON.parse(fs.readFileSync('export/web/mods/maps.json', 'utf8')), entry = (maps.maps ?? maps).find(m => m.id === id), CUT = entry.collisionCut ?? [];
const cutOut = (a, i) => CUT.some(b => { for (let c = 0; c < 9; c += 3) if (!(a[i + c] >= b[0] && a[i + c] <= b[3] && a[i + c + 1] >= b[1] && a[i + c + 1] <= b[4] && a[i + c + 2] >= b[2] && a[i + c + 2] <= b[5])) return false; return true; });
function collect(re, cut) {
  const out = []; const v = new THREE.Vector3();
  gltf.nodes.forEach((n, i) => { if (n.mesh == null || !re.test(n.name ?? '')) return; const m = world(i);
    for (const p of gltf.meshes[n.mesh].primitives) { const P = accessor(p.attributes.POSITION), I = p.indices != null ? accessor(p.indices) : null, cnt = I ? I.length : P.length / 3;
      for (let k = 0; k < cnt; k++) { v.fromArray(P, (I ? I[k] : k) * 3).applyMatrix4(m); out.push(v.x, v.y, v.z); if (cut && k % 3 === 2 && cutOut(out, out.length - 9)) out.length -= 9; } } });
  if (!out.length) return null;
  return new CollisionWorld(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3)));
}
const solid = collect(/^(COL_|PCOL_)/, true), clip = collect(/^CLIP_/, false);
log('collision', solid.geometry.attributes.position.count / 3, 'triangles' + (clip ? ', clip ' + clip.geometry.attributes.position.count / 3 : ''));
const physics = { capsuleIntersect: c => { let best = solid.capsuleIntersect(c) || null; const h = clip?.capsuleIntersect(c); if (h && (!best || h.depth > best.depth)) best = h; return best || false; },
  rayIntersect: (r, n = 0, f = Infinity) => { let h = solid.rayIntersect(r, n, f); const k = clip?.rayIntersect(r, n, h ? Math.min(h.distance, f) : f); return k || h; } };
const cam = new THREE.PerspectiveCamera(); cam.rotation.order = 'YXZ';
const pc = new PlayerController(cam, physics, { spawn: new THREE.Vector3(), spawnIsEye: false, radius: 14, height: 70, eyeHeight: 60, moveSpeed: 190, sprintSpeed: 285, crouchSpeed: 95, gravity: 800, jumpHeight: 39, fallResetY: -1e6, maxSubSteps: 12, groundSnapSpeed: 10, ...entry.player });
// the movement mod's rules (mods/movement/data.json: heavier gravity, less air control), applied as its setup does
const MOVE = JSON.parse(fs.readFileSync('export/web/mods/movement/data.json', 'utf8')).rules.movement;
for (const k of ['gravity', 'groundAcceleration', 'airAcceleration']) if (MOVE[k] !== undefined) pc[k] = MOVE[k];
if (MOVE.gravity && MOVE.jumpHeight) pc.jumpSpeed = Math.sqrt(2 * pc.gravity * MOVE.jumpHeight);
// ---- candidates
const DOWN = new THREE.Vector3(0, -1, 0), ray = new THREE.Ray();
const floorAt = (x, y, z, span) => { ray.origin.set(x, y, z); ray.direction.copy(DOWN); const h = physics.rayIntersect(ray, 0, span); return h ? (h.point ?? h.position).y : null; };
let pts = JSON.parse(fs.readFileSync(ptsFile, 'utf8'));
const only = arg('only'); if (only) { const [ox, oy, oz, or] = only.split(',').map(Number); pts = pts.filter(([x, y, z]) => Math.hypot(x - ox, z - oz) < or && Math.abs(y - oy) < or); }
const seen = new Set(), cands = [], kk = (x, y, z) => Math.round(x / 12) + ',' + Math.round(y / 12) + ',' + Math.round(z / 12);
const add = (x, y, z, kind) => { const k = kk(x, y, z); if (!seen.has(k)) { seen.add(k); cands.push([x, y, z, kind]); } };
for (const [x, y, z] of pts) add(x, y, z, 'walk');
for (const [x, y, z] of pts) for (let a = 0; a < 8; a++) { const X = x + Math.cos(a * Math.PI / 4) * 28, Z = z + Math.sin(a * Math.PI / 4) * 28, top = floorAt(X, y + 80, Z, 61); if (top != null && top - y > 19) add(X, top, Z, 'ledge'); }
const limit = +arg('limit', 0); if (limit) cands.length = Math.min(cands.length, limit);
log('candidates', cands.length, `(${pts.length} walked)`);
// ---- sealed volumes (--brushes file.json, CoD-space world brushes that stop the player, [contents, min xyz, max xyz,
// then nx ny nz d per side plane]: scratch/stuck/brushes.py dumps them for a BO3 map). A settled spot whose capsule axis
// is inside one is inside a closed clip volume the player can't reach (the flood's rays slip into them through
// faces shared by two brushes); such spots are dropped and never used as entry points. Brushes inside the entry's
// collisionCut boxes are ignored (removed on purpose).
// Only the clip classes count: their brushes are built whole into CLIP_/PCOL_; solid (COL) brushes are not, the map's
// COL_ is its drawn geometry, which can leave a solid brush open.
const isCol = c => !!(c & 0x10011) && !!(c & 0x20011) && !!(c & 0x2001);
let brushes = null; const bgrid = new Map(), bk = (x, y) => Math.floor(x / 256) + ',' + Math.floor(y / 256);
if (arg('brushes')) { brushes = JSON.parse(fs.readFileSync(arg('brushes'), 'utf8')).filter(b => !isCol(b[0]) && !CUT.some(c => { const cx = (b[1] + b[4]) / 2, cy = (b[2] + b[5]) / 2, cz = (b[3] + b[6]) / 2; return cx >= c[0] && cx <= c[3] && cz >= c[1] && cz <= c[4] && -cy >= c[2] && -cy <= c[5]; }));
  for (const b of brushes) for (let i = Math.floor(b[1] / 256); i <= Math.floor(b[4] / 256); i++) for (let j = Math.floor(b[2] / 256); j <= Math.floor(b[5] / 256); j++) { const k = i + ',' + j; if (!bgrid.has(k)) bgrid.set(k, []); bgrid.get(k).push(b); }
  log('brushes', brushes.length); }
const inBrush = (x, y, z) => (bgrid.get(bk(x, y)) ?? []).some(b => { if (x <= b[1] + 1 || y <= b[2] + 1 || z <= b[3] + 1 || x >= b[4] - 1 || y >= b[5] - 1 || z >= b[6] - 1) return false;
  for (let i = 7; i < b.length; i += 4) if (b[i] * x + b[i + 1] * y + b[i + 2] * z - b[i + 3] > -1) return false; return true; });
// Any map: 26 rays from the capsule's middle; inside a closed mesh (a pillar, a crate, a clip box) they hit the inside of
// its faces. Open floor sees 0-1 of 26 back faces (40 random walked spots on Gorod Krovi), closed volumes 20 or more.
const T3 = new THREE.Triangle(), N3 = new THREE.Vector3(), D26 = [];
for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) if (i || j || k) D26.push(new THREE.Vector3(i, j, k).normalize());
const backFace = (cw, h, d) => { const ix = cw.geometry.index, P = cw.geometry.attributes.position, o = h.faceIndex * 3, g = k => ix ? ix.getX(o + k) : o + k;
  T3.a.fromBufferAttribute(P, g(0)); T3.b.fromBufferAttribute(P, g(1)); T3.c.fromBufferAttribute(P, g(2)); return T3.getNormal(N3).dot(d) > 0; };
const enclosed = p => { let b = 0; for (const d of D26) { ray.origin.set(p.x, p.y + 35, p.z); ray.direction.copy(d); let best = null, bw = null;
  for (const cw of [solid, clip]) { if (!cw) continue; const r = cw.rayIntersect(ray, 0, 600); if (r && (!best || r.distance < best.distance)) { best = r; bw = cw; } }
  if (best && backFace(bw, best, d)) b++; } return b >= 13; };
const sealed = p => (brushes && [10, 35, 60].some(h => inBrush(p.x, -p.z, p.y + h))) || enclosed(p);
// ---- escape tests
const DT = 1 / 60, feet = () => pc.feetPosition;
const wedge = { y: null, t: 0 }, WEDGE = !process.argv.includes('--no-wedge'), MANTLE = !process.argv.includes('--no-mantle'), step = () => { pc.update(DT); if (WEDGE) wedgeAssist(pc, DT, wedge); };
function run(secs, input) { pc.setInput(input); for (let t = 0; t < secs; t += DT) step(); }
// mantle, as mods/movement findLedge: a wall at waist height within radius+32, a top 20 past it that rises step+1..74
// and fits the standing capsule; the climb ignores collision, then resolves. Returns true when it climbed.
const UPV = new THREE.Vector3(0, 1, 0), DNV = new THREE.Vector3(0, -1, 0), capM = new Capsule(new THREE.Vector3(), new THREE.Vector3(), 14);
const rayM = (o, d, far) => physics.rayIntersect(new THREE.Ray(o, d), 0, far);
function mantle() {
  const f = feet().clone(), y = cam.rotation.y, dir = new THREE.Vector3(-Math.sin(y), 0, -Math.cos(y));
  const wall = rayM(f.clone().addScaledVector(UPV, 26), dir, pc.radius + 32); if (!wall) return false;
  const ny = wall.normal?.y ?? wall.triangle?.getNormal(new THREE.Vector3()).y ?? 1; if (Math.abs(ny) > .5) return false;
  const probe = f.clone().addScaledVector(dir, wall.distance + pc.radius + 6).addScaledVector(UPV, 80);
  const top = rayM(probe, DNV, 80 - (pc.stepHeight + 2)); if (!top) return false;
  const topY = probe.y - top.distance, rise = topY - f.y; if (rise <= pc.stepHeight + 1 || rise > 74) return false;
  const target = new THREE.Vector3(probe.x, topY + pc.skin * 2, probe.z);
  capM.radius = pc.radius; capM.start.set(target.x, target.y + pc.radius, target.z); capM.end.set(target.x, target.y + Math.max(.01, pc.height - 2 * pc.radius) + pc.radius, target.z);
  const hit = physics.capsuleIntersect(capM); if (hit && hit.depth > pc.skin * 2) return false;
  pc.collider.translate(target.clone().sub(feet())); pc.velocity.set(0, 0, 0); pc.onFloor = pc.grounded = true; pc._resolveCollisions?.(); pc.velocity.set(dir.x * 90, 0, dir.z * 90);
  return true;
}
function escape(x, y, z) {
  wedge.y = null, pc.reset(new THREE.Vector3(x, y + 3, z), { eye: false }); run(.5, {});
  const s = feet().clone(); if (y - s.y > 400 || (!pc.onFloor && pc.velocity.y < -500)) return { void: true, s };   // still falling: off the map
  let best = 0;
  for (let a = 0; a < 8; a++) {
    wedge.y = null, pc.reset(s.clone(), { eye: false }); cam.rotation.set(0, a * Math.PI / 4, 0);
    if (MANTLE && mantle()) run(.6, {});
    for (let t = 0, k = 0; t < 1.3; t += DT, k++) { const jump = t < .05 || (t > .35 && t < .4); pc.setInput({ forward: true, sprint: true, jump }); step();
      if (MANTLE && !pc.onFloor && t > .1 && k % 4 === 0 && mantle()) run(.3, {});
      const f = feet(), d = Math.hypot(f.x - s.x, f.z - s.z); if (pc.onFloor && d > best) best = d; if (best >= 32) return { ok: true, s }; }
  }
  return { ok: false, s, best };
}
const stuck = [], okGrid = new Map(), gk = (x, z) => Math.floor(x / 64) + ',' + Math.floor(z / 64); let voids = 0, inside = 0, last = Date.now(); const voidAt = [];
for (let i = 0; i < cands.length; i++) { const [x, y, z, kind] = cands[i], r = escape(x, y, z);
  if (r.void) { voids++; voidAt.push([Math.round(x), Math.round(y), Math.round(z), kind]); } else if (sealed(r.s)) inside++; else if (!r.ok) stuck.push([...r.s.toArray().map(Math.round), kind, Math.round(r.best)]);
  else { const k = gk(r.s.x, r.s.z); if (!okGrid.has(k)) okGrid.set(k, []); okGrid.get(k).push(r.s.clone()); }
  if (Date.now() - last > 30000) { last = Date.now(); log(i, '/', cands.length, 'stuck', stuck.length); } }
// mantle landings: from every open spot a standing mantle in 8 directions; where it lands (settled 0.6 s), the escape
// test runs. A landing nobody escapes from is a trap the mantle leads into (a capsule set down on a rail top or between
// two balustrades); its entry is that mantle.
const mtraps = []; let mtried = 0;
if (MANTLE) { const mseen = new Set(); for (const list of okGrid.values()) for (const o of list) for (let a = 0; a < 8; a++) {
  wedge.y = null, pc.reset(o.clone(), { eye: false }); cam.rotation.set(0, a * Math.PI / 4, 0); if (!mantle()) continue;
  run(.6, {}); const L = feet().clone(), k = kk(L.x, L.y, L.z); if (mseen.has(k)) continue; mseen.add(k); mtried++;
  const r = escape(L.x, L.y, L.z); if (!r.ok && !r.void && !sealed(r.s)) mtraps.push({ from: o.toArray().map(Math.round), dir: a * 45, at: r.s.toArray().map(Math.round), best: Math.round(r.best) });
  if (Date.now() - last > 30000) { last = Date.now(); log('mantle landings', mtried, 'traps', mtraps.length); } }
  log('mantle landings', mtried, 'traps', mtraps.length); }
// can the player get in? From the open spots within 200 (nearest 16, from above first), run at the stuck spot, sprinting,
// jumping at the start or not: it counts when the run ends within 16 of it (30 in height) and no escape works from there.
// A spot no run reaches is sealed (the flood's thin rays slipped into a gap the capsule doesn't fit).
function enter(sp) {
  const near = []; for (let ix = -4; ix <= 4; ix++) for (let iz = -4; iz <= 4; iz++) for (const o of okGrid.get((Math.floor(sp[0] / 64) + ix) + ',' + (Math.floor(sp[2] / 64) + iz)) ?? []) {
    const d = Math.hypot(o.x - sp[0], o.z - sp[2]); if (d > 20 && d < 200 && o.y > sp[1] - 40) near.push([d - (o.y - sp[1]) * .5, o]); }
  near.sort((p, q) => p[0] - q[0]);
  for (const [, o] of near.slice(0, 16)) for (const jumpy of [false, true]) {
    wedge.y = null, pc.reset(o.clone(), { eye: false }); cam.rotation.set(0, Math.atan2(-(sp[0] - o.x), -(sp[2] - o.z)), 0);
    for (let t = 0; t < 2; t += DT) { const f = feet(); if (Math.hypot(f.x - sp[0], f.z - sp[2]) < 6) { pc.setInput({}); break; }
      cam.rotation.set(0, Math.atan2(-(sp[0] - f.x), -(sp[2] - f.z)), 0); pc.setInput({ forward: true, sprint: true, jump: jumpy && t < .05 }); step(); }
    run(.6, {}); const f = feet().clone();
    if (Math.hypot(f.x - sp[0], f.z - sp[2]) < 16 && Math.abs(f.y - sp[1]) < 30) { const r = escape(f.x, f.y, f.z); if (!r.ok && !r.void) return { from: o.toArray().map(Math.round), at: r.s.toArray().map(Math.round) }; }
  }
  return null;
}
// clusters (settled spots within 48) with the rim rise: the lowest floor 32-60 out that is above the spot
const cl = []; for (const p of stuck) { let c = cl.find(q => Math.hypot(q.c[0] - p[0], q.c[2] - p[2]) < 48 && Math.abs(q.c[1] - p[1]) < 48); if (!c) cl.push(c = { c: p.slice(0, 3), n: 0, kinds: {}, best: 0, members: [] }); c.n++; c.members.push(p); c.kinds[p[3]] = (c.kinds[p[3]] ?? 0) + 1; c.best = Math.max(c.best, p[4]); }
log('entry tests for', cl.length, 'clusters');
for (const c of cl) { c.enter = null; for (const p of c.members.slice(0, 4)) { c.enter = enter(p); if (c.enter) break; } }
for (const c of cl) { let rise = 1e9; const [x, y, z] = c.c; for (let a = 0; a < 16; a++) for (const r of [32, 46, 60]) { const t = floorAt(x + Math.cos(a * Math.PI / 8) * r, y + 140, z + Math.sin(a * Math.PI / 8) * r, 140); if (t != null && t - y > 2) rise = Math.min(rise, t - y); } c.rise = rise < 1e9 ? Math.round(rise) : null;
  c.cod = [c.c[0], -c.c[2], c.c[1]]; }
cl.sort((p, q) => !!q.enter - !!p.enter || q.n - p.n); for (const c of cl) delete c.members;
fs.mkdirSync('scratch/stuck', { recursive: true });
fs.writeFileSync(`scratch/stuck/${id}.json`, JSON.stringify({ map: id, candidates: cands.length, voids, inside, stuck, clusters: cl, mantleTraps: mtraps, voidAt }));
log('stuck spots', stuck.length, 'in', cl.length, 'clusters,', cl.filter(c => c.enter).length, 'the player can get into · fell out of the map', voids, '· inside sealed brushes', inside);
console.log(cl.filter(c => c.enter).map(c => `ENTERABLE ${c.n} @ scene ${c.enter.at} (CoD ${c.enter.at[0]},${-c.enter.at[2]},${c.enter.at[1]}) from ${c.enter.from} ${JSON.stringify(c.kinds)} rim+${c.rise}`).join('\n'));
console.log(mtraps.map(m => `MANTLE TRAP @ scene ${m.at} (CoD ${m.at[0]},${-m.at[2]},${m.at[1]}) from ${m.from} facing ${m.dir} best ${m.best}`).join('\n'));
