// Ray Gun Mk3 (GKZ-45 Mk3; Pack-a-Punched: Maelstrom of Eris), Gorod Krovi's box wonder weapon, built by
// .tools/build_bo3_weapons.py (def.mk3). Behaviour after BO3's _zm_weap_raygun_mark3 (our own code and numbers):
// - right gun (Mark III): a fast hitscan beam (the engine's own shot, def.damage), drawn here as a green bolt;
// - left gun (GKZ-45, def.clipLeft / fireTimeLeft): a slow lobbed shot. A zombie it hits is slowed (0.7 for 2 s,
//   Pack-a-Punched 0.5 for 3 s); where it lands it opens a vortex orb for 3 s that pulls nearby zombies in and holds
//   them, pulsing every 0.5 s within 128 (50 damage, 100 Pack-a-Punched);
// - a right-gun beam through the orb charges it: another 3 s, pulses of 1000 (5000 Pack-a-Punched), and a zombie
//   whose health is at or under that is disintegrated.
// Sounds are BO3's from zm_stalingrad's bank (built.sounds.mod.bo3_raygun_mk3.extra); effects are sprites and the
// fx mod's pooled particles, no lights (lighting.md: the light count is in every program's key).
import * as THREE from 'three';

const TUNE = {
  base: { direct: 1500, pulse: 50, charged: 1000, slow: .7, slowT: 2, color: 0x7dff6a, hot: 0xd8ffd0 },
  pap: { direct: 3500, pulse: 100, charged: 5000, slow: .5, slowT: 3, color: 0xff5ad2, hot: 0xffd8f4 },
};
const SPEED = 1300, LIFT = 140, GRAVITY = 900, FLIGHT = 2.5;   // the lobbed shot: units/s, upward kick, fall, longest flight
const ORB_LIFE = 3, PULSE = .5, RADIUS = 128, HOLD = .12, PULL = 70, CHARGE_HIT = 34, MAX_ORBS = 6;

export const isMk3Def = (data, def) => !!(def?.mk3 || data.weapons[def?.baseId ?? def?.id]?.mk3);

export function setupMk3(api, { play, sounds }) {
  const { host, session, camera, scene, world, enemies, data, view, viewCamera } = api;
  const isMk3 = def => isMk3Def(data, def);
  const X = sounds?.extra ?? {}, now = () => session.time ?? performance.now() / 1000;
  const tune = def => (def?.upgraded || session.weapon?.upgraded) ? TUNE.pap : TUNE.base;
  const alive = z => enemies.list.includes(z) && z.health > 0;

  // ---- looks: a shared glow texture, the orb (core + glow + swirl ring), the beam ---------------------------------
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.22, 'rgba(255,255,255,.8)'); gr.addColorStop(.55, 'rgba(255,255,255,.2)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const swirlTex = (() => {   // a few curved arms: the vortex turning
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.translate(64, 64);
    for (let a = 0; a < 4; a++) { g.rotate(Math.PI / 2); g.beginPath(); for (let t = 0; t <= 1; t += .04) { const r = 10 + 50 * t, th = t * 2.4; g.lineTo(r * Math.cos(th), r * Math.sin(th)); }
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 5; g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const add = (o = {}) => ({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, ...o });
  const coreGeo = new THREE.IcosahedronGeometry(1, 2);
  const mats = {};
  for (const [k, t] of Object.entries(TUNE)) mats[k] = {
    core: new THREE.MeshBasicMaterial(add({ color: t.hot, opacity: .95 })),
    glow: new THREE.SpriteMaterial(add({ map: glowTex, color: t.color })),
    swirl: new THREE.SpriteMaterial(add({ map: swirlTex, color: t.color, opacity: .8 })),
  };
  function orbVisual(m) {
    const g = new THREE.Group(), core = new THREE.Mesh(coreGeo, m.core), glow = new THREE.Sprite(m.glow), swirl = new THREE.Sprite(m.swirl.clone());
    core.scale.setScalar(5); glow.scale.setScalar(40); swirl.scale.setScalar(70); g.add(core, glow, swirl); g.frustumCulled = false;
    for (const c of g.children) c.frustumCulled = false;
    return { g, core, glow, swirl };
  }
  // the beam: a thin additive box from the right gun's barrel to the hit, a short flash
  const beamGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, .5), beams = [];
  const beamMat = { base: new THREE.MeshBasicMaterial(add({ color: TUNE.base.color, opacity: .9 })), pap: new THREE.MeshBasicMaterial(add({ color: TUNE.pap.color, opacity: .9 })) };
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(beamGeo, beamMat.base); m.visible = false; m.frustumCulled = false; scene.add(m); beams.push({ m, t: 0 }); }
  // warm-up: the orb's and the beam's programs compile while loading (host.warmObjects), both colours
  const warm = new THREE.Group(); for (const k of Object.keys(TUNE)) { const v = orbVisual(mats[k]); warm.add(v.g); const b = new THREE.Mesh(beamGeo, beamMat[k]); warm.add(b); }
  warm.position.set(0, -1e5, 0); scene.add(warm); host.warmObjects?.push(warm);
  host.on('start', () => warm.removeFromParent());

  // the barrel on screen (the guns have their own camera): a tag projected out into the world, 30 ahead of the eye
  const muzzle = left => {
    const g = left ? view?.leftGun : view?.gun, flash = g?.getObjectByName(left ? 'tag_flash_le' : 'tag_flash') ?? g?.getObjectByName('tag_flash');
    if (flash && viewCamera) {
      flash.updateWorldMatrix(true, false); const ndc = flash.localToWorld(new THREE.Vector3()).project(viewCamera);
      const dir = new THREE.Vector3(ndc.x, ndc.y, .5).unproject(camera).sub(camera.position).normalize();
      return camera.position.clone().addScaledVector(dir, 30);
    }
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), down = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).negate();
    return camera.position.clone().addScaledVector(right, left ? -4 : 4).addScaledVector(down, 3);
  };

  // ---- sounds (positional by distance at the start, like the mod's other sounds) ---------------------------------
  const snd = (key, o) => X[key] ? play(X[key], o) : Promise.resolve(null);
  const stop = h => h?.then(x => { try { x?.src.stop(); } catch { } });

  // ---- slowing and holding zombies: one speed factor per zombie, the strongest wins, undone when it runs out --------
  const held = new Map();   // zombie -> { f, until }
  function slow(z, f, t) {
    if (!alive(z)) return;
    const h = held.get(z), until = now() + t;
    if (!h) { z.speed *= f; held.set(z, { f, until }); return; }
    if (f < h.f) { z.speed = z.speed / h.f * f; h.f = f; }
    h.until = Math.max(h.until, until);
  }
  function release(z, h) { if (enemies.list.includes(z)) z.speed /= h.f; held.delete(z); }

  // ---- the left gun's shot ---------------------------------------------------------------------------------------
  const shots = [], orbs = [];
  host.fireHooks ??= [];
  host.fireHooks.push((def, forward) => {
    if (!isMk3(def) || session.lastHand !== 'left') return false;   // the right gun: the engine's hitscan (beam drawn on 'shot')
    const t = tune(def), from = muzzle(true), v = forward.clone().multiplyScalar(SPEED); v.y += LIFT;
    const m = orbVisual(mats[t === TUNE.pap ? 'pap' : 'base']); m.g.scale.setScalar(.35); m.g.position.copy(from); scene.add(m.g);
    shots.push({ pos: from, vel: v, life: FLIGHT, t, vis: m });
    snd('wpn_mk3_lh_act', { gain: .5 });
    return true;
  });
  const touches = (z, p, r) => {
    const tall = z.kind === 'dog' ? 34 : 72, body = z.kind === 'dog' ? 12 : 15, f = z.root.position;
    const dx = p.x - f.x, dz = p.z - f.z, dy = p.y < f.y ? f.y - p.y : p.y > f.y + tall ? p.y - f.y - tall : 0;
    return dx * dx + dz * dz + dy * dy < (r + body) ** 2;
  };
  function land(s, p, normal) {
    s.vis.g.removeFromParent();
    const at = p.clone().addScaledVector(normal ?? new THREE.Vector3(0, 1, 0), 32);
    // like BO3: the orb floats 32 off what it hit; a shot that lands on a floor sits at chest height
    if (orbs.length >= MAX_ORBS) endOrb(orbs[0]);
    const vis = orbVisual(mats[s.t === TUNE.pap ? 'pap' : 'base']); vis.g.position.copy(at); vis.g.scale.setScalar(.01); scene.add(vis.g);
    const o = { at, t: s.t, vis, life: ORB_LIFE, next: PULSE, charged: false, age: 0, loop: snd('wpn_mk3_orb_loop', { gain: .55, at, loop: true }) };
    orbs.push(o); snd('wpn_mk3_orb_creation_00', { gain: .8, at });
    window.kino?.fx?.emit({ key: 'glow', at: at.clone(), size: [20, 150], life: .35, fade: [.02, .8], additive: true, color: s.t.color });
  }
  function endOrb(o) {
    const i = orbs.indexOf(o); if (i < 0) return; orbs.splice(i, 1);
    stop(o.loop); snd('wpn_mk3_orb_disappear', { gain: .7, at: o.at });
    o.vis.g.removeFromParent(); o.vis.swirl.material.dispose();
    window.kino?.fx?.emit({ key: 'glow', at: o.at.clone(), size: [60, 4], life: .3, fade: [.01, .9], additive: true, color: o.t.color });
  }
  function charge(o) {   // a right-gun beam through the orb (BO3: the orb's type 2)
    if (o.charged) return;
    o.charged = true; o.life = ORB_LIFE; o.next = 0; o.vis.core.visible = false;
    stop(o.loop); o.loop = snd('wpn_mk3_orb_activated_loop', { gain: .65, at: o.at, loop: true });
    const fx = window.kino?.fx; fx?.emit({ key: 'glow', at: o.at.clone(), size: [40, 260], life: .4, fade: [.02, .8], additive: true, color: o.t.hot });
    fx?.flash?.(o.at.clone(), { color: o.t.color, intensity: 4, radius: 500, life: .4 });
  }
  function pulse(o) {
    const dmg = o.charged ? o.t.charged : o.t.pulse, fx = window.kino?.fx; let hit = 0;
    for (const z of [...enemies.list]) {
      const c = z.root.position.clone(); c.y += z.kind === 'dog' ? 18 : 40;
      if (c.distanceTo(o.at) > RADIUS || !world.lineClear(o.at, c)) continue;
      hit++;
      if (o.charged && z.health <= dmg) {   // disintegrated: a flash of the orb's colour where it stood
        fx?.emit({ key: 'glow', at: c.clone(), size: [30, 90], life: .3, fade: [.02, .8], additive: true, color: o.t.hot });
        for (let i = 0; i < 8; i++) fx?.emit({ key: 'glow', at: c.clone().add(fx.jitter(14)), vel: fx.jitter(140).setY(60 + Math.random() * 120), size: [6, 1], life: .5 + Math.random() * .3, fade: [.02, .6], additive: true, color: o.t.color, drag: 1.5 });
        enemies.hurt(z, z.health + 1, false, false, 'explosion');
      } else enemies.hurt(z, dmg, false, false, 'explosion');
    }
    if (hit) snd('wpn_orb_damage_0' + Math.floor(Math.random() * 4), { gain: o.charged ? .8 : .45, at: o.at });
  }

  // ---- the right gun: draw its beam, charge an orb it passes through -----------------------------------------------
  host.on('shot', e => {
    if (!isMk3(e.def) || e.hand === 'left') return;
    const t = tune(e.def), from = muzzle(false), end = e.origin.clone().addScaledVector(e.direction, Math.min(e.distance, 6000));
    const b = beams.find(x => !x.m.visible) ?? beams[0];
    b.m.material = beamMat[t === TUNE.pap ? 'pap' : 'base']; b.m.position.copy(from); b.m.lookAt(end);
    b.m.scale.set(1.4, 1.4, from.distanceTo(end)); b.m.visible = true; b.t = .07;
    window.kino?.fx?.emit({ key: 'glow', at: end.clone(), size: [16, 4], life: .15, fade: [.01, .9], additive: true, color: t.color });
    const ray = new THREE.Ray(e.origin, e.direction), p = new THREE.Vector3();
    for (const o of orbs) {
      const along = o.at.clone().sub(e.origin).dot(e.direction);
      if (along < 0 || along > e.distance + CHARGE_HIT) continue;
      if (ray.closestPointToPoint(o.at, p).distanceTo(o.at) < CHARGE_HIT) charge(o);
    }
  });
  // slowed by a direct hit, also from the right gun's beam? No: BO3 slows only on the left gun's impact

  // ---- the frame ---------------------------------------------------------------------------------------------------
  host.on('update', dt => {
    if (!dt) return;
    const t0 = now();
    for (const b of beams) if (b.m.visible && (b.t -= dt) <= 0) b.m.visible = false;
    for (const s of [...shots]) {
      s.life -= dt; s.vel.y -= GRAVITY * dt;
      const step = s.vel.clone().multiplyScalar(dt), len = step.length(), dir = step.clone().divideScalar(len || 1);
      const wall = world.raycast(new THREE.Ray(s.pos.clone(), dir), 0, len + 4);
      const span = wall ? wall.distance : len; let done = false;
      for (let k = 1, n = Math.max(1, Math.ceil(span / 12)); k <= n && !done; k++) {
        const p = s.pos.clone().addScaledVector(dir, span * k / n);
        for (const z of enemies.list) if (touches(z, p, 6)) {
          const head = false; enemies.hurt(z, s.t.direct, head, false, 'bullet'); slow(z, s.t.slow, s.t.slowT);
          land(s, p, dir.clone().negate().setY(.4).normalize()); done = true; break;
        }
      }
      if (!done && wall) {
        let n = wall.face?.normal && wall.object ? wall.face.normal.clone().transformDirection(wall.object.matrixWorld) : dir.clone().negate();
        if (n.dot(dir) > 0) n.negate();
        land(s, wall.position ?? wall.point ?? s.pos.clone().addScaledVector(dir, wall.distance), n); done = true;
      }
      if (done) { shots.splice(shots.indexOf(s), 1); continue; }
      s.pos.addScaledVector(dir, len);
      if (s.life <= 0) { land(s, s.pos, new THREE.Vector3(0, 0, 0)); shots.splice(shots.indexOf(s), 1); continue; }
      s.vis.g.position.copy(s.pos);   // the shot starts at the left barrel (muzzle), so it is drawn where it flies
      s.vis.swirl.material.rotation += dt * 9;
      if (Math.random() < .5) window.kino?.fx?.emit({ key: 'glow', at: s.pos.clone(), size: [8, 1], life: .25, fade: [.01, .8], additive: true, color: s.t.color, opacity: .6 });
    }
    for (const o of [...orbs]) {
      o.age += dt; o.life -= dt;
      const grow = Math.min(1, o.age / .25), k = o.charged ? 1.6 : 1;
      o.vis.g.scale.setScalar(grow * k * (1 + Math.sin(o.age * 14) * .06));
      o.vis.swirl.material.rotation += dt * (o.charged ? 14 : 6);
      o.vis.glow.material.opacity = o.charged ? 1 : .85;
      // pull and hold: zombies in reach drift to the orb and stand nearly still while it lasts
      for (const z of enemies.list) {
        const f = z.root.position, dx = o.at.x - f.x, dz = o.at.z - f.z, d = Math.hypot(dx, dz);
        if (d > RADIUS || Math.abs(o.at.y - 40 - f.y) > 110) continue;
        slow(z, HOLD, .35);
        if (d > 14) { const m = Math.min(d - 14, PULL * dt) / d, to = f.clone(); to.x += dx * m; to.z += dz * m;
          if (world.lineClear(f.clone().setY(f.y + 30), to.clone().setY(to.y + 30))) f.copy(to); }
      }
      if ((o.next -= dt) <= 0) { o.next += PULSE; pulse(o); }
      if (o.life <= 0) endOrb(o);
    }
    for (const [z, h] of held) if (h.until <= t0 || !enemies.list.includes(z)) release(z, h);
  });
  if (window.kino) window.kino.mk3 = { shots, orbs, held, charge, TUNE };   // for tests and the console
  host.on('reset', () => {
    for (const s of shots) s.vis.g.removeFromParent(); shots.length = 0;
    for (const o of [...orbs]) endOrb(o);
    for (const [z, h] of [...held]) release(z, h);
  });
}
