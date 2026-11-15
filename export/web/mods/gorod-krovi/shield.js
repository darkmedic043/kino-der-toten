// Gorod Krovi's Guard of Fafnir (zm_stalingrad's dragon shield, 2026-11-15; numbers from scratch/gk/spec/shield.md).
// In the hands it is the Rocket Shield's code (mods/operator-weapons/rocket-shield.js, give(alt) with a pluggable special):
// the same H raise, left-mouse bash, front/back blocking, Carpenter repair and HUD card, with its own viewmodels (dmg0/1/2,
// and the _upg set) and vm_dragon_shield_zm_* clips (.tools/build_gk_shield.py, git-ignored: ripped art). Right mouse
// breathes fire instead of the rocket dash: one charge (3, the upgraded 5; +1 a round, a Max Ammo refills them).
//   The breath (function_459dacdd): zombies by distance out to 1200; under 96 any side is flung, under 128 behind is
//   knocked down, otherwise only what is in front, within 180 of the 1200 line and in sight, after 1.1 x d/1200 s (the fire
//   travelling): under 480 flung (killed, thrown), under 900 gibbed and knocked down, to 1200 knocked down (15 damage and
//   a stagger). Kill points: the first as normal, the second 30, the rest 10. The mech and the Mangler take 25% of their
//   health and a stun instead. Emits gk 'shield:breath' {origin, dir, kills} (and 'shield:fafnir10' at 10+ kills).
//   Burns: held, the shield takes fire (the dragon's breath, napalm) for free. Other systems call gk.burn(n) /
//   kino.gorod.burn(n) for fire damage (0 when held, otherwise it hurts) and kino.gorod.shieldHeld().
//   Craft: three parts, one random spot of three each (picked by the host), built at the bunker's table; built, it stays
//   there and everyone takes one from it (again after it breaks). Parts and table are shared in co-op (der-eisendrache/sync.js).
//   Upgrade (per player, solo-first): 50 shield kills, then hit the three runes with a breath (the closest in front within
//   1200), then stand in a full burst of the dragon's fire with the shield up and take no hit (gk 'dragon:fire'
//   {origin, dir, dur?, len?}; burns absorbed through gk.burn during it count too), then use the fountain trigger in the
//   start area: the shield sinks into the fountain, turns, rises (8 s) and comes back upgraded (1.5x health, 5 charges);
//   the table hands that player the upgraded one from then on.
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { binds } from '../../settings.js';
import { createSync } from '../der-eisendrache/sync.js';

const DIR = new URL('../maps/gorod-krovi/shield/', import.meta.url).href;
const SND = new URL('../maps/gorod-krovi/dragon/audio/', import.meta.url).href;   // the dragon agent's breath sound (stand-in: no zmb_dragshield_* yet)
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
const B = { range: 1200, cyl: 180, fling: 480, gib: 900, close: 96, back: 128 };
const CHARGES = 3, CHARGES_UPG = 5, QUEST_KILLS = 50, NAME = 'Guard of Fafnir';
const tough = z => /mech|nikolai|raz|mangler/.test(z.kind ?? '');   // 25% of max health and a stun, not flung

export default async function setup(api, gk) {
  const { host, session, world, scene, viewScene, camera, player, enemies, audio, toast, announce } = api;
  const kino = window.kino ??= {}, rs = () => kino.rocketShield;
  let D;
  try { const r = await fetch(DIR + 'shield.json'); if (!r.ok) throw new Error(r.status); D = await r.json(); }
  catch { console.warn('[gorod-krovi] shield: no assets (python3 -I .tools/build_gk_shield.py)'); return; }
  const sync = api.sync ?? createSync(api);
  const key = () => (binds().shield ?? 'KeyH').replace(/^Key/, '');

  // ---- models: the parts, the table's display, the fountain's two looks, the runes; the viewmodels warmed hidden in the
  // view scene (their first raise is mid-game), the worn looks preloaded
  const P = D.props;
  const [mDolly, mDoor, mClamp, mDisplay, mBath, mBathUpg, ...mRunes] = await Promise.all([P.dolly, P.door, P.clamp, P.world, P.world, P.world_upg, P.rune, P.rune, P.rune].map(u => loadModel(u).catch(() => null)));
  for (const u of [D.shield.model, D.upgraded.model]) loadModel(u).then(v => { if (!v) return; v.visible = false; viewScene?.add(v); }).catch(() => {});
  for (const u of [...D.shield.worn, ...D.upgraded.worn]) loadModel(u).catch(() => {});
  (host.pending ??= []).push?.(Promise.allSettled([D.shield.model, D.upgraded.model].map(loadModel)));
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
  const mine = () => { const a = rs()?.state?.().alt; return a?.fafnir ? a : null; };
  const held = () => { const s = rs()?.state?.(); return !!(s?.raised && s.alt?.fafnir); };
  const makeAlt = upg => ({
    fafnir: true, upg, def: upg ? D.upgraded : D.shield, name: NAME, label: 'GUARD OF FAFNIR', hint: 'Take another at the bunker table',
    charges: upg ? CHARGES_UPG : CHARGES, maxMul: upg ? 1.5 : 1, empty: 'No charges · one returns each round, a Max Ammo refills them',
    get toast() { return `${NAME}${upg ? ' (upgraded)' : ''} · ${key()} to raise, right mouse breathes fire`; },
    special: ({ play }) => breathe(play, upg), plant() {}, broke() { audio?.play?.('explosion', .4); },
  });
  const ALT = makeAlt(false), ALT_UPG = makeAlt(true);
  function take() {
    const s = rs(); if (!s) return false;
    s.give(q.done ? ALT_UPG : ALT);
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
  // a Max Ammo refills the charges (player_watch_max_ammo)
  const pw = api.powerups;
  if (pw?.onCollect) { const collect = pw.onCollect; pw.onCollect = (type, at) => { const r = collect.call(pw, type, at); const a = mine(); if (type === 'full_ammo' && a) rs()?.setCharges?.(a.charges); return r; }; }

  // ---- the breath ---------------------------------------------------------------------------------------------------
  const pend = [], flying = [], burning = [];   // delayed hits, thrown bodies, burning zombies
  let breath = null, breathing = false;
  const fwd = () => camera.getWorldDirection(new THREE.Vector3());
  const chest = z => z.root.position.clone().add(new THREE.Vector3(0, z.kind === 'dog' ? 20 : 40, 0));
  const maxHp = z => kino.equipFx?.maxHp?.(z) ?? z.maxHealth ?? z.health;
  const stun = (z, s) => kino.equipFx?.stun?.(z, s);
  function snd(name, vol = .9) { const a = new Audio(SND + name + '.ogg'); a.volume = Math.max(0, Math.min(1, vol)); a.play().catch(() => audio?.play?.('explosion', .5)); }
  function breathe(play, upg) {
    if (breath) return false;   // one at a time: keeps the charge
    const dir = fwd(), origin = camera.position.clone().addScaledVector(dir, 30).add(new THREE.Vector3(0, -10, 0));
    play('boostInAnim'); snd('breath', .8);
    breath = { t: 0, origin, dir, upg, kills: 0, out: false, end: 0 };
    const list = enemies.list.map(z => ({ z, d: chest(z).distanceTo(origin) })).sort((a, b) => a.d - b.d);
    for (const { z, d } of list) {
      if (d > B.range) break;   // the loop stops at the first one past 1200
      const v = chest(z).sub(origin), dot = v.clone().normalize().dot(dir);
      if (d < B.close) { pend.push({ z, at: 0, kind: 'fling', d }); continue; }
      if (d < B.back && dot < 0) { pend.push({ z, at: 0, kind: 'knock', d }); continue; }
      if (dot < 0) continue;
      const along = Math.max(0, Math.min(B.range, v.dot(dir))); if (v.clone().addScaledVector(dir, -along).length() > B.cyl) continue;
      if (world.lineClear && !world.lineClear(origin, chest(z))) continue;
      const delay = 1.1 * d / B.range; pend.push({ z, at: delay, kind: d < B.fling ? 'fling' : d < B.gib ? 'gib' : 'knock', d });
      breath.end = Math.max(breath.end, delay);
    }
    // the runes (upgrade step 2): the closest ones in front within 1200, while they keep passing
    if (q.kills >= QUEST_KILLS && q.runes < 3) for (const r of runes.filter(r => !r.hit).sort((a, b) => a.p.distanceTo(origin) - b.p.distanceTo(origin))) {
      if (r.p.distanceTo(origin) > B.range || r.p.clone().sub(origin).normalize().dot(dir) < 0) break;
      r.hit = true; if (r.o) r.o.visible = false; q.runes++; audio?.play?.('perk', .5);
      toast?.(q.runes < 3 ? `A rune burns away · ${q.runes}/3` : 'The last rune burns away', 2.5);
    }
    kino.fx?.flash?.(origin.clone().addScaledVector(dir, 200), { color: 0xff7a26, intensity: 9, radius: 900, life: .9 });
    return true;
  }
  function hit(e) {
    const { z } = e; if (!enemies.list.includes(z)) return;
    const b = breath ?? { kills: 0, origin: camera.position.clone(), dir: fwd() };
    const before = z.health; breathing = true;
    try {
      if (tough(z)) { enemies.hurt(z, maxHp(z) * .25, false, false, 'explosion'); stun(z, 2); return; }
      const score = b.kills === 0;   // points: the first kill as normal, then 30, then 10 each
      if (e.kind === 'fling') enemies.hurt(z, z.health + 666, false, false, 'explosion', score);
      else if (e.kind === 'gib') { enemies.hurt(z, Math.max(15, maxHp(z) * .5), false, false, 'explosion', score); stun(z, 1.6); }
      else { enemies.hurt(z, 15, false, false, 'explosion', score); stun(z, 1); }
      const dead = !enemies.list.includes(z);
      if (dead) { if (b.kills === 1) session.addPoints?.(30); else if (b.kills > 1) session.addPoints?.(10); b.kills++; }
      if (dead && (e.kind === 'fling' || e.kind === 'gib')) fling(z, b, e.d);
      if (!dead || e.kind !== 'fling') burning.push({ z, until: session.time + 2.5, next: 0 });
    } finally { breathing = false; void before; }
  }
  function fling(z, b, d) {
    const away = z.root.position.clone().sub(b.origin); away.y = 0; if (away.lengthSq() < 1) away.copy(b.dir).setY(0); away.normalize();
    const mult = Math.max(0, (B.fling ** 2 - d * d) / B.fling ** 2), power = (50 + 50 * mult) / 100;   // 50 + 50 x dist_mult
    z.life = Math.max(z.life ?? 0, 4.5);
    flying.push({ z, v: away.clone().multiplyScalar(650 + 950 * power).setY(320 + 320 * power), axis: new THREE.Vector3(away.z, 0, -away.x), base: z.root.quaternion.clone(), tilt: 0, spin: 2.4 + Math.random() * 2.2, t: 0, burn: 0 });
  }
  const ray = new THREE.Ray(), down = new THREE.Vector3(0, -1, 0), qt = new THREE.Quaternion();
  host.on('update', dt => {
    if (!dt) return;
    const now = session.time;
    if (breath) {
      const b = breath; b.t += dt;
      // the stream: fire sprites along the line, for 0.7 s
      if (b.t < .7 && kino.fx?.emit) for (let i = 0; i < 6; i++) {
        const s = Math.random() * B.range * Math.min(1, b.t / .5 + .15), at = b.origin.clone().addScaledVector(b.dir, s).add(kino.fx.jitter ? kino.fx.jitter(10 + s * .12) : new THREE.Vector3());
        kino.fx.emit({ key: 'fire', at, vel: b.dir.clone().multiplyScalar(500), size: [18 + s * .05, 50 + s * .14], life: .45, fade: [.05, .6], additive: true, opacity: .85, color: b.upg ? 0xff5a8a : undefined });
      }
      if (!b.out && b.t > (D.shield.durations?.boostInAnim ?? .6)) { b.out = true; const s = rs()?.view; if (s?.ready && s.rig.actions.boostOutAnim) { s.mode = 'fire'; s.rig.play('boostOutAnim', false, 1, .04); } }
      if (b.t > Math.max(b.end, .7) + .1 && !pend.some(e => e.b === b)) {
        breath = null; gk.emit('shield:breath', { origin: b.origin, dir: b.dir, kills: b.kills });
        if (b.kills >= 10) gk.emit('shield:fafnir10', { kills: b.kills });   // ZM_STALINGRAD_FAFNIR_KILL
      }
    }
    for (let i = pend.length - 1; i >= 0; i--) { const e = pend[i]; e.b ??= breath; e.at -= dt; if (e.at > 0) continue; pend.splice(i, 1); const keep = breath; breath = e.b ?? keep; try { hit(e); } finally { breath = keep; } }
    for (const f of [...flying]) {   // the thundergun's thrown bodies (thundergun/mod.js)
      const p = f.z.root.position; f.t += dt;
      if (!f.z.root.parent || f.t > 2.5) { flying.splice(flying.indexOf(f), 1); continue; }
      const step = new THREE.Vector3(f.v.x, 0, f.v.z).multiplyScalar(dt), len = step.length();
      if (len > 0) { ray.origin.copy(p).y += 30; ray.direction.copy(step).normalize(); if (world.raycast(ray, 0, len + 14)) { f.v.x *= -.15; f.v.z *= -.15; } else p.add(step); }
      f.v.y -= 1400 * dt; p.y += f.v.y * dt;
      if (f.v.y < 0) { ray.origin.copy(p).y += 40; ray.direction.copy(down); const g = world.raycast(ray, 0, 45); if (g) { p.y = g.position.y; flying.splice(flying.indexOf(f), 1); kino.fx?.knockback?.(p.clone()); } }
      f.tilt = Math.min(1.35, f.tilt + f.spin * dt); f.z.root.quaternion.copy(qt.setFromAxisAngle(f.axis, f.tilt)).multiply(f.base);
      if ((f.burn -= dt) <= 0) { f.burn = .08; kino.fx?.burn?.(p.clone().add(new THREE.Vector3(0, 30, 0))); }
    }
    for (let i = burning.length - 1; i >= 0; i--) { const b = burning[i]; if (now > b.until || !b.z.root.parent) { burning.splice(i, 1); continue; } if (now >= b.next) { b.next = now + .1; kino.fx?.burn?.(chest(b.z)); } }
    bathTick(dt);
  });

  // ---- burns and the bath ---------------------------------------------------------------------------------------------
  // gk.burn(n): fire damage to this player (dragon breath ticks, napalm, fire traps): nothing while the shield is held
  let bathing = null, hurtDuring = false, lastBath = null;
  const burn = n => { if (held()) { if (bathing) bathing.absorbed++; return 0; } api.damage?.(n); return n; };
  gk.burn = burn; gk.shieldHeld = held;
  Object.assign(kino.gorod ??= {}, { burn, shieldHeld: (p = null) => (p == null || p === sync.me || p === player ? held() : false), shield: { state: () => ({ ...st, have: [...st.have], quest: { ...q, runesHit: runes.filter(r => r.hit).map(r => r.name) }, held: held(), breathing: !!breath, bath: bathing ? { t: bathing.t, dur: bathing.dur } : lastBath }), take, give: upg => rs()?.give(upg ? ALT_UPG : ALT), quest: q, runes } });
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
  host.on('kill', e => {
    if (!q.used || q.kills >= QUEST_KILLS || /sentinel/.test(e.enemy?.kind ?? '')) return;
    if (!(breathing || (rs()?.altHitting && mine()))) return;
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
    pend.length = flying.length = burning.length = 0; breath = null; bathing = null;
    Object.assign(q, { kills: 0, runes: 0, bathed: false, done: false, used: false, busy: false });
    for (const r of runes) { r.hit = false; if (r.o) r.o.visible = false; }
    for (const o of [bath, bathUpg, display]) if (o) o.visible = false;
    pick();
  }
  host.on('reset', reset);
  pick();
}
