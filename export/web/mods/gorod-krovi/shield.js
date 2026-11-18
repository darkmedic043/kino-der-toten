// Gorod Krovi's Guard of Fafnir (zm_stalingrad's dragon shield, 2026-11-15; numbers from scratch/gk/spec/shield.md): the map's
// side of it. The shield in the hands (the Rocket Shield's code with a breath of fire on right mouse, its charges, the Max Ammo
// refill, the viewmodels' warm-up) is mods/operator-weapons/fafnir.js, kino.fafnir, on every map since the Armory sells it
// (2026-11-17). This file keeps the craft, the upgrade quest and the burns. Emits gk 'shield:breath' {origin, dir, kills} (and
// 'shield:fafnir10' at 10+ kills) from fafnir's breathEnd.
//   Burns: held, the shield takes fire (the dragon's breath, napalm) for free. Other systems call gk.burn(n) /
//   kino.gorod.burn(n) for fire damage (0 when held, otherwise it hurts) and kino.gorod.shieldHeld().
//   Craft: three parts, one random spot of three each (picked by the host), built at the bunker's table; built, it stays
//   there and everyone takes one from it (again after it breaks). Parts and table are shared in co-op (der-eisendrache/sync.js).
//   Taking one marks it found for the Armory (then 250 shield kills unlock it on the other maps).
//   Upgrade (per player, solo-first): 50 shield kills, then hit the three runes with a breath (the closest in front within
//   1200), then stand in a full burst of the dragon's fire with the shield up and take no hit (gk 'dragon:fire'
//   {origin, dir, dur?, len?}; burns absorbed through gk.burn during it count too), then use the fountain trigger in the
//   start area: the shield sinks into the fountain, turns, rises (8 s) and comes back upgraded (1.5x health, 5 charges);
//   the table hands that player the upgraded one from then on.
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { createSync } from '../der-eisendrache/sync.js';

const DIR = new URL('../maps/gorod-krovi/shield/', import.meta.url).href;
const C = (x, y, z) => new THREE.Vector3(x, z, -y);   // CoD -> map
const R = Math.PI / 180, codEuler = (p, y, r) => new THREE.Euler(r * R, y * R, -p * R, 'YZX');   // CoD angles (pitch, yaw, roll)
const PARTS = {
  dolly: { label: 'the dragon head', spots: [C(-453, 3398, 184), C(-511, 2764, 40), C(-1169, 3070, 375)] },
  door: { label: 'the dragon pelvis', spots: [C(-189, 2202, 49), C(-359, 3070, -131), C(188, 1658, 205)] },
  clamp: { label: 'the dragon window', spots: [C(1145, 3315, 226), C(1114, 3081, -113), C(166, 3509, 362)] },
};
const TABLE = { p: C(-431.25, 3541.5, -132), yaw: 270 };   // open_craftable_trigger, bunker_zone; display offset (0,-90,0) / (0,0,26)
const RUNES = [{ name: 'judicial', p: C(-960, 6045, 358), a: [0, 90, 0] }, { name: 'factory', p: C(-2599, 3425, 868), a: [356.258, 293.494, -29.7864] }, { name: 'library', p: C(2697.25, 2723, 329.5), a: [0, 270, 0] }];
const QUENCH = C(606, 503, 101), FOUNTAIN = C(675, 501, 125);
const RANGE = 1200, QUEST_KILLS = 50, NAME = 'Guard of Fafnir';

export default async function setup(api, gk) {
  const { host, world, scene, player, audio, toast, announce } = api;
  const kino = window.kino ??= {}, rs = () => kino.rocketShield;
  const F = kino.fafnir, D = await F?.loaded;   // operator-weapons/fafnir.js loads shield.json and warms the viewmodels
  if (!D) { console.warn('[gorod-krovi] shield: no assets (python3 -I .tools/build_gk_shield.py)'); return; }
  const sync = api.sync ?? createSync(api);

  // ---- models: the parts, the table's display, the fountain's two looks, the runes
  const P = D.props;
  const [mDolly, mDoor, mClamp, mDisplay, mBath, mBathUpg, ...mRunes] = await Promise.all([P.dolly, P.door, P.clamp, P.world, P.world, P.world_upg, P.rune, P.rune, P.rune].map(u => loadModel(u).catch(() => null)));
  const moved = o => { o.updateMatrix(); o.updateMatrixWorld(true); };   // static-freeze: a mod's own node updates itself
  const put = (o, p, rot) => { if (!o) return null; o.position.copy(p); if (rot) o.rotation.copy(rot); o.visible = false; o.traverse(m => { m.castShadow = false; }); scene.add(o); moved(o); return o; };
  const partObj = { dolly: put(mDolly, new THREE.Vector3()), door: put(mDoor, new THREE.Vector3()), clamp: put(mClamp, new THREE.Vector3()) };
  // the display stands on the bench: the model's origin 26 above the trigger, turned -90 from it; lifted if the bench top is higher
  const display = put(mDisplay, TABLE.p.clone().add(new THREE.Vector3(0, 26, 0)), new THREE.Euler(0, (TABLE.yaw - 90) * R, 0));
  if (display) { const hit = world.raycast?.(new THREE.Ray(TABLE.p.clone().add(new THREE.Vector3(0, 120, 0)), new THREE.Vector3(0, -1, 0)), 0, 200); const low = display.position.y - 32.5; if (hit && hit.position.y > low && hit.position.y < low + 60) { display.position.y += hit.position.y - low; moved(display); } }
  const bath = put(mBath, FOUNTAIN.clone(), new THREE.Euler(0, 0, 0)), bathUpg = put(mBathUpg, FOUNTAIN.clone(), new THREE.Euler(0, 0, 0));
  const runes = RUNES.map((r, i) => ({ ...r, o: put(mRunes[i], r.p, codEuler(...r.a)), hit: false }));

  // ---- the team's craft (host picks the spots; parts picked up and the build go to everyone) --------------------------
  const st = { spot: {}, have: new Set(), built: false };
  function pick() { if (!sync.isHost) return; const d = {}; for (const k in PARTS) d[k] = Math.floor(Math.random() * 3); sync.act('gkShieldSpots', d); }
  sync.on('gkShieldSpots', d => { st.spot = d; st.have.clear(); st.built = false; for (const [k, o] of Object.entries(partObj)) if (o) { o.position.copy(PARTS[k].spots[d[k]] ?? PARTS[k].spots[0]); o.visible = true; moved(o); } if (display) display.visible = false; });
  sync.on('gkShieldPart', (d, ctx) => { if (st.have.has(d.part)) return; st.have.add(d.part); if (partObj[d.part]) partObj[d.part].visible = false; if (ctx.mine) audio?.play?.('buy', .5); toast?.(`${NAME} part · ${st.have.size}/3`, 2.5); });
  sync.on('gkShieldBuild', (d, ctx) => { if (st.built) return; st.built = true; if (display) display.visible = true; announce?.(NAME.toUpperCase(), 'BUILT', 2.5); if (ctx.mine) audio?.play?.('buy', .7); });

  // ---- the shield in the hands: two alts on the Rocket Shield's code ------------------------------------------------
  const q = { kills: 0, runes: 0, bathed: false, done: false, used: false, busy: false };   // the upgrade quest, this player's
  const { mine, held } = F, ALT = F.makeAlt(false, 'Take another at the bunker table'), ALT_UPG = F.makeAlt(true, 'Take another at the bunker table');
  function take() {
    const s = rs(); if (!s) return false;
    s.give(q.done ? ALT_UPG : ALT); kino.armory?.found('fafnir_shield');
    if (!q.used) { q.used = true; gk.setFlag('dragon_shield_used'); }   // watchfirstuse
    return true;
  }
  world.addInteraction({
    position: TABLE.p.clone().add(new THREE.Vector3(0, 40, 0)),
    hidden: () => st.built && !!mine(),
    text: () => !st.built ? (st.have.size === 3 ? `Build the ${NAME}` : `${NAME} · ${st.have.size}/3 parts`) : `Take the ${q.done ? 'upgraded ' : ''}${NAME}`,
    use() {
      if (!st.built) { if (st.have.size < 3) return false; sync.act('gkShieldBuild'); return true; }
      if (mine() || q.busy) return false; return take();
    },
  });
  // ---- the breath (fafnir.js): the runes (upgrade step 2) burn for the closest ones in front within 1200, while they keep passing
  F.on('breath', ({ origin, dir }) => {
    if (q.kills < QUEST_KILLS || q.runes >= 3) return;
    for (const r of runes.filter(r => !r.hit).sort((a, b) => a.p.distanceTo(origin) - b.p.distanceTo(origin))) {
      if (r.p.distanceTo(origin) > RANGE || r.p.clone().sub(origin).normalize().dot(dir) < 0) break;
      r.hit = true; if (r.o) r.o.visible = false; q.runes++; audio?.play?.('perk', .5);
      toast?.(q.runes < 3 ? `A rune burns away · ${q.runes}/3` : 'The last rune burns away', 2.5);
    }
  });
  F.on('breathEnd', b => { gk.emit('shield:breath', b); if (b.kills >= 10) gk.emit('shield:fafnir10', { kills: b.kills }); });   // ZM_STALINGRAD_FAFNIR_KILL
  host.on('update', dt => { if (dt) bathTick(dt); });

  // ---- burns and the bath ---------------------------------------------------------------------------------------------
  // gk.burn(n): fire damage to this player (dragon breath ticks, napalm, fire traps): nothing while the shield is held
  let bathing = null, hurtDuring = false, lastBath = null;
  const burn = n => { if (held()) { if (bathing) bathing.absorbed++; return 0; } api.damage?.(n); return n; };
  gk.burn = burn; gk.shieldHeld = held;
  Object.assign(kino.gorod ??= {}, { burn, shieldHeld: (p = null) => (p == null || p === sync.me || p === player ? held() : false), shield: { state: () => ({ ...st, have: [...st.have], quest: { ...q, runesHit: runes.filter(r => r.hit).map(r => r.name) }, held: held(), breathing: !!F.breath, bath: bathing ? { t: bathing.t, dur: bathing.dur } : lastBath }), take, give: upg => rs()?.give(upg ? ALT_UPG : ALT), quest: q, runes } });
  host.on('beforeDamage', e => { if (bathing && e.amount > 0) hurtDuring = true; });   // after the shield's own handler: only hits that got through
  gk.on('dragon:fire', d => {
    if (!q.done && q.runes >= 3 && !q.bathed && mine()) { bathing = { t: 0, dur: d?.dur ?? 3, len: d?.len ?? 1500, origin: d?.origin?.clone?.() ?? null, dir: d?.dir?.clone?.()?.normalize() ?? null, inFire: 0, frames: 0, raised: true, absorbed: 0 }; hurtDuring = false; }
  });
  gk.on('dragon:fireEnd', () => { if (bathing) bathing.dur = Math.min(bathing.dur, bathing.t); });
  function bathTick(dt) {
    const b = bathing; if (!b) return;
    b.t += dt; b.frames++; if (!held()) b.raised = false;
    if (b.origin && b.dir) { const v = player.getFeetPosition().add(new THREE.Vector3(0, 40, 0)).sub(b.origin), a = v.dot(b.dir); if (a > 0 && a < b.len && v.addScaledVector(b.dir, -a).length() < 220) b.inFire++; }
    if (b.t < b.dur) return;
    bathing = null;
    const inside = b.absorbed >= 3 || b.inFire >= b.frames * .6;
    lastBath = { raised: b.raised, inside, hurt: hurtDuring, absorbed: b.absorbed, inFire: b.inFire, frames: b.frames };   // for tests (shield.state().bath)
    if (b.raised && inside && !hurtDuring) { q.bathed = true; gk.setFlag('drshup_bathed_in_flame'); audio?.play?.('perk', .6); toast?.('The shield drank the dragon\'s fire', 3); }
  }

  // ---- the quench (step 4): the fountain in the start area ---------------------------------------------------------
  world.addInteraction({
    position: QUENCH.clone().add(new THREE.Vector3(0, 30, 0)),
    hidden: () => !(q.bathed && q.runes >= 3 && !q.done && !q.busy && mine() && !mine().upg),
    text: () => `Quench the ${NAME}`,
    use() {
      if (!(q.bathed && q.runes >= 3 && mine()) || q.busy) return false;
      rs()?.take(); q.busy = { t: 0 }; if (bath) { bath.position.copy(FOUNTAIN); bath.visible = true; moved(bath); } audio?.play?.('perk', .7);
      return true;
    },
  });
  host.on('update', dt => {
    const b = q.busy; if (!b || !dt) return; b.t += dt;
    const y = b.t < 2 ? -150 * b.t / 2 : b.t < 4 ? -150 : Math.max(-150, -150 + 150 * (b.t - 4) / 4);   // sinks 150 in 2 s, waits 2 s, rises in 4 s
    const o = b.t < 2 ? bath : bathUpg;
    if (b.t >= 2 && bath?.visible) { bath.visible = false; if (bathUpg) bathUpg.visible = true; }
    if (o) { o.position.copy(FOUNTAIN).y += Math.min(0, y); o.rotation.y = b.t * .6; moved(o); }
    if (b.t >= 8) { if (bathUpg) bathUpg.visible = false; q.busy = false; q.done = true; gk.setFlag('drshup_quest_done'); rs()?.give(ALT_UPG); announce?.(NAME.toUpperCase(), 'UPGRADED', 2.5); }
  });

  // ---- kills with the shield (step 1) -----------------------------------------------------------------------------
  host.on('kill', e => { if (!e.remote && F.killing) gk.emit('shield:kill', e); });   // challenge 2_2
  host.on('kill', e => {
    if (!q.used || q.kills >= QUEST_KILLS || /sentinel/.test(e.enemy?.kind ?? '')) return;
    if (!F.killing) return;
    if (++q.kills === QUEST_KILLS) { for (const r of runes) if (r.o && !r.hit) r.o.visible = true; gk.setFlag('drshup_step_1_done'); toast?.('Three runes appear across the city', 3); }
  });

  // ---- part interaction positions follow the host's pick ---------------------------------------------------------------
  // (world.addInteraction copies `position` once, so each part has an interaction per spot instead)
  for (const [k, part] of Object.entries(PARTS)) part.spots.forEach((p, i) => world.addInteraction({
    position: p.clone().add(new THREE.Vector3(0, 10, 0)),
    hidden: () => st.have.has(k) || st.spot[k] !== i,
    text: () => `Pick up ${part.label}`,
    use() { if (st.have.has(k) || st.spot[k] !== i) return false; sync.act('gkShieldPart', { part: k }); return true; },
  }));

  function reset() {
    bathing = null;
    Object.assign(q, { kills: 0, runes: 0, bathed: false, done: false, used: false, busy: false });
    for (const r of runes) { r.hit = false; if (r.o) r.o.visible = false; }
    for (const o of [bath, bathUpg, display]) if (o) o.visible = false;
    pick();
  }
  host.on('reset', reset);
  pick();
}
