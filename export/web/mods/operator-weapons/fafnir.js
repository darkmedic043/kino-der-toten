// The Guard of Fafnir in the hands: Gorod Krovi's dragon shield (zm_stalingrad, 2026-11-15; numbers from scratch/gk/spec/shield.md),
// on every map since the Armory sells it (user, 2026-11-17: "add the gorod shield to the armory"). It is the Rocket Shield's code
// (rocket-shield.js, give(alt) with a pluggable special): the same H raise, left-mouse bash, front/back blocking, Carpenter repair
// and HUD card, with its own viewmodels (dmg0/1/2 and the _upg set) and vm_dragon_shield_zm_* clips (.tools/build_gk_shield.py,
// git-ignored: ripped art, so without them the Armory won't sell it). Right mouse breathes fire instead of the rocket dash: one
// charge (3, the upgraded 5; +1 a round, a Max Ammo refills them).
//   The breath (function_459dacdd): zombies by distance out to 1200; under 96 any side is flung, under 128 behind is
//   knocked down, otherwise only what is in front, within 180 of the 1200 line and in sight, after 1.1 x d/1200 s (the fire
//   travelling): under 480 flung (killed, thrown), under 900 gibbed and knocked down, to 1200 knocked down (15 damage and
//   a stagger). Kill points: the first as normal, the second 30, the rest 10. The mech and the Mangler take 25% of their
//   health and a stun instead; other maps' bosses take kino.operator.damage's share.
// Gorod Krovi's craft, upgrade quest, runes and burns stay in mods/gorod-krovi/shield.js, which hooks in with on('breath') and
// on('breathEnd'). The assets load on Gorod Krovi, and elsewhere only for a player who has it unlocked in the Armory.
// window.kino.fafnir: {loaded (promise of shield.json or null), ready, makeAlt(upg, hint), give(upg), mine(), held(), on(ev, fn),
//   breathing, killing (a kill landing now is the shield's: its breath or its bash)}
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { binds } from '../../settings.js';
import { TABS, loadArmory, unlocked } from '../armory/mod.js';
import { cloudReady } from '../../profile.js';

const DIR = new URL('../maps/gorod-krovi/shield/', import.meta.url).href;
const SND = new URL('../maps/gorod-krovi/dragon/audio/', import.meta.url).href;   // the dragon agent's breath sound (stand-in: no zmb_dragshield_* yet)
const B = { range: 1200, cyl: 180, fling: 480, gib: 900, close: 96, back: 128 };
const CHARGES = 3, CHARGES_UPG = 5, NAME = 'Guard of Fafnir', ID = 'fafnir_shield';
const tough = z => /mech|nikolai|raz|mangler/.test(z.kind ?? '');   // 25% of max health and a stun, not flung

export function setupFafnir(api) {
  const { host, session, world, camera, enemies, audio } = api;
  const kino = window.kino ??= {}, rs = () => kino.rocketShield;
  const home = api.map?.id === 'gorod-krovi';
  const item = TABS.flatMap(t => t.items).find(i => i.id === ID);
  const want = () => home || !!(item && unlocked(loadArmory().items[ID], item));   // read after the cloud sync
  const hooks = { breath: [], breathEnd: [] };
  const emit = (ev, d) => { for (const fn of hooks[ev]) try { fn(d); } catch (err) { console.warn('[fafnir]', err); } };
  let D = null;
  const key = () => (binds().shield ?? 'KeyH').replace(/^Key/, '');

  // shield.json, then the viewmodels warmed hidden in the view scene (their first raise is mid-game) and the worn looks preloaded
  const loaded = cloudReady.then(() => want() ? fetch(DIR + 'shield.json') : null).then(r => r && (r.ok ? r.json() : Promise.reject(new Error(r.status)))).then(d => {
    if (!d) return null;
    D = d;
    const views = Promise.allSettled([d.shield.model, d.upgraded.model].map(u => loadModel(u).then(v => { if (!v) return; v.visible = false; api.viewScene?.add(v); })));
    for (const u of [...d.shield.worn, ...d.upgraded.worn]) loadModel(u).catch(() => {});
    return views.then(() => d);
  }).catch(() => { if (home) console.warn('[fafnir] no assets (python3 -I .tools/build_gk_shield.py)'); return null; });
  (host.pending ??= []).push?.(loaded);

  const mine = () => { const a = rs()?.state?.().alt; return a?.fafnir ? a : null; };
  const held = () => { const s = rs()?.state?.(); return !!(s?.raised && s.alt?.fafnir); };
  const makeAlt = (upg, hint = 'Buy another at a terminal\'s ARMORY') => ({
    fafnir: true, upg, def: upg ? D.upgraded : D.shield, name: NAME, label: 'GUARD OF FAFNIR', hint,
    charges: upg ? CHARGES_UPG : CHARGES, maxMul: upg ? 1.5 : 1, empty: 'No charges · one returns each round, a Max Ammo refills them',
    get toast() { return `${NAME}${upg ? ' (upgraded)' : ''} · ${key()} to raise, right mouse breathes fire`; },
    special: ({ play }) => breathe(play, upg), plant() {}, broke() { audio?.play?.('explosion', .4); },
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
    emit('breath', { origin, dir, upg, range: B.range });   // Gorod Krovi's runes
    kino.fx?.flash?.(origin.clone().addScaledVector(dir, 200), { color: 0xff7a26, intensity: 9, radius: 900, life: .9 });
    return true;
  }
  function hit(e) {
    const { z } = e; if (!enemies.list.includes(z)) return;
    const b = breath ?? { kills: 0, origin: camera.position.clone(), dir: fwd() };
    breathing = true;
    try {
      if (tough(z)) { enemies.hurt(z, maxHp(z) * .25, false, false, 'explosion'); stun(z, 2); return; }
      if (kino.operator?.isBoss?.(z)) { enemies.hurt(z, kino.operator.damage(z, .25), false, false, 'explosion'); stun(z, 2); return; }   // the Panzersoldat, the Keeper
      const score = b.kills === 0;   // points: the first kill as normal, then 30, then 10 each
      if (e.kind === 'fling') enemies.hurt(z, z.health + 666, false, false, 'explosion', score);
      else if (e.kind === 'gib') { enemies.hurt(z, Math.max(15, maxHp(z) * .5), false, false, 'explosion', score); stun(z, 1.6); }
      else { enemies.hurt(z, 15, false, false, 'explosion', score); stun(z, 1); }
      const dead = !enemies.list.includes(z);
      if (dead) { if (b.kills === 1) session.addPoints?.(30); else if (b.kills > 1) session.addPoints?.(10); b.kills++; }
      if (dead && (e.kind === 'fling' || e.kind === 'gib')) fling(z, b, e.d);
      if (!dead || e.kind !== 'fling') burning.push({ z, until: session.time + 2.5, next: 0 });
    } finally { breathing = false; }
  }
  function fling(z, b, d) {
    const away = z.root.position.clone().sub(b.origin); away.y = 0; if (away.lengthSq() < 1) away.copy(b.dir).setY(0); away.normalize();
    const mult = Math.max(0, (B.fling ** 2 - d * d) / B.fling ** 2), power = (50 + 50 * mult) / 100;   // 50 + 50 x dist_mult
    z.life = Math.max(z.life ?? 0, 4.5);
    flying.push({ z, v: away.clone().multiplyScalar(650 + 950 * power).setY(320 + 320 * power), axis: new THREE.Vector3(away.z, 0, -away.x), base: z.root.quaternion.clone(), tilt: 0, spin: 2.4 + Math.random() * 2.2, t: 0, burn: 0 });
  }
  const ray = new THREE.Ray(), down = new THREE.Vector3(0, -1, 0), qt = new THREE.Quaternion();
  host.on('update', dt => {
    if (!dt || !D) return;
    const now = session.time;
    if (breath) {
      const b = breath; b.t += dt;
      // the stream: fire sprites along the line, for 0.7 s
      if (b.t < .7 && kino.fx?.emit) for (let i = 0; i < 6; i++) {
        const s = Math.random() * B.range * Math.min(1, b.t / .5 + .15), at = b.origin.clone().addScaledVector(b.dir, s).add(kino.fx.jitter ? kino.fx.jitter(10 + s * .12) : new THREE.Vector3());
        kino.fx.emit({ key: 'fire', at, vel: b.dir.clone().multiplyScalar(500), size: [18 + s * .05, 50 + s * .14], life: .45, fade: [.05, .6], additive: true, opacity: .85, color: b.upg ? 0xff5a8a : undefined });
      }
      if (!b.out && b.t > (D.shield.durations?.boostInAnim ?? .6)) { b.out = true; const s = rs()?.view; if (s?.ready && s.rig.actions.boostOutAnim) { s.mode = 'fire'; s.rig.play('boostOutAnim', false, 1, .04); } }
      if (b.t > Math.max(b.end, .7) + .1 && !pend.some(e => e.b === b)) { breath = null; emit('breathEnd', { origin: b.origin, dir: b.dir, kills: b.kills }); }
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
  });
  host.on('reset', () => { pend.length = flying.length = burning.length = 0; breath = null; });

  return {
    loaded, makeAlt, mine, held,
    get ready() { return !!D; },
    give(upg = false) { if (!D) { api.toast?.('The shield model is missing', 2); return false; } rs()?.give(makeAlt(upg)); return true; },
    on(ev, fn) { hooks[ev]?.push(fn); },
    get breathing() { return breathing; }, get breath() { return breath; },
    get killing() { return breathing || !!(rs()?.altHitting && mine()); },
  };
}
