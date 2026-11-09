// BO3 Trip Mine (lethal) and Smoke Grenade (tactical), 2026-11-05. Melon Pass Season 1 rewards since 2026-11-08 (COMING SOON
// before): owned ones join the player's Mystery Box list (progression.json unlock, progression mod giveWeapon); the cheat
// `bo3gear trip|smoke` gives them for tests.
// Models and sounds come from the user's own BO3 install (.tools/build_bo3_equipment.py, git-ignored `models/`, `sounds/`):
// without them prepare() registers nothing.
//
// Trip Mine: one lethal slot with frags and Claymores (KinoSession.giveTrips / trips / tripsOwned). Thrown in an arc, it
// sticks to the first surface, arms after 1 s and casts a red laser (out from a wall, ahead along the floor, down from a
// ceiling, 240 long at most); a zombie crossing it beeps it off 0.2 s later.
// Live Wire (Major augment `trip.tether`): two armed mines within 300 of each other with nothing between them link with an
// electric wire instead of lasers. It shocks each zombie that touches it at most every 1.5 s (100 + 8% max health, 0.5 s
// stun, 40% slow for 2.5 s; bosses take a flat 300 and are not stunned) and shorts out after 10 shocks or 60 s, taking
// both mines with it. Mines left without a partner keep their lasers and explode as usual.
// Smoke Grenade: bounces, pops into a 200-wide cloud for 12 s. Zombies lose players inside it (window.kino.concealed,
// read by the multiplayer mod's targetFor) and search the cloud's rim, unless they are already within 75. A shot gives
// your position away for 1.2 s (not with Ghost). In co-op the cloud is sent to everyone; augment effects stay with the
// thrower's own clouds.
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const up = new THREE.Vector3(0, 1, 0);
const url = p => new URL(p, import.meta.url).href;
const TRIP = url('models/tripmine.glb'), SMOKE = url('models/smoke.glb');
const SOUNDS = ['plant', 'trip', 'arm', 'zap', 'zap2', 'link', 'short', 'smoke_start', 'smoke_loop', 'smoke_end', 'smoke_bounce'];
const TRIP_REACH = 650, TRIP_SPEED = 1100, LASER = 240, WIRE_RANGE = 300, WIRE_CHARGES = 10, WIRE_LIFE = 60, WIRE_COOL = 1.5;
const CLOUD_R = 200, CLOUD_LIFE = 12, CLOUD_GROW = 1.2, FIND = 75, REVEAL = 1.2;

export async function prepare(data) {
  const have = await Promise.all([TRIP, SMOKE].map(u => fetch(u, { method: 'HEAD' }).then(r => r.ok, () => false)));
  if (!have.every(Boolean)) return data;
  data.equipment ??= {};
  data.equipment.tripmine_zm = { id: 'tripmine_zm', name: 'Trip Mines', worldModel: TRIP, standInModel: TRIP, lethal: true,
    explosionRadius: 190, explosionInnerDamage: 500, explosionOuterDamage: 120 };
  data.equipment.smoke_zm = { id: 'smoke_zm', name: 'Smoke Grenades', worldModel: SMOKE, standInModel: SMOKE, tactical: true };
  return data;
}

export default async function setup(api) {
  const { host, session, data, audio, camera, scene, world, enemies, features, renderer } = api;
  const tripDef = data.equipment?.tripmine_zm;
  if (!tripDef || !scene || !world) return;
  const kino = window.kino ??= {};
  const aug = k => kino.equipAug?.(k) ?? 0;
  const fx = () => kino.equipFx;
  const now = () => session.time;
  const elite = z => z.kind === 'panzer' || z.boss;
  const alive = z => z.health > 0 && enemies.list.includes(z);
  const feet = () => api.player.getFeetPosition();
  for (const k of SOUNDS) audio.manifest[`bo3eq_${k}`] ??= { url: url(`sounds/${k}.ogg`) };
  const play = (k, v = .7) => audio.play(`bo3eq_${k}`, v);

  const [tripSrc, smokeSrc] = await Promise.all([loadModel(TRIP), loadModel(SMOKE)]);
  // soft puff for the cloud: a CanvasTexture drawn once and uploaded now (never redrawn)
  const puff = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.5, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; renderer?.initTexture?.(t); return t;
  })();
  const puffMat = new THREE.SpriteMaterial({ map: puff, color: 0x9a9da0, transparent: true, opacity: .8, depthWrite: false, fog: true });
  const laserMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: .75, depthWrite: false, blending: THREE.AdditiveBlending });
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending });
  const arcMat = new THREE.LineBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending });
  const beamGeo = new THREE.CylinderGeometry(.25, .25, 1, 6, 1, true).translate(0, .5, 0);
  const wireGeo = new THREE.CylinderGeometry(.45, .45, 1, 6, 1, true).translate(0, .5, 0);
  // warm-up: every program these draw mid-game, compiled behind the loading screen
  {
    const w = new THREE.Group(); w.add(cloneSkinned(tripSrc), cloneSkinned(smokeSrc), new THREE.Sprite(puffMat), new THREE.Mesh(beamGeo, laserMat), new THREE.Mesh(wireGeo, wireMat));
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]); w.add(new THREE.Line(lg, arcMat));
    (host.warmObjects ??= []).push(w);
  }

  // ---- shared flight: arc, raycast against the map, stick or bounce ----------------------------------------------------
  const flying = [];   // {kind, mesh, vel, life, bounces, onLand}
  const ray = new THREE.Ray();
  function launchFrom(mesh, speed, lift) {
    const dir = camera.getWorldDirection(new THREE.Vector3()), far = kino.throwRange?.() ?? 1;
    mesh.position.copy(camera.position).addScaledVector(dir, 14); scene.add(mesh);
    return { dir, vel: dir.clone().multiplyScalar(speed * far).addScaledVector(up, lift * far) };
  }
  const seenRay = new THREE.Raycaster();
  function seenHit(from, dir, far) {
    const root = world.mapRoot ?? world.root;
    if (!root) return null;
    seenRay.set(from, dir); seenRay.near = 0; seenRay.far = far;
    let hit;
    try { hit = seenRay.intersectObject(root, true).find(h => h.object.isMesh && !h.object.isSkinnedMesh && h.face && h.object.material?.visible !== false); } catch { return null; }
    if (!hit) return null;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (n.dot(dir) > 0) n.negate();
    return { at: hit.point.clone().addScaledVector(n, .5), n };
  }
  function hitNormal(hit, dir) {
    const n = new THREE.Vector3();
    if (hit.triangle?.getNormal) { hit.triangle.getNormal(n); if (n.dot(dir) > 0) n.negate(); } else n.copy(dir).negate();
    return n.normalize();
  }

  // ---- Trip Mine ---------------------------------------------------------------------------------------------------------
  let mines = [], wires = [];
  const throwMine = () => {
    const mesh = cloneSkinned(tripSrc); mesh.traverse(o => { o.frustumCulled = false; });
    const { dir, vel } = launchFrom(mesh, 520, 160), f = { kind: 'mine', mesh, vel, life: 4, face: new THREE.Vector3(dir.x, 0, dir.z).normalize() };
    // aimed at a surface in reach (wall, ceiling, floor): it flies straight there and sticks to it, as BO3's does;
    // otherwise it is lobbed and sticks wherever it lands
    const reach = TRIP_REACH * (kino.throwRange?.() ?? 1), aim = world.raycast(new THREE.Ray(camera.position.clone(), dir.clone()), 0, reach);
    let at = aim ? (aim.point ?? aim.position).clone() : null, n = aim ? hitNormal(aim, dir) : null;
    if (!aim || aim.distance > 150) {   // some ceilings aren't in the collision (Kino's): ask the drawn map too, nearest wins (about 5 ms, once a throw)
      const seen = seenHit(camera.position, dir, aim ? aim.distance : reach);
      if (seen) ({ at, n } = seen);
    }
    if (at) f.target = { at, n, dir: at.clone().sub(mesh.position).normalize() };
    flying.push(f);
  };
  function plant(f, at, n) {
    const g = new THREE.Group(); g.position.copy(at); g.quaternion.setFromUnitVectors(up, n);
    f.mesh.position.set(0, 0, 0); f.mesh.quaternion.identity(); f.mesh.rotation.y = Math.random() * Math.PI * 2; g.add(f.mesh); scene.add(g);
    g.updateMatrixWorld(true);
    // beam direction: out from a wall, ahead along the floor (the way it was thrown), down from a ceiling
    const along = Math.abs(n.y) < .6 ? n.clone() : n.y > 0 ? f.face.clone() : new THREE.Vector3(0, -1, 0);
    const top = at.clone().addScaledVector(n, Math.abs(n.y) < .6 ? 10 : 22);
    const m = { g, at: at.clone(), n, top, along, armAt: now() + (aug('trip.quick') ? .25 : 1), armed: false, beams: [], pair: null, boomAt: 0 };
    mines.push(m); play('plant', .6);
    const cap = session.tripMax?.() + 1 || 4;
    while (mines.length > cap) removeMine(mines[0], false);
  }
  function arm(m) {
    m.armed = true; play('arm', .45);
    const dirs = [m.along];
    if (aug('trip.grid')) { const axis = Math.abs(m.n.y) < .6 ? up : m.n; for (const a of [-.44, .44]) dirs.push(m.along.clone().applyAxisAngle(axis, a)); }   // Laser Grid: ±25°
    for (const d of dirs) {
      const hit = world.raycast(new THREE.Ray(m.top.clone(), d), 1, LASER), len = hit ? hit.distance : LASER;
      const mesh = new THREE.Mesh(beamGeo, laserMat); mesh.position.copy(m.top); mesh.quaternion.setFromUnitVectors(up, d); mesh.scale.set(1, len, 1);
      scene.add(mesh); m.beams.push({ mesh, dir: d.clone(), len });
    }
  }
  function removeMine(m, spark = true) {
    if (spark) features?.effect?.(m.top, 0x8fd4ff, 10);
    m.g.removeFromParent(); for (const b of m.beams) b.mesh.removeFromParent();
    mines = mines.filter(x => x !== m);
    if (m.pair) { const w = m.pair; removeWire(w, false); }
  }
  function detonate(m) {
    const def = { ...tripDef, explosionRadius: tripDef.explosionRadius * (1 + aug('trip.radius')),
      explosionInnerDamage: tripDef.explosionInnerDamage * (1 + aug('trip.dmg')), explosionOuterDamage: tripDef.explosionOuterDamage * (1 + aug('trip.dmg')) };
    removeMine(m, false);
    const caught = features?.blast?.(m.top.clone(), def) ?? [], left = caught.filter(alive), kills = caught.length - left.length, f = fx();
    if (f && aug('trip.pct')) for (const z of left) f.pct(z, aug('trip.pct'));                         // Shaped Charge
    if (f && aug('trip.stun')) for (const z of f.near(m.top, 250 * (1 + aug('trip.radius')))) if (!elite(z)) f.stun(z, aug('trip.stun'));   // Concussive (Wide Blast widens it)
    salvage(kills);
  }
  // Salvage: a blast, or a Live Wire before it shorts out, that kills 3 or more gives one mine back
  function salvage(kills) {
    if (aug('trip.salvage') && kills >= aug('trip.salvage') && session.tripsOwned && session.trips < session.tripMax()) { session.trips++; api.toast?.('Salvage · Trip Mine returned'); }
  }
  const zPoints = z => [15, 42, 68].map(h => z.root.position.clone().addScaledVector(up, z.kind === 'dog' ? h * .5 : h));   // legs, chest, head: wall mines sit at any height
  const segDist = (p, a, b) => { const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1); return a.clone().addScaledVector(ab, t).distanceTo(p); };
  function crosses(m) {
    for (const b of m.beams) {
      const end = m.top.clone().addScaledVector(b.dir, b.len);
      for (const z of enemies.list) {
        if (z.health <= 0 || z.root.position.distanceTo(m.top) > b.len + 60) continue;
        if (zPoints(z).some(p => segDist(p, m.top, end) < 18)) return true;
      }
    }
    return false;
  }

  // Live Wire
  function link(a, b) {
    for (const m of [a, b]) { for (const x of m.beams) x.mesh.removeFromParent(); m.beams = []; }
    const core = new THREE.Mesh(wireGeo, wireMat), d = b.top.clone().sub(a.top);
    core.position.copy(a.top); core.quaternion.setFromUnitVectors(up, d.clone().normalize()); core.scale.set(1, d.length(), 1);
    const pts = 14, geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts * 3), 3));
    const arc = new THREE.Line(geo, arcMat); arc.frustumCulled = false;
    scene.add(core, arc);
    const w = { a, b, core, arc, pts, kills: 0, charges: WIRE_CHARGES, until: now() + WIRE_LIFE, cool: new WeakMap(), jitter: 0 };
    a.pair = b.pair = w; wires.push(w); play('link', .55);
  }
  function removeWire(w, shorted) {
    if (!wires.includes(w)) return;
    wires = wires.filter(x => x !== w); w.core.removeFromParent(); w.arc.removeFromParent(); w.arc.geometry.dispose();
    w.a.pair = w.b.pair = null;
    if (shorted) { play('short', .7); for (const m of [w.a, w.b]) removeMine(m, true); salvage(w.kills); }
  }
  function updateWire(w, dt) {
    if (now() > w.until || w.charges <= 0) return removeWire(w, true);
    if ((w.jitter -= dt) <= 0) {   // crackle: redraw the arc's kinks at 20 Hz (a 14-point line, nothing else re-uploaded)
      w.jitter = .05; const p = w.arc.geometry.attributes.position, a = w.a.top, b = w.b.top;
      for (let i = 0; i < w.pts; i++) {
        const t = i / (w.pts - 1), s = i && i < w.pts - 1 ? 3.5 : 0;
        p.setXYZ(i, a.x + (b.x - a.x) * t + (Math.random() - .5) * s, a.y + (b.y - a.y) * t + (Math.random() - .5) * s, a.z + (b.z - a.z) * t + (Math.random() - .5) * s);
      }
      p.needsUpdate = true;
    }
    for (const z of [...enemies.list]) {
      if (z.health <= 0 || (w.cool.get(z) ?? 0) > now()) continue;
      if (!zPoints(z).some(p => segDist(p, w.a.top, w.b.top) < 22)) continue;
      w.cool.set(z, now() + WIRE_COOL); w.charges--;
      const f = fx(), hp = f?.maxHp?.(z) ?? z.maxHealth ?? 1000, boss = elite(z);
      if (f) { if (!boss) f.stun(z, .5); f.slow(z, .4, 2.5); }
      enemies.hurt(z, boss ? 300 : 100 + hp * .08, false, false, 'electric');
      if (!alive(z)) w.kills++;
      kino.fx?.spark?.(z.root.position.clone().addScaledVector(up, 40));
      features?.effect?.(z.root.position.clone().addScaledVector(up, 40), 0x8fd4ff, 8);
      play(Math.random() < .5 ? 'zap' : 'zap2', .55);
      if (w.charges <= 0) break;
    }
  }

  kino.lethalExtra = {
    id: 'tripmine_zm',
    owned: () => !!session.tripsOwned,
    count: () => session.trips ?? 0,
    spend() { session.trips = Math.max(0, (session.trips ?? 0) - 1); },
    launch: throwMine,
    quick() {   // controller / touch: thrown at once, no hold
      if (!api.getState?.().active || session.busy || session.phase === 'gameover' || !(session.trips > 0)) return false;
      this.spend(); throwMine(); return true;
    },
  };

  // ---- Smoke Grenade -----------------------------------------------------------------------------------------------------
  let clouds = [], revealedUntil = 0, chokeTick = 0;
  const throwSmoke = () => {
    const mesh = cloneSkinned(smokeSrc), { vel } = launchFrom(mesh, 520, 160);
    flying.push({ kind: 'smoke', mesh, vel, life: aug('smoke.quick') ? .6 : 1.2, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0) });
  };
  function addCloud(at, r, dur, mine) {
    const group = new THREE.Group(); group.position.copy(at); scene.add(group);
    const mat = puffMat.clone(), sprites = [];
    for (let i = 0; i < 22; i++) {
      const s = new THREE.Sprite(mat), a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r * .8;
      s.userData.home = new THREE.Vector3(Math.cos(a) * d, 20 + Math.random() * r * .55, Math.sin(a) * d); s.userData.size = r * (.7 + Math.random() * .5);
      s.position.copy(s.userData.home); s.scale.setScalar(1); group.add(s); sprites.push(s);
    }
    const c = { at: at.clone(), r, born: now(), until: now() + dur, mine, group, mat, sprites, k: 0, tick: 0, quick: mine && aug('smoke.quick') > 0 };
    if (mine) {
      play('smoke_start', .7);
      // audio.native resolves to the source: a cloud that ended first stops it as soon as it arrives
      if (audio.ctx && audio.native) audio.native('bo3eq_smoke_loop', .35, true).then(src => { if (c.ended) try { src.stop(); } catch {} else c.loop = src; }).catch(() => {});
      const f = fx(); if (f && aug('smoke.stun')) for (const z of f.near(at, 150 * (1 + aug('smoke.radius')))) if (!elite(z)) f.stun(z, aug('smoke.stun'));   // Smoke Bomb (Thick Smoke widens it)
    }
    clouds.push(c); return c;
  }
  function endCloud(c) {
    c.ended = true; c.group.removeFromParent(); c.mat.dispose(); try { c.loop?.stop(); } catch {} c.loop = null;
    if (c.mine) play('smoke_end', .5);
    clouds = clouds.filter(x => x !== c);
  }
  const inside = (c, p) => c.k > .6 && now() < c.until - .5 && Math.hypot(p.x - c.at.x, p.z - c.at.z) < c.r && p.y - c.at.y > -80 && p.y - c.at.y < 160;
  function pop(f) {
    const r = CLOUD_R * (1 + aug('smoke.radius')), dur = CLOUD_LIFE * (1 + aug('smoke.long')), at = f.mesh.position.clone();
    f.mesh.removeFromParent();
    addCloud(at, r, dur, true);
    const net = kino.coop; if (net?.id) net.send('all', { t: 'smoke', at: [at.x, at.y, at.z], r, dur });
  }
  // players a zombie can't see: inside a grown cloud and further than FIND from it
  kino.concealed = (z, pos, id) => {
    if (!clouds.length || !pos) return false;
    if (id == null && now() < revealedUntil) return false;
    for (const c of clouds) if (inside(c, pos) && Math.hypot(z.root.position.x - pos.x, z.root.position.z - pos.z) > FIND) return true;
    return false;
  };
  host.on('shot', () => { if (clouds.length && !aug('smoke.ghost')) revealedUntil = now() + REVEAL; });   // Ghost: shots don't give you away
  const lure = enemies.lureTarget?.bind(enemies);
  enemies.lureTarget = z => {
    const prev = lure ? lure(z) : null;
    if (prev || !clouds.length) return prev;
    const f = feet(), v = enemies.targetFor?.(z, f) ?? { position: f };
    if (!kino.concealed(z, v.position, v.id)) { z.smokeSearch = null; return null; }
    const c = clouds.find(c => inside(c, v.position)) ?? clouds[0];
    let s = z.smokeSearch;
    if (!s || s.c !== c || now() > s.until) {   // search the rim on the zombie's side, a new spot every few seconds
      const a = Math.atan2(z.root.position.z - c.at.z, z.root.position.x - c.at.x) + (Math.random() - .5) * 1.4, d = c.r * (.75 + Math.random() * .35);
      s = z.smokeSearch = { c, until: now() + 2.5 + Math.random() * 2, at: new THREE.Vector3(c.at.x + Math.cos(a) * d, c.at.y, c.at.z + Math.sin(a) * d) };
    }
    return s.at;
  };
  // Cover Fire: zombies standing in your own cloud take more damage
  host.on('beforeEnemyDamage', e => {
    const k = aug('smoke.mark'); if (!k || !clouds.length) return;
    if (clouds.some(c => c.mine && inside(c, e.enemy.root.position))) e.amount *= 1 + k;
  });
  function hookCoop(tries = 0) {
    const net = kino.coop;
    if (!net?.on) { if (tries < 30) setTimeout(() => hookCoop(tries + 1), 1000); return; }
    net.on('smoke', m => { if (Array.isArray(m?.at) && api.getState?.().active) addCloud(new THREE.Vector3(...m.at), Math.min(+m.r || CLOUD_R, 400), Math.min(+m.dur || CLOUD_LIFE, 30), false); });
  }
  hookCoop();

  const tac = kino.tactical;
  if (tac?.extra) tac.extra.smoke_zm = { max: () => 2 + aug('smoke.extra') + (kino.reaperPerks?.tacticalBonus?.() ?? 0), launch: throwSmoke };

  // ---- frame update ------------------------------------------------------------------------------------------------------
  host.on('update', dt => {
    if (!dt) return;
    for (const f of [...flying]) {
      f.life -= dt; f.vel.y -= 650 * dt;
      const step = f.vel.clone().multiplyScalar(dt), len = step.length();
      ray.set(f.mesh.position.clone(), step.clone().normalize());
      const hit = len > 0 ? world.raycast(ray, 0, len + 3) : null;
      if (f.kind === 'mine' && f.target) {   // straight to the aimed surface
        const left = f.target.at.distanceTo(f.mesh.position), go = TRIP_SPEED * dt;
        if (left <= go + 1) { flying.splice(flying.indexOf(f), 1); plant(f, f.target.at, f.target.n); continue; }
        f.mesh.position.addScaledVector(f.target.dir, go); f.mesh.rotation.x += 9 * dt; continue;
      }
      if (f.kind === 'mine') {
        if (hit) { flying.splice(flying.indexOf(f), 1); plant(f, hit.point ?? hit.position, hitNormal(hit, ray.direction)); continue; }
        f.mesh.position.add(step); f.mesh.rotation.x += 7 * dt;
        if (f.life <= 0) { flying.splice(flying.indexOf(f), 1); f.mesh.removeFromParent(); }
        continue;
      }
      if (hit) {
        const n = hitNormal(hit, ray.direction);
        if (f.vel.length() > 120) play('smoke_bounce', .4);
        f.vel.addScaledVector(n, -2 * f.vel.dot(n)).multiplyScalar(.4); f.mesh.position.addScaledVector(n, 1);
        if (f.vel.length() < 40) f.vel.set(0, 0, 0), f.rest = true;
      } else if (!f.rest) f.mesh.position.add(step);
      f.mesh.rotation.x += f.spin.x * dt; f.mesh.rotation.y += f.spin.y * dt;
      if (f.life <= 0) { flying.splice(flying.indexOf(f), 1); pop(f); }
    }
    const t = now();
    for (const m of [...mines]) {
      if (!mines.includes(m)) continue;
      if (!m.armed) { if (t >= m.armAt) arm(m); continue; }
      if (m.boomAt) { if (t >= m.boomAt) detonate(m); continue; }
      if (aug('trip.tether') && !m.pair) {
        const other = mines.filter(o => o !== m && o.armed && !o.pair && !o.boomAt && o.top.distanceTo(m.top) < WIRE_RANGE * (1 + aug('trip.radius')) && world.lineClear(m.top, o.top))
          .sort((a, b) => a.top.distanceTo(m.top) - b.top.distanceTo(m.top))[0];
        if (other) { link(m, other); continue; }
      }
      if (!m.pair && crosses(m)) { m.boomAt = t + .2; play('trip', .8); }
    }
    for (const w of [...wires]) updateWire(w, dt);
    for (const c of [...clouds]) {
      if (t >= c.until) { endCloud(c); continue; }
      c.k = c.quick ? 1 : Math.min(1, (t - c.born) / CLOUD_GROW);
      const fade = Math.min(1, (c.until - t) / 1.5);
      c.mat.opacity = .8 * fade * Math.min(1, c.k * 1.5);
      const e = 1 - (1 - c.k) ** 2;
      for (const s of c.sprites) { s.scale.setScalar(s.userData.size * (.3 + .7 * e)); s.position.copy(s.userData.home).multiplyScalar(.4 + .6 * e); s.position.y += Math.sin(t * .6 + s.id) * 3; }
    }
    // Choking Cloud: every half second, once per zombie however many of your clouds it stands in
    const choke = aug('smoke.choke'), f = fx();
    if (choke && f && clouds.some(c => c.mine) && (chokeTick -= dt) <= 0) {
      chokeTick = .5;
      for (const z of [...enemies.list]) if (z.health > 0 && !elite(z) && clouds.some(c => c.mine && inside(c, z.root.position))) { f.slow(z, choke, 1); enemies.hurt(z, f.maxHp(z) * .0075, false, false, 'explosion'); }
    }
  });

  host.on('reset', () => {
    for (const f of flying) f.mesh.removeFromParent(); flying.length = 0;
    for (const w of [...wires]) removeWire(w, false);
    for (const m of [...mines]) removeMine(m, false);
    for (const c of [...clouds]) { c.mine = false; endCloud(c); }
    revealedUntil = 0;
  });

  kino.bo3eq = { flying: () => flying, mines: () => mines, wires: () => wires, clouds: () => clouds };   // debug handle (tests)

  // cheat: give them (tests)
  (function addCheat(tries = 0) {
    const ch = kino.cheats;
    if (!ch?.addCommand) { if (tries < 20) setTimeout(() => addCheat(tries + 1), 500); return; }
    ch.addCommand('bo3gear', { usage: 'bo3gear trip|smoke', text: 'Give the BO3 Trip Mines or Smoke Grenades', cheat: true, run: args => {
      const what = String(args?.[0] ?? '').toLowerCase();
      if (what.startsWith('trip')) { session.giveTrips(); return `Trip Mines x${session.trips}`; }
      if (what.startsWith('smoke')) { if (!kino.tactical?.give) return 'No tactical slot on this map'; kino.tactical.give('smoke_zm'); return 'Smoke Grenades'; }
      return 'Usage: bo3gear trip|smoke';
    } });
  })();
}
