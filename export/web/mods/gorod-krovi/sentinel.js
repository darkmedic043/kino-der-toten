// The Valkyrie drone (BO3's sentinel drone, _zm_ai_sentinel_drone.gsc / vehicles/_sentinel_drone.gsc; scratch/gk/spec/bosses.md §3).
//   Health 2500 + 200 a round (4500-50000) × (1 + 0.25 per extra player); 100 points, no power-ups.
//   It comes down from 5,000 units over its spawn point in 3 s and waits 1 s. Then it hovers around its target (300-650
//   away, 110-220 above it, in sight) and fires every 2.5-5 s: 70% a run of 3 beams (left, right, top arm) 0.3 s apart,
//   30 each; otherwise a beam that does 50 then 10 every 0.1 s for 2 s while it stays on. 40% of the time it moves after
//   firing, and it rolls aside when shot (at most every 3 s).
//   Parts (own pools on top of its health): each arm 200, the face plate 200, the camera 300, the core 100; insta-kill
//   does ×4 to parts (not to its health), the core takes ×2 once the face plate is off. All three arms gone, or the
//   camera, and it dives at its target (kamikaze): blows up within 100, or after 2 s. Death: 60 to players within 110,
//   zombies within 100 are shocked (stand-in: 25% of their health).
//   Necromancer (from the second Valkyrie round, every other drone): hangs 106 above a point 500-768 from its target
//   and raises 6-23 zombies, one every 2.5/2/1.5/1 s (players), while fewer than 10 (12 with four players) zombies are
//   up; risers have half health, drop after 60 s or past 1,024 from their drone, and all drop when it dies.
//   Buff: now and then a beam makes the nearest zombie within 2,000 faster (BO3's "sparky" buff; stand-in for the
//   electrified look). Pavlov's drones buff every time.
import { THREE, V, rand, Rig, cloneSkinned, prepBody, hideBone, loadSet } from './boss-common.js';
import { SENTINEL_SPOTS } from './boss-data.js';

const MODELS = ['veh_t7_dlc3_sentinel_drone', 'veh_t7_dlc3_sentinel_drone_faceplate', 'veh_t7_dlc3_sentinel_drone_dead_whole'];
const PARTS = { armL: { bone: 'tag_arm_left_01', hp: 200, clip: 'arms_broken_left' }, armR: { bone: 'tag_arm_right_01', hp: 200, clip: 'arms_broken_right' },
  armT: { bone: 'tag_arm_top_01', hp: 200, clip: 'arms_broken_top' }, face: { bone: 'tag_faceplate_d0', hp: 200 }, camera: { bone: 'tag_camera_dead', hp: 300 }, core: { bone: 'tag_center_core', hp: 100 } };
const LIFT = 40;   // the model sits this far over the record's position (the engine's hit box starts at the position)
const byPlayers = (t, n) => t[Math.max(0, Math.min(t.length, n) - 1)];

export function setupSentinel(K) {
  const { world, session, scene, enemies, gk } = K;
  let S = null;
  const ready = loadSet('sentinel', MODELS).then(s => { S = s.models.veh_t7_dlc3_sentinel_drone ? s : null; if (S) { const w = build(V(), true); w.root.removeFromParent(); K.host.warmObjects.push(w.root); for (const m of MODELS.slice(1)) if (S.models[m]) { const c = cloneSkinned(S.models[m]); c.scale.setScalar(.001); K.host.warmObjects.push(c); } } return S; });
  const spots = Object.entries(SENTINEL_SPOTS).flatMap(([zone, l]) => l.map(([x, y, z]) => ({ p: V(x, y, z), zone })));

  function build(at, mirror = false) {
    const root = new THREE.Group(); root.name = 'sentinel'; const body = cloneSkinned(S.models.veh_t7_dlc3_sentinel_drone); body.position.y = LIFT; root.add(body);
    const bones = prepBody(root);
    const z = { kind: 'sentinel', root, body, bones, speed: 0, state: mirror ? 'fly' : 'intro', hit: { r: 60, h: 140, head: 14 }, vel: V(), cool: { fire: rand(2, 3.5), dodge: 0, goal: 0, buff: rand(4, 9) } };
    const rig = z.rig = new Rig(root, n => note(z, n));
    for (const [k, d] of Object.entries(S.A)) if (d) rig.add(k, d);
    if (S.A.dth) rig.add('death', S.A.dth);
    root.position.copy(at); scene.add(root); rig.play(mirror ? 'idle' : 'intro', true); rig.update(.01);
    return z;
  }
  const play = (z, k, loop = true) => { if (z.act === k && loop) return; z.act = k; z.rig.play(k, loop, 1, .2); };
  const health = () => { const r = session.round ?? 1; return Math.round(Math.min(50000, Math.max(4500, 2500 + 200 * r)) * (1 + .25 * (K.playerCount() - 1))); };

  // a spawn spot in an active zone, 256-1,500 from a player (the nearest ones if none)
  function pickSpot(zone) {
    const zones = K.zones(), ps = K.players().filter(q => !q.down).map(q => q.pos);
    const dist = s => Math.min(...ps.map(p => p.distanceTo(s.p)));
    const ok = spots.filter(s => (zone ? s.zone === zone : zones.has(s.zone)));
    const good = ok.filter(s => { const d = dist(s); return d >= 256 && d <= 1500; });
    const pool = good.length ? good : ok.sort((a, b) => dist(a) - dist(b)).slice(0, 3);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }
  function spawn({ at = null, zone = null, count = true, points = true, necro = false, buff = false, extra = {} } = {}) {
    if (!S) return null;
    const sp = at ? { p: at.clone() } : pickSpot(zone); if (!sp) return null;
    const z = build(sp.p.clone().add(V(0, 5000, 0)));
    const hp = health();
    Object.assign(z, { health: hp, maxHealth: hp, points, necro, alwaysBuff: buff, land: sp.p.clone(), pools: Object.fromEntries(Object.entries(PARTS).map(([k, p]) => [k, p.hp])), broken: new Set(), risers: new Set(), raised: 0, toRaise: 6 + Math.floor(Math.random() * 18), ...extra });
    z.ai = (dt, pl) => think(z, dt, pl);
    z.onDeath = () => died(z);
    K.enlist(z, { count });
    z.hum = K.loop('sen_new_lp_1');
    K.sfxAt('sen_sentinel_flydown', sp.p, .9); K.sfxAt('sen_incoming', sp.p, .7);
    gk.emit('boss:spawn', 'sentinel', z);
    return z;
  }
  const mirror = p => { if (!S) return null; const z = build(p, true); z.health = z.maxHealth = 1e6; z.special = true; z.id = ++enemies.serial; z.path = []; z.pathIndex = 0; z.repath = 0; z.lastPosition = z.root.position.clone(); enemies.list.push(z); return z; };

  // ---- flight
  const eyeOf = z => z.root.position.clone().add(V(0, LIFT + 15, 0));
  const chest = p => p.clone().add(V(0, 48, 0));
  function newGoal(z, tp) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, r = z.necro ? rand(500, 768) : rand(300, 650);
      const g = tp.clone().add(V(Math.cos(a) * r, z.necro ? 106 : rand(110, 220), Math.sin(a) * r));
      if (z.necro) { const nav = world.closest?.(g.clone().setY(tp.y), { x: 300, y: 300, z: 300 }); if (nav) g.set(nav.x, nav.y + 106, nav.z); }
      if (K.clear(eyeOf(z), g.clone().add(V(0, LIFT, 0))) && K.clear(g.clone().add(V(0, LIFT, 0)), chest(tp))) return g;
    }
    return tp.clone().add(V(0, 160, 0));
  }
  function fly(z, goal, speed, dt) {
    const pos = z.root.position, want = goal.clone().sub(pos), d = want.length();
    const v = d > 1 ? want.multiplyScalar(Math.min(speed, d * 2) / d) : V();
    z.vel.lerp(v, Math.min(1, dt * 3));
    const step = z.vel.clone().multiplyScalar(dt), len = step.length();
    if (len > .01) {   // walls stop it (a short probe from its middle)
      const from = eyeOf(z), hit = world.raycast(new THREE.Ray(from, step.clone().normalize()), 0, len + 40);
      if (hit) { z.vel.multiplyScalar(-.3); z.cool.goal = 0; return d; }
      pos.add(step);
    }
    // its lean and the fly clips follow its velocity, relative to where it faces
    const f = K.fwd(z.root), side = V(f.z, 0, -f.x), fv = z.vel.dot(f), sv = z.vel.dot(side);
    if (!z.busyUntil || z.t > z.busyUntil) play(z, Math.abs(fv) < 40 && Math.abs(sv) < 40 ? 'idle' : Math.abs(fv) > Math.abs(sv) ? (fv > 0 ? 'fly_f' : 'fly_b') : (sv > 0 ? 'fly_l' : 'fly_r'));
    return d;
  }

  function think(z, dt, pl) {
    z.t += dt; for (const k in z.cool) z.cool[k] -= dt;
    K.loopVol(z.hum, z.root.position, .35);
    // ee.js (the escorted drone): z.ee(z, dt) -> null = its own brain, false = hold, {at, speed} = fly there (no attacks)
    if (z.ee) { const g = z.ee(z, dt); if (g === false) return; if (g) { fly(z, g.at, g.speed ?? 88, dt); return; } }
    if (!z.target || (z.retarget = (z.retarget ?? 0) - dt) <= 0) { z.retarget = 1.5; z.target = K.nearest(z.root.position); }
    const tp = K.posOf(z.target.id) ?? pl, pos = z.root.position;
    if (z.state === 'intro') {   // down from 5,000 over 3 s, then a second's pause
      const k = Math.min(1, z.t / 3); pos.copy(z.land).add(V(0, 5000 * (1 - k) ** 2 + 30 * k, 0)); K.face(z.root, tp);
      if (z.t >= 4) { z.state = 'fly'; z.goal = newGoal(z, tp); play(z, 'idle'); K.sfxAt('sen_incoming_land', pos, .6); }
      return;
    }
    if (z.state === 'kamikaze') {
      const goal = chest(K.posOf(z.target.id) ?? tp), d = goal.distanceTo(eyeOf(z));
      fly(z, goal.clone().sub(V(0, LIFT + 15, 0)), 520, dt); K.turn(z.root, K.yawTo(pos, goal), 6, dt);
      if (d < 100 || z.t > z.kamiUntil) enemies.hurt(z, z.health + 1, false, false, 'explosion', false);
      return;
    }
    // hover, face the target, fire
    if (!z.goal || z.cool.goal <= 0 || pos.distanceTo(z.goal) < 30 && z.cool.goal < 2) { z.goal = newGoal(z, tp); z.cool.goal = rand(3, 6); }
    fly(z, z.goal, z.necro ? 260 : 320, dt);
    K.turn(z.root, K.yawTo(pos, tp), 3, dt);
    if (z.beam) beamTick(z, dt);
    if (z.necro) return necroTick(z, dt, tp);
    if (z.cool.buff <= 0) { z.cool.buff = z.alwaysBuff ? rand(4, 7) : rand(10, 18); buff(z); }
    const seen = K.clear(eyeOf(z), chest(tp));
    if (z.cool.fire <= 0 && seen && !z.beam && pos.distanceTo(tp) < 1600) {
      z.cool.fire = rand(2.5, 5);
      const quick = Math.random() < .7 && S.A.attack_quick_v1;
      z.busyUntil = z.t + (S.index[quick ? 'attack_quick_v1' : 'attack']?.duration ?? 2.5) * .9; play(z, quick ? 'attack_quick_v1' : 'attack', false);
      z.shots = quick ? 3 : 0; z.burst = !quick;
      K.sfxAt(quick ? 'sen_short_fire_start' : 'sen_main_fire_start', pos, .8);
      if (Math.random() < .4) z.cool.goal = (S.index.attack?.duration ?? 2.5);
    }
  }
  // notetracks: fire_beam (the burst's start), attack_quick_<arm> (each of the three beams)
  function note(z, n) {
    if (!z.ai || z.health <= 0) return;
    if (/^attack_quick_(left|right|top)/.test(n) && z.shots > 0) { z.shots--; zap(z, { left: 'tag_arm_left_01', right: 'tag_arm_right_01', top: 'tag_arm_top_01' }[n.slice(13)], 30); }
    else if (n === 'fire_beam' && z.burst) { z.burst = false; z.beam = { t: 0, tick: 0, first: true }; K.sfxAt('sen_main_fire_fire', z.root.position, .8); }
  }
  // a beam from a bone (or the eye) at the target: hits if it has a clear line
  function zap(z, bone, dmg) {
    const from = (bone && !z.broken.has(bone) && K.boneAt(z, bone)) || K.boneAt(z, 'tag_laser') || eyeOf(z), tp = chest(K.posOf(z.target?.id) ?? K.player.getFeetPosition());
    const hit = K.clear(from, tp), end = hit ? tp : (world.raycast(new THREE.Ray(from, tp.clone().sub(from).normalize()), 0, from.distanceTo(tp))?.position ?? tp);
    K.line('blue', from, end, .12); K.sprite('blue', end, 30, { life: .2, fade: true });
    if (hit && z.target) K.hitPlayer(z.target.id, dmg, 'sentinel');
    if (dmg >= 30) K.sfxAt('sen_main_fire_fire', from, .5);
  }
  function beamTick(z, dt) {
    const b = z.beam; b.t += dt; b.tick -= dt;
    if (b.tick <= 0) { b.tick = .1; zap(z, null, b.first ? 50 : 10); b.first = false; }
    if (b.t >= 2) { z.beam = null; K.sfxAt('sen_main_fire_end', z.root.position, .6); }
  }
  // the buff beam: the nearest zombie within 2,000 runs faster (once each)
  function buff(z) {
    let best = null, bd = 2000;
    for (const o of enemies.list) { if (o.special || o.buffed || o.state === 'barricade') continue; const d = o.root.position.distanceTo(z.root.position); if (d < bd) { bd = d; best = o; } }
    if (!best) return;
    best.buffed = true; best.speed = Math.min(220, best.speed * 1.35 + 20);
    const to = best.root.position.clone().add(V(0, 50, 0)); K.line('blue', eyeOf(z), to, .5); K.sprite('blue', to, 70, { life: .5, fade: true });
  }

  // ---- the necromancer's risers
  function necroTick(z, dt, tp) {
    for (const r of z.risers) if (!enemies.list.includes(r)) z.risers.delete(r);
    for (const r of [...z.risers]) if (r.riseT0 != null && (session.time - r.riseT0 > 60 || r.root.position.distanceTo(z.root.position) > 1024)) enemies.hurt(r, r.health + 1, false, false, 'explosion', false);
    if (z.raised >= z.toRaise) { if (!z.risers.size) { z.necro = false; z.cool.goal = 0; } return; }   // done raising: it fights
    const cap = byPlayers([10, 10, 10, 12], K.playerCount()), up = enemies.list.filter(o => !o.special).length;
    z.cool.raise ??= 1; if (z.cool.raise > 0 || up >= cap) return;
    z.cool.raise = byPlayers([2.5, 2, 1.5, 1], K.playerCount());
    const a = Math.random() * Math.PI * 2, p = world.closest?.(z.root.position.clone().add(V(Math.cos(a) * 120, -106, Math.sin(a) * 120)), { x: 200, y: 260, z: 200 });
    if (!p) return;
    const r = K.spawnZombie(p, null, 'zombie'); if (!r) return;
    session.spawned--; r.tempo = z.raised >= 6; r.health = r.maxHealth = Math.max(1, Math.floor(r.health / 2)); r.riseT0 = session.time; r.necro = z;
    enemies.riseAt?.(r, p);
    if (!r.tempo) session.total++;   // the first six count (and pay) like any zombie
    z.raised++; z.risers.add(r);
    K.line('green', eyeOf(z), p.clone().add(V(0, 10, 0)), .6); K.sprite('green', p.clone().add(V(0, 20, 0)), 90, { life: .8, fade: true, grow: 60 });
    play(z, 'antenna_twitch', false); z.busyUntil = z.t + .8;
  }

  // ---- damage and death
  function partOf(z, p) {
    if (!p) return null; z.root.updateMatrixWorld(true);
    const ray = K.hitRay(z); let best = null, bd = ray ? 22 : 30;   // the part nearest the bullet's line (the hit point is on the box's face)
    for (const [k, part] of Object.entries(PARTS)) { if (z.broken.has(k)) continue; const b = K.boneAt(z, part.bone); if (!b) continue; const d = ray ? Math.sqrt(ray.distanceSqToPoint(b)) : b.distanceTo(p); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  function breakPart(z, k) {
    if (z.broken.has(k)) return; z.broken.add(k);
    const part = PARTS[k], at = K.boneAt(z, part.bone) ?? eyeOf(z);
    K.boom(at, .25); K.sfxAt(K.pick('sen_break', 6), at, .8);
    if (k.startsWith('arm')) { hideBone(z.bones.get(part.bone)); if (S.A[part.clip]) { play(z, part.clip, false); z.busyUntil = z.t + .9; } }
    if (k === 'face') { hideBone(z.bones.get('tag_faceplate_d0')); K.debris(S.models.veh_t7_dlc3_sentinel_drone_faceplate, at, K.fwd(z.root).multiplyScalar(160).add(V(0, 200, 0))); }
    gk.emit('sentinel:part', { z, part: k });   // challenges 3_5 (every arm) and 3_6 (the camera)
    if (k === 'camera' || ['armL', 'armR', 'armT'].every(a => z.broken.has(a))) kamikaze(z);
  }
  function kamikaze(z) {
    if (z.state === 'kamikaze') return;
    z.state = 'kamikaze'; z.necro = false; z.beam = null; z.kamiUntil = z.t + 2 + (S.index.suicide_intro?.duration ?? 0) * .5;
    play(z, S.A.suicide_fly_f ? 'suicide_fly_f' : 'fly_f'); K.sfxAt('sen_enrage', z.root.position, 1);
  }
  function died(z) {
    const p = eyeOf(z);
    z.hum?.pause(); z.hum = null;
    K.boom(p, .8); K.sfxAt(K.pick('sen_break', 6), p, 1);
    K.playersNear(p, 110, id => K.hitPlayer(id, 60, 'sentinel:blast'));
    for (const o of [...enemies.list]) if (!o.special && o.root.position.distanceTo(p) < 140) enemies.hurt(o, Math.ceil(o.maxHealth * .25), false, false, 'explosion', false);
    for (const r of [...(z.risers ?? [])]) enemies.hurt(r, r.health + 1, false, false, 'explosion', false);
    z.root.visible = false;   // the wreck falls (its own model), the record stays in enemies.dead until it times out
    const wreck = K.debris(S.models.veh_t7_dlc3_sentinel_drone_dead_whole, p, z.vel.clone().multiplyScalar(.5).add(V(0, 60, 0)), 4);
    if (wreck) { wreck.o.rotation.y = z.root.rotation.y; wreck.floor = (K.ground(p.clone())?.y ?? p.y - 300) + 10; }
  }
  function damage(e) {
    const z = e.enemy;
    if (z.eeEscort) { e.amount = 0; return; }   // the main egg's escorted drone: players can't hurt it
    if (z.state === 'intro' && z.t < 2) { e.amount = 0; return; }   // out of reach while it comes down
    if (z.t - (z.lastDodge ?? -9) > 3 && z.state === 'fly' && Math.random() < .25 && !z.beam) {   // a roll aside
      z.lastDodge = z.t; const l = Math.random() < .5; play(z, l ? 'dodge_l_v2' : 'dodge_r_v2', false); z.busyUntil = z.t + .9;
      const f = K.fwd(z.root); z.vel.add(V(f.z, 0, -f.x).multiplyScalar(l ? 380 : -380)); K.sfxAt('sen_dodge_00', z.root.position, .6);
    }
    const k = partOf(z, K.hitPoint(z)) ?? (e.cause === 'explosion' ? null : 'core');
    if (!k) return;
    let dmg = e.amount * (z.insta ? 4 : 1);
    if (k === 'core' && z.broken.has('face')) { dmg *= 2; e.amount *= 2; }
    z.pools[k] -= dmg;
    if (z.pools[k] <= 0) breakPart(z, k);
  }
  return { ready: () => ready, spawn, mirror, damage, alive: () => K.alive('sentinel'), get loaded() { return !!S; } };
}
