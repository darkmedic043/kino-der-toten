// Gorod Krovi's special enemies, shared pieces (bosses.js sets them up; raz.js, sentinel.js and nikolai.js use them).
// Assets: .tools/build_gorod_bosses.py writes BO3's models, clips and sounds to mods/maps/gorod-krovi/bosses/
// (git-ignored, ripped). Every special joins enemies.list with z.ai (as Der Eisendrache's Panzersoldat): weapons,
// explosions and the kill event work on it, its script moves it. Co-op as the Panzer: the host runs them through DE's
// sync layer (hits on teammates go through sync.hitPlayer), a guest builds a still copy when the host's snapshot names
// one of these kinds (enemies.spawn below) and the multiplayer mod moves it; armour and part damage apply on the host.
import * as THREE from 'three';
import { loadModel, loadAnimation, Rig } from '../../animation.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { settings } from '../../settings.js';
import { createSync } from '../der-eisendrache/sync.js';

export const DIR = new URL('../maps/gorod-krovi/bosses/', import.meta.url).href;
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const fromBO = (x, y, z) => V(x, z, -y);   // BO3 coordinates (x, y, z up) to the map's (x, z, -y)
export const rand = (a, b) => a + Math.random() * (b - a);
export { THREE, Rig, cloneSkinned };

// one model set: its GLBs (null when missing), clips and the clip index (duration, travel speed, notetracks)
export async function loadSet(sub, names) {
  const base = DIR + sub + '/';
  const index = await fetch(base + 'anims.json').then(r => (r.ok ? r.json() : null)).catch(() => null);
  const models = Object.fromEntries(await Promise.all(names.map(async n => [n, await loadModel(base + n + '.glb').catch(() => null)])));
  const A = {};
  if (index) await Promise.all(Object.keys(index).map(async k => { A[k] = await loadAnimation(base + 'anims/' + k + '.json').catch(() => null); }));
  return { models, A, index: index ?? {} };
}

// a part model (built around its own root joint) skinned onto the body's bones, in the body's bind space (DE's panzer)
export function attachPart(body, part, rootName) {
  body.updateMatrixWorld(true); part.updateMatrixWorld(true);
  const bones = new Map(); body.traverse(o => { if (o.isBone && !bones.has(o.name)) bones.set(o.name, o); });
  let bodySkin = null; const inv = new Map(); body.traverse(o => { if (!o.isSkinnedMesh) return; bodySkin ??= o; o.skeleton.bones.forEach((b, k) => { if (!inv.has(b)) inv.set(b, o.skeleton.boneInverses[k]); }); });
  const pr = part.getObjectByName(rootName), br = bones.get(rootName); if (!pr || !br || !bodySkin) return [];
  const toBody = br.matrixWorld.clone().multiply(pr.matrixWorld.clone().invert()), meshes = [];
  part.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  for (const m of meshes) {
    m.geometry = m.geometry.clone().applyMatrix4(toBody.clone().multiply(m.matrixWorld));
    const mapped = m.skeleton.bones.map(b => bones.get(b.name) ?? br);
    m.bind(new THREE.Skeleton(mapped, mapped.map(b => (inv.get(b) ?? b.matrixWorld.clone().invert()).clone())), bodySkin.bindMatrix);
    m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1); m.frustumCulled = false; body.add(m);
  }
  return meshes;
}

// bones by name (first of each), each with its bind position for the clips (animation.js makeClip)
export function prepBody(root) {
  const bones = new Map();
  root.traverse(o => { if (o.isBone) { o.userData.bindPosition = o.position.clone(); if (!bones.has(o.name)) bones.set(o.name, o); } if (o.isMesh) o.frustumCulled = false; });
  return bones;
}
// a bone chain shrunk to nothing (and back): hides the skinned parts it carries without touching shared materials
export const hideBone = (bone, hide = true) => { if (bone) bone.scale.setScalar(hide ? 1e-4 : 1); };

export function makeKit(api, gk) {
  const { world, session, scene, enemies, player, camera } = api, host = api.host;
  const sync = api.sync ?? createSync(api);
  const kit = { api, gk, sync, world, session, scene, enemies, player, host };
  kit.isHost = () => sync.isHost;
  kit.players = () => sync.players();
  kit.playerCount = () => Math.max(1, Math.min(4, sync.players().length || 1));
  kit.nearest = p => sync.nearest(p) ?? { id: sync.me, pos: player.getFeetPosition() };
  kit.posOf = id => sync.players().find(q => q.id === id)?.pos ?? null;
  kit.hitPlayer = (id, n) => { if (n > 0) sync.hitPlayer(id, Math.round(n)); };
  // every standing player within r of p (feet + 40), with the distance: fn(id, d, pos)
  kit.playersNear = (p, r, fn) => { for (const q of sync.players()) { if (q.down) continue; const d = q.pos.clone().add(V(0, 40, 0)).distanceTo(p); if (d <= r) fn(q.id, d, q.pos); } };
  // a shove for the local player (the knock-backs): along `dir`, off the floor
  kit.shove = (dir, force) => { const v = player.velocity; if (!v) return; const d = dir.clone().setY(0); if (d.lengthSq() < 1e-6) d.set(1, 0, 0); d.normalize(); v.x += d.x * force; v.z += d.z * force; v.y = Math.max(v.y, 140 + force * .2); player.onFloor = false; };
  kit.meIn = (p, r) => player.getFeetPosition().clone().add(V(0, 40, 0)).distanceTo(p) <= r;
  kit.face = (root, to) => { root.rotation.y = Math.atan2(-(to.z - root.position.z), to.x - root.position.x); };   // CoD models face +X
  kit.yawTo = (from, to) => Math.atan2(-(to.z - from.z), to.x - from.x);
  kit.turn = (root, yaw, rate, dt) => { let d = yaw - root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); root.rotation.y += Math.max(-rate * dt, Math.min(rate * dt, d)); return Math.abs(d); };
  kit.fwd = root => V(1, 0, 0).applyQuaternion(root.quaternion).setY(0).normalize();
  kit.boneAt = (z, name) => { const b = z.bones?.get(name) ?? z.root.getObjectByName(name); return b ? b.getWorldPosition(V()) : null; };
  kit.ground = p => world.closest?.(p, { x: 200, y: 300, z: 200 }) ?? p.clone();
  kit.clear = (a, b) => world.lineClear(a, b);
  kit.zones = () => gk?.activeZones?.() ?? world.activeZones(session);   // BO3's raz/sentinel locations: the active zones (spawns.js)
  kit.zoneAt = p => world.zoneAt?.(p.clone().add(V(0, 35, 0)));
  kit.inArena = p => p.y > -60 && p.y < 300 && p.z > 600 && p.z < 3200 && p.x > -1700 && p.x < 1700;

  // sounds (plain HTML audio at the game's volume, silent while muted), fading with distance from the camera
  const level = v => (api.audio?.enabled === false ? 0 : Math.max(0, Math.min(1, v * (settings.volume ?? 1))));
  kit.sfx = (name, vol = 1) => { const a = new Audio(DIR + 'audio/' + name + '.ogg'); a.volume = level(vol); a.play().catch(() => {}); return a; };
  kit.sfxAt = (name, pos, vol = 1, range = 2500) => { const d = camera?.position ? camera.position.distanceTo(pos) : 0; if (d > range) return null; return kit.sfx(name, vol * (1 - d / range) ** 1.5); };
  kit.pick = (stem, n) => stem + '_0' + Math.floor(Math.random() * n);
  kit.loop = name => { const a = new Audio(DIR + 'audio/' + name + '.ogg'); a.loop = true; a.volume = 0; a.play().catch(() => {}); return a; };
  kit.loopVol = (a, pos, vol = 1, range = 2500) => { if (!a) return; const d = camera?.position ? camera.position.distanceTo(pos) : 0; a.volume = level(d > range ? 0 : vol * (1 - d / range) ** 1.5); };

  // effects: sprites, lines and debris that move and fade, updated every frame; their materials are made here and
  // drawn once while loading (host.warmObjects)
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const glowMat = color => new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  kit.mats = { orange: glowMat(0xff8a30), blue: glowMat(0x58b8ff), red: glowMat(0xff3020), white: glowMat(0xfff2d8), green: glowMat(0x80ff90) };
  kit.lineMats = { blue: new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false }),
    yellow: new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: .9 }), green: new THREE.LineBasicMaterial({ color: 0x90ff9a, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }), red: new THREE.LineBasicMaterial({ color: 0xff5040, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false }) };
  for (const m of Object.values(kit.mats)) { const s = new THREE.Sprite(m); s.scale.setScalar(.01); host.warmObjects.push(s); }
  for (const m of Object.values(kit.lineMats)) host.warmObjects.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(), V(0, 1, 0)]), m));
  const fx = [];
  kit.fx = fx;
  kit.add = (o, opts) => { scene.add(o); const f = { o, life: 1, ...opts }; f.life0 = f.life; fx.push(f); return f; };
  kit.sprite = (mat, p, size, opts = {}) => { const m = kit.mats[mat] ?? mat, s = new THREE.Sprite(opts.fade ? m.clone() : m); s.position.copy(p); s.scale.setScalar(size); return kit.add(s, { ...opts, ownMat: !!opts.fade }); };   // a fading sprite gets its own copy of the material (same program)
  kit.line = (mat, a, b, life = .08) => kit.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), kit.lineMats[mat] ?? mat), { life, dispose: true });
  kit.debris = (model, p, v, life = 5) => { if (!model) return null; const o = cloneSkinned(model); o.traverse(m => { if (m.isMesh) m.frustumCulled = false; }); o.position.copy(p); return kit.add(o, { v, gravity: 900, spin: rand(3, 7), life, floor: p.y - 200 }); };
  kit.boom = (p, scale = 1) => { window.kino?.fx?.explosion?.(p.clone(), scale); kit.sprite('orange', p, 90 * scale, { life: .35, grow: 260 * scale, fade: true }); };
  host.on('update', dt => {
    dt = Math.min(dt || 1 / 60, .1);
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.life -= dt;
      if (f.v) { if (f.gravity) f.v.y -= f.gravity * dt; f.o.position.addScaledVector(f.v, dt); if (f.floor != null && f.o.position.y < f.floor) { f.o.position.y = f.floor; f.v.set(0, 0, 0); f.spin = 0; } }
      if (f.spin) { f.o.rotation.x += f.spin * dt; f.o.rotation.z += f.spin * .6 * dt; }
      if (f.grow) f.o.scale.setScalar(f.o.scale.x + f.grow * dt);
      if (f.fade && f.o.material) f.o.material.opacity = Math.max(0, f.life / f.life0);
      f.tick?.(dt, f);
      if (f.life <= 0) { f.o.removeFromParent(); if (f.dispose) f.o.geometry?.dispose(); if (f.ownMat) f.o.material.dispose(); fx.splice(i, 1); }
    }
  });
  // where the last bullet hit each special (enemies.rayHit gives the point; the hit is applied in the same frame)
  const rayHit0 = enemies.rayHit.bind(enemies);
  enemies.rayHit = (...a) => { const h = rayHit0(...a); if (h?.z?.special) h.z.lastHit = { p: h.point.clone(), t: session.time, head: h.head, ray: a[0].clone() }; return h; };
  kit.hitPoint = z => (z.lastHit && Math.abs(z.lastHit.t - session.time) < 1e-6 ? z.lastHit.p : null);
  kit.hitRay = z => (z.lastHit && Math.abs(z.lastHit.t - session.time) < 1e-6 ? z.lastHit.ray : null);

  // the specials' kinds: insta-kill and nukes don't kill them outright (each kind's script decides what insta-kill does)
  const kinds = new Map();   // kind -> {mirror(p), nukeProof}
  kit.kind = (k, opts) => kinds.set(k, opts);
  const hurt0 = enemies.hurt.bind(enemies);
  enemies.hurt = (z, amount, ...rest) => {
    const fxs = session.effects; if (!z?.special || !(fxs.insta_kill > session.time)) return hurt0(z, amount, ...rest);
    const insta = fxs.insta_kill; fxs.insta_kill = 0; z.insta = true;
    try { return hurt0(z, amount, ...rest); } finally { fxs.insta_kill = insta; z.insta = false; }
  };
  const nuke0 = enemies.nuke.bind(enemies);
  enemies.nuke = onDeath => { const keep = enemies.list.filter(z => z.special && kinds.get(z.kind)?.nukeProof !== false); for (const z of keep) enemies.list.splice(enemies.list.indexOf(z), 1); try { return nuke0(onDeath); } finally { enemies.list.push(...keep); } };
  const spawn0 = enemies.spawn.bind(enemies);
  kit.spawnZombie = spawn0;
  enemies.spawn = (p, b, kind, ...rest) => {
    const k = kinds.get(kind);
    if (k && !sync.isHost) return k.mirror?.(p ?? b?.inside ?? V()) ?? spawn0(p, b, 'zombie', ...rest);
    if (kit.replaceSpawn && (kind ?? 'zombie') === 'zombie' && sync.isHost) { const r = kit.replaceSpawn(p, b); if (r !== undefined) return r; }
    return spawn0(p, b, kind, ...rest);
  };

  // a new enemy record in enemies.list: count true adds it to the round, 'replace' takes a zombie's place, false = outside it
  kit.enlist = (z, { count = true } = {}) => {
    z.id = ++enemies.serial; z.special = true; z.path ??= []; z.pathIndex ??= 0; z.repath ??= 0; z.lastPosition ??= z.root.position.clone(); z.t ??= 0;
    enemies.list.push(z);
    if (count) { if (count !== 'replace') session.total = (session.total ?? 0) + 1; session.spawned = (session.spawned ?? 0) + 1; }   // 'replace': in place of a zombie the round already counts
    return z;
  };
  kit.alive = kind => enemies.list.filter(z => z.kind === kind);
  kit.walkTo = (z, goal, speed, dt, { stopAt = 12 } = {}) => {   // along the navmesh to goal; returns the distance left
    const pos = z.root.position;
    z.repath -= dt;
    if (z.repath <= 0 || !z.path.length) { z.repath = .5; z.path = world.path(pos, goal) ?? []; z.pathIndex = 1; }
    const to = z.path[z.pathIndex] ?? goal, d = to.clone().sub(pos); d.y = 0;
    if (d.length() < 12 && z.pathIndex < z.path.length - 1) z.pathIndex++;
    if (d.length() > 1) { d.normalize(); pos.addScaledVector(d, Math.min(speed * dt, Math.max(0, to.distanceTo(pos)))); kit.turn(z.root, kit.yawTo(pos, to), 5, dt); }
    const y = world.surfaceY?.(pos.x, pos.y + 40, pos.z); if (y != null && Math.abs(y - pos.y) < 60) pos.y += (y - pos.y) * Math.min(1, dt * 10);
    const end = z.path[z.path.length - 1];
    return { left: pos.distanceTo(goal), lost: !end || end.distanceTo(goal) > 150 };
  };
  return kit;
}
