// Der Eisendrache's side Easter eggs (zm_castle_ee_side.gsc, zm_castle_low_grav.gsc), on BO3's spots:
//   Pressure plates   the four stone plates around the undercroft pyramid (grav_pad_trigger): stand on each for 3 s
//                     (it sinks and lights). With all four down, every time the gravity drops a power-up appears high
//                     in the undercroft (low_grav_powerup_spawn), reachable while it's low.
//   The plunger       once the clock tower has struck 9:35 (side2.js), while the gravity is low, wall-run past the four
//                     undercroft runes (ee_undercroft_wallrun_0-3) eight in a row (two laps), either way round, without
//                     touching the floor: you're pulled into the past lab
//                     for 10 s, where the plunger waits (ee_plunger_pickup). It replaces the knife: 3,000 a hit, and a
//                     kill with it blows up the zombies around (BO3's charged strike).
//   The plant         take the sprout from the pot in the lab (ee_plant_present), plant it in the same pot in the past
//                     (ee_plant_past; time travel or the plunger's trip): back in the present it has grown, holding a
//                     gumball: a free gobblegum from your pack.
//   Disco Inferno     the astroglobe in the trophy room (ee_disco_*): turn its moon arm (use) until it lines up with the
//                     rocket's: 30 s of disco: coloured lights, the globe spinning, the zombies around it dancing.
// Co-op (sync.js): plates, the plant and the disco are the team's (events); the trip through time is the wall-runner's,
// the plunger each player's own, its blast an event the host carries out; the host drops the power-ups and makes
// the zombies dance.
// Testing: kino.castle.side.state(), .plunger() (the trip), .disco().
import * as THREE from 'three';
import { sfx, music, stopMusic } from './castle-audio.js';

const W = (x, y, z) => new THREE.Vector3(x, z, -y);
export const PADS = [W(-1191, 2541, 200), W(-907, 2256, 200), W(-1192, 1972, 200), W(-1476, 2257, 200)];
export const RUNS = [W(-1593, 2240, 480), W(-1193, 1892, 480), W(-845, 2240, 480), W(-1193, 2604, 480)];
export const SPOT = { powerup: W(-1596, 2264, 392), plungerTo: W(-211, 5086, 168), plunger: W(-76, 5118, 217), plungerBack: W(-1535, 2302, 224),
  potPresent: W(-157, 3328, 197), potPast: W(-158, 4826, 196), gumball: W(-163, 3331, 226), globe: W(-856, 3500, 990) };
const PLUNGER_URL = new URL('./plunger/plunger.glb', import.meta.url).href;

export function setupSide(api, { lowgrav, side2 }) {
  const { world, session, host, player, enemies, scene, audio, toast, announce, data, view, powerups, sync } = api;
  const root = world.root, kino = window.kino, feet = () => player.getFeetPosition();
  const node = n => root.getObjectByName(n);
  const show = (n, on = true) => { const o = node(n); if (o) { o.visible = on; o.updateMatrixWorld(true); } return o; };
  const st = { pads: new Set(), padT: [0, 0, 0, 0], lowWas: false, runs: [], trip: null, plunger: false, sprout: 'pot', disco: 0, arm: 1 + Math.floor(Math.random() * 7) };
  const tex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.3)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const glow = (p, color, size) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); m.position.copy(p); m.scale.setScalar(size); scene.add(m); return m; };
  const padGlows = PADS.map(p => { const g = glow(p.clone().add(new THREE.Vector3(0, 4, 0)), 0x9fd8ff, 90); g.visible = false; return g; });
  const runGlows = RUNS.map(p => { const g = glow(p, 0x9fd8ff, 50); g.visible = false; return g; });
  const pool = () => kino.lighting?.sources;
  const lights = [];
  function light(p, color, intensity, radius) { const s = { position: p.clone(), color: new THREE.Color(color), intensity, radius, kind: 'solid', dynamic: true, cap: 2000, weight: 1 }; pool()?.push(s); lights.push(s); return s; }
  function unlight(s) { const P = pool(), j = P?.indexOf(s) ?? -1; if (j >= 0) P.splice(j, 1); lights.splice(lights.indexOf(s), 1); }

  // ---- the plunger: a melee upgrade (the Bowie's swing, the plunger on the knife tag) ----------------------------------
  const bowieModel = data.melee?.bowie?.model;
  function givePlunger() {
    st.plunger = true; if (data.melee?.bowie) data.melee.bowie = { ...data.melee.bowie, model: PLUNGER_URL, damage: 3000 };
    session.bowie = true; if (view) view.currentId = null; api.equipView?.(); show('CASTLE_EE_plunger_0', false);
    announce?.('THE PLUNGER', '', 2.5); audio?.play?.('box');
  }
  // a plunger kill blows up its neighbours (once: their deaths don't chain). The host sees its own kills; a guest spots
  // a killing plunger hit on its copy of the zombie (its hits go to the host, the kill message has no position)
  host.on('kill', ({ enemy, melee }) => { if (st.plunger && melee && enemy?.root && sync.isHost) sync.act('plungerBlast', { p: sync.a(enemy.root.position) }); });
  host.on('beforeEnemyDamage', e => { if (!sync.isHost && st.plunger && e.melee && e.enemy?.root && e.amount >= e.enemy.health) sync.act('plungerBlast', { p: sync.a(e.enemy.root.position) }); });
  sync.on('plungerBlast', (d, ctx) => {
    const p = sync.v(d.p); kino.fx?.burn?.(p.clone().add(new THREE.Vector3(0, 40, 0))); sfx('plunger_hit_0' + Math.floor(ctx.rand() * 4), .8);
    if (sync.isHost) for (const z of [...enemies.list]) if (!z.boss && z.kind !== 'panzer' && z.root.position.distanceTo(p) < 90) sync.hurt(z, 1e9, ctx);
  });
  world.addInteraction({ position: SPOT.plunger.clone(), text: () => 'Take the plunger', use() { givePlunger(); return true; }, hidden: () => !st.trip || st.plunger });
  sync.on('plungerTrip', (d, ctx) => { side2?.useWallrun(); if (ctx.mine) trip(); });   // the clock's charge is spent for everyone
  function trip() {
    st.trip = { t: 10 }; st.runs = []; for (const g of runGlows) g.visible = false;
    if (!st.plunger) show('CASTLE_EE_plunger_0');
    kino.debug.teleportPlayer([SPOT.plungerTo.x, SPOT.plungerTo.y + 2, SPOT.plungerTo.z]); audio?.play?.('dog_round', .5); toast?.('Pulled into the past · 10 s', 2.5);
  }

  // ---- the plant -------------------------------------------------------------------------------------------------------------
  world.addInteraction({ position: SPOT.potPresent.clone(), text: () => st.sprout === 'pot' ? 'Take the sprout' : 'Take the gumball', hidden: () => !(st.sprout === 'pot' || st.sprout === 'grown'),
    use() {
      if (st.sprout === 'pot' || st.sprout === 'grown') { sync.act('plant', { from: st.sprout }); return true; }
      return false;
    } });
  world.addInteraction({ position: SPOT.potPast.clone(), text: () => 'Plant the sprout', hidden: () => st.sprout !== 'held' || st.sproutBy !== sync.me,
    use() { sync.act('plant', { from: 'held' }); return true; } });
  // the sprout is carried by whoever took it; the gumball is the taker's
  sync.on('plant', (d, ctx) => {
    if (d.from !== st.sprout) return;
    if (d.from === 'pot') { st.sprout = 'held'; st.sproutBy = ctx.by; show('CASTLE_EE_plant_sprout_0', false); if (ctx.mine) { toast?.('A sprout · it needs time to grow', 2.5); audio?.play?.('buy', .4); } }
    else if (d.from === 'held') { if (st.sproutBy !== ctx.by) return; st.sprout = 'grown'; show('CASTLE_EE_plant_past_0'); show('CASTLE_EE_plant_grown_0'); show('CASTLE_EE_gumball_0'); if (ctx.mine) { toast?.('Planted, long ago...', 2.5); audio?.play?.('buy', .5); } }
    else if (d.from === 'grown') { st.sprout = 'done'; show('CASTLE_EE_gumball_0', false); if (ctx.mine) { const id = kino.gobblegums?.gift?.(); if (!id) toast?.('A gumball · but no gobblegum pack to draw from', 2.5); audio?.play?.('box'); } }
  });

  // ---- Disco Inferno -----------------------------------------------------------------------------------------------------------
  const arm = node('CASTLE_SM_ee_disco_arm_moon'), moon = node('CASTLE_SM_ee_disco_moon'), moonRocket = node('CASTLE_SM_ee_disco_moon_rocket'), earth = node('CASTLE_SM_ee_disco_earth');
  const STEP = Math.PI / 4;
  function turnArm(k) { for (const o of [arm, moon, moonRocket]) { if (!o) continue; o.userData.restY ??= o.rotation.y; o.rotation.y = o.userData.restY + k * STEP; o.updateMatrixWorld(true); } }
  turnArm(st.arm);
  world.addInteraction({ position: SPOT.globe.clone(), text: () => 'Turn the moon', hidden: () => st.disco > 0,
    use() { sync.act('discoTurn'); return true; } });
  sync.on('discoTurn', () => { if (st.disco > 0) return; st.arm = (st.arm + 1) % 8; turnArm(st.arm); audio?.play?.('buy', .25); if (st.arm === 0) disco(); });
  sync.on('discoArm', d => { st.arm = d.k; turnArm(st.arm); });   // the host's starting angle
  let discoLights = [], dancers = new Map();
  function disco() {
    st.disco = 30; announce?.('DISCO INFERNO', '', 3); music('disco', { vol: .8 });
    const c = SPOT.globe;
    discoLights = [[300, 0], [-300, 0], [0, 300], [0, -300]].map(([x, z], i) => light(c.clone().add(new THREE.Vector3(x, -60, z)), [0xff3a8a, 0x3aff8a, 0x3a8aff, 0xffd23a][i], 4, 700));
  }
  function discoTick(dt) {
    if (st.disco <= 0) return; st.disco -= dt; const t = performance.now() / 1000;
    discoLights.forEach((s, i) => { s.weight = Math.sin(t * 6 + i * 1.6) > 0 ? 1 : .15; s.color.setHSL((t * .3 + i * .25) % 1, 1, .55); });
    if (earth) { earth.rotation.y += dt * 4; earth.updateMatrixWorld(true); }
    for (const z of sync.isHost ? enemies.list : []) {   // the zombies near the globe dance (the host's): they stop and turn on the spot
      if (z.boss || z.kind === 'panzer' || dancers.has(z) || z.root.position.distanceTo(SPOT.globe) > 650) continue;
      const prev = z.ai, at = z.root.position.clone(); dancers.set(z, prev); z.ai = d => { z.root.position.x = at.x; z.root.position.z = at.z; z.root.rotation.y += d * 5; };
    }
    if (st.disco <= 0) { stopMusic(1.5); for (const s of discoLights) unlight(s); discoLights = []; for (const [z, prev] of dancers) z.ai = prev; dancers.clear(); if (sync.isHost) sync.act('discoArm', { k: 1 + Math.floor(Math.random() * 7) }); }
  }

  host.on('update', dt => {
    if (!dt) return;
    const f = feet(), lg = lowgrav?.state() ?? {};
    // pressure plates
    PADS.forEach((p, k) => { if (st.pads.has(k)) return; const on = Math.hypot(f.x - p.x, f.z - p.z) < 50 && Math.abs(f.y - p.y) < 40; st.padT[k] = on ? st.padT[k] + dt : 0;
      if (st.padT[k] > 3 && !st.padAsked?.[k]) { (st.padAsked ??= {})[k] = true; sync.act('platePress', { k }); } });
    if (sync.isHost && st.pads.size === 4 && lg.on && !st.lowWas) { const types = Object.keys(data.powerups ?? {}).filter(t => t !== 'fire_sale' || session.power); powerups?.spawn?.(types[Math.floor(Math.random() * types.length)], SPOT.powerup.clone()); }
    st.lowWas = !!lg.on;
    // the plunger wall-run: the four runes in a row, either way round, airborne the whole time
    if (!st.trip && !st.plunger && lg.on && lg.running && side2?.wallrun) {
      const k = RUNS.findIndex(p => p.distanceTo(f.clone().add(new THREE.Vector3(0, 35, 0))) < 120);
      if (k >= 0 && st.runs.at(-1) !== k) {
        const last = st.runs.at(-1), dir = st.runs.length > 1 ? (st.runs.at(-1) - st.runs.at(-2) + 4) % 4 : null, step = last == null ? null : (k - last + 4) % 4;
        if (last == null || ((step === 1 || step === 3) && (dir == null || step === dir))) { st.runs.push(k); runGlows[k].visible = true; audio?.play?.('buy', .3); if (st.runs.length >= 8) { st.runs = []; sync.act('plungerTrip'); } }
        else { st.runs = [k]; for (const g of runGlows) g.visible = false; runGlows[k].visible = true; }
      }
    }
    if (player.grounded && st.runs.length && !st.trip) { st.runs = []; for (const g of runGlows) g.visible = false; }
    if (st.trip) { st.trip.t -= dt; if (st.trip.t <= 0) { st.trip = null; show('CASTLE_EE_plunger_0', false); kino.debug.teleportPlayer([SPOT.plungerBack.x, SPOT.plungerBack.y + 2, SPOT.plungerBack.z]); toast?.('Back in the present', 2); } }
    discoTick(dt);
  });
  sync.on('platePress', d => { if (st.pads.has(d.k)) return; st.pads.add(d.k); padGlows[d.k].visible = true; audio?.play?.('buy', .4); if (st.pads.size === 4) toast?.('The pyramid hums · watch the undercroft when the gravity drops', 3); });
  if (sync.isHost) sync.act('discoArm', { k: st.arm });
  // the sprout is in its pot from the start
  show('CASTLE_EE_plant_sprout_0');
  host.on('reset', () => {
    st.pads.clear(); st.padT = [0, 0, 0, 0]; st.padAsked = {}; st.runs = []; st.trip = null; st.sprout = 'pot'; st.sproutBy = null; st.disco = 0;
    if (sync.isHost) sync.act('discoArm', { k: 1 + Math.floor(Math.random() * 7) });
    for (const g of [...padGlows, ...runGlows]) g.visible = false;
    for (const s of [...discoLights]) unlight(s); discoLights = []; for (const [z, prev] of dancers) z.ai = prev; dancers.clear();
    for (const n of ['CASTLE_EE_plunger_0', 'CASTLE_EE_plant_past_0', 'CASTLE_EE_plant_grown_0', 'CASTLE_EE_gumball_0']) show(n, false); show('CASTLE_EE_plant_sprout_0');
    if (st.plunger && data.melee?.bowie && bowieModel) { data.melee.bowie = { ...data.melee.bowie, model: bowieModel, damage: 1000 }; if (view) view.currentId = null; }
    st.plunger = false;
  });

  return { state: () => ({ pads: [...st.pads], runs: [...st.runs], trip: st.trip ? +st.trip.t.toFixed(1) : null, plunger: st.plunger, sprout: st.sprout, disco: +st.disco.toFixed(1), arm: st.arm }),
    plunger: trip, disco, givePlunger };
}
