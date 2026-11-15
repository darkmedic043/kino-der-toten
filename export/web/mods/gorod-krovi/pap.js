// Pavlov's lockdown (zm_stalingrad_pap.gsc function_6236d848, scratch/gk/spec/pap.md §5). Here the Pack-a-Punch in
// Pavlov's basement stays sealed until the house has held out once (BO3 runs the lockdown as the Dragon Strike quest and
// leaves the machine on: ?gkPapOpen gives the stock behaviour). The machine's spot offers "Start the lockdown"; then:
// normal spawning pauses (the round can't end meanwhile), the sewer teleporter is shut, a full ammo drops after 2.5 s,
// and three waves come from the east, north and west sides in random order: an alarm for 3 s, 3 s more, then that
// side's risers send 14+8n, 16+9n, 18+10n zombies (22 alive at most, the spawn delay falling 0.1*n a wave) and 4+n
// Manglers over the three (n+1 alive) from the side's Mangler points; a wave ends when all of it is dead, 3 s pause.
// The final wave comes from every side: 18+20n zombies, 3 Manglers and 2+n Valkyrie drones (n+1 alive). The end:
// +500, the machine opens (flag lockdowncomplete), spawning resumes. Everybody down or a reset = failed, back to sealed.
// gk events: 'pap:lockdown' ('start' | 'wave' (i, side) | 'end' | 'fail'). Specials go through gk.bosses (bosses.js:
// razWave / sentinelWave / zombieWave); without it plain zombies only. The shutters, gates, hatches and the side
// lights are not built (brush models, and lights may not be added mid-game): v1. Co-op: solo-first (bosses' waves run
// on the host only; the lock is per client). Debug: kino.gorod.pap.{state, start, skip, finish}.
import * as THREE from 'three';
import { makeSfx } from './dragon-sfx.js';

const W = (x, y, z) => new THREE.Vector3(x, z, -y);
const PAP_AT = W(-2968, 21787.5, 0.5), AMMO_AT = W(-2961.5, 21718, 48);
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
const WAVES = [[14, 8], [16, 9], [18, 10]], FINAL = [18, 20], MAX_ALIVE = 22, ALARM = 3, OPEN_DELAY = 3, BETWEEN = 3;
const inPavlov = p => p.x > -4700 && p.x < -1300 && p.z > -23300 && p.z < -19700 && p.y > -400 && p.y < 900;

export default async function setupPap(api, gk) {
  const { world, session, enemies, player } = api, host = api.host;
  if (new URLSearchParams(location.search).has('gkPapOpen')) return;
  const sfx = makeSfx(api);
  const snap = p => world.closest?.(p, { x: 200, y: 300, z: 200 }) ?? p.clone();
  const pts = l => l.map(a => W(...a));
  const L = { state: 'sealed', waves: [], order: [], i: -1, timer: 0, step: null, saved: null, made: 0 };
  const done = () => L.state === 'done' || gk.hasFlag('lockdowncomplete');
  Object.defineProperty(world, 'papLocked', { get: () => !done(), set: () => {}, configurable: true });
  Object.defineProperty(world, 'papLockedText', { get: () => (L.state === 'active' ? "Pack-a-Punch is sealed · hold Pavlov's House" : 'Pack-a-Punch is sealed'), set: () => {}, configurable: true });
  const papE = world.interactions.find(e => e.kind === 'pap');
  if (papE) papE.hidden = () => !done();
  const sewer = world.teleporters.find(tp => /sewer/i.test(tp.name ?? ''));
  if (sewer) { const was = Object.getOwnPropertyDescriptor(sewer, 'locked'); let own = !!sewer.locked;
    Object.defineProperty(sewer, 'locked', { get: () => L.state === 'active' || (was?.get ? was.get() : own), set: v => { own = v; }, configurable: true });
    const t0 = sewer.lockedText; Object.defineProperty(sewer, 'lockedText', { get: () => (L.state === 'active' ? "Pavlov's House is in lockdown" : t0), set: () => {}, configurable: true }); }

  const n = () => Math.max(1, Math.min(4, api.sync?.players?.().length || 1));
  const spawnDelay = i => Math.max(.1, 2 * .95 ** Math.max(0, (session.round ?? 1) - 1) - .1 * n() * i);
  const others = w => enemies.list.length - (w?.list?.size ?? 0);
  // a plain zombie wave for when bosses.js isn't there (its zombieWave does the same: not counted in the round)
  const local = new Set();
  function localWave({ points, total, maxAlive, interval, onSpawn, onDone }) {
    const w = { kind: 'zombie', made: 0, list: new Set(), t: 0, total, maxAlive, interval, onSpawn, onDone, stop() { local.delete(w); } };
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
    tick(dt);
  });
  const rise = z => { if (z.kind === 'zombie' && !z.rise) enemies.riseAt?.(z, z.root.position.clone()); };

  // one wave: zombies, Manglers, (final) drones; resolves when every part is dead
  function wave(i, sides) {
    const B = gk.bosses, final = i === 3, nn = n();
    const zTotal = final ? FINAL[0] + FINAL[1] * nn : WAVES[i][0] + WAVES[i][1] * nn;
    const razTotal = final ? 3 : Math.floor((4 + nn) * (i + 1) / 3) - Math.floor((4 + nn) * i / 3);
    const parts = []; let left = 0; const finished = () => { if (--left === 0) L.step = { t: .5 + BETWEEN, then: next }; };
    const add = (make, o) => { const w = make({ ...o, onDone: finished }); if (w) { left++; parts.push(w); } };
    const zPts = pts(sides.flatMap(s => RISERS[s])).map(snap), rPts = pts(sides.flatMap(s => RAZ[s])).map(p => snap(p));
    let zw = null;
    const zOpts = { points: zPts, total: zTotal, interval: spawnDelay(i), onSpawn: rise, maxAlive: () => Math.max(1, MAX_ALIVE - others(zw)), health: null };
    if (B?.zombieWave) { add(o => (zw = B.zombieWave(o)), zOpts); } else add(o => (zw = localWave(o)), zOpts);
    if (B?.razWave && razTotal > 0) add(o => B.razWave(o), { points: rPts, total: razTotal, maxAlive: nn + 1, interval: final ? 4 : 8 });
    if (final && B?.sentinelWave) add(o => B.sentinelWave(o), { points: zPts.map(p => p.clone().add(new THREE.Vector3(0, 220, 0))), total: 2 + nn, maxAlive: nn + 1, interval: 2 });
    L.waves = parts; L.made += zTotal;
    gk.emit('pap:lockdown', 'wave', i, final ? 'all' : sides[0]);
    api.toast?.(final ? 'Every side is open' : `The ${sides[0]} side is open`, 3);
  }
  function next() {
    L.i++;
    if (L.i > 3) return finish();
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
  function start() {
    if (L.state !== 'sealed') return false;
    L.state = 'active'; L.i = -1; L.made = 0; L.order = ['east', 'north', 'west'].sort(() => Math.random() - .5);
    L.saved = { spawn: enemies.autoSpawn, rounds: enemies.autoRounds }; enemies.autoSpawn = false; enemies.autoRounds = false;
    api.announce?.('Lockdown', "HOLD PAVLOV'S HOUSE", 4); sfx.sfx('lockdown_alarm', .8);
    setTimeout(() => { if (L.state === 'active') api.powerups?.spawn?.('full_ammo', AMMO_AT.clone()); }, 2500);
    gk.emit('pap:lockdown', 'start');
    next(); return true;
  }
  function stopAll() { for (const w of L.waves) w.stop?.(); L.waves = []; L.step = null; if (L.saved) { enemies.autoSpawn = L.saved.spawn; enemies.autoRounds = L.saved.rounds; L.saved = null; } }
  function finish() {
    stopAll(); L.state = 'done'; gk.setFlag('lockdowncomplete');
    session.points += 500; api.announce?.('Lockdown complete', 'PACK-A-PUNCH IS OPEN', 4); sfx.sfx('dragon_alarm', .5);
    gk.emit('pap:lockdown', 'end');
  }
  function fail() { if (L.state !== 'active') return; stopAll(); L.state = 'sealed'; gk.emit('pap:lockdown', 'fail'); }
  host.on('reset', () => { fail(); if (!gk.hasFlag('lockdowncomplete')) L.state = 'sealed'; });

  world.addInteraction({
    position: PAP_AT.clone().add(new THREE.Vector3(0, 40, 0)), sight: true,
    hidden: () => done(),
    text: () => (L.state === 'active' ? "Pack-a-Punch is sealed · hold Pavlov's House" : 'Start the lockdown · unseal Pack-a-Punch'),
    use: () => (L.state === 'sealed' && inPavlov(player.getFeetPosition()) ? start() : false),
  });

  const handle = {
    state: () => ({ state: L.state, wave: L.i, order: L.order, step: L.step ? +L.step.t.toFixed(1) : null, parts: L.waves.map(w => ({ kind: w.kind, made: w.made, total: w.total, alive: w.list?.size })), papLocked: world.papLocked, bosses: !!gk.bosses }),
    start, finish, fail,
    skip: () => { for (const w of L.waves) { for (const z of [...(w.list ?? [])]) enemies.hurt(z, 1e9, false, false, 'explosion', false); w.made = w.total; } },   // kill the current wave (tests)
  };
  gk.pap = handle; if (window.kino?.gorod) window.kino.gorod.pap = handle;
}
