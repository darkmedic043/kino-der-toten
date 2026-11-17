// Gorod Krovi's ambience (2026-11-15), after Der Eisendrache's ambience.js: the map's placed emitters (.ents), the
// air-raid siren over the city, Pavlov's basement machines, the war outside and the mortar barrages. The table and the
// sounds (maps/gorod-krovi/audio/ambience.json + amb_*.ogg) come from .tools/build_gorod_ambience.py: ripped from the
// zm_stalingrad bank, so git-ignored; without them this module does nothing.
//   loops     one HTML audio per sound, as loud as its nearest emitter (a point, or the nearest point of a line), only
//             the loudest few at a time, paused once silent; a bed loop follows the player (out = open sky, in = under
//             a roof; the battle loop is both the indoor bed and the .ents' small-arms lines)
//   shots     each `random` emitter plays a variant every wait-min..max seconds when the player is in range; bed shots
//             (gusts, thunder, far explosions, drips) by how open the sky is
//   barrages  BO3's zm_stalingrad_ambient: 20-30 s after the start, then 45-60 s after every second round end, 10-15
//             strikes 0.5-1.5 s apart on the `ambient_mortar` points of the area the player is in (the nearest point's
//             area): the incoming whistle, a second later the blast (mortars in Pavlov's and the alley, shells elsewhere)
//             and the fx mod's explosion. Sound and sight only, no damage. None during the Nikolai fight.
// Local to each player, nothing synced. ?noAmbience switches it off; kino.gorod.sounds.state(), .barrage() starts one.
import * as THREE from 'three';
import { settings } from '../../settings.js';

const BASE = new URL('../maps/gorod-krovi/audio/', import.meta.url).href;
const UP = 1.6;   // a floor above or below counts as further away than its height

export default async function setup(api, gk) {
  const { camera, world, session } = api, host = api.host;
  if (new URLSearchParams(location.search).has('noAmbience')) return;
  const data = await fetch(BASE + 'ambience.json').then(r => (r.ok ? r.json() : null)).catch(() => null);
  if (!data?.sounds) { console.info('[gorod-krovi] no ambience (run .tools/build_gorod_ambience.py)'); return; }
  const level = v => (api.audio?.enabled === false ? 0 : Math.max(0, Math.min(1, v * (settings.volume ?? 1))));
  const sfx = (name, vol) => { const a = new Audio(BASE + name + '.ogg'); a.volume = level(vol); a.play().catch(() => {}); return a; };
  const st = { open: .5, played: 0, last: [], barrages: 0, strikes: 0 }, loops = [], shots = [], gapOf = {}, by = {};
  for (const [key, s] of Object.entries(data.sounds)) {
    if (s.loop) { by[key] = { key, s, em: [], a: null, v: 0, want: 0, idle: 0, retry: 0, dead: false }; loops.push(by[key]); }
    else if (s.bed) shots.push({ key, s, bed: true, w: s.wait ?? [20, 50], next: 5 + Math.random() * 20 });
  }
  for (const e of data.emitters ?? []) {
    const s = data.sounds[e.s]; if (!s) continue;
    if (s.loop) by[e.s].em.push(e); else if (s.n && s.range) shots.push({ key: e.s, s, p: e.p, w: e.w ?? [5, 15], next: Math.random() * (e.w?.[1] ?? 15) });
  }
  const MAX = globalThis.matchMedia?.('(pointer: coarse)').matches ? 4 : 7;   // loops heard at once
  const GAP = { gust: 4, groan: 7, thunder: 20, far_boom: 6 };   // seconds between two one-shots of a sound (default 3)
  const ray = new THREE.Ray(), sky = [.5, .5, .5, .5, .5], DIRS = [[0, 1, 0], [.57, .82, 0], [-.57, .82, 0], [0, .82, .57], [0, .82, -.57]]; let ri = 0;
  const open = c => {   // 0 under a roof .. 1 open sky: five rays up from the camera, one a tick
    if (!world?.collision?.rayIntersect) return null;
    ray.origin.copy(c); ray.direction.fromArray(DIRS[ri]); sky[ri] = world.collision.rayIntersect(ray, 0, 5000) ? 0 : 1; ri = (ri + 1) % 5;
    return (sky[0] * 2 + sky[1] + sky[2] + sky[3] + sky[4]) / 6;
  };
  const dist = (c, e) => {
    let x = e.p[0], y = e.p[1], z = e.p[2];
    if (e.q) { const dx = e.q[0] - x, dy = e.q[1] - y, dz = e.q[2] - z, k = Math.max(0, Math.min(1, ((c.x - x) * dx + (c.y - y) * dy + (c.z - z) * dz) / (dx * dx + dy * dy + dz * dz || 1))); x += dx * k; y += dy * k; z += dz * k; }
    return Math.hypot(c.x - x, (c.y - y) * UP, c.z - z);
  };
  const fall = (d, r) => (d >= r ? 0 : (1 - d / r) ** 1.5);
  const bedGain = b => (b === 'out' ? st.open : b === 'in' ? 1 - st.open : .55 + .45 * st.open);
  const play = (key, vol) => { const s = data.sounds[key]; if (!s?.n) return; sfx('amb_' + key + '_' + (Math.random() * s.n | 0), s.vol * vol); st.played++; st.last.push(key); if (st.last.length > 12) st.last.shift(); };
  const playAt = (key, p) => { const s = data.sounds[key]; if (!s) return; const f = fall(dist(camera.position, { p }), s.range); if (f > .02) play(key, f); };

  // ---- barrages
  const M = (data.mortars ?? []).map(m => ({ ...m, v: new THREE.Vector3(...m.p) }));
  const B = { next: 20 + Math.random() * 10, rounds: 0, queue: [], paused: false };
  const barrage = () => {
    if (!M.length || !camera?.position) return false;
    const c = camera.position; let near = M[0], d0 = Infinity;
    for (const m of M) { const d = m.v.distanceToSquared(c); if (d < d0) { d0 = d; near = m; } }
    const pool = M.filter(m => m.a === near.a), n = 10 + (Math.random() * 6 | 0); let t = st.t;
    for (let i = 0; i < n; i++) { t += .5 + Math.random(); B.queue.push({ t, m: pool[Math.random() * pool.length | 0], stage: 0 }); }
    st.barrages++; return near.a;
  };
  const strike = (m, stage) => {
    if (stage === 0) { playAt('incoming', m.p); return; }
    const mortar = m.a === 'pavlovs' || m.a === 'alley';
    playAt(mortar ? 'mortar' : 'shell', m.p); if (m.s > 0) playAt('dirt', m.p); st.strikes++;
    if (camera.position.distanceTo(m.v) < 3500) host.emit('effect', { position: m.v.clone().add(new THREE.Vector3(0, 8, 0)), color: 0xffb34d, count: 12 + m.s * 10, handled: false });
    gk.emit('mortar:strike', m.v, m.s);
  };
  gk.on('nikolai:start', () => { B.paused = true; B.queue.length = 0; });
  gk.on('nikolai:done', () => { B.paused = false; });
  host.on('roundEnd', () => { if (B.rounds > 0 && --B.rounds === 0) B.next = st.t + 45 + Math.random() * 15; });

  let acc = 0; st.t = 0;
  const SIREN = [75, 15], sirenGain = () => Math.max(0, Math.min(1, (SIREN[0] + SIREN[1] - st.t) / SIREN[1]));   // the air-raid siren winds down after the opening (user: "make it so the siren in the back eventually stops"): full for 75 s of play, faded out over 15 s, then silent for the match
  host.on('update', dt => {
    acc += typeof dt === 'number' ? dt : 1 / 60; if (acc < .2 || !camera?.position) return;
    const step = Math.min(acc, 1), c = camera.position; acc = 0; st.t += step;
    const o = open(c); if (o != null) st.open += (o - st.open) * Math.min(1, step * 1.2);
    const live = [];
    for (const L of loops) {
      let g = L.s.bed ? bedGain(L.s.bed) : 0;
      for (const e of L.em) { const f = fall(dist(c, e), L.s.range); if (f > g) g = f; }
      L.want = L.dead ? 0 : g * L.s.vol * (L.key === 'siren' ? sirenGain() : 1); if (L.want > .004) live.push(L);
    }
    live.sort((a, b) => b.want - a.want); for (let i = MAX; i < live.length; i++) live[i].want = 0;
    for (const L of loops) {
      L.v += (L.want - L.v) * Math.min(1, step * 2);
      if (L.want === 0 && L.v < .003) { L.v = 0; if (L.a) { L.a.volume = 0; if (!L.a.paused && (L.idle += step) > 2) L.a.pause(); } continue; }
      L.idle = 0;
      if (!L.a) { L.a = new Audio(BASE + 'amb_' + L.key + '.ogg'); L.a.loop = true; L.a.addEventListener('error', () => { L.dead = true; }); }
      L.a.volume = level(L.v);
      if (L.a.paused && st.t >= L.retry && !document.hidden) { L.retry = st.t + 2; L.a.play().catch(() => {}); }
    }
    for (const k in gapOf) gapOf[k] -= step;
    for (const sh of shots) {
      if (st.t < sh.next) continue;
      sh.next = st.t + sh.w[0] + Math.random() * (sh.w[1] - sh.w[0]);
      if (gapOf[sh.key] > 0) continue;
      const f = sh.bed ? bedGain(sh.s.bed) ** 2 : fall(dist(c, sh), sh.s.range); if (f < .04) continue;
      play(sh.key, f); gapOf[sh.key] = GAP[sh.key] ?? 3;
    }
    // barrages (only while a match runs)
    if (!B.paused && session.phase !== 'gameover' && B.rounds === 0 && st.t >= B.next && !B.queue.length) { barrage(); B.rounds = 2; B.next = Infinity; }
    for (let i = B.queue.length - 1; i >= 0; i--) {
      const q = B.queue[i]; if (st.t < q.t) continue;
      strike(q.m, q.stage); if (q.stage === 0) { q.stage = 1; q.t += 1; } else B.queue.splice(i, 1);
    }
  });
  host.on('reset', () => { B.queue.length = 0; B.rounds = 0; B.paused = false; B.next = st.t + 20 + Math.random() * 10; });
  // a hidden tab is silent; the loops come back on the next update
  document.addEventListener('visibilitychange', () => { if (document.hidden) for (const L of loops) L.a?.pause(); });
  const state = () => ({ open: +st.open.toFixed(2), loops: Object.fromEntries(loops.filter(L => L.a && !L.a.paused).map(L => [L.key, +L.v.toFixed(3)])),
    shots: st.played, last: [...st.last], barrages: st.barrages, strikes: st.strikes, nextBarrage: B.rounds ? `after ${B.rounds} round end(s)` : +(B.next - st.t).toFixed(1) });
  window.kino ??= {}; (window.kino.gorod ??= {}).sounds = { state, barrage: () => { B.queue.length = 0; B.rounds = 2; B.next = Infinity; return barrage(); } };
}
