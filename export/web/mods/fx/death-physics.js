// Physical deaths (2026-11-19). Every zombie died with the same clip on the spot, whatever killed it. The killing hit
// now pushes the body: it slides (or is thrown, by a blast) along the hit, stopped by walls and ledges, and its spine,
// neck, head and arms are kicked by a damped spring layered over the death clip, so a shotgun folds a zombie backwards,
// a headshot snaps the head and a rifle round only rocks it. The spring ends at rest: the clip's own pose is what stays.
// The clip falls one fixed way (measured once per clip, from where the head ends up), so the body also turns, by up to
// 63 degrees in the first .3 s, to fall along the hit instead of always to the zombie's own side.
//   direction  a bullet: the pellet's ray ('shot'); a blast: away from the blast ('effect', orange); a teammate's kill:
//              away from where the zombie faced; the rest: away from the camera
//   size       by weapon class (PUSH), shotguns by closeness, blasts by nearness, x kino.deathPhysics.scale
// Nothing is created per death but a small record: no materials, no lights, no shaders. The Thundergun throws its own
// bodies (thundergun/mod.js); a body something else moves is left to it. ?noDeathPhysics / kino.deathPhysics.enabled.
import * as THREE from 'three';
import { weaponClass } from '../weapon-levels/camo.js';

const PUSH = { 'Pistol': 55, 'Submachine gun': 60, 'Rifle': 85, 'Light machine gun': 105, 'Shotgun': 300, 'Sniper rifle': 260, 'Launcher': 320, 'Wonder weapon': 200, 'Death Machine': 110, 'Special': 120, 'Bow': 240, 'Melee': 120 };
const SPINE = [['j_spinelower', .25], ['j_spine4', .45], ['j_neck', .3], ['j_head', .5]], ARMS = ['j_shoulder_le', 'j_shoulder_ri'];
const KINDS = new Set(['zombie', 'dog', 'nova']), SKIP = /thunder/;
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);

export function setupDeathPhysics(api) {
  const { host, world, camera } = api, bodies = [], pending = [];
  const state = { enabled: !/[?&]noDeathPhysics\b/.test(location.search), scale: 1, bodies, last: null, count: 0 };
  (window.kino ??= {}).deathPhysics = state;
  let shot = null, blast = null;
  const fall = new WeakMap(), measuring = [], wrap = a => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));   // fall: death clip -> the yaw it falls towards, in the zombie's own frame
  const hurt = new WeakMap();
  host.on('shot', e => { if (e.hit) shot = { dir: e.direction.clone(), def: e.def, t: performance.now() }; });
  host.on('effect', e => { const c = e.color; if (e.position && e.count >= 12 && typeof c === 'number' && (c >> 16 & 255) > 200 && (c >> 8 & 255) > 120 && (c & 255) < 130) blast = { at: e.position.clone(), t: performance.now() }; });
  host.on('beforeEnemyDamage', e => { if (e.enemy) hurt.set(e.enemy, { cause: e.cause, melee: !!e.melee, head: !!e.head, remote: !!host.remoteDamage }); });
  host.on('kill', e => { const z = e.enemy; if (!state.enabled || !z?.root || !KINDS.has(z.kind) || z.noDeathPhysics) return; pending.push({ z, t: performance.now(), h: hurt.get(z) ?? { cause: e.melee ? 'melee' : 'bullet', melee: e.melee, head: e.head, remote: e.remote } }); });

  const ray = new THREE.Ray(), dir = new THREE.Vector3(), m4 = new THREE.Matrix4(), pq = new THREE.Quaternion(), dq = new THREE.Quaternion(), axis = new THREE.Vector3();
  // the push for one kill: direction (unit, level), speed along it, lift, and how hard the spine is kicked (radians)
  function impulse({ z, t, h }) {
    const p = z.root.position, session = api.session; let speed = 70, lift = 0;
    dir.copy(p).sub(camera.position).setY(0);
    const dist = dir.length(), near = blast && Math.abs(blast.t - t) < 120 ? blast.at.distanceTo(p) : Infinity;
    if (SKIP.test(h.cause)) return null;
    if (near < 420) { dir.copy(p).sub(blast.at).setY(0); const k = 1 - near / 420; speed = 90 + 170 * k; lift = 110 + 170 * k; }
    else if (h.remote) { const y = z.root.rotation.y; dir.set(-Math.sin(y), 0, -Math.cos(y)); speed = 90; }
    else if (h.melee || h.cause === 'melee') speed = session?.bowie ? 150 : PUSH.Melee;
    else if ((h.cause === 'bullet' || h.cause === 'explosion') && shot && Math.abs(shot.t - t) < 120) {
      const cls = weaponClass(shot.def); dir.copy(shot.dir).setY(0); speed = PUSH[cls] ?? 90;
      if (cls === 'Shotgun') speed *= THREE.MathUtils.clamp(1 - (dist - 100) / 700, .3, 1);
      if (h.cause === 'explosion') { speed = Math.max(speed, 260); lift = 160; }
    }
    if (dir.lengthSq() < 1e-6) { const y = z.root.rotation.y; dir.set(-Math.sin(y), 0, -Math.cos(y)); }
    dir.normalize(); speed *= state.scale; lift *= state.scale;
    return { speed: h.head ? speed * .7 : speed, lift, bend: THREE.MathUtils.clamp(speed / 420, .07, .62), head: h.head };
  }
  function start(k) {
    const i = impulse(k); if (!i) return; const z = k.z, root = z.root, spine = [], arms = [];
    if (z.kind === 'zombie') root.traverse(n => { if (n.userData.animationAnchor) return; const s = SPINE.find(b => b[0] === n.name);
      if (s) spine.push({ n, f: s[1] * (i.head ? (n.name === 'j_head' ? 2.2 : n.name === 'j_neck' ? 1.2 : .6) : 1), base: n.quaternion.clone(), wrote: n.quaternion.clone() });
      else if (ARMS.includes(n.name)) arms.push({ n, f: -.9, base: n.quaternion.clone(), wrote: n.quaternion.clone() }); });
    const clip = z.rig?.data?.death; let turn = 0;
    if (z.kind === 'zombie' && clip) { const f = fall.get(clip);
      if (f === undefined) { fall.set(clip, null); measuring.push({ z, clip, t: 0 }); }
      else if (f !== null) turn = THREE.MathUtils.clamp(wrap(Math.atan2(dir.x, dir.z) - f - root.rotation.y), -1.1, 1.1); }
    // how far the map keeps this zombie's root off the collision floor (navmesh heights differ a little from it): kept while it slides
    ray.origin.copy(root.position); ray.origin.y += 30; ray.direction.copy(DOWN); const g0 = world.raycast(ray, 0, 62), off = g0 ? THREE.MathUtils.clamp(g0.distance - 30, -32, 32) : 0;
    axis.crossVectors(UP, dir).addScaledVector(UP, (Math.random() - .5) * .7).normalize();
    const b = { z, root, v: dir.clone().multiplyScalar(i.speed), vy: i.lift, air: i.lift > 0, at: root.position.clone(), axis: axis.clone(), spine, arms, x: 0, xv: i.bend * 17, a: 0, av: i.bend * 11, t: 0, turn, turned: 0, off };
    bodies.push(b); state.count++; state.last = { speed: Math.round(i.speed), lift: Math.round(i.lift), bend: +i.bend.toFixed(2), dir: dir.toArray().map(v => +v.toFixed(2)), bones: spine.length + arms.length, turn: +turn.toFixed(2), off: +off.toFixed(1) };
  }
  // base * a rotation about a world axis; the mixer rewrites a bone only when its track value changes, so the last
  // value written here tells whether the bone still holds this layer's pose (then the kept clip pose is the base)
  function bend(list, ax, angle) {
    for (const s of list) { const n = s.n; if (!n.quaternion.equals(s.wrote)) s.base.copy(n.quaternion);
      if (Math.abs(angle) < 1e-4) { n.quaternion.copy(s.base); s.wrote.copy(s.base); continue; }
      pq.setFromRotationMatrix(m4.extractRotation(n.parent.matrixWorld)); dq.setFromAxisAngle(ax, angle * s.f);
      n.quaternion.copy(pq).invert().multiply(dq).multiply(pq).multiply(s.base); s.wrote.copy(n.quaternion); }
  }
  function move(b, dt) {
    const p = b.root.position;
    if (p.distanceToSquared(b.at) > 1) { b.v.set(0, 0, 0); b.air = false; b.moved = true; return; }   // something else moves this body: leave it alone
    const sp = Math.hypot(b.v.x, b.v.z);
    if (sp > 4) { const len = sp * dt; ray.origin.copy(p); ray.origin.y += 30; ray.direction.set(b.v.x / sp, 0, b.v.z / sp);
      if (world.raycast(ray, 0, len + 16)) b.v.set(0, 0, 0);
      else { const nx = p.x + b.v.x * dt, nz = p.z + b.v.z * dt;
        if (b.air) { p.x = nx; p.z = nz; }
        else { ray.origin.set(nx, p.y + 30, nz); ray.direction.copy(DOWN); const g = world.raycast(ray, 0, 62);
          if (g) { p.x = nx; p.z = nz; p.y += 30 - g.distance + b.off; } else b.v.set(0, 0, 0); } }   // no floor within 32 below: a ledge, stop there
      b.v.multiplyScalar(Math.exp(-(b.air ? .6 : 6.5) * dt)); }
    if (b.air) { b.vy -= 1400 * dt; const y0 = p.y; p.y += b.vy * dt;
      if (b.vy > 0) { ray.origin.copy(p); ray.origin.y = y0 + 60; ray.direction.copy(UP); if (world.raycast(ray, 0, p.y - y0 + 16)) { p.y = y0; b.vy = 0; } }   // a ceiling
      else { ray.origin.set(p.x, y0 + 30, p.z); ray.direction.copy(DOWN); const g = world.raycast(ray, 0, 30 + y0 - p.y - b.off);
        if (g) { p.y = y0 + 30 - g.distance + b.off; b.air = false; b.vy = 0; if (b.t > .2) window.kino?.fx?.knockback?.(p.clone()); } else if (b.t > 2) b.air = false; } }
    b.at.copy(p);
  }
  host.on('update', dt => {
    if (pending.length) { for (const k of pending.splice(0)) if (k.z.root?.parent) start(k); }
    if (!dt) return;
    for (let i = measuring.length - 1; i >= 0; i--) { const m = measuring[i]; if ((m.t += dt) < 1.7) continue; measuring.splice(i, 1); const r = m.z.root; let head = null;
      if (r?.parent && m.z.state === 'dead') r.traverse(n => { if (!head && n.name === 'j_head' && !n.userData.animationAnchor) head = n; });
      if (!head) { fall.delete(m.clip); continue; }
      dir.setFromMatrixPosition(head.matrixWorld).sub(r.position); if (Math.hypot(dir.x, dir.z) > 14) fall.set(m.clip, wrap(Math.atan2(dir.x, dir.z) - r.rotation.y)); }
    for (let i = bodies.length - 1; i >= 0; i--) { const b = bodies[i]; b.t += dt;
      if (!b.root.parent || b.z.state !== 'dead') { bodies.splice(i, 1); continue; }
      if (!b.moved && (b.air || b.v.lengthSq() > 16)) move(b, dt);
      if (b.turn && b.turned < 1) { const k = Math.min(1, b.t / .3), e = k * k * (3 - 2 * k); b.root.rotation.y += b.turn * (e - b.turned); b.turned = e; }
      for (let left = dt; left > 1e-5; left -= 1 / 120) { const h = Math.min(left, 1 / 120);
        b.xv += (-95 * b.x - 9 * b.xv) * h; b.x += b.xv * h; b.av += (-42 * b.a - 6.5 * b.av) * h; b.a += b.av * h; }
      const done = b.t > 1.6 || (b.t > .5 && Math.abs(b.x) < .004 && Math.abs(b.xv) < .05 && Math.abs(b.a) < .006 && Math.abs(b.av) < .06);
      bend(b.spine, b.axis, done ? 0 : b.x); bend(b.arms, b.axis, done ? 0 : b.a);
      if (done && !b.air && b.v.lengthSq() <= 16) bodies.splice(i, 1); else if (done) { b.x = b.xv = b.a = b.av = 0; }
    }
  });
  host.on('reset', () => { bodies.length = 0; pending.length = 0; measuring.length = 0; });
  return state;
}
