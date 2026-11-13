// Floating debris: BO3's buyable debris (rubble held in the air by 115) for custom maps, built from props the map already has.
//   const debris = floatingDebris(api, { models: ['p7_crate_wood_01', ...] });
//   debris.block(door);            an existing door: its own pieces are taken off the render layers, debris hangs in their place
//   debris.block(door, [box3]);    a door made at runtime (debrisDoor below): debris fills the given passage boxes
// Pieces use copies of the props' materials (same textures, the baked light applies), one InstancedMesh per prop part
// and door (2026-11-13: each piece part was a draw of its own, 25-40 a door and ~125 in a castle view), `noCull` and
// under a `noMerge` group in world.root, so the scene merge and the instance culler leave them alone and keep the
// props' textures loaded. The copies matter: a material shared with a batch or a plain mesh flips its program per draw.
// Everything is made in setup and visible at load, so the warm-up compiles it; nothing is added or removed in play.
import * as THREE from 'three';
import { CollisionWorld } from '../../collision-world.js';

const P = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), M = new THREE.Matrix4();
const rng = seed => { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const FLY = 1.5, NEAR = 2600;

// A door that exists only as collision (the map file has nothing there): a box that blocks until it is bought.
export function debrisDoor({ world, session }, { name, cost = 1000, zone = '', min, max }) {
  if (!world.doors || world.doors.has(name)) return world.doors?.get(name) ?? null;
  const box = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const g = new THREE.Group(); g.name = 'DEBRISDOOR_' + name; g.userData.noMerge = true; g.position.copy(c); world.root.add(g); g.updateMatrixWorld(true);
  const part = { object: g, collider: new CollisionWorld(new THREE.BoxGeometry(size.x, size.y, size.z).translate(c.x, c.y, c.z)), box, plug: box.clone(), enabled: true, slides: [], anim: null };
  const door = { name, cost, zone, electric: false, parts: [part], box };
  world.doors.set(name, door); world.dynamic.push(part);
  world.interactions?.push({ kind: 'door', door: name, position: c.clone().setY(box.min.y + 50), box });
  world.setDoors(session);
  return door;
}

// The separate slabs of a door's drawn pieces (one merged mesh can hold two plank walls either side of a pillar).
function slabs(objects) {
  const pts = [];
  for (const root of objects) { root.updateMatrixWorld(true); root.traverse(o => { const a = o.isMesh && o.geometry?.attributes.position; if (!a) return; for (let i = 0; i < a.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld)); }); }
  if (!pts.length) return [];
  const all = new THREE.Box3().setFromPoints(pts), size = all.getSize(new THREE.Vector3()), k = size.x >= size.z ? 'x' : 'z', out = [];
  pts.sort((a, b) => a[k] - b[k]);
  for (let i = 0, from = 0; i <= pts.length; i++) if (i === pts.length || i && pts[i][k] - pts[i - 1][k] > 50) { out.push(new THREE.Box3().setFromPoints(pts.slice(from, i))); from = i; }
  return out;
}

export function floatingDebris({ world, session, host, camera }, { models = [], glow = 0x9fd4ff, seed = 11 } = {}) {
  const kinds = [], rand = rng(seed), blocks = [], copies = new Map();
  // clone() keeps neither the shader hooks nor userData's objects
  const own = m => { let c = copies.get(m); if (!c) { c = m.clone(); c.userData = { ...m.userData }; c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; copies.set(m, c); } return c; };
  // one centred copy of each prop's geometry (the culler frees the originals' buffers once it has batched them)
  for (const model of models) {
    const rx = new RegExp('^prop_' + model + '_-?\\d+_-?\\d+(_\\d+)?$'); let node = null;
    world.root.traverse(o => { if (node || !o.isInstancedMesh) return; if (rx.test(o.name)) node = o; else if (o.parent && rx.test(o.parent.name)) node = o.parent; });
    if (!node) continue;
    const src = node.isInstancedMesh ? [node] : node.children.filter(o => o.isInstancedMesh), box = new THREE.Box3();
    const parts = src.filter(o => !Array.isArray(o.material)).map(o => { const g = o.geometry.clone(); g.computeBoundingBox(); box.union(g.boundingBox); return { g, material: own(o.material) }; });
    if (!parts.length) continue;
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), d = [size.x, size.y, size.z].sort((a, b) => b - a);
    for (const p of parts) { p.g.translate(-c.x, -c.y, -c.z); p.g.computeBoundingBox(); p.g.computeBoundingSphere(); }
    kinds.push({ model, parts, long: d[0], plank: d[0] > d[1] * 2.6 });
  }
  if (!kinds.length) kinds.push({ model: 'box', parts: [{ g: new THREE.BoxGeometry(1, .8, .9), material: new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: .9 }) }], long: 1, plank: false });
  const chunks = kinds.filter(k => !k.plank), planks = kinds.filter(k => k.plank);
  // the motes: one small soft dot, drawn additively
  const cv = document.createElement('canvas'); cv.width = cv.height = 32; const cx = cv.getContext('2d'), gr = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 32, 32);
  const dot = new THREE.CanvasTexture(cv); dot.colorSpace = THREE.SRGBColorSpace;

  function fill(group, box, list) {
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), k = size.x >= size.z ? 'x' : 'z', t = k === 'x' ? 'z' : 'x';
    const W = size[k] - 16, H = Math.min(size.y, 124), cols = Math.max(3, Math.round(W / 36)), rows = Math.max(3, Math.round(H / 34)), cw = W / cols, ch = H / rows, x0 = box.min[k] + 8;   // 8 in from each jamb
    const add = (kind, pos, long) => {
      const s = long / kind.long * (.85 + rand() * .3);
      const out = new THREE.Vector3(); out[k] = (pos[k] - c[k]) / W * 1.6; out[t] = (rand() - .5) * 1.4; out.y = .5 + rand() * .9;
      list.push({ kind, pos, s, rot: new THREE.Euler(rand() * 6.28, rand() * 6.28, rand() * 6.28), ph: rand() * 6.28, amp: 2.2 + rand() * 2.4, w: 6.28 / (2.6 + rand() * 1.8), wob: .05 + rand() * .07,
        out: out.multiplyScalar(110 + rand() * 90), spin: new THREE.Vector3(rand() - .5, rand() - .5, rand() - .5).multiplyScalar(7), delay: rand() * .35 });
    };
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const pos = new THREE.Vector3(); pos[k] = x0 + (i + .5 + (rand() - .5) * .45) * cw; pos.y = box.min.y + 8 + (j + .5 + (rand() - .5) * .4) * ch * .96; pos[t] = c[t] + (rand() - .5) * 20;
      add(chunks.length ? chunks[Math.floor(rand() * chunks.length)] : kinds[0], pos, Math.max(31, Math.min(cw, ch)) * (.9 + rand() * .3));
    }
    for (let i = 0; planks.length && i < cols; i++) {
      const pos = new THREE.Vector3(); pos[k] = x0 + (.2 + rand() * .6) * W; pos.y = box.min.y + 14 + rand() * (H - 22); pos[t] = c[t] + (rand() < .5 ? -1 : 1) * (12 + rand() * 8);
      add(planks[Math.floor(rand() * planks.length)], pos, Math.min(72, W * .5) * (.75 + rand() * .3));
    }
    return { c, W, H, k, t, box };
  }

  function block(door, boxes) {
    if (!door) return null;
    if (!boxes) {
      const own = door.parts.flatMap(p => p.slides?.length ? p.slides.map(s => s.object) : [p.object]);
      boxes = slabs(own);
      for (const o of own) o.traverse(x => { x.layers.mask = 0; });   // the stand-in stays as the door's collision and nav plug, undrawn
    }
    if (!boxes.length) return null;
    const group = new THREE.Group(); group.name = 'FDEBRIS_' + door.name; group.userData.noMerge = true; group.matrixAutoUpdate = false; world.root.add(group); group.updateMatrixWorld(true);
    const list = [], fills = boxes.map(b => fill(group, b, list)), n = fills.length * 26, meshes = [];
    // one InstancedMesh per part of each prop used here; a piece is an instance in each of its prop's parts
    const sphere = new THREE.Sphere(new THREE.Box3().setFromPoints(list.map(e => e.pos)).getCenter(new THREE.Vector3()), 400);
    for (const kind of new Set(list.map(e => e.kind))) {
      const mine = list.filter(e => e.kind === kind), ims = kind.parts.map(p => { const im = new THREE.InstancedMesh(p.g, p.material, mine.length);
        im.name = 'fdebris_' + kind.model; im.userData.noCull = true; im.matrixAutoUpdate = false; im.castShadow = false; im.receiveShadow = true; im.boundingSphere = sphere; group.add(im); im.matrixWorld.copy(group.matrixWorld); meshes.push(im); return im; });
      mine.forEach((e, i) => { e.ims = ims; e.i = i; });
    }
    const pos = new Float32Array(n * 3), base = [];
    fills.forEach((f, fi) => { for (let i = 0; i < 26; i++) { const p = new THREE.Vector3(); p[f.k] = f.box.min[f.k] + rand() * f.W; p.y = f.box.min.y + 6 + rand() * (f.H + 6); p[f.t] = f.c[f.t] + (rand() - .5) * 46; base.push({ p, ph: rand() * 6.28, w: .5 + rand() * .9, r: 3 + rand() * 6 }); p.toArray(pos, (fi * 26 + i) * 3); } });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.boundingSphere = new THREE.Sphere(new THREE.Box3().setFromPoints(base.map(b => b.p)).getCenter(new THREE.Vector3()), 400);
    const mat = new THREE.PointsMaterial({ map: dot, color: glow, size: 5.5, sizeAttenuation: true, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const motes = new THREE.Points(geo, mat); motes.matrixAutoUpdate = false; motes.renderOrder = 3; group.add(motes);
    const b = { door, group, list, meshes, motes, base, mat, centre: new THREE.Box3().setFromPoints(base.map(x => x.p)).getCenter(new THREE.Vector3()), open: 0, shown: true };
    pose(b, 0, true); blocks.push(b); return b;
  }

  function pose(b, time, force) {
    const k = b.open;   // 0 held, 1 gone (seconds / FLY)
    if (k >= 1) { if (b.shown) { b.group.visible = false; b.shown = false; } return; }
    if (!b.shown) { b.group.visible = true; b.shown = true; }
    for (const e of b.list) {
      const f = k <= 0 ? 0 : Math.min(1, Math.max(0, (k * FLY - e.delay) / (FLY - .35))), ease = f * f * (3 - 2 * f), bob = Math.sin(time * e.w + e.ph);
      P.copy(e.pos); P.y += bob * e.amp * (1 - ease); if (ease) P.addScaledVector(e.out, ease).y += 40 * ease * ease;
      E.set(e.rot.x + Math.sin(time * e.w * .7 + e.ph) * e.wob + e.spin.x * ease, e.rot.y + Math.sin(time * e.w * .45 + e.ph * 2) * e.wob * 1.6 + e.spin.y * ease, e.rot.z + Math.cos(time * e.w * .6 + e.ph) * e.wob + e.spin.z * ease);
      S.setScalar(e.s * (1 - ease * ease)); M.compose(P, Q.setFromEuler(E), S);
      for (const im of e.ims) M.toArray(im.instanceMatrix.array, e.i * 16);
    }
    for (const im of b.meshes) im.instanceMatrix.needsUpdate = true;
    const a = b.motes.geometry.attributes.position, lift = k * 120;
    for (let i = 0; i < b.base.length; i++) { const m = b.base[i]; a.setXYZ(i, m.p.x + Math.sin(time * m.w + m.ph) * m.r, m.p.y + Math.sin(time * m.w * 1.3 + m.ph * 2) * m.r + lift * (.4 + m.w), m.p.z + Math.cos(time * m.w * .8 + m.ph) * m.r); }
    a.needsUpdate = true; b.mat.opacity = k > 0 ? .95 * (1 - k) + .2 * (1 - k) : .55; b.mat.size = 5.5 + (k > 0 ? 7 * Math.sin(Math.min(1, k * 2) * Math.PI / 2) : 0);
    if (force) b.motes.matrixWorld.copy(b.group.matrixWorld);
  }

  let last = performance.now();
  host.on('update', () => {
    const now = performance.now(), dt = Math.min(.1, (now - last) / 1000), time = now / 1000; last = now;
    for (const b of blocks) {
      const open = world.isOpen(b.door, session);
      if (!open && b.open) { b.open = 0; pose(b, time, true); continue; }
      if (open && b.open < 1) { b.open = Math.min(1, b.open + dt / FLY); pose(b, time); continue; }
      if (!open && camera.position.distanceToSquared(b.centre) < NEAR * NEAR) pose(b, time);
    }
  });
  host.on('reset', () => { for (const b of blocks) { b.open = world.isOpen(b.door, session) ? 1 : 0; pose(b, performance.now() / 1000, true); } });
  return { block, blocks, kinds };
}
