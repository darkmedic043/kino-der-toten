// Gorod Krovi's special enemies and their director (scratch/gk/spec/bosses.md): the Mangler (raz.js), the Valkyrie
// drone (sentinel.js) and Nikolai's siegebot fight (nikolai.js), on the shared kit (boss-common.js).
//   Mixing (§1): solo from round 9 (co-op 6), while more than 10 of the round are still to come, a spawn becomes a
//   special at 2% (3% after round 15, 4% after 20, 5% after 25): a Mangler before round 11 or on a coin toss if under
//   its cap (2/3/4/4) and its spawn delay (2.25/1.75/1.25/0.75 s), otherwise a drone (cap 3/4/5/6).
//   Valkyrie rounds (§3): the first on round 12-15 solo (9-11 co-op), then every 7-9 rounds; 6/9/12/15 drones + (n − 1)
//   × 1/2/3/4, necromancers from the second such round (every other drone), a full ammo where the last one dies.
//   Hellhound rounds are off on this map (BO3 has none here).
//   Pavlov's House (§4): while a player is inside, a Mangler every 180/180/120/90 s from its six points, and drones
//   on the same clock once the dragon has carried players there more than once; both only while over 5 zombies remain.
//   gk.bosses: spawn(kind, opts), razWave(opts) / zombieWave(opts) (the PaP lockdowns and the boss fights), alive(kind),
//   nikolai() starts the fight. Events: boss:spawn (kind, z), boss:death (kind, z), raz:gun (z).
//   Debug: kino.gorod.spawn('mangler'|'raz'|'sentinel'|'necro'|'nikolai'), kino.gorodKrovi.{raz,sentinel,specials,nikolai};
//   URL ?noRaz ?noSentinel ?noSpecials ?bossStart=nikolai.
import { V, makeKit, fromBO, rand } from './boss-common.js';
import { setupRaz } from './raz.js';
import { RAZ_SPOTS, SENTINEL_SPOTS } from './boss-data.js';

const q = new URLSearchParams(location.search);
const PAVLOV_RAZ = [[-4241, 21278, -72], [-3773, 20118, -72], [-1723, 21063, -72], [-1704, 21648, -72], [-2427, 20102, -55], [-4270, 21465, -72]].map(a => fromBO(...a));
const inPavlov = p => p.x > -4700 && p.x < -1300 && p.z > -23300 && p.z < -19700 && p.y > -400 && p.y < 900;
const byPlayers = (t, n) => t[Math.max(0, Math.min(t.length, n) - 1)];

export default async function setup(api, gk) {
  const { session, enemies, host } = api;
  const K = makeKit(api, gk);
  const raz = setupRaz(K);
  // the drone and the mech are their own modules (loaded if present)
  const [sen, nik] = await Promise.all(['sentinel', 'nikolai'].map(n => import(`./${n}.js`).catch(e => { if (!/Failed to fetch|dynamically imported|404/.test(e.message)) console.error('[gorod-krovi] ' + n, e); return null; })));
  const sentinel = sen?.setupSentinel?.(K) ?? null;
  K.raz = raz; K.sentinel = sentinel;
  const nikolai = nik?.setupNikolai?.(K) ?? null;
  await Promise.all([raz.ready(), sentinel?.ready(), nikolai?.ready()]);

  const off = { raz: q.has('noRaz'), sentinel: q.has('noSentinel'), mix: q.has('noSpecials') };
  const kinds = { raz, sentinel };
  K.kind('raz', { mirror: p => raz.mirror(p) });
  if (sentinel) K.kind('sentinel', { mirror: p => sentinel.mirror(p) });

  // ---- damage, kills, drops
  host.on('beforeEnemyDamage', e => { const k = kinds[e.enemy?.kind] ?? (e.enemy?.kind === 'nikolai' || e.enemy?.kind === 'raps' ? nikolai : null); if (e.enemy?.special) k?.damage?.(e); });
  host.on('kill', e => {
    const z = e.enemy; if (!z?.special) return;
    if (z.kind === 'raz' && z.points !== false && !e.remote) session.addPoints(e.head ? 100 : 60);   // twice a zombie's
    if (z.kind === 'sentinel' && z.points !== false && !e.remote) session.addPoints(e.head ? 0 : 40);   // 100 a drone
    z.onDeath?.(e);
    gk.emit('boss:death', z.kind, z);
  });
  const tryDrop0 = session.drops.tryDrop.bind(session.drops);   // drones and the RAPS drop nothing; wave Manglers neither
  session.drops.tryDrop = (s, o = {}) => (o.kind === 'sentinel' || o.kind === 'raps' || o.kind === 'nikolai' || nikolai?.active?.() ? null : tryDrop0(s, o));   // no power-ups during the fight

  // ---- spawning
  const nP = () => K.playerCount();
  const caps = { raz: () => byPlayers([2, 3, 4, 4], nP()), sentinel: () => byPlayers([3, 4, 5, 6], nP()) };
  const delay = { raz: () => byPlayers([2.25, 1.75, 1.25, .75], nP()), sentinel: () => byPlayers([2.25, 1.75, 1.25, .75], nP()) };
  const last = { raz: -1e9, sentinel: -1e9 };
  function spawn(kind, opts = {}) {
    if (kind === 'mangler') kind = 'raz';
    if (kind === 'necro') { kind = 'sentinel'; opts = { ...opts, necro: true }; }
    if (kind === 'nikolai') return nikolai?.start(), null;
    const k = kinds[kind]; if (!k || !K.isHost()) return null;
    const z = k.spawn(opts); if (z) last[kind] = session.time;
    return z;
  }
  const can = kind => !off[kind] && kinds[kind]?.loaded && K.alive(kind).length < caps[kind]() && session.time - last[kind] >= delay[kind]();

  // the Valkyrie rounds and the mix, both through the auto spawner's zombie spawns
  const SR = { next: 0, n: 0, active: false, lastAt: null };
  const firstSR = () => { SR.n = 0; SR.active = false; SR.next = nP() > 1 ? 9 + Math.floor(Math.random() * 3) : 12 + Math.floor(Math.random() * 4); };
  firstSR();
  const noDogs = () => { session.nextDogRound = 1e9; session.dogRound = false; };
  noDogs();
  K.replaceSpawn = (p, b) => {
    if (nikolai?.active?.()) return null;   // the fight runs its own waves
    if (SR.active) { if (!can('sentinel')) return null; const z = spawn('sentinel', { count: 'replace', necro: SR.n >= 2 && (session.total - session.spawned) % 2 === 0 }); return z ?? null; }
    if (off.mix || session.round < (nP() > 1 ? 6 : 9) || session.total - session.spawned <= 10) return undefined;
    const r = session.round, chance = r > 25 ? .05 : r > 20 ? .04 : r > 15 ? .03 : .02;
    if (Math.random() >= chance) return undefined;
    const kind = (r < 11 || Math.random() < .5) && can('raz') ? 'raz' : can('sentinel') ? 'sentinel' : can('raz') ? 'raz' : null;
    if (!kind) return undefined;
    return spawn(kind, { count: 'replace' }) ?? undefined;
  };
  host.on('roundEnd', () => {
    if (!K.isHost()) return;
    noDogs();
    if (SR.active) { SR.active = false; const at = SR.lastAt ?? K.player.getFeetPosition(); api.powerups?.spawn?.('full_ammo', at); }
    if (session.round === SR.next && sentinel?.loaded && !off.sentinel && !nikolai?.active?.()) {
      SR.n++; SR.active = true; SR.lastAt = null; SR.next = session.round + 7 + Math.floor(Math.random() * 3);
      session.total = byPlayers([6, 9, 12, 15], nP()) + (SR.n - 1) * byPlayers([1, 2, 3, 4], nP());
      SR.told = false; gk.emit('sentinel:round', SR.n);
    } else if (session.round >= SR.next && !SR.active) SR.next = session.round + 1;   // postponed (the fight was on)
  });
  gk.on('boss:death', (kind, z) => { if (kind === 'sentinel' && SR.active) SR.lastAt = z.root.position.clone(); });
  host.on('reset', () => { firstSR(); noDogs(); last.raz = last.sentinel = -1e9; pav.t = 0; pav.rides = 0; });

  // ---- Pavlov's House
  const pav = { t: 0, rides: 0, sen: 0, was: false };
  gk.on('dragon:landed', () => { pav.rides++; pav.t = Math.min(pav.t, 5); });
  const razSpots = PAVLOV_RAZ.map(p => ({ p, yaw: 0 }));
  host.on('update', dt => {
    if (SR.active && !SR.told && session.phase === 'fighting') { SR.told = true; api.announce?.('VALKYRIE DRONES', 'ROUND ' + session.round); }   // after the engine's own round title
    if (!K.isHost() || session.phase !== 'fighting' || !dt) return;
    const inside = K.players().filter(p => !p.down && inPavlov(p.pos)).length;
    if (!inside) { pav.was = false; return; }
    if (!pav.was) { pav.was = true; pav.t = 5; pav.sen = 15; }
    if (enemies.list.length + Math.max(0, session.total - session.spawned) <= 5) return;
    const every = byPlayers([180, 180, 120, 90], inside);
    if ((pav.t -= dt) <= 0) { pav.t = every; if (!off.raz && raz.loaded) { const sp = razSpots[Math.floor(Math.random() * razSpots.length)]; spawn('raz', { at: sp.p, yaw: K.yawTo(sp.p, K.nearest(sp.p).pos), count: true }); } }
    if (pav.rides > 1 && sentinel?.loaded && !off.sentinel && (pav.sen -= dt) <= 0) { pav.sen = every; spawn('sentinel', { zone: 'pavlovsb', count: true, buff: true }); }
  });

  // ---- waves (PaP lockdowns, the fights): points = [Vector3 | {p, yaw}], until() ends it early, done when total met
  const waves = new Set();
  function wave(kind, { points = [], total = Infinity, maxAlive = 2, interval = 3, until = null, health = null, onSpawn = null, onDone = null } = {}) {
    const w = { kind, made: 0, list: new Set(), t: 0, stopped: false, stop() { w.stopped = true; waves.delete(w); }, onDone,
      pts: points.map(x => (x.isVector3 ? { p: x, yaw: null } : x)), total, maxAlive, interval, until, health, onSpawn };
    waves.add(w); return w;
  }
  function tickWave(w, dt) {
    for (const z of w.list) if (!enemies.list.includes(z)) w.list.delete(z);
    if (w.until?.() || w.made >= w.total) { if (!w.list.size || w.until?.()) { w.stop(); w.onDone?.(); } return; }
    if ((w.t -= dt) > 0 || w.list.size >= (typeof w.maxAlive === 'function' ? w.maxAlive() : w.maxAlive)) return;
    w.t = w.interval;
    const sp = w.pts.length ? w.pts[Math.floor(Math.random() * w.pts.length)] : null;
    let z = null;
    if (w.kind === 'zombie') {
      const at = sp ? K.ground(sp.p) : null; z = at ? K.spawnZombie(at, null, 'zombie') : null;
      if (z) { session.spawned--; z.tempo = true; if (w.health) z.health = z.maxHealth = Math.max(z.health, w.health); }
    } else z = kinds[w.kind]?.spawn({ at: sp?.p, yaw: sp?.yaw ?? (sp ? K.yawTo(sp.p, K.nearest(sp.p).pos) : null), count: false, points: false, extra: { tempo: true } });
    if (z) { w.made++; w.list.add(z); w.onSpawn?.(z); }
  }
  host.on('update', dt => { if (!dt || !K.isHost()) return; for (const w of [...waves]) tickWave(w, dt); });
  host.on('reset', () => waves.clear());
  const razWave = o => wave('raz', o), zombieWave = o => wave('zombie', o), sentinelWave = o => wave('sentinel', o);
  K.wave = wave;

  // ---- warm-up: every model, clip pose and effect material is drawn while loading (the kit and each module push theirs)
  const api2 = {
    spawn, razWave, zombieWave, sentinelWave, alive: k => K.alive(k === 'mangler' ? 'raz' : k), kit: K,
    nikolai: () => nikolai?.start(), sentinelRound: () => ({ ...SR }),
    round(n) { SR.next = n; return SR.next; },
  };
  gk.bosses = api2;
  window.kino ??= {};
  window.kino.gorod ??= {}; window.kino.gorod.spawn = (k, o) => spawn(k, { count: true, ...o }); window.kino.gorod.bosses = api2;
  const killAll = kind => { for (const z of K.alive(kind)) enemies.hurt(z, 1e9, false, false, 'explosion', false); };
  window.kino.gorodKrovi = {
    raz: { spawn: o => spawn('raz', { count: true, ...o }), kill: () => killAll('raz'), list: () => K.alive('raz') },
    sentinel: { spawn: o => spawn('sentinel', { count: true, ...o }), kill: () => killAll('sentinel'), list: () => K.alive('sentinel'), round: n => api2.round(n) },
    specials: { state: () => ({ round: session.round, sentinelRound: { ...SR }, pavlov: { ...pav }, off }), round: n => api2.round(n) },
    nikolai: nikolai?.debug ?? null,
    kit: K,
  };
  let started = false;   // ?bossStart=nikolai: the fight once the game is on
  if (q.get('bossStart') === 'nikolai') host.on('update', () => { if (!started && session.phase === 'fighting' && nikolai) { started = true; nikolai.start(); } });
}
