// Pavlov's lockdown (zm_stalingrad_pap_quest.gsc function_6236d848, scratch/gk/spec/pap.md §5). As in BO3 the
// Pack-a-Punch in Pavlov's basement is open from the start; the lockdown is a quest step. It runs:
//   the first lockdown (function_2b0bc12): once a player has landed at Pavlov's from a dragon ride (flag
//     dragonpavlovfirsttime) and every player has pressed the Dragon Strike console (strike.js, dragonstrikeunlocked).
//     Its end sets dragonstrikequestcomplete: the console then hands out the Dragon Strike.
//   the upgrade lockdown (strike.js, the Dragon Strike's upgrade, stage 4) and the Easter egg's: start(params).
// One lockdown: normal spawning pauses (the round can't end meanwhile; the lockdown's zombies drop no power-ups), the
// sewer teleporter is shut, a full ammo drops after 2.5 s, then three waves from the east, north and west sides in
// random order: an alarm for 3 s, 3 s more, then that side's risers send z0+p0*n, z1+p1*n, z2+p2*n zombies (22 alive at
// most; the spawn delay starts at the round's and falls 0.1*n a wave, min 0.1) and, alongside every wave, `raz` Manglers
// (raz.alive at once) from that side's Mangler points, first after int(zombies/raz/2) zombies, raz.interval apart
// (falling 0.1*n a wave). A wave ends when all of it is dead; 0.5 s, the side closes, 2.5 s. The final wave comes from
// every side: z2+p2*n*2 zombies, the same `raz` Manglers (first after 3 zombies) and `drones` Valkyrie drones. The end:
// +500, flag lockdowncomplete (cleared at the start), opts.flag set, spawning resumes. A game over or a reset ends it
// as failed. gk events: 'pap:lockdown' ('start', kind | 'wave', i, side | 'end', kind | 'fail', kind). Specials go
// through gk.bosses (bosses.js: razWave / sentinelWave / zombieWave); without it plain zombies only. The shutters,
// gates, hatches and the side lights are not built (brush models, and lights may not be added mid-game): v1. Co-op:
// solo-first (bosses' waves run on the host only). Debug: kino.gorod.pap.{state, start, skip, finish}.
import * as THREE from 'three';
import { makeSfx } from './dragon-sfx.js';

const W = (x, y, z) => new THREE.Vector3(x, z, -y);
const AMMO_AT = W(-2961.5, 21718, 48);   // lockdown_ammo_lower + 48
const RISERS = {
  east: [[-3843.4, 21551.1, -5.5], [-3973.9, 21319.6, 3]],
  north: [[-3434.1, 20649.4, 24.5], [-2962.1, 20395.4, 32.5]],
  west: [[-1971.6, 21873.4, -9], [-2139.1, 21398.4, 6], [-1976.6, 21542.4, 5.5]],
};
const RAZ = {   // lockdown_raz_spawner_<side>
  east: [[-4340.9, 20795.9, -72], [-4342.6, 21490.9, -72]],
  north: [[-3713.1, 20116.4, -72], [-2434.4, 20102.4, -72]],
  west: [[-1700.9, 21666.1, -72], [-1660.1, 22304.6, -72]],
};
// function_6236d848's arguments (n = players): zombies per wave [base, per player], Manglers {total, alive, interval},
// drones (final wave) {total, alive, interval}
export const LOCKDOWNS = {
  first: { waves: [[14, 8], [16, 9], [18, 10]], raz: n => ({ total: 4 + n, alive: n + 1, interval: 1 }), drones: n => ({ total: 2 + n, alive: n + 1, interval: 2 }), flag: 'dragonstrikequestcomplete' },
  upgrade: { waves: [[18, 4], [20, 5], [22, 6]], raz: n => ({ total: 3 + n, alive: n + 1, interval: 3 }), drones: n => ({ total: 2 + n, alive: n + 1, interval: 2 }) },
};
const MAX_ALIVE = 22, ALARM = 3, OPEN_DELAY = 3;

export default async function setupPap(api, gk) {
  const { world, session, enemies } = api, host = api.host;
  if (new URLSearchParams(location.search).has('gkPapOpen')) return;   // no lockdowns at all
  const sfx = makeSfx(api);
  const snap = p => world.closest?.(p, { x: 200, y: 300, z: 200 }) ?? p.clone();
  const pts = l => l.map(a => W(...a));
  const L = { state: 'idle', kind: null, P: null, waves: [], order: [], i: -1, step: null, saved: null, made: 0, delay: 0, razInt: 0, count: 0 };
  const sewer = world.teleporters.find(tp => /sewer/i.test(tp.name ?? ''));
  if (sewer) { const was = Object.getOwnPropertyDescriptor(sewer, 'locked'); let own = !!sewer.locked;
    Object.defineProperty(sewer, 'locked', { get: () => L.state === 'active' || (was?.get ? was.get() : own), set: v => { own = v; }, configurable: true });
    const t0 = sewer.lockedText; Object.defineProperty(sewer, 'lockedText', { get: () => (L.state === 'active' ? "Pavlov's House is in lockdown" : t0), set: () => {}, configurable: true }); }

  const n = () => Math.max(1, Math.min(4, api.sync?.players?.().length || 1));
  const roundDelay = () => Math.max(.1, 2 * .95 ** Math.max(0, (session.round ?? 1) - 1));   // zombie_spawn_delay
  const others = w => enemies.list.length - (w?.list?.size ?? 0);
  // a plain zombie wave for when bosses.js isn't there (its zombieWave does the same: not counted in the round)
  const local = new Set();
  function localWave({ points, total, maxAlive, interval, onSpawn, onDone }) {
    const w = { kind: 'zombie', made: 0, list: new Set(), t: 0, points, total, maxAlive, interval, onSpawn, onDone, stop() { local.delete(w); } };
    local.add(w); return w;
  }
  host.on('update', dt => {
    if (!dt) return;
    for (const w of [...local]) {
      for (const z of w.list) if (!enemies.list.includes(z)) w.list.delete(z);
      if (w.made >= w.total) { if (!w.list.size) { w.stop(); w.onDone?.(); } continue; }
      if ((w.t -= dt) > 0 || w.list.size >= w.maxAlive()) continue;
      w.t = w.interval; const z = enemies.spawn(snap(w.points[Math.floor(Math.random() * w.points.length)]), null, 'zombie');
      if (z) { session.spawned--; z.tempo = true; w.made++; w.list.add(z); w.onSpawn?.(z); }
    }
    // the first lockdown: dragon_pavlov_first_time + dragon_strike_unlocked (function_6236d848's two flags)
    if (L.state === 'idle' && !gk.hasFlag('dragonstrikequestcomplete') && gk.hasFlag('dragonpavlovfirsttime') && gk.hasFlag('dragonstrikeunlocked')
      && (session.phase === 'fighting' || session.phase === 'preparing')) start('first');
    tick(dt);
  });
  gk.on('dragon:landed', at => { if (at === 'pavlovsb') gk.setFlag('dragonpavlovfirsttime'); });   // zm_stalingrad_dragon.gsc: the first landing at Pavlov's
  const rise = z => { if (z.kind === 'zombie' && !z.rise) enemies.riseAt?.(z, z.root.position.clone()); };

  // one wave: zombies, Manglers, (final) drones; next() when every part is dead
  function wave(i, sides) {
    const B = gk.bosses, final = i === 3, nn = n(), P = L.P;
    if (P.razOnly) {   // the main Easter egg's download (ee.js): Manglers only, charging at once; after three waves every side, no cap, until finish()
      const T = P.razOnly(nn), rPts = pts(sides.flatMap(s => RAZ[s])).map(p => snap(p));
      const finished = () => { L.step = { t: 3, then: next }; };
      const w = B?.razWave?.({ points: rPts, total: final ? Infinity : T.total, maxAlive: T.alive, interval: L.razInt, onSpawn: z => { z.berserk = true; }, onDone: finished });
      L.waves = w ? [w] : []; if (!w) L.step = { t: 10, then: next };
      L.razInt = Math.max(.1, L.razInt - .1 * nn);
      gk.emit('pap:lockdown', 'wave', i, final ? 'all' : sides[0]);
      api.toast?.(final ? 'Every side is open' : `The ${sides[0]} side is open`, 3);
      return;
    }
    const zTotal = final ? P.waves[2][0] + P.waves[2][1] * nn * 2 : P.waves[i][0] + P.waves[i][1] * nn;
    const R = P.raz?.(nn), D = final ? P.drones?.(nn) : null;
    const parts = []; let left = 0; const finished = () => { if (--left === 0) L.step = { t: .5 + 2.5, then: next }; };
    const add = (make, o) => { const w = make({ ...o, onDone: finished }); if (w) { left++; parts.push(w); } };
    const zPts = pts(sides.flatMap(s => RISERS[s])).map(snap), rPts = pts(sides.flatMap(s => RAZ[s])).map(p => snap(p));
    let zw = null;
    const zOpts = { points: zPts, total: zTotal, interval: L.delay, onSpawn: rise, maxAlive: () => Math.max(1, MAX_ALIVE - others(zw)), health: null };
    if (B?.zombieWave) add(o => (zw = B.zombieWave(o)), zOpts); else add(o => (zw = localWave(o)), zOpts);
    if (B?.razWave && R?.total > 0) {
      const after = final ? 3 : Math.floor(zTotal / R.total / 2);   // function_b55ebb81's wait: that many zombies first
      add(o => B.razWave(o), { points: rPts, total: R.total, maxAlive: () => ((zw?.made ?? 0) >= after ? R.alive : 0), interval: L.razInt });
    }
    if (D?.total > 0 && B?.sentinelWave) add(o => B.sentinelWave(o), { points: zPts.map(p => p.clone().add(new THREE.Vector3(0, 220, 0))), total: D.total, maxAlive: D.alive, interval: D.interval });
    L.waves = parts; L.made += zTotal;
    if (!final) { L.delay = Math.max(.1, L.delay - .1 * nn); L.razInt = Math.max(.1, L.razInt - .1 * nn); }
    gk.emit('pap:lockdown', 'wave', i, final ? 'all' : sides[0]);
    api.toast?.(final ? 'Every side is open' : `The ${sides[0]} side is open`, 3);
  }
  function next() {
    L.i++;
    if (L.i > 3) return L.P.razOnly ? null : finish();
    const sides = L.i === 3 ? ['east', 'north', 'west'] : [L.order[L.i]];
    // alarm 3 s (every 0.9 s), 3 s more, then the side opens
    let k = 0; const ring = () => { if (L.state !== 'active') return; sfx.sfx('lockdown_alarm', .7); if (++k < 4) setTimeout(ring, 900); }; ring();
    L.step = { t: ALARM + OPEN_DELAY, then: () => wave(L.i, sides) };
  }
  function tick(dt) {
    if (L.state !== 'active') return;
    if (session.phase === 'gameover') return fail();
    if (L.step && (L.step.t -= dt) <= 0) { const f = L.step.then; L.step = null; f(); }
  }
  // kind: 'first' | 'upgrade' | a params object ({waves, raz(n), drones(n), flag})
  function start(kind = 'first', o = {}) {
    if (L.state === 'active') return false;
    const P = typeof kind === 'string' ? LOCKDOWNS[kind] : kind; if (!P) return false;
    L.state = 'active'; L.kind = typeof kind === 'string' ? kind : (o.name ?? 'custom'); L.P = { ...P, ...o };
    L.i = -1; L.made = 0; L.order = ['east', 'north', 'west'].sort(() => Math.random() - .5);
    L.delay = roundDelay(); L.razInt = P.razOnly?.(n())?.delay ?? P.raz?.(n())?.interval ?? 1;
    gk.clearFlag('lockdowncomplete');
    L.saved = { spawn: enemies.autoSpawn, rounds: enemies.autoRounds }; enemies.autoSpawn = false; enemies.autoRounds = false;
    api.announce?.('Lockdown', "HOLD PAVLOV'S HOUSE", 4); sfx.sfx('lockdown_alarm', .8);
    setTimeout(() => { if (L.state === 'active') api.powerups?.spawn?.('full_ammo', AMMO_AT.clone()); }, 2500);
    gk.emit('pap:lockdown', 'start', L.kind);
    next(); return true;
  }
  function stopAll() { for (const w of L.waves) w.stop?.(); L.waves = []; L.step = null; if (L.saved) { enemies.autoSpawn = L.saved.spawn; enemies.autoRounds = L.saved.rounds; L.saved = null; } }
  function finish() {
    if (L.state !== 'active') return;
    stopAll(); L.state = 'idle'; L.count++; gk.setFlag('lockdowncomplete'); if (L.P.flag) gk.setFlag(L.P.flag);
    session.points += 500; api.announce?.('Lockdown complete', "PAVLOV'S HOUSE HELD", 4); sfx.sfx('dragon_alarm', .5);
    gk.emit('pap:lockdown', 'end', L.kind);
  }
  function fail() { if (L.state !== 'active') return; stopAll(); L.state = 'idle'; gk.emit('pap:lockdown', 'fail', L.kind); }
  host.on('reset', () => fail());

  const handle = {
    state: () => ({ state: L.state, kind: L.kind, wave: L.i, order: L.order, step: L.step ? +L.step.t.toFixed(1) : null, delay: +L.delay.toFixed(2), razInterval: +L.razInt.toFixed(2), held: L.count,
      parts: L.waves.map(w => ({ kind: w.kind, made: w.made, total: w.total, alive: w.list?.size })), bosses: !!gk.bosses }),
    start, finish, fail, lockdowns: LOCKDOWNS,
    skip: () => { for (const w of L.waves) { for (const z of [...(w.list ?? [])]) enemies.hurt(z, 1e9, false, false, 'explosion', false); w.made = w.total; } },   // kill the current wave (tests)
  };
  gk.pap = handle; if (window.kino?.gorod) window.kino.gorod.pap = handle;
}
