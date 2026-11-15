// Nikolai's siegebot, the last fight in Red Square (BO3 zm_stalingrad_nikolai.gsc + zm_siegebot_nikolai.gsc;
// scratch/gk/spec/bosses.md §7). Started by gk.bosses.nikolai() (the Easter egg's last step, or ?bossStart=nikolai).
//   The body takes no damage. Five heat vents do: right arm 7,500, left arm 7,500, right chest 8,000, left chest
//   8,000, the core 11,000 (only once the other four are gone). Vent damage is divided by the player count; no melee.
//   The arm vents only take hits while they're open: the right one during the spikes and the RAPS, the left one during
//   the gatling sweep and the RAPS. Explosions do half to the nearest open vent.
//   Loop: three walks to one of four sectors (two once the core shows), an attack after each, then a jump across the
//   square (landing: 50 to players within 200 and a shove), an end attack, another jump. Between them the twin gatling
//   fires 1-1.4 s bursts at its target.
//   Attacks by where the target stands: in a trench, a volley of 6 RAPS (rolling mines that hunt players, 10 s outside
//   the square); on a balcony, three harpoon spikes that land short of it and electrify zombies near them; in the
//   ruins, a 6 s gatling sweep with lead. In the open it picks one of them (an addition: BO3 only walks there, which can
//   leave the arm vents shut forever). Destroying the right arm adds the RAPS to the end attacks, the left arm the spikes.
//   Adds: Mangler waves (6/8/10/14, +1 a cycle; 2/3/4/5 alive, + players once the core shows), zombie waves
//   (22/30/36/44, +2 a cycle; 14/16/19/22 alive; at least round 20 health), both held while RAPS are out; two drones
//   (no points, replaced 10 s after dying) once two vents are down. No power-ups during the fight, a full ammo at the
//   square's middle every 45 s. The core at 0: it dies, everything it brought dies, players go back to the square's edge.
//   Events: nikolai:start, nikolai:vent (n), nikolai:reveal, nikolai:done, boss:spawn / boss:death ('nikolai').
import { THREE, V, fromBO, rand, Rig, cloneSkinned, prepBody, hideBone, loadSet } from './boss-common.js';
import { RAZ_SPOTS } from './boss-data.js';
import { zombieHealth } from '../../rules.js';

const MODELS = ['veh_t7_dlc3_mech_nikolai', 'veh_t7_dlc3_mech_nikolai_harpoon', 'veh_t7_dlc3_mech_nikolai_harpoon_large'];
const SPAWN = fromBO(.5, -1006, 5), SPAWN_YAW = 270 * Math.PI / 180, CENTER = fromBO(6.5, -1576, 0);
const PLAYER_AT = fromBO(0, -2050, 5), AMMO_AT = fromBO(-2, -1660, 36), RETURN = fromBO(-10, -260, 2);
const MOVE = { north: fromBO(0, -1010, 6), east: fromBO(544, -1593, 37), south: fromBO(-27, -2204, -4), west: fromBO(-551, -1604, 37) };
const JUMP = { NE: fromBO(649, -964, 7), NW: fromBO(-724, -975, -3), SE: fromBO(492, -2086, 29), SW: fromBO(-715, -2385, -1) };
const OPP = { NE: 'SW', SW: 'NE', NW: 'SE', SE: 'NW' };
const TRENCH = [[725, -880], [-769, -876], [777, -2486], [-825, -2486]].map(([x, y]) => fromBO(x, y, 0));
const SENT = [[897, -1358, 215], [-283, -691, 210], [199, -2657, 221], [-935, -1929, 212]].map(a => fromBO(...a));
// the vents: hit bone (where the sphere sits), intact/broken pieces, pool, radius
const VENTS = [
  { name: 'right arm', at: 'tag_fx_heat_vent_01', d0: 'tag_heat_vent_01_d0', d1: 'tag_heat_vent_01_d1', hp: 7500, r: 30, arm: true },
  { name: 'left arm', at: 'tag_fx_heat_vent_02', d0: 'tag_heat_vent_02_d0', d1: 'tag_heat_vent_02_d1', hp: 7500, r: 30, arm: true },
  { name: 'right chest', at: 'tag_fx_heat_vent_03', d0: 'tag_heat_vent_03_d0', d1: 'tag_heat_vent_03_d1', hp: 8000, r: 30 },
  { name: 'left chest', at: 'tag_fx_heat_vent_04', d0: 'tag_heat_vent_04_d0', d1: 'tag_heat_vent_04_d1', hp: 8000, r: 30 },
  { name: 'core', at: 'tag_heat_vent_05', d0: 'tag_heat_vent_05_d0', d1: 'tag_heat_vent_05_d1', hp: 11000, r: 36 },
];
const byPlayers = (t, n) => t[Math.max(0, Math.min(t.length, n) - 1)];
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function setupNikolai(K) {
  const { world, session, scene, enemies, gk, api } = K;
  let S = null, fight = null;
  const rapsMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: .7, roughness: .4, emissive: 0xff3010, emissiveIntensity: .6 });
  const rapsGeo = new THREE.SphereGeometry(14, 16, 10);
  const ready = loadSet('mech', MODELS).then(s => {
    S = s.models.veh_t7_dlc3_mech_nikolai ? s : null;
    if (S) { const w = build(V(), true); w.root.removeFromParent(); K.host.warmObjects.push(w.root); const h = S.models.veh_t7_dlc3_mech_nikolai_harpoon; if (h) { const c = cloneSkinned(h); c.scale.setScalar(.001); K.host.warmObjects.push(c); } }
    const r = new THREE.Mesh(rapsGeo, rapsMat); r.scale.setScalar(.001); K.host.warmObjects.push(r);
    return S;
  });

  function build(at, mirror = false) {
    const root = new THREE.Group(); root.name = 'nikolai'; const body = cloneSkinned(S.models.veh_t7_dlc3_mech_nikolai); root.add(body);
    const bones = prepBody(root);
    for (const v of VENTS) hideBone(bones.get(v.d1));   // the broken pieces show once a vent goes
    const z = { kind: 'nikolai', root, body, bones, speed: 0, state: 'intro', hit: { r: 110, h: 215, head: .01 }, cool: { gun: 3 }, vents: VENTS.map(v => ({ ...v, pool: v.hp, open: !v.arm || false, dead: false })) };
    // a glow on each vent while it can be hit (made here, scaled to nothing while shut)
    for (const v of z.vents) { const b = bones.get(v.at) ?? bones.get(v.d0); if (!b) continue; const s = new THREE.Sprite(K.mats.orange); s.scale.setScalar(.001); b.add(s); v.glow = s; }
    const rig = z.rig = new Rig(root, n => z.note?.(n));
    for (const [k, d] of Object.entries(S.A)) if (d) rig.add(k, d);
    if (S.A.dth) rig.add('death', S.A.dth);
    root.position.copy(at); root.rotation.y = SPAWN_YAW; scene.add(root); rig.play('idle', true); rig.update(.01);
    return z;
  }
  const play = (z, k, loop = true, speed = 1) => { if (!S.A[k]) return; if (z.act === k && loop) return; z.act = k; z.rig.play(k, loop, speed, .25); };
  const dur = k => S?.index[k]?.duration ?? 1;
  const mirror = p => { if (!S) return null; const z = build(p, true); z.health = z.maxHealth = 1e9; z.special = true; z.id = ++enemies.serial; z.path = []; z.pathIndex = 0; z.repath = 0; z.lastPosition = z.root.position.clone(); enemies.list.push(z); return z; };
  const rapsMirror = p => { const z = makeRaps(p); z.health = z.maxHealth = 1e6; z.special = true; z.id = ++enemies.serial; z.path = []; z.pathIndex = 0; z.repath = 0; z.lastPosition = z.root.position.clone(); enemies.list.push(z); return z; };
  K.kind('nikolai', { mirror });
  K.kind('raps', { mirror: rapsMirror, nukeProof: false });

  // ---- the fight
  function start() {
    if (!S || fight || !K.isHost()) return null;
    for (const z of [...enemies.list]) if (!z.special) { enemies.remove(z); if (!z.tempo) session.spawned--; }   // the square starts empty
    for (const z of [...enemies.list]) if (z.special) enemies.hurt(z, 1e9, false, false, 'explosion', false);
    const z = build(SPAWN.clone());
    const n = K.playerCount();
    Object.assign(z, { health: 1e9, maxHealth: 1e9, points: false, t: 0, target: null });
    z.ai = (dt, pl) => think(z, dt, pl);
    z.onDeath = () => died(z);
    K.enlist(z, { count: true });
    fight = { z, n, cycle: 0, gone: 0, reveal: false, raps: new Set(), spikes: [], sents: new Map(), sentWait: [0, 0, 0, 0], waves: [], ammoT: 2, endExtra: [] };
    z.co = script(z);
    z.engine = K.loop('nik_nikolai_bot_engine_lp');
    K.player.setPosition?.(PLAYER_AT.clone());
    K.sfx('nik_intro_getup', .9);
    api.announce?.('NIKOLAI', 'Destroy the heat vents', 4);
    startWaves();
    gk.emit('nikolai:start'); gk.emit('boss:spawn', 'nikolai', z);
    return z;
  }
  const active = () => !!fight;

  function startWaves() {
    const f = fight, n = f.n, rapsOut = () => f.raps.size > 0;
    const arena = (RAZ_SPOTS.bossarena ?? []).map(([x, y, z, yaw]) => ({ p: V(x, y, z), yaw: yaw * Math.PI / 180 }));
    const zpts = arena.length ? arena : [MOVE.east, MOVE.west, MOVE.north, MOVE.south].map(p => ({ p, yaw: 0 }));
    const razCycle = () => {
      if (!fight || !K.raz?.loaded) return;
      const reveal = f.reveal, w = K.wave('raz', { points: arena.length ? arena : zpts, total: reveal ? Infinity : byPlayers([6, 8, 10, 14], n) + f.cycle, interval: 3,
        maxAlive: () => (rapsOut() ? 0 : byPlayers([2, 3, 4, 5], n) + (f.reveal ? n : 0)), until: () => !fight || (!reveal && f.reveal), onDone: () => { if (fight) f.t20 = setTimeout(razCycle, f.reveal ? 1000 : 20000); } });
      f.waves.push(w);
    };
    const zombieCycle = () => {
      if (!fight) return;
      const w = K.wave('zombie', { points: zpts, total: byPlayers([22, 30, 36, 44], n) + 2 * f.cycle, interval: .5, health: zombieHealth(20, K.api.data?.rules ?? {}),
        maxAlive: () => (rapsOut() ? 0 : byPlayers([14, 16, 19, 22], n)), until: () => !fight, onDone: () => { if (fight) { f.cycle++; f.tz = setTimeout(zombieCycle, 20000); } } });
      f.waves.push(w);
    };
    razCycle(); zombieCycle();
  }

  // the move/jump loop as a script: each yield waits one frame
  function* wait(z, t) { const end = z.t + t; while (z.t < end) yield; }
  function* clip(z, k, noteName = null, at = .6) {   // plays a clip to its end; resolves its notetrack (or a share of its length) once
    play(z, k, false); const end = z.t + dur(k), fire = z.t + dur(k) * at; let done = false;
    z.note = n => { if (!done && n === noteName) { done = true; z.onNote?.(); } };
    while (z.t < end) { if (!done && noteName && z.t >= fire) { done = true; z.onNote?.(); } yield; }
    z.note = null; z.onNote = null;
  }
  function* walk(z, goal) {
    const end = z.t + 20;
    while (z.t < end && flat(z.root.position, goal) > 40) {
      const pos = z.root.position, yaw = K.yawTo(pos, goal), side = Math.sin(yaw - z.root.rotation.y), off = K.turn(z.root, yaw, 1.4, z.dt);
      if (off > .6) play(z, side > 0 ? 'turn_l_loop' : 'turn_r_loop');
      else { play(z, 'walk_f'); const d = goal.clone().sub(pos).setY(0).normalize(); pos.addScaledVector(d, 120 * z.dt); const y = world.surfaceY?.(pos.x, pos.y + 60, pos.z); if (y != null && Math.abs(y - pos.y) < 80) pos.y += (y - pos.y) * Math.min(1, z.dt * 8); }
      yield;
    }
    play(z, 'idle');
  }
  function* jump(z) {
    const near = Object.entries(JUMP).sort((a, b) => flat(a[1], z.root.position) - flat(b[1], z.root.position))[0][0];
    const to = JUMP[OPP[near]].clone(), from = z.root.position.clone();
    z.gunOff = true;
    while (K.turn(z.root, K.yawTo(z.root.position, to), 1.6, z.dt) > .15) { play(z, 'turn_l_loop'); yield; }
    K.sfxAt('nik_jump_start', from, 1);
    z.onNote = () => {}; yield* clip(z, 'launch_up', 'leave_ground', .55);
    K.sfxAt('nik_jump', from, 1); play(z, 'in_air_loop');
    const T = 1.8, t0 = z.t;
    while (z.t - t0 < T) { const k = (z.t - t0) / T; z.root.position.lerpVectors(from, to, k).y += 4 * 650 * k * (1 - k); yield; }
    z.root.position.copy(to);
    land(z);
    yield* clip(z, 'land');
    z.gunOff = false;
  }
  function land(z) {
    const p = z.root.position.clone();
    K.sfxAt('nik_jump_land', p, 1); K.boom(p.clone().add(V(0, 20, 0)), .8);
    K.playersNear(p.clone().add(V(0, 40, 0)), 200, (id, d, at) => { K.hitPlayer(id, 50); if (id === K.sync.me || id === 'solo') K.shove(at.clone().sub(p), 700); });
    for (const o of [...enemies.list]) if (!o.special && flat(o.root.position, p) < 200) enemies.hurt(o, Math.ceil(o.maxHealth * .5), false, false, 'explosion', false);
  }
  // the attack after a move: by where the target stands (trench → RAPS, balcony → spikes, ruins → sweep)
  function* attack(z, end = false) {
    const tp = K.posOf(z.target?.id) ?? K.player.getFeetPosition();
    let kind = TRENCH.some(t => flat(t, tp) < 300) ? 'raps' : tp.y > 180 ? 'spikes' : tp.y > 50 ? 'sweep' : null;
    if (!kind) kind = ['sweep', 'spikes', 'raps'][Math.floor(Math.random() * 3)];   // in the open (see the header)
    yield* ATTACKS[kind](z);
    if (end) for (const k of fight.endExtra) yield* ATTACKS[k](z);
  }
  const open = (z, ...i) => { for (const v of z.vents) if (v.arm) v.open = !v.dead && i.includes(z.vents.indexOf(v)); glow(z); };
  function glow(z) { for (const v of z.vents) if (v.glow) v.glow.scale.setScalar(v.open && !v.dead ? (v.arm ? 28 : 22) : .001); }
  const ATTACKS = {
    *sweep(z) {   // 6 s of gatling with lead, the left arm vent open
      open(z, 1); z.gunOff = true; K.sfxAt('nik_rapidfire_hint', z.root.position, .9);
      const end = z.t + 6; let shot = 0;
      while (z.t < end) { faceTarget(z, 1.2); if ((shot -= z.dt) <= 0) { shot = .1; fire(z, true); } yield; }
      K.sfxAt('nik_rapidfire_end', z.root.position, .8); z.gunOff = false; open(z);
    },
    *spikes(z) {   // three harpoons that land 400-460 short of the target, the right arm vent open
      open(z, 0); z.gunOff = true;
      play(z, 'shoot_harpoon', false); const end = z.t + dur('shoot_harpoon'), t1 = z.t + dur('shoot_harpoon') * .45; let n = 0, nx = t1;
      z.note = nn => { if (nn === 'fire_harpoon' && n === 0) nx = z.t; };
      while (z.t < end) { faceTarget(z, 1); if (n < 3 && z.t >= nx) { n++; nx = z.t + .35; harpoon(z); } yield; }
      z.note = null; z.gunOff = false; open(z);
    },
    *raps(z) {   // a volley of six RAPS, both arm vents open
      open(z, 0, 1); z.gunOff = true;
      z.onNote = () => { for (let i = 0; i < 6; i++) launchRaps(z, i); };
      yield* clip(z, 'spawn_raps', 'fire_raps', .5);
      z.gunOff = false; open(z);
    },
  };
  function faceTarget(z, rate) { const tp = K.posOf(z.target?.id); if (tp) K.turn(z.root, K.yawTo(z.root.position, tp), rate, z.dt); }
  function* script(z) {
    play(z, 'idle'); yield* wait(z, 3);
    for (;;) {
      for (let i = 0, n = fight.reveal ? 2 : 3; i < n; i++) {
        const here = Object.entries(MOVE).sort((a, b) => flat(a[1], z.root.position) - flat(b[1], z.root.position))[0][0];
        const opts = Object.keys(MOVE).filter(k => k !== here);
        yield* walk(z, MOVE[opts[Math.floor(Math.random() * opts.length)]]);
        yield* attack(z);
        yield* wait(z, 1);
      }
      yield* jump(z); yield* attack(z, true); if (fight.reveal) yield* attack(z, true);
      yield* jump(z); yield* wait(z, 1);
    }
  }

  // ---- weapons
  const chest = p => p.clone().add(V(0, 48, 0));
  function fire(z, sweep) {
    const tq = K.players().find(q => q.id === z.target?.id); if (!tq || tq.down) return;
    z.barrel = (z.barrel ?? 0) ^ 1;
    const from = K.boneAt(z, z.barrel ? 'tag_gunner_flash1' : 'tag_gunner_flash2') ?? z.root.position.clone().add(V(0, 160, 0));
    const vel = tq.id === K.sync.me || tq.id === 'solo' ? K.player.velocity ?? V() : V();
    const a = z.t * 7, spread = sweep ? 100 : 70;
    const aim = chest(tq.pos).addScaledVector(V(vel.x, 0, vel.z), sweep ? -.3 : 0).add(V(Math.cos(a) * spread * Math.random(), (Math.random() - .5) * 40, Math.sin(a) * spread * Math.random()));
    const dir = aim.clone().sub(from).normalize(), wall = world.raycast(new THREE.Ray(from, dir), 0, 4000);
    const end = wall ? wall.position : from.clone().addScaledVector(dir, 4000);
    K.line('yellow', from, end, .05);
    // a hit when the round passes within 24 of the target's middle
    const c = chest(tq.pos), along = c.clone().sub(from).dot(dir);
    if (along > 0 && (!wall || wall.distance > along) && from.clone().addScaledVector(dir, along).distanceTo(c) < 24) K.hitPlayer(tq.id, 8);
    if ((z.fireSnd = (z.fireSnd ?? 0) - 1) <= 0) { z.fireSnd = 3; K.sfxAt(K.pick('nik_fire', 4), from, .7); }
  }
  function harpoon(z) {
    const tq = K.players().find(q => q.id === z.target?.id), tp = tq?.pos ?? K.player.getFeetPosition();
    const from = K.boneAt(z, 'tag_harpoon_fx') ?? z.root.position.clone().add(V(0, 170, 0));
    const back = tp.clone().sub(z.root.position).setY(0); const dist = back.length(); back.normalize();
    const land = K.ground(tp.clone().addScaledVector(back, -Math.min(dist - 50, rand(400, 460))).add(V(rand(-60, 60), 0, rand(-60, 60))));
    const model = S.models.veh_t7_dlc3_mech_nikolai_harpoon; if (!model) return;
    const o = cloneSkinned(model); o.traverse(m => { if (m.isMesh) m.frustumCulled = false; }); o.position.copy(from);
    o.quaternion.setFromUnitVectors(V(1, 0, 0), land.clone().sub(from).normalize());
    const T = .5, t0 = session.time, sp = { at: land.clone(), zap: 0 };
    const f = K.add(o, { life: 25, tick: (dt, fx) => {
      const k = Math.min(1, (session.time - t0) / T);
      if (!sp.stuck) { o.position.lerpVectors(from, land, k); if (k >= 1) { sp.stuck = true; impact(sp); } return; }
      if ((sp.zap -= dt) <= 0) { sp.zap = .25; for (const q of enemies.list) if (!q.special && !q.buffed && q.root.position.distanceTo(sp.at) < 200) { q.buffed = true; q.speed = Math.min(220, q.speed * 1.35 + 20); K.sprite('blue', q.root.position.clone().add(V(0, 50, 0)), 50, { life: .3, fade: true }); } }
    } });
    fight?.spikes.push(f);
    K.sfxAt('nik_rapidfire_hint', from, .3);
  }
  function impact(sp) {
    K.sfxAt(K.pick('nik_harpoon_imp', 4), sp.at, 1); K.boom(sp.at.clone().add(V(0, 10, 0)), .45);
    K.playersNear(sp.at, 96, id => K.hitPlayer(id, 40));
    for (const q of [...enemies.list]) if (!q.special && q.root.position.distanceTo(sp.at) < 120) { q.stunUntil = session.time + 2; enemies.hurt(q, Math.ceil(q.maxHealth * .2), false, false, 'explosion', false); }
  }

  // RAPS stand-in: a glowing ball that arcs out of the mech, rolls along the navmesh after its target and blows up on
  // contact (40 within 100); it dies after 10 s outside the square
  function makeRaps(p) {
    const root = new THREE.Group(); root.name = 'raps'; root.add(new THREE.Mesh(rapsGeo, rapsMat)); root.children[0].position.y = 14; root.position.copy(p); scene.add(root);
    return { kind: 'raps', root, bones: new Map(), hit: { r: 18, h: 30, head: .01 }, speed: 0, state: 'fly', rig: { update() {}, play() {}, current: '', mixer: { uncacheRoot() {} } } };
  }
  function launchRaps(z, i) {
    const from = K.boneAt(z, 'tag_flash') ?? z.root.position.clone().add(V(0, 180, 0));
    const r = makeRaps(from); const tq = K.players().filter(q => !q.down)[i % Math.max(1, K.players().filter(q => !q.down).length)] ?? K.nearest(from);
    const a = i / 6 * Math.PI * 2 + rand(0, 1), rr = rand(180, 380), land = K.ground((tq.pos ?? from).clone().lerp(from, .25).add(V(Math.cos(a) * rr, 0, Math.sin(a) * rr)));   // around the target, a spiral of landing spots
    Object.assign(r, { health: 200 + 40 * (session.round ?? 1), maxHealth: 1, points: false, tempo: true, t: 0, from, land, target: tq, out: 0 });
    r.maxHealth = r.health;
    r.ai = (dt) => rapsThink(r, dt);
    r.onDeath = () => rapsDie(r, false);
    K.enlist(r, { count: false });
    fight?.raps.add(r);
    K.sfxAt('raps_kls_raps_launch_00', from, .8);
  }
  function rapsThink(r, dt) {
    r.t += dt; const pos = r.root.position;
    if (r.state === 'fly') { const k = Math.min(1, r.t / 1.2); pos.lerpVectors(r.from, r.land, k).y += 4 * 300 * k * (1 - k); if (k >= 1) { r.state = 'roll'; K.sfxAt('raps_veh_raps_land_00', pos, .6); r.alarm = K.loop('raps_evt_raps_alarm_loop'); } return; }
    if (r.target?.down || !K.posOf(r.target?.id)) r.target = K.nearest(pos);
    const tp = K.posOf(r.target.id) ?? K.player.getFeetPosition();
    K.walkTo(r, tp, 260, dt);
    r.root.children[0].rotation.x += dt * 8;
    K.loopVol(r.alarm, pos, .4, 1500);
    for (const o of enemies.list) if (!o.special && o.root.position.distanceTo(pos) < 40 && !o.knocked) { o.knocked = true; enemies.hurt(o, Math.ceil(o.maxHealth * .3), false, false, 'explosion', false); }
    if (!K.inArena(pos)) { r.out += dt; if (r.out > 10) return enemies.hurt(r, r.health + 1, false, false, 'explosion', false); }
    if (tp.distanceTo(pos) < 50 || r.t > 25) enemies.hurt(r, r.health + 1, false, false, 'explosion', false);
  }
  function rapsDie(r) {
    r.alarm?.pause(); r.alarm = null; fight?.raps.delete(r);
    const p = r.root.position.clone().add(V(0, 14, 0)); r.root.visible = false;
    K.boom(p, .5); K.playersNear(p, 100, id => K.hitPlayer(id, 40));
  }

  // ---- each frame
  function think(z, dt, pl) {
    z.t += dt; z.dt = dt;
    K.loopVol(z.engine, z.root.position, .5, 3000);
    if (z.state === 'dying') return;
    if (!z.target || (z.retarget = (z.retarget ?? 0) - dt) <= 0) {   // the player who did the most vent damage, else the nearest
      z.retarget = 2; const best = [...(z.tally ?? new Map())].sort((a, b) => b[1] - a[1])[0];
      z.target = (best && K.players().find(q => q.id === best[0] && !q.down)) || K.nearest(z.root.position);
      if (Math.random() < .67) z.tally?.clear();
    }
    z.co.next();
    // the gatling between attacks: 1-1.4 s bursts, up to 5 s of them in a gap
    const tp = K.posOf(z.target?.id);
    if (!z.gunOff && tp) {
      z.cool.gun -= dt;
      if (z.burst > 0) { z.burst -= dt; if ((z.shot = (z.shot ?? 0) - dt) <= 0) { z.shot = .1; fire(z, false); } if (z.burst <= 0) { z.spin?.pause(); z.spin = null; } }
      else if (z.cool.gun <= 0 && K.clear(z.root.position.clone().add(V(0, 170, 0)), chest(tp))) { z.burst = rand(1, 1.4); z.cool.gun = z.burst + rand(.8, 1.6); z.spin = K.sfxAt('nik_barrel_spin_lp', z.root.position, .6); }
    }
    // the fight's own pieces: the full ammo, drones
    const f = fight; if (!f) return;
    if ((f.ammoT -= dt) <= 0) { f.ammoT = 45; api.powerups?.spawn?.('full_ammo', AMMO_AT.clone()); }
    if (f.gone >= 2 && K.sentinel?.loaded) for (let i = 0; i < SENT.length; i++) {
      const s = f.sents.get(i); if (s && enemies.list.includes(s)) continue;
      if (s) { f.sents.delete(i); f.sentWait[i] = 10; }
      if ([...f.sents.values()].filter(x => enemies.list.includes(x)).length >= 2) continue;
      if ((f.sentWait[i] -= dt) > 0) continue;
      const d = K.sentinel.spawn({ at: SENT[i].clone().sub(V(0, 106, 0)), count: false, points: false, extra: { tempo: true } });
      if (d) f.sents.set(i, d); else f.sentWait[i] = 5;
    }
  }

  // ---- damage: only the open vents, by the ray (or the nearest one to a blast)
  function damage(e) {
    const z = e.enemy;
    if (z.kind === 'raps' || z.killing) return;   // ordinary damage; the core's last hit goes through
    const amount = e.amount; e.amount = 0;
    if (z.state === 'dying' || e.melee || !fight) return;
    z.root.updateMatrixWorld(true);
    const live = z.vents.filter(v => v.open && !v.dead && (v !== z.vents[4] || fight.reveal));
    let hit = null; const ray = K.hitRay(z);
    if (ray) { let bd = Infinity; for (const v of live) { const c = K.boneAt(z, v.at) ?? K.boneAt(z, v.d0); if (!c) continue; const p = ray.intersectSphere(new THREE.Sphere(c, v.r), V()); if (p) { const d = p.distanceTo(ray.origin); if (d < bd) { bd = d; hit = v; } } } }
    else if (e.cause === 'explosion' && live.length) { const p = K.player.getFeetPosition(); hit = live.sort((a, b) => (K.boneAt(z, a.at) ?? p).distanceTo(p) - (K.boneAt(z, b.at) ?? p).distanceTo(p))[0]; }
    if (!hit) return;
    const dmg = amount * (ray ? 1 : .5) / Math.max(1, K.playerCount());
    hit.pool -= dmg;
    const me = K.sync.me ?? 'solo'; (z.tally ??= new Map()).set(me, (z.tally.get(me) ?? 0) + dmg);
    if (Math.random() < .06 && S.A.pain_light_1 && !z.gunOff) play(z, 'pain_light_1', false);
    if (hit.pool <= 0) ventGone(z, hit);
  }
  function ventGone(z, v) {
    v.dead = true; v.open = false; glow(z);
    const i = z.vents.indexOf(v), at = K.boneAt(z, v.at) ?? z.root.position.clone().add(V(0, 150, 0));
    hideBone(z.bones.get(v.d0)); hideBone(z.bones.get(v.d1), false);
    K.boom(at, .7); K.sfxAt(K.pick('mech_destruction', 3), at, 1);
    fight.gone++;
    if (i === 0) fight.endExtra.push('raps');
    if (i === 1) fight.endExtra.push('spikes');
    gk.emit('nikolai:vent', i + 1);
    if (i === 4) { z.killing = true; enemies.hurt(z, z.health + 1, false, false, 'explosion', false); return; }
    api.announce?.('HEAT VENT DESTROYED', v.name.toUpperCase() + ' · ' + fight.gone + ' OF 5', 2.5);
    if (fight.gone >= 4 && !fight.reveal) {
      fight.reveal = true; z.vents[4].open = true; glow(z); hideBone(z.bones.get('tag_fx_vent_plate'));
      api.announce?.('THE CORE IS EXPOSED', '', 3); gk.emit('nikolai:reveal');
    }
  }
  function died(z) {
    z.state = 'dying'; z.life = 8; z.co = null;
    z.engine?.pause(); z.engine = null; z.spin?.pause();
    K.sfx('nik_death', 1); K.boom(z.root.position.clone().add(V(0, 150, 0)), 1.4);
    end(true);
  }
  function end(won) {
    const f = fight; if (!f) return; fight = null;
    clearTimeout(f.t20); clearTimeout(f.tz);
    for (const w of f.waves) w.stop?.();
    for (const r of [...f.raps]) enemies.hurt(r, r.health + 1, false, false, 'explosion', false);
    for (const s of f.spikes) s.life = Math.min(s.life, .5);
    for (const q of [...enemies.list]) if (q.tempo || q.kind === 'raz' || q.kind === 'sentinel') enemies.hurt(q, q.health + 1, false, false, 'explosion', false);
    if (won) { setTimeout(() => { if (K.inArena(K.player.getFeetPosition())) K.player.setPosition?.(RETURN.clone()); }, 4000); api.announce?.('NIKOLAI IS DOWN', '', 4); }
    gk.emit('nikolai:done', won);
  }
  K.host.on('reset', () => { if (fight) { const f = fight; fight = null; clearTimeout(f.t20); clearTimeout(f.tz); f.z.engine?.pause(); } });

  const debug = {
    start: () => start(),
    active,
    vents: () => (fight ? fight.z.vents.map(v => ({ name: v.name, pool: Math.round(v.pool), open: v.open, dead: v.dead })) : null),
    hitVent: (i, n = 1e5) => { if (!fight) return null; const v = fight.z.vents[i]; if (!v || v.dead) return null; v.pool -= n; if (v.pool <= 0) ventGone(fight.z, v); return debug.vents(); },
    kill: () => { if (!fight) return; for (const v of fight.z.vents) if (!v.dead) { v.pool = 0; if (v === fight?.z.vents[4]) fight.reveal = true; ventGone(fight.z, v); if (!fight) break; } },
    state: () => (fight ? { pos: fight.z.root.position.toArray().map(Math.round), act: fight.z.act, gone: fight.gone, reveal: fight.reveal, raps: fight.raps.size, cycle: fight.cycle, gunOff: !!fight.z.gunOff } : null),
    raps: () => { if (fight) for (let i = 0; i < 6; i++) launchRaps(fight.z, i); },
    spikes: () => { if (fight) for (let i = 0; i < 3; i++) harpoon(fight.z); },
    jump: () => { if (fight) fight.z.co = (function* () { yield* jump(fight.z); yield* script(fight.z); })(); },
  };
  return { ready: () => ready, start, active, damage, debug, get loaded() { return !!S; } };
}
