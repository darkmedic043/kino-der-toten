// Gorod Krovi's dragon (zm_stalingrad_dragon.gsc, the transport scenes of zm_stalingrad's roosts). One dragon circles
// the city (its two flight idles, BO3's clips at the struct tag_align_dragon_path). With the power on and the ride
// crafted, a roost console (500) calls it: it lands at that roost (arrive), waits 30 s (idle) and flies off again if
// nobody climbs on (timeout). Whoever uses a roost platform rides it (tag_passenger1) along BO3's own flight to
// Pavlov's House; 2 s after the clip's 'eject' note the rider is flung onto Pavlov's roof (s_pavlov_player) and lands
// in zone pavlovsb (gk 'dragon:landed'). The used console rests 120 s; the others are busy while the dragon is out.
// The clips carry tag_origin's motion as their own `root` track (CoD space, .tools/build_gorod_dragon.py); it is applied
// here to the model's tag_origin node (which holds the Z-up -> Y-up turn), every frame, inside world.prePlayer so the
// rider moves with the dragon in the same frame. Assets (ripped, git-ignored): maps/gorod-krovi/dragon/.
// The roost teleporters (TELEPORT_dragon*, built from the map) stay as the fallback: hidden while the dragon works,
// shown again if its model fails to load or the ride throws (a rider is then put down at their destination).
// The craftable (drop-pod code cylinders and the network console's parts) is pods.js; without it (scene assets missing,
// a co-op client) the ride counts as crafted once the power is on (flag dragonridecrafted), unless ?gkDragonCraft asks
// for the flag to be set by hand (kino.gorod.dragon.craft()). The map dragon's landings (flight_land_N) are not exported, so it circles, and every
// 60-120 s (15-25 s while this player owns the Guard of Fafnir with its runes done and the bath to go) it makes a fire
// pass: it leaves its path, swoops over an open street the player is in (the model offset and turned around its mouth,
// the flight clip still playing), breathes down it for 3 s and flies back. The breath is fx sprites (kino.fx, pooled and
// warmed by the fx mod; no lights, only fx.flash's pool), gk 'dragon:fire' {origin, dir (unit), dur, len} at the start
// and 'dragon:fireEnd' after; a player within FIRE.r of the line is burnt through gk.burn (0 while the shield is
// raised: shield.js counts that as the bath), zombies in it take fire damage. The Gauntlet's street fire
// (gauntlet-hazard.js, gk 'dragon:hazard' {on, at, dur, fallback}) is followed: the dragon swoops in fast and breathes on
// that area, without its own damage (the hazard burns players and turns zombies into napalm zombies itself), so the egg
// quest and the shield's bath share one dragon. Co-op: solo-first, every client runs its own dragon.
// ?noDragon: no dragon, the teleporters as before.
import * as THREE from 'three';
import { loadModel, loadAnimation, Rig } from '../../animation.js';
import { makeSfx } from './dragon-sfx.js';

const DIR = new URL('../maps/gorod-krovi/dragon/', import.meta.url).href;
const W = (x, y, z) => new THREE.Vector3(x, z, -y);   // CoD (x, y, z up) -> the map's (x, z, -y)
const ALIGN = W(0, 3204, 992);   // tag_align_dragon_path (angles 0)
const COST = 500, COOLDOWN = 120, IDLE_WAIT = 30, TAKEOFF = 2, EJECT_WAIT = 2, LAND_INVULN = 4;
const PLATFORM_R = 160, PLATFORM_H = 100, SEAT = 30;   // the rider's eye sits SEAT above tag_passenger1
const SITES = [   // zm_stalingrad's roost scenes: console trigger, console model (yaw), the platforms' centres (CoD)
  { id: 'library', roost: 2, label: 'Library', trigger: [2841.5, 3056.25, 0], model: [2851, 3056, 1, 270], platforms: [[3098.5, 2862, 72]] },
  { id: 'factory', roost: 1, label: 'Factory', trigger: [-2610, 2702, 496], model: [-2619, 2702, 496, 90], platforms: [[-2938.5, 2863, 568], [-2938.5, 2535, 568]] },
  { id: 'judicial', roost: 3, label: 'Judicial', trigger: [0, 5853, 304], model: [0, 5863, 305, 0], platforms: [[168.5, 6191, 376], [-168.5, 6191, 376]] },
];
const FIRE = { hazardSwoop: 1.2, every: [60, 120], hot: [15, 25], swoop: 2.6, leave: 2.6, dur: 3, len: 1500, up: 600, back: 600, past: 250, r: 220, tick: .25, dmg: 12, zdmg: 90 };
const PAVLOV = [W(-2859, 21437.8, 684), W(-2896.25, 21437.8, 684)];   // s_pavlov_player (the roof)
const SOUNDS = {   // clip notes -> sounds (dragon-sfx), [name or names, volume]
  'sndnt#evt_dragon_arrival': ['arrival', 1], 'sndnt#evt_dragon_idle_arrival': ['idle_arrival', .8], 'sndnt#evt_dragon_idle': ['idle', .7],
  'sndnt#evt_dragon_roar': [['roar0', 'roar1'], 1], 'sndnt#evt_dragon_depart_roar': [['depart0', 'depart1'], 1], 'sndnt#evt_dragon_pain': ['roar2', .9],
  big_wingflap: [['flap0', 'flap1'], .8], sml_wingflap: ['flap1', .45], wingflap_exit: ['flapfar', .7], wingflap_arrival: ['flapfar', .7],
  'sndnt#zmb_dragon_wing_flap_far': ['flapfar', .6], 'sndnt#zmb_dragon_wing_flap_far_qt': ['flapfar', .35],
  footstep_fl: ['foot0', .6], footstep_fr: ['foot1', .6], footstep_bl: ['foot0', .5], footstep_br: ['foot1', .5],
  platform_arrival: ['land', .9], zmb_dragon_wind_buffet: ['buffet', .9],
};

// a track sampled at a frame: frames sorted, values flat (stride 3 or 4)
function at(tr, f) {
  const fr = tr.frames, n = fr.length;
  if (f <= fr[0]) return [0, 0, 0]; if (f >= fr[n - 1]) return [n - 1, n - 1, 0];
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (fr[m] <= f) lo = m; else hi = m; }
  return [lo, hi, (f - fr[lo]) / (fr[hi] - fr[lo])];
}
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
function rootAt(clip, t, pos, rot) {
  const f = t * clip.fps, r = clip.root;
  if (r?.pos) { const [a, b, u] = at(r.pos, f); pos.fromArray(r.pos.values, a * 3).lerp(_v.fromArray(r.pos.values, b * 3), u); }
  if (r?.rot) { const [a, b, u] = at(r.rot, f); rot.fromArray(r.rot.values, a * 4).slerp(_q.fromArray(r.rot.values, b * 4), u); }
}

export default async function setupDragon(api, gk) {
  const { world, session, scene, player, camera } = api, host = api.host;
  const q = new URLSearchParams(location.search);
  const tps = world.teleporters.map((tp, i) => ({ tp, i })).filter(({ tp }) => /^TELEPORT_dragon/i.test(tp.name ?? ''));
  const dest = tps[0]?.tp.to?.position?.clone?.() ?? W(-3008, 21520, 0);   // the teleporters' landing (pavlovsB)
  const crafted = () => gk.hasFlag('dragonridecrafted');
  if (!q.has('gkDragonCraft')) host.on('update', () => { if (session.power && !crafted() && !gk.pods?.crafts) gk.setFlag('dragonridecrafted'); });   // without pods.js (missing assets, co-op client): crafted with the power
  // the fallback: the teleporters, locked until the ride is crafted
  let working = false;
  for (const { tp } of tps) Object.defineProperties(tp, { locked: { get: () => !crafted(), configurable: true }, lockedText: { value: 'Something is missing here', writable: true, configurable: true } });
  for (const e of world.interactions) if (e.kind === 'teleport' && tps.some(t => t.i === e.teleporter)) e.hidden = () => working;
  if (q.has('noDragon')) return;

  const sfx = makeSfx(api);
  let model, flights;
  try {
    [model, flights] = await Promise.all([loadModel(DIR + 'dragon.glb'), Promise.all(['flight_idle_a_1', 'flight_idle_b_1'].map(k => loadAnimation(DIR + 'anims/' + k + '.json')))]);
  } catch (e) { console.warn('[gorod-krovi] dragon assets missing, the roost teleporters stay', e.message); return; }
  if (!model) return;
  const consoleModel = await loadModel(DIR + 'console.glb').catch(() => null);

  // ---- the model
  const tO = model.getObjectByName('tag_origin'), AX = tO.quaternion.clone();
  const body = model.getObjectByName('tag_body_anim') ?? model.getObjectByName('tag_body'), seat = model.getObjectByName('tag_passenger1');
  model.traverse(o => { if (o.isBone && o !== tO) o.userData.bindPosition = o.position.clone(); if (o.isMesh) { o.frustumCulled = false; o.castShadow = o.receiveShadow = false; } });
  model.position.copy(ALIGN); model.name = 'gorod-dragon';
  scene.add(model);   // drawn once while loading (the engine's warm-up shows hidden objects), then flying
  const rig = new Rig(model);
  const clips = {};
  const addClip = (k, d) => { if (d && !clips[k]) { clips[k] = d; rig.add(k, d); } };
  addClip('flight_idle_a_1', flights[0]); addClip('flight_idle_b_1', flights[1]);
  const siteClips = site => Promise.all(['arrive', 'idle', 'ride', 'timeout'].map(async k => { const key = `roost${site.roost}_${k}`; addClip(key, await loadAnimation(DIR + 'anims/' + key + '.json')); }));
  let prefetched = false;
  host.on('start', () => { if (!prefetched) { prefetched = true; setTimeout(() => { for (const s of SITES) siteClips(s).catch(() => {}); }, 8000); } });

  // ---- consoles and platforms
  for (const s of SITES) {
    s.trigger = W(...s.trigger); s.plats = s.platforms.map(p => W(...p)); s.readyAt = 0; s.boards = [];
    if (consoleModel) {
      const c = consoleModel.clone(true), [x, y, z, yaw] = s.model;
      c.position.copy(W(x, y, z)); c.rotation.y = yaw * Math.PI / 180; c.name = 'gorod-dragon-console-' + s.id;
      c.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = false; });
      scene.add(c); c.updateMatrixWorld(true);
    }
  }

  // ---- the state: one dragon. phase fly (circling) | arrive | idle | board (a rider, taking off) | ride | timeout
  const D = { phase: 'fly', site: null, key: null, t: 0, wait: 0, rider: false, ejected: false, ejectAt: Infinity, err: null };
  const pos = new THREE.Vector3(), rot = new THREE.Quaternion();
  let fling = null, lastYaw = null, stepped = false;
  let F = null, swooped = false, fireAt = 0, hotCheck = 0, passes = 0, lastFire = null;   // the fire pass (below)
  working = true;

  function play(key) { D.key = key; D.t = 0; rig.play(key, /idle$/.test(key), 1, 0); D.notes = clips[key].notifies?.map(n => [n.name, n.time]) ?? []; }
  function flyOn() { D.phase = 'fly'; D.site = null; play(Math.random() < .5 ? 'flight_idle_a_1' : 'flight_idle_b_1'); }
  const bodyPos = () => (body ?? model).getWorldPosition(new THREE.Vector3());
  const yawOf = () => { const x = new THREE.Vector3(1, 0, 0).transformDirection((body ?? model).matrixWorld); return Math.atan2(-x.z, x.x); };
  function sound(name) {
    const s = SOUNDS[name]; if (!s) return;
    const n = Array.isArray(s[0]) ? s[0][Math.floor(Math.random() * s[0].length)] : s[0];
    if (D.rider) sfx.sfx(n, s[1] * (name === 'zmb_dragon_wind_buffet' ? 1 : .8)); else sfx.sfxAt(n, bodyPos(), s[1], 6000);
  }
  function notes(from, to) {
    for (const [n, t] of D.notes ?? []) if (t > from && t <= to) { sound(n); if (n === 'eject' && D.phase === 'ride') D.ejectAt = D.t + EJECT_WAIT; }
  }

  function summon(site) {
    if (D.phase !== 'fly' || F) return false;
    D.phase = 'arrive'; D.site = site; D.wait = 0; D.rider = false; D.ejected = false; D.ejectAt = Infinity;
    siteClips(site).then(() => { if (D.site === site && D.phase === 'arrive') { play(`roost${site.roost}_arrive`); sfx.sfxAt('dragon_alarm', site.trigger, .7); } }).catch(e => broken(e));
    return true;
  }
  function board() {
    if (D.phase !== 'idle' || D.rider || session.phase === 'reviving' || session.phase === 'gameover') return false;
    D.rider = true; D.phase = 'board'; D.boardT = 0; lastYaw = null; gk.emit('dragon:ride', D.site?.id);
    if (api.features) api.features.flight = true;
    sfx.sfx('mount', .9); api.toast?.('Hold on', 2);
    return true;
  }
  function land() {
    const to = fling.to; fling = null;
    player.setPosition(to.clone().add(new THREE.Vector3(0, 2, 0)));
    if (api.features) api.features.flight = false;
    session.effects.invulnerable = Math.max(session.effects.invulnerable ?? 0, session.time + LAND_INVULN);
    session.flags.add('zone:pavlovsb'); sfx.sfx('land', .8);
    gk.emit('dragon:landed', 'pavlovsb');
  }
  function eject() {
    D.ejected = true; D.rider = false;
    const from = camera.position.clone().sub(new THREE.Vector3(0, player.eyeHeight ?? 60, 0)), to = PAVLOV[0].clone();
    const h = world.raycast?.(new THREE.Ray(to.clone().add(new THREE.Vector3(0, 40, 0)), new THREE.Vector3(0, -1, 0)), 0, 1200);   // the roof struct floats over a floor that isn't solid in the port: land on what is
    if (h) to.y += 40 - h.distance; else to.copy(dest);
    const dist = from.distanceTo(to), T = THREE.MathUtils.clamp(dist / 600, .8, 2.2);
    fling = { from, to, T, t: 0, peak: 120 + dist * .15 };
    sfx.sfx('end0', .8);
  }
  function broken(e) {
    console.error('[gorod-krovi] dragon', e); D.err = String(e?.message ?? e); working = false;
    if (D.rider || fling) { player.setPosition(dest.clone().add(new THREE.Vector3(0, 2, 0))); session.flags.add('zone:pavlovsb'); gk.emit('dragon:landed', 'pavlovsb'); }
    D.rider = false; fling = null; if (api.features) api.features.flight = false;
    model.visible = false; D.phase = 'off';
    if (F) { const was = F.stage === 'breath'; F = null; if (was) gk.emit('dragon:fireEnd'); }
  }

  // one step of the dragon: its clip, its root, the notes, the phase changes
  function step(dt) {
    if (D.phase === 'off' || !D.key) return;
    const data = clips[D.key], dur = data.duration, loop = /idle$/.test(D.key);
    const before = D.t; D.t += dt; rig.update(dt);
    const t = loop ? D.t % dur : Math.min(D.t, dur), tb = loop ? before % dur : Math.min(before, dur);
    if (t >= tb) notes(tb, t); else { notes(tb, dur); notes(-1, t); }
    rootAt(data, t, pos, rot);
    tO.position.set(pos.x, pos.z, -pos.y); tO.quaternion.copy(AX).multiply(rot);
    if (swooped) { model.position.copy(ALIGN); model.quaternion.identity(); model.updateMatrix(); swooped = false; }
    model.updateMatrixWorld(true);
    if (F) swoop();
    const s = D.site;
    if (D.phase === 'fly' && D.t >= dur) flyOn();
    else if (D.phase === 'arrive' && D.key.endsWith('arrive') && D.t >= dur) { D.phase = 'idle'; D.wait = 0; play(`roost${s.roost}_idle`); }
    else if (D.phase === 'idle') { D.wait += dt; if (D.wait >= IDLE_WAIT) { D.phase = 'timeout'; play(`roost${s.roost}_timeout`); } }
    else if (D.phase === 'board') { D.boardT += dt; if (D.boardT >= TAKEOFF) { D.phase = 'ride'; play(`roost${s.roost}_ride`); sfx.sfx('start', .9); } }
    else if (D.phase === 'ride') { if (D.rider && D.t >= D.ejectAt) eject(); if (D.t >= dur) { if (D.rider) eject(); s.readyAt = session.time + COOLDOWN; flyOn(); } }
    else if (D.phase === 'timeout' && D.t >= dur) { s.readyAt = session.time + COOLDOWN; flyOn(); }
  }
  function safeStep(dt) { if (stepped) return; stepped = true; try { step(dt); } catch (e) { broken(e); } }

  // the rider and the fling take the player over (custom.js prePlayer -> world.prePlayer)
  const pre = world.prePlayer;
  world.prePlayer = dt => {
    safeStep(Math.min(dt, .1));
    if (D.rider && seat) {
      const p = seat.getWorldPosition(new THREE.Vector3());
      player.setPosition(p.add(new THREE.Vector3(0, SEAT - (player.eyeHeight ?? 60), 0)));
      const y = yawOf(); if (lastYaw != null) { let d = y - lastYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); camera.rotation.y += d; } lastYaw = y;
      session.effects.invulnerable = Math.max(session.effects.invulnerable ?? 0, session.time + 1);
      return true;
    }
    if (fling) {
      fling.t += dt; const u = Math.min(1, fling.t / fling.T);
      const p = fling.from.clone().lerp(fling.to, u); p.y += fling.peak * 4 * u * (1 - u);
      player.setPosition(p); session.effects.invulnerable = Math.max(session.effects.invulnerable ?? 0, session.time + 1);
      if (u >= 1) land();
      return true;
    }
    return !!pre?.(dt);
  };
  // ---- the fire pass: F {stage swoop | breath | leave, t, w (0..1, how far the model has left its path), origin, dir, ...}
  const mouth = model.getObjectByName('tag_mouth_fx_anim') ?? model.getObjectByName('j_head_anim') ?? body ?? model;
  const UP = new THREE.Vector3(0, 1, 0), fray = new THREE.Ray(), tv = new THREE.Vector3(), tq = new THREE.Quaternion();
  const rnd = (a, b) => a + Math.random() * (b - a), jit = r => new THREE.Vector3(rnd(-r, r), rnd(-r, r), rnd(-r, r));
  const smooth = x => { x = THREE.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const hot = () => { const s = window.kino?.gorod?.shield?.state?.(), a = window.kino?.rocketShield?.state?.()?.alt; return !!(s && a?.fafnir && s.quest.runes >= 3 && !s.quest.bathed && !s.quest.done); };
  const schedule = () => { const [a, b] = hot() ? FIRE.hot : FIRE.every; fireAt = session.time + rnd(a, b); };
  // where to breathe: the player's feet, along the horizontal direction with the longest open street whose origin (up and
  // back from them) they can see; null if they are under a roof
  function plan(o) {
    const feet = o.at ? (Array.isArray(o.at) ? new THREE.Vector3(...o.at) : o.at.clone()) : player.getFeetPosition();
    if (o.at) { fray.origin.copy(feet).y += 150; fray.direction.set(0, -1, 0); const g = world.raycast(fray, 0, 600); if (g) feet.y += 150 - g.distance; }   // a volume's centre -> its floor
    const chest = feet.clone().add(new THREE.Vector3(0, 60, 0));
    const tries = o.dir ? [new THREE.Vector3(o.dir.x ?? o.dir[0], 0, o.dir.z ?? o.dir[2]).normalize()]
      : Array.from({ length: 12 }, (_, i) => { const a = (i + Math.random() * .3) / 12 * Math.PI * 2; return new THREE.Vector3(Math.cos(a), 0, Math.sin(a)); });
    let best = null;
    for (const h of tries) {
      const origin = feet.clone().addScaledVector(h, -FIRE.back).add(new THREE.Vector3(0, FIRE.up, 0));
      tv.subVectors(origin, chest); const d = tv.length(); fray.origin.copy(chest); fray.direction.copy(tv).divideScalar(d);
      if (!o.dir && !o.anyway && world.raycast(fray, 0, d)) continue;   // a roof or a wall between them and the dragon
      fray.direction.copy(h); const fw = world.raycast(fray, 0, 1500)?.distance ?? 1500;
      fray.direction.copy(h).negate(); const bk = world.raycast(fray, 0, 1500)?.distance ?? 1500;
      const score = Math.min(fw, 600) + bk + Math.random() * 100;
      if (!best || score > best.score) best = { h, origin, score };
    }
    if (!best) return o.force && !o.anyway ? plan({ ...o, anyway: true }) : null;
    return { origin: best.origin, dir: feet.clone().addScaledVector(best.h, FIRE.past).sub(best.origin).normalize(), h: best.h, feet };
  }
  function startPass(o = {}) {
    if (D.phase !== 'fly' || F || D.rider || fling) return false;
    const p = plan(o); if (!p) return false;
    const len = o.len ?? FIRE.len; fray.origin.copy(p.origin); fray.direction.copy(p.dir);
    const reach = world.raycast(fray, 0, len)?.distance ?? Math.min(len, (p.origin.y - p.feet.y) / Math.max(.2, -p.dir.y));
    F = { stage: 'swoop', t: 0, w: 0, swoopT: o.swoop ?? FIRE.swoop, hurt: o.hurt !== false, why: o.why ?? 'pass', origin: p.origin, dir: p.dir, h: p.h, side: new THREE.Vector3(-p.h.z, 0, p.h.x), dur: o.dur ?? FIRE.dur, len,
      ground: p.origin.clone().addScaledVector(p.dir, reach), yaw: Math.atan2(-p.h.z, p.h.x), dy: null, pre: false, tick: 0, flash: 0, acc: [0, 0, 0], burnt: 0, hits: 0, zombies: 0 };
    sfx.sfxAt(Math.random() < .5 ? 'roar0' : 'roar1', p.feet, 1, 8000);
    return true;
  }
  // the model leaves its path: offset and turned (about Y) so the mouth sits at the origin facing along the street
  function swoop() {
    const w = F.w; if (w <= 0) return;
    const m = mouth.getWorldPosition(tv).sub(ALIGN);
    let dy = F.yaw - yawOf(); dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    if (F.dy != null) { const d = dy - F.dy; dy = F.dy + Math.atan2(Math.sin(d), Math.cos(d)); }   // no flip at +-180
    F.dy = dy;
    tq.setFromAxisAngle(UP, w * dy); m.applyQuaternion(tq);
    model.quaternion.copy(tq); model.position.copy(ALIGN).addScaledVector(F.origin.clone().sub(ALIGN).sub(m), w);
    model.updateMatrix(); model.updateMatrixWorld(true); swooped = true;
  }
  const inLine = (p, out) => { const v = out.copy(p).sub(F.origin), a = v.dot(F.dir); return a > 0 && a < F.len && v.addScaledVector(F.dir, -a).length() < FIRE.r; };
  function breathe(dt) {
    const fx = window.kino?.fx, from = mouth.getWorldPosition(new THREE.Vector3());
    if (fx?.emit) {   // pooled, warmed sprites (fx mod): the stream mouth -> floor, the fire carpet, a little smoke
      F.acc[0] += dt * 110; F.acc[1] += dt * 45; F.acc[2] += dt * 7;
      for (; F.acc[0] >= 1; F.acc[0]--) { const u = Math.random(); fx.emit({ key: 'fire', at: from.clone().lerp(F.ground, u).add(jit(8 + u * 50)), vel: F.dir.clone().multiplyScalar(420).add(jit(40)), size: [35 + u * 60, 100 + u * 150], life: rnd(.3, .45), fade: [.04, .6], additive: true, opacity: .9, spin: rnd(-1, 1) }); }
      for (; F.acc[1] >= 1; F.acc[1]--) { const at = F.ground.clone().addScaledVector(F.h, rnd(-380, 300)).addScaledVector(F.side, rnd(-150, 150)); at.y += rnd(10, 40); fx.emit({ key: 'fire', at, vel: jit(30).setY(rnd(60, 130)), size: [45, rnd(130, 210)], life: rnd(.55, .85), fade: [.06, .55], additive: true, spin: rnd(-1, 1) }); }
      for (; F.acc[2] >= 1; F.acc[2]--) { const at = F.ground.clone().addScaledVector(F.h, rnd(-300, 250)).addScaledVector(F.side, rnd(-120, 120)); at.y += 80; fx.emit({ key: 'smoke', at, vel: jit(20).setY(rnd(50, 90)), size: [80, rnd(240, 320)], life: rnd(1.3, 1.8), fade: [.15, .6], opacity: .5, color: 0x3e3833, drag: .6 }); }
    }
    if ((F.flash -= dt) <= 0 && fx?.flash) { F.flash = .3; fx.flash(F.ground.clone().add(new THREE.Vector3(0, 60, 0)), { color: 0xff7a26, intensity: 7, radius: 900, life: .45 }); }   // the lighting mod's pool, no new light
    if ((F.tick -= dt) > 0) return; F.tick = FIRE.tick;
    // the player: shield.js's bath test (feet + 40 within FIRE.r of the line); gk.burn is 0 while the shield is raised
    if (!F.hurt) return;   // the Gauntlet's fire burns on its own (gauntlet-hazard.js)
    if (session.phase !== 'reviving' && session.phase !== 'gameover' && inLine(player.getFeetPosition().clone().add(new THREE.Vector3(0, 40, 0)), tv)) {
      const n = gk.burn ? gk.burn(FIRE.dmg) : (api.damage?.(FIRE.dmg), FIRE.dmg);
      F.hits++; F.burnt += n; gk.emit('dragon:burn', { blocked: !n, secs: FIRE.tick });   // challenges 1_6 (burned) and 2_4 (blocked)
    }
    for (const z of [...(api.enemies?.list ?? [])]) {   // plain zombies in the fire burn (no points); specials shrug it off
      if (z.kind !== 'zombie' || z.thrall || !inLine(z.root.position.clone().add(new THREE.Vector3(0, 40, 0)), new THREE.Vector3())) continue;
      api.enemies.hurt(z, FIRE.zdmg, false, false, 'fire', false); F.zombies++; fx?.burn?.(z.root.position.clone().add(new THREE.Vector3(0, 40, 0)));
    }
  }
  function fireTick(dt) {
    if (D.phase === 'off') return;
    if (!F) {
      if (!(session.phase === 'fighting' || session.phase === 'preparing') || D.phase !== 'fly' || D.rider || fling) return;
      if (hazardNext) { const h = hazardNext; hazardNext = null; if (followHazard(h)) return; }
      if (!fireAt) schedule();
      if (session.time >= hotCheck) { hotCheck = session.time + 1; if (fireAt - session.time > FIRE.hot[1] && hot()) schedule(); }
      if (session.time >= fireAt && !startPass()) fireAt = session.time + rnd(10, 20);   // the player is under a roof: soon again
      return;
    }
    F.t += dt;
    if (F.stage === 'swoop') {
      F.w = smooth(F.t / F.swoopT);
      if (!F.pre && F.t > F.swoopT - 1.1) { F.pre = true; if (F.hurt) sfx.sfxAt('breath_pre', F.origin, 1, 6000); }   // the hazard plays its own
      if (F.t >= F.swoopT) {
        F.stage = 'breath'; F.t = 0; F.w = 1;
        gk.emit('dragon:fire', { origin: F.origin.clone(), dir: F.dir.clone(), dur: F.dur, len: F.len });
        if (F.hurt) sfx.sfxAt('breath', F.origin, 1, 6000);
      }
    } else if (F.stage === 'breath') {
      breathe(dt);
      if (F.t >= F.dur) { F.stage = 'leave'; F.t = 0; gk.emit('dragon:fireEnd'); }
    } else {
      F.w = 1 - smooth(F.t / FIRE.leave);
      if (F.t >= FIRE.leave) { const was = F.why; lastFire = { why: was, burnt: F.burnt, hits: F.hits, zombies: F.zombies, origin: F.origin.toArray().map(Math.round), dir: F.dir.toArray().map(v => +v.toFixed(3)) }; F = null; passes++; if (was === 'pass' || fireAt - session.time < 20) schedule(); }
    }
  }

  // the Gauntlet's street fire: fly over and breathe on it (the stand-in in gauntlet-hazard.js keeps the timing)
  let hazardNext = null;   // a fire that started while the dragon was busy breathing elsewhere
  function followHazard(e) {
    const left = (e.dur ?? 10) - (session.time - e.t0);
    if (left < 2.5 || D.phase !== 'fly' || D.rider || fling) return false;
    return startPass({ at: e.at, dur: Math.max(1.5, Math.min(4, left - FIRE.hazardSwoop - 1)), swoop: FIRE.hazardSwoop, hurt: false, force: true, why: 'hazard:' + e.area });
  }
  gk.on('dragon:hazard', e => {
    if (!e?.at) return;
    if (!e.on) { if (hazardNext?.area === e.area) hazardNext = null; return; }
    const h = { area: e.area, at: e.at.clone(), dur: e.dur, t0: session.time };
    if (F) hazardNext = h; else followHazard(h);
  });

  host.on('update', dt => { safeStep(Math.min(dt || 1 / 60, .1)); stepped = false;
    for (const s of SITES) for (const b of s.boards) {   // a platform's prompt follows the player while they stand on it
      const f = player.getFeetPosition(), inside = Math.hypot(f.x - b.at.x, f.z - b.at.z) < PLATFORM_R && Math.abs(f.y - b.at.y) < PLATFORM_H;
      b.e.position.copy(inside ? camera.position : b.at);
    }
    try { fireTick(Math.min(dt || 1 / 60, .1)); } catch (e) { console.error('[gorod-krovi] dragon fire', e); if (F?.stage === 'breath') gk.emit('dragon:fireEnd'); F = null; fireAt = session.time + 60; }
  });
  host.on('reset', () => {
    if (D.phase === 'off') return;
    D.rider = false; fling = null; if (api.features) api.features.flight = false;
    if (F?.stage === 'breath') gk.emit('dragon:fireEnd');
    F = null; fireAt = 0; hazardNext = null;
    for (const s of SITES) s.readyAt = 0; flyOn();
  });

  for (const s of SITES) {
    world.addInteraction({
      position: s.trigger.clone().add(new THREE.Vector3(0, 40, 0)),
      hidden: () => D.phase === 'off',
      text() {
        if (!session.power) return 'The power must be activated';
        if (!crafted()) return 'The dragon will not answer · something is missing';
        if (D.site === s) return D.phase === 'arrive' ? 'The dragon is on its way' : D.phase === 'idle' ? 'The dragon is waiting · climb on' : 'The dragon is away';
        if (D.phase !== 'fly' || F) return 'The dragon is busy';
        if (s.readyAt > session.time) return 'The dragon is resting · ' + Math.ceil(s.readyAt - session.time) + 's';
        return 'Call the dragon · ' + COST;
      },
      use() {
        if (!session.power || !crafted() || D.phase !== 'fly' || F || s.readyAt > session.time) return false;
        if (session.points < COST) { api.toast?.('Not enough points', 2); return false; }
        session.points -= COST; api.audio?.play?.('buy');
        summon(s); api.toast?.('The dragon is coming to the ' + s.label, 3);
        return true;
      },
    });
    for (const p of s.plats) {
      const e = world.addInteraction({ position: p.clone(), hidden: () => !(D.site === s && D.phase === 'idle'), text: () => 'Ride the dragon', use: () => board() });
      s.boards.push({ at: p, e });
    }
  }
  flyOn();

  const handle = {
    state: () => ({ phase: D.phase, site: D.site?.id ?? null, clip: D.key, t: +D.t.toFixed(2), rider: D.rider, fling: !!fling, ejectAt: D.ejectAt, working, err: D.err, crafted: crafted(),
      sites: SITES.map(s => ({ id: s.id, ready: s.readyAt <= session.time })),
      fire: F ? { why: F.why, stage: F.stage, t: +F.t.toFixed(2), origin: F.origin.toArray().map(Math.round), dir: F.dir.toArray().map(v => +v.toFixed(3)), burnt: F.burnt, hits: F.hits } : null,
      nextFire: fireAt ? +(fireAt - session.time).toFixed(1) : null, passes, lastFire }),
    fire: o => startPass(o ?? {}),   // force a fire pass at the player (or o.at, a Vector3 / [x,y,z]; o.dir horizontal; o.dur, o.len)
    summon: id => summon(SITES.find(s => s.id === id) ?? SITES[1]),
    board, craft: () => gk.setFlag('dragonridecrafted'),
    skip: sec => { for (let k = 0; k < sec * 30; k++) { stepped = false; safeStep(1 / 30); } },   // fast-forward the dragon alone (tests)
    seat: () => seat?.getWorldPosition(new THREE.Vector3()), body: bodyPos, model, sites: SITES, pavlov: PAVLOV, dest,
    break: e => broken(e ?? new Error('test')),
  };
  gk.dragon = handle; if (window.kino?.gorod) window.kino.gorod.dragon = handle;
}
