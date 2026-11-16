// The Mangler (BO3's raz, zm_stalingrad: zm_ai_raz.gsc / raz.gsc; numbers in scratch/gk/spec/bosses.md §2).
//   Health 5500 + 100 a round (5500-15000) × (1 + 0.15 per extra player). Armour pools, as a share of its health: the
//   arm cannon 15%, helmet 30%, left shoulder 25%, chest 40%, each thigh 25%. A bullet on an armoured part does a
//   tenth to its health and drains the part's pool; when a pool runs out that piece flies off (pain clip) and the spot
//   takes full damage. Splash skips the armour. Insta-kill kills only through the right forearm, and on the cannon
//   it destroys the cannon instead.
//   Cannon destroyed: an arm blast (players within 128: int(35 × (1 − d²/16384)) + 15, zombies 50% → 25% of its
//   health), its health drops to a quarter (or by a third), then it sprints and fights with its blade.
//   Attacks: melee within 75 in a 45° cone (gibs zombies within 90 on the swing); the arm cannon torpedo from 150 to
//   1,200 with a clear line from the muzzle, every 3 s at most: 500 u/s, turns at most 13.5° per 0.1 s, at most 1,200
//   units, blows up within 64 of its target or on a surface (128: 100 → 50, pushes grounded players within 100 by
//   200-500, smashes window boards within 100). After 90 s alive it sprints.
import { THREE, V, rand, Rig, cloneSkinned, attachPart, prepBody, hideBone, loadSet } from './boss-common.js';
import { RAZ_SPOTS } from './boss-data.js';

const MODELS = ['c_zom_dlc3_raz_fb', 'c_zom_dlc3_raz_cannon_arm', 'c_zom_dlc3_raz_s_armcannon', 'c_zom_dlc3_raz_s_cannonpowercore', 'c_zom_dlc3_raz_s_helmet',
  'c_zom_dlc3_raz_s_leftshoulderpad', 'c_zom_dlc3_raz_s_leftthighpad', 'c_zom_dlc3_raz_s_rightthighpad', 'c_zom_dlc3_raz_s_chestplate'];
// hit location by the nearest bone segment (BO3's hitboxes): armoured parts and the plain ones around them
const SEGS = [['head', 'j_neck', 'j_head'], ['head', 'j_head', 'j_helmet'], ['chest', 'j_mainroot', 'j_spineupper'], ['chest', 'j_spineupper', 'j_spine4'], ['chest', 'j_spine4', 'j_neck'],
  ['gun', 'j_shoulder_ri', 'j_elbow_ri'], ['rlow', 'j_elbow_ri', 'j_wrist_ri'], ['shoulder', 'j_clavicle_le', 'j_shoulder_le'], ['shoulder', 'j_shoulder_le', 'j_elbow_le'],
  ['larm', 'j_elbow_le', 'j_wrist_le'], ['thighL', 'j_hip_le', 'j_knee_le'], ['thighR', 'j_hip_ri', 'j_knee_ri'], ['leg', 'j_knee_le', 'j_ankle_le'], ['leg', 'j_knee_ri', 'j_ankle_ri']];
const SEG_R = { head: 10, chest: 18, gun: 13, shoulder: 10, thighL: 10, thighR: 10 }, _onRay = new THREE.Vector3();   // limb radii for the ray test
const ARMOUR = { gun: .15, head: .30, shoulder: .25, chest: .40, thighL: .25, thighR: .25 };
// what each piece hides (materials of the body) and throws (its debris model, from which bone), and its pain clip
const PIECES = {
  head: { mats: ['raz_helmet'], debris: 'c_zom_dlc3_raz_s_helmet', at: 'j_helmet', pain: 'pain_head' },
  shoulder: { mats: ['raz_shoulder_lt'], debris: 'c_zom_dlc3_raz_s_leftshoulderpad', at: 'j_shoulder_le', pain: 'pain_shoulder' },
  chest: { mats: ['raz_vest'], debris: 'c_zom_dlc3_raz_s_chestplate', at: 'j_spine4', pain: 'pain_chest' },
  thighL: { mats: ['raz_thigh_lt'], debris: 'c_zom_dlc3_raz_s_leftthighpad', at: 'j_hip_le', pain: 'pain_leg_l' },
  thighR: { mats: ['raz_thigh_rt'], debris: 'c_zom_dlc3_raz_s_rightthighpad', at: 'j_hip_ri', pain: 'pain_leg_r' },
};
const segDist = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-6, ab.lengthSq()))); return a.clone().addScaledVector(ab, t).distanceTo(p); };

export function setupRaz(K) {
  const { world, session, scene, enemies, gk } = K;
  let S = null;
  const ready = loadSet('raz', MODELS).then(s => { S = s.models.c_zom_dlc3_raz_fb ? s : null; if (S) { const w = build(V(), 0, true); w.root.removeFromParent(); K.host.warmObjects.push(w.root); } return S; });
  const spots = Object.entries(RAZ_SPOTS).flatMap(([zone, l]) => l.map(([x, y, z, yaw]) => ({ p: V(x, y, z), yaw: yaw * Math.PI / 180, zone })));

  function build(at, yaw, mirror = false) {
    const root = new THREE.Group(); root.name = 'raz'; const body = cloneSkinned(S.models.c_zom_dlc3_raz_fb); root.add(body);
    const cannon = S.models.c_zom_dlc3_raz_cannon_arm ? attachPart(body, cloneSkinned(S.models.c_zom_dlc3_raz_cannon_arm), 'j_shoulder_ri') : [];
    const bones = prepBody(root), byMat = new Map();
    body.traverse(o => { if (!o.isMesh) return; const n = ([o.material].flat()[0]?.name ?? '').replace('mtl_c_zom_dlc3_rus_', ''); if (!byMat.has(n)) byMat.set(n, []); byMat.get(n).push(o); });
    const z = { kind: 'raz', root, bones, byMat, cannon, speed: 0, state: mirror ? 'chase' : 'intro', hit: { r: 24, h: 88, head: 11 }, cool: { shoot: 2, melee: 0 }, act: null, gunOff: false, broken: new Set() };
    const rig = z.rig = new Rig(root, (n, clip) => note(z, n, clip));
    for (const [k, d] of Object.entries(S.A)) if (d) rig.add(k, d);
    const death = S.A[Math.random() < .5 ? 'death' : 'death_b'] ?? S.A.death; if (death) rig.add('death', death);
    root.position.copy(at); root.rotation.y = yaw; scene.add(root); rig.play(mirror ? 'walk' : 'enrage', mirror); rig.update(.01);
    return z;
  }
  function play(z, k, loop = true, speed = 1) { if (z.act === k && loop) return; z.act = k; z.rig.play(k, loop, speed, .15); }

  const health = () => { const r = session.round ?? 1; return Math.round(Math.min(15000, Math.max(5500, 5500 + 100 * r)) * (1 + .15 * (K.playerCount() - 1))); };
  // a spawn spot in an active zone, near a player but not on top of them
  function pickSpot() {
    const zones = K.zones(), ps = K.players().filter(q => !q.down).map(q => q.pos);
    const dist = s => Math.min(...ps.map(p => p.distanceTo(s.p)));
    const ok = spots.filter(s => zones.has(s.zone) && dist(s) > 350);
    const near = ok.filter(s => dist(s) < 2000);
    const pool = near.length ? near : ok.sort((a, b) => dist(a) - dist(b)).slice(0, 3);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }
  function spawn({ at = null, yaw = null, count = true, points = true, extra = {} } = {}) {
    if (!S) return null;
    let sp = at ? { p: at.clone(), yaw: yaw ?? 0 } : pickSpot(); if (!sp) return null;
    const g = K.ground(sp.p), z = build(g, sp.yaw ?? 0);
    const hp = health();
    Object.assign(z, { health: hp, maxHealth: hp, pools: Object.fromEntries(Object.entries(ARMOUR).map(([k, f]) => [k, hp * f])), points, ...extra });
    z.ai = (dt, pl) => think(z, dt, pl);
    K.enlist(z, { count });
    K.sfxAt('raz_spawn_short', g, .9); z.introUntil = (S.index.enrage?.duration ?? 1.7);
    gk.emit('boss:spawn', 'raz', z);
    return z;
  }
  const mirror = p => { if (!S) return null; const z = build(K.ground(p), 0, true); z.health = z.maxHealth = 1e6; z.special = true; z.id = ++enemies.serial; z.path = []; z.pathIndex = 0; z.repath = 0; z.lastPosition = z.root.position.clone(); enemies.list.push(z); return z; };

  // ---- brain
  function think(z, dt, pl) {
    z.t += dt; for (const k in z.cool) z.cool[k] -= dt;
    // ee.js (the main Easter egg's kited Mangler): z.ee(z, dt) -> null = its own brain, false = hold, {at, run} = walk there
    if (z.ee) { const g = z.ee(z, dt); if (g === false) return; if (g) { const k = g.run ? 'sprint' : 'walk'; play(z, k); K.walkTo(z, g.at, S.index[k]?.speed || (g.run ? 170 : 64), dt); return; } }
    if (!z.target || (z.retarget = (z.retarget ?? 0) - dt) <= 0) { z.retarget = 1; z.target = K.nearest(z.root.position); }
    const tp = K.posOf(z.target.id) ?? pl, pos = z.root.position, dist = pos.distanceTo(tp);
    if (z.state === 'intro') { K.face(z.root, tp); if (z.t >= z.introUntil) { z.state = 'chase'; z.repath = 0; } return; }
    if (z.state === 'busy') { z.busyTick?.(dt); if (z.t >= z.busyUntil) { z.state = 'chase'; z.repath = 0; z.busyTick = null; } return; }
    if (!z.berserk && z.t > 90) z.berserk = true;
    const eye = tp.clone().add(V(0, 48, 0)), seen = K.clear(pos.clone().add(V(0, 70, 0)), eye);
    const facing = K.fwd(z.root).dot(tp.clone().sub(pos).setY(0).normalize());
    // melee: 75 in front (a little more reach while it turns into the swing)
    if (dist < 85 && seen && z.cool.melee <= 0) {
      const k = z.gunOff ? ['sickle_lr', 'sickle_rl', 'sickle_down'][Math.floor(Math.random() * 3)] : z.berserk || z.sprinting ? 'sprint_attack' : ['swing_lr', 'swing_rl', 'double'][Math.floor(Math.random() * 3)];
      K.sfxAt('raz_melee_start', pos, .7);
      return busy(z, k, dt2 => K.turn(z.root, K.yawTo(pos, K.posOf(z.target.id) ?? tp), 4, dt2), 1.2);
    }
    // the arm cannon
    if (!z.gunOff && dist > 150 && dist < 1200 && z.cool.shoot <= 0 && !z.target?.down) {
      const muzzle = K.boneAt(z, 'tag_flash') ?? pos.clone().add(V(0, 60, 0));
      if (facing > .6 && K.clear(muzzle, eye)) { K.sfxAt('raz_raz_gun_charge', pos, .8); return busy(z, 'shoot', dt2 => K.turn(z.root, K.yawTo(pos, K.posOf(z.target.id) ?? tp), 3, dt2), 3); }
    }
    // chase
    const run = z.berserk || z.gunOff, k = run ? 'sprint' : 'walk'; z.sprinting = run;
    play(z, k); const speed = S.index[k]?.speed || (run ? 170 : 64);
    const w = K.walkTo(z, tp, speed, dt);
    if (dist < 120) K.turn(z.root, K.yawTo(pos, tp), 5, dt);
    // stuck or left far behind: back in at a spot near the players (BO3 cleans up a raz past 2,500)
    z.away = (w.lost && dist > 200) || dist > 2500 ? (z.away ?? 0) + dt : 0;
    if (z.away > 6) { z.away = 0; const sp = pickSpot(); if (sp) { pos.copy(K.ground(sp.p)); z.path = []; z.repath = 0; } }
  }
  function busy(z, k, tick, cool) {
    z.state = 'busy'; play(z, k, false); z.busyUntil = z.t + (S.index[k]?.duration ?? 1.5) * .95; z.busyTick = tick;
    if (k === 'shoot') z.cool.shoot = cool + (S.index.shoot?.duration ?? 2); else z.cool.melee = cool;
  }
  function note(z, n, clip) {
    if (!z.ai || z.health <= 0) return;
    const pos = z.root.position;
    if (n === 'melee_fire') {
      K.sfxAt(z.gunOff ? 'raz_melee_start' : K.pick('raz_gunhand_melee', 4), pos, .8);
      const f = K.fwd(z.root);
      K.playersNear(pos.clone().add(V(0, 40, 0)), 105, (id, d, q) => { const to = q.clone().sub(pos).setY(0); if (to.length() < 30 || to.normalize().dot(f) > .6) K.hitPlayer(id, 75, 'raz'); });
      for (const o of [...enemies.list]) if (!o.special && o !== z && o.root.position.distanceTo(pos) < 90 && Math.abs(o.root.position.y - pos.y) < 50) enemies.hurt(o, o.health + 1, false, true, 'explosion', false);   // gibs zombies in the way
    }
    if (/muz_flash/.test(n) && !z.gunOff) fire(z);
  }

  // ---- the arm cannon torpedo
  function fire(z) {
    const muzzle = K.boneAt(z, 'tag_flash') ?? z.root.position.clone().add(V(0, 60, 0)), tid = z.target?.id;
    const tp = (K.posOf(tid) ?? z.root.position).clone().add(V(0, 48, 0));
    // launched inside a cos 0.7 cone around where it faces
    let dir = tp.clone().sub(muzzle).normalize(); const f = K.fwd(z.root); if (dir.dot(f) < .7) dir = f.clone().lerp(dir, .5).normalize();
    K.sfxAt(K.pick('raz_fire', 4), muzzle, .9); K.sfxAt(K.pick('raz_pulse', 4), muzzle, .5);
    let travelled = 0; const ray = new THREE.Ray();
    const shot = K.sprite('orange', muzzle, 22, { life: 4 });
    const trail = [];
    shot.tick = dt => {
      const p = shot.o.position, goal = (K.posOf(tid) ?? tp).clone().add(V(0, 48, 0));
      const want = goal.clone().sub(p).normalize(), ang = dir.angleTo(want), max = 2.356 * dt;   // 13.5° per 0.1 s
      if (ang > 1e-4) dir.lerp(want, Math.min(1, max / ang)).normalize();
      const step = 500 * dt; ray.set(p, dir);
      const wall = world.raycast(ray, 0, step + 4);
      if (wall?.position) { p.copy(wall.position).addScaledVector(dir, -6); return blow(z, p, shot); }
      p.addScaledVector(dir, step); travelled += step;
      if (p.distanceTo(goal) < 64 || travelled > 1200) return blow(z, p, shot);
      if ((trail.t = (trail.t ?? 0) - dt) <= 0) { trail.t = .03; K.sprite('orange', p, 12, { life: .3, fade: true, grow: -20 }); }
    };
  }
  function blow(z, p, shot) {
    shot.life = 0; K.boom(p, .7); K.sfxAt(K.pick('raz_imp', 4), p, 1);
    K.playersNear(p, 128, (id, d) => K.hitPlayer(id, 100 - 50 * d / 128, 'raz:blast'));
    if (K.meIn(p, 100) && K.player.onFloor !== false) K.shove(K.player.getFeetPosition().clone().sub(p), rand(200, 500));
    for (const b of world.barriers ?? []) if (b.count > 0 && b.inside && b.inside.distanceTo(p) < 100) world.setBoards?.(b, 0);
  }

  // ---- damage: armour, the cannon, insta-kill
  function partOf(z, p) {
    if (!p) return null;
    z.root.updateMatrixWorld(true);
    let best = null, bd = Infinity, first = null, ft = Infinity; const ray = K.hitRay(z);   // the bullet's line (the hit point is only on the body box's face)
    for (const [part, a, b] of SEGS) {
      const A = K.boneAt(z, a), B = K.boneAt(z, b); if (!A || !B) continue;
      const d = ray ? Math.sqrt(ray.distanceSqToSegment(A, B, _onRay)) : segDist(p, A, B);
      if (ray && d < (SEG_R[part] ?? 8)) { const sc = d + .08 * _onRay.distanceTo(ray.origin); if (sc < ft) { ft = sc; first = part; } }   // nearest the line, the nearer limb winning a near-tie (it covers the one behind)
      if (d < bd) { bd = d; best = part; }
    }
    return first ?? best;
  }
  function breakPiece(z, part) {
    if (z.broken.has(part)) return; z.broken.add(part);
    const pc = PIECES[part]; if (!pc) return;
    for (const m of pc.mats ?? []) for (const o of z.byMat.get(m) ?? []) o.visible = false;
    for (const b of pc.bones ?? []) hideBone(z.bones.get(b));
    const at = K.boneAt(z, pc.at) ?? z.root.position.clone().add(V(0, 60, 0));
    K.debris(S.models[pc.debris], at, K.fwd(z.root).multiplyScalar(-rand(60, 140)).add(V(rand(-60, 60), rand(200, 300), rand(-60, 60))));
    K.sfxAt(K.pick('raz_imp', 4), at, .5);
    gk.emit('raz:part', { z, part });   // 'head' = the mask (BO3 raz_mask_destroyed: challenge 1_5)
    if (z.state !== 'busy' && S.A[pc.pain]) { z.state = 'busy'; play(z, pc.pain, false); z.busyUntil = z.t + (S.index[pc.pain]?.duration ?? 1.5) * .9; z.busyTick = null; }
  }
  function loseGun(z) {
    if (z.gunOff) return; z.gunOff = true; z.pools.gun = 0;
    for (const m of z.cannon) if (/cannon/.test([m.material].flat()[0]?.name ?? '')) m.visible = false;   // the arm stays, the cannon goes
    for (const o of z.byMat.get('raz_shoulder_rt') ?? []) o.visible = false;
    const at = K.boneAt(z, 'j_elbow_ri') ?? z.root.position.clone().add(V(0, 60, 0)), out = K.fwd(z.root).cross(V(0, 1, 0)).multiplyScalar(-120);
    K.debris(S.models.c_zom_dlc3_raz_s_armcannon, at, out.clone().add(V(0, 260, 0)));
    K.debris(S.models.c_zom_dlc3_raz_s_cannonpowercore, at, out.clone().multiplyScalar(.6).add(V(rand(-50, 50), 300, rand(-50, 50))));
    // stand-in for the right shoulder pad (c_zom_dlc3_raz_s_rightshoulderpad isn't exported): the left one, mirrored
    const pad = K.debris(S.models.c_zom_dlc3_raz_s_leftshoulderpad, K.boneAt(z, 'j_shoulder_ri') ?? at, out.clone().add(V(0, 320, 0))); if (pad) pad.o.scale.x = -1;
    K.boom(at, .6); K.sfx(K.pick('raz_imp', 4), 1);
    K.playersNear(at, 128, (id, d) => K.hitPlayer(id, Math.floor(35 * (1 - d * d / 16384)) + 15, 'raz:blast'));
    for (const o of [...enemies.list]) { if (o.special || o === z) continue; const d = o.root.position.distanceTo(at); if (d < 128) enemies.hurt(o, z.maxHealth * (.5 - .25 * d / 128), false, false, 'explosion', false); }
    z.health = z.health > z.maxHealth * .25 ? z.maxHealth * .25 : Math.max(1, z.health - z.maxHealth * .33);
    z.berserk = true;
    if (S.A.pain_gun) { z.state = 'busy'; play(z, 'pain_gun', false); z.busyUntil = z.t + (S.index.pain_gun?.duration ?? 1.4) * .9; z.busyTick = null; }
    gk.emit('raz:gun', z);
  }
  function damage(e) {
    const z = e.enemy;
    if (z.state === 'intro' && !z.insta) { /* still takes damage while it roars */ }
    const p = K.hitPoint(z), part = partOf(z, p) ?? (e.head ? 'head' : e.melee ? null : 'chest');
    if (z.insta) {   // insta-kill: only the right forearm kills; the cannon breaks
      if (part === 'rlow') { e.amount = z.health + 1; return; }
      if (part === 'gun' && !z.gunOff) { e.amount = 0; loseGun(z); return; }
    }
    if (e.cause === 'explosion' || !part || !(part in ARMOUR)) return;   // splash and the plain parts: full damage
    const armoured = part === 'gun' ? !z.gunOff : !z.broken.has(part);
    if (!armoured) return;
    z.pools[part] -= e.amount; e.amount *= .1;
    if (z.pools[part] <= 0) { if (part === 'gun') loseGun(z); else breakPiece(z, part); }
    if (part === 'head') e.head = false;   // the helmet takes it: no headshot bonus
  }
  return { ready: () => ready, spawn, mirror, damage, alive: () => K.alive('raz'), get loaded() { return !!S; } };
}
