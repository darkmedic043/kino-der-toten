// More of Der Eisendrache's side Easter eggs (zm_castle_ee_side.gsc), on BO3's spots, with BO3's sounds (castle-audio.js):
//   The clock tower    once the Fire quest has begun (the clock-tower wall shot), plant the Ragnarok at the top of the
//                      clock tower (clocktower_power_trig): the tower takes power, its clock reads 1:15. Its lever
//                      (ee_clocktower_activation_switch) starts and stops it: running, a minute every 0.4 s; stopped,
//                      lightning strikes the tower's rod every 5-15 s and nudges it on a minute. A strike while it reads
//                      9:35 powers the undercroft's wall-run runes (side.js: the plunger's trip takes two laps of them).
//   Requiem            use the three gramophones (hs_gramophone): the Requiem plays.
//   Dead Again         use the three teddy bears (hs_bear): "Dead Again" plays.
//   The music box      use it (ee_music_box): Samantha's tune for 36 s while it turns.
//   The skulls         with In Plain Sight chewed, three skulls float where you couldn't see them (ee_flying_skull_*);
//                      shoot each with an upgraded bow: a skull pile grows in the lab (ee_skull_pile_*); with three, use
//                      it: the piles burst and leave a power-up (BO3 just bursts them and starts over).
//   The claw hat       three Panzersoldat claws hang around the castle (ee_claw_N_start). Shoot one down (it drops to
//                      _fell), shoot it again: its rocket fires it to _shot over a second, and any Panzersoldat within 128
//                      of it on the way dies. Three Panzers killed that way: everyone wears a claw hat (on the third-person
//                      character), and Panzers' hits do half.
// Co-op (sync.js): the clock runs on the host (its time goes to everyone; strikes are events), the lever, the music
// eggs, the skull piles and the claws are the team's; In Plain Sight's skulls show to whoever has it chewed; the claw
// hat is everyone's (BO3 gives it to all), its kills the host's.
// Testing: kino.castle.side2.state(), .power(), .setClock(h, m), .strike(), .hat().
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { sfx, sfxAt, music, musicPlaying } from './castle-audio.js';

const W = (x, y, z) => new THREE.Vector3(x, z, -y);
export const SPOT = { towerTop: W(-1084, 1582, 1072), lever: W(-991, 1566, 844), rod: W(-854, 1490, 1388) };
export const GRAMOPHONES = [W(-1105, 3396, 684), W(572, 2828, 726), W(-1099, 2772, 292)];
export const CLAWS = [0, 1, 2].map(k => ({ start: [W(-211, 509, 293), W(-32, 4080, 1045), W(1700, 2786, 767)][k], fell: [W(-211, 509, 205), W(-32, 4080, 789), W(1698, 2785, 594)][k], shot: [W(-767, 257, 377), W(32, 3224, 921), W(1680, 1831, 593)][k] }));
export const SKULLS = [W(-1515, 160, 456), W(1790, 1230, 364), W(-848, 2891, 926)];
const HAT_URL = new URL('./claw/claw_hat.glb', import.meta.url).href;

export function setupSide2(api, { bows }) {
  const { world, session, host, player, camera, enemies, scene, toast, announce, powerups, data, sync } = api;
  const root = world.root, kino = window.kino, node = n => root.getObjectByName(n);
  const nodes = re => { const out = []; root.traverse(o => { if (re.test(o.name)) out.push(o); }); return out; };
  const st = { clock: { powered: false, running: false, h: 1, m: 15, tick: 0, strikeIn: 8, wallrun: false }, gram: new Set(), bears: new Set(), box: 0, skulls: new Set(), skullDone: false, claws: [0, 0, 0], clawKills: 0, hat: false };
  const tex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.3)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const glow = (p, color, size) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); m.position.copy(p); m.scale.setScalar(size); scene.add(m); return m; };
  const flashes = [];
  function flash(p, color, intensity, radius, life) { const pool = kino.lighting?.sources; if (!pool) return; const s = { position: p.clone(), color: new THREE.Color(color), intensity, radius, kind: 'solid', dynamic: true, cap: 2000, weight: 1 }; pool.push(s); flashes.push({ s, life, max: life }); }
  const lines = [];
  function bolt(a, b) { const pts = [a.clone()]; for (let i = 1; i < 10; i++) pts.push(a.clone().lerp(b, i / 10).add(new THREE.Vector3((Math.random() - .5) * 60, (Math.random() - .5) * 30, (Math.random() - .5) * 60))); pts.push(b.clone()); const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xdff2ff, transparent: true, blending: THREE.AdditiveBlending })); scene.add(l); lines.push({ l, life: .25 }); }
  const I = (position, text, use, hidden) => world.addInteraction({ position, text, use, hidden });

  // ---- the clock tower -------------------------------------------------------------------------------------------------
  const minute = node('CASTLE_SM_ee_clocktower_minute_hand'), hour = node('CASTLE_SM_ee_clocktower_hour_hand');
  const handRest = new Map([[minute, minute?.quaternion.clone()], [hour, hour?.quaternion.clone()]]);
  const AXIS = new THREE.Vector3(0, 0, 1);   // BO3 turns the hands with rotatepitch (CoD Y = the model's -Z here)
  function showClock() {   // minute hand 6° a minute, hour hand 30° an hour plus its share of the minutes
    const c = st.clock;
    if (minute) { minute.quaternion.copy(handRest.get(minute)).multiply(new THREE.Quaternion().setFromAxisAngle(AXIS, -(c.m - 15) * Math.PI / 30)); minute.updateMatrixWorld(true); }
    if (hour) { hour.quaternion.copy(handRest.get(hour)).multiply(new THREE.Quaternion().setFromAxisAngle(AXIS, -((c.h % 12) * 60 + c.m - 75) * Math.PI / 360)); hour.updateMatrixWorld(true); }
  }
  const timeText = () => `${st.clock.h || 12}:${String(st.clock.m).padStart(2, '0')}`;
  function tickMinute() { const c = st.clock; c.m++; if (c.m === 60) { c.m = 0; c.h = (c.h + 1) % 12; } showClock(); sfxAt(c.m % 12 === 0 ? 'hour_hand_01' : 'min_hand_01', SPOT.towerTop, camera, .5); }
  // a strike: the host's (every 5-15 s while stopped); every client sees it, the minute it adds and its 9:35
  const strike = () => { if (sync.isHost) sync.act('clockStrike'); };
  sync.on('clockStrike', (d, ctx) => {
    bolt(SPOT.rod.clone().add(new THREE.Vector3(0, 1500, 0)), SPOT.rod); flash(SPOT.rod, 0xdff2ff, 8, 2500, .4); sfx(ctx.rand() < .5 ? 'thunder_close' : 'lightning_flash_00', .8);
    if (st.clock.h === 9 && st.clock.m === 35 && !st.clock.wallrun) { st.clock.wallrun = true; sfx('clock_complete_00', .9); announce?.('THE CLOCK', 'SOMETHING STIRS IN THE UNDERCROFT', 3); }
    tickMinute();
  });
  const powerTower = () => sync.act('clockPower');
  sync.on('clockPower', () => { if (st.clock.powered) return; st.clock.powered = true; st.clock.strikeIn = 4; flash(SPOT.towerTop, 0x9fd8ff, 6, 900, 1); sfx('clock_lever', .7); toast?.(`The clock tower has power · it reads ${timeText()}`, 3); });
  sync.on('clockLever', () => { if (!st.clock.powered) return; st.clock.running = !st.clock.running; st.clock.tick = 0; sfx('clock_lever', .7); });
  // the host's clock for everyone (ticks heard as the minute changes)
  sync.shared('clock', () => ({ h: st.clock.h, m: st.clock.m, running: st.clock.running, powered: st.clock.powered, wallrun: st.clock.wallrun }), s => {
    const c = st.clock, moved = s.m !== c.m || s.h !== c.h; Object.assign(c, s); if (moved) { showClock(); sfxAt(c.m % 12 === 0 ? 'hour_hand_01' : 'min_hand_01', SPOT.towerTop, camera, .5); }
  });
  I(SPOT.lever, () => st.clock.powered ? `${st.clock.running ? 'Stop' : 'Start'} the clock · ${timeText()}` : 'A lever with no power', () => {
    if (!st.clock.powered) return false; sync.act('clockLever'); return true;
  });
  showClock();

  // ---- the music eggs ------------------------------------------------------------------------------------------------------
  sync.on('gram', d => { if (st.gram.has(d.k)) return; st.gram.add(d.k); sfxAt('gramophone_activate', GRAMOPHONES[d.k], camera, .8, 2500); if (st.gram.size === 3 && !musicPlaying()) { music('requiem', { vol: .7 }); announce?.('REQUIEM', '', 2.5); } });
  sync.on('bear', d => { if (st.bears.has(d.k)) return; st.bears.add(d.k); sfx('skull_119', .5); if (st.bears.size === 3 && !musicPlaying()) { music('dead_again', { vol: .8 }); announce?.('DEAD AGAIN', 'ELENA SIEGMAN', 3); } });
  sync.on('musicbox', () => { if (st.box > 0) return; st.box = 36; if (box) sfxAt('musicbox', box.getWorldPosition(new THREE.Vector3()), camera, 1, 1800); });
  GRAMOPHONES.forEach((p, k) => I(p.clone().add(new THREE.Vector3(0, 20, 0)), () => 'Play the gramophone', () => { sync.act('gram', { k }); return true; }, () => st.gram.has(k)));
  nodes(/^CASTLE_EE_bear_\d+$/).forEach((o, k) => { const p = o.getWorldPosition(new THREE.Vector3()); I(p, () => 'Squeeze the teddy bear', () => { sync.act('bear', { k }); return true; }, () => st.bears.has(k)); });
  const box = node('CASTLE_EE_musicbox_0');
  if (box) I(box.getWorldPosition(new THREE.Vector3()), () => 'Wind the music box', () => { sync.act('musicbox'); return true; }, () => st.box > 0);

  // ---- the skulls (In Plain Sight) ---------------------------------------------------------------------------------------------
  const skulls = SKULLS.map((p, k) => ({ o: node('CASTLE_EE_skull_' + k), base: p }));
  const piles = [0, 1, 2].map(k => node('CASTLE_EE_skullpile_' + k));
  const pilePos = piles[2]?.getWorldPosition(new THREE.Vector3()) ?? W(-877, 3631, 691);
  I(pilePos, () => 'Take the skulls', () => { sync.act('skullTake'); return true; }, () => st.skulls.size < 3);
  sync.on('skullTake', () => {
    if (st.skulls.size < 3) return; for (const p of piles) if (p) p.visible = false; flash(pilePos, 0xff7a2a, 5, 600, .6); sfx('skull_193', .9);
    if (sync.isHost) { const types = Object.keys(data.powerups ?? {}).filter(t => t !== 'fire_sale'); powerups?.spawn?.(types[Math.floor(Math.random() * types.length)], pilePos.clone().add(new THREE.Vector3(30, 0, 0))); }   // power-ups are the host's (synced)
    st.skulls.clear();
  });
  sync.on('skullShot', d => { const s = skulls[d.k]; if (!s || st.skulls.has(d.k)) return; s.o && (s.o.visible = false); st.skulls.add(d.k); if (piles[st.skulls.size - 1]) piles[st.skulls.size - 1].visible = true; sfx(['skull_119', 'skull_167', 'skull_193'][d.k], .8); flash(s.base, 0xff7a2a, 4, 500, .5); });
  // ---- the claws -------------------------------------------------------------------------------------------------------------------
  const claws = CLAWS.map((c, k) => ({ ...c, o: node('CASTLE_EE_claw_' + k), stage: 0, t: 0, p: c.start.clone() }));
  // bullets: the custom map's shoot targets (one-shot spheres tested against every hitscan ray), re-armed per stage
  world.shootTargets ??= [];
  const armClaw = c => { if (c.o && c.stage < 2) world.shootTargets.push({ position: c.p, radius: 22, hit: () => sync.act('clawShot', { k: claws.indexOf(c) }) }); };
  sync.on('clawShot', d => { const c = claws[d.k]; if (!c) return; world.shootTargets = (world.shootTargets ?? []).filter(t => t.position !== c.p); shootClaw(c); });
  claws.forEach(armClaw);
  // arrows and bullets: bow impacts arrive as effect(p, 0xffb347, 25); bullets as hits on a wall, 3-count effects
  host.on('effect', e => {
    const p = e.position; if (!p) return;
    const upBow = /^bo3_bow_/.test(session.weapon?.id ?? '') && e.count === 25;
    if (upBow && kino.gobblegums?.live?.('in_plain_sight')) skulls.forEach((s, k) => { if (s.o?.visible && p.distanceTo(s.o.position.clone().applyMatrix4(s.o.parent.matrixWorld)) < 70) shootSkull(k); });
    claws.forEach((c, k) => { if (c.stage === 2 || !c.o) return; if (p.distanceTo(c.p) < 60) sync.act('clawShot', { k }); });
  });
  const shootSkull = k => sync.act('skullShot', { k });
  function shootClaw(c) {
    if (c.stage === 0) { c.stage = 1; c.from = c.p.clone(); c.to = c.fell.clone(); c.t = 0; c.dur = .333; c.rearm = true; sfxAt('plunger_hit_00', c.p, camera, .7); }
    else if (c.stage === 1 && !c.from) { c.stage = 2; c.from = c.p.clone(); c.to = c.shot.clone(); c.t = 0; c.dur = 1; c.killed = new Set(); sfxAt('evt_moon_rocket_group', c.p, camera, .4); }
  }
  // ---- the claw hat ---------------------------------------------------------------------------------------------------------------
  let hatModel = null;
  const wearHat = () => sync.act('clawHat');
  sync.on('clawHat', async () => {
    if (st.hat) return; st.hat = true; window.kino.castle && (window.kino.castle.clawHat = true); announce?.('THE CLAW HAT', 'PANZERSOLDAT HITS DO HALF', 3); sfx('clock_complete_00', .7);
    hatModel ??= await loadModel(HAT_URL).catch(() => null); attachHat();
  });
  function attachHat() { const ch = kino.character?.root, head = ch?.getObjectByName('j_head'); if (!hatModel || !head || hatModel.parent === head) return; hatModel.traverse(o => { o.frustumCulled = false; }); head.add(hatModel); }

  host.on('update', dt => {
    if (!dt) return;
    const c = st.clock;
    // the Ragnarok planted at the top of the tower, once the Fire quest has begun
    if (!c.powered && bows?.state().rune.stage !== 'idle') { const at = kino.operator?.handle?.plantedAt; if (at && at.distanceTo(SPOT.towerTop) < 170) powerTower(); }
    if (c.powered && sync.isHost) {   // the host keeps the time
      if (c.running) { c.tick += dt; while (c.tick >= .4) { c.tick -= .4; tickMinute(); } }
      else if ((c.strikeIn -= dt) <= 0) { c.strikeIn = 5 + Math.random() * 10; strike(); }
    }
    if (st.box > 0) { st.box -= dt; if (box) { box.rotation.y += dt * 1.2; box.updateMatrixWorld(true); } }
    // the skulls show (and bob) only while In Plain Sight is chewed
    const ips = !!kino.gobblegums?.live?.('in_plain_sight');
    skulls.forEach((s, k) => { if (!s.o) return; const on = ips && !st.skulls.has(k); if (s.o.visible !== on) s.o.visible = on; if (on) { s.o.position.y = (s.y0 ??= s.o.position.y) + Math.sin(performance.now() / 600 + k) * 16; s.o.updateMatrixWorld(true); } });
    // claws falling / flying
    for (const cl of claws) {
      if (!cl.from || !cl.o) continue; cl.t += dt / cl.dur; const k = Math.min(1, cl.t); cl.p.lerpVectors(cl.from, cl.to, k);
      cl.o.parent.updateMatrixWorld(true); cl.o.position.copy(cl.o.parent.worldToLocal(cl.p.clone())); cl.o.updateMatrixWorld(true);
      if (cl.stage === 2) {
        if (sync.isHost) {   // the host's zombies
          for (const z of enemies.list) if (z.kind === 'panzer' && !cl.killed.has(z) && z.root.position.distanceTo(cl.p) < 128) { cl.killed.add(z); enemies.hurt(z, z.health * 777, false, false, 'explosion'); st.clawKills++; if (st.clawKills >= 3 && !st.hat) wearHat(); }
          for (const z of [...enemies.list]) if (z.kind === 'zombie' && z.root.position.distanceTo(cl.p) < 128) enemies.hurt(z, 1e9, false, false, 'explosion');
        }
      }
      if (k >= 1) { cl.from = null; if (cl.rearm) { cl.rearm = false; armClaw(cl); } if (cl.stage === 2) { cl.o.visible = false; flash(cl.p, 0xff9a3a, 6, 600, .5); sfx('moon_shockwave', .5); } }
    }
    if (st.hat) attachHat();
    for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i]; f.life -= dt; f.s.weight = Math.max(0, f.life / f.max); if (f.life <= 0) { const pool = kino.lighting?.sources, j = pool?.indexOf(f.s) ?? -1; if (j >= 0) pool.splice(j, 1); flashes.splice(i, 1); } }
    for (let i = lines.length - 1; i >= 0; i--) { const l = lines[i]; l.life -= dt; l.l.material.opacity = Math.max(0, l.life / .25); if (l.life <= 0) { l.l.removeFromParent(); l.l.geometry.dispose(); l.l.material.dispose(); lines.splice(i, 1); } }
  });
  host.on('reset', () => {
    Object.assign(st.clock, { powered: false, running: false, h: 1, m: 15, tick: 0, strikeIn: 8, wallrun: false }); showClock();
    st.gram.clear(); st.bears.clear(); st.box = 0; st.skulls.clear(); for (const p of piles) if (p) p.visible = false;
    world.shootTargets = (world.shootTargets ?? []).filter(t => !claws.some(c => t.position === c.p));
    claws.forEach(c => { c.stage = 0; c.from = null; c.p.copy(c.start); armClaw(c); if (c.o) { c.o.visible = true; c.o.parent.updateMatrixWorld(true); c.o.position.copy(c.o.parent.worldToLocal(c.start.clone())); c.o.updateMatrixWorld(true); } });
  });
  return {
    state: () => ({ clock: { ...st.clock, time: timeText() }, gram: st.gram.size, bears: st.bears.size, box: Math.round(st.box), skulls: [...st.skulls], claws: claws.map(c => c.stage), clawKills: st.clawKills, hat: st.hat }),
    get wallrun() { return st.clock.wallrun; }, useWallrun() { st.clock.wallrun = false; },
    power: powerTower, setClock(h, m) { st.clock.h = h; st.clock.m = m; showClock(); }, strike, hat: wearHat, shootClaw: k => shootClaw(claws[k]), claws,
  };
}
